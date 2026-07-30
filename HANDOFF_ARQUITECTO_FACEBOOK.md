# Handoff: fixes de imágenes, Facebook y Arquitecto IA (jul-2026)

Este documento resume todo lo que se investigó y corrigió en una sesión de Claude Code que **no tenía acceso a internet real** (sandbox con salida bloqueada a Facebook, Pollinations, GitHub raw, OpenAI, etc. — solo registros npm/pypi y la API de Anthropic). Todo se verificó con tipado (`tsc --noEmit`) y pruebas locales con SQLite + datos falsos, pero **nada de esto se probó contra Facebook real ni con el modelo de IA real en producción**. Esa es la tarea pendiente para quien siga desde una máquina con internet sin restricciones.

Repo: `daveymena/bot-agente-ventas-completo`. Todo está mergeado en `master` (PRs #2, #3, #4, #5).

## Contexto del reporte original

El admin reportaba, en producción real (capturas de su celular):
1. Imágenes de producto rotas intermitentemente.
2. El Arquitecto IA publicaba en Facebook pero el post salía **sin foto**.
3. El token de Facebook parecía "vencerse" todo el tiempo, obligando a reconectar una y otra vez.
4. "Publicar en Marketplace" desde el dashboard tiraba `Error al crear listing` sin explicación.
5. A veces el chat del Arquitecto se quedaba "trabajando" sin terminar nunca.
6. Pidió explícitamente que el sistema tuviera capacidad de autocorrección: que no solo reporte errores, sino que intente resolverlos.

## PR #2 — imágenes rotas, post sin foto, token no persistía, bucle de confirmación

- **Directorio de imágenes inconsistente**: `image-store.ts` (donde se guardan) y `app.ts` (desde donde se sirven) tenían defaults DISTINTOS cuando `IMAGE_STORE_DIR` no estaba seteada (`uploads/` vs `data/images/`). Ahora ambos usan `getImageStoreDir()`, una sola función. **Verificar en producción que `IMAGE_STORE_DIR` apunte al volumen real montado en Easypanel.**
- **Post de Facebook sin imagen**: `absoluteUrl()` en `facebook-page-posts.ts` y la resolución de imagen en `ad-strategist.ts` exigían `APP_URL` con `https://` explícito y no tenían el fallback al dominio de producción que sí usa el resto del código. Si `APP_URL` no estaba seteada, la imagen se caía en silencio y el post salía solo texto. Ahora usan el mismo fallback (`https://tecnovariedades.easypanel.host`) que el resto del código. **Verificar que `APP_URL` esté seteada correctamente en Easypanel (con `https://` y el dominio real).**
- **Caché de tenant no se invalidaba al reconectar Facebook**: `fb-connect` (OAuth) y `messenger/save-token` guardaban el token nuevo en la BD pero nunca llamaban `tenantManager.clearCache()`. El servidor seguía sirviendo el tenant cacheado (hasta 5 min, `CACHE_TTL`) con el token viejo/vencido después de "reconectar". Ya corregido.
- **Herramientas del Arquitecto usaban el tenant equivocado**: `fb_status`, `fb_suggest_audience`, `fb_create_ad`, `fb_sync_catalog` en `app-operator.ts` instanciaban `new FacebookService()` SIN tenant → siempre caían al tenant por defecto (sin `.facebook`) en vez del tenant real conectado en BD. Ahora todas pasan `tenantManager.getTenantById(ctx.tenantId)`.
- **Bucle de confirmación infinito**: `isApproval()` en `architect-store.ts` no reconocía frases con muletilla al inicio ("entonces confirmado", "bueno dale") — solo aceptaba la palabra sola. El admin confirmaba y el Arquitecto repetía el mismo plan en vez de ejecutarlo. Ahora reconoce esas variantes.
- **Desbordamiento móvil** en la página de Facebook del dashboard (`facebook.tsx`): filas de botones largos sin `flex-wrap`, URLs de webhook en `<code>` sin `break-all`. Corregido.
- **Botón real de "Conectar con Facebook" (OAuth)**: antes NO existía ningún botón que hiciera el login real de Facebook — solo un campo para pegar un token a mano, que si viene del Explorador de Graph API dura 1-2 horas. Se agregó:
  - `GET /api/public/fb-app-config` — expone `FB_APP_ID` (no es secreto) y si el flujo está habilitado.
  - Botón "Conectar con Facebook" en la pestaña Configuración del dashboard → redirige al diálogo OAuth de Facebook → vuelve con el token en el fragmento de la URL → llama a `/api/public/fb-connect` (que YA existía, canjea por token de página de larga duración).
  - **Requiere en las env vars de Easypanel**: `FB_APP_ID`, `FB_APP_SECRET`, `FB_CONNECT_ENABLED=true`, y agregar `https://tudominio.com/facebook` a "Valid OAuth Redirect URIs" en developers.facebook.com (producto Facebook Login de la app). **Esto es 100% no probado — nunca se ejecutó el flujo OAuth real.**
- **Timeouts faltantes**: ninguna llamada `fetch()` del Operador (generar imagen DALL-E/Pollinations, descargar imagen, leer Drive, buscar en la web, hablar con Facebook, generar copy con IA) tenía límite de tiempo. Un proveedor colgado dejaba el turno entero del Arquitecto "trabajando" sin fin. Se agregó `AbortSignal.timeout()` a las ~10 llamadas que no lo tenían (10-30s según el caso).

## PR #3 — Marketplace rechazaba listings

- **`product.image_url` siempre `undefined`**: el campo del esquema es `imageUrl` (columna `image_url`), leerlo como `product.image_url` (snake_case) daba siempre `undefined`. El Marketplace Listings API de Meta EXIGE imagen — Facebook rechazaba el listing entero y el código se tragaba el motivo real devolviendo `null`, de ahí el "Error al crear listing" genérico.
- **`facebookMarketplaceService` era un singleton sin tenant** — mismo patrón que el bug de PR #2, nunca corregido en este archivo. Ahora las rutas crean su propia instancia con el tenant real de la request.
- **El error real de Facebook ahora llega al dashboard** (antes: `"Error al crear listing"` a secas; ahora: el mensaje específico, ej. "el producto no tiene imagen" o el error textual de Meta).

## PR #4 — el Arquitecto se quedaba "trabajando" sin terminar

Tres huecos en el bucle de ejecución (`MAX_STEPS=10` en `code-agent.ts`):
1. **JSON inválido del modelo** → antes se rendía al primer error y devolvía texto crudo roto. Ahora, si quedan pasos, le manda el error exacto al modelo y le pide reformatear (reintento real).
2. **Bucle de lecturas repetidas** → si el modelo pide la MISMA herramienta con los MISMOS argumentos una 3ª vez, se detecta y corta, explicando qué se alcanzó a averiguar en vez de seguir en círculo.
3. **Se agotaban los 10 pasos en silencio** → antes devolvía la última respuesta parcial como si fuera definitiva. Ahora antepone un aviso explícito.

## PR #5 — auto-reparación + memoria de lecciones

Pedido explícito del admin: que el Arquitecto no solo reporte errores, sino que los resuelva solo.

- **`attemptSelfRepair()`**: si una acción YA APROBADA falla al ejecutarse, se le dan al modelo hasta 3 turnos para diagnosticar (con herramientas de lectura), corregir un prerrequisito (ej: generar y asignar la imagen que faltaba) y reintentar la acción ORIGINAL. Cada paso de la reparación queda logueado con 🔧 en la respuesta — nada oculto.
- **Límite de seguridad a propósito**: la reparación solo actúa dentro del alcance de lo YA aprobado, para lograr que ESA acción funcione. Nunca ejecuta una mutación distinta sin pedir confirmación — esa barrera de "nunca cambiar nada sin el sí del admin" se mantiene intacta en todo el sistema.
- **Memoria de lecciones**: si la reparación funciona, se guarda en `architect_memory` (tipo `reflection`, por negocio — no por conversación) y se inyecta un resumen de las últimas lecciones en el system prompt de charlas futuras, para no repetir el mismo error.

## ⚠️ Seguridad — pendiente de que lo resuelva el admin

- ~~`AGENTS.md` tenía un password de admin hardcodeado~~ Ya no está en `AGENTS.md` (se sacó en algún momento posterior a esta nota). Pero el mismo password terminó repetido en texto plano en ~33 scripts más (`setup-user.ts`, `scripts/easypanel*.py`, etc.) -- ya corregido (ver `DOCUMENTACION_PLATAFORMA.md`). **Sigue pendiente rotar la contraseña real** en las cuentas de verdad (admin de la app, Easypanel, base de datos) -- sacarla del código no la saca del historial de git de un repo público.
- El admin también pegó en un chat un token de API de Easypanel — **debería regenerarlo** si no lo hizo ya.

## Qué probar en una máquina con internet real (lista de verificación)

1. **Imágenes**: crear/editar un producto, asignarle imagen (generada o subida), confirmar que carga en la tienda pública y en el dashboard sin 404.
2. **Conectar Facebook con el botón OAuth nuevo** (`Configuración → Conectar con Facebook`). Confirmar que:
   - Redirige al login real de Facebook.
   - Vuelve y guarda el token sin que haga falta pegar nada a mano.
   - El token sigue funcionando días después (no hay que reconectar cada 1-2 horas).
   - Si `FB_APP_ID`/`FB_APP_SECRET`/`FB_CONNECT_ENABLED` faltan, el botón muestra el aviso correcto (no debería tirar error crudo).
3. **Publicar en el muro (`fb_page_publish` vía el Arquitecto)**: pedirle que publique un producto real; confirmar que el post en Facebook incluye la foto, no solo texto.
4. **Marketplace**: publicar un producto CON imagen (debería funcionar) y uno SIN imagen (debería fallar con un mensaje claro, no el genérico de antes) — o mejor, dejar que el Arquitecto lo intente y observar si el auto-repair (PR #5) genera y asigna la imagen solo, y republica.
5. **Bucle de confirmación**: responder "entonces confirmado" a un plan propuesto y confirmar que ejecuta en vez de repetir el plan.
6. **Layout móvil** de la página de Facebook del dashboard en un teléfono real — confirmar que no hay scroll horizontal.
7. **Auto-reparación (PR #5)**: provocar a propósito un fallo conocido (ej. publicar Marketplace sin imagen) y confirmar que el Arquitecto intenta resolverlo solo antes de reportar error, y que en la SIGUIENTE conversación ya "sabe" de ese error de antemano (ver si aparece en el system prompt / si evita repetirlo).
8. **Tiempo de respuesta del Arquitecto**: confirmar que ya no se queda "trabajando" indefinidamente cuando un proveedor de imagen/IA está lento — debería fallar o rotar en máximo ~30s por intento.

## Variables de entorno relevantes (revisar en Easypanel)

| Variable | Para qué |
|---|---|
| `APP_URL` | Debe ser `https://` + el dominio real. Se usa para armar URLs absolutas de imágenes en posts/anuncios. |
| `IMAGE_STORE_DIR` | Debe apuntar al volumen persistente real montado en Easypanel. |
| `FB_APP_ID`, `FB_APP_SECRET` | Del producto Facebook Login en developers.facebook.com. Necesarios para el botón OAuth nuevo. |
| `FB_CONNECT_ENABLED` | Poner en `true` para habilitar `/api/public/fb-connect` y el botón OAuth. |
| `FB_ACCESS_TOKEN`, `FB_PAGE_ID`, `FB_AD_ACCOUNT_ID` | Fallback si no se usa el flujo OAuth (respaldo `.env`, no multi-tenant). |

## Historial de PRs de esta sesión

- #2 — Fix: imágenes rotas, publicación en Facebook sin foto, y Arquitecto IA colgado
- #3 — Fix: Marketplace rechazaba listings por falta de imagen y token no conectado
- #4 — Fix: autocorrección del Arquitecto cuando el razonamiento se descarrila
- #5 — Feat: auto-reparación de acciones que fallan + memoria de lecciones aprendidas
