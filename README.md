# VentasPro — Arquitectura objetivo de producción

## Propósito

VentasPro es una plataforma SaaS multi-tenant para automatización comercial y atención por WhatsApp, con panel web, tienda pública, agentes de IA, Atlas, marketing y pagos.

Este README define la **arquitectura objetivo para producción y lanzamiento al mercado**. No implica que toda la reorganización de carpetas deba hacerse de una sola vez: la migración debe ser incremental y conservar la funcionalidad operativa.

---

## 1. Arquitectura objetivo

```text
                           INTERNET
                              │
                       ┌──────┴──────┐
                       │ Reverse     │
                       │ Proxy / TLS │
                       └──────┬──────┘
                              │
              ┌───────────────┼────────────────┐
              │               │                │
              ▼               ▼                ▼
          WEB/PANEL           API          TIENDA PÚBLICA
          React/Vite       Node/TypeScript   React/Vite
              │               │                │
              │        ┌──────┼───────┐        │
              │        │      │       │        │
              │        ▼      ▼       ▼        │
              │      Redis PostgreSQL Storage  │
              │        │      │       │        │
              │        └──────┼───────┘        │
              │               │                │
              │       ┌───────┼────────┐       │
              │       │       │        │       │
              │       ▼       ▼        ▼       │
              │    SALES    ATLAS   MARKETING  │
              │    WORKER   WORKER    WORKER   │
              │       │       │        │       │
              │       └───────┼────────┘       │
              │               ▼                │
              │           AI GATEWAY            │
              │          / AI ROUTER             │
              │               │                 │
              │      ┌────────┼─────────┐       │
              │      ▼        ▼         ▼       │
              │    Ollama  OpenRouter  Otros    │
              │               │                 │
              │               ▼                 │
              │          Modelos IA             │
              │                                 │
              └───────────────┬─────────────────┘
                              ▼
                    WhatsApp / Meta / Pagos
```

---

## 2. Servicios de producción

EasyPanel debe tratar cada componente principal como un servicio independiente.

```text
EasyPanel
│
├── ventaspro-web
├── ventaspro-api
├── ventaspro-sales-worker
├── ventaspro-atlas-worker
├── ventaspro-marketing-worker
├── ventaspro-scheduler
├── ventaspro-store
├── postgres
├── redis
├── ollama
└── reverse-proxy
```

### Servicios públicos

Solo deben estar expuestos a Internet:

- `ventaspro-web`
- `ventaspro-api`
- `ventaspro-store`
- reverse proxy

### Servicios internos

No deben exponerse públicamente:

- PostgreSQL
- Redis
- Ollama
- Sales Worker
- Atlas Worker
- Marketing Worker
- Scheduler

---

## 3. Separación de aplicaciones

### Web / Panel SaaS

Responsabilidad:

- React + Vite
- interfaz
- navegación
- estado del cliente
- llamadas a API
- tiempo real
- autenticación del lado cliente

No debe contener:

- credenciales privadas
- acceso directo a PostgreSQL
- Baileys
- lógica sensible de Meta
- claves de IA
- secretos de pagos

Estructura objetivo:

```text
apps/web/
├── src/
│   ├── components/
│   ├── pages/
│   ├── features/
│   ├── hooks/
│   ├── stores/
│   ├── lib/
│   └── main.tsx
└── package.json
```

En el repositorio actual, esta responsabilidad está principalmente en:

```text
artifacts/ventas-pro/
```

La migración debe ser progresiva hacia `apps/web/`.

---

## 4. API principal

La API es la frontera central de negocio.

Estructura objetivo:

```text
apps/api/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   ├── middleware/
│   ├── security/
│   ├── realtime/
│   └── modules/
│       ├── auth/
│       ├── tenants/
│       ├── users/
│       ├── products/
│       ├── categories/
│       ├── leads/
│       ├── conversations/
│       ├── orders/
│       ├── payments/
│       ├── whatsapp/
│       ├── agents/
│       ├── marketing/
│       ├── landing-pages/
│       ├── subscriptions/
│       └── analytics/
└── tests/
```

En el repositorio actual, la base principal está en:

```text
artifacts/api-server/
```

---

## 5. Sofía / Sales Worker

El agente vendedor de WhatsApp es un servicio independiente.

Responsabilidades:

- recibir eventos de WhatsApp
- normalizar mensajes
- recuperar contexto
- consultar herramientas comerciales
- consultar productos
- manejar intención y estado comercial
- generar respuesta
- detectar intención de compra
- ejecutar acciones comerciales
- hacer handoff a humano
- gestionar follow-ups

Estructura objetivo:

