# 🏗️ Análisis de Arquitectura - Agent-Sales-Bot

## 📋 Resumen Ejecutivo

**Agent-Sales-Bot** es una plataforma SaaS multi-tenant para automatización de ventas y e-commerce con integración WhatsApp, Facebook Ads y procesamiento de pagos.

- **Tipo:** Monorepo (pnpm workspace)
- **Arquitectura:** Microservicios + Monolito frontend
- **Modelo:** SaaS Multi-tenant
- **Despliegue:** Docker + EasyPanel

---

## 📦 Estructura de Directorios

```
Agent-Sales-Bot/
├── artifacts/
│   ├── api-server/          ← Backend principal (Node.js/Express)
│   ├── ventas-pro/          ← Frontend admin (React/Vite)
│   ├── mockup-sandbox/      ← Entorno de pruebas
│   └── opencode-proxy/      ← Proxy de utilidades
│
├── lib/                     ← Librerías compartidas
│   ├── db/                  ← Drizzle ORM + PostgreSQL
│   ├── api-zod/             ← Validación de esquemas
│   ├── api-spec/            ← Especificaciones OpenAPI
│   ├── api-client-react/    ← Cliente API para React
│   └── integrations/        ← WhatsApp, Facebook, OpenAI
│
├── packages/
│   └── tienda/              ← Tienda pública (Next.js/Vite)
│
├── scripts/                 ← CLI y utilidades
├── data/                    ← Datos y backups
└── design/                  ← Mockups y diseños

```

---

## 🔧 Stack Tecnológico

### Frontend (ventas-pro)

| Capa | Tecnología | Versión | Propósito |
|------|-----------|---------|----------|
| **Framework** | React | 19.1.0 | UI moderno con hooks |
| **Bundler** | Vite | 7.3.2 | Build rápido (HMR) |
| **Styling** | Tailwind CSS | 4.1.14 | Utility-first CSS |
| **Routing** | Wouter | 3.3.5 | Router minimalista |
| **State** | Zustand | 5.0.13 | Global state management |
| **Type Safety** | TypeScript | 5.9.2 | Type checking |
| **Icons** | Lucide React | 0.545.0 | Icon library |
| **API Queries** | React Query | 4.29.12 | Data fetching |

### Backend (api-server)

| Capa | Tecnología | Propósito |
|------|-----------|----------|
| **Runtime** | Node.js | JavaScript servidor |
| **Framework** | Express | HTTP routing |
| **Database** | PostgreSQL | Datos persistentes |
| **ORM** | Drizzle | Type-safe queries |
| **Validation** | Zod | Schema validation |
| **Type Safety** | TypeScript | Type checking |
| **Auth** | JWT | Token-based auth |
| **Logging** | Pino/Winston | Structured logging |

### Integraciones

| Sistema | Librería | Propósito |
|---------|----------|----------|
| **WhatsApp** | Baileys | Web automation |
| **Facebook** | facebook-sdk | Ads + Catalog |
| **Pagos** | Mercado Pago SDK | Pasarela pagos |
| **Pagos** | PayPal IPN | Webhooks pagos |
| **IA** | OpenAI API | Generación de contenido |
| **Email** | Nodemailer | Transaccionales |

---

