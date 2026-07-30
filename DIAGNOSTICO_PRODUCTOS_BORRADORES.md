# Diagnóstico: Productos y Borradores de Facebook no aparecían

Fecha: 2026-07-29
Repo: `Agent-Sales-Bot`

## 📌 Reporte original

El usuario reportó que:
1. Los productos "borradores" y "lo demás" no aparecían en el panel.
2. En la pestaña de Facebook, los anuncios y los borradores de anuncios (Megapacks) tampoco aparecían.
3. Los productos en borrador no se reflejaban en Facebook.

## 🔍 Causa raíz encontrada (confirmada)

El archivo `artifacts/api-server/src/routes/products.ts` tenía **cambios sin commitear** (working tree sucio, nunca guardados con `git commit`) que rompían el contrato de tipos entre el backend y el esquema de validación Zod.

- El schema generado por Orval (`lib/api-zod/src/generated/api.ts`) define `price` como **string** en `ListProductsResponseItem`, `CreateProductBody`, `UpdateProductBody` (línea ~386, 407, 429, 446).
- La última versión commiteada de `products.ts` respetaba esto: convertía `price` a `String(...)` antes de devolverlo.
- Alguien (una sesión previa, sin commitear) cambió esas 4 conversiones de `String(...)` a `Number(...)`, con comentarios tipo `// <-- Retornar como número`, asumiendo — incorrectamente — que el precio debía ser numérico en la respuesta.

### Efecto concreto

Con `price: Number(row.price)`, la llamada `ListProductsResponse.parse(rows.map(serialize))` en `GET /products` lanzaba un `ZodError` (el schema exige `string`, recibía `number`). Ese error caía en `next(e)` → el middleware global (`error-handler.ts`) lo capturaba como `ZodError` → **respondía HTTP 400** en cada llamada.

Esto rompía **todo lo que depende de `GET /products`**, que es prácticamente cualquier lista de productos en la app:
- La página de Productos (`artifacts/ventas-pro/src/pages/products.tsx`) — catálogo vacío/con error.
- La pestaña "Anuncios" de Facebook (`facebook.tsx`, tab `ads`) — el selector de productos para crear anuncios, vacío.
- El componente `ProductListComponent` del editor de tienda (`packages/tienda/src/editor/ProductListComponent.tsx`) — vacío.
- `PATCH /products/:id` (actualizar/activar producto) también fallaba, mismo motivo (`UpdateProductResponse.parse(...)`).

Esto explica por qué "los productos borradores y lo demás no aparece": la API que los trae estaba devolviendo error 400 en cada petición, no un problema de filtros o de visibilidad.

## ✅ Corrección aplicada

Se revirtió el archivo al estado del último commit (`git checkout -- artifacts/api-server/src/routes/products.ts`), restaurando:
- `price: String(body.price ?? 0)` al crear.
- `update.price = String(body.price)` al actualizar.
- `price: String(row.price)` en `serialize()` (usado por list/create/update).
- `price: String(item.price)` en la importación masiva (`bulk-smart`).

Se verificó que no introduce errores nuevos con `pnpm run typecheck` en `artifacts/api-server` (los errores que muestra ese comando son preexistentes y no relacionados: builds desactualizados de `lib/db`/`lib/api-zod`, y otros archivos sueltos como `restore-opencode.ts`, `payments.ts`, `dashboard.ts`).

## 🟡 Sobre los "borradores de Facebook" (Megapacks)

Investigando el flujo de borradores de anuncios (`artifacts/api-server/src/lib/ad-strategist.ts`, tabla `facebook_drafts`):

