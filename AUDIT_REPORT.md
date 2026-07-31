# AUDITORÍA COMPLETA: Agent-Sales-Bot SaaS

**Fecha:** Julio 31, 2026  
**Proyecto:** Agent-Sales-Bot (Plataforma IA de Ventas por WhatsApp)  
**Estado de Monetización:** PARCIALMENTE LISTO  

---

## RESUMEN EJECUTIVO

El proyecto está **estructuralmente sólido** para una MVP de SaaS, pero tiene **bloqueadores críticos de seguridad** que deben resolverse ANTES de monetizar. El sistema de planes está implementado, pero la validación de pagos y secretos de sesión necesitan correcciones urgentes.

**Veredicto:** ❌ **NO APTO PARA PRODUCCIÓN CON DINERO REAL** sin resolver los 5 críticos.

---

## 1. SEGURIDAD CRÍTICA ❌

### 🔴 1.1 COOKIE_SECRET No Validado en Producción

**Riesgo:** Cualquiera puede falsificar cookies de sesión y acceder como otro tenant.

**Ubicación:** `/artifacts/api-server/src/app.ts` líneas 245-254

```typescript
let cookieSecret = process.env.COOKIE_SECRET;
if (!cookieSecret) {
  cookieSecret = randomBytes(32).toString("hex");
  logger.warn(`[Security] COOKIE_SECRET no configurado...`);
}
```

**El Problema:**
- Si `COOKIE_SECRET` no está seteado, genera una clave aleatoria **en memoria**
- Cada reinicio genera una clave nueva → todas las sesiones activas se invalidan
- En producción, un restart por deploy bota a todos los usuarios
- **Sin verificación de firma, el cookie `tenant_id` se puede forjar**

**Solución Requerida:**
```typescript
// En app.ts, línea 245
const cookieSecret = process.env.COOKIE_SECRET;
if (!cookieSecret) {
  logger.error("[FATAL] COOKIE_SECRET es requerido en producción");
  process.exit(1); // Fallar rápido, detectar en CI/CD
}
```

---

### 🔴 1.2 Rate Limiting Solo en Memoria (Sin Redis)

**Riesgo:** Si el servidor reinicia, toda protección de rate limiting se pierde. Permite ataques de fuerza bruta en password reset y signup.

**Ubicación:** `/artifacts/api-server/src/middleware/rateLimiting.ts` líneas 38-131

```typescript
// In-memory storage for rate limiting (in production, use Redis)
class RateLimitStorage {
  private storage: Map<string, { count: number; resetTime: Date }> = new Map();
```

**El Problema:**
- Rate limits se guardan en un `Map()` de JavaScript (RAM)
- No sobrevive restarts
- En infraestructura escalable (múltiples instancias), cada servidor tiene su propio contador
- Comentario en línea 38 dice "in production, use Redis" pero no está implementado

**Instancias Sin Protección:**
1. **Password Reset:** `passwordResetRateLimit` (5 intentos/15min) - línea 366
2. **Auth:** `apiRateLimit` (100-1000 requests/15min) - línea 336
3. **WhatsApp:** `whatsappRateLimit` (10 ops/min) - línea 342

**Solución Requerida:**
```bash
# Instalar Redis en el servidor:
apt-get install redis-server
# O en Docker:
docker run -d -p 6379:6379 redis:7-alpine
```

**Implement Redis adapter:**
```typescript
// middleware/rateLimiting.ts - agregar:
import redis from "redis";
const redisClient = redis.createClient();
// Usar redisClient en lugar de Map()
```

---

### 🔴 1.3 Webhooks de Pago Sin Verificación de Firma

**Riesgo:** Cualquiera puede simular un webhook de MercadoPago/PayPal y activar suscripciones sin pagar.

**Ubicación:** `/artifacts/api-server/src/routes/subscription-webhooks.ts` líneas 86-163

