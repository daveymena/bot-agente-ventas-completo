# Mejoras Implementadas - VentasPro SaaS

## 1. 🔧 Problema de QR Sincronización Resuelta

### Diagnóstico del Problema
El QR de WhatsApp se quedaba en estado "synchronizing" infinitamente debido a:
- Timeouts insuficientes en la conexión WebSocket
- Falta de reintentos en la inicialización
- No se manejaban correctamente los estados intermedios de Baileys

### Solución Implementada
- ✅ Timeout aumentado de 6s a 30s para conexiones lentas
- ✅ Sistema de reintentos automáticos (3 intentos)
- ✅ Mejor manejo de estados: connecting → qr → connected
- ✅ Detección de errores de red vs errores de protocolo
- ✅ Endpoint `/api/whatsapp/network-check` para diagnóstico

## 2. 🏢 Variables SaaS Multi-Tenant

### Problema
Las variables de configuración (Facebook, Pagos, Email) estaban en `.env` global,
no permitían configuración por tenant en el dashboard.

### Solución: Schema Extendido
Se agregaron campos al schema `tenants` para que cada tenant configure:

```typescript
// PAGOS por tenant
paymentMethods: {
  mercadopago?: { accessToken: string; publicKey: string; enabled: boolean };
  paypal?: { clientId: string; clientSecret: string; mode: "sandbox" | "live"; enabled: boolean };
  transfer?: { enabled: boolean; accounts: Array<{ type: string; number: string; name: string }> };
}

// FACEBOOK por tenant
facebookIntegration: {
  appId?: string;
  appSecret?: string;
  pageId?: string;
  pageAccessToken?: string;
  adAccountId?: string;
  webhookVerifyToken?: string;
  enabled: boolean;
}

// EMAIL/SMTP por tenant
emailConfig: {
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  emailFrom?: string;
  emailTo?: string;
  enabled: boolean;
}

// API KEYS personalizadas por tenant
apiKeys: {
  openai?: string;
  groq?: string;
  nvidia?: string;
  opencode?: string;
}
```

### Migración de Datos
Script de migración incluido para:
- Migrar valores de `.env` al tenant 1 (daveymena16)
- Mantener compatibilidad con variables globales como fallback
- Nuevos tenants empiezan con configuración vacía

## 3. 👤 Usuario Admin vs Tenants Regulares

### Problema
No había distinción clara entre:
- El admin de la plataforma (daveymena16)
- Los tenants regulares (otros usuarios SaaS)

### Solución: Campo `isAdmin`

```typescript
// En schema tenants
isAdmin: boolean("is_admin").notNull().default(false)
```

**Permisos del Admin:**
- ✅ Ver todas las instancias WhatsApp: `GET /api/whatsapp/instances`
- ✅ Ver métricas globales: `GET /api/whatsapp/metrics`
- ✅ Limpiar instancias: `POST /api/whatsapp/cleanup`
- ✅ Controlar cualquier tenant: `POST /api/whatsapp/instances/:id/start`
- ✅ Acceder a logs del sistema
- ✅ Gestionar planes y suscripciones

**Tenants Regulares:**
- Solo ven y controlan su propia sesión de WhatsApp
- Solo ven sus propios productos, conversaciones, analytics
- No acceden a rutas de administración global

## 4. 🌐 Configuración Dual: Local + Servidor

### Problema
No se podía trabajar localmente con las mismas credenciales que en producción.

### Solución: Sistema de Fallback en Cascada

```typescript
// Orden de prioridad para configuración
1. Tenant settings (desde DB) - MÁXIMA PRIORIDAD
2. Variables .env específicas del tenant: TENANT_1_FB_APP_ID
3. Variables .env globales: FB_APP_ID
4. Valores por defecto (solo para desarrollo)
```

**Archivos de Configuración:**
- `.env` - Desarrollo local (con tus credenciales)
- `.env.easypanel.optimizado` - Producción (template)
- Variables de entorno en Easypanel (producción real)

**Ejemplo de uso:**

```bash
# Desarrollo local (.env)
USE_SQLITE=true
FB_APP_ID=tu_app_id_local
OPENCODE_API_KEY=tu_key_local

# El tenant 1 (admin) hereda estas variables
# Otros tenants (2, 3, 4...) deben configurar en dashboard
```

```bash
# Producción (Easypanel)
USE_SQLITE=false
DATABASE_URL=postgres://...
FB_APP_ID=produccion_app_id

# El tenant 1 puede sobrescribir via dashboard
# Otros tenants configuran independientemente
```

## 5. 📋 Estándares y Mejores Prácticas

### Seguridad
- ✅ Credenciales encriptadas en BD (CREDENTIALS_ENCRYPTION_KEY)
- ✅ Cookies firmadas (COOKIE_SECRET)
- ✅ Validación de permisos por tenant
- ✅ `requireAdmin()` middleware para rutas sensibles
- ✅ Headers de seguridad (securityShield)

### Multi-Tenancy
- ✅ Aislamiento de datos por tenant
- ✅ Auth folders separados para WhatsApp: `/data/whatsapp-tenants/tenant-{id}/`
- ✅ Middlewares: `resolveTenant` → `validateSaasPlan` → `validateUsageLimits`
- ✅ Límites por plan (basic, professional, premium, enterprise)

### Base de Datos
- ✅ Modo dual: SQLite (desarrollo) + PostgreSQL (producción)
- ✅ Script de migración: `scripts/migrate-to-pg.mjs`
- ✅ Drizzle ORM con tipos TypeScript
- ✅ Pool de conexiones optimizado

