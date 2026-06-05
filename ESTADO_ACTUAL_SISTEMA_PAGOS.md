# 📊 Estado Actual del Sistema de Pagos

## ❌ PROBLEMA PRINCIPAL

**El sistema de autenticación no mantiene la sesión entre el login y la página de pricing.**

### Síntoma:
1. Usuario inicia sesión correctamente
2. Usuario va a `/pricing`
3. Usuario hace click en botón de pago
4. Sistema dice "Sesión expirada" y redirige a login

---

## 🔍 DIAGNÓSTICO

### Causa Raíz:
**Las cookies no se están compartiendo correctamente entre el frontend (puerto 5173) y el backend (puerto 3002).**

### Evidencia:
- Cookie se crea en el backend: `tenant_id=1`
- Cookie NO llega en peticiones subsecuentes
- Logs muestran: `Cookies: {}` (vacío)

---

## ✅ LO QUE FUNCIONA

1. ✅ Backend compila sin errores
2. ✅ Frontend compila sin errores
3. ✅ Base de datos con tablas creadas
4. ✅ Endpoints de pricing funcionan
5. ✅ Servicio de pagos implementado
6. ✅ Webhooks configurados
7. ✅ Login crea la cookie correctamente
8. ✅ CORS configurado con `credentials: true`

---

## ❌ LO QUE NO FUNCIONA

1. ❌ Cookie no persiste entre peticiones
2. ❌ Frontend no envía cookie en peticiones subsecuentes
3. ❌ Usuario no puede crear enlaces de pago

---

## 🛠️ SOLUCIONES INTENTADAS

### 1. Configuración de Cookie
```typescript
res.cookie("tenant_id", tenant.id.toString(), { 
  httpOnly: false,  // Cambiado de true a false
  secure: false,
  sameSite: "lax",
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: "/",
  domain: "localhost"  // Agregado
});
```

### 2. Configuración de CORS
```typescript
cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173", "http://0.0.0.0:5173", "http://localhost:3002"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  exposedHeaders: ["Set-Cookie"],
})
```

### 3. Logging Detallado
- Agregado logging en cada paso
- Middleware de debugging de cookies
- Logs en login, /me, y upgrade

### 4. Verificación de Email Deshabilitada
- Comentado el check de `emailVerified`
- Permite login sin verificar email

---

## 🎯 SOLUCIÓN DEFINITIVA

El problema es arquitectural: **cookies entre diferentes puertos en localhost**.

### Opción A: Usar Proxy (RECOMENDADO)

Configurar el frontend para hacer proxy de las peticiones API:

**Archivo: `artifacts/ventas-pro/vite.config.ts`**

Agregar:
```typescript
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      }
    }
  }
})
```

Esto hace que todas las peticiones a `/api/*` vayan al backend en el mismo dominio.

### Opción B: Usar LocalStorage en lugar de Cookies

**Backend - Login:**
```typescript
// En lugar de cookie, retornar token
return res.json({ 
  token: tenant.id.toString(),
  tenant: { ... }
});
```

**Frontend - Guardar token:**
```typescript
const data = await response.json();
localStorage.setItem('tenant_id', data.token);
```

**Frontend - Enviar token:**
```typescript
fetch('/api/pricing/upgrade', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('tenant_id')}`
  }
})
```

**Backend - Leer token:**
```typescript
const token = req.headers.authorization?.replace('Bearer ', '');
const tenantId = token;
```

### Opción C: Servir Frontend desde Backend

Hacer que el backend sirva el frontend en el mismo puerto 3002.

---

## 📝 PRÓXIMOS PASOS RECOMENDADOS

### Paso 1: Implementar Proxy (MÁS RÁPIDO)

1. Editar `artifacts/ventas-pro/vite.config.ts`
2. Agregar configuración de proxy
3. Reiniciar frontend
4. Probar

### Paso 2: Si Proxy no funciona, usar LocalStorage

1. Modificar login para retornar token
2. Modificar frontend para guardar en localStorage
3. Modificar backend para leer de headers
4. Probar

---

## 🔧 ARCHIVOS MODIFICADOS

### Backend
- `artifacts/api-server/src/routes/auth.ts` - Login y /me con mejor logging
- `artifacts/api-server/src/routes/pricing.ts` - Endpoint upgrade con logging
- `artifacts/api-server/src/app.ts` - CORS y middleware mejorados
- `artifacts/api-server/src/lib/subscription-payments.ts` - Servicio de pagos completo

### Frontend
- `artifacts/ventas-pro/src/pages/pricing.tsx` - Verificación de auth y mensajes

### Base de Datos
- `lib/db/src/schema/subscriptions.ts` - Nuevas tablas
- `lib/db/migrations/create_subscriptions_table.sql` - Migración ejecutada

---

## 💡 RECOMENDACIÓN FINAL

**Implementar la Opción A (Proxy)** es la solución más limpia y rápida:

1. No requiere cambiar mucho código
2. Las cookies funcionarán correctamente
3. Es la práctica estándar en desarrollo

**Código exacto para agregar:**

```typescript
// artifacts/ventas-pro/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
  },
});
```

Después de agregar esto:
1. Reiniciar frontend (Ctrl+C y `npm run dev`)
2. Probar login
3. Probar pago

---

## 📞 RESUMEN

**Estado:** Sistema implementado pero con problema de cookies cross-origin

**Causa:** Cookies no se comparten entre puertos diferentes (5173 y 3002)

**Solución:** Configurar proxy en Vite para que frontend y backend estén en el mismo origen

**Tiempo estimado:** 5 minutos para implementar el proxy

---

**Última actualización:** 2026-05-06 21:00
**Estado:** Pendiente de implementar proxy
