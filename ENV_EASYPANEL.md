# 🔐 Variables de Entorno para Easypanel

## ⚠️ IMPORTANTE

**NO subas este archivo a Git después de agregar tus valores reales.**

Este archivo es una plantilla. Copia las variables a Easypanel directamente.

---

## 📋 Variables de Entorno Completas

Copia y pega estas variables en la sección "Environment Variables" de Easypanel:

```env
# ========== CONFIGURACIÓN DE PRODUCCIÓN ==========
NODE_ENV=production
PORT=3002
HOST=0.0.0.0
LOG_LEVEL=info

# ========== BASE DE DATOS (PostgreSQL) ==========
# Formato: postgres://usuario:password@host:puerto/database
DATABASE_URL=postgres://postgres:6715320Dvd@79.143.187.160:5432/tecnovariedades-db?sslmode=disable

# ========== HERMES AGENT (GitHub Models) ==========
HERMES_URL=http://localhost:5000
GITHUB_TOKEN=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
GITHUB_MODEL=gpt-4o-mini
GITHUB_MODEL_CLAUDE=claude-sonnet-4-20250514

# ========== AI INTEGRATIONS (NVIDIA) ==========
NVIDIA_API_KEY=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
NVIDIA_MODEL=meta/llama-3.1-70b-instruct
AI_FALLBACK_ORDER=nvidia,github,ollama_local

# ========== FALLBACK AI (Ollama Local) ==========
AI_FALLBACK_ENABLED=true
OLLAMA_LOCAL_URL=http://localhost:11434
OLLAMA_LOCAL_MODEL=hermes3:8b

# ========== PAGOS COLOMBIA ==========
# Transferencia bancaria
TRANSFER_NUMBER=3136174267
TRANSFER_NAME=Deiner Mena

# Mercado Pago
MERCADO_PAGO_PUBLIC_KEY=APP_USR-23c2d74a-d01f-473e-a305-0e5999f023bc
MERCADO_PAGO_ACCESS_TOKEN=APP_USR-8419296773492182-072623-ec7505166228860ec8b43957c948e7da-2021591453

# PayPal
PAYPAL_CLIENT_ID=BAAtdQwVN8LvIoRstmHZWlo2ndcJBP8dFZdXLc8HJGdYUXstriO6mO0GJMZimkBCdZHotBkulELqeFm_R4
PAYPAL_CLIENT_SECRET=EP5jZdzbUuHva4I8ERnbNYSHQ_BNe0niXQe91Bvf33Kl88nRKY-ivRx0_PGERS72JbjQSiMr63y9lEEL
PAYPAL_MODE=live

# ========== NOTIFICACIONES (Email SMTP) ==========
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=deinermena25@gmail.com
SMTP_PASS=uccj yqpq vqlt vcie
EMAIL_FROM=deinermena25@gmail.com
EMAIL_TO=daveymena16@gmail.com

# ========== ANTI-BAN & PERFORMANCE ==========
TYPING_DELAY_MIN=800
TYPING_DELAY_MAX=2000
READ_RECEIPT_DELAY=500
HUMAN_PAUSE_MIN=1000
HUMAN_PAUSE_MAX=3000

# ========== GIT ==========
GIT_BRANCH=main
```

---

## 📝 Cómo Agregar en Easypanel

### Método 1: Interfaz Web (Recomendado)

1. **Ve a tu aplicación en Easypanel**
2. **Click en "Environment"** o "Environment Variables"
3. **Agrega cada variable** una por una:
   - Click en "Add Variable"
   - Name: `NODE_ENV`
   - Value: `production`
   - Click "Save"
4. **Repite** para todas las variables

### Método 2: Bulk Import (Si está disponible)

Algunos paneles de Easypanel permiten importar múltiples variables:

1. **Busca la opción "Bulk Import"** o "Import from .env"
2. **Copia todo el bloque** de variables de arriba
3. **Pega** en el campo de texto
4. **Click "Import"**

---

## 🔒 Seguridad

### Variables Sensibles

Estas variables contienen información sensible y **NUNCA** deben subirse a Git:

- ✅ `DATABASE_URL` - Credenciales de base de datos
- ✅ `GITHUB_TOKEN` - Token de acceso a GitHub
- ✅ `NVIDIA_API_KEY` - API key de NVIDIA
- ✅ `MERCADO_PAGO_ACCESS_TOKEN` - Token de Mercado Pago
- ✅ `PAYPAL_CLIENT_SECRET` - Secret de PayPal
- ✅ `SMTP_PASS` - Contraseña de email

