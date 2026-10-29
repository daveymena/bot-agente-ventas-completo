# Brief de pendientes · VentasPro (para retomar sin preguntas)

Fecha de corte: 2026-10-22. Repo: `daveymena/bot-agente-ventas-completo`.
Worktree de trabajo: `C:\Users\ADMIN\Videos\meta-multitenant` (rama local `meta-multitenant`).

## 0. Reglas de seguridad (leer primero)

- **No hacer deploy** en EasyPanel sin confirmación explícita del dueño. El auto-deploy
  de `bot-agenwhatsapp` NO está verificado: puede estar activo. Antes de cualquier push
  a `para-subir`, confirmar el estado del auto-deploy en EasyPanel.
- **No usar credenciales guardadas** (ni de memoria ni de `.env`) para entrar a EasyPanel,
  Meta o Comet. Si hace falta acceso, pedirlo al dueño.
- **No teclear en navegadores ni ventanas del dueño** (Comet, Chrome, MetaTrader).
  Solo captura de pantalla o lectura.
- **No borrar catálogos ni productos** en Commerce Manager: lo decide el dueño.
- Ante un diálogo de contraseña abierto en pantalla (MetaTrader 5 tuvo uno con 6 caracteres
  que nadie escribió), no tocarlo: avisar al dueño.

## 1. Estado del código

### Subido a `origin/para-subir` (head remoto: `e3576c1`)
- Menú en cuatro bloques, búsqueda Cmd+K, barra superior (`853096c`).
- Cola de Meta, métricas propias, exclusión por cuenta, worker (`efc90b2`, `eaf74ff`,
  `dc6986e`, `48234ee`, `1d88499`, `8ac0efe`, `64e0de2`).
- Vista previa del anuncio: constructor y componente (`e8d3b19`).
- Vendedor de WhatsApp: responder primero, sin preguntas de calificación innecesarias (`e3576c1`).

### Solo en LOCAL (no subido)
- `3d819ff` sistema visual: acento índigo suave y radios de 12px (`index.css`).
- `3170085` payload del catálogo de Meta con nombres de campo correctos
  (`name`, `retailer_id`, `availability`, `condition`, `brand`; imagen y enlace https).
- `0ae4090` sesión: un 401 aislado ya no saca al usuario; se confirma con `/api/auth/me`.

### Cambios SIN commit (no terminados)
- `artifacts/api-server/src/lib/app-operator.ts`: función `previewDelBorrador` y
  `crear_anuncio` devuelve `data.preview`. Falta verificar con un anuncio real.
- `artifacts/api-server/src/routes/code-agent.ts`: guarda `vistaPreviaDelTurno` y lo
  añade a la respuesta de Atlas. Falta probar en el chat.
- `tsc` marca errores de tipos en `app-operator.ts` que YA existían (líneas 1257, 3826,
  3831, 5511, 8831). No son de estos cambios.

### Respaldo del frontend anterior
- Rama `frontend-respaldo-2026-10-22` y tag `respaldo-frontend-2026-10-22` (commit `64e0de2`).

## 2. Meta · catálogo (pendiente del dueño y de Claude)

Estado: el error de subida era `(#100) Missing Permission catalog_management`.
Otro agente dijo haber agregado el caso de uso de catálogos a la app
`ventas-pro`. Eso NO está verificado aquí.

Pasos, en orden:
1. En developers.facebook.com → app `ventas-pro` → verificar que el caso de uso
   "Administra los productos con la API de catálogo" está activo, y que
   `catalog_management` figura en la configuración de Facebook Login for Business
   usada por VentasPro.
2. En VentasPro → página de Facebook: poner el **Catalog ID real** (número largo de
   Commerce Manager). El campo tenía el texto literal `FB_CATALOG_ID`: eso es inválido.
   No usar el ejemplo `1301555601791383`: no se sabe que sea el del dueño.