```text
apps/sales-worker/
├── src/
│   ├── worker.ts
│   ├── queue/
│   ├── whatsapp/
│   ├── sales/
│   ├── tools/
│   ├── context/
│   └── policies/
└── tests/
```

### Regla crítica

El camino de WhatsApp **no depende de Atlas ni de OpenCode** para poder contestar al cliente.

Si Atlas está detenido, Sofía debe poder seguir operando.

---

## 6. Atlas Worker

Atlas es el agente administrativo/estratégico de la plataforma.

Responsabilidades:

- orquestación interna
- diagnóstico
- ejecución de herramientas
- marketing
- automatizaciones
- análisis
- operaciones administrativas
- coordinación de agentes especializados

Estructura objetivo:

```text
apps/atlas-worker/
├── src/
│   ├── worker.ts
│   ├── orchestrator/
│   ├── agents/
│   ├── tools/
│   ├── memory/
│   └── policies/
└── tests/
```

Atlas **no debe convertirse en el cerebro obligatorio de cada conversación de WhatsApp**.

---

## 7. Agentes especializados

Los agentes deben compartir runtime y contratos comunes, pero tener responsabilidades separadas.

Ejemplo:

```text
Atlas
│
├── Sales Specialist
├── Marketing Specialist
├── Ads Specialist
├── Support Specialist
├── Landing Specialist
└── Analytics Specialist
```

La orquestación debe decidir:

- qué agente utilizar
- qué herramientas puede usar
- qué modelo utilizar
- qué contexto necesita
- qué resultado devolver

---

## 8. Cola y concurrencia

Las operaciones asíncronas deben pasar por Redis/Queue.

Colas objetivo:

```text
Redis
├── whatsapp.incoming
├── whatsapp.outgoing
├── sales.ai
├── atlas.tasks
├── marketing.tasks
├── notifications
└── scheduled
```

Esto evita bloquear la API cuando llegan muchas solicitudes simultáneas.

El patrón debe ser:

```text
WhatsApp
   ↓
API/Webhook
   ↓
Queue
   ↓
Worker
   ↓
AI / Tools
   ↓
Queue
   ↓
WhatsApp
```

---

## 9. PostgreSQL

PostgreSQL es la base de producción del SaaS.

No se debe usar SQLite como base principal en producción.

Estructura objetivo:

```text
packages/db/
├── src/
│   ├── client.ts
│   ├── schema/
│   │   ├── tenants.ts
│   │   ├── users.ts
│   │   ├── products.ts
│   │   ├── categories.ts
│   │   ├── conversations.ts
│   │   ├── messages.ts
│   │   ├── agents.ts
│   │   ├── whatsapp.ts
│   │   ├── leads.ts
│   │   ├── orders.ts
│   │   ├── payments.ts
│   │   ├── subscriptions.ts
│   │   ├── marketing.ts
│   │   └── analytics.ts
│   └── migrations/
└── package.json
```

En el repositorio actual existe una base bien avanzada en:

```text
lib/db/
```

incluyendo esquemas de tenants, conversaciones, mensajes, agentes, productos, WhatsApp, marketing, suscripciones y consumo.

### Regla multi-tenant

Todas las operaciones de negocio deben estar aisladas por `tenant_id`.

El tenant debe derivarse de la sesión/token autenticado, no confiar en un `tenantId` enviado libremente desde el frontend.

---

## 10. Capa de IA

La aplicación no debe depender directamente de un proveedor específico.

Estructura:

```text
packages/ai/
├── router/
├── providers/
│   ├── ollama/
│   ├── openrouter/
│   ├── openai/
│   ├── anthropic/
│   ├── google/
│   └── groq/
├── models/
├── tool-calling/
├── context/
├── memory/
├── telemetry/
└── schemas/
```

El backend utiliza un único contrato:

```text
AI Router
   │
   ├── Ollama
   ├── OpenRouter
   ├── proveedor directo
   └── fallback
```

Cambiar de modelo no debe requerir modificar la lógica comercial.

---

## 11. Ollama

Ollama debe ser un servicio independiente.

```text
ollama
└── :11434
```

Volumen persistente:

```text
/root/.ollama
```

No debe estar dentro del contenedor del backend.

### Modelo local inicial

La infraestructura debe permitir comenzar con un modelo pequeño y crecer posteriormente a GPU/modelos mayores.

No se debe asumir que un modelo grande tiene que permanecer cargado permanentemente.

---

## 12. Tienda pública

La tienda debe permanecer separada del panel administrativo.

Responsabilidades:

- catálogo
- páginas públicas
- carrito
- checkout
- landing pages
- productos
- tracking

Estructura objetivo:

```text
apps/store/
├── src/
│   ├── components/
│   ├── pages/
│   ├── editor/
│   ├── store/
│   └── lib/
└── package.json
```

La base actual está en:

```text
packages/tienda/
```

La tienda nunca debe acceder directamente a PostgreSQL.

---

## 13. Object Storage

Los archivos multimedia no deben crecer dentro del repositorio ni depender del filesystem efímero del contenedor.

Usar Object Storage:

- Cloudflare R2
- S3
- Backblaze B2
- MinIO

Ejemplo:

```text
Producto
   ├── metadata → PostgreSQL
   └── imagen → Object Storage
```

Guardar en PostgreSQL solamente la URL/clave del objeto.

Esto aplica a:

- imágenes de productos
- imágenes de anuncios
- videos
- comprobantes
- archivos de clientes
- assets de landing pages
- media de WhatsApp

---

## 14. WhatsApp

Cada tenant debe tener una conexión independiente.

```text
Tenant
└── WhatsApp Connection
    ├── status
    ├── credentials/session
    ├── last heartbeat
    └── metadata
```

PostgreSQL guarda el estado y metadata.

Las credenciales/sesiones de Baileys deben mantenerse en almacenamiento persistente y no dentro del código ni de la imagen Docker.

---

## 15. Integraciones externas

Las integraciones deben quedar detrás de adaptadores.

```text
packages/integrations/
├── meta/
├── whatsapp/
├── mercadopago/
├── paypal/
├── email/
├── dropi/
├── woocommerce/
└── storage/
```

Los módulos de negocio no deben llamar directamente SDKs externos en cientos de archivos.

---

## 16. Seguridad

Producción debe cumplir como mínimo:

- HTTPS obligatorio
- cookies/sesiones seguras
- secretos fuera del repositorio
- `COOKIE_SECRET` estable
- `CREDENTIALS_ENCRYPTION_KEY` estable
- credenciales externas cifradas
- aislamiento por tenant
- rate limiting
- logs de auditoría
- validación de entradas
- permisos por rol
- backups
- rotación de credenciales
- endpoints administrativos protegidos

Nunca almacenar:

- API keys en frontend
- tokens Meta en el código
- contraseñas en Git
- secretos en `public/`

---

## 17. Docker y despliegue

No construir una única imagen que contenga backend + frontend + tienda + todo el runtime.

Cada servicio debe tener su propia imagen o proceso.

Ejemplo:

```text
Docker
├── web
├── api
├── sales-worker
├── atlas-worker
├── marketing-worker
├── scheduler
└── store
```

PostgreSQL, Redis y Ollama utilizan imágenes independientes.

---

## 18. Infraestructura inicial recomendada

No hace falta comprar varios servidores para comenzar.

### Etapa 1

Un único VPS puede ejecutar:

```text
Contabo
│
├── web
├── api
├── sales-worker
├── atlas-worker
├── scheduler
├── PostgreSQL
├── Redis
└── Ollama
```

El modelo local debe ser pequeño y la concurrencia debe controlarse mediante cola.

### Etapa 2

Cuando aumente el tráfico:

```text
VPS 1
├── web
├── api
├── workers
├── PostgreSQL
└── Redis

VPS 2 / GPU
└── Ollama
```

La aplicación no debe tener que reescribirse para hacer esta separación.

---

## 19. Dominio y exposición

Ejemplo:

```text
app.ventaspro.com
api.ventaspro.com
tienda.ventaspro.com
```

Solo el reverse proxy recibe tráfico público.

Internamente:

```text
api → postgres
api → redis
sales-worker → redis
sales-worker → postgres
workers → ai-router
ai-router → ollama
```

PostgreSQL, Redis y Ollama no deben estar publicados directamente en Internet.

---

## 20. Observabilidad

Debe existir una capa común para:

- logs
- errores
- métricas
- latencia
- consumo de IA
- colas
- salud de WhatsApp
- salud de PostgreSQL
- estado de workers
- uso por tenant

Métricas importantes:

```text
API
├── requests/s
├── p95 latency
└── errors

Workers
├── queue depth
├── processing time
└── failures

IA
├── tokens input
├── tokens output
├── latency
├── model
└── costo

WhatsApp
├── connected
├── disconnected
├── reconnects
└── message failures
```

---

## 21. Backups

Mínimo:

- PostgreSQL diario
- retención de backups
- backup de configuración crítica
- backup de sesiones de WhatsApp cuando corresponda
- backup de archivos/object storage
- prueba periódica de restauración

No considerar un backup válido hasta haber comprobado que se puede restaurar.

---

## 22. Estructura objetivo del monorepo