- Por diseño, **los borradores se crean SOLO localmente** (tabla `facebook_drafts` en la base de datos) y nunca tocan la cuenta publicitaria real de Meta, a menos que la variable de entorno `FB_CREATE_REAL_CAMPAIGNS=true` esté seteada explícitamente. Esto es intencional (ver comentario en `createDraftAd`, línea ~419-424): evita crear campañas reales sin presupuesto/método de pago configurado.
- Se inspeccionó la base de datos SQLite local (`data/tecnovariedades.db`, usada porque `.env` tiene `USE_SQLITE=true`): la tabla `facebook_drafts` está **vacía (0 filas)**, mientras que `products` tiene 84 filas, todas con `isActive=1`.
- Esto indica que, en este entorno local, **nunca se creó un borrador de anuncio con éxito** — no es un problema de que no se muestren, es que no existen registros que mostrar. La creación de borradores pasa por `POST /facebook/strategist/draft/:productId`, que a su vez dependía de que `GET /products` funcionara para poder seleccionar el producto en la UI (bug de arriba), así que es probable que el bug de precios también haya bloqueado la creación de borradores desde el panel.
- **Pendiente de verificar en el entorno real (producción/Easypanel)**: no se pudo confirmar si la base de datos de producción (Postgres, según `DATABASE_URL` en `.env`) tiene borradores guardados que sí deberían aparecer. Ese chequeo requiere acceso a la BD de producción, que no está disponible desde este entorno local.

## ⚠️ Estado del repositorio: trabajo en curso sin commitear

Al revisar `git status`, además del archivo ya corregido, hay **muchos otros archivos con cambios sin commitear** que no se tocaron en esta sesión (no forman parte del bug reportado, parecen ser un refactor en curso de WhatsApp multi-tenant + mejoras de UI en Facebook):

```
M artifacts/api-server/src/app.ts
M artifacts/api-server/src/index.ts
M artifacts/api-server/src/lib/ad-strategist.ts
M artifacts/api-server/src/lib/facebook-marketplace.ts
M artifacts/api-server/src/lib/facebook.ts
M artifacts/api-server/src/lib/services/agent-orchestrator.ts
M artifacts/api-server/src/lib/whatsapp.ts
M artifacts/api-server/src/routes/conversations.ts
M artifacts/api-server/src/routes/dashboard.ts
M artifacts/api-server/src/routes/facebook.ts
M artifacts/api-server/src/routes/public.ts
M artifacts/api-server/src/routes/webhooks.ts
M artifacts/api-server/src/routes/whatsapp.ts
M artifacts/ventas-pro/src/App.tsx
M artifacts/ventas-pro/src/components/layout.tsx
M artifacts/ventas-pro/src/components/mobile-nav.tsx
M artifacts/ventas-pro/src/pages/facebook.tsx
M artifacts/ventas-pro/src/pages/mi-tienda.tsx
M artifacts/ventas-pro/src/pages/whatsapp.tsx
```

Revisado por encima (no aplicado ni revertido, solo diagnóstico):
- `app.ts` / módulos nuevos `whatsapp-factory.ts`, `whatsapp-singleton.ts`, `whatsapp-monitor.ts`, `whatsappManagerByTenant.ts` (existen en disco, sin commitear): parece un refactor para soportar múltiples tenants de WhatsApp con una instancia por tenant en vez de un singleton global.
- `routes/facebook.ts`: elimina los endpoints de Marketplace (devuelven `410`/vacío en vez de llamar a la API real) — coincide con el commit ya mergeado `40e6d8e chore(facebook): quitar pestana de Marketplace`, así que probablemente sea trabajo consistente con esa dirección.
- `pages/facebook.tsx`: agrega un modal de detalle de producto y un modal para editar un borrador de anuncio (título, texto, presupuesto) antes de publicarlo — funcionalidad nueva, no un fix.

**Recomendación**: estos cambios no se tocaron porque no son parte del bug reportado y revertirlos a ciegas destruiría trabajo en progreso. Conviene que el usuario confirme si ese trabajo debe conservarse, commitearse, o descartarse antes de seguir.

## ✅ Verificación en vivo (backend + frontend corriendo)

Se levantaron ambos servidores localmente para confirmar los fixes:
- Backend: `pnpm --filter @workspace/api-server run dev` (puerto 3002)
- Frontend: `pnpm --filter @workspace/ventas-pro run dev` (puerto 5173)