```typescript
router.post("/mercadopago", async (req, res) => {
  const { type, data } = req.body;
  // ❌ NO VALIDA X-Hub-Signature-256
  // ❌ NO VALIDA que venga de MercadoPago
```

**El Problema:**
- MercadoPago envía `X-Hub-Signature-256` header
- El código **no lo verifica**
- Atacante: `POST /api/webhooks/subscription/mercadopago` con `{"type":"payment", "data":{"id":"...", "status":"approved"}}`
- Resultado: Suscripción activada, tenant gana acceso de pago sin pagar

**Solución Requerida:**
```typescript
// En subscription-webhooks.ts, línea 86:
import crypto from "crypto";

router.post("/mercadopago", async (req, res) => {
  const signature = req.get("X-Hub-Signature-256");
  const rawBody = (req as any).rawBody; // Se captura en app.ts línea 261
  
  if (!signature) {
    logger.error("[Webhook] Missing X-Hub-Signature-256");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("[Webhook] MERCADO_PAGO_WEBHOOK_SECRET not configured");
    return res.status(500).json({ error: "Configuration error" });
  }

  const hash = crypto.createHmac("sha256", secret)
    .update(rawBody || JSON.stringify(req.body))
    .digest("hex");

  const expectedSignature = `sha256=${hash}`;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    logger.warn("[Webhook] Invalid signature");
    return res.status(401).json({ error: "Invalid signature" });
  }
  
  // Procesar webhook...
```

---

### 🔴 1.4 Credenciales de WooCommerce Sin Encriptación Obligatoria

**Riesgo:** API keys de WooCommerce, tokens de Facebook se guardan en texto plano en la base de datos.

**Ubicación:** 
- `/lib/db/src/schema/tenants.ts` líneas 35-39 (paymentMethods, woocommerceIntegration)
- `/artifacts/api-server/src/routes/woocommerce.ts` líneas 94-101

```typescript
// tenants.ts:
paymentMethods: jsonb("payment_methods").$type<{
  mercadopago?: { accessToken: string; enabled: boolean };
  paypal?: { clientId: string; clientSecret: string; ... };
}>(),

woocommerceIntegration: jsonb("woocommerce_integration").$type<{
  consumerKey?: string;
  consumerSecret?: string;
}>(),
```

**El Problema:**
- Las credenciales se guardan directamente en JSONB sin encriptación
- Si alguien accede a la BD, tiene los tokens de todos los negocios
- El `.env` contiene `CREDENTIALS_ENCRYPTION_KEY` pero se menciona como opcional

**Solución Requerida:**
```typescript
// Crear middleware de encriptación:
// lib/crypto.ts
import crypto from "crypto";

const encryptionKey = Buffer.from(
  process.env.CREDENTIALS_ENCRYPTION_KEY || crypto.randomBytes(32),
  "hex"
);

export function encryptCredential(value: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  let encrypted = cipher.update(value, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

export function decryptCredential(encrypted: string): string {
  const [iv, tag, ciphertext] = encrypted.split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
```

Y **MAKDE OBLIGATORIO CREDENTIALS_ENCRYPTION_KEY:**
```env
# .env.example
CREDENTIALS_ENCRYPTION_KEY=python -c "import secrets; print(secrets.token_hex(32))"
```

---

### 🔴 1.5 Autenticación: No Hay Protección Contra Brute Force

**Riesgo:** Atacante puede probar 10,000 contraseñas por minuto contra un email.

**Ubicación:** `/artifacts/api-server/src/routes/auth.ts` líneas 138-195 (POST /login)

```typescript
router.post("/login", async (req, res, next) => {
  const { email, password } = loginSchema.parse(req.body);
  // ❌ NO TIENE RATE LIMIT
  // ❌ NO BLOQUEA DESPUÉS DE N INTENTOS FALLIDOS
```

