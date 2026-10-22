# Arquitectura Meta multi-negocio (Atlas como operador de publicidad)

Estado: **propuesta para ejecutar por fases**. Fecha: 2026-10-21.
Alcance: Facebook e Instagram (Marketing API, páginas, mensajería de anuncios). WhatsApp queda fuera de este documento.

## 1. Situación actual (medida en el código)

- `lib/tenant-facebook-credentials.ts`: credenciales por negocio. El `.env` (`FB_*`) solo vale para el negocio dueño del servidor (`respaldoEnvFacebook`). Correcto.
- `lib/meta-cuentas-publicitarias.ts`: listado y validación de cuentas publicitarias al conectar.
- `lib/facebook.ts`: cliente de Graph API. Cada operación hace `fetch` directo, en la petición del usuario o del agente. **No hay cola, ni límite de llamadas por cuenta, ni reintentos con espera.**
- `lib/marketing-team/agents/meta-ads-manager.ts` y `budget-manager.ts`: agentes que operan sobre Meta sin una capa de trabajos entre ellos y la API.
- Versión de API fija en `lib/meta-api-version.ts` (`v23.0`). Bien: centralizada.
- No existe cola de trabajos (ni pg-boss ni BullMQ) en `artifacts/api-server`.
- Métricas: se consultan en vivo a Meta, no se guardan en tablas propias.

**Problema para escalar:** con 100 negocios, un pico de consultas de Atlas o de un panel puede agotar la cuota de una cuenta, y no hay forma de repartirla ni de reintentar de forma ordenada.

## 2. Principios

1. **Aislamiento por `tenant_id`** en cada tabla, cada consulta, cada trabajo y cada token. Un negocio nunca lee ni escribe datos de otro. Se prueba con tests.
2. **La petición del usuario nunca llama a Meta de forma directa para lecturas pesadas.** Lee de tablas propias; los trabajos actualizan esas tablas.
3. **Límites por cuenta publicitaria**, no globales. Cada cuenta tiene su propia concurrencia.
4. **Atlas propone, el código decide.** Límites de presupuesto, aprobaciones y `dry-run` se aplican en código, no en el prompt.
5. **Toda acción sobre dinero queda registrada** (quién, qué, cuándo, resultado).

## 3. Componentes

```
Panel / Atlas ──► API (stateless, N réplicas)
                    │  lee de tablas propias, encola trabajos
                    ▼
                 Cola (Postgres/pg-boss → Redis/BullMQ)
                    │  una cola lógica por cuenta publicitaria
                    ▼
                 Workers (N réplicas)
                    │  Graph API vía cliente con límite por cuenta
                    ▼
                 Meta Graph API

Meta webhooks ──► endpoint de ingesta (verifica firma, encola, responde rápido)
Scheduler ──────► encola trabajos periódicos con jitter por negocio
```

### 3.1 Credenciales
- Tokens por negocio en `credentials-vault` (AES-256-GCM, ya existe). Clave fija en `CREDENTIALS_ENCRYPTION_KEY`.
- Tabla `meta_conexiones(tenant_id, business_id, ad_account_id, page_id, ig_id, token_cifrado, expira_en, estado)`.
- Estado `requiere_reconexion` cuando Meta devuelve token inválido (código 190) o permisos retirados. Se muestra al negocio, no falla en silencio.

### 3.2 Métricas propias
- `meta_insights_diarios(tenant_id, ad_account_id, campaign_id, adset_id, ad_id, fecha, gasto, impresiones, clics, conversiones, ...)`, índice por `(tenant_id, fecha)`.
- Trabajo nocturno completo y trabajo horario de la última ventana.
- El panel y Atlas leen de esta tabla. Solo las acciones en vivo (pausar, cambiar presupuesto) van directo a Meta, por la cola.

### 3.3 Cola y límites
- Trabajo = `{ tenant_id, ad_account_id, tipo, payload, idempotency_key, intentos }`.
- Concurrencia por cuenta: 1 por defecto (ajustable). Límite global de workers por región.
- Reintentos con espera exponencial ante errores de límite de uso de Meta; registro del código de error y de la cabecera de uso.
- Idempotencia: `idempotency_key` evita crear dos veces un anuncio si un reintento llega tarde.

### 3.4 Webhooks
- Endpoint que valida `X-Hub-Signature-256` con el secreto de la app, guarda el evento crudo y encola. Responde 200 en menos de 1 s.
- Eventos: leads (`leadgen`), mensajes de la página/Instagram, cambios de estado de anuncios.

### 3.5 Atlas (operador)
- Tres niveles: **diagnosticar** (solo lectura), **proponer** (plan con cambios concretos, se guarda), **ejecutar** (solo si el plan está aprobado o dentro de límites pre-aprobados).
- Límites en código: presupuesto máximo diario por cuenta y por anuncio; nada se activa sin aprobación explícita; cambios masivos exigen `dry-run` previo.
- Bitácora `acciones_meta(tenant_id, accion, antes, despues, aprobado_por, resultado, creado_en)`.

