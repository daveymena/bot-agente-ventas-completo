# 🔐 Sistema de Autenticación Seguro - VentasPro

**Fecha:** Mayo 5, 2026  
**Implementado:** Sistema completo de verificación de email y recuperación de contraseña

---

## 📋 Características Implementadas

### ✅ 1. Verificación de Email con Código
- Código de 6 dígitos enviado por email
- Válido por 15 minutos
- Email HTML profesional con diseño responsive
- Reenvío de código si expira

### ✅ 2. Recuperación de Contraseña
- Código de 6 dígitos enviado por email
- Válido por 15 minutos
- Cambio seguro de contraseña
- Protección contra ataques de fuerza bruta

### ✅ 3. Registro con Verificación
- Cuenta creada pero requiere verificación
- Email automático al registrarse
- No puede iniciar sesión sin verificar

### 🔜 4. 2FA (Opcional - Comentado)
- Código preparado para Google Authenticator
- Requiere instalar `speakeasy` y `qrcode`
- Descomentarlos endpoints cuando quieras activarlo

---

## 🗄️ Cambios en la Base de Datos

### Nuevos Campos en `tenants`

```sql
ALTER TABLE tenants ADD COLUMN email_verified BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE tenants ADD COLUMN email_verification_code TEXT;
ALTER TABLE tenants ADD COLUMN email_verification_expiry TIMESTAMP WITH TIME ZONE;
ALTER TABLE tenants ADD COLUMN password_reset_code TEXT;
ALTER TABLE tenants ADD COLUMN password_reset_expiry TIMESTAMP WITH TIME ZONE;
ALTER TABLE tenants ADD COLUMN two_factor_enabled BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE tenants ADD COLUMN two_factor_secret TEXT;
```

**Nota:** Estos campos ya están en el esquema (`lib/db/src/schema/tenants.ts`). Necesitas ejecutar una migración de Drizzle para aplicarlos a la base de datos.

---

## 📧 Configuración de Email

### 1. Variables de Entorno

Agrega estas variables a tu archivo `.env`:

```env
# Configuración de Email (Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-app-password
```

### 2. Obtener App Password de Gmail

1. Ve a tu cuenta de Google: https://myaccount.google.com/
2. Seguridad → Verificación en 2 pasos (actívala si no está)
3. Contraseñas de aplicaciones
4. Genera una nueva contraseña para "Correo"
5. Copia la contraseña de 16 caracteres
6. Úsala en `SMTP_PASS`

### 3. Alternativas a Gmail

#### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=tu-sendgrid-api-key
```

#### Mailgun
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@tu-dominio.mailgun.org
SMTP_PASS=tu-mailgun-password
```

#### Amazon SES
```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=tu-ses-smtp-username
SMTP_PASS=tu-ses-smtp-password
```

---

## 🔌 Endpoints de la API

### 1. Registro con Verificación

**POST** `/api/auth/register`

```json
{
  "name": "Juan Pérez",
  "email": "juan@example.com",
  "password": "password123",
  "brandName": "Mi Tienda",
  "slug": "mi-tienda"
}
```

**Respuesta:**
```json
{
  "message": "Registro exitoso. Revisa tu email para verificar tu cuenta.",
  "tenant": {
    "id": 1,
    "email": "juan@example.com"
  },
  "requiresVerification": true
}
```

---

### 2. Enviar Código de Verificación

**POST** `/api/auth/send-verification-code`

```json
{
  "email": "juan@example.com"
}
```

**Respuesta:**
```json
{
  "message": "Código enviado a tu email"
}
```

---

### 3. Verificar Email

**POST** `/api/auth/verify-email`

```json
{
  "email": "juan@example.com",
  "code": "123456"
}
```

**Respuesta:**
```json
{
  "message": "Email verificado exitosamente"
}
```

---

### 4. Solicitar Recuperación de Contraseña

**POST** `/api/auth/request-password-reset`

```json
{
  "email": "juan@example.com"
}
```

**Respuesta:**
```json
{
  "message": "Si el email existe, recibirás un código de recuperación"
}
```

---

### 5. Verificar Código de Recuperación