**Comparación:**
- `/auth/request-password-reset` SÍ tiene `passwordResetRateLimit` (5/15min) ✓
- `/auth/login` NO tiene rate limit ✗

**Solución Requerida:**
```typescript
import { passwordResetRateLimit } from "../middleware/rateLimiting";

// Crear nuevo rate limit para login:
export const loginRateLimit = rateLimitingMiddleware.createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  maxRequests: 5, // 5 intentos
  keyGenerator: (req) => `login_${req.ip}_${(req.body as any)?.email || ""}`
});

// En auth.ts:
router.post("/login", loginRateLimit, async (req, res, next) => {
  // ...
```

---

## 2. FUNCIONALIDADES DE DEMO ⚠️

### ✓ 2.1 WhatsApp Connection - FUNCIONA

**Estado:** Implementado y activo

**Evidencia:**
- `/artifacts/api-server/src/routes/whatsapp.ts` líneas 25-46 (connect/disconnect)
- Usa Baileys (WhatsApp Web API)
- QR pairing y phone number pairing implementados (líneas 82-108)
- Multi-tenant: cada tenant tiene su propia instancia (whatsapp-factory.ts)

**Prueba recomendada:**
```bash
curl -X POST http://localhost:3002/api/whatsapp/connect \
  -H "Cookie: tenant_id=s%3A1" \
  -H "Content-Type: application/json"

# Respuesta esperada:
# { "status": "connecting", "qr": "data:image/..." }
```

---

### ✓ 2.2 Agente IA Responde Mensajes - FUNCIONA

**Estado:** Implementado con fallback de proveedores IA

**Evidencia:**
- `/artifacts/api-server/src/lib/agent.ts` - orquestador de respuestas
- Soporta: OpenCode (free), Groq, GitHub Models
- Fallback automático si un proveedor falla
- Templates de agentes: `lib/agent-templates.ts`

**Configuración en .env:**
```env
OPENCODE_API_KEY=your_key
GROQ_API_KEY=gsk_...
GITHUB_TOKEN=ghp_...
```

**Prueba:**
```bash
curl -X POST http://localhost:3002/api/whatsapp/test-ia \
  -H "Cookie: tenant_id=s%3A1" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hola, qué productos tienen?"}'
```

---

### ✓ 2.3 Conversaciones Guardadas en BD - FUNCIONA

**Estado:** Implementado con filtrado por tenant

**Evidencia:**
- Schema: `lib/db/src/schema/conversations.ts` y `messages.ts`
- Rutas: `GET /api/conversations`, `GET /api/conversations/:id/messages`
- Tenantization: línea 66 - `eq(conversations.tenantId, tenantId)`

**Validación de seguridad:**
- ✓ Filtra por tenant automáticamente
- ✓ No devuelve mensajes de otros tenants
- ✓ Unread count se reseta al ver conversación

---

### ⚠️ 2.4 Integración WooCommerce - PARCIAL

**Estado:** Configuración y lectura OK, automatización incompleta

**Implementado:**
- ✓ Guardar credenciales (PUT /api/woocommerce/config)
- ✓ Leer productos (GET /api/woocommerce/products)
- ✓ Test de conexión (POST /api/woocommerce/test-connection)

**No Implementado:**
- ❌ Crear órdenes automáticamente desde WhatsApp
- ❌ Sincronización bidireccional de inventario
- ❌ Webhooks de cambios de stock

**Ubicación incompleta:** `/artifacts/api-server/src/routes/woocommerce.ts`

---

### ✓ 2.5 Sistema de Planes/Suscripción - FUNCIONA

**Estado:** Estructura completa, pero necesita validaciones de webhook

**Planes Definidos:**
```typescript
// middleware/saasValidation.ts líneas 14-102
basic:     $0   (7 días trial)  - 30 msgs, 20 chats, 10 productos, 1 agente
starter:   $15  (30 días trial) - 1500 msgs, 150 chats, 75 productos, 2 agentes
premium:   $45  (30 días trial) - 6000 msgs, 600 chats, 300 productos, 5 agentes
professional: $65 (30 días trial) - 15000 msgs, 1500 chats, 750 productos, 8 agentes
```

