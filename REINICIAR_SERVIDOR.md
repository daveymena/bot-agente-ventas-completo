## 🚀 SOLUCIÓN RÁPIDA (Automatizada)

Si estás en Windows, he creado un script que hace todo el trabajo sucio por ti (detiene procesos bloqueados, limpia caché e inicia todo):

1. Abre una terminal en la carpeta raíz del proyecto.
2. Ejecuta:
   ```powershell
   ./REINICIAR.ps1
   ```

Este script:
- Mata cualquier proceso en los puertos **3002** y **5173**.
- Limpia la carpeta `dist`.
- Abre dos ventanas nuevas con el Backend y Frontend.

---

## ✅ SOLUCIÓN MANUAL: Reinicio Completo

### Paso 1: Detener TODO

```bash
# En la terminal donde corre el servidor
# Presiona: Ctrl + C

# Si no responde, cierra la terminal completamente
```

### Paso 2: Limpiar Caché

```bash
# Eliminar node_modules del api-server
cd artifacts/api-server
rm -rf node_modules
rm -rf dist

# Eliminar node_modules del db
cd ../../lib/db
rm -rf node_modules

# Volver a la raíz
cd ../..
```

### Paso 3: Reinstalar Dependencias

```bash
# Instalar dependencias del workspace completo
npm install

# O si usas pnpm
pnpm install
```

### Paso 4: Recompilar Backend

```bash
cd artifacts/api-server
npm run build
```

**Debes ver:**
```
✓ dist\index.mjs                      11.0mb
✓ dist\pino-worker.mjs               153.4kb
...
Done in 600ms
```

### Paso 5: Iniciar Servidor

```bash
# Desde artifacts/api-server
npm run dev
```

**Debes ver:**
```
🔍 [DOTENV] Buscando configuración en: ...
📡 [DB-CONNECTION] Intentando conectar a: postgres://...
[Frontend] ✅ index.html found
Server listening on http://0.0.0.0:3002
```

---

## 🧪 VERIFICAR QUE FUNCIONA

### Test 1: Health Check

```bash
curl http://localhost:3002/api/health
```

**Debe responder:**
```json
{"status":"ok","timestamp":"..."}
```

### Test 2: Get Plans

```bash
curl http://localhost:3002/api/pricing
```

**Debe responder:**
```json
{"plans":[...]}
```

### Test 3: Upgrade (Sin Auth - Debe dar 401)

```bash
curl -X POST http://localhost:3002/api/pricing/upgrade \
  -H "Content-Type: application/json" \
  -d '{"newPlan":"starter","billingCycle":"monthly","paymentMethod":"mercadopago"}'
```

**Debe responder:**
```json
{"error":"Unauthorized","message":"Debes iniciar sesión para actualizar tu plan"}
```

✅ Si ves este mensaje, el endpoint está funcionando!

---

## 🐛 SI AÚN SE CAE EL SERVIDOR

### Ver el Error Exacto

Cuando el servidor se cae, verás un error en la terminal. **Copia ese error completo**.

Busca líneas como:
```
Error: Cannot find module '@workspace/db'
Error: subscriptions is not exported from '@workspace/db'
TypeError: Cannot read property 'createPaymentLink' of undefined
```

### Errores Comunes y Soluciones

#### Error: "Cannot find module '@workspace/db'"

**Solución:**
```bash
# Reinstalar dependencias
cd lib/db
npm install
cd ../../artifacts/api-server
npm install
npm run build
```

#### Error: "subscriptions is not exported"

**Solución:**
```bash
# Verificar que el archivo existe
ls lib/db/src/schema/subscriptions.ts

# Verificar que está exportado
cat lib/db/src/schema/index.ts | grep subscriptions

# Si no está, agregarlo:
echo 'export * from "./subscriptions";' >> lib/db/src/schema/index.ts
```

#### Error: "SubscriptionPaymentService is not defined"

**Solución:**
```bash
# Verificar que el archivo existe
ls artifacts/api-server/src/lib/subscription-payments.ts

# Recompilar
cd artifacts/api-server
npm run build
```

---

## 📊 LOGS DETALLADOS

Ahora el servidor tiene logging MUY detallado. Cuando hagas click en un botón de pago, verás:

```
[Pricing] Upgrade request received
  tenant: { id: 1, email: "..." }

[Pricing] Request body
  newPlan: "starter"
  billingCycle: "monthly"
  paymentMethod: "mercadopago"

[Pricing] Creating payment link...
  tenantId: 1
  currentPlan: "enterprise"
  newPlan: "starter"

[SubscriptionPayment] Iniciando creación de enlace de pago
[SubscriptionPayment] Monto calculado
[SubscriptionPayment] Tenant encontrado
[SubscriptionPayment] Creando registro de suscripción en BD...
[SubscriptionPayment] Suscripción creada en BD
[SubscriptionPayment] Generando enlace de pago...
[SubscriptionPayment] Iniciando creación de pago MercadoPago
[SubscriptionPayment] Request body para MercadoPago
[SubscriptionPayment] Response de MercadoPago
[SubscriptionPayment] Enlace de MercadoPago creado exitosamente

[Pricing] Payment link created successfully
```

**Si el servidor se cae, verás EXACTAMENTE en qué línea falló.**

---

## 🎯 ALTERNATIVA: Modo Debug

Si quieres ver AÚN MÁS detalles:

```bash
# Iniciar con debug de Node.js
cd artifacts/api-server
NODE_OPTIONS='--trace-warnings' npm run dev
```

Esto mostrará warnings y stack traces completos.

---

## 📝 CHECKLIST ANTES DE PROBAR

Antes de hacer click en un botón de pago, verifica:

- [ ] Servidor corriendo sin errores
- [ ] Health check responde OK
- [ ] Get plans responde con 4 planes
- [ ] Estás logueado en la aplicación
- [ ] Cookie `tenant_id` existe en el navegador
- [ ] No hay errores en la consola del navegador

---

## 🆘 SI NADA FUNCIONA

Como último recurso, prueba con un endpoint simplificado:

1. **Comenta temporalmente el servicio de pagos**
2. **Retorna un enlace fake**
3. **Verifica que el endpoint responde**

Edita `artifacts/api-server/src/routes/pricing.ts`:

```typescript
// POST /api/pricing/upgrade
router.post("/upgrade", async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // TEMPORAL: Retornar enlace fake
    return res.json({
      message: "Plan upgrade initiated",
      paymentUrl: "https://www.mercadopago.com.co",
      paymentId: "fake-123",
      subscriptionId: 1,
      amount: 29,
      currency: "USD"
    });
  } catch (error: any) {
    logger.error({ error }, "Error");
    res.status(500).json({ error: error.message });
  }
});
```

Si esto funciona, el problema está en `SubscriptionPaymentService`.

---

## 📞 INFORMACIÓN PARA SOPORTE

Si necesitas ayuda, proporciona:

1. **Error completo del servidor** (últimas 100 líneas)
2. **Comando usado para iniciar:** `npm run dev`
3. **Versión de Node.js:** `node --version`
4. **Sistema operativo:** Windows
5. **Resultado de:**
   ```bash
   ls lib/db/src/schema/subscriptions.ts
   cat lib/db/src/schema/index.ts | grep subscriptions
   ```

---

**Última actualización:** 2026-05-06 20:30
**Estado:** Debugging en progreso