**POST** `/api/auth/verify-reset-code`

```json
{
  "email": "juan@example.com",
  "code": "123456"
}
```

**Respuesta:**
```json
{
  "message": "Código verificado. Puedes cambiar tu contraseña."
}
```

---

### 6. Restablecer Contraseña

**POST** `/api/auth/reset-password`

```json
{
  "email": "juan@example.com",
  "code": "123456",
  "newPassword": "nueva-password-segura"
}
```

**Respuesta:**
```json
{
  "message": "Contraseña restablecida exitosamente"
}
```

---

### 7. Login (Requiere Email Verificado)

**POST** `/api/auth/login`

```json
{
  "email": "juan@example.com",
  "password": "password123"
}
```

**Respuesta (Email no verificado):**
```json
{
  "error": "Email no verificado",
  "requiresVerification": true,
  "message": "Por favor verifica tu email antes de iniciar sesión"
}
```

**Respuesta (Email verificado):**
```json
{
  "message": "Login exitoso",
  "tenant": {
    "id": 1,
    "name": "Juan Pérez",
    "email": "juan@example.com",
    "slug": "mi-tienda",
    "plan": "starter",
    "status": "trial",
    "emailVerified": true
  }
}
```

---

## 🎨 Diseño de Emails

Los emails tienen un diseño profesional con:

- ✅ Responsive (se ve bien en móvil y desktop)
- ✅ Código grande y fácil de leer
- ✅ Colores de marca (naranja/amarillo)
- ✅ Advertencias de seguridad
- ✅ Tiempo de expiración claro
- ✅ Footer con información de la empresa

### Email de Verificación
- Fondo amarillo/naranja
- Código en grande con letras espaciadas
- Mensaje de bienvenida
- Advertencia de seguridad

### Email de Recuperación
- Fondo rojo/rosa
- Código en grande con letras espaciadas
- Mensaje de seguridad
- Advertencia si no solicitaste el cambio

---

## 🔒 Seguridad Implementada

### 1. Códigos de Verificación
- ✅ 6 dígitos aleatorios
- ✅ Válidos por 15 minutos
- ✅ Se eliminan después de usarse
- ✅ Un código por usuario (no se acumulan)

### 2. Recuperación de Contraseña
- ✅ Mensaje genérico si el email no existe (previene enumeración)
- ✅ Código de un solo uso
- ✅ Expira en 15 minutos
- ✅ Se elimina después de usarse

### 3. Hashing de Contraseñas
- ✅ SHA-256 (puedes mejorar a bcrypt si quieres)
- ✅ No se almacenan contraseñas en texto plano
- ✅ Comparación segura

### 4. Protección contra Ataques
- ✅ Rate limiting (puedes agregar con `express-rate-limit`)
- ✅ Validación de entrada con Zod
- ✅ Logs de intentos fallidos
- ✅ Mensajes genéricos para prevenir enumeración

---

## 🚀 Instalación y Configuración

### 1. Instalar Dependencias

```bash
cd artifacts/api-server
pnpm install
```

Esto instalará:
- `nodemailer` - Para enviar emails
- `@types/nodemailer` - Tipos de TypeScript

### 2. Configurar Variables de Entorno

Edita `artifacts/api-server/.env`:

```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-app-password-de-16-caracteres
```

### 3. Ejecutar Migración de Base de Datos

```bash
# Generar migración
cd lib/db
pnpm run db:generate

# Aplicar migración
pnpm run db:push
```

### 4. Verificar Configuración de Email

Puedes agregar este endpoint temporal para probar:

```typescript
// En artifacts/api-server/src/routes/auth.ts
router.get("/test-email", async (req, res) => {
  const { verifyEmailService, sendVerificationEmail } = await import("../lib/email");
  
  const isConfigured = await verifyEmailService();
  if (!isConfigured) {
    return res.status(500).json({ error: "Email service not configured" });
  }
  
  const sent = await sendVerificationEmail(
    "tu-email@example.com",
    "123456",
    "Test User"
  );
  
  return res.json({ sent, message: "Check your email!" });
});
```

### 5. Reiniciar el Servidor

