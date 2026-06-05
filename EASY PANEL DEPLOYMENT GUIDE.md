# EasyPanel Deployment Guide

## 🚀 Despliegue en EasyPanel

### Configuración Requerida en EasyPanel

#### 1. Variables de Entorno (Environment Variables)

Configurar en la sección **Environment Variables** de EasyPanel:

```
# DATABASE (PostgreSQL)
DATABASE_URL=[YOUR_POSTGRES_CONNECTION_STRING]
DB_HOST=[YOUR_DB_HOST]
DB_PORT=[YOUR_DB_PORT]
DB_NAME=[YOUR_DB_NAME]
DB_USER=[YOUR_DB_USER]
DB_PASS=[YOUR_DB_PASSWORD]

# SERVER
PORT=[YOUR_PORT]
NODE_ENV=production
API_VERSION=v1

# HERMES AGENT
HERMES_URL=[YOUR_HERMES_URL]

# AI PROVIDERS
GITHUB_COPILOT_TOKEN=[YOUR_GITHUB_COPILOT_TOKEN]
GITHUB_TOKEN=[YOUR_GITHUB_TOKEN]
GITHUB_MODEL=[YOUR_GITHUB_MODEL]
GITHUB_MODEL_CLAUDE=[YOUR_GITHUB_MODEL_CLAUDE]

# AI FALLBACK
AI_FALLBACK_ENABLED=[YOUR_AI_FALLBACK_ENABLED]
AI_FALLBACK_ORDER=[YOUR_AI_FALLBACK_ORDER]

# BRIDGE LOCAL
BRIDGE_LOCAL_URL=[YOUR_BRIDGE_LOCAL_URL]
BRIDGE_LOCAL_API_KEY=[YOUR_BRIDGE_LOCAL_API_KEY]
BRIDGE_LOCAL_MODEL=[YOUR_BRIDGE_LOCAL_MODEL]

# NVIDIA
NVIDIA_API_KEY=[YOUR_NVIDIA_API_KEY]
NVIDIA_MODEL=[YOUR_NVIDIA_MODEL]
NVIDIA_MODEL_FAST=[YOUR_NVIDIA_MODEL_FAST]

# OLLAMA LOCAL
OLLAMA_LOCAL_URL=[YOUR_OLLAMA_LOCAL_URL]
OLLAMA_LOCAL_MODEL=[YOUR_OLLAMA_LOCAL_MODEL]

# G4F
G4F_ENABLED=[YOUR_G4F_ENABLED]
G4F_PROVIDER=[YOUR_G4F_PROVIDER]
G4F_MODEL=[YOUR_G4F_MODEL]
G4F_TIMEOUT=[YOUR_G4F_TIMEOUT]

# PAYMENTS
TRANSFER_NUMBER=[YOUR_TRANSFER_NUMBER]
TRANSFER_NAME=[YOUR_TRANSFER_NAME]
MERCADO_PAGO_PUBLIC_KEY=[YOUR_MERCADO_PAGO_PUBLIC_KEY]
MERCADO_PAGO_ACCESS_TOKEN=[YOUR_MERCADO_PAGO_ACCESS_TOKEN]
PAYPAL_CLIENT_ID=[YOUR_PAYPAL_CLIENT_ID]
PAYPAL_CLIENT_SECRET=[YOUR_PAYPAL_CLIENT_SECRET]
PAYPAL_MODE=[YOUR_PAYPAL_MODE]

# SMTP (Email)
SMTP_HOST=[YOUR_SMTP_HOST]
SMTP_PORT=[YOUR_SMTP_PORT]
SMTP_USER=[YOUR_SMTP_USER]
SMTP_PASS=[YOUR_SMTP_PASS]
EMAIL_FROM=[YOUR_EMAIL_FROM]
EMAIL_TO=[YOUR_EMAIL_TO]

# PERFORMANCE
TYPING_DELAY_MIN=[YOUR_TYPING_DELAY_MIN]
TYPING_DELAY_MAX=[YOUR_TYPING_DELAY_MAX]
READ_RECEIPT_DELAY=[YOUR_READ_RECEIPT_DELAY]
HUMAN_PAUSE_MIN=[YOUR_HUMAN_PAUSE_MIN]
HUMAN_PAUSE_MAX=[YOUR_HUMAN_PAUSE_MAX]

# OPencode AI
OPENCODE_API_URL=[YOUR_OPENCODE_API_URL]
OPENCODE_MODEL=[YOUR_OPENCODE_MODEL]
OPENCODE_API_KEY=[YOUR_OPENCODE_API_KEY]
```

