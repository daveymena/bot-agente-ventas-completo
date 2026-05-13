# 🔧 Troubleshooting: Frontend no se muestra en Easypanel

## 📋 Problema
El frontend no se muestra en pantalla cuando se despliega en Easypanel, aunque el backend funciona correctamente.

## 🔍 Causas Comunes

### 1. **Frontend no compilado en el build**
El Dockerfile debe construir el frontend antes de copiar los archivos.

**Solución aplicada:**
- ✅ Agregado verificación en Dockerfile que valida que `index.html` existe
- ✅ El build falla si el frontend no se compila correctamente

### 2. **Rutas incorrectas en producción**
El servidor busca el frontend en una ruta que no existe en el contenedor.

**Solución aplicada:**
- ✅ Función `findFrontendPath()` que prueba múltiples rutas candidatas
- ✅ Logs detallados para debugging
- ✅ Página de error informativa si no se encuentra el frontend

### 3. **Variables de entorno faltantes**
El frontend necesita saber dónde está el API.

**Verificar en Easypanel:**
```bash
NODE_ENV=production
PORT=3002
```

### 4. **Base path incorrecto**
Si Easypanel usa un subpath (ej: `/app`), el frontend debe configurarse.

**Verificar `vite.config.ts`:**
```typescript
base: process.env.BASE_PATH || "/"
```

## 🛠️ Pasos de Diagnóstico

### 1. Verificar logs del contenedor
```bash
# En Easypanel, ir a Logs y buscar:
[Frontend] ✅ Frontend encontrado en: /app/artifacts/ventas-pro/dist/public
```

Si ves:
```
❌ No se pudo encontrar el directorio del frontend compilado
```
Entonces el frontend no se compiló correctamente.

### 2. Verificar que el build se completó
```bash
# Conectar al contenedor en Easypanel
docker exec -it <container-id> sh

# Verificar que existe el frontend
ls -la /app/artifacts/ventas-pro/dist/public/
cat /app/artifacts/ventas-pro/dist/public/index.html
```

### 3. Verificar que el servidor sirve archivos estáticos
```bash
# Desde el navegador o curl
curl https://tu-dominio.com/
curl https://tu-dominio.com/assets/index-*.js
```

Si obtienes 404, el problema es con express.static.

### 4. Verificar rutas de assets
Abrir DevTools → Network y verificar que los assets se cargan desde:
```
https://tu-dominio.com/assets/index-VgNAGT7O.js
https://tu-dominio.com/assets/index-B6DSEB3Y.css
```

Si intentan cargar desde rutas incorrectas (ej: `/app/assets/...`), el problema es con `base` en vite.config.ts.

## 🚀 Soluciones Implementadas

### ✅ Dockerfile Mejorado
```dockerfile
# Verificar que el frontend se construyó correctamente
RUN echo "🔍 Verificando build del frontend..." && \
    ls -la /app/artifacts/ventas-pro/dist/public/ && \
    if [ ! -f /app/artifacts/ventas-pro/dist/public/index.html ]; then \
        echo "❌ ERROR: index.html no encontrado"; \
        exit 1; \
    else \
        echo "✅ Frontend construido correctamente"; \
    fi
```

### ✅ app.ts Mejorado
```typescript
// Función para encontrar el path correcto del frontend
function findFrontendPath(): string {
  const candidates = [
    path.resolve("/app/artifacts/ventas-pro/dist/public"),
    path.resolve(__dirname, "../../ventas-pro/dist/public"),
    path.resolve(process.cwd(), "artifacts/ventas-pro/dist/public"),
  ];
  
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const indexPath = path.join(candidate, "index.html");
      if (existsSync(indexPath)) {
        return candidate;
      }
    }
  }
  
  throw new Error("❌ No se pudo encontrar el directorio del frontend compilado");
}
```

### ✅ Página de Error Informativa
Si el frontend no se encuentra, ahora se muestra una página HTML con información de debug completa.

## 📝 Checklist de Deployment

Antes de hacer push a Easypanel:

- [ ] ✅ Frontend compila localmente: `pnpm --filter @workspace/ventas-pro run build`
- [ ] ✅ Existe `artifacts/ventas-pro/dist/public/index.html`
- [ ] ✅ Existe `artifacts/ventas-pro/dist/public/assets/`
- [ ] ✅ Variables de entorno configuradas en Easypanel
- [ ] ✅ Puerto 3002 expuesto en Easypanel
- [ ] ✅ Health check configurado: `/api/health`

## 🔄 Rebuild Forzado

Si hiciste cambios y Easypanel no los detecta:

1. **Cambiar force rebuild en Dockerfile:**
```dockerfile
# Force rebuild: 2026-05-12  ← Cambiar esta fecha
```

2. **Hacer commit y push:**
```bash
git add .
git commit -m "fix: Force rebuild frontend"
git push origin main
```

3. **En Easypanel:**
   - Ir a tu servicio
   - Click en "Rebuild"
   - Esperar a que termine
   - Verificar logs

## 🆘 Si Nada Funciona

### Opción 1: Build local y copiar
```bash
# Compilar localmente
pnpm --filter @workspace/ventas-pro run build

# Verificar que existe
ls -la artifacts/ventas-pro/dist/public/index.html

# Commit y push
git add artifacts/ventas-pro/dist/
git commit -m "chore: Add pre-built frontend"
git push
```

### Opción 2: Dockerfile simplificado
Crear un Dockerfile que NO use multi-stage build:

```dockerfile
FROM node:20-slim

WORKDIR /app
RUN corepack enable

# Copiar todo
COPY . .

# Instalar y compilar
RUN pnpm install --no-frozen-lockfile --prod=false
RUN pnpm --filter @workspace/ventas-pro run build
RUN pnpm --filter @workspace/api-server run build

# Verificar
RUN ls -la /app/artifacts/ventas-pro/dist/public/

ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
```

### Opción 3: Servir frontend por separado
Desplegar frontend y backend como servicios separados en Easypanel:

**Backend:** Puerto 3002, solo API
**Frontend:** Puerto 80, Nginx sirviendo archivos estáticos

## 📞 Contacto

Si el problema persiste después de aplicar estas soluciones, revisar:
1. Logs completos del build en Easypanel
2. Logs del contenedor en runtime
3. Network tab en DevTools del navegador
4. Configuración de dominio y SSL en Easypanel

---

**Última actualización:** 2026-05-12
**Commit relacionado:** feat: Sistema completo de pagos con tokens + Arquitecto Visual de Agentes
