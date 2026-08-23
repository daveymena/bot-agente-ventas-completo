# ESTADO DEL MOTOR DE VENTAS — Auditoría para SalesBot V2

Fecha: 2026-08-23. Fase 1 del plan V2: **auditar antes de tocar**.

Todo lo que dice "verificado" acá se comprobó leyendo el código o midiendo
producción, no asumiendo. Lo que no se pudo verificar está marcado como tal.

---

## 0. El dato que enmarca todo

Panel de producción, 10 conversaciones reales:

| Métrica | Valor |
|---|---|
| Conversaciones | 10 |
| En etapa de cierre | **0** |
| Tratos ganados | **0** |
| Conversión | **0,0 %** |

Etapas reales: `warm`, `discovery` ×4, `presentation` ×4, `details`.
Ninguna llegó a `closing`.

El problema no es que el bot cierre mal. **Es que nunca intenta cerrar.**

---

## 1. LAS CINCO CAPAS: qué existe hoy

| Capa | Estado | Evidencia |
|---|---|---|
| 1 — Comprensión | ⚠️ Parcial | `detectIntent()` es keywords (`GREETING_PATTERNS`, `PAYMENT_PATTERNS`, `OBJECTION_PATTERNS`… 8 listas en `conversation-engine.ts:141+`). El modelo recibe contexto, pero **la intención que enruta el turno la deciden las listas** |
| 2 — Memoria comercial | ❌ No existe el perfil | Se guarda la conversación (`messages`) y hay `leads`, pero **no hay `customerProfile`** persistente. El único `customerProfile` del repo vive en `hermes-ultra-prompt.ts`, que **nadie importa** |
| 3 — Estado comercial | ✅ Existe | `LeadStage` en `leadScoring.ts:49`: cold, warm, hot, qualified, negotiating, closing, converted, lost. Con scoring dinámico |
| 4 — Next Best Action | ❌ **No existe** | Cero coincidencias de `nextBestAction` / `siguienteAccion` en todo `src` |
| 5 — Ejecución por herramientas | ❌ **No existe** | Cero `tool_calls` / `function_call` en `src/lib`. El agente de ventas es **prompt puro**: no consulta stock ni pedidos, los "sabe" por el contexto que se le inyecta |

> `mcp-bridge.ts` y `architect-tools.ts` sí son herramientas, pero son de
> Atlas/Operator (el agente de marketing), **no** del agente de ventas.

---

## 2. LO QUE YA EXISTE Y FUNCIONA — no rehacerlo

Reutilizar, que es lo que pide el spec:

- **Atribución completa**: `marketing-team/attribution.ts` cruza `leads.adContext`
  con `payments`. La columna `ad_context JSONB` ya existe y `message-handler.ts`
  la copia al lead. Anuncio → lead → venta **ya se puede medir**.
- **Objeciones**: `objectionHandler.ts`, 11 tipos y 8 estrategias, conectado al
  turno vía `sales-playbook.ts`.
- **Manual de venta por turno**: `sales-playbook.ts` decide la jugada
  (cierre / aislar objeción / descubrimiento / postventa) y prohíbe inventar.
- **Detector de invenciones**: `detectarInventos()` / `quitarInventos()` valida
  la SALIDA, no solo el prompt.
- **Contexto de negocio multi-tenant**: `business-context.ts` (20 KB).
- **Fallback de proveedores**: `fallbackSystem.ts` (12 KB) + clasificación de
  fallos por forma del mensaje con cooldowns por tipo.
- **Contraentrega**: tabla `dropshipping_orders` + `CAMPOS_DE_ENVIO` +
  `abrirPedido/guardarDatos/despacharPedido` → WooCommerce con `payment_method: cod`.
- **Anti-bloqueo de WhatsApp**: espaciado 8–20 s al cambiar de destinatario,
  60 msg/h, 400/día, corte de circuito a 5 fallos → pausa 30 min.
- **Follow-up con candados**: uno por conversación y por pasada; no escribe a
  quien mandó menos de 2 mensajes.

---

## 3. LO QUE ESTÁ ROTO — verificado

