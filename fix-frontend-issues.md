# 🔧 FIX COMPLETO - PROBLEMAS DEL FRONTEND

## 🎯 PROBLEMAS IDENTIFICADOS

### ✅ PROBLEMA 1: QR NO SE GENERA  
**Causa Raíz**: El backend está corriendo pero el frontend no se conecta correctamente

### ✅ PROBLEMA 2: ARQUITECTO NO RESPONDE
**Causa Raíz**: El backend API está corriendo en un puerto diferente al configurado en el proxy

##  📋 CONFIGURACIÓN ACTUAL

**Frontend Proxy** (`artifacts/ventas-pro/vite.config.ts` línea 60):
```typescript
proxy: {
  "/api": {
    target: process.env.VITE_API_URL || "http://localhost:3002",  // ← AQUÍ
    changeOrigin: true,
    secure: false,
    ws: true
  }
}
```

**Puerto configurado**: `3002` (o el valor de `VITE_API_URL`)

## 🚀 SOLUCIÓN PASO A PASO

### PASO 1: Verificar en qué puerto corre el backend

Abre el archivo `artifacts/api-server/src/index.ts` o busca en el código:

```bash
# Buscar el puerto del backend
grep -r "listen" artifacts/api-server/src/
# O buscar PORT en .env
```

**Puertos comunes**:
- `3000` (default)
- `3001` 
- `3002`
- `5000`

### PASO 2: Crear archivo .env para el frontend

Crea o edita: `artifacts/ventas-pro/.env`

```env
# El backend corre en puerto 3002 (verificado en .env y index.ts):
VITE_API_URL=http://localhost:3002

# Si está en producción:
VITE_API_URL=https://tu-dominio.com
```

### PASO 3: Reiniciar ambos servidores

```bash
# Terminal 1 - Backend (desde raíz del proyecto)
cd artifacts/api-server
npm run dev

# Anotar el puerto en el que corre (ejemplo: "Server listening on port 3000")

# Terminal 2 - Frontend (desde raíz del proyecto)
cd artifacts/ventas-pro
npm run dev
```

### PASO 4: Verificar la conexión

Abrir en el navegador:
1. Frontend: `http://localhost:5173` (o el puerto que diga el terminal)
2. Abrir DevTools (F12) → Console
3. Ir a la página de WhatsApp
4. Hacer clic en "Generar QR"
5. Ver en la pestaña Network si hay un request a `/api/whatsapp/connect`

**Si hay error 404 o CORS**: Los puertos no coinciden

## 🔍 DIAGNÓSTICO RÁPIDO

Copia y pega este código en la consola del navegador (DevTools):

```javascript
// Test de conexión al backend
fetch('/api/whatsapp/status')
  .then(r => r.json())
  .then(d => console.log('✅ Backend conectado:', d))
  .catch(e => console.error('❌ Error conectando al backend:', e));

// Test del arquitecto
fetch('/api/code-agent/current')
  .then(r => r.json())
  .then(d => console.log('✅ Arquitecto conectado:', d))
  .catch(e => console.error('❌ Error conectando al arquitecto:', e));
```

**Resultados esperados**:
- ✅ `Backend conectado: { state: "disconnected" ... }`
- ✅ `Arquitecto conectado: { exists: true/false ... }`

**Si hay errores**:
- ❌ `Failed to fetch` → El backend no está corriendo
- ❌ `404 Not Found` → El puerto del proxy no coincide con el backend
- ❌ `CORS error` → Problema de configuración de CORS en el backend

## 🛠️ SOLUCIONES ALTERNATIVAS

### Opción A: Usar el mismo puerto para ambos

Configurar el backend para correr en `3002`:

```typescript
// artifacts/api-server/src/index.ts
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
```

### Opción B: Actualizar el proxy del frontend

El backend corre en puerto 3002 (configurado en .env del backend):

```typescript
// artifacts/ventas-pro/vite.config.ts
proxy: {
  "/api": {
    target: "http://localhost:3002",  // ← Puerto correcto
    changeOrigin: true,
    secure: false,
    ws: true
  }
}
```

