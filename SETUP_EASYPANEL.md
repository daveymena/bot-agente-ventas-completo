# 🚀 SETUP PARA EASYPANEL - Agent Sales Bot

**Fecha**: 23 de Mayo de 2026  
**Ambiente**: EasyPanel (Producción)

---

## 📋 Requisitos Previos

1. Acceso a EasyPanel
2. Base de datos PostgreSQL configurada
3. Tokens de API de proveedores (GitHub, NVIDIA, OpenCode, etc.)
4. Credenciales de pago (Mercado Pago, PayPal)
5. Configuración de email (SMTP)

---

## 🔧 Pasos de Configuración

### Paso 1: Clonar el Repositorio

```bash
git clone https://github.com/daveymena/bot-agente-ventas-completo.git
cd bot-agente-ventas-completo
```

### Paso 2: Instalar Dependencias

```bash
npm install
cd artifacts/api-server
npm install
```

### Paso 3: Configurar Variables de Entorno en EasyPanel

En el panel de EasyPanel, ve a **Environment Variables** y configura:

#### Base de Datos
```
DATABASE_URL=postgres://user:password@host:5432/dbname?sslmode=disable
DB_HOST=your_db_host
DB_PORT=5432
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASS=your_db_password
```

#### Servidor
```
PORT=3002
NODE_ENV=production
API_VERSION=v1
```

#### AI Providers (Elige al menos uno)

**GitHub Copilot** (Recomendado):
```
GITHUB_COPILOT_TOKEN=your_github_copilot_token
GITHUB_TOKEN=your_github_token
GITHUB_MODEL=gpt-4o
```

**NVIDIA** (Fallback):
```
NVIDIA_API_KEY=your_nvidia_api_key
NVIDIA_MODEL=meta/llama-3.1-70b-instruct
NVIDIA_TIMEOUT=8000
```

**OpenCode** (Fallback):
```
OPENCODE_API_URL=https://your-opencode-instance.com/v1
OPENCODE_MODEL=opencode/deepseek-v4-flash-free
OPENCODE_API_KEY=your_opencode_api_key
```

**G4F** (Fallback):
```
G4F_ENABLED=true
G4F_PROVIDER=auto
G4F_MODEL=gpt-4-turbo
G4F_TIMEOUT=10000
```

#### Pagos (Colombia)
```
TRANSFER_NUMBER=your_transfer_number
TRANSFER_NAME=Your Name
MERCADO_PAGO_PUBLIC_KEY=your_mercado_pago_public_key
MERCADO_PAGO_ACCESS_TOKEN=your_mercado_pago_access_token
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_MODE=live
```

#### Email (SMTP)
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
EMAIL_FROM=your_email@gmail.com
EMAIL_TO=recipient@example.com
```

#### Performance
```
TYPING_DELAY_MIN=800
TYPING_DELAY_MAX=2000
READ_RECEIPT_DELAY=500
HUMAN_PAUSE_MIN=1000
HUMAN_PAUSE_MAX=3000
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60000
```

#### Database Pool
```
DB_POOL_MAX=20
DB_POOL_MIN=5
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=5000
DB_STATEMENT_TIMEOUT=10000
DB_QUERY_TIMEOUT=10000
```

### Paso 4: Compilar el Proyecto

```bash
npm run build
```

### Paso 5: Iniciar el Servidor

```bash
npm start
```

---

## 🔐 Seguridad

### ✅ Lo que SÍ debe estar en Git
- Código fuente
- Configuración de estructura
- `.env.example` (plantilla sin secretos)
- Documentación

### ❌ Lo que NO debe estar en Git
- `.env` (variables de entorno locales)
- `.env.easypanel` (variables de producción)
- `.env.easypanel.optimizado` (variables optimizadas)
- Tokens de API
- Credenciales de base de datos
- Claves privadas

### 🔒 Cómo Manejar Secretos

1. **Localmente**: Usar `.env` (excluido de Git)
2. **EasyPanel**: Configurar en panel de Environment Variables
3. **Documentación**: Usar `.env.example` como referencia

---

## 📊 Verificación

Después de configurar, verifica que todo funciona:

```bash
# Verificar conexión a BD
curl http://localhost:3002/health

# Verificar autenticación
curl -X POST http://localhost:3002/api/auth/check-email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Verificar AI providers
curl http://localhost:3002/api/health
```

---

## 🚨 Troubleshooting

### Error: "Cannot connect to database"
- Verificar `DATABASE_URL` en EasyPanel
- Verificar que la BD está corriendo
- Verificar credenciales

### Error: "AI provider timeout"
- Verificar tokens de API
- Verificar conexión a internet
- Aumentar `TIMEOUT` en variables

### Error: "Email not sending"
- Verificar credenciales SMTP
- Verificar que Gmail tiene "Less secure apps" habilitado
- Usar contraseña de aplicación (no contraseña de cuenta)

---

## 📞 Soporte

Para problemas, contacta a:
- **Email**: daveymena16@gmail.com
- **Tenant ID**: 1

---

## 📝 Notas

1. **Nunca** commits secretos a Git
2. **Siempre** usa `.env.example` como plantilla
3. **Configura** secretos en EasyPanel, no en código
4. **Revisa** `.gitignore` regularmente
5. **Documenta** nuevas variables en `.env.example`

---

**Última actualización**: 23 de Mayo de 2026  
**Versión**: 1.0

