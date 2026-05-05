# Guía de Despliegue en EasyPanel

## 📋 Requisitos Previos

- Cuenta en EasyPanel
- Repositorio Git sincronizado
- Variables de entorno configuradas

## 🚀 Pasos de Despliegue

### 1. Crear Aplicación en EasyPanel

1. Accede a tu panel de EasyPanel
2. Crea una nueva aplicación
3. Selecciona "Node.js" como runtime
4. Conecta tu repositorio de GitHub

### 2. Configurar Variables de Entorno

En EasyPanel, configura las siguientes variables:

```env
# Base de Datos
DATABASE_URL=postgresql://user:password@host:5432/database

# API Keys
NVIDIA_API_KEY=tu_api_key_nvidia
GITHUB_API_KEY=tu_api_key_github

# Configuración
NODE_ENV=production
PORT=3002
FRONTEND_URL=https://tu-dominio.com
API_URL=https://api.tu-dominio.com

# WhatsApp
WHATSAPP_PHONE=573042748709
```

### 3. Configurar Build y Start

**Build Command:**
```bash
npm run build
```

**Start Command:**
```bash
npm run start
```

### 4. Configurar Puertos

- **API Server**: Puerto 3002
- **Frontend**: Puerto 5174 (desarrollo) o 3000 (producción)

### 5. Configurar Base de Datos

1. Crea una base de datos PostgreSQL en EasyPanel
2. Ejecuta las migraciones:
```bash
npm run db:migrate
```

## 📦 Estructura del Proyecto

```
.
├── artifacts/
│   ├── api-server/          # Backend API
│   │   ├── src/
│   │   │   ├── app.ts       # Configuración Express
│   │   │   ├── lib/
│   │   │   │   ├── agent.ts # Lógica del bot
│   │   │   │   └── ...
│   │   │   └── routes/
│   │   └── dist/            # Build compilado
│   └── ventas-pro/          # Frontend React
│       ├── src/
│       ├── dist/            # Build compilado
│       └── vite.config.ts
├── lib/                     # Librerías compartidas
└── package.json
```

## 🔧 Características Implementadas

### ✅ Sistema de Sesión
- Cookies persistentes de 30 días
- Verificación de sesión en `/auth/me`
- Sincronización entre pestañas

### ✅ Bot Inteligente
- Razonamiento basado en IA
- Búsqueda automática de productos
- Respuestas coherentes y contextuales
- Información completa de productos

### ✅ Gestión de Productos
- Catálogo completo con detalles
- Tarjetas de productos `[CARD: ID]`
- Información de precio, entrega, garantía

### ✅ Etapas de Conversación
1. **Saludo**: Presentación de la empresa
2. **Interés**: Recomendación de producto
3. **Preguntas**: Respuestas detalladas
4. **Confirmación**: Mantiene coherencia
5. **Pago**: Facilita opciones de pago

## 🧪 Testing

### Test Local
```bash
# Iniciar servidor
npm run start

# En otra terminal, test de conversación
curl -X POST http://localhost:3002/api/whatsapp/test-ia \
  -H "Content-Type: application/json" \
  -d '{"message":"Hola"}'
```

### Test de Sesión
```bash
# Login
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Verificar sesión
curl -X GET http://localhost:3002/api/auth/me \
  -H "Cookie: tenant_id=1"
```

## 📊 Monitoreo

### Logs
- Accede a los logs en EasyPanel
- Busca errores con `[ERROR]` o `[AGENT-ERROR]`

### Métricas
- Tiempo de respuesta del bot
- Tasa de éxito de conversaciones
- Uso de API de IA

## 🔐 Seguridad

- ✅ CORS configurado correctamente
- ✅ Cookies httpOnly y secure
- ✅ Validación de SaaS en rutas protegidas
- ✅ Límites de uso por plan

## 📞 Soporte

Para problemas de despliegue:
1. Revisa los logs en EasyPanel
2. Verifica las variables de entorno
3. Comprueba la conexión a la base de datos
4. Valida las API keys

## 🎯 Próximos Pasos

1. Configurar dominio personalizado
2. Configurar SSL/TLS
3. Configurar backups automáticos
4. Configurar monitoreo y alertas
5. Configurar CI/CD automático

---

**Última actualización**: 2026-05-05
**Versión**: 1.0.0
**Estado**: Listo para Producción ✅