#### 2. Comandos de Build

En la sección **Build** de EasyPanel:

```bash
#Instalar dependencias
pnpm install

#Build backend
pnpm --filter @workspace/api-server run build

#Build frontend  
pnpm --filter @workspace/ventas-pro run build
```

#### 3. Comandos de Start

En la sección **Start** de EasyPanel:

```bash
#Iniciar servidor
node artifacts/api-server/dist/index.mjs
```

### Configuración PostgreSQL en EasyPanel

1. **Conectar a PostgreSQL**
   - Host: [YOUR_DB_HOST]
   - Port: [YOUR_DB_PORT]
   - Database: [YOUR_DB_NAME]
   - User: [YOUR_DB_USER]
   - Password: [YOUR_DB_PASSWORD]
   - SSL Mode: disable/enable según configuración

2. **Estructura de Tablas**
   - `tenants` - Usuarios y cuentas
   - `store_categories` - Categorías de tienda
   - `store_products` - Productos de tienda
   - `stores` - Configuración de tiendas

3. **Migraciones (Si se usan)**
   ```bash
   # Ejecutar si hay migraciones pendientes
   pnpm drizzle-kit push:pg
   ```

### Puertos Requeridos

| Puerto | Servicio |
|--------|----------|
| [YOUR_PORT] | API Backend (Node.js) |
| 5173 | Frontend Vite (Dev) |
| 5000 | Hermes Agent (Opcional) |

### URLs de Acceso

- **Frontend**: https://[YOUR_DOMAIN].easypanel.host
- **API**: https://[YOUR_DOMAIN].easypanel.host/api
- **Auth (Login)**: https://[YOUR_DOMAIN].easypanel.host/auth
- **Dashboard**: https://[YOUR_DOMAIN].easypanel.host/dashboard

### Logs y Monitoreo

```bash
# Ver logs en tiempo real
tail -f logs/*.log

# Verificar estado del servicio
systemctl status node

# Verificar conexión a PostgreSQL
psql -h [YOUR_DB_HOST] -U [YOUR_DB_USER] -d [YOUR_DB_NAME]
```

### Solución de Problemas

#### Error: "Pool is closing"
- Verificar DATABASE_URL esté configurado correctamente
- Asegurar que PostgreSQL esté accesible (IP permitida)

#### Error: "Can't reach SMTP server"
- Verificar SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
- Asegurar que Gmail permita conexiones SMTP
- Revisar que la contraseña de aplicación esté correcta

#### Error: "AI Provider unavailable"
- Verificar API keys están configuradas
- Revisar AI_FALLBACK_ORDER
- Asegurar que los servicios API estén online

#### Error: "Module not found"
- Re-compilar: `pnpm run build`
- Limpiar cache: `rm -rf node_modules/.vite`
- Re-instalar: `pnpm install`

### Backups

Recomendado configurar backups automáticos de PostgreSQL:

```bash
pg_dump -h [YOUR_DB_HOST] -U [YOUR_DB_USER] [YOUR_DB_NAME] > backup_$(date +%Y%m%d).sql
```

### SSL/HTTPS

- EasyPanel maneja SSL automáticamente
- Asegurar que las URLs usen HTTPS
- Configurar redirecciones HTTP → HTTPS

### CI/CD (Opcional)

Si se usa GitHub Actions para despliegue automático:

```yaml
name: Deploy to EasyPanel

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: pnpm install
      - run: pnpm run build
      - name: Deploy to EasyPanel
        run: |
          # Configurar EasyPanel CLI
          # Ejecutar despliegue
          echo "Deploying to EasyPanel..."
```

---

**Status**: ✅ Listo para despliegue en EasyPanel  
**Database**: ✅ Configurar PostgreSQL connection  
**API**: ✅ Backend listo (v1)  
**Frontend**: ✅ Vite build exitoso  
**Emails**: ✅ Configure SMTP credentials  
**Tests**: ✅ 185/185 passing  

**Last Update**: 2024-12-XX  
**Version**: 1.0.0 (Production)