```text
ventaspro/
│
├── apps/
│   ├── web/
│   ├── api/
│   ├── store/
│   ├── sales-worker/
│   ├── atlas-worker/
│   ├── marketing-worker/
│   └── scheduler/
│
├── packages/
│   ├── db/
│   ├── api-contracts/
│   ├── ai/
│   ├── agents/
│   ├── whatsapp/
│   ├── integrations/
│   ├── storage/
│   ├── queue/
│   ├── auth/
│   ├── shared/
│   ├── ui/
│   └── config/
│
├── infra/
│   ├── docker/
│   ├── easypanel/
│   ├── backups/
│   └── monitoring/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── product/
│   └── runbooks/
│
├── scripts/
├── tests/
├── .env.example
├── pnpm-workspace.yaml
└── README.md
```

---

## 23. Mapeo desde la estructura actual

La reorganización inicial debe aprovechar el trabajo existente.

| Actual | Destino |
|---|---|
| `artifacts/ventas-pro` | `apps/web` |
| `artifacts/api-server` | `apps/api` + módulos/workers |
| `packages/tienda` | `apps/store` |
| `lib/db` | `packages/db` |
| `lib/api-zod` | `packages/api-contracts` |
| `lib/api-spec` | `packages/api-contracts` |
| `lib/api-client-react` | `packages/api-client` |
| integraciones existentes | `packages/integrations` |
| lógica IA/proveedores | `packages/ai` |
| Cola/runtime agentes | `packages/agents` + Redis |
| Scripts operativos | `scripts/` |
| Documentación | `docs/` |

La migración debe hacerse sin borrar funcionalidad hasta comprobar que la nueva ruta funciona.

---

## 24. Principios que no se deben romper

1. **Sofía no depende de Atlas para responder WhatsApp.**
2. **El frontend nunca accede directamente a PostgreSQL.**
3. **Cada tenant está aislado.**
4. **Los hechos comerciales salen de herramientas/BD; el modelo redacta.**
5. **Los proveedores de IA están detrás de un AI Router.**
6. **PostgreSQL es la base de producción.**
7. **Redis/Queue desacopla eventos y trabajos largos.**
8. **Ollama es un servicio independiente.**
9. **Los archivos grandes van a Object Storage.**
10. **No se crean microservicios solo por separar carpetas; cada servicio debe tener una responsabilidad operacional real.**
11. **La infraestructura debe poder crecer sin reescribir la aplicación.**
12. **Toda nueva integración debe tener un adaptador y pruebas.**

---

## 25. Criterio de lanzamiento al mercado

VentasPro está listo para producción cuando:

- [ ] PostgreSQL es la fuente de datos de producción.
- [ ] SQLite no participa en el camino principal del SaaS.
- [ ] Web y API están separados.
- [ ] Sofía y Atlas están separados.
- [ ] Redis/Queue gestiona trabajos asíncronos.
- [ ] Multi-tenancy está verificado con pruebas.
- [ ] Credenciales están cifradas.
- [ ] WhatsApp tiene persistencia por tenant.
- [ ] Backups y restauración están probados.
- [ ] Health checks funcionan.
- [ ] Logs y métricas están disponibles.
- [ ] CI ejecuta typecheck, unit, integration y e2e.
- [ ] No existen secretos en Git.
- [ ] Se ha probado concurrencia.
- [ ] El AI Router permite cambiar de proveedor/modelo.
- [ ] El despliegue se puede reproducir desde cero.
- [ ] Hay un procedimiento de rollback.

---

## 26. Regla de migración

La arquitectura debe migrarse **por etapas**, no con una reescritura total.

Orden recomendado:

1. Producción estable con PostgreSQL.
2. Separar web de API.
3. Extraer Sales Worker.
4. Extraer Atlas Worker.
5. Introducir Redis/Queue.
6. Extraer AI Router.
7. Separar Store.
8. Migrar media a Object Storage.
9. Añadir observabilidad y backups.
10. Separar Ollama físicamente cuando el tráfico lo justifique.

El objetivo es que cada etapa pueda desplegarse, probarse y revertirse sin romper las demás.

---

## Estado objetivo

La plataforma final debe poder evolucionar desde:

```text
1 VPS
+
1 API
+
1 Web
+
1 PostgreSQL
+
1 Redis
+
1 Ollama
```

hasta:

```text
Web/API
   +
Workers escalables
   +
PostgreSQL independiente
   +
Redis
   +
Object Storage
   +
GPU/IA independiente
```

sin cambiar los contratos principales de la aplicación.

**Esta es la arquitectura base que debe considerarse fuente de verdad para la organización del proyecto antes del lanzamiento comercial de VentasPro.**
