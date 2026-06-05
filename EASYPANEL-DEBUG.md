# 🔍 Diagnóstico de Frontend en EasyPanel

## Problema
El frontend no se renderiza en EasyPanel (pantalla en blanco).

## Pasos de Diagnóstico

### 1. Verificar los logs del contenedor

En EasyPanel, ve a tu servicio → **Logs** y busca estos mensajes:

```
[Frontend] NODE_ENV: production
[Frontend] __dirname: /app/artifacts/api-server/dist
[Frontend] Serving static files from: /app/artifacts/ventas-pro/dist/public
[Frontend] ✅ Directory exists
[Frontend] Files in directory: assets, favicon.svg, index.html, opengraph.jpg
[Frontend] ✅ index.html found
```

**Si ves `❌ Directory does NOT exist`**, el frontend no se construyó correctamente.

### 2. Ejecutar diagnóstico manual

En EasyPanel, abre la **Terminal** del contenedor y ejecuta:

```bash
cd /app/artifacts/api-server
node check-frontend.js
```

Esto te mostrará:
- ✅ Qué directorios existen
- ✅ Qué archivos están presentes
- ❌ Qué falta

### 3. Verificar el build del frontend

Ejecuta en la terminal del contenedor:

```bash
ls -la /app/artifacts/ventas-pro/dist/public/
```

Deberías ver:
```
index.html
assets/
favicon.svg
opengraph.jpg
```

**Si no existe**, el Dockerfile no está construyendo el frontend.

### 4. Verificar el Dockerfile

Asegúrate de que el Dockerfile tiene esta línea:

```dockerfile
RUN pnpm --filter "@workspace/api-server" --filter "@workspace/ventas-pro" run build
```

### 5. Forzar rebuild

En EasyPanel:
1. Ve a tu servicio
2. Click en **Rebuild**
3. Espera a que termine (2-5 minutos)
4. Revisa los logs de nuevo

### 6. Verificar que el servidor está sirviendo archivos estáticos

En los logs, busca peticiones a archivos estáticos:

```
[COOKIES] Path: /
[COOKIES] Path: /assets/index-DLeQBg2E.js
[COOKIES] Path: /assets/index-BcUy8rA1.css
```

Si ves estas peticiones, el servidor está funcionando.

### 7. Verificar en el navegador

1. Abre la URL de tu app en EasyPanel
2. Abre DevTools (F12)
3. Ve a la pestaña **Network**
4. Refresca la página (Ctrl+F5)
5. Busca errores 404 en archivos estáticos

## Soluciones Comunes

### Solución 1: El frontend no se construyó

**Síntoma:** `❌ Directory does NOT exist`

**Solución:**
1. Verifica que el Dockerfile incluye el build del frontend
2. Fuerza un rebuild en EasyPanel
3. Revisa los logs del build para ver si hay errores

### Solución 2: Path incorrecto

**Síntoma:** El directorio existe pero en otro lugar

**Solución:**
Modifica `artifacts/api-server/src/app.ts`:

```typescript
const frontendPath = process.env.NODE_ENV === "production"
  ? path.resolve("/app/artifacts/ventas-pro/dist/public")  // ← Ajusta este path
  : path.resolve(__dirname, "../../ventas-pro/dist/public");
```

### Solución 3: NODE_ENV no está configurado

**Síntoma:** `NODE_ENV: undefined`

**Solución:**
En EasyPanel, agrega la variable de entorno:
```
NODE_ENV=production
```

### Solución 4: El build falla silenciosamente

**Síntoma:** El directorio existe pero está vacío

**Solución:**
Revisa los logs del build en EasyPanel. Busca errores de TypeScript o Vite.

## Comandos Útiles en EasyPanel Terminal

```bash
# Ver estructura completa
find /app -type d -name "dist" -o -name "public"

# Ver tamaño de archivos
du -sh /app/artifacts/ventas-pro/dist/public/*

# Ver contenido de index.html
cat /app/artifacts/ventas-pro/dist/public/index.html

# Ver procesos Node
ps aux | grep node

# Ver puerto 3002
netstat -tuln | grep 3002
```

## Contacto

Si ninguna solución funciona, comparte:
1. Los logs completos del contenedor
2. El output de `node check-frontend.js`
3. El contenido de `/app/artifacts/ventas-pro/dist/public/`
