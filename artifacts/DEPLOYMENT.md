# Guía de Despliegue en EasyPanel

## Requisitos Previos

1. **Cuenta en EasyPanel** - https://easypanel.io
2. **Repositorio Git** - GitHub, GitLab o similar
3. **Variables de Entorno** - Configuradas en EasyPanel

## Pasos de Despliegue

### 1. Preparar el Repositorio

```bash
# Asegúrate de que todos los cambios estén commiteados
git add .
git commit -m "Preparar para despliegue en EasyPanel"
git push origin main
```

### 2. Configurar en EasyPanel

#### 2.1 Crear Nueva Aplicación
- Ve a EasyPanel Dashboard
- Click en "New Application"
- Selecciona "Docker"
- Conecta tu repositorio Git

#### 2.2 Configurar Build
- **Dockerfile**: `./Dockerfile`
- **Build Context**: `.`
- **Build Args**: (dejar vacío)

#### 2.3 Configurar Variables de Entorno

En EasyPanel, agrega estas variables:

```
NODE_ENV=production
PORT=3002
HOST=0.0.0.0
LOG_LEVEL=info

# Base de Datos
DATABASE_URL=postgres://user:password@postgres-service:5432/tecnovariedades-db

# AI Services
GITHUB_TOKEN=ghp_xxxxx
NVIDIA_API_KEY=nvapi-xxxxx
OLLAMA_LOCAL_URL=http://ollama:11434

# Pagos
MERCADO_PAGO_PUBLIC_KEY=APP_USR-xxxxx
MERCADO_PAGO_ACCESS_TOKEN=APP_USR-xxxxx
PAYPAL_CLIENT_ID=xxxxx
PAYPAL_CLIENT_SECRET=xxxxx

# Email
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-app-password
EMAIL_FROM=tu-email@gmail.com
EMAIL_TO=destino@gmail.com
```

#### 2.4 Configurar Puertos
- **Puerto Interno**: 3002
- **Puerto Externo**: 3002 (o el que prefieras)

#### 2.5 Configurar Health Check
- **Path**: `/api/health`
- **Interval**: 30s
- **Timeout**: 10s
- **Retries**: 3

### 3. Desplegar

```bash
# En EasyPanel, click en "Deploy"
# El sistema:
# 1. Clonará el repositorio
# 2. Construirá la imagen Docker
# 3. Iniciará los contenedores
# 4. Ejecutará health checks
```

## Solución de Problemas

### Error: "Cannot find module"

**Causa**: Dependencias no instaladas correctamente

**Solución**:
```bash
# En EasyPanel, ejecuta:
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
```

### Error: "Port already in use"

**Causa**: El puerto 3002 ya está en uso

**Solución**:
- Cambia el puerto en las variables de entorno
- O detén el contenedor anterior

### Error: "Cannot connect to database"

**Causa**: DATABASE_URL incorrea o BD no accesible

**Solución**:
1. Verifica que la BD esté corriendo
2. Verifica las credenciales en DATABASE_URL
3. Asegúrate de que el firewall permite la conexión

### Error: "Frontend not loading"

**Causa**: El frontend no se construyó correctamente

**Solución**:
```bash
# Reconstruir el frontend
pnpm --filter @workspace/ventas-pro run build

# Verificar que los archivos estén en dist/public
ls -la artifacts/ventas-pro/dist/public/
```

## Monitoreo

### Ver Logs
```bash
# En EasyPanel, ve a "Logs"
# O usa:
docker logs <container-id>
```

### Verificar Health
```bash
curl https://tu-dominio.easypanel.host/api/health
```

### Métricas
- CPU: Debe estar < 50% en reposo
- Memoria: Debe estar < 500MB en reposo
- Disk: Monitorear crecimiento de logs

## Actualizaciones

### Desplegar Cambios

```bash
# 1. Hacer cambios localmente
git add .
git commit -m "Cambios para producción"
git push origin main

# 2. En EasyPanel, click en "Redeploy"
# El sistema automáticamente:
# - Clonará los cambios
# - Reconstruirá la imagen
# - Reiniciará los contenedores
```

### Rollback

Si algo sale mal:

```bash
# En EasyPanel, ve a "Deployments"
# Selecciona la versión anterior
# Click en "Rollback"
```

## Seguridad

### Checklist de Seguridad

- [ ] Cambiar todos los tokens y contraseñas
- [ ] Usar HTTPS (EasyPanel lo proporciona)
- [ ] Configurar CORS correctamente
- [ ] Habilitar rate limiting
- [ ] Configurar firewall
- [ ] Hacer backups regulares
- [ ] Monitorear logs de seguridad

### Regenerar Tokens

```bash
# GitHub Token
# 1. Ve a https://github.com/settings/tokens
# 2. Crea un nuevo token
# 3. Actualiza en EasyPanel

# Otros tokens
# Regenera en sus respectivos servicios
# Actualiza en EasyPanel
```

## Performance

### Optimizaciones

1. **Caché**: Habilitar caché de CDN
2. **Compresión**: Gzip habilitado por defecto
3. **Minificación**: Frontend minificado en build
4. **Database**: Usar índices apropiados
5. **Logs**: Rotar logs regularmente

### Escalado

Si necesitas más recursos:

1. En EasyPanel, ve a "Resources"
2. Aumenta CPU y Memoria
3. Configura auto-scaling si está disponible

## Contacto y Soporte

- **Documentación**: https://docs.easypanel.io
- **Soporte**: support@easypanel.io
- **Community**: https://community.easypanel.io