### 3.6 Creativos
- Imágenes y videos generados se guardan en almacenamiento de objetos (S3 o R2) con URL pública firmada. Nunca en el disco del contenedor.

## 4. Modelo de datos (mínimo para fase 1)

| Tabla | Propósito | Clave |
|---|---|---|
| `meta_conexiones` | token cifrado y cuentas por negocio | `tenant_id` |
| `meta_trabajos` | cola durable | `tenant_id`, `ad_account_id`, `estado` |
| `meta_insights_diarios` | métricas propias | `(tenant_id, fecha)` |
| `meta_acciones` | bitácora de cambios | `(tenant_id, creado_en)` |
| `meta_webhook_eventos` | eventos crudos | `(tenant_id, recibido_en)` |

## 5. Hoja de ruta

### Fase 0 — Preparación (1-2 días)
- Test de aislamiento: un negocio no puede leer `meta_conexiones` ni `meta_insights_diarios` de otro (consulta con dos tenants, esperado: vacío).
- Inventario de todas las llamadas a `FB_GRAPH_BASE` en el repo, para migrarlas a la cola.

### Fase 1 — Cimientos (1-2 semanas)
- Cola en Postgres (pg-boss) con trabajos por `ad_account_id`.
- Cliente Graph con límites, reintentos y registro de cabeceras de uso.
- Tablas `meta_conexiones`, `meta_trabajos`, `meta_acciones`.
- Migrar una lectura (métricas) a la cola como primera prueba.

### Fase 2 — Métricas y panel (1-2 semanas)
- `meta_insights_diarios` con trabajo nocturno y horario.
- Panel y Atlas leen de tablas propias.
- Monitoreo por negocio: trabajos atrasados, errores por código, consumo de cuota.

### Fase 3 — Operación con aprobación (1-2 semanas)
- Atlas diagnostica y propone; ejecución solo con aprobación.
- Límites de presupuesto en código y bitácora completa.
- Webhooks de leads y mensajes con verificación de firma.

### Fase 4 — Producto para vender (en paralelo, lo que depende de Meta)
- **App Review de Meta y verificación del negocio.** Es el camino crítico y tarda semanas. Confirmar en la documentación de Meta los permisos vigentes antes de enviar.
- Política de privacidad, términos y callback de eliminación de datos.
- Onboarding: el negocio conecta su cuenta con OAuth y elige cuenta publicitaria.

### Fase 5 — Escala (cuando haya más de ~100 negocios)
- Redis (BullMQ) para cola y límites distribuidos.
- Réplica de lectura para paneles.
- Particionar `meta_insights_diarios` por mes.
- Separar el servicio de sincronización del de Atlas.

## 6. Criterios de salida por fase
- **Fase 0:** test de aislamiento en verde en CI.
- **Fase 1:** un trabajo de lectura pasa por la cola con dos cuentas en paralelo sin mezclar resultados, y sobrevive a un reinicio del proceso.
- **Fase 2:** el panel carga sin llamadas en vivo a Meta.
- **Fase 3:** ningún cambio de presupuesto ocurre sin aprobación registrada.

## 7. Riesgos abiertos
- Aprobación de Meta: fecha no controlable.
- Intereses de Meta: hoy solo resuelven la categoría "Salud y bienestar" (abierto en memoria). Corregir antes de ofrecer a otros nichos.
- Árbol de trabajo con muchos cambios sin commitear de otras sesiones: la implementación debe hacerse en una rama o worktree propio.

## 8. Estado de implementación (rama `meta-multitenant`, worktree propio)

Hecho y probado (27 pruebas en verde, SQL real de Postgres vía PGlite):
- `artifacts/api-server/src/lib/meta/cola.ts`: cola durable en Postgres. Concurrencia 1 por cuenta con `FOR UPDATE SKIP LOCKED`, idempotencia por negocio, reintentos con espera creciente, arriendos vencidos, listado filtrado por negocio.
- `meta/graph.ts`: cliente de Graph con clasificación de errores (token, límite de uso, transitorio, permanente) y lectura de cuotas de las cabeceras `x-app-usage` / `x-business-use-case-usage`.
- `meta/worker.ts`: bucle del worker, manejadores por tipo, aviso al negocio cuando el token falla.
- `meta/sql-pool.ts`: adaptador del `pool` de producción.
- `meta/arranque-worker.ts`: punto de entrada del servicio worker para EasyPanel (`META_ROLE=worker`, sin puertos HTTP).