### API & Frontend
- ✅ React Query para cache y sincronización
- ✅ Zod schemas para validación
- ✅ Generación automática de tipos
- ✅ ESM throughout (Node 22+)

## 6. 🚀 Endpoints Nuevos

### Configuración de Tenant

```typescript
// GET /api/tenants/me - Obtener configuración actual
// PUT /api/tenants/me/payment-methods - Actualizar métodos de pago
// PUT /api/tenants/me/facebook - Configurar Facebook integration
// PUT /api/tenants/me/email - Configurar SMTP
// PUT /api/tenants/me/api-keys - Actualizar API keys
```

### WhatsApp Mejorado

```typescript
// GET /api/whatsapp/network-check - Diagnóstico de conectividad
// GET /api/whatsapp/session-info - Info de sesión y archivos auth
// POST /api/whatsapp/connect - Con timeout y reintentos
// POST /api/whatsapp/pair-phone - Con validación mejorada
```

### Admin (solo isAdmin=true)

```typescript
// GET /api/whatsapp/instances - Listar todas las instancias
// GET /api/whatsapp/metrics - Métricas por tenant
// POST /api/whatsapp/cleanup - Limpiar instancias inactivas
// POST /api/whatsapp/instances/:id/dispose - Eliminar instancia específica
```

## 7. 📦 Archivos Modificados

### Schema (lib/db/src/schema/)
- ✅ `tenants.ts` - Campos nuevos para SaaS config

### Backend (artifacts/api-server/src/)
- ✅ `lib/whatsappManagerByTenant.ts` - Timeouts y reintentos
- ✅ `lib/tenantManager.ts` - Helpers para config multi-tenant
- ✅ `routes/whatsapp.ts` - Endpoints mejorados
- ✅ `routes/tenants.ts` - CRUD de configuración SaaS
- ✅ `middleware/requireAdmin.ts` - Validación de admin
- ✅ `app.ts` - Sistema de fallback para variables

### Frontend (artifacts/ventas-pro/src/)
- ✅ `pages/settings-integration.tsx` - Panel de configuración SaaS
- ✅ `components/admin-panel.tsx` - Panel de administración
- ✅ `hooks/useTenantConfig.ts` - React Query hooks

### Scripts
- ✅ `scripts/migrate-env-to-tenant.mjs` - Migrar .env a DB
- ✅ `scripts/create-admin-user.mjs` - Crear usuario admin

## 8. 🔄 Migración: Pasos

### Paso 1: Actualizar Schema

```bash
cd lib/db
pnpm run db:generate
pnpm run db:migrate
```

### Paso 2: Migrar Datos del .env

```bash
node scripts/migrate-env-to-tenant.mjs
```

Esto copia las variables del `.env` actual al tenant 1 en la BD.

### Paso 3: Marcar Admin

```bash
node scripts/create-admin-user.mjs --email=daveymena16@gmail.com
```

### Paso 4: Rebuild

```bash
pnpm run build
pnpm run dev # o restart en producción
```

## 9. 📖 Uso: Dashboard de Configuración

### Como Admin (daveymena16):
1. Login normal
2. Ver panel "Administración" (nuevo)
3. Ver todas las instancias WhatsApp
4. Acceso a métricas globales
5. Configurar tus propias integraciones en "Ajustes"

### Como Tenant Regular:
1. Login normal
2. Ir a "Ajustes" → "Integraciones"
3. Configurar:
   - Facebook (App ID, Page Token, etc)
   - Pagos (Mercado Pago, PayPal, Transferencia)
   - Email (SMTP personalizado)
   - API Keys (OpenAI, Groq, etc)
4. Solo ves tu sesión de WhatsApp (no otras)

## 10. ⚙️ Variables de Entorno Recomendadas

### Desarrollo Local (.env)

```bash
# Base
USE_SQLITE=true
PORT=3002
NODE_ENV=development

# Seguridad
COOKIE_SECRET=genera_uno_aqui
CREDENTIALS_ENCRYPTION_KEY=genera_uno_aqui

# Admin defaults (heredados por tenant 1)
FB_APP_ID=tu_app_id
FB_APP_SECRET=tu_secret
OPENCODE_API_KEY=tu_key
SMTP_USER=tu_email@gmail.com
SMTP_PASS=tu_password
```

### Producción (Easypanel)

```bash
# Base
USE_SQLITE=false
DATABASE_URL=postgres://...
PORT=3002
NODE_ENV=production

# Seguridad (CRÍTICO - genera nuevos)
COOKIE_SECRET=<genera_con_python>
CREDENTIALS_ENCRYPTION_KEY=<genera_con_python>

# Admin defaults (solo fallback)
FB_APP_ID=fallback_app_id
OPENCODE_API_KEY=fallback_key

# Los tenants configuran sus propias credenciales en dashboard
```

## 11. 🎯 Resultado Final

✅ **QR WhatsApp funciona confiablemente** (timeout 30s, 3 reintentos)
✅ **Cada tenant configura sus integraciones** en el dashboard
✅ **Usuario admin** puede gestionar toda la plataforma
✅ **Tenants regulares** aislados, solo ven su información
✅ **Funciona local y servidor** con el mismo código
✅ **Credenciales seguras** (encriptadas en BD)
✅ **Fallback a .env** para desarrollo sin configurar cada tenant

---

**Autor:** Kiro AI  
**Fecha:** 2026-08-02  
**Versión:** 2.0 - SaaS Multi-Tenant
