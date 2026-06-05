# 🔧 INSTRUCCIONES - Configurar .env en EasyPanel

## 📋 Resumen

He creado un `.env` optimizado para EasyPanel que reduce la latencia de respuesta del bot.

## 📁 Archivos

- **`.env.easypanel.optimizado`** - Configuración optimizada para EasyPanel
- **`.env`** - Configuración local (para referencia)

## 🚀 Cómo Configurar en EasyPanel

### Paso 1: Acceder a EasyPanel

1. Ir a https://easypanel.io
2. Log in con: **daveymena16@gmail.com**
3. Seleccionar proyecto: **Agent-Sales-Bot**

### Paso 2: Ir a Environment Variables

1. En el proyecto, ir a **Settings**
2. Buscar: **Environment Variables**
3. Hacer clic en **Edit**

### Paso 3: Copiar las Variables

Copia TODAS las variables del archivo `.env.easypanel.optimizado` y pégalas en EasyPanel.

**Variables críticas:**

```
DATABASE_URL=postgres://user:password@host:5432/dbname?sslmode=disable
GITHUB_COPILOT_TOKEN=your-github-copilot-jwt-token
GITHUB_TOKEN=your-github-token
OPENCODE_API_KEY=your-opencode-api-key
NVIDIA_API_KEY=your-nvidia-api-key
```

### Paso 4: Cambios Importantes

**NUEVO - Desabilitar Ollama:**
```
# Comentar o eliminar estas líneas:
# OLLAMA_LOCAL_URL=https://tecnovariedades-ollama.er7iaf.easypanel.host
# OLLAMA_LOCAL_MODEL=qwen3-coder:480b-cloud
```

**NUEVO - Optimizaciones de BD:**
```
DB_POOL_MAX=20
DB_POOL_MIN=5
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=5000
DB_STATEMENT_TIMEOUT=10000
DB_QUERY_TIMEOUT=10000
```

**NUEVO - Timeouts Agresivos:**
```
NVIDIA_TIMEOUT=8000
G4F_TIMEOUT=10000
```

### Paso 5: Guardar y Desplegar

1. Hacer clic en **Save**
2. Ir a **Deployments**
3. Hacer clic en **Deploy Now**
4. Seleccionar **main** branch
5. Esperar 5-10 minutos

## 📊 Cambios Realizados

### 1. Desabilitar Ollama
- **Razón:** Ollama es muy lento en EasyPanel (30-60 segundos)
- **Impacto:** -30-60 segundos por respuesta

### 2. Optimizar Pool de BD
- **Razón:** Conexión remota a BD necesita pool optimizado
- **Impacto:** -500-1000ms por respuesta

### 3. Timeouts Agresivos
- **Razón:** Fallback más rápido si proveedor falla
- **Impacto:** -20-120 segundos si hay fallos

### 4. Orden de Proveedores
- **Antes:** opencode, github_copilot_internal, **ollama_local**, nvidia, github, g4f
- **Ahora:** opencode, github_copilot_internal, nvidia, github, g4f
- **Impacto:** Salta Ollama automáticamente

## ✅ Checklist

- [ ] Acceder a EasyPanel
- [ ] Ir a Environment Variables
- [ ] Copiar todas las variables de `.env.easypanel.optimizado`
- [ ] Desabilitar Ollama (comentar líneas)
- [ ] Agregar optimizaciones de BD
- [ ] Guardar cambios
- [ ] Desplegar (Deploy Now)
- [ ] Esperar 5-10 minutos
- [ ] Testear bot en WhatsApp
- [ ] Verificar que responde rápido

## 🔍 Cómo Verificar

Después de desplegar:

1. Enviar mensaje al bot en WhatsApp
2. Medir tiempo de respuesta
3. Debería ser **5-15 segundos** (no 30-60)

Si sigue lento:
1. Ir a **Logs** en EasyPanel
2. Buscar: `⏱️ [TIMING]`
3. Identificar qué paso tarda más
4. Reportar el resultado

## 📝 Variables Completas

```
# DATABASE
DATABASE_URL=postgres://user:password@host:5432/dbname?sslmode=disable
DB_HOST=your-db-host
DB_PORT=5432
DB_NAME=your-db-name
DB_USER=your-db-user
DB_PASS=your-db-password

# SERVER
PORT=3002
NODE_ENV=production
API_VERSION=v1

# HERMES
HERMES_URL=http://localhost:5000

# AI PROVIDERS
GITHUB_COPILOT_TOKEN=your-github-copilot-jwt-token
GITHUB_TOKEN=your-github-token
GITHUB_MODEL=gpt-4o
GITHUB_MODEL_CLAUDE=claude-sonnet-4-20250514
AI_FALLBACK_ENABLED=true
AI_FALLBACK_ORDER=opencode,github_copilot_internal,nvidia,github,g4f
BRIDGE_LOCAL_URL=http://localhost:8000/api/v1
BRIDGE_LOCAL_API_KEY=your-bridge-api-key
BRIDGE_LOCAL_MODEL=deepseek-v4-flash
NVIDIA_API_KEY=your-nvidia-api-key
NVIDIA_MODEL=meta/llama-3.1-70b-instruct
NVIDIA_MODEL_FAST=meta/llama-3.1-8b-instruct
NVIDIA_TIMEOUT=8000
G4F_ENABLED=true
G4F_PROVIDER=auto
G4F_MODEL=gpt-4-turbo
G4F_TIMEOUT=10000
OPENCODE_API_URL=https://your-opencode-api-url/v1
OPENCODE_MODEL=opencode/deepseek-v4-flash-free
OPENCODE_API_KEY=your-opencode-api-key

# PAYMENTS
TRANSFER_NUMBER=your-transfer-number
TRANSFER_NAME=your-name
MERCADO_PAGO_PUBLIC_KEY=your-mercadopago-public-key
MERCADO_PAGO_ACCESS_TOKEN=your-mercadopago-access-token
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-client-secret
PAYPAL_MODE=live

# NOTIFICATIONS
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-smtp-password
EMAIL_FROM=your-email@gmail.com
EMAIL_TO=your-notification-email@gmail.com

# PERFORMANCE
TYPING_DELAY_MIN=800
TYPING_DELAY_MAX=2000
READ_RECEIPT_DELAY=500
HUMAN_PAUSE_MIN=1000
HUMAN_PAUSE_MAX=3000
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60000

# GIT
GIT_BRANCH=main
GIT_REMOTE=origin

# DATABASE POOL OPTIMIZATION
DB_POOL_MAX=20
DB_POOL_MIN=5
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=5000
DB_STATEMENT_TIMEOUT=10000
DB_QUERY_TIMEOUT=10000
```

## 🎯 Resultado Esperado

**Antes:**
- Latencia: 30-60 segundos
- Problema: Ollama tardando

**Después:**
- Latencia: 5-15 segundos
- Mejora: 75-80% más rápido

---

**Fecha:** 23 de Mayo de 2026
**Status:** ✅ Listo para configurar