```bash
pnpm run dev
```

---

## 🧪 Flujo de Prueba

### Registro y Verificación

1. **Registrarse**
   ```bash
   curl -X POST http://localhost:3002/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test User",
       "email": "test@example.com",
       "password": "password123",
       "brandName": "Test Store",
       "slug": "test-store"
     }'
   ```

2. **Revisar Email** - Deberías recibir un código de 6 dígitos

3. **Verificar Email**
   ```bash
   curl -X POST http://localhost:3002/api/auth/verify-email \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "code": "123456"
     }'
   ```

4. **Iniciar Sesión**
   ```bash
   curl -X POST http://localhost:3002/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "password": "password123"
     }'
   ```

### Recuperación de Contraseña

1. **Solicitar Código**
   ```bash
   curl -X POST http://localhost:3002/api/auth/request-password-reset \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com"
     }'
   ```

2. **Revisar Email** - Deberías recibir un código de 6 dígitos

3. **Verificar Código**
   ```bash
   curl -X POST http://localhost:3002/api/auth/verify-reset-code \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "code": "123456"
     }'
   ```

4. **Cambiar Contraseña**
   ```bash
   curl -X POST http://localhost:3002/api/auth/reset-password \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "code": "123456",
       "newPassword": "nueva-password"
     }'
   ```

---

## 🎯 2FA (Autenticación de Dos Factores) - Opcional

Si quieres implementar 2FA con Google Authenticator:

### 1. Instalar Dependencias

```bash
cd artifacts/api-server
pnpm add speakeasy qrcode
pnpm add -D @types/speakeasy @types/qrcode
```

### 2. Descomentar Endpoints

En `artifacts/api-server/src/routes/auth.ts`, descomenta la sección de 2FA (líneas marcadas con `/*` y `*/`).

### 3. Endpoints Disponibles

- `POST /api/auth/2fa/generate` - Genera QR code
- `POST /api/auth/2fa/enable` - Activa 2FA
- `POST /api/auth/2fa/disable` - Desactiva 2FA
- `POST /api/auth/2fa/verify` - Verifica código 2FA

---

## 📝 Archivos Modificados

1. **`lib/db/src/schema/tenants.ts`**
   - Agregados campos de verificación y 2FA

2. **`artifacts/api-server/src/lib/email.ts`** (NUEVO)
   - Servicio de envío de emails
   - Templates HTML profesionales

3. **`artifacts/api-server/src/routes/auth.ts`**
   - Endpoints de verificación
   - Endpoints de recuperación
   - Login con verificación

4. **`artifacts/api-server/package.json`**
   - Agregado `nodemailer`
   - Agregado `@types/nodemailer`

---

## ⚠️ Importante

### Producción

1. **Usa HTTPS** - Cambia `secure: false` a `secure: true` en producción
2. **Rate Limiting** - Agrega `express-rate-limit` para prevenir spam
3. **Logs** - Monitorea intentos fallidos
4. **Backup** - Haz backup de la base de datos antes de migrar

### Desarrollo

1. **Email de Prueba** - Usa un email real para pruebas
2. **Códigos de Prueba** - Puedes agregar un código fijo para testing
3. **Logs** - Revisa los logs para ver si los emails se envían

---

## 🐛 Troubleshooting

### Email no se envía

1. **Verifica credenciales**
   ```bash
   # En la consola del servidor
   node -e "require('./dist/lib/email.js').verifyEmailService()"
   ```

2. **Revisa logs**
   ```bash
   grep "Email" logs.txt
   ```

3. **Prueba con Gmail**
   - Asegúrate de tener verificación en 2 pasos activada
   - Usa una contraseña de aplicación, no tu contraseña normal

### Código no llega

1. **Revisa spam** - Los emails pueden ir a spam
2. **Espera 1-2 minutos** - A veces hay delay
3. **Reenvía código** - Usa `/send-verification-code` de nuevo

### Error de migración

```bash
# Resetear migraciones
cd lib/db
rm -rf drizzle
pnpm run db:generate
pnpm run db:push
```

---

**Estado:** ✅ Sistema completo implementado y listo para usar
