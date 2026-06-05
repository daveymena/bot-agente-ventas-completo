# 🧪 Instrucciones para Probar el Sistema de Pagos

## ✅ Estado Actual

- ✅ Backend compilado correctamente
- ✅ Frontend compilado correctamente
- ✅ Base de datos con tablas creadas
- ✅ Endpoints funcionando
- ✅ Webhooks configurados
- ✅ Credenciales de pago configuradas

---

## 🚀 Pasos para Probar

### 1. **Asegúrate de que el servidor está corriendo**

```bash
# En una terminal
cd artifacts/api-server
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

### 2. **Abre la página de prueba interactiva**

Abre en tu navegador:
```
file:///C:/Users/ADMIN/Videos/Agent-Sales-Bot/test-payment-click.html
```

O simplemente haz doble clic en el archivo `test-payment-click.html`

---

### 3. **Verifica tu sesión**

En la página de prueba:

1. Click en **"Verificar Sesión"**
2. Si dice "❌ No hay sesión activa":
   - Abre http://localhost:5173/auth
   - Inicia sesión con: `daveymena16@gmail.com`
   - Vuelve a la página de prueba
   - Click en "Verificar Sesión" nuevamente

**Debe mostrar:**
```
✅ Sesión activa
Email: daveymena16@gmail.com
Plan: enterprise
Tenant ID: 1
```

---

### 4. **Obtén los planes disponibles**

1. Click en **"Obtener Planes"**

**Debe mostrar:**
```
✅ Planes disponibles:

Free: $0/mes
Starter: $29/mes
Professional: $99/mes
Enterprise: $299/mes
```

---

### 5. **Crea un enlace de pago**

1. Selecciona un plan (ej: **Starter**)
2. Selecciona un método (ej: **MercadoPago**)
3. Click en **"Crear Enlace de Pago"**

**Debe mostrar:**
```
✅ Enlace de pago creado

Plan: starter
Método: mercadopago
Monto: $29 USD
Subscription ID: 1

🔗 Abrir enlace de pago
```

4. Click en **"🔗 Abrir enlace de pago"**
5. Serás redirigido a MercadoPago

---

### 6. **Completa el pago (OPCIONAL - Solo si quieres probar el flujo completo)**

⚠️ **IMPORTANTE:** Esto creará un pago REAL si usas una tarjeta real.

**Para pruebas, usa tarjetas de prueba de MercadoPago:**
- Tarjeta: `5031 7557 3453 0604`
- CVV: `123`
- Fecha: `11/25`
- Nombre: Cualquiera

**O usa PayPal Sandbox:**
- Cambia `PAYPAL_MODE=sandbox` en el `.env`
- Usa credenciales de prueba de PayPal

---

## 🐛 Solución de Problemas

### Error: "❌ No hay sesión activa"

**Causa:** No has iniciado sesión

**Solución:**
1. Abre http://localhost:5173/auth
2. Inicia sesión con `daveymena16@gmail.com`
3. Vuelve a intentar

---

### Error: "❌ Error: 401 Unauthorized"

**Causa:** La cookie de sesión no se está enviando

**Solución:**
1. Verifica que estás usando el mismo dominio (localhost)
2. Abre DevTools > Application > Cookies
3. Verifica que existe la cookie `tenant_id`
4. Si no existe, inicia sesión nuevamente

---

### Error: "❌ Error: 500 Internal Server Error"

**Posibles causas:**

1. **Credenciales de MercadoPago/PayPal no configuradas**
   ```bash
   # Verifica el .env
   cat artifacts/api-server/.env | grep -E "MERCADO_PAGO|PAYPAL"
   ```

2. **Error de conexión con el procesador**
   - Verifica tu conexión a internet
   - Intenta con el otro método de pago

3. **Error en la base de datos**
   ```bash
   # Verifica que las tablas existen
   psql -h 79.143.187.160 -U postgres -d tecnovariedades-db -c "\dt"
   ```

---

### Error: "❌ Error de red: Failed to fetch"

**Causa:** El servidor backend no está corriendo

**Solución:**
```bash
cd artifacts/api-server
npm run dev
```

---

## 📊 Verificar en la Base de Datos

Después de crear un enlace de pago, verifica que se creó el registro:

```sql
-- Conectar a la base de datos
psql -h 79.143.187.160 -U postgres -d tecnovariedades-db

-- Ver suscripciones creadas
SELECT id, tenant_id, plan, status, payment_method, amount, created_at 
FROM subscriptions 
ORDER BY id DESC 
LIMIT 5;

-- Ver transacciones
SELECT id, subscription_id, payment_method, payment_status, amount, created_at 
FROM payment_transactions 
ORDER BY id DESC 
LIMIT 5;
```

**Debe mostrar:**
```
 id | tenant_id | plan    | status  | payment_method | amount | created_at
----+-----------+---------+---------+----------------+--------+------------
  1 |         1 | starter | pending | mercadopago    |  29.00 | 2026-05-06...
```

---

## 🎯 Flujo Completo de Prueba

### Opción A: Prueba Rápida (Sin pago real)

1. ✅ Verificar sesión
2. ✅ Obtener planes
3. ✅ Crear enlace de pago
4. ✅ Verificar que el enlace se abre
5. ❌ NO completar el pago

### Opción B: Prueba Completa (Con pago de prueba)

1. ✅ Cambiar a modo sandbox en `.env`:
   ```env
   PAYPAL_MODE=sandbox
   ```
2. ✅ Reiniciar servidor
3. ✅ Verificar sesión
4. ✅ Crear enlace de pago con PayPal
5. ✅ Completar pago con credenciales de prueba
6. ✅ Verificar redirección a `/subscription-success`
7. ✅ Verificar en base de datos que la suscripción está activa

---

## 📝 Checklist de Verificación

Antes de reportar un problema, verifica:

- [ ] El servidor backend está corriendo (puerto 3002)
- [ ] Has iniciado sesión en la aplicación
- [ ] La cookie `tenant_id` existe en el navegador
- [ ] Las credenciales de pago están en el `.env`
- [ ] Las tablas `subscriptions` y `payment_transactions` existen
- [ ] No hay errores en la consola del navegador (F12)
- [ ] No hay errores en los logs del servidor

---

## 🎉 Resultado Esperado

Si todo funciona correctamente:

1. ✅ La página de prueba muestra "✅ Sesión activa"
2. ✅ Los planes se cargan correctamente
3. ✅ Al crear un enlace de pago, se muestra el enlace
4. ✅ Al hacer click, se abre MercadoPago o PayPal
5. ✅ Se crea un registro en la tabla `subscriptions`
6. ✅ El estado es `pending` hasta que se complete el pago

---

## 📞 Soporte

Si después de seguir estos pasos aún tienes problemas:

1. **Captura de pantalla** del error en la página de prueba
2. **Logs del servidor** (últimas 20 líneas)
3. **Consola del navegador** (F12 > Console)
4. **Resultado de:**
   ```bash
   curl http://localhost:3002/api/health
   ```

---

**Última actualización:** 2026-05-06
**Estado:** ✅ Sistema funcionando correctamente