3. Desconectar y volver a conectar la cuenta, dejando marcado el permiso de catálogos.
   Sin reconectar, el token sigue sin el permiso.
4. Subir el catálogo. Si falla, copiar el mensaje EXACTO de Meta (código y subcódigo).
   El sistema ahora valida cada producto antes de enviarlo y muestra el motivo si no
   cumple (sin imagen https pública, sin `APP_URL` https, precio no válido).
5. Duplicados `Catalog_Products` en Commerce Manager: solo los borra el dueño.

Límite comercial: "Listo para prueba" solo sirve para administradores de la app.
Para que clientes externos conecten su catálogo, `catalog_management` (y el resto de
permisos de Facebook Login) debe pasar la revisión de Meta (App Review).

Precio del catálogo: se envía como `N COP` (ej. `89900 COP`). Las fuentes de Meta que
revisamos dicen que el precio va en unidades menores; NO está confirmado para COP.
Si Meta rechaza el precio, revisar ese formato con el mensaje exacto.

## 3. Facebook y anuncios

- Requisitos del cliente: página de Facebook, cuenta publicitaria con método de pago,
  permisos aceptados en el diálogo, Instagram opcional.
- Login: el `config_id` de la app manda; el `scope` del código se ignora. Revisar la
  configuración en developers.facebook.com.
- Modo desarrollo: solo administradores y probadores pueden conectar.

## 4. Vista previa del anuncio en Atlas (en curso)

Objetivo: que Atlas muestre en el chat el anuncio tal como saldrá (imagen, texto,
botón), antes de publicarlo.
- Hecho: constructor con saneado del HTML (`lib/vista-previa-anuncio.ts`, 8 pruebas),
  componente `vista-previa-anuncio.tsx`, campo `preview` en el mensaje del chat.
- Falta: probar que `crear_anuncio` devuelva la vista previa y que aparezca en el chat.
  Revisar que la imagen sea la real del borrador (`imageUrl` / `images`).

## 5. WhatsApp (vendedor)

- Corregido: el vendedor responde primero lo que el cliente pregunta. Regla en
  `lib/motor-nuevo/motor.ts` ("RESPUESTA DIRECTA") y `que_falta_para_cerrar` solo se usa
  cuando el cliente quiere comprar. Pruebas en `motor-nuevo/__tests__/respuesta-directa.test.ts`.
- Falta: probar con mensajes reales ("me interesa", "cuánto cuesta") tras el deploy.

## 6. Sesión en la app

- Un 401 aislado ya no redirige a `/auth`: se confirma con `/api/auth/me` (commit local `0ae4090`).
- Falta confirmar la causa real: pedir al dueño la petición 401 de la pestaña Red (F12)
  al volver de la landing o de la tienda.

## 7. Sistema visual (en curso)

- Hecho en local: acento y radios (`3d819ff`). Es solo una parte.
- Pendiente: modo oscuro, panel de inicio, bandeja de conversaciones, resto de pantallas.
- No hay servidor local para ver cambios (esbuild no puede escribir en esta máquina).
  La verificación visual se hace tras un deploy de preview o en el dueño.

## 8. Verificación antes de dar algo por hecho

- Meta: `npx vitest run src/lib/meta` (en `artifacts/api-server`). Con Postgres real:
  `TEST_PG_URL=postgres://postgres:postgres@127.0.0.1:54329/prueba`.
- Motor de ventas: `npx vitest run src/lib/motor-nuevo`.
- Frontend: no hay build local (esbuild bloqueado). Validar sintaxis con el compilador de
  TypeScript del repo.

## 9. Preguntas abiertas para el dueño

1. ¿El auto-deploy de `bot-agenwhatsapp` está activo o apagado?
2. ¿Cuál es el Catalog ID real?
3. ¿Qué canal usar para avisar al dueño cuando un token de Meta caiga?
4. ¿Qué petición da 401 al volver de la landing o la tienda?
5. ¿Prioridad: vista previa de anuncios, o rediseño de pantallas?
