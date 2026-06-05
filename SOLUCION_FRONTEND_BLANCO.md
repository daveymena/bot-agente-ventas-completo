# Solución: Frontend en Blanco en Easypanel

## Problema Identificado

El frontend aparece en blanco en Easypanel porque hay un problema con la ruta donde el servidor busca los archivos compilados del frontend.

## Cambios Realizados

### 1. Dockerfile Corregido

He actualizado el `Dockerfile` para que copie el frontend a la ubicación correcta que el servidor espera:

```dockerfile
# Production stage
FROM node:20-alpine

WORKDIR /app

# Instalar pnpm
RUN npm install -g pnpm

# Copiar archivos de configuración primero
COPY --from=builder /app/artifacts/api-server/package.json ./

# Instalar solo dependencias de producción
RUN pnpm install --prod --frozen-lockfile

# Copiar el backend compilado
COPY --from=builder /app/artifacts/api-server/dist ./dist

# Crear la estructura de directorios para el frontend
RUN mkdir -p /app/artifacts/ventas-pro/dist/public

# Copiar el frontend compilado a la ubicación correcta
COPY --from=builder /app/artifacts/ventas-pro/dist/public /app/artifacts/ventas-pro/dist/public
```

**Cambio clave**: El frontend ahora se copia a `/app/artifacts/ventas-pro/dist/public` en lugar de `/app/public`, que es la ruta que el servidor busca en producción (ver `app.ts` línea 115).

## Pasos para Desplegar en Easypanel

### 1. Compilar el Proyecto Completo

Desde la raíz del proyecto:

```bash
# Instalar dependencias
pnpm install

# Compilar el backend
pnpm --filter @workspace/api-server run build

# Compilar el frontend
pnpm --filter @workspace/ventas-pro run build
```

### 2. Verificar el Build

Ejecuta el script de verificación:

**En Windows (PowerShell):**
```powershell
cd artifacts
.\verify-build.ps1
```

**En Linux/Mac:**
```bash
cd artifacts
chmod +x verify-build.sh
./verify-build.sh
```

Este script verificará:
- ✅ Que el frontend esté compilado en `ventas-pro/dist/public`
- ✅ Que exista `index.html` y el directorio `assets/`
- ✅ Que el backend esté compilado en `api-server/dist`
- ✅ Que el Dockerfile tenga la configuración correcta

### 3. Reconstruir la Imagen Docker

```bash
cd artifacts
docker build -t ventas-pro:latest .
```

**Nota**: El build puede tardar varios minutos la primera vez.

### 4. Verificar la Estructura en el Contenedor

Después de construir la imagen, puedes verificar que los archivos estén en el lugar correcto:

```bash
docker run --rm -it ventas-pro:latest ls -la /app/artifacts/ventas-pro/dist/public
```

Deberías ver:
```
total 24
drwxr-xr-x    4 root     root          4096 Jan  1 00:00 .
drwxr-xr-x    3 root     root          4096 Jan  1 00:00 ..
drwxr-xr-x    2 root     root          4096 Jan  1 00:00 assets
-rw-r--r--    1 root     root          1234 Jan  1 00:00 index.html
-rw-r--r--    1 root     root           567 Jan  1 00:00 favicon.svg
-rw-r--r--    1 root     root           890 Jan  1 00:00 manifest.json
```

**Si no ves estos archivos**, el problema está en el build. Verifica:
1. Que el frontend se haya compilado correctamente antes de construir la imagen
2. Que el Dockerfile tenga las rutas correctas

### 5. Probar el Contenedor Localmente (Opcional pero Recomendado)

Antes de desplegar a Easypanel, prueba el contenedor localmente:

```bash
# Ejecutar el contenedor
docker run -p 3002:3002 --env NODE_ENV=production ventas-pro:latest

# En otra terminal, probar el health check
curl http://localhost:3002/api/health

# Abrir en el navegador
# http://localhost:3002
```

Si el frontend carga correctamente en local, funcionará en Easypanel.

### 6. Desplegar en Easypanel

#### Opción A: Usando Docker Registry (Recomendado)

1. **Push de la imagen a tu registry**:
   ```bash
   # Etiquetar la imagen
   docker tag ventas-pro:latest tu-registry/ventas-pro:latest
   
   # Push al registry
   docker push tu-registry/ventas-pro:latest
   ```