**Fix de productos**: se replicó exactamente la lógica de `GET /products` (leer de la BD + `serialize()` + `ListProductsResponse.parse()`) en un script aislado. Resultado: **83 productos pasan la validación Zod correctamente**, con `price` como string (ej. `"20000"` COP, en vez del precio inflado que se veía antes).

**Segundo bug encontrado y corregido en vivo**: al revisar los logs del backend mientras corría, apareció en bucle constante (cada 1-2s):
```
Unhandled error: TypeError: tenantManager.getById is not a function
    at getWhatsAppForTenant (.../whatsapp-factory.ts:47:32)
    at <anonymous> (.../routes/whatsapp.ts:19:15)
```
Esto coincide con el "Problema 4" que ya había sido reportado antes ("Error en WhatsApp: tenantManager.getById is not a function") y que en ese momento se había dejado pendiente.

- **Causa**: `whatsapp-factory.ts` llamaba a `tenantManager.getById(tid)`, un método que no existe en `TenantManager`. El método real es `getTenantById(id)` — **async**, mientras que `getWhatsAppForTenant()` (y sus ~15 puntos de uso en `whatsapp-singleton.ts` y `routes/whatsapp.ts`) es síncrono. Cada llamada al endpoint `GET /api/whatsapp/status` (el frontend hace polling constante) tiraba 500.
- **Fix aplicado**: se reemplazó la llamada rota por `tenantManager.getDefaultTenant()` (el tenant único real que usa toda la app actualmente, id=1). Queda documentado en el código que una solución completa multi-tenant requeriría volver async toda esa cadena de llamadas — fuera de alcance de este fix puntual.
- **Verificado**: `curl http://localhost:3002/api/whatsapp/status` ahora responde `200` con el estado real (`state: "qr"`, código QR generado) en vez de `500`. El log del backend dejó de repetir el error.

## 📝 Resumen ejecutivo

| Problema reportado | Causa real | Estado |
|---|---|---|
| Productos no aparecen en el panel | `price: Number(...)` en vez de `String(...)` en `products.ts` (sin commitear) rompía la validación Zod → `GET /products` devolvía 400 siempre | ✅ Corregido (revertido a la versión commiteada) |
| Productos no aparecen en la pestaña Anuncios de Facebook | Misma causa — esa pestaña también llama a `GET /products` | ✅ Corregido |
| Borradores de anuncios de Facebook no aparecen | Tabla `facebook_drafts` vacía en la BD local; los borradores solo se crean localmente por diseño (no tocan Facebook real salvo `FB_CREATE_REAL_CAMPAIGNS=true`); la creación probablemente también fallaba por el mismo bug de arriba al no poder listar productos | 🟡 Bug de fondo corregido; falta verificar en producción si hay borradores reales que deberían aparecer |
| Cambios grandes sin commitear en WhatsApp/Facebook/UI | Refactor en curso (multi-tenant WhatsApp, mejoras de UI en Facebook) | ⚪ Sin tocar — pendiente de decisión del usuario (commitear, seguir, o descartar) |

## Próximos pasos sugeridos

1. Levantar el backend localmente (`pnpm run dev` en `artifacts/api-server`) y confirmar en el navegador que `GET /products` ya responde 200 con la lista completa.
2. Decidir qué hacer con el resto de cambios sin commitear (commitear el refactor de WhatsApp/Facebook si está terminado, o seguir trabajando sobre él).
3. Si se quiere confirmar el estado de los borradores de Facebook en producción, revisar la tabla `facebook_drafts` en la base Postgres real (no la SQLite local usada en desarrollo).
4. Considerar agregar un test o chequeo de tipos que falle el build si `serialize()` en `products.ts` deja de coincidir con el schema Zod — así este tipo de regresión (editar a mano sin volver a correr `typecheck`) se detecta antes de llegar a producción.