**Pagos Implementados:**
- ✓ MercadoPago webhook (aunque sin verificación ⚠️)
- ✓ PayPal webhook (aunque sin verificación ⚠️)
- ✓ Almacenamiento de transacciones (payments, subscriptions)
- ✓ Validación de planes en middleware (líneas 107-194 saasValidation.ts)

**Rutas de Pricing:**
- GET `/api/pricing` - Lista planes públicos
- GET `/api/pricing/:plan` - Detalles de plan
- POST `/api/pricing/upgrade` - Cambiar de plan (requiere sesión)
- GET `/api/pricing/current/info` - Plan actual del usuario

---

## 3. MONETIZACIÓN ⚠️

### ✓ 3.1 Página de Pricing - EXISTE Y ESTÁ PULIDA

**Ubicación:** `/artifacts/ventas-pro/src/pages/pricing.tsx`

**Características:**
- ✓ Muestra 4 planes activos
- ✓ Selector de ciclo de facturación (mensual, trimestral, anual)
- ✓ Descuentos: 10% trimestral, 20% anual
- ✓ Botón "Actualizar plan" redirige a MercadoPago/PayPal
- ✓ Taglines por plan (por qué elegir cada uno)

**UI/UX:**
- ✓ Animaciones suaves
- ✓ Responsive (mobile-friendly)
- ✓ Badges de features por plan

---

### ✓ 3.2 Integración de Pagos - PARCIALMENTE VALIDADA

**MercadoPago:**
- ✓ Credenciales esperadas: `MERCADO_PAGO_PUBLIC_KEY`, `MERCADO_PAGO_ACCESS_TOKEN`
- ✓ Webhook endpoint: POST `/api/webhooks/subscription/mercadopago`
- ❌ Sin verificación de firma (bloqueador crítico #3)

**PayPal:**
- ✓ Credenciales esperadas: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE` (sandbox/live)
- ✓ Webhook endpoint: POST `/api/webhooks/subscription/paypal`
- ❌ Sin verificación de firma (bloqueador crítico #3)

---

### ✓ 3.3 Límites por Plan - VALIDADOS EN MIDDLEWARE

**Feature Limits Middleware:**
`/artifacts/api-server/src/middleware/featureLimits.ts`

**Qué valida:**
1. **maxProducts**: Bloquea POST /products si alcanza límite (línea 64)
2. **maxAgents**: Bloquea POST /agents si alcanza límite
3. **maxConversations**: Bloquea POST /conversations si alcanza límite
4. **monthlyMessages**: Valida en `checkMessageLimit()` (línea 91)
5. **apiCallsPerMinute**: Rate limit en `createRateLimit()` (línea 174)

**Cómo funciona:**
```sql
-- Cuenta cuántos productos/agentes/chats tiene el tenant:
SELECT count(*) FROM products WHERE tenant_id = :tenantId
-- Si count >= plan.maxProducts, rechaza con 403:
{
  "error": "Feature limit reached",
  "message": "Alcanzaste el límite de 10 productos...",
  "action": "upgrade_plan"
}
```

**Problema:** Usa in-memory count en rateLimiting.ts (línea 94) que se pierde en restart.

---

### ✓ 3.4 Control de Acceso a Features - FUNCIONA

**Dónde se Valida:**

| Ruta | Validación | Línea |
|------|-----------|-------|
| POST /products | validateFeatureLimits("products") | app.ts:564 |
| POST /agents | validateFeatureLimits("agents") | app.ts:571 |
| POST /conversations | validateFeatureLimits("conversations") | app.ts:578 |
| POST /conversations/:id/messages | validateMessageLimit() | app.ts:589 |
| Cualquier ruta /api | validateSaasPlan() | app.ts:560 |

**VIP Admin Bypass:**
```typescript
// saasValidation.ts líneas 124-134
const isVIP = !!tenant.isAdmin;
if (isVIP) {
  // Le da permisos de "enterprise" sin cobrar
  (req as any).saas = {
    plan: "enterprise",
    planDetails: SAAS_PLANS.enterprise,
    isTrialExpired: false,
  };
}
```

---

## 4. PERFORMANCE Y ESCALABILIDAD ⚠️

### ✓ 4.1 Base de Datos - BIEN DISEÑADA

**Stack:**
- ✓ PostgreSQL en producción (lib/db/src/index.ts:30)
- ✓ SQLite en desarrollo local
- ✓ Drizzle ORM (queries type-safe, sin inyección SQL)
- ✓ Foreign keys con cascada (products → tenants, etc.)

**Esquema Completo:**
```
tenants                 (usuarios/cuentas)
├── conversations      (chats por WhatsApp)
│   └── messages      (mensajes en cada chat)
├── products          (catálogo)
├── agents            (bots de IA)
├── subscriptions     (suscripciones activas)
├── payments          (historial de pagos)
└── leads             (prospectos)
```

---

### ⚠️ 4.2 Caché - NO IMPLEMENTADO

**Problema:** 
- No hay Redis/Memcached
- Rate limiting pierde estado en restart
- Queries a BD se repiten (sin caché)

**Ejemplo:**
```typescript
// Cada request hace esta query:
const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId))
```

**Recomendación:**
```bash
# Instalar Redis:
docker run -d -p 6379:6379 redis:7-alpine

