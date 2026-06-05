# 🚀 DESPLIEGUE RÁPIDO EN EASYPANEL - CHECKLIST INTERACTIVO

**Estatus:** 🟢 GIT SINCRONIZADO - LISTO PARA DESPLEGAR  
**Repositorio:** https://github.com/daveymena/bot-agente-ventas-completo  
**Rama:** main  
**Build:** pnpm run build:no-typecheck

---

## ✅ PASO 1: Crear Aplicación en EasyPanel

**En:** https://panel.easypanel.io/apps

```
1. Click en "New Application"
2. Selecciona GitHub como fuente
3. Conecta tu cuenta GitHub (si no lo has hecho)
4. Busca: daveymena/bot-agente-ventas-completo
5. Selecciona rama: main
6. Click "Continue"
```

✅ **Verificación:** La aplicación aparece en tu dashboard de EasyPanel

---

## ✅ PASO 2: Configurar Nombre y Descripción

```
Application Name: Sofía Agent Sales Bot
Description: WhatsApp AI Sales Agent for TecnoVariedades
Region: Americas (o la más cercana)
```

✅ **Verificación:** Los datos aparecen correctamente

---

## ✅ PASO 3: Seleccionar Runtime

```
Runtime: Node.js 22.x
```

✅ **Verificación:** Node.js 22 está seleccionado

---

## ✅ PASO 4: Configurar Build

**En "Build Configuration":**

| Campo | Valor |
|-------|-------|
| Build Command | `pnpm run build:no-typecheck` |
| Output Directory | (dejar vacío) |

✅ **Verificación:** El comando está exacto

---

## ✅ PASO 5: Configurar Start Command

```
pnpm --filter @workspace/api-server run start
```

✅ **Verificación:** El comando está exacto

---

## ✅ PASO 6: Configurar Puerto

```
Container Port: 3002
Public Port: 80 (será redirigido a HTTPS)
```

✅ **Verificación:** Puerto 3002 está configurado

---

## ✅ PASO 7: Agregar Variables de Entorno (42 VARIABLES)

### ⚠️ IMPORTANTE: Debes tener tus valores reales antes de continuar

Asegúrate de tener:
- ✅ `DATABASE_URL` con tus credenciales
- ✅ `OPENCODE_API_KEY` 
- ✅ `GITHUB_TOKEN`
- ✅ `NVIDIA_API_KEY`
- ✅ `MERCADO_PAGO_ACCESS_TOKEN`
- ✅ `PAYPAL_CLIENT_SECRET`
- ✅ `SMTP_PASS` (Gmail App Password)

---

### Grupo 1: Configuración Básica (3 variables)

```env
NODE_ENV=production
PORT=3002
HOST=0.0.0.0
```

**Pasos:**
1. Ve a "Environment Variables"
2. Click "Add Variable" para cada una
3. Name: NODE_ENV
4. Value: production
5. Click Save
6. Repite para PORT y HOST

✅ **Verificación:** 3 variables agregadas

---

### Grupo 2: Base de Datos (1 variable)

```env
DATABASE_URL=postgres://postgres:TU_PASSWORD@79.143.187.160:5432/tecnovariedades-db?sslmode=disable
```

⚠️ Usa tu contraseña real

✅ **Verificación:** DATABASE_URL agregada

---

### Grupo 3: OpenCode (3 variables)

```env
OPENCODE_API_URL=https://tecnovariedades-provedor-ia.er7iaf.easypanel.host/v1
OPENCODE_API_KEY=<TU_API_KEY>
OPENCODE_MODEL=opencode/deepseek-v4-flash-free
```

✅ **Verificación:** 3 variables agregadas

---

### Grupo 4: GitHub (3 variables)

```env
GITHUB_TOKEN=<TU_TOKEN>
GITHUB_MODEL=gpt-4o
GITHUB_MODEL_CLAUDE=claude-sonnet-4-20250514
```

✅ **Verificación:** 3 variables agregadas

---

### Grupo 5: NVIDIA (2 variables)

```env
NVIDIA_API_KEY=<TU_API_KEY>
NVIDIA_MODEL=meta/llama-3.1-70b-instruct
```

✅ **Verificación:** 2 variables agregadas

---

### Grupo 6: Bridge Local (2 variables)

```env
BRIDGE_LOCAL_URL=http://localhost:8000/api/v1
BRIDGE_LOCAL_API_KEY=<TU_API_KEY>
```

✅ **Verificación:** 2 variables agregadas

---

### Grupo 7: Ollama Local (2 variables)

```env
OLLAMA_LOCAL_URL=https://tecnovariedades-ollama.er7iaf.easypanel.host
OLLAMA_LOCAL_MODEL=qwen3-coder:480b-cloud
```

✅ **Verificación:** 2 variables agregadas

---

### Grupo 8: AI Fallback (2 variables)

```env
AI_FALLBACK_ENABLED=true
AI_FALLBACK_ORDER=opencode,github_copilot_internal,ollama_local,nvidia,github
```

✅ **Verificación:** 2 variables agregadas

---

### Grupo 9: Pagos - Transferencia (2 variables)

```env
TRANSFER_NUMBER=3136174267
TRANSFER_NAME=Deiner Mena
```

✅ **Verificación:** 2 variables agregadas

---

### Grupo 10: Pagos - Mercado Pago (2 variables)

```env
MERCADO_PAGO_PUBLIC_KEY=<TU_KEY>
MERCADO_PAGO_ACCESS_TOKEN=<TU_TOKEN>
```

✅ **Verificación:** 2 variables agregadas

---

