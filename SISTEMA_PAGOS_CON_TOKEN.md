# 🎯 Sistema de Pagos con Token de Activación

## ✅ IMPLEMENTACIÓN COMPLETADA

Se ha implementado un sistema de pagos **SIMPLE y EFECTIVO** que elimina el problema de cookies y sesiones.

---

## 🔄 Flujo Completo

### 1️⃣ Usuario Selecciona Plan
- Usuario visita `/pricing`
- Selecciona plan, ciclo (mensual/anual) y método de pago (MercadoPago/PayPal)
- Click en botón "Actualizar con..."

### 2️⃣ Solicitud de Email
- Se abre un diálogo solicitando el email
- Usuario ingresa su email
- Validación de formato de email
- Click en "Continuar al Pago"

### 3️⃣ Generación de Enlace de Pago
**Backend: `/api/pricing/upgrade` (SIN AUTENTICACIÓN)**
```typescript
POST /api/pricing/upgrade
Body: {
  newPlan: "starter",
  billingCycle: "monthly",
  paymentMethod: "mercadopago",
  email: "usuario@email.com"
}
```

**Proceso:**
1. Busca o crea tenant temporal con el email
2. Genera token único de activación (32 caracteres)
3. Crea registro de suscripción con estado "pending"
4. Genera enlace de pago en MercadoPago o PayPal
5. Retorna URL de pago

### 4️⃣ Pago en Plataforma Externa
- Usuario es redirigido a MercadoPago o PayPal
- Completa el pago
- Plataforma redirige a `/subscription-success?email=...`

### 5️⃣ Webhook de Confirmación
**Backend: `/api/webhooks/subscription/mercadopago` o `/paypal`**

Cuando el pago es aprobado:
1. Actualiza suscripción a estado "active"
2. Registra transacción de pago
3. **Envía email con token de activación**

### 6️⃣ Email con Token
**Función: `sendActivationTokenEmail()`**

Email contiene:
- Token de activación (32 caracteres)
- Nombre del plan
- Botón "Activar Mi Cuenta Ahora"
- Link directo: `/activate?token=XXXXX`

### 7️⃣ Activación de Cuenta
**Frontend: `/activate`**

Usuario puede:
- Hacer click en el link del email (token pre-cargado)
- O ingresar el token manualmente

**Backend: `/api/activation/activate`**
```typescript
POST /api/activation/activate
Body: {
  token: "ABCD1234EFGH5678..."
}
```

**Proceso:**
1. Busca suscripción por token
2. Verifica que no haya sido usado
3. Verifica que el pago esté aprobado
4. Actualiza suscripción (marca `activatedAt`)
5. Actualiza tenant (activa plan, marca email verificado)
6. Retorna datos de la cuenta activada

### 8️⃣ Cuenta Activada
- Usuario ve mensaje de éxito
- Redirige a `/auth` para iniciar sesión
- Ya puede usar su plan

---

## 📁 Archivos Modificados/Creados

### Backend
1. **`lib/db/src/schema/subscriptions.ts`**
   - Agregado: `activationToken`, `tokenSentAt`, `activatedAt`

2. **`lib/db/migrations/add_activation_token_to_subscriptions.sql`**
   - Migración ejecutada ✅

3. **`artifacts/api-server/src/lib/email.ts`**
   - Nueva función: `sendActivationTokenEmail()`

4. **`artifacts/api-server/src/lib/subscription-payments.ts`**
   - Función: `generateActivationToken()`
   - Genera token único al crear suscripción

5. **`artifacts/api-server/src/routes/subscription-webhooks.ts`**
   - Función: `sendActivationEmail()`
   - Envía email después del pago exitoso

6. **`artifacts/api-server/src/routes/activation.ts`** ⭐ NUEVO
   - `POST /api/activation/activate` - Activa cuenta con token
   - `GET /api/activation/verify/:token` - Verifica token sin activar

7. **`artifacts/api-server/src/routes/pricing.ts`**
   - Endpoint `/upgrade` ahora NO requiere autenticación
   - Requiere `email` en el body

8. **`artifacts/api-server/src/app.ts`**
   - Ruta `/activation` agregada a rutas públicas
   - Router de activación registrado

### Frontend
1. **`artifacts/ventas-pro/src/pages/pricing.tsx`**
   - Diálogo para solicitar email
   - Validación de email
   - Mensaje sobre token de activación

2. **`artifacts/ventas-pro/src/pages/activate.tsx`** ⭐ NUEVO
   - Página completa de activación
   - Verificación de token
   - Activación de cuenta
   - Mensajes de éxito/error

3. **`artifacts/ventas-pro/src/pages/subscription-success.tsx`**
   - Actualizada con instrucciones sobre token
   - Botón para ir a `/activate`
   - Muestra email donde se envió el token

4. **`artifacts/ventas-pro/src/App.tsx`**
   - Ruta `/activate` agregada

---

## 🎨 Ventajas del Nuevo Sistema

### ✅ Elimina Problema de Cookies
- No requiere sesión activa para iniciar pago
- No hay conflictos entre puertos
- No hay problemas de CORS

### ✅ Flujo Simple
1. Email → Pago → Token → Activación
2. Solo 4 pasos claros
3. Usuario siempre sabe qué hacer

### ✅ Seguridad
- Token único de 32 caracteres
- Token solo se puede usar una vez
- Token vinculado a suscripción específica
- Verificación de pago antes de activar

