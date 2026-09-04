# Guía de Configuración SaaS Multi-Tenant

Esta guía explica cómo configurar VentasPro como una plataforma SaaS donde cada tenant puede tener sus propias credenciales de Facebook, pagos, email y API keys.

## 📋 Índice

1. [Instalación Inicial](#instalación-inicial)
2. [Configuración del Admin](#configuración-del-admin)
3. [Migración de Datos](#migración-de-datos)
4. [Uso del Dashboard](#uso-del-dashboard)
5. [Variables de Entorno](#variables-de-entorno)
6. [Troubleshooting](#troubleshooting)

---

## 1. 📦 Instalación Inicial

### Paso 1: Instalar dependencias

```bash
pnpm install
```

### Paso 2: Configurar variables de entorno base

Copia el archivo de ejemplo:

```bash
cp .env.example .env
```

Edita `.env` con las configuraciones mínimas:

```bash
# Base de datos (desarrollo local usa SQLite)
USE_SQLITE=true
DATABASE_URL=postgres://user:pass@localhost:5432/ventaspro

# Servidor
PORT=3002
NODE_ENV=development

# Seguridad (CRÍTICO - genera tus propias claves)
# Genera con: python -c "import secrets; print(secrets.token_hex(32))"
COOKIE_SECRET=tu_cookie_secret_aqui
CREDENTIALS_ENCRYPTION_KEY=tu_encryption_key_aqui

# Admin defaults (heredados por tenant 1 si no configura en dashboard)
FB_APP_ID=tu_app_id
FB_APP_SECRET=tu_app_secret
OPENCODE_API_KEY=tu_api_key
```

### Paso 3: Iniciar la aplicación

```bash
# Desarrollo
pnpm run dev

# O producción
pnpm run build
pnpm start
```

En el primer arranque se creará automáticamente:
- Tenant admin (email: `ADMIN_EMAIL` del .env o admin@example.com)
- Base de datos con todas las tablas
- 10 agentes de IA preconfigurados
- Productos de ejemplo (si existe products-full.json)

---

## 2. 👤 Configuración del Admin

### Marcar un usuario como admin

El usuario admin tiene permisos especiales en la plataforma:

```bash
node scripts/create-admin-user.mjs --email=daveymena16@gmail.com
```

O por ID:

```bash
node scripts/create-admin-user.mjs --id=1
```

**Permisos del Admin:**
- ✅ Ver todas las instancias de WhatsApp de todos los tenants
- ✅ Acceder a métricas globales del sistema
- ✅ Limpiar instancias inactivas
- ✅ Gestionar planes y suscripciones
- ✅ Ver logs y diagnósticos del sistema

**Para remover privilegios de admin:**

```bash
node scripts/create-admin-user.mjs --email=user@example.com --remove
```

---

## 3. 🔄 Migración de Datos

Si ya tienes credenciales en el `.env` y quieres migrarlas a la base de datos:

```bash
node scripts/migrate-env-to-tenant.mjs
```

Esto copiará todas las variables del `.env` al tenant 1 en la base de datos:
- Facebook (App ID, Secret, Page Token, etc.)
- Pagos (Mercado Pago, PayPal, Transferencia)
- Email/SMTP (Host, Port, User, Password)
- API Keys (OpenAI, Groq, NVIDIA, OpenCode, etc.)

Para migrar a otro tenant:

```bash
node scripts/migrate-env-to-tenant.mjs --tenant-id=2
```

---

## 4. 💻 Uso del Dashboard

### Para el Admin (daveymena16):

1. **Login:** http://localhost:5173 (dev) o tu dominio
   - Email: `daveymena16@gmail.com`
   - Password: (la que configuraste en `ADMIN_PASSWORD`)

2. **Panel de Administración:**
   - Menú → "Administración"
   - Ver todas las instancias de WhatsApp
   - Métricas globales del sistema
   - Control de instancias por tenant

3. **Configurar tus propias integraciones:**
   - Menú → "Ajustes" → "Integraciones"
   - Configurar Facebook, Pagos, Email, API Keys
   - Estos valores sobrescriben los del `.env`

### Para Tenants Regulares:

1. **Registro:** http://localhost:5173/register
   - Nombre, Email, Password
   - Se crea automáticamente con plan "basic"

2. **Configurar integraciones:**
   - Login → Menú → "Ajustes" → "Integraciones"
   - **Facebook:**
     - App ID y App Secret
     - Page ID y Page Access Token
     - Ad Account ID
     - Webhook Verify Tokens
   - **Pagos:**
     - Mercado Pago: Access Token y Public Key
     - PayPal: Client ID, Secret, Mode (sandbox/live)
     - Transferencia: Número de cuenta, Nombre
   - **Email:**
     - SMTP Host, Port, User, Password
     - Email From, Email To
   - **API Keys:**
     - OpenAI, Groq, NVIDIA, OpenCode, GitHub, Pexels

3. **WhatsApp:**
   - Solo verás tu propia sesión
   - No puedes ver las sesiones de otros tenants

---

## 5. ⚙️ Variables de Entorno

### Sistema de Fallback en Cascada

Orden de prioridad (de mayor a menor):

1. **Configuración en BD (Dashboard)** ← Máxima prioridad
2. **Variables específicas del tenant:** `TENANT_1_FB_APP_ID`
3. **Variables globales:** `FB_APP_ID`
4. **Valores por defecto** (solo desarrollo)

### Variables Disponibles

#### Facebook

```bash
# Globales (fallback para todos)
FB_APP_ID=tu_app_id
FB_APP_SECRET=tu_secret
FB_PAGE_ID=tu_page_id
FB_ACCESS_TOKEN=tu_token
FB_AD_ACCOUNT_ID=tu_ad_account
FB_WEBHOOK_VERIFY_TOKEN=tu_verify_token
FB_MESSENGER_VERIFY_TOKEN=tu_messenger_token

# Específicas de tenant 1
TENANT_1_FB_APP_ID=app_id_tenant_1
TENANT_1_FB_APP_SECRET=secret_tenant_1
# etc...
```

#### Pagos

```bash
# Mercado Pago
MERCADO_PAGO_ACCESS_TOKEN=tu_token
MERCADO_PAGO_PUBLIC_KEY=tu_public_key

# PayPal
PAYPAL_CLIENT_ID=tu_client_id
PAYPAL_CLIENT_SECRET=tu_secret
PAYPAL_MODE=live  # o sandbox

# Transferencia
TRANSFER_NUMBER=573136174267
TRANSFER_NAME=Deiner Mena
```

#### Email/SMTP

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_email@gmail.com
SMTP_PASS=tu_password
EMAIL_FROM=noreply@tudominio.com
EMAIL_TO=notificaciones@tudominio.com
```

#### API Keys

```bash
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
NVIDIA_API_KEY=nvapi-...
OPENCODE_API_KEY=sk-...
OPENCODE_ZEN_API_KEY=sk-...
GITHUB_TOKEN=ghp_...
PEXELS_API_KEY=...
```

### Ejemplo: Configuración Dual

**Desarrollo local (.env):**
```bash
USE_SQLITE=true
FB_APP_ID=test_app_id
OPENCODE_API_KEY=test_key
```

**Producción (Easypanel env vars):**
```bash
USE_SQLITE=false
DATABASE_URL=postgres://...
FB_APP_ID=production_app_id
OPENCODE_API_KEY=production_key
```

Los tenants pueden configurar sus propias credenciales en el dashboard, las cuales tienen prioridad sobre las variables de entorno.

---

## 6. 🔧 Troubleshooting

### Problema: QR de WhatsApp no aparece o se queda sincronizando

**Solución:**
1. Verificar conectividad: `GET /api/whatsapp/network-check`
2. Reiniciar sesión: `POST /api/whatsapp/reset-session`
3. Ver logs en consola del servidor

**Mejoras implementadas:**
- ✅ Timeout aumentado a 30 segundos
- ✅ Sistema de 3 reintentos automáticos
- ✅ Logs detallados de cada intento
- ✅ Diagnóstico de red incluido

### Problema: No puedo ver las configuraciones de integraciones

**Solución:**
1. Verifica que estés logueado: `GET /api/auth/me`
2. Comprueba tu plan: Algunos features requieren plan premium/enterprise
3. Revisa las validaciones: `GET /api/tenant-config/all`

### Problema: Las variables del .env no se aplican

**Solución:**
1. Las configuraciones en el dashboard tienen prioridad sobre .env
2. Para volver a usar .env, borra la configuración en el dashboard
3. O ejecuta: `node scripts/migrate-env-to-tenant.mjs` de nuevo

### Problema: "No tenant found" en requests de API

**Solución:**
1. Verifica que la cookie de sesión esté presente
2. Comprueba que `COOKIE_SECRET` esté configurado
3. Login de nuevo si la sesión expiró
4. Verifica que la ruta no esté en `publicRoutes` de app.ts

### Problema: Admin no puede ver instancias de otros tenants

**Solución:**
```bash
# Marca el usuario como admin
node scripts/create-admin-user.mjs --email=tu_email@gmail.com

# Verifica en la base de datos
SELECT id, email, "isAdmin", plan FROM tenants WHERE email = 'tu_email@gmail.com';
```

---

## 📚 API Endpoints

### Configuración de Tenant

```typescript
// Obtener toda la configuración
GET /api/tenant-config/all

// Facebook
GET /api/tenant-config/facebook
PUT /api/tenant-config/facebook

// Pagos
GET /api/tenant-config/payments
PUT /api/tenant-config/payments

// Email
GET /api/tenant-config/email
PUT /api/tenant-config/email

// API Keys
GET /api/tenant-config/api-keys
PUT /api/tenant-config/api-keys
```

### WhatsApp (mejorado)

```typescript
// Status de conexión
GET /api/whatsapp/status

// Conectar (con reintentos)
POST /api/whatsapp/connect

// Emparejar con teléfono
POST /api/whatsapp/pair-phone
Body: { phoneNumber: "573001234567" }

// Diagnóstico de red
GET /api/whatsapp/network-check

// Info de sesión
GET /api/whatsapp/session-info

// Reiniciar sesión
POST /api/whatsapp/reset-session
```

### Admin Only

```typescript
// Listar todas las instancias
GET /api/whatsapp/instances

// Métricas globales
GET /api/whatsapp/metrics

// Resumen de salud
GET /api/whatsapp/health

// Limpiar instancias inactivas
POST /api/whatsapp/cleanup

// Controlar instancia específica
POST /api/whatsapp/instances/:tenantId/start
POST /api/whatsapp/instances/:tenantId/dispose
```

---

## 🎯 Flujo Recomendado

### Para Desarrollo Local:

1. Configura `.env` con tus credenciales de prueba
2. `pnpm run dev`
3. Login con el admin por defecto
4. Prueba las integraciones
5. Configura otros tenants en el dashboard si necesitas

### Para Producción:

1. Configura variables en Easypanel/servidor
2. Marca el usuario admin: `node scripts/create-admin-user.mjs`
3. Login como admin
4. Configura tus credenciales reales en el dashboard
5. Los nuevos tenants configuran las suyas independientemente

### Para Nuevos Tenants:

1. Registro en `/register`
2. Verificar email (si está habilitado)
3. Login
4. Ir a Ajustes → Integraciones
5. Configurar Facebook, Pagos, Email según necesites
6. Conectar WhatsApp en `/whatsapp`

---

## 🔐 Seguridad

### Credenciales en Base de Datos

Todas las credenciales se guardan encriptadas con `CREDENTIALS_ENCRYPTION_KEY`:
- Tokens de Facebook
- Access tokens de Mercado Pago
- Client secrets de PayPal
- Contraseñas SMTP
- API Keys

**IMPORTANTE:** `CREDENTIALS_ENCRYPTION_KEY` debe ser la misma en todos los reintentos del servidor. Si cambia, las credenciales guardadas anteriormente quedarán indescifrables.

### Cookies de Sesión

Las cookies están firmadas con `COOKIE_SECRET` para prevenir falsificación:
- Nadie puede forjar una cookie con `tenant_id=X` sin conocer el secreto
- Si `COOKIE_SECRET` no está configurado, se genera uno aleatorio (las sesiones no sobreviven reintentos)

### Recomendaciones

```bash
# Genera claves seguras
python -c "import secrets; print('COOKIE_SECRET=' + secrets.token_hex(32))"
python -c "import secrets; print('CREDENTIALS_ENCRYPTION_KEY=' + secrets.token_hex(32))"
```

**En producción:**
- ✅ Configura `COOKIE_SECRET` fijo
- ✅ Configura `CREDENTIALS_ENCRYPTION_KEY` fijo
- ✅ Usa HTTPS siempre
- ✅ Marca solo usuarios confiables como admin
- ✅ Rota credenciales periódicamente

---

## 📞 Soporte

Para problemas o preguntas:
- Email: daveymena16@gmail.com
- WhatsApp: +57 304 274 8687
- Revisa los logs del servidor
- Usa `/api/whatsapp/network-check` para diagnóstico

---

**Versión:** 2.0 - SaaS Multi-Tenant  
**Última actualización:** 2026-08-02