Pendiente (no hecho aquí):
- Migrar las llamadas directas de `lib/facebook.ts` y de los agentes de Meta a la cola.
- Tabla `meta_insights_diarios` y el trabajo nocturno.
- Pruebas de carga con cuentas reales y de Meta; revisión de la app por Meta.
- Verificar en la documentación vigente de Meta la lista de códigos de error usada en `graph.ts`.

## 9. Actualización: métricas propias y worker (rama `meta-multitenant`)

Hecho y probado (39 pruebas en verde):
- `meta/metricas.ts`: tabla `meta_insights_diarios` (negocio, cuenta, campaña, día; upsert). Descarga paginada de Graph con tope de 50 páginas. Lectura de resumen siempre filtrada por negocio. Mapeo de resultados igual que `facebook.ts`.
- Trabajo `sincronizar_insights`, con token por negocio tomado de `credenciales` (vía `conexion.ts`).
- Programador diario idempotente: una clave `insights:<cuenta>:<fecha>` por cuenta y día, con demora fija dentro de una ventana de 6 h para no pegar todos a la vez.
- `cola.encolar` acepta `demoraMs`.

### Runbook EasyPanel (no ejecutado aún)
1. Mergear la rama a `para-subir` (EasyPanel despliega esa rama; el deploy se dispara una sola vez).
2. Crear el servicio `bot-agenwhatsapp-meta-worker` con la misma imagen, variables del servicio principal más `META_ROLE=worker`, y comando `node dist/meta-worker.mjs` (el build de `artifacts/api-server/build.mjs` lo genera junto al servidor). Sin dominio ni puerto público. Sin `DATABASE_URL` el proceso sale con código 1 y un mensaje claro.
   - Nota: en la máquina de desarrollo Windows, esbuild no puede escribir en `dist/` ("Access is denied"); el worker se escribe en memoria y se guarda con `fs`. El build de Linux de EasyPanel no tiene ese problema.
   - Activar lecturas de reportes desde la tabla: `META_HISTORICO_DESDE_TABLA=true` en el servicio de la API (apagado por defecto).
3. Verificar en logs: `meta-worker listo`, luego `insights programados`.
4. El worker corre las migraciones de `meta_trabajos`, `meta_cuentas_cola` y `meta_insights_diarios` al arrancar.

### Pendiente antes de competir
- Migrar `lib/facebook.ts` (`getCampaignInsights`, `getCampaignMetrics`) para leer de `meta_insights_diarios` en vez de llamar a Meta.
- Migrar las 73 llamadas directas restantes a la cola, por tandas.
- Alertas por negocio cuando un token caiga (`requiere_reconexion`).
- Pruebas de carga reales con cuentas de prueba de Meta.

### Actualización de cierre (estado de conexión y códigos)
- Estado de conexión por negocio (meta/estado-conexion.ts): token inválido → requiere_reconexion con código y mensaje; un trabajo exitoso lo devuelve a ok. El panel lo lee de meta_estado_conexion. 5 pruebas nuevas (48 en total en verde).
- Códigos 4, 17, 32 y 613 confirmados como límites de uso en la documentación de Meta (developers.facebook.com, Rate Limits). Los códigos de la familia 80000 no tienen una tabla oficial clara en las fuentes consultadas; el código los trata como límites de uso (reintentables), que es la categoría correcta. Pendiente: confirmar en la documentación BUC.
- Pendiente real: migrar las escrituras (crear, pausar, cambiar presupuesto) a la cola. Cambia respuestas síncronas de la interfaz y requiere pruebas por flujo; no se hizo a ciegas.

### Actualización: exclusión de escrituras por cuenta
- meta/bloqueo-cuenta.ts: bloqueo consultivo de Postgres por (negocio, cuenta). Una escritura a la vez por cuenta en todas las instancias. Mientras espera no retiene conexión del pool. Si no puede desbloquear, destruye la conexión para que Postgres libere el bloqueo. Espera máxima 25 s, luego error "cuenta ocupada".
- meta/escritura-global.ts: wrapper de fetch que aplica el bloqueo a todo POST/DELETE/PUT/PATCH contra act_… en graph.facebook.com. Se instala al arrancar la API (index.ts). Apagable con META_EXCLUSION_CUENTA=false.
- FacebookService.fbPost: bloqueo adicional por negocio y cuenta. Mismo orden de bloqueos (negocio primero, global después), sin ciclos.
- Usos de cuota alta (>=80 %) se registran en el log desde fbPostUnaVez.
- Pruebas: 61 en verde. El pool simulado valida la lógica de exclusión; el comportamiento entre conexiones reales de Postgres falta confirmarlo en una base de prueba.
- Limitación: escrituras a objetos sueltos (campañas, conjuntos y anuncios por id, fuera de FacebookService) no se serializan por cuenta, porque el id del objeto no revela la cuenta sin una consulta extra.