### 3.1 La contradicción de la pregunta — VIVA
`conversation-engine.ts:1581` sigue diciendo:

> *"NUNCA termines con preguntas como «¿qué tipo buscas?» o «¿te interesa alguno?»"*

Mientras `sales-playbook.ts` manda hacer **una** pregunta estratégica para aislar
la objeción. El modelo recibe las dos órdenes en el mismo prompt.
`conversation-engine.ts:1796` documenta que la regla se quitó *de ahí*, pero
quedó viva en la línea 1581.

### 3.2 ~100 KB de código muerto que parece vivo
Nadie los importa. Verificado uno por uno:

| Archivo | Importado por |
|---|---|
| `hermes-ultra-prompt.ts` | **0** |
| `hermes-master-prompt.ts` | **0** |
| `sales-ai.ts` | **0** |
| `conversation-flow.ts` | **0** |
| `conversation-metrics.ts` | **0** |

⚠️ Es una trampa activa: `hermes-ultra-prompt.ts` define el `customerProfile`
con señales de compra y objeciones. Cualquiera que lo lea va a creer que el
perfil comercial existe. **No corre.**

### 3.3 Arreglado hoy, **sin desplegar** (commits `fb17d6d`, `42bbdd9`)
- `"¿cómo pago?"` no disparaba el cierre: caía en la jugada genérica y recibía
  la orden *"NO empujes el pago en el mismo mensaje"*.
- `fichaEnviada` y `productoEnFoco` llegaban al playbook y **no se leían**: por
  eso el bot mostraba la ficha y se quedaba esperando.
- `"después"` como subcadena marcaba como evasiva a quien coordinaba la entrega.
- La métrica de tiempo de respuesta del panel **nunca midió** (comparaba rol
  `"assistant"` contra el `"agent"` que se guarda) — ocultó una primera
  respuesta de **85 minutos** que costó esa venta.
- Follow-ups: 2 textos por etapa al azar → 6 por etapa derivados del teléfono.

---

## 4. LO QUE FALTA — el trabajo de V2

1. **Customer Profile persistente** (Capa 2). Hoy el cliente que vuelve en 3
   semanas arranca de cero.
2. **Next Best Action** (Capa 4). Ningún lead tiene una próxima acción.
3. **Capa de herramientas** (Capa 5). Sin esto el agente no puede consultar
   stock, pedido ni pago: solo puede afirmar lo que le inyectaron.
4. **Abandono y recuperación**. No existe `ABANDONED_CHECKOUT`.
5. **Embudo y métricas comerciales**. El panel mide mensajes, no dinero.
6. **Handoff con contexto**. Hoy transfiere sin el resumen comercial.
7. **Tests de negocio end-to-end** (los 30 casos del spec).

**No verificado todavía** (queda para la fase que lo toque): manejo de audios e
imágenes, consulta de stock real, tracking de envíos.

---

## 5. PLAN POR FASES — ordenado por dinero recuperado ÷ riesgo

Cada fase termina en: **build + test + verificación en conversación real.**

| # | Fase | Por qué va acá | Riesgo |
|---|---|---|---|
| ✅ **0** | Desplegar y verificar lo ya arreglado | Son las causas medidas de las ventas perdidas. Verificar con `"¿cómo pago?"` en WhatsApp y con el tiempo de respuesta del panel dejando de decir 0s | Bajo |
| ✅ **1** | Quitar la contradicción (`1581`) y borrar los 5 módulos muertos | Una línea y un `rm`. Elimina órdenes que se pelean dentro del mismo prompt y la trampa del `customerProfile` fantasma | Muy bajo |
| ✅ **2** | Customer Profile persistente | Base de todo lo demás. Tabla + carga en `loadConversationMemory` + volcado al playbook | Medio |
| ✅ **3** | Next Best Action | Con el perfil ya cargado, es la decisión explícita del turno. Reemplaza "¿qué respondo?" por "¿qué avanzo?" | Medio |
| ✅ **4** | Abandono y recuperación | Cada lead pago que se cae hoy se pierde entero. Se apoya en el estado del perfil | Medio |
| **5** | Capa de herramientas real | El cambio más grande: pasar de prompt a function-calling para stock/pedido/pago | **Alto** |
| **6** | Intención con IA + contexto | Sustituir las 8 listas de keywords por decisión con historial y producto en foco. Va después de tener perfil y NBA, que son sus insumos | Alto |
| **7** | Embudo y métricas de dinero | Medir dónde se pierde: impresiones → clics → leads → checkout → pagado | Bajo |
| **8** | Handoff con resumen comercial | Barato una vez que existen perfil y NBA | Bajo |
| **9** | Los 30 casos de prueba del spec | Cierra el ciclo y protege todo lo anterior | Bajo |