### Recomendaciones

1. **Usa variables de entorno** en Easypanel, no las incluyas en el código
2. **Rota las claves** periódicamente
3. **Usa diferentes claves** para desarrollo y producción
4. **Limita los permisos** de las API keys al mínimo necesario

---

## 🔄 Variables Opcionales

Si no usas alguna funcionalidad, puedes omitir estas variables:

### Si NO usas Ollama Local
```env
# Puedes omitir:
OLLAMA_LOCAL_URL
OLLAMA_LOCAL_MODEL
```

### Si NO usas Hermes Agent
```env
# Puedes omitir:
HERMES_URL
```

### Si NO usas PayPal
```env
# Puedes omitir:
PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET
PAYPAL_MODE
```

### Si NO usas Mercado Pago
```env
# Puedes omitir:
MERCADO_PAGO_PUBLIC_KEY
MERCADO_PAGO_ACCESS_TOKEN
```

---

## ✅ Variables Requeridas (Mínimo)

Para que la aplicación funcione, **DEBES** tener al menos:

```env
# Básicas
NODE_ENV=production
PORT=3002
HOST=0.0.0.0

# Base de datos
DATABASE_URL=postgres://usuario:password@host:puerto/database

# AI (al menos una)
GITHUB_TOKEN=tu-token
# O
NVIDIA_API_KEY=tu-api-key

# Email (para notificaciones)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-password-app
EMAIL_FROM=tu-email@gmail.com
```

---

## 🧪 Verificar Variables

Después de configurar las variables en Easypanel:

1. **Despliega la aplicación**
2. **Verifica los logs** para errores de configuración
3. **Prueba el health check**:
   ```bash
   curl https://tu-app.easypanel.host/api/health/system
   ```

El endpoint `/api/health/system` te mostrará el estado de:
- ✅ Base de datos
- ✅ AI services
- ✅ Payment systems
- ✅ Email service

---

## 📊 Formato de Variables Específicas

### DATABASE_URL

Formato PostgreSQL:
```
postgres://usuario:password@host:puerto/database?opciones
```

Ejemplo:
```
postgres://postgres:mipassword@db.example.com:5432/mydb?sslmode=require
```

### SMTP_PASS (Gmail)

Si usas Gmail, necesitas una **App Password**, no tu contraseña normal:

1. Ve a https://myaccount.google.com/security
2. Activa "2-Step Verification"
3. Ve a "App passwords"
4. Genera una contraseña para "Mail"
5. Usa esa contraseña en `SMTP_PASS`

### PayPal Mode

```env
PAYPAL_MODE=sandbox  # Para pruebas
PAYPAL_MODE=live     # Para producción
```

---

## 🔍 Troubleshooting

### Error: "DATABASE_URL is not defined"

**Solución**: Verifica que la variable esté configurada en Easypanel y haz un rebuild.

### Error: "AI service not available"

**Solución**: Verifica que al menos una de estas variables esté configurada:
- `GITHUB_TOKEN`
- `NVIDIA_API_KEY`
- `OLLAMA_LOCAL_URL`

### Error: "Email service failed"

**Solución**: 
1. Verifica que `SMTP_PASS` sea una App Password de Gmail
2. Verifica que `SMTP_USER` y `EMAIL_FROM` sean el mismo email

---

## 📝 Notas Adicionales

### Cambiar Variables

Si cambias una variable en Easypanel:
1. **Guarda** los cambios
2. **Haz un Rebuild** de la aplicación
3. Las nuevas variables se aplicarán

### Variables en Desarrollo vs Producción

**Desarrollo** (local):
```env
NODE_ENV=development
DATABASE_URL=postgres://localhost:5432/mydb
PAYPAL_MODE=sandbox
```

**Producción** (Easypanel):
```env
NODE_ENV=production
DATABASE_URL=postgres://host-remoto:5432/mydb
PAYPAL_MODE=live
```

---

## ✨ Resumen

1. **Copia** todas las variables de arriba
2. **Pega** en Easypanel → Environment Variables
3. **Ajusta** los valores según tu configuración
4. **Guarda** y haz **Rebuild**
5. **Verifica** con `/api/health/system`

**¡Listo! Tu aplicación tendrá todas las variables necesarias. 🚀**