# Usar en app:
import redis from "redis";
const cache = redis.createClient();
const cacheKey = `tenant:${tenantId}`;
const cached = await cache.get(cacheKey);
if (cached) return JSON.parse(cached);
// ... fetch from DB
```

---

### ⚠️ 4.3 Multi-Tenant - INCOMPLETO

**Bien Implementado:**
- ✓ Tenant segregation en conversaciones/productos/agentes
- ✓ WhatsApp: cada tenant tiene su propia sesión (whatsapp-factory.ts)
- ✓ Sesión autenticada por cookie firmado (tenant_id)

**Problemas:**
- ❌ Si la BD tiene capacidad para 100k usuarios pero el servidor WhatsApp cae, todos se caen
- ❌ No hay isolación de procesos por tenant (un bug en un agente del tenant A afecta al B)

**Arquitectura Actual (Single-Process):**
```
Cliente A ─┐
Client B   ├─> Express Server
Client C ─┤    (1 instancia)
           ├─> WhatsApp Manager
           │   (multi-tenant en memoria)
           └─> Base de Datos
```

**Recomendación Para Escalar:**
```
Tenant 1 ──┐
Tenant 2 ──┼─> API Load Balancer (nginx)
Tenant 3 ──┤   ├─> Express Instance 1
Tenant 4 ──┤   ├─> Express Instance 2
           ├─> Redis (sesiones compartidas)
           ├─> PostgreSQL (datos)
           └─> WhatsApp Pool (1 instancia por tenant)
