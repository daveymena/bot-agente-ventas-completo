# VentasPro — Documentación de la plataforma (sesión jul-2026)

Repo: `daveymena/bot-agente-ventas-completo` (GitHub, **público**).
Este documento resume todo lo investigado y corregido en una sesión larga de Claude Code, para que cualquiera que retome el proyecto (vos, otra sesión de IA, o alguien del equipo) tenga el panorama completo sin releer todo el chat.

---

## 🚨 Seguridad — acción urgente pendiente (sin resolver)

Encontrado al final de esta sesión, **no corregido todavía** porque son credenciales reales que solo vos podés rotar:

1. **La contraseña real de `daveymena16@gmail.com` (`6715320D`) está hardcodeada en texto plano en ~30 archivos trackeados por git** (`artifacts/api-server/src/setup-user.ts`, y casi todos los `scripts/easypanel*.py`, `scripts/deploy.py`, `scripts/redeploy-easypanel.mjs`, etc.). El repo es **público**, así que esa contraseña está expuesta ahora mismo en el historial de GitHub.
   - **Acción**: cambiar esa contraseña ya (y la de Easypanel, si es la misma — varios scripts parecen loguearse ahí con ella).
   - Sacar el valor literal de esos ~30 archivos (reemplazar por variables de entorno) no alcanza solo: hay que además rotar la contraseña real, porque borrarla del código no la borra del historial de git. Si querés, se puede reescribir el historial después (`git filter-repo` o BFG) una vez rotada la contraseña.
2. **Un token de acceso personal de GitHub (`ghp_...`) está embebido en la URL del remote**, en `.git/config` local (`git remote -v`). Confirmado que este NO está en ningún archivo trackeado/pusheado (solo en la config local de este clon), pero igual conviene revocarlo y generar uno nuevo desde github.com/settings/tokens, y evitar volver a pegar tokens directo en la URL del remote (usar un credential helper).

Ninguno de los dos se tocó en esta sesión — son decisiones y acciones que le corresponden al dueño de las cuentas.

---

## Resumen ejecutivo

La plataforma (SaaS multi-tenant: agente de IA por WhatsApp + tienda online + panel de administración) tenía fallas serias de aislamiento entre negocios, varias funciones a medio construir (paneles de solo lectura, límites de plan que nunca se aplicaban, rutas de recuperación de contraseña referenciadas pero inexistentes) y contraseñas/tokens guardados sin ningún tipo de protección. Esta sesión corrigió todo eso, agregó lo que faltaba para que sea vendible (landing page pública, planes reales, límites reales) y dejó documentado lo que sigue pendiente.

---

## 1. Aislamiento multi-tenant (WhatsApp, mensajes, datos)

Antes de esta sesión, varios negocios podían "verse" entre sí sin darse cuenta. Corregido:

- **Rutas de control de WhatsApp sin autenticación**: `/whatsapp/connect`, `/disconnect`, `/reset-session`, `/pair-phone`, `/status`, etc. estaban en la lista de rutas públicas del backend — cualquiera podía secuestrar la sesión de WhatsApp de cualquier negocio sin login. Sacadas de `publicRoutes` en [`app.ts`](artifacts/api-server/src/app.ts).
- **`/store/admin` con el mismo problema**, corregido en el mismo archivo.
- **`/api/pricing` montado dos veces**: una vez temprano en `app.ts` (antes del middleware que resuelve el tenant, o sea sin auth) y otra vez correctamente dentro de `routes/index.ts`. La ruta pública bypaseaba por completo la protección de `/pricing/upgrade`. Se sacó el montaje duplicado.
- **`TenantContext.email` e `isAdmin` nunca se poblaban** pese a estar declarados en la interfaz — el chequeo de admin comparaba contra un campo que siempre venía vacío. Corregido en [`tenantManager.ts`](artifacts/api-server/src/lib/tenantManager.ts).
- **El WhatsApp de cada negocio usaba un singleton fijo al tenant 1**: mensajes entrantes de cualquier negocio, si el tenant 1 tenía WhatsApp conectado, se procesaban como si fueran de él; las respuestas salían desde EL NÚMERO DEL TENANT 1. Reescrito con instancias reales por tenant (`whatsapp-factory.ts`, `whatsappManagerByTenant.ts`), usadas en `agent-orchestrator.ts`, `message-handler.ts`, `conversations.ts`, `public.ts`.
- **`handleIncoming` no existía**: `WhatsAppByTenant` llamaba a un método del padre que nunca se implementó, así que **todos los mensajes entrantes de instancias multi-tenant se perdían en silencio**. Corregido extrayendo la lógica real a `handleIncomingMessages()` en [`whatsapp.ts`](artifacts/api-server/src/lib/whatsapp.ts).
- **Fugas de datos entre negocios en `conversations.ts`**: varios endpoints (`/handoff`, `/:id/lead-score`, `/dashboard/lead-scoring`, `/follow-ups/due`, etc.) no filtraban por tenant — un negocio podía ver/tocar leads y conversaciones de otro. Filtros de tenant agregados a todos.
- **Follow-ups programados nunca se enviaban**: `toDbDate()` faltaba al bindear una fecha en SQLite (`followUpScheduler.ts`), sql.js rechazaba el valor silenciosamente atrapado por un catch. Bug preexistente, no de esta sesión, encontrado al agregar el filtro de tenant a esa misma función.
- **`agent.ts` mezclaba productos de todos los tenants** al armar el catálogo que la IA usa para recomendar — agregado el filtro `tenantId`. También se inyecta el branding real del tenant (`businessName`, `agentName`) y las instrucciones personalizadas (`tenant.agentPrompt`) al prompt final, que antes se ignoraban.

## 2. Rol de administrador real

- Columna `tenants.is_admin` agregada (migración idempotente en sqlite y postgres, ver [`lib/db/src/schema/tenants.ts`](lib/db/src/schema/tenants.ts)).
- Reemplazados los chequeos hardcodeados de email (`req.tenant.email !== "daveymena16@gmail.com"`) por `!req.tenant?.isAdmin` en [`routes/tenants.ts`](artifacts/api-server/src/routes/tenants.ts) y `saasValidation.ts`.
- Middleware `requireAdmin()` nuevo, aplicado a las rutas sensibles de WhatsApp (`/instances`, `/health`, `/metrics`, etc.).
- Auto-promoción a admin **solo si no existe ningún admin todavía en toda la tabla** (ventana que se cierra sola) — necesario porque no había forma de asignar el primer admin sin editar la BD a mano.
- Panel `/admin/tenants` reescrito de solo-lectura a funcional: cambiar plan, activar/suspender, hacer/quitar admin, eliminar — todo con confirmación y bloqueado para auto-modificarse.

## 3. Tienda online

- **Registro de un tenant nuevo no creaba tienda** — el catálogo público (`GET /store/:slug`) daba 404 siempre. Ahora `POST /auth/register` crea la tienda automáticamente con el mismo slug del tenant.
- `POST /store/admin/bootstrap`: crea la tienda de forma idempotente para el tenant actual si no existe.
- El middleware de `/store/admin/:slug` era un `// TODO` que dejaba pasar cualquier cosa — reemplazado por un chequeo real (admin o dueño de esa tienda).
- El panel de `packages/tienda` (editor visual) usaba datos de demo hardcodeados en vez de la API real — `ProductManagement` reescrito para usar un hook nuevo (`useRealProducts`) contra `/api/products`.

## 4. Planes, precios y límites de uso

- **Plan gratuito no era prueba, era gratis para siempre** (`status: "active"` en vez de `"trial"`). Ahora los registros nuevos quedan en `status: "trial"`, y `basic` es una prueba de **7 días / 30 mensajes** (antes: 30 días / 200 mensajes, y sin aplicar el límite).
- **Precios reales**: Starter $15, Growth $45, Pro $65 (antes $29/$49/$99, sin relación con lo que se cobraba).
- **Los límites de plan no bloqueaban nada**: `featureLimits.ts` era un stub completo (`current: 0, // Se debería obtener de la base de datos`). Reescrito para consultar la BD real y bloquear con 403 al llegar al límite de productos/agentes/conversaciones, y un chequeo real de mensajes mensuales (`checkMessageLimit`) conectado al envío real de WhatsApp (`agent-orchestrator.ts`) y al chat del dashboard (`conversations.ts`).
- **No se podía subir ni bajar de plan**: `POST /pricing/upgrade` reescrito para usar la sesión real (`req.tenant`) en vez de buscar/crear un tenant por email suelto.
- Facturación trimestral agregada (antes solo mensual/anual a medias) en `subscription-payments.ts`.
- Página `/pricing` del dashboard: se sacó el diálogo que pedía el email de nuevo (ya autenticado no hace falta), se simplificó la fila de método de pago/ciclo de facturación (antes repetía la info de MercadoPago/PayPal 3 veces), y se arregló el scroll roto (`overflow-hidden` en el contenedor raíz bloqueaba el `overflow-y-auto` del layout).