### Por qué este orden y no el del spec
El spec pone "eliminar contradicciones" en Fase 2 y las herramientas en Fase 8.
Coincide casi todo. Dos cambios deliberados:

- **Se antepone desplegar lo ya arreglado** (Fase 0). Está hecho, probado y
  parado; no tiene sentido construir encima sin cobrarlo.
- **La intención con IA se mueve DESPUÉS del perfil y la NBA.** El spec la pone
  en Fase 6, antes de NBA. Pero la decisión de intención necesita como insumo el
  estado del lead y el producto en foco: hacerla antes obliga a rehacerla.

---

## 6. Criterio de éxito

No es que compile. Es esto, medido sobre las mismas 10 conversaciones:

- ¿Cuántas llegan a `closing`? Hoy: **0**.
- ¿Cuántos leads pagos se pierden sin próxima acción? Hoy: **todos**.
- ¿Se puede decir cuánto dinero produjo cada anuncio? La atribución existe,
  pero nadie la está mirando.

---

## 7. Requisito nuevo (2026-08-23): cada cliente configura SU agente, con Atlas de asesor

Pedido del dueño del producto, textual en intención:

> Los clientes suscritos tienen su propia tienda/emprendimiento. El agente de
> WhatsApp debe responder según lo que **el administrador de ESE negocio** le
> pida — instrucciones, configuraciones y estilos. Atlas debe **sugerirle** para
> que el cliente vaya sabiendo qué le conviene, pero **solo ejecutar con su
> confirmación** (o con lo que el cliente quiera agregarle). Es esencial para
> que el sistema sea usable por quien no maneja una consola.

### Lo que YA existe — no construirlo de nuevo

| Pieza | Estado | Dónde |
|---|---|---|
| Config del agente por tenant | ✅ | Tabla `agents`: `tenantId`, `name`, `role`, `tone`, `language`, `model`, `systemPrompt`, `stages[]` (prompt por etapa), `metadata`, `especialidad` |
| El motor la usa de verdad | ✅ | `agent.ts:752` `getActiveAgent(...)`; el `systemPrompt` del tenant se usa en `agent.ts:964`, la `metadata` en `881`, la `especialidad` filtra el catálogo en `804` |
| Perfil de negocio por tenant | ✅ | `business-context.ts:227` `getBusinessContext(tenantId)` con caché e invalidación |
| Pantallas de administración | ✅ | `ventas-pro/src/pages/agents.tsx` y `configuration.tsx` |
| Atlas puede leer y escribir esa config | ✅ | Herramientas `get_agent`, `update_agent`, `get_settings`, `update_settings`, `get_business_profile`, `update_business_profile`, `create_store`, `update_store` |
| Flujo proponer → confirmar | ✅ existe | `proposeAction` en `app-operator.ts`, ya usado para publicar en Facebook |

**Conclusión: la plomería está. Lo que falta es comportamiento.**

### Lo que falta — verificado

> ⚠️ **CORRECCIÓN (misma fecha).** La primera versión de esta sección decía que
> `update_agent` no pedía confirmación. **Era falso** y se corrige acá para que
> nadie construya una puerta que ya existe. El error vino de mirar el TEXTO de
> las descripciones (solo algunas dicen "requiere confirmación") en vez del
> mecanismo real, que es estructural.

**La puerta de confirmación YA EXISTE, en los dos caminos.** El control es el
set `READ_ONLY_TOOLS` (`app-operator.ts:4448`): lo que está adentro se ejecuta
libre, lo que **no** está adentro es mutación y exige confirmación.

