# Conexión de Facebook por negocio — 27 de octubre de 2026

## Problema corregido

El panel permitía guardar una app propia de Meta, pero los dos botones de conexión y el canje del código usaban siempre la app global. Además, `/fb-connect` conectaba la primera página del primer lote de `/me/accounts`: no había selección real, ni paginación. La advertencia de permiso de publicación consultaba `/me/permissions` con el token de página y podía mostrar un falso negativo.

## Comportamiento nuevo

- `GET /api/facebook/login-config` exige sesión y resuelve la misma app que usa el backend al canjear el código. No devuelve secretos. Si el negocio tiene app propia, no mezcla su App ID con el secreto o config_id de la plataforma. Los clientes que no tienen app propia siguen usando la app SaaS compartida.
- Al conectar por primera vez y autorizar varias páginas, muestra una elección antes de reemplazar la conexión. Una reconexión conserva la página actual cuando sigue autorizada.
- «Elegir otra página» permite cambiar usando la autorización del mismo negocio, sin reutilizar el código OAuth. La autorización pendiente se guarda cifrada en la metadata de ese negocio, vence a los diez minutos y se elimina al completar la selección. No se devuelve ningún token al navegador.
- `/me/accounts` sigue los cursores y deduplica. Una página ajena a la autorización se rechaza.
- Los permisos se consultan con el token de usuario; las tareas de página también se consideran para informar capacidad de publicación.
- Ambos botones continúan en la misma pestaña para que el resultado se vea en el panel desde el que se inició la conexión. El panel muestra los errores y cancelaciones que devuelve Meta.
- Sin migración: se reutilizan metadata, cifrado y resolución del negocio desde la sesión. El cuerpo de la petición no decide el negocio.

## Validación

- 46 pruebas de Vitest aprobadas: onboarding, aislamiento del .env, cuenta publicitaria y protección de secretos. Incluyen peticiones HTTP a Express con SQLite real y respuestas de Graph simuladas: app propia, dos negocios, selección, cambio de página, vencimiento y no reutilización del código.
- 3 pruebas del constructor de login aprobadas con `node --import tsx --test`.
- Compilaciones de backend y frontend aprobadas. Persisten advertencias previas de proveedores duplicados y sourcemaps.
- El chequeo TypeScript completo tiene errores previos en el repositorio; la compilación no equivale a un tipado completo en verde.
- Revisión manual del diff y `git diff --check`.

## Verificación real y límites

Se abrió `https://ventasproia.com/facebook` con una sesión existente: el panel mostró WhatsApp en línea y una conexión de Facebook guardada. El botón abrió el inicio de sesión de Facebook para la app 4238613976451604 y configuración 1163940880146084. No se completó el inicio de sesión, no se cambió la conexión en producción y no se concedieron permisos.

La prueba visual del selector local no pudo realizarse: el navegador remoto no alcanza el servidor local de desarrollo. Las pruebas HTTP sí ejecutan las rutas modificadas.

Falta desplegar esta corrección y completar una autorización con una cuenta externa. Todavía no se verificaron en Meta Developers el modo de la app, los permisos con acceso avanzado ni la revisión para usuarios externos. No se debe afirmar que esos permisos están aprobados ni que este cambio por sí solo resuelve un bloqueo de Meta. Las apps propias conservan los requisitos de configuración de sus webhooks ya existentes; esta corrección se centra en autorización y selección de página.
