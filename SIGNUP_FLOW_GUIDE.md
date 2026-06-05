# 📝 Guía Completa: Flujo de Registro y Autenticación

## 🎯 Flujo de Registro Mejorado

### Paso 1️⃣: Crear Cuenta
```
[Formulario de Registro]
├─ Tu Nombre
├─ Nombre de Marca
├─ Email
├─ Slug (URL personalizada)
└─ Contraseña (con validaciones visuales)
   ├─ ✓ Mínimo 8 caracteres
   ├─ ✓ Al menos 1 mayúscula (A-Z)
   └─ ✓ Al menos 1 número (0-9)
```

**Requisitos de Contraseña:**
- ✅ Mínimo 8 caracteres
- ✅ Al menos una mayúscula (A-Z)
- ✅ Al menos un número (0-9)
- ❌ No hay límite máximo
- ❌ No requiere caracteres especiales

**Ejemplo válido:** `Tienda2024` ✅

### Paso 2️⃣: Verificación de Email
Después de registrarse, el usuario ve:
```
[Pantalla de Verificación de Email]
├─ Ingresa el código de 6 dígitos
├─ El código expira en 15 minutos
├─ Botón: "Verificar Email"
├─ Botón: "Reenviar Código"
└─ Botón: "No recibí email"
```

**Si el email llega:**
1. Copia el código de 6 dígitos
2. Pégalo en el campo
3. Haz clic en "Verificar Email"
4. ✅ Se marca como verificado
5. Puedes iniciar sesión

**Si el email NO llega (Fallback):**
1. Espera un poco y revisa spam/promotions
2. Haz clic en "Reenviar Código"
3. Si sigue sin llegar, haz clic en "No recibí email"
4. Puedes continuar sin verificación por ahora
5. Verifica después desde tu panel

### Paso 3️⃣: Inicio de Sesión
```
[Pantalla de Login]
├─ Email
├─ Contraseña
├─ Link: "¿Olvidaste tu contraseña?"
└─ Botón: "Acceder al Panel"
```

## 🔑 Flujo de Recuperación de Contraseña

### Si Olvidó la Contraseña:

**Paso 1: Solicitar Código**
```
Pantalla: "Recuperar Contraseña"
└─ Ingresa tu email
└─ Botón: "Enviar Código"
→ Recibe email con código de 6 dígitos
```

**Paso 2: Verificar Código**
```
Pantalla: "Verificar Código"
└─ Ingresa el código de 6 dígitos
└─ Botón: "Verificar"
→ Si es correcto, va al paso 3
```

**Paso 3: Nueva Contraseña**
```
Pantalla: "Cambiar Contraseña"
├─ Nueva Contraseña
├─ Confirmar Contraseña
└─ Botón: "Cambiar Contraseña"
→ Se validan los requisitos
→ Se envía email de confirmación
→ Login automático
```

## 📧 Emails que Recibe

### 1. Email de Verificación (Registro)
```
Asunto: 🔐 Código de Verificación - VentasPro
Contiene:
├─ Código de 6 dígitos
├─ Válido por 15 minutos
└─ Instrucciones de seguridad
```

### 2. Email de Recuperación (Contraseña)
```
Asunto: 🔑 Recuperación de Contraseña - VentasPro
Contiene:
├─ Código de 6 dígitos
├─ Válido por 15 minutos
└─ Advertencia de seguridad
```

### 3. Confirmación de Cambio (Contraseña)
```
Asunto: ✅ Contraseña Cambiada - VentasPro
Contiene:
├─ Confirmación del cambio
├─ Hora del cambio
└─ Instrucción de contactar soporte si no fue él
```

## 🆘 Solución de Problemas

### ❌ "El email ya está registrado"
- El email ya tiene una cuenta creada
- Usa otro email o recupera la contraseña

### ❌ "El nombre de tienda (slug) ya está en uso"
- Ese slug ya está ocupado
- Elige otro nombre para tu tienda

### ❌ "No recibí el código de verificación"
**Causas posibles:**
1. Está en spam/promotions
2. Fue enviado al email incorrecto
3. El servidor de correo está lento
4. Problema con la configuración SMTP

**Soluciones:**
1. Busca en spam, promotions, otros
2. Revisa que el email sea correcto
3. Espera 5-10 minutos
4. Haz clic en "Reenviar Código"
5. Como último recurso, usa "No recibí email" para continuar

### ❌ "Código incorrecto"
- El código se escribió mal
- El código expiró (15 min)
- Haz clic en "Reenviar Código"

### ❌ "Error conectando con el servidor"
- Problema de conexión a internet
- El servidor está caído
- Intenta de nuevo en unos segundos

### ❌ "Usuario no encontrado" (en Login)
- El email no tiene cuenta
- Crea una cuenta nueva

### ❌ "Contraseña incorrecta" (en Login)
- La contraseña está mal
- Usa "¿Olvidaste tu contraseña?" para recuperar

## 🔐 Medidas de Seguridad

✅ **Implementado:**
- Códigos de 6 dígitos aleatorios
- Expiración en 15 minutos
- Hash SHA256 para contraseñas
- HTTPS en producción
- Cookies seguras (httpOnly)
- Validaciones en cliente y servidor
- Warnings de seguridad en emails

## 📱 Endpoints Disponibles (para desarrolladores)

### Autenticación
```
POST /api/auth/register          → Crear cuenta
POST /api/auth/login             → Iniciar sesión
POST /api/auth/logout            → Cerrar sesión
GET  /api/auth/me                → Obtener sesión actual
```

### Verificación de Email
```
POST /api/auth/verify-email      → Verificar código
POST /api/auth/resend-verification-email → Resend código
```

### Recuperación de Contraseña
```
POST /api/auth/request-password-reset    → Solicitar código
POST /api/auth/verify-reset-code         → Verificar código
POST /api/auth/reset-password            → Cambiar contraseña
```

## 🎯 Flujos Típicos Exitosos

### Flujo A: Registro Normal
```
1. Usuario rellena formulario
2. Servidor envía email
3. Usuario verifica email
4. Usuario inicia sesión
5. ✅ Acceso al panel
```

### Flujo B: Registro sin Email (Fallback)
```
1. Usuario rellena formulario
2. Email falla (no recibido)
3. Usuario hace clic "No recibí email"
4. Sistema hace login automático
5. ✅ Acceso al panel (verificará después)
```

### Flujo C: Recuperación de Contraseña
```
1. Usuario hace clic "¿Olvidaste tu contraseña?"
2. Ingresa email
3. Servidor envía código
4. Usuario verifica código
5. Usuario ingresa nueva contraseña
6. Sistema hace login automático
7. ✅ Acceso al panel
```

## 📊 Estados de la Base de Datos

### Campos de Verificación (tenants table)
```typescript
emailVerified: boolean                   // ¿Email verificado?
emailVerificationCode: string | null     // Código temporal
emailVerificationExpiry: Date | null     // Expira en

passwordResetCode: string | null         // Código de recuperación
passwordResetExpiry: Date | null         // Expira en
```

## 🚀 Próximas Mejoras

- [ ] 2FA (Autenticación de Dos Factores)
- [ ] Login con OAuth (Google, GitHub)
- [ ] Verificación por SMS
- [ ] Cambiar email sin verificación nueva
- [ ] Historial de cambios de contraseña

---

**Última actualización:** 22 de mayo de 2026
**Versión:** 2.0 (Con fallback de email)