- `get_agent`, `get_settings`, `get_store` → dentro (lectura).
- `update_agent`, `update_settings`, `update_business_profile` → **fuera**, o
  sea que ya están detrás de la puerta.

Cómo se aplica:

- **MCP / OpenCode**: la superficie expuesta se deriva de `READ_ONLY_TOOLS`
  más `propose_action` (`opencode-mcp-tools.ts:879, 917`). Las mutantes **solo**
  son alcanzables vía `propose_action`, cuya descripción es explícita:
  *"NUNCA lo ejecuta… espera su confirmación explícita antes de aplicar nada"*.
- **Consola**: `code-agent.ts:1658-1672` separa lecturas de mutaciones; si hay
  mutaciones arma el plan y **para** hasta el "sí" del admin.

### Lo que falta de verdad

1. **Atlas no sugiere: solo reacciona.** No hay ninguna rutina que mire cómo
   viene rindiendo el negocio y proponga un ajuste. El cliente tiene que saber
   qué pedir — que es exactamente lo que el requisito quiere evitar.

2. **No hay capa de "por qué te conviene".** Para que el cliente aprenda, la
   sugerencia tiene que venir con la evidencia de SU negocio ("tus leads se
   caen después de la ficha; te conviene subir el tono de cierre"), no con
   consejos genéricos.

3. **Por confirmar (no verificado):** al proponer `update_agent`, la propuesta
   parece armarse solo con los valores NUEVOS. El `run` lee el agente actual
   (`existing`) pero no se comprobó que el admin vea el valor VIEJO al lado del
   nuevo. Para un `systemPrompt` eso importa: aprobar un texto largo sin ver
   qué reemplaza es aprobar a ciegas. Revisar al construir la Fase 8.5.

### Cómo entra en el plan

- ~~Fase 1.5 — puerta de confirmación~~. **Cancelada: ya existe** (ver la
  corrección arriba). Lo único que queda de esto es el punto 3: verificar que
  la propuesta muestre el valor viejo junto al nuevo. Es chico y va dentro de
  la Fase 8.5.
- **Fase 8.5 — Atlas asesor de configuración**: sugerencias proactivas con la
  evidencia del propio negocio. Va DESPUÉS de las métricas (Fase 7): sin datos
  del embudo de ese tenant, cualquier sugerencia es un consejo genérico, y eso
  es justo lo que no queremos.

  Es la única pieza que hay que construir de verdad para el requisito, porque
  todo lo demás —config por tenant, uso real en el motor, pantallas, tools de
  Atlas y confirmación— ya está.


---

## 8. Avance al 2026-08-23 (fin de la jornada)

**Hechas y desplegadas:** 0, 1, 2, 3, 4. Más dos cosas que no estaban en el
plan y salieron de problemas reales:

| Qué | Por qué |
|---|---|
| Cierre con "¿cómo pago?" | Caía en la jugada genérica con la orden de NO cobrar |
| Producto cambiado al cobrar | Le ofreció pagar el Aula Virtual a quien venía por el piano |
| Variedad anti-bloqueo | Todos los clientes recibían el mismo texto |
| Métrica de tiempo de respuesta | Nunca midió: comparaba rol `"assistant"` vs el `"agent"` guardado |
| Validación de cobrabilidad | `GET /api/products/cobrabilidad` — qué NO se puede cobrar, antes de pautar |
| Perfil comercial | La misma ficha cinco veces al mismo cliente |
| Recuperación con contexto | El clic pagado moría con un "¿sigues interesado?" |
| Próxima acción | `GET /api/conversations/pendientes` — a cuál atender y qué le falta |

Tests: **192 pasan** (eran 120 al empezar). Fallan los mismos 2 archivos que
ya fallaban antes de esta jornada (`flujo-completo-venta`, `product-matching`):
necesitan Postgres real y arrastran ids de la SQLite compartida.

**Faltan:** 5 (herramientas), 6 (intención con IA), 7 (embudo), 8.5 (Atlas asesor), 9 (los 30 casos).

⚠️ **El número que todavía no se movió: 0 tratos ganados.** Todo lo de arriba
son medios. La verificación pendiente es una conversación real que llegue a
`closing` y cobre.

---

## 9. CÓMO RETOMAR ESTO — traspaso del 2026-08-23

Escrito para que quien siga (otra sesión, otra persona) pueda arrancar en frío
sin releer todo el historial.

### Dónde quedó exactamente

Fases **0, 1, 2, 3 y 4 hechas, commiteadas y en producción.** Fase 1.5
cancelada (la puerta de confirmación de Atlas ya existía). 192 tests pasando.

**Fase 8 (handoff con contexto) también terminada:** `src/lib/handoff-brief.ts`
está cableado vía `GET /api/conversations/:id/resumen-comercial` (declarado
antes de `/:id` en `routes/conversations.ts`) y tiene tests propios
(`__tests__/handoff-brief.test.ts`, 11 casos). El aviso de "no cableado" de su
cabecera se quitó.

### Lo que sigue, en orden y con el porqué

1. **Fase 7 — embudo y métricas de dinero.** Va antes que la 5 y la 6 porque
   es de riesgo bajo y porque **la Fase 8.5 depende de ella**: sin el embudo
   de cada negocio, las sugerencias de Atlas son consejos genéricos.
2. **Fase 8.5 — Atlas asesor.** Lo único que falta del requisito multi-tenant.
   Todo lo demás ya está: config por negocio en la tabla `agents`, el motor la
   usa de verdad, hay pantallas, Atlas tiene las tools y la confirmación
   funciona. Falta que SUGIERA en vez de solo reaccionar, con la evidencia del
   negocio. Pendiente chico anexo: verificar que la propuesta de `update_agent`
   muestre el valor VIEJO junto al nuevo (aprobar un `systemPrompt` largo sin
   ver qué reemplaza es aprobar a ciegas).
3. **Fase 6 — intención con IA.** El bug del 23 (cambiar de producto al
   cobrar) fue un parche correcto sobre un síntoma: mientras la intención y el
   producto los decidan 8 listas de palabras, van a seguir apareciendo casos
   así. Esta fase es la cura.
4. **Fase 5 — capa de herramientas.** La más grande y la de más riesgo: pasar
   el vendedor de prompt puro a function-calling. Va última a propósito.
5. **Fase 9 — los 30 casos del spec.**

### Trampas conocidas (comprobadas, no teóricas)

- **No confiar en el hash de commit de EasyPanel** para dar un deploy por vivo.
  Verificar con un endpoint que haya cambiado. El canario más simple hoy:
  `avgResponseTime` en `/api/dashboard/summary` — si vuelve a dar 0, el deploy
  no entró.
- **Hay otro agente trabajando en el mismo árbol** y commitea con `add -A`.
  Tres veces se llevó trabajo ajeno dentro de commits suyos. Revisar
  `git status` antes de commitear y no asumir que el árbol es propio.
- **La API de producción tiene rate limit de 100 req / 900 s.** Abrir el panel
  se come varias.
- **`browser_control` no se engancha a un Chromium ya abierto** con su perfil:
  hay que cerrarlo (la sesión vive en disco, no se pierde) y dejar que lo
  lance él.
- **Dos tests fallan desde antes** (`flujo-completo-venta`,
  `product-matching`): necesitan Postgres real y arrastran ids de la SQLite
  compartida entre corridas. No son regresiones.
- ⚠️ **El token de GitHub está en texto plano en la URL del remoto.** Sale
  completo con `git remote -v`. Rotarlo.

### Cómo se mide si todo esto sirvió

No por tests ni por fases cerradas. Por esto, sobre las mismas conversaciones:

| | Al empezar (23-08) | Hoy |
|---|---|---|
| Conversaciones en `closing` | 0 de 10 | — |
| Tratos ganados | 0 | — |
| Tiempo de respuesta visible | `0s` (nunca midió) | 199 s reales |

**El número que todavía no se movió es el de tratos ganados.** Todo lo
construido son medios. La verificación pendiente es una conversación real que
llegue al cierre y cobre.