### Grupo 11: Pagos - PayPal (3 variables)

```env
PAYPAL_CLIENT_ID=<TU_ID>
PAYPAL_CLIENT_SECRET=<TU_SECRET>
PAYPAL_MODE=live
```

✅ **Verificación:** 3 variables agregadas

---

### Grupo 12: Email SMTP (4 variables)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=deinermena25@gmail.com
SMTP_PASS=<TU_APP_PASSWORD>
```

✅ **Verificación:** 4 variables agregadas

---

### Grupo 13: Email Más (2 variables)

```env
EMAIL_FROM=deinermena25@gmail.com
EMAIL_TO=daveymena16@gmail.com
```

✅ **Verificación:** 2 variables agregadas

---

### Grupo 14: Anti-Ban (5 variables)

```env
TYPING_DELAY_MIN=800
TYPING_DELAY_MAX=2000
READ_RECEIPT_DELAY=500
HUMAN_PAUSE_MIN=1000
HUMAN_PAUSE_MAX=3000
```

✅ **Verificación:** 5 variables agregadas

---

### Grupo 15: Git (1 variable)

```env
GIT_BRANCH=main
```

✅ **Verificación:** 1 variable agregada

---

### RESUMEN DE VARIABLES

```
Grupo 1: 3 variables (Configuración básica)
Grupo 2: 1 variable  (Database)
Grupo 3: 3 variables (OpenCode)
Grupo 4: 3 variables (GitHub)
Grupo 5: 2 variables (NVIDIA)
Grupo 6: 2 variables (Bridge)
Grupo 7: 2 variables (Ollama)
Grupo 8: 2 variables (AI Fallback)
Grupo 9: 2 variables (Transferencia)
Grupo 10: 2 variables (Mercado Pago)
Grupo 11: 3 variables (PayPal)
Grupo 12: 4 variables (SMTP Host)
Grupo 13: 2 variables (Email From/To)
Grupo 14: 5 variables (Anti-Ban)
Grupo 15: 1 variable (Git)
─────────────────────
TOTAL: 42 VARIABLES
```

✅ **Verificación Final:** 42 variables agregadas

---

## ✅ PASO 8: Configurar Health Check

**En "Health Check":**

```
Path: /api/health
Interval: 30s
Timeout: 10s
Retries: 3
Start Period: 5s
```

✅ **Verificación:** Health check configurado

---

## ✅ PASO 9: Configurar Resources (Opcional)

**En "Resources":**

```
CPU Limit: 2 cores
Memory Limit: 2 GB
CPU Request: 0.5 cores
Memory Request: 512 MB
```

✅ **Verificación:** Resources configurados

---

## ✅ PASO 10: Revisar y Desplegar

**Antes de hacer deploy:**

1. ✅ Nombre de aplicación: "Sofía Agent Sales Bot"
2. ✅ Runtime: Node.js 22
3. ✅ Build: `pnpm run build:no-typecheck`
4. ✅ Start: `pnpm --filter @workspace/api-server run start`
5. ✅ Port: 3002
6. ✅ Variables: 42 agregadas
7. ✅ Health Check: Configurado

**Si todo está ✅:**

Click en **"Create Application"** o **"Deploy"**

✅ **Verificación:** La aplicación comienza a desplegarse

---

## ⏳ ESPERANDO DESPLIEGUE (5-10 minutos)

En la sección de Logs verás:

```
✅ Cloning repository...
✅ Installing dependencies with pnpm...
✅ Running build command...
✅ Building Docker image...
✅ Deploying application...
✅ Health check passed!
```

🟢 **Estado:** Application is running

---

## ✅ PASO 11: Verificar Post-Despliegue

### Health Check Básico

```bash
curl https://tu-app.easypanel.host/api/health
```

Espera respuesta:
```json
{
  "status": "ok"
}
```

✅ **Verificación:** Status es "ok"

---

### Health Check Completo

```bash
curl https://tu-app.easypanel.host/api/health/system
```

Espera respuesta con:
- ✅ database: "connected"
- ✅ ai_services: available
- ✅ payment_systems: configured

✅ **Verificación:** Todos los servicios están disponibles

---

## 🎉 ¡DESPLIEGUE COMPLETADO!

Si llegaste aquí, tu aplicación está:

- ✅ Desplegada en EasyPanel
- ✅ Corriendo en producción
- ✅ Con todas las APIs configuradas
- ✅ Procesando pagos en vivo
- ✅ Lista para recibir mensajes de WhatsApp

---

## 🔗 URLs Importantes

| Recurso | URL |
|---------|-----|
| EasyPanel Dashboard | https://panel.easypanel.io |
| Tu Aplicación | https://tu-app.easypanel.host |
| Health Check | https://tu-app.easypanel.host/api/health |
| Logs | EasyPanel → Application → Logs |
| GitHub Repo | https://github.com/daveymena/bot-agente-ventas-completo |

---

## ❓ Troubleshooting Rápido

### "Build failed"
→ Revisa los logs en EasyPanel
→ Verifica que Build Command es exacto

### "DATABASE_URL not defined"
→ Agrega la variable a Environment Variables
→ Haz un rebuild

### "Health check failing"
→ Espera 30-60 segundos después del deploy
→ Revisa los logs de la aplicación

### "Payment gateway error"
→ Verifica tus keys de Mercado Pago/PayPal
→ Asegúrate que MODE está en "live"

---

**Fecha:** 18 de Mayo de 2026  
**Estado:** 🟢 LISTO PARA PRODUCCIÓN  
**Soporte:** Revisa DESPLIEGUE_PASO_A_PASO.md para más detalles