```

---

### ✓ 4.4 Rate Limiting - PRESENTE (pero sin Redis)

**Implementado:**
- ✓ API Rate Limit: 100 requests/15min
- ✓ Conversation Rate Limit: 30 messages/min
- ✓ Password Reset: 5 intentos/15min
- ✓ WhatsApp Ops: 10/min
- ✓ Cost tracking (estimado en $0.002/AI call)

**Problema:** En-memory storage (línea 38-131 rateLimiting.ts)

---

## 5. UX/UI PARA CONVERSIÓN 💡

### ✓ 5.1 Landing Page - PULIDA Y FUNCIONAL

**Ubicación:** `/artifacts/ventas-pro/src/pages/landing.tsx`

**Secciones:**
- ✓ Hero: Propuesta de valor clara ("La IA vende de verdad")
- ✓ Demostración interactiva: Chat simulado (DEMO_SCRIPT)
- ✓ Features: 8 características principales con iconos
- ✓ Pricing: Botones de "Comenzar" y "Actualizar plan"
- ✓ CTA: "Prueba gratis por 7 días"
- ✓ Animaciones: Fondos degradados, iconos flotantes

**Conversión:**
- ✓ Flujo claro: Landing → Registro → WhatsApp Setup → Inicio

---

### ✓ 5.2 Onboarding - IMPLEMENTADO

**Ubicación:** `/artifacts/ventas-pro/src/pages/onboarding.tsx`

**Pasos:**
1. Configurar nombre del negocio y agente
2. Conectar WhatsApp (QR o phone number)
3. Subir primer producto
4. Invitar a equipo (opcional)

---

### ✓ 5.3 Dashboard - COMPLETO

**Ubicación:** `/artifacts/ventas-pro/src/pages/dashboard.tsx`

**Widgets:**
- ✓ Conversaciones activas (con unread count)
- ✓ Últimos mensajes
- ✓ Analíticas de conversión
- ✓ Top productos
- ✓ Estado de WhatsApp

---

### ✓ 5.4 Páginas Clave para Monetización

| Página | Estado | Ruta |
|--------|--------|------|
| Login/Register | ✓ Completa | `/auth` |
| Pricing | ✓ Completa | `/pricing` |
| Dashboard | ✓ Completa | `/dashboard` |
| Productos | ✓ Completa | `/products` |
| Conversaciones | ✓ Completa | `/conversations` |
| Configuración | ✓ Completa | `/settings` |
| Mi Tienda | ✓ React Nativa | `/mi-tienda` |
| Agentes | ✓ Completa | `/agents` |

---

## 6. ARQUITECTURA GENERAL

### Estructura del Código

```
artifacts/
├── api-server/              (Backend Express + TypeScript)
│   ├── src/
│   │   ├── index.ts        (Punto de entrada, carga .env)
│   │   ├── app.ts          (Servidor Express, middlewares)
│   │   ├── routes/         (34 routers)
│   │   │   ├── auth.ts     (Login, registro, password reset)
│   │   │   ├── payments.ts (Salud del sistema de pagos)
│   │   │   ├── pricing.ts  (Planes, upgrade, webhooks)
│   │   │   ├── whatsapp.ts (Conexión, desconexión, pairing)
│   │   │   ├── conversations.ts (Chats, mensajes, filtro tenant)
│   │   │   ├── woocommerce.ts (Integración)
│   │   │   └── ...
│   │   ├── lib/
│   │   │   ├── agent.ts    (Orquestador de respuestas IA)
│   │   │   ├── whatsapp-factory.ts (Multi-tenant WhatsApp)
│   │   │   ├── subscription-payments.ts (Gestión de suscripciones)
│   │   │   └── ...
│   │   └── middleware/
│   │       ├── rateLimiting.ts (Rate limits + cost tracking)
│   │       ├── saasValidation.ts (Validación de planes)
│   │       └── featureLimits.ts (Límites por plan)
│   └── package.json
│
├── ventas-pro/              (Frontend React + Vite)
│   ├── src/
│   │   ├── pages/           (24 páginas/rutas)
│   │   ├── components/      (Componentes UI reutilizables)
│   │   └── hooks/           (Custom React hooks)
│   └── package.json
│
└── opencode-proxy/          (Proxy para IA providers)
    └── ...