### Opción C: Usar una variable de entorno (✅ RECOMENDADO)

```bash
# Crear artifacts/ventas-pro/.env
echo "VITE_API_URL=http://localhost:3002" > artifacts/ventas-pro/.env

# Reiniciar el frontend
cd artifacts/ventas-pro
npm run dev
```

## 📊 CHECKLIST DE VERIFICACIÓN

- [ ] ✅ Backend corriendo (ver terminal con mensaje "Server listening on port XXX")
- [ ] ✅ Frontend corriendo (ver terminal con mensaje "Local: http://localhost:5173")
- [ ] ✅ Puerto del backend coincide con `VITE_API_URL` o el default del proxy
- [ ] ✅ Navegar a `http://localhost:5173/whatsapp`
- [ ] ✅ Abrir DevTools → Network tab
- [ ] ✅ Hacer clic en "Generar QR"
- [ ] ✅ Ver request a `/api/whatsapp/connect` con status 200
- [ ] ✅ Ver QR generado en pantalla
- [ ] ✅ Navegar a `http://localhost:5173/code-agent`
- [ ] ✅ Escribir un mensaje al arquitecto
- [ ] ✅ Ver request a `/api/code-agent/architect` con status 200
- [ ] ✅ Ver respuesta del arquitecto en el chat

## 🎯 COMANDOS DE EJECUCIÓN FINAL

```bash
# ============================================
# SOLUCIÓN COMPLETA - EJECUTAR EN ORDEN
# ============================================

# 1. Ir a la raíz del proyecto
cd c:\Users\ADMIN\Videos\Agent-Sales-Bot

# 2. Iniciar el backend
cd artifacts/api-server
npm install  # Solo la primera vez
npm run dev

# 3. EN OTRA TERMINAL - Iniciar el frontend
cd c:\Users\ADMIN\Videos\Agent-Sales-Bot\artifacts\ventas-pro
npm install  # Solo la primera vez
npm run dev

# 4. Abrir navegador
# Frontend: http://localhost:5173
# Backend API (para testing directo): http://localhost:XXXX/api/whatsapp/status

# 5. Verificar logs
# - Terminal del backend debe mostrar: "Server listening on port XXXX"
# - Terminal del frontend debe mostrar: "Local: http://localhost:5173"

# 6. Testing
# - Ir a http://localhost:5173/whatsapp
# - Clic en "Generar QR"
# - Debe aparecer el QR en 2-5 segundos

# - Ir a http://localhost:5173/code-agent
# - Escribir "Crea un vendedor amigable"
# - Debe responder la IA en 3-10 segundos
```

## 💡 TIPS ADICIONALES

### Si el QR no aparece:
1. Verificar logs del backend: debe decir "QR code generated successfully"
2. Verificar en DevTools → Network: debe haber polling cada 2 segundos a `/api/whatsapp/status`
3. Verificar la respuesta: debe incluir `qrDataUrl` con un string largo que empieza con `data:image/png;base64,`

### Si el arquitecto no responde:
1. Verificar que el backend tenga la API key de OpenCode configurada en `.env`:
   ```env
   OPENCODE_API_KEY=tu_api_key_aqui
   OPENCODE_API_URL=https://api.freemodel.dev/v1
   ```
2. Verificar logs del backend: debe decir "[Architect] Using AI provider"
3. Verificar en DevTools → Network: el request a `/api/code-agent/architect` debe tener status 200

## 🆘 SI NADA FUNCIONA

1. Borrar node_modules y reinstalar:
```bash
# Backend
cd artifacts/api-server
rm -rf node_modules package-lock.json
npm install

# Frontend
cd artifacts/ventas-pro
rm -rf node_modules package-lock.json
npm install
```

2. Verificar que no haya otro proceso usando los puertos:
```bash
# Windows
netstat -ano | findstr :3002
netstat -ano | findstr :5173

# Si hay procesos, matarlos:
taskkill /PID <PID> /F
```

3. Verificar permisos de firewall/antivirus

4. Intentar con puertos diferentes:
```bash
# Backend
PORT=3000 npm run dev

# Frontend  
PORT=5174 npm run dev
```
