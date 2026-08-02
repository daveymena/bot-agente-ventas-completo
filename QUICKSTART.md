# 🚀 Quick Start - VentasPro SaaS Multi-Tenant

## Para poner en marcha INMEDIATAMENTE

### 1. Actualizar Schema (1 minuto)

```bash
cd lib/db
pnpm run db:generate
pnpm run db:migrate
cd ../..
```

### 2. Marcar tu usuario como Admin (30 segundos)

```bash
node scripts/create-admin-user.mjs --email=daveymena16@gmail.com
```

### 3. Migrar variables del .env a la BD (opcional, 30 segundos)

```bash
node scripts/migrate-env-to-tenant.mjs
```

Esto copia tus credenciales actuales del `.env` al tenant 1 en la base de datos.

### 4. Rebuild y Restart (1 minuto)

```bash
pnpm run build
pnpm run dev
```

---

## ✅ ¡Listo! Ahora tienes:

### Como Admin (daveymena16@gmail.com):

- ✓ Ver todas las instancias WhatsApp: `GET /api/whatsapp/instances`
- ✓ Métricas globales: `GET /api/whatsapp/metrics`
- ✓ Limpiar instancias: `POST /api/whatsapp/cleanup`
- ✓ Control total del sistema

### WhatsApp QR mejorado:

- ✓ Timeout 30s (antes 6s)
- ✓ 3 reintentos automáticos
- ✓ Logs detallados
- ✓ Diagnóstico de red: `GET /api/whatsapp/network-check`

### Configuración Multi-Tenant:

- ✓ Cada tenant configura sus credenciales en dashboard
- ✓ API: `GET /api/tenant-config/all`
- ✓ Facebook, Pagos, Email, API Keys
- ✓ Fallback automático a variables .env

---

## 🧪 Probar que todo funciona

### Test 1: Admin Status

```bash
curl http://localhost:3002/api/auth/me \
  -H "Cookie: tenant_id=s:1..." \
  | jq '.isAdmin'
# Debe devolver: true
```

### Test 2: WhatsApp Network Check

```bash
curl http://localhost:3002/api/whatsapp/network-check \
  -H "Cookie: tenant_id=s:1..." \
  | jq '.diagnosis'
```

### Test 3: Ver Config Actual

```bash
curl http://localhost:3002/api/tenant-config/all \
  -H "Cookie: tenant_id=s:1..." \
  | jq '.tenant.isAdmin'
# Debe devolver: true
```

### Test 4: WhatsApp Connect (con reintentos)

```bash
curl -X POST http://localhost:3002/api/whatsapp/connect \
  -H "Cookie: tenant_id=s:1..." \
  | jq '{state, qrDataUrl}'
```

---

## 📖 Documentación Completa

- **RESUMEN_CAMBIOS.md** - Qué se cambió y por qué
- **MEJORAS_IMPLEMENTADAS.md** - Detalles técnicos completos
- **GUIA_CONFIGURACION_SAAS.md** - Guía paso a paso
- **Este archivo (QUICKSTART.md)** - Inicio rápido

---

## 🔥 Troubleshooting Rápido

### QR no aparece o se queda cargando

```bash
# Diagnóstico
curl http://localhost:3002/api/whatsapp/network-check

# Reiniciar sesión
curl -X POST http://localhost:3002/api/whatsapp/reset-session \
  -H "Cookie: tenant_id=s:1..."
```

### No puedo acceder a rutas de admin

```bash
# Verificar que eres admin
node scripts/create-admin-user.mjs --email=tu_email@gmail.com
```

### Variables no se aplican

```bash
# Re-migrar desde .env
node scripts/migrate-env-to-tenant.mjs

# O borrar config en BD para volver a fallback
# DELETE FROM tenants WHERE id = 1; -- NO HAGAS ESTO
# Mejor: actualiza desde el dashboard
```

---

## 🎯 Próximo Paso

Crear el frontend para configuración:
- Página: `/settings/integrations`
- Formularios para Facebook, Pagos, Email, API Keys
- Validación en tiempo real
- Indicadores de "credentials válidas"

Ver `artifacts/ventas-pro/src/pages/settings.tsx` como referencia.

---

**¿Necesitas ayuda?**  
Revisa los archivos de documentación o contacta: daveymena16@gmail.com

**Estado:** ✅ Backend completo y funcional  
**Pendiente:** Frontend UI (opcional, la API funciona)