lib/
├── db/                      (Drizzle ORM + Schema)
│   ├── src/
│   │   ├── index.ts        (Exporta DB, schema)
│   │   ├── schema/         (28 tablas PostgreSQL/SQLite)
│   │   ├── sqlite-schema/  (Equivalente para SQLite)
│   │   └── migrations/
│   └── drizzle.config.ts   (Configuración ORM)
└── ...
```

---

## 7. CONFIGURACIÓN REQUERIDA

### Producción - Variables de Entorno Críticas

```env
# ========== OBLIGATORIAS EN PRODUCCIÓN ==========
COOKIE_SECRET=<python -c "import secrets; print(secrets.token_hex(32))">
CREDENTIALS_ENCRYPTION_KEY=<igual método>
DATABASE_URL=postgres://user:pass@host:5432/dbname
OPENCODE_API_KEY=tu_clave_ia
ADMIN_EMAIL=admin@tudominio.com
ADMIN_PASSWORD=contraseña_segura

# ========== PAGOS ==========
MERCADO_PAGO_PUBLIC_KEY=APP_USR_...
MERCADO_PAGO_ACCESS_TOKEN=APP_USR-...
MERCADO_PAGO_WEBHOOK_SECRET=<webhook secret desde panel MP>
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_MODE=live

# ========== EMAIL ==========
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_email@gmail.com
SMTP_PASS=tu_app_password
EMAIL_FROM=noreply@tuapp.com

# ========== SECURITY ==========
NODE_ENV=production
PORT=3002
CORS_ORIGIN=https://tudominio.com
APP_URL=https://tudominio.com

# ========== WHATSAPP ==========
WA_BROWSER_NAME=Chrome
WA_BROWSER_VERSION=130.0.0.0
WA_MAX_MSGS_PER_HOUR=40
WA_MAX_MSGS_PER_DAY=300
ADMIN_PHONE=573001234567
```

---

## 8. PRUEBAS RECOMENDADAS

### Security Audit Checklist

- [ ] COOKIE_SECRET obligatorio en .env (exit si falta)
- [ ] Rate limits persisten en Redis
- [ ] Webhook signatures verificadas (HMAC-SHA256)
- [ ] Credenciales encriptadas en BD
- [ ] CSRF tokens en formularios (si aplica)
- [ ] Headers de seguridad (HSTS, CSP, X-Frame-Options)
- [ ] SQL injection: Todas las queries usan Drizzle + parámetros
- [ ] XSS: inputs sanitizados, markdown acotado

### Functional Tests

```bash
# 1. Auth Flow
curl -X POST http://localhost:3002/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test123!","name":"Test","brandName":"Mi Tienda","slug":"mi-tienda"}'

# 2. WhatsApp Connection
curl -X POST http://localhost:3002/api/whatsapp/connect \
  -H "Cookie: tenant_id=s%3A1" \
  -H "Content-Type: application/json"

# 3. Create Product
curl -X POST http://localhost:3002/api/products \
  -H "Cookie: tenant_id=s%3A1" \
  -H "Content-Type: application/json" \
  -d '{"name":"Curso Java","price":"49.99"}'

# 4. Get Conversations
curl -X GET http://localhost:3002/api/conversations \
  -H "Cookie: tenant_id=s%3A1"

# 5. Upgrade Plan (simular)
curl -X POST http://localhost:3002/api/pricing/upgrade \
  -H "Cookie: tenant_id=s%3A1" \
  -H "Content-Type: application/json" \
  -d '{"newPlan":"starter","billingCycle":"monthly","paymentMethod":"mercadopago"}'