## 5. Recuperación de contraseña + seguridad de contraseñas

- **Las rutas de recuperación no existían** pese a estar referenciadas en `publicRoutes` y a que el frontend (`auth.tsx`) y los tests (`auth.test.ts`) ya las llamaban — daban 404. Implementadas las tres en [`routes/auth.ts`](artifacts/api-server/src/routes/auth.ts): `POST /request-password-reset`, `/verify-reset-code`, `/reset-password`. Reutilizan funciones de email que ya existían y nunca se llamaban (`sendPasswordResetEmail`, `sendPasswordChangeConfirmationEmail`, `generateVerificationCode`).
- Código de 6 dígitos, expira a los 15 minutos, columnas `password_reset_code`/`password_reset_expiry` (ya existían en el schema, sin usar). Respuesta genérica en el request inicial (no revela si el email existe). Rate limit de 5 intentos/15 min por IP+email.
- **Hashing de contraseñas migrado de SHA-256 plano (sin sal) a bcrypt**. Las cuentas existentes (que todavía tienen hash SHA-256 de 64 caracteres) se migran solas a bcrypt en su próximo login exitoso, sin pedirles nada.
- Contraseñas nuevas (registro y recuperación) exigen mínimo 8 caracteres, con letra y número.

## 6. Encriptación de credenciales de terceros (Facebook)

- Módulo nuevo [`credentials-vault.ts`](artifacts/api-server/src/lib/credentials-vault.ts): AES-256-GCM, clave separada (`CREDENTIALS_ENCRYPTION_KEY`).
- Los tokens de Facebook (`accessToken`, `appSecret`, `messengerPageToken`) que se guardan en `tenants.metadata` ahora se encriptan antes de tocar la BD, en los 3 puntos donde se escriben (conexión OAuth, guardado manual del token de Messenger, formulario de configuración). Se desencriptan en el único punto central donde se leen (`tenantManager.parseFacebookMeta`), así que el resto del sistema no se tocó.
- Compatible con lo que ya estaba guardado en texto plano (se re-encripta solo la próxima vez que se actualice desde el panel).
- **Pendiente del mismo tipo, no resuelto**: el token de GitHub Copilot y la API key de NVIDIA en `routes/settings.ts` se guardan y se devuelven en texto plano — no se tocó porque esa tabla (`settings`) no es por-tenant (usa `db.select().from(settings).limit(1)`, una sola fila global), que es un bug de aislamiento aparte, no solo de encriptación.

## 7. Chatbot de ayuda de la plataforma

- Nuevo endpoint `POST /api/public/help-chat` — asistente que responde dudas sobre CÓMO FUNCIONA VentasPro (planes, facturación, funciones), no el agente de ventas de cada tenant. Rechaza preguntas sobre información sensible interna. Si no puede resolver, ofrece escalar al WhatsApp real configurado.
- Widget flotante [`HelpChatWidget.tsx`](artifacts/ventas-pro/src/components/HelpChatWidget.tsx): tamaño fijo compacto (340×480), esquina inferior derecha, minimizable, se limpia solo al cerrar.

## 8. UX: transiciones y landing page