## 🎯 Arquitectura de Capas

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Admin Web   │  │  Public Store │  │  Mobile App  │       │
│  │  (React)     │  │   (Vite)      │  │   (Expo?)    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                           ↓
                   [API Gateway / CORS]
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    API LAYER                                 │
│  REST Endpoints:                                             │
│  ├─ /api/products/*      (CRUD productos)                   │
│  ├─ /api/store/*         (Tienda pública)                   │
│  ├─ /api/conversations/* (Chat WhatsApp)                    │
│  ├─ /api/payments/*      (Pagos)                            │
│  ├─ /api/admin/*         (Admin panel)                      │
│  └─ /api/webhooks/*      (Integraciones)                    │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                   BUSINESS LOGIC LAYER                       │
│  ├─ PaymentService      (Mercado Pago, PayPal)             │
│  ├─ WhatsAppService     (Baileys automation)               │
│  ├─ FacebookService     (Ads + Catalog API)                │
│  ├─ AIService           (OpenAI content generation)         │
│  ├─ EmailService        (Nodemailer transactionales)        │
│  └─ TenantService       (Multi-tenant isolation)            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                   DATA ACCESS LAYER                          │
│  ├─ Drizzle ORM         (Type-safe queries)                 │
│  ├─ Zod Schemas         (Runtime validation)                │
│  └─ PostgreSQL          (RDBMS)                             │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              EXTERNAL SERVICES / WEBHOOKS                    │
│  ├─ Mercado Pago IPN    ← Pagos recibidos                  │
│  ├─ PayPal IPN          ← Pagos recibidos                  │
│  ├─ WhatsApp Messages   ← Mensajes entrantes               │
│  ├─ Facebook Webhooks   ← Eventos ads/catalog              │
│  └─ Email SMTP          → Envío de correos                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏢 Modelo Multi-Tenant

### Aislamiento de Datos

```
┌─────────────────────────────────────┐
│      PostgreSQL Database            │
├─────────────────────────────────────┤
│  TENANT 1: "tecnovariedades"        │
│  ├─ Products (100)                  │
│  ├─ Conversations (500)             │
│  ├─ Payments (50)                   │
│  └─ WhatsApp Sessions (1)           │
├─────────────────────────────────────┤
│  TENANT 2: "zapateria-express"      │
│  ├─ Products (50)                   │
│  ├─ Conversations (200)             │
│  ├─ Payments (30)                   │
│  └─ WhatsApp Sessions (1)           │
├─────────────────────────────────────┤
│  TENANT 3: "cursos-online"          │
│  ├─ Products (25)                   │
│  ├─ Conversations (1000)            │
│  ├─ Payments (200)                  │
│  └─ WhatsApp Sessions (1)           │
└─────────────────────────────────────┘
```

### Contexto de Tenant

```typescript
// En cada request
const tenant = await db
  .select()
  .from(tenants)
  .where(eq(tenants.id, userId.tenantId))
  
// Queries con aislamiento
const products = await db
  .select()
  .from(products)
  .where(eq(products.tenantId, tenant.id))
```

---

## 🔐 Flujos de Autenticación

### Login Admin

```
User Input (email/password)
        ↓
[Backend] Validar credenciales
        ↓
[PostgreSQL] Buscar usuario
        ↓
[bcrypt] Verificar contraseña
        ↓
[JWT] Generar token
        ↓
Response {token, user, tenant}
        ↓
[Frontend] Guardar token (localStorage)
        ↓
[Headers] Authorization: Bearer {token}
```

### Public Store Access

```
Visit /tienda/{slug}
        ↓
[Wouter Router] Route a /mi-tienda
        ↓
[API] GET /api/store/{slug}
        ↓
[Backend] Query store by slug
        ↓
[Database] Retornar productos públicos
        ↓
[Frontend] Render productos sin auth
```

---

## 💳 Flujo de Pagos

### Mercado Pago

```
1. Cliente ve producto → "Comprar Ahora"
        ↓
2. [Frontend] Abre checkout Mercado Pago
        ↓
3. [Mercado Pago] Procesa pago
        ↓
4. [Webhook] POST /api/webhooks/mercadopago
        ↓
5. [Backend] Verifica IPN signature
        ↓
6. [Database] Actualiza payment status → "confirmed"
        ↓
7. [WhatsApp] Envía link de descarga al cliente
        ↓
8. [Email] Envía factura + invoice
```

### PayPal

```
1. Cliente paga en PayPal → IPN enviado
        ↓
2. [Webhook] POST /api/webhooks/paypal
        ↓
3. [Backend] Verifica transacción
        ↓
4. [Database] payment_status = "approved"
        ↓
5. [WhatsApp] Entrega automática del producto
        ↓
6. [Email] Confirmación + descarga
```

---

## 📊 Flujo de WhatsApp

### QR Code Pairing

```
[Frontend] Admin → WhatsApp Settings
        ↓
[Backend] Inicializa Baileys socket
        ↓
[Baileys] Genera QR code
        ↓
[Frontend] Muestra QR en la UI
        ↓
[Mobile] Escanea QR con WhatsApp
        ↓
[Baileys] Sesión autenticada
        ↓
[Database] Guarda sesión.json encriptado
```

### PIN Code Pairing

```
[Frontend] Ingresa PIN (de WhatsApp Settings)
        ↓
[Backend] Baileys.requestPairingCode(pin)
        ↓
[Mobile] WhatsApp genera código de pairing
        ↓
[Backend] Usa código para authenticate
        ↓
[Database] Sesión persistida
```

### Mensaje Entrante

```
[Customer] Envía mensaje WhatsApp
        ↓
[Baileys] Intercepta (socket.on("message_create"))
        ↓
[Backend] Procesa mensaje
        ↓
[Database] Guardar conversation + message
        ↓
[AI] (Optional) Respuesta automática
        ↓
[Baileys] Envía respuesta
        ↓
[Frontend] Actualiza chat UI (real-time)
```

---

## 🤖 Integración Facebook Ads

### Flujo de Generación de Ads

```
1. [Admin] Selecciona producto
        ↓
2. [Frontend] POST /api/facebook/generate-copy
        ↓
3. [Backend] Facebook SDK → Get product stats
        ↓
4. [AI/OpenAI] Genera copy + headlines
        ↓
5. [Database] Guarda ad drafts
        ↓
6. [Frontend] Preview en UI
        ↓
7. [Admin] Publica a Facebook Ads
```

### Catálogo Sincronizado

```
[Admin] Crea/edita producto
        ↓
[Backend] POST /api/products
        ↓
[Database] Guardar en products table
        ↓
[Facebook Sync Job] Ejecuta cada X minutos
        ↓
[Facebook SDK] Envía productos a catálogo
        ↓
[Customers] Ven en Instagram/Facebook Shop
```

---

## 📈 Flujo de Datos - Diagrama de Secuencia

```
Frontend                Backend              Database         External
  │                       │                    │                 │
  │─ GET /products ──────→│                    │                 │
  │                       │─ SELECT * ────────→│                 │
  │                       │←─ rows ────────────│                 │
  │←─ JSON response ──────│                    │                 │
  │                       │                    │                 │
  │─ POST /purchase ─────→│                    │                 │
  │                       │─ INSERT payment ──→│                 │
  │                       │←─ id ──────────────│                 │
  │←─ checkout_url ──────│                    │                 │
  │                       │                    │                 │
  │                       │←─ IPN webhook ────────────────────── MercadoPago
  │                       │─ SELECT payment ──→│                 │
  │                       │─ UPDATE status ───→│                 │
  │                       │─ sendEmail() ─────────────────────→ SMTP
  │                       │─ sendWhatsApp() ──────────────────→ Baileys
  │                       │                    │                 │
  │←─ Order completed ───│                    │                 │
```

---

## 🗄️ Esquema de Base de Datos (Simplificado)

```sql
-- Multi-tenancy
tenants
├─ id (PK)
├─ email (UNIQUE)
├─ slug (UNIQUE)
├─ brandName
├─ whatsappPhoneId
└─ createdAt

-- Productos
products
├─ id (PK)
├─ tenantId (FK)
├─ name
├─ description
├─ price
├─ currency
├─ imageUrl
├─ deliveryLink
├─ paymentLink
└─ createdAt

-- Conversaciones
conversations
├─ id (PK)
├─ tenantId (FK)
├─ whatsappNumber
├─ contactName
├─ messages (array)
├─ paymentStatus
├─ currentProductId
└─ createdAt

-- Pagos
payments
├─ id (PK)
├─ tenantId (FK)
├─ productId (FK)
├─ amount
├─ currency
├─ status (pending|confirmed|failed)
├─ paymentMethod (mercadopago|paypal)
├─ transactionId
├─ verificationSource
├─ verifiedAt
└─ createdAt

-- Mensajes
messages
├─ id (PK)
├─ conversationId (FK)
├─ sender (customer|bot)
├─ content
├─ mediaUrl
├─ status (sent|delivered|read)
└─ timestamp
```

---

## 🔒 Seguridad

### Medidas Implementadas

| Capa | Medida | Descripción |
|------|--------|------------|
| **Supply Chain** | 1-day package age | Previene npm malware |
| **Input** | Zod validation | Schema validation |
| **Database** | Parameterized queries | SQL injection prevention |
| **Auth** | JWT + refresh tokens | Token-based auth |
| **CORS** | Whitelist domains | Cross-origin protection |
| **HTTPS** | TLS encryption | Transport security |
| **Secrets** | Environment variables | No hardcoded secrets |
| **Rate Limiting** | API throttling | DDoS mitigation |
| **Session** | httpOnly cookies | XSS protection |

---

## 🚀 Despliegue

### Ambientes

```
Development (local)
├─ pnpm dev (frontend + backend)
├─ Hot reload (Vite + Nodemon)
└─ SQLite (local DB)

Staging (EasyPanel)
├─ Docker containers
├─ PostgreSQL managed
├─ Staging domain
└─ Same as production

Production (EasyPanel)
├─ Docker + Kubernetes-like
├─ PostgreSQL HA
├─ CDN for static assets
└─ Custom domain per tenant
```

### Docker Services

```yaml
services:
  api-server:
    image: agent-sales-bot:api
    ports: [3002:3002]
    env: production
    depends_on: [postgres, redis]
    
  ventas-pro:
    image: agent-sales-bot:web
    ports: [5174:5174]
    env: production
    
  postgres:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]
    
  redis:
    image: redis:7
    (for session store / cache)
```

---

## 📊 Métricas y Monitoreo

### KPIs por Tenant

```
dashboard/
├─ Total de ventas (USD/COP)
├─ Órdenes completadas
├─ Conversión rate (leads → pagos)
├─ Tiempo respuesta WhatsApp
├─ Costo por ad (Facebook)
├─ Email delivery rate
└─ Page load time
```

---

## ⚠️ Problemas Conocidos y Soluciones

| Problema | Causa | Solución |
|----------|-------|----------|
| WhatsApp PIN no funciona | Faltan 3s después socket init | ✓ Implementado delay en startWithPairing() |
| Precios duplicados en ads | toLocaleString() sin decimales | ✓ Especificado minimumFractionDigits |
| React null warnings | Product data con null values | ✓ Fallback en ProductModal |
| 404 en admin/products | Ruta incorrecta /admin/products | ✓ Corregido a /products |
| Overflow en móvil | Header con imagen grande | ✓ Simplificado design responsive |

---

## 🎯 Recomendaciones Arquitectónicas

### Corto Plazo (1-2 sprints)

- [ ] Implementar Redis para session store
- [ ] Agregar API rate limiting
- [ ] Crear admin dashboard completo
- [ ] Setup de monitoring (Sentry/DataDog)
- [ ] Database backups automatizados

### Mediano Plazo (3-6 meses)

- [ ] Migrar Baileys a WhatsApp Business API oficial
- [ ] Implementar payment reconciliation job
- [ ] Agregar customer analytics
- [ ] Setup de CDN para media
- [ ] Implementar worker jobs (Bull/BullMQ)

### Largo Plazo (6-12 meses)

- [ ] Microservicios separados (payments, notifications)
- [ ] Event-driven architecture (Kafka/RabbitMQ)
- [ ] GraphQL API (además de REST)
- [ ] Mobile app nativa (React Native)
- [ ] Multi-region deployment

---

## 📚 Referencias

- **Frontend:** [artifacts/ventas-pro/README.md]
- **Backend:** [artifacts/api-server/README.md]
- **Database:** [lib/db/README.md]
- **Security:** [SECURITY_ACTION_PLAN.md]
- **Deployment:** [easypanel.yml]

