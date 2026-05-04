# Correcciones para Despliegue en EasyPanel

## Problemas Identificados y Solucionados

### 1. ✅ Servidor no escuchando en 0.0.0.0
**Problema**: El servidor solo escuchaba en localhost, lo que causaba que no fuera accesible desde EasyPanel
**Solución**: 
- Modificado `artifacts/api-server/src/index.ts` para escuchar en `0.0.0.0` por defecto
- Agregada variable de entorno `HOST` para configurabilidad

**Archivo**: `artifacts/api-server/src/index.ts`
```typescript
const host = process.env["HOST"] || "0.0.0.0";
app.listen(port, host, (err) => { ... });
```

### 2. ✅ Variables de entorno con valores hardcodeados
**Problema**: El `.env` tenía valores sensibles hardcodeados y URLs locales
**Solución**:
- Actualizado `artifacts/api-server/.env` para usar variables de entorno con fallbacks
- Agregadas variables para configuración en producción

**Archivo**: `artifacts/api-server/.env`
```
DATABASE_URL=${DATABASE_URL:-postgres://...}
HERMES_URL=${HERMES_URL:-http://hermes:5000}
OLLAMA_LOCAL_URL=${OLLAMA_LOCAL_URL:-http://ollama:11434}
```

### 3. ✅ Falta de health checks
**Problema**: EasyPanel no podía verificar si la aplicación estaba saludable
**Solución**:
- Creado `artifacts/api-server/src/health.ts` con endpoints `/api/health` y `/api/ready`
- Agregado al `app.ts` sin requerir autenticación

**Archivos**: 
- `artifacts/api-server/src/health.ts` (nuevo)
- `artifacts/api-server/src/app.ts` (modificado)

### 4. ✅ Falta de Dockerfile
**Problema**: EasyPanel necesita un Dockerfile para construir la imagen
**Solución**:
- Creado `artifacts/Dockerfile` optimizado para producción
- Usa multi-stage build para reducir tamaño de imagen
- Incluye health checks

**Archivo**: `artifacts/Dockerfile` (nuevo)

### 5. ✅ Falta de .dockerignore
**Problema**: Docker estaba incluyendo archivos innecesarios
**Solución**:
- Creado `artifacts/.dockerignore` para excluir archivos no necesarios

**Archivo**: `artifacts/.dockerignore` (nuevo)

### 6. ✅ Falta de documentación de despliegue
**Problema**: No había instrucciones claras para desplegar en EasyPanel
**Solución**:
- Creado `artifacts/DEPLOYMENT.md` con guía completa
- Incluye troubleshooting y mejores prácticas

**Archivo**: `artifacts/DEPLOYMENT.md` (nuevo)

### 7. ✅ Falta de configuración de EasyPanel
**Problema**: No había archivo de configuración específico para EasyPanel
**Solución**:
- Creado `artifacts/easypanel.yml` con configuración completa
- Incluye servicios, variables de entorno, health checks

**Archivo**: `artifacts/easypanel.yml` (nuevo)

### 8. ✅ Falta de script de verificación pre-despliegue
**Problema**: No había forma de verificar que todo estaba listo antes de desplegar
**Solución**:
- Creado `artifacts/scripts/pre-deploy-check.sh` para verificaciones
- Verifica Node, pnpm, builds, variables de entorno, Docker

**Archivo**: `artifacts/scripts/pre-deploy-check.sh` (nuevo)

## Archivos Modificados

```
artifacts/api-server/src/index.ts          ✏️  Modificado
artifacts/api-server/src/app.ts            ✏️  Modificado
artifacts/api-server/.env                  ✏️  Modificado
artifacts/api-server/src/health.ts         ✨ Nuevo
artifacts/Dockerfile                       ✨ Nuevo
artifacts/.dockerignore                    ✨ Nuevo
artifacts/DEPLOYMENT.md                    ✨ Nuevo
artifacts/easypanel.yml                    ✨ Nuevo
artifacts/scripts/pre-deploy-check.sh      ✨ Nuevo
artifacts/EASYPANEL_FIXES.md               ✨ Nuevo (este archivo)
```

## Próximos Pasos

### 1. Verificar Localmente
```bash
cd artifacts
bash scripts/pre-deploy-check.sh
```

### 2. Hacer Commit de Cambios
```bash
git add .
git commit -m "Preparar para despliegue en EasyPanel"
git push origin main
```

### 3. Configurar en EasyPanel
1. Ve a EasyPanel Dashboard
2. Crea nueva aplicación
3. Conecta tu repositorio
4. Configura variables de entorno (ver DEPLOYMENT.md)
5. Haz click en Deploy

### 4. Monitorear Despliegue
- Ve a "Logs" en EasyPanel
- Verifica que el servidor inicie correctamente
- Prueba el health check: `https://tu-dominio/api/health`

## Variables de Entorno Requeridas en EasyPanel

```
NODE_ENV=production
PORT=3002
HOST=0.0.0.0
LOG_LEVEL=info
DATABASE_URL=postgres://user:pass@host:5432/db
GITHUB_TOKEN=ghp_xxxxx
NVIDIA_API_KEY=nvapi-xxxxx
OLLAMA_LOCAL_URL=http://ollama:11434
MERCADO_PAGO_PUBLIC_KEY=APP_USR-xxxxx
MERCADO_PAGO_ACCESS_TOKEN=APP_USR-xxxxx
PAYPAL_CLIENT_ID=xxxxx
PAYPAL_CLIENT_SECRET=xxxxx
SMTP_USER=email@gmail.com
SMTP_PASS=app-password
EMAIL_FROM=email@gmail.com
EMAIL_TO=destino@gmail.com
```

## Troubleshooting

### Si ves errores en EasyPanel:

1. **"Cannot find module"**
   - Ejecuta: `pnpm install --frozen-lockfile`
   - Reconstruye: `pnpm --filter @workspace/api-server run build`

2. **"Port already in use"**
   - Cambia PORT en variables de entorno
   - O detén el contenedor anterior

3. **"Cannot connect to database"**
   - Verifica DATABASE_URL
   - Asegúrate de que la BD esté corriendo
   - Verifica firewall

4. **"Frontend not loading"**
   - Verifica que `artifacts/ventas-pro/dist/public/index.html` exista
   - Reconstruye: `pnpm --filter @workspace/ventas-pro run build`

## Mejoras Futuras

- [ ] Agregar CI/CD pipeline
- [ ] Configurar auto-scaling
- [ ] Agregar monitoreo de performance
- [ ] Configurar backups automáticos
- [ ] Agregar rate limiting
- [ ] Configurar CDN para frontend

## Contacto

Si tienes problemas con el despliegue:
1. Revisa `DEPLOYMENT.md`
2. Ejecuta `scripts/pre-deploy-check.sh`
3. Verifica los logs en EasyPanel
4. Contacta al soporte de EasyPanel