- **Transiciones de página**: `AnimatePresence` + `framer-motion` en [`App.tsx`](artifacts/ventas-pro/src/App.tsx) — fade/slide de 140ms entre rutas en vez del salto seco anterior.
- **Landing page pública** en `/`: antes redirigía directo a `/auth` sin mostrar nada del producto a quien no tenía cuenta. Ahora `/` muestra una landing interactiva (`pages/landing.tsx`) para visitantes sin sesión, y el Dashboard de siempre para quien ya inició sesión.
  - Hero con demo animado del producto (mockup de teléfono que rota solo entre 4 pantallas reales: WhatsApp, Tienda, Panel de Ventas, Facebook Ads generando una campaña), fondo de manchas de color en movimiento, iconos flotantes, una mascota ilustrada.
  - Secciones: ecosistema completo, herramientas, marketing automático con IA, precios (traídos en vivo de `/api/pricing`), CTA final.
  - Sin video real (no hay ninguna herramienta de generación de video conectada en este entorno) ni testimonios inventados — solo animaciones interactivas de la interfaz real y datos verificables del producto.
  - CTA "Comenzar gratis" lleva directo a la pestaña de registro (`/auth?tab=register`, soportado agregando lectura del query param en `auth.tsx`).

## 9. Otros fixes puntuales

- Botón "Nuevo Producto" que quedaba escondido fuera de pantalla en `/products` (falta de `flex-wrap` en la fila de acciones) — mismo patrón de bug ya corregido antes en `/facebook`.
- `/pair-phone` fallaba con "Connection Failure" por reusar un socket a medio handshake — ahora siempre hace `stop()` + `start()` antes de pedir el código.

---

## Variables de entorno nuevas (revisar en Easypanel)

| Variable | Para qué | Qué pasa si falta |
|---|---|---|
| `CREDENTIALS_ENCRYPTION_KEY` | Encripta tokens de Facebook/GitHub guardados por tenant | Se genera una clave aleatoria en memoria — todo lo encriptado ANTES de un reinicio queda indescifrable después. **Fijarla en producción.** |
| `COOKIE_SECRET` | Ya existía — firma la cookie de sesión | Mismo comportamiento: clave aleatoria temporal si falta. |

Ambas están documentadas con instrucciones en `.env.example` y `.env.easypanel.optimizado` (sin valores reales, son plantillas).

---

## Pendientes conocidos (no resueltos en esta sesión)

1. **🚨 Rotar la contraseña real y el token de GitHub filtrados** (ver arriba — es lo más urgente).
2. **Poner al día al Arquitecto IA** sobre todo lo implementado esta sesión (su system prompt/contexto no sabe nada de esto todavía).
3. **Configuración de métodos de pago por tenant**: cada negocio debería poder cargar sus propias credenciales de MercadoPago/PayPal o pegar un link de pago ya existente — no se construyó esta sesión.
4. **Auditoría de seguridad más amplia** (más allá de lo cubierto acá) — pedida explícitamente, no se hizo como bloque separado.
5. **"Sellar el código"**: confirmar que el repo debería ser privado (ahora mismo es público, lo cual además es la causa de la filtración de credenciales), ofuscar el JS del frontend en builds de producción, documentar que el modelo SaaS no entrega código fuente al cliente.
6. **Licencia de software y protección de derechos de autor** — decisión pendiente, no técnica.
7. **Preparación para Android** — hoy es una app web pura; falta decidir PWA vs. wrapper (Capacitor/TWA) y evaluar qué implica.
8. **Editor visual de `packages/tienda`** (drag-and-drop) sigue usando estado local/localStorage, no persiste layout real en el backend.
9. **Paneles de Configuración/Plantillas en `packages/tienda`** siguen con estado solo local, no conectados al backend.
10. **Token de GitHub Copilot / API key de NVIDIA en `routes/settings.ts`**: texto plano + tabla no es por-tenant (bug de aislamiento separado de la encriptación).
11. **Limpieza menor**: `resolveWhatsAppPhone` y restos del singleton legado de WhatsApp que ya no hacen falta tras la migración a instancias por tenant.

---

## Documentos relacionados

- [`DIAGNOSTICO_PRODUCTOS_BORRADORES.md`](DIAGNOSTICO_PRODUCTOS_BORRADORES.md) — diagnóstico específico del bug que hacía que productos/borradores no aparecieran (causa raíz: mismatch de tipos `string`/`number` en `products.ts`).
- [`HANDOFF_ARQUITECTO_FACEBOOK.md`](HANDOFF_ARQUITECTO_FACEBOOK.md) — sesión previa sobre imágenes rotas, publicación en Facebook sin foto, y auto-reparación del Arquitecto IA. Menciona la misma contraseña filtrada (ya estaba señalada ahí, sin resolver).