```

---

## 9. RESUMEN DE BLOQUEADORES

| # | Problema | Severidad | Impacto | Línea | Fix |
|---|----------|-----------|--------|-------|-----|
| 1 | COOKIE_SECRET no validado | 🔴 CRÍTICO | Sesiones falsificables | app.ts:245 | Obligatorio en prod |
| 2 | Rate limits en memoria | 🔴 CRÍTICO | Brute force posible | rateLimiting.ts:38 | Implementar Redis |
| 3 | Webhooks sin verificación | 🔴 CRÍTICO | Subscripciones gratuitas fraudulentas | subscription-webhooks.ts:86 | HMAC-SHA256 |
| 4 | Credenciales sin encripción | 🔴 CRÍTICO | Fuga de tokens (FB, WooCommerce) | tenants.ts:35 | AES-256-GCM |
| 5 | No hay rate limit en login | 🔴 CRÍTICO | Brute force de contraseñas | auth.ts:138 | Añadir middleware |
| 6 | Falta 2FA para admin | ⚠️ ALTO | Cuenta admin comprometida = juego termina | auth.ts | TOTP/SMS |
| 7 | No hay caché de sesiones | ⚠️ ALTO | Performance baja con 1000+ usuarios | app.ts | Redis sessions |
| 8 | Logs contienen datos sensibles | ⚠️ ALTO | Fuga de info en logs | logger en rutas | Redactar PII |
| 9 | Sin pruebas automatizadas | ⚠️ ALTO | Cambios rompen funcionalidades | test/ está vacío | Jest + Playwright |
| 10 | Falta HTTPS redirect | ⚠️ ALTO | MITM posible | app.ts | Forzar HTTPS |

---

## 10. PLAN DE MITIGACIÓN (Orden de Urgencia)

### Fase 0: Bloqueadores (ANTES de vender)
**Tiempo estimado: 3-5 días**

1. **Validar COOKIE_SECRET** (2h)
   - Hacer obligatorio en producción
   - Exit si falta

2. **Implementar Redis** (4h)
   - Instalar Redis
   - Migrar rate limiting

3. **Webhooks HMAC** (3h)
   - Verificar X-Hub-Signature-256 en MP/PP
   - Rechazar requests sin firma válida

4. **Encriptar credenciales** (4h)
   - AES-256-GCM para WooCommerce, Facebook tokens
   - Migración de datos existentes

5. **Rate limit en login** (1h)
   - Reutilizar rateLimitingMiddleware
   - 5 intentos/15min por IP + email

### Fase 1: Security Hardening (Primeros 2 Meses)
**Tiempo estimado: 2 semanas**

6. Activar 2FA para admin (1 semana)
7. Añadir CSRF tokens (1 semana)
8. Security headers (HSTS, CSP, etc.) (2 días)
9. Encriptación de logs (PII redaction) (3 días)
10. WAF: Rate limit extremo en /auth (1 día)

### Fase 2: Quality (Después de Primera Venta)
**Tiempo estimado: 4 semanas**

11. Suite de tests automatizados (2 semanas)
12. Monitoreo y alertas (1 semana)
13. Backups automáticos de BD (3 días)
14. APM (Application Performance Monitoring) (3 días)
15. Documentación API (OpenAPI/Swagger) (1 semana)

---

## 11. CHECKLIST ANTES DE MONETIZAR

- [ ] COOKIE_SECRET es obligatorio en .env
- [ ] Redis está corriendo en producción
- [ ] Webhooks de MP/PayPal verifican HMAC
- [ ] Credenciales están encriptadas (AES-256-GCM)
- [ ] Login tiene rate limit (5/15min)
- [ ] HTTPS está forzado (app.use(enforce HTTPS))
- [ ] Logs NO contienen passwords/tokens
- [ ] Base de datos tiene backups diarios
- [ ] admin@example.com fue cambiado
- [ ] CORS_ORIGIN apunta a tu dominio real
- [ ] Prueba de pago end-to-end en sandbox MP/PayPal

---

## CONCLUSIÓN

**Agent-Sales-Bot está en 70% de completitud para monetización.** Las funcionalidades core (IA, WhatsApp, planes, pagos) están bien implementadas, pero **5 defectos críticos de seguridad bloqueadores impiden vender dinero real.** Todos son corregibles en 3-5 días.

**Veredicto:** ✅ Potencial Alto, ⏰ Necesita Sprint de 1 Semana

---

**Auditoría completada por:** Claude Code  
**Fecha:** 31 de Julio de 2026