### ✅ Experiencia de Usuario
- Email con instrucciones claras
- Link directo para activar
- Opción de ingresar token manualmente
- Mensajes de error descriptivos

### ✅ Trazabilidad
- `tokenSentAt` - Cuándo se envió el email
- `activatedAt` - Cuándo se activó la cuenta
- Logs detallados en cada paso

---

## 🧪 Testing del Flujo

### Paso 1: Seleccionar Plan
```bash
# Ir a http://localhost:5173/pricing
# Click en cualquier plan de pago
```

### Paso 2: Ingresar Email
```bash
# Ingresar email válido
# Click en "Continuar al Pago"
```

### Paso 3: Completar Pago
```bash
# Serás redirigido a MercadoPago o PayPal
# Completar el pago de prueba
```

### Paso 4: Verificar Email
```bash
# Revisar email en: deinermena25@gmail.com
# Buscar email con asunto: "🎉 ¡Pago Confirmado! Activa tu Plan..."
# Copiar token de 32 caracteres
```

### Paso 5: Activar Cuenta
```bash
# Opción A: Click en botón del email
# Opción B: Ir a /activate e ingresar token manualmente
```

### Paso 6: Iniciar Sesión
```bash
# Después de activar, ir a /auth
# Iniciar sesión con el email usado
```

---

## 📊 Base de Datos

### Tabla `subscriptions`
```sql
-- Nuevos campos
activation_token TEXT UNIQUE,           -- Token de 32 caracteres
token_sent_at TIMESTAMP WITH TIME ZONE, -- Cuándo se envió
activated_at TIMESTAMP WITH TIME ZONE   -- Cuándo se activó
```

### Índice
```sql
CREATE INDEX idx_subscriptions_activation_token 
ON subscriptions(activation_token);
```

---

## 🔐 Seguridad

### Generación de Token
```typescript
function generateActivationToken(plan: string, subscriptionId: number): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(16).toString("hex");
  const data = `${plan}-${subscriptionId}-${timestamp}-${random}`;
  return crypto.createHash("sha256").update(data).digest("hex").substring(0, 32).toUpperCase();
}
```

**Características:**
- SHA-256 hash
- Incluye plan, subscriptionId, timestamp, random
- 32 caracteres en mayúsculas
- Único por suscripción

### Validaciones
1. ✅ Token existe en BD
2. ✅ Token no ha sido usado (`activatedAt` es null)
3. ✅ Pago está aprobado (`status = 'active'`)
4. ✅ Email válido al solicitar pago

---

## 📧 Configuración de Email

### Variables de Entorno
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=deinermena25@gmail.com
SMTP_PASS=uccj yqpq vqlt vcie
```

### Template de Email
- Diseño profesional con gradientes
- Token destacado en caja especial
- Botón CTA grande
- Instrucciones claras
- Responsive

---

## 🚀 Estado Actual

### ✅ Completado
- [x] Migración de BD ejecutada
- [x] Backend compilado sin errores
- [x] Frontend compilado sin errores
- [x] Endpoint de activación creado
- [x] Página de activación creada
- [x] Email con token implementado
- [x] Flujo completo integrado
- [x] Documentación completa

### 🧪 Pendiente de Testing
- [ ] Probar flujo completo con MercadoPago
- [ ] Probar flujo completo con PayPal
- [ ] Verificar recepción de email
- [ ] Probar activación con token
- [ ] Verificar que el plan se active correctamente

---

## 🎯 Próximos Pasos

1. **Iniciar servidores:**
   ```bash
   # Terminal 1: Backend
   cd artifacts/api-server
   npm run dev

   # Terminal 2: Frontend
   cd artifacts/ventas-pro
   npm run dev
   ```

2. **Probar flujo completo:**
   - Ir a http://localhost:5173/pricing
   - Seleccionar plan Starter
   - Ingresar email real
   - Completar pago de prueba
   - Revisar email
   - Activar con token

3. **Verificar en BD:**
   ```sql
   SELECT id, plan, status, activation_token, token_sent_at, activated_at
   FROM subscriptions
   ORDER BY created_at DESC
   LIMIT 5;
   ```

---

## 💡 Notas Importantes

1. **Token es de un solo uso:** Una vez activado, no se puede reutilizar
2. **Email puede tardar:** Hasta 2-3 minutos en llegar
3. **Revisar spam:** Gmail puede marcar como spam
4. **Token case-insensitive:** Se convierte a mayúsculas automáticamente
5. **Sin expiración:** Token no expira (puede agregarse si se desea)

---

## 🐛 Troubleshooting

### Email no llega
1. Verificar configuración SMTP en `.env`
2. Revisar logs del backend: `[Email]`
3. Verificar carpeta de spam
4. Probar con otro email

### Token inválido
1. Verificar que el token sea exacto (32 caracteres)
2. Verificar que no haya espacios
3. Verificar en BD: `SELECT * FROM subscriptions WHERE activation_token = 'TOKEN'`

### Pago no se confirma
1. Revisar logs del webhook: `[Webhook]`
2. Verificar que el webhook esté configurado en MercadoPago/PayPal
3. Verificar URL del webhook: `https://tu-dominio.com/api/webhooks/subscription/mercadopago`

---

## 📞 Soporte

Si tienes problemas:
1. Revisar logs del backend
2. Verificar estado en BD
3. Contactar al equipo de desarrollo

---

**Fecha de implementación:** 7 de Mayo, 2026
**Versión:** 1.0.0
**Estado:** ✅ COMPLETADO Y LISTO PARA TESTING