2. **Configurar en Easypanel**:
   - Ve a tu aplicación en Easypanel
   - En "Source", selecciona "Docker Image"
   - Ingresa: `tu-registry/ventas-pro:latest`
   - Haz clic en "Deploy"

#### Opción B: Usando Dockerfile (Build en Easypanel)

1. **Conectar tu repositorio Git**:
   - Ve a tu aplicación en Easypanel
   - En "Source", selecciona "Git Repository"
   - Conecta tu repositorio

2. **Configurar el build**:
   - Build Context: `/artifacts`
   - Dockerfile Path: `./Dockerfile`
   - Haz clic en "Rebuild"

**Nota**: La Opción A es más rápida porque no necesita compilar en Easypanel.

### 7. Verificar Variables de Entorno en Easypanel

Asegúrate de que estas variables estén configuradas en Easypanel:

```env
# Requeridas
NODE_ENV=production
PORT=3002
HOST=0.0.0.0

# Opcionales pero recomendadas
LOG_LEVEL=info

# Variables de tu aplicación (según tu .env)
DATABASE_URL=tu-database-url
WHATSAPP_API_KEY=tu-api-key
# ... otras variables necesarias
```

**Importante**: NO incluyas variables sensibles en el código. Configúralas directamente en Easypanel.

## Verificación Post-Despliegue

### 1. Verificar Logs del Servidor

Busca en los logs estas líneas:

```
[Frontend] NODE_ENV: production
[Frontend] ✅ Frontend encontrado en: /app/artifacts/ventas-pro/dist/public
[Frontend] Archivos: index.html, assets, favicon.svg, ...
```

Si ves `❌ No se pudo encontrar el directorio del frontend compilado`, significa que el frontend no está en la ubicación correcta.

### 2. Probar el Endpoint de Health

```bash
curl https://tu-app.easypanel.host/api/health
```

Debería responder:
```json
{"status":"ok"}
```

### 3. Probar el Frontend

Abre tu navegador en `https://tu-app.easypanel.host/`

Deberías ver la página de login de VentasPro.

## Troubleshooting

### El frontend sigue en blanco

1. **Verifica los logs del contenedor**:
   ```bash
   docker logs <container-id>
   ```

2. **Verifica que el build del frontend se completó**:
   ```bash
   # En local
   ls -la artifacts/ventas-pro/dist/public
   ```

3. **Verifica la consola del navegador**:
   - Abre DevTools (F12)
   - Ve a la pestaña "Console"
   - Busca errores de carga de recursos (404, CORS, etc.)

4. **Verifica la pestaña Network**:
   - Abre DevTools (F12)
   - Ve a la pestaña "Network"
   - Recarga la página
   - Verifica que `index.html` se cargue correctamente (status 200)
   - Verifica que los archivos en `assets/` se carguen correctamente

### Error: "Cannot GET /"

Esto significa que el servidor no está sirviendo el frontend. Verifica:

1. Que el middleware de archivos estáticos esté configurado correctamente en `app.ts`
2. Que la ruta del frontend sea correcta
3. Que el archivo `index.html` exista en la ubicación esperada

### Error: "Failed to load module script"

Esto puede indicar un problema con la configuración de `base` en `vite.config.ts`. Asegúrate de que:

```typescript
export default defineConfig({
  base: "/", // En producción debe ser "/"
  // ...
});
```

## Archivos Modificados

- ✅ `artifacts/Dockerfile` - Corregida la ruta de copia del frontend

## Próximos Pasos

1. Reconstruir la imagen Docker
2. Desplegar en Easypanel
3. Verificar que el frontend cargue correctamente
4. Probar el login y las funcionalidades principales

## Notas Adicionales

- El servidor busca el frontend en estas ubicaciones (en orden):
  1. `/app/artifacts/ventas-pro/dist/public` (Producción/Docker)
  2. `../../ventas-pro/dist/public` (Desarrollo relativo)
  3. `artifacts/ventas-pro/dist/public` (Desde cwd)

- Si el frontend no se encuentra, el servidor mostrará una página de error con información de debug

- El servidor sirve el `index.html` para todas las rutas que no sean `/api/*` (SPA routing)
