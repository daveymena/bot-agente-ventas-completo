# Estado del sistema de anuncios de Atlas

**Última actualización:** 2026-08-19 · **Rama:** `master` · **Todo pusheado y desplegado**

Documento de traspaso. Léelo antes de tocar el flujo de anuncios: evita re-descubrir
problemas que ya costaron una sesión entera.

> **Novedad (2026-08-19 noche):** el bloqueante 7.1 quedó **RESUELTO y verificado en
> vivo** — ver §4 y §7.1. El código de creación nunca fue el problema (ya estaba
> completo y desplegado); el bloqueante era que Atlas afirmaba "subido a Meta" sin
> ejecutar la subida y había dos cuentas publicitarias. Probado de raíz contra Meta.

---

## 1. Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| Repo local activo | `C:\Users\ADMIN\Videos\Agent-Sales-Bot` |
| Remoto | `github.com/daveymena/bot-agente-ventas-completo`, rama `master` |
| Producción | EasyPanel → proyecto `tecnoia` → servicio **`bot-agenwhatsapp`** → `ventasproia.com` |
| Backend real | `artifacts/api-server/src/` |
| Cerebro de Atlas (modo "Operador") | `routes/operator-opencode.ts` (OpenCode + puente MCP) |
| Cerebro viejo (modo "Agente") | `routes/code-agent.ts` |
| Catálogo de herramientas | `lib/app-operator.ts` → `TOOLS` |
| Puente MCP + `propose_action` | `lib/opencode-mcp-tools.ts` |
| Creación real en Meta | `lib/facebook.ts` y `lib/ad-strategist.ts` |
| Brief y nota de calidad del copy | `lib/anuncio-inteligente.ts` |
| Reglas duras de publicidad | `lib/publicidad-persuasiva.ts` |

> ⚠️ `tecnoia/bot-whatsapp` **NO** es la app: es la base Postgres. El nombre engaña.

---

## 2. Trampas de infraestructura (verificadas en vivo)

- **`zeroDowntime` debe quedar en `false`.** Con `true`, el build termina en verde,
  EasyPanel actualiza el hash que muestra, y el contenedor viejo sigue corriendo.
  Ya está en `false`; no lo vuelvas a activar.
- **El hash de commit de EasyPanel miente.** Se actualiza al *disparar* el deploy, no al
  desplegar. Para saber si el código nuevo corre: `GET /api/health` y mirá que el
  `uptime` se haya reseteado.
- **Las mutaciones tRPC devuelven `{}` con 200 aunque no hagan nada.** Releé siempre con
  `services.app.inspectService`.
- **Token de la API de EasyPanel:** `C:\Users\ADMIN\Music\env.txt` (leerlo desde ahí,
  nunca escribirlo en un comando). Panel: `https://144.91.112.79`.
- Deploy: `POST https://144.91.112.79/api/trpc/services.app.deployService` con
  `{"json":{"projectName":"tecnoia","serviceName":"bot-agenwhatsapp","forceRebuild":false}}`

---

## 3. Cómo verificar de verdad (no le creas al chat)

Atlas afirma haber hecho cosas que no hizo. **Nunca** valides leyendo su respuesta.
Estos endpoints, con la sesión del navegador en `ventasproia.com`, son la fuente real:

```
/api/health                                   ¿corre el código nuevo? (uptime)
/api/facebook/validate                        ¿el token de Meta sirve? (pega contra Graph)
/api/facebook/credentials                     credenciales del tenant (enmascaradas)
/api/facebook/campaigns                       campañas REALES en la cuenta
/api/facebook/campaigns/:id/adsets            ¿la campaña tiene conjunto?  ← clave
/api/facebook/strategist/drafts               borradores guardados en la base
/api/architect-memory?memoryType=observation  historial real de la conversación
```

La consulta de `adsets` es la que destapó las campañas huérfanas. Usala siempre después
de crear algo en Meta.

---

## 4. Estado de Facebook (verificado 2026-08-19)

✅ Token propio del tenant (`propias: true`), válido contra Graph — página
**"VentasPro - Cursos Digitales"**, con permiso `ADVERTISE`.
✅ `FB_APP_ID`, `FB_APP_SECRET`, `FB_LOGIN_CONFIG_ID`, `FB_CONNECT_ENABLED=true` en prod.
✅ Webhooks de Messenger y Lead Ads con sus verify tokens configurados.
⚠️ **`catalogId` vacío** → `fb_sync_catalog` no puede funcionar.
⚠️ El `FB_ACCESS_TOKEN` del `.env` **local** venció el 10-ago. Es un **falso positivo**:
producción usa las credenciales del tenant, no ese fallback.

**Verificado contra Graph el 2026-08-19 noche (token del tenant descifrado):**
- ✅ Cuenta activa del tenant: `act_1041451215504206` "Duvier Davey Mena Mosquera",
  moneda **COP**, `account_status: 1` (activa), con $2.990 gastados históricamente.
- ✅ Hay una SEGUNDA cuenta: `act_1545022093928422` "VentasPro - Cursos Digitales",
  moneda **USD** — es donde vivía la campaña histórica del 8-ago. **No confundirlas**:
  todo lo que hace la app hoy usa la COP. `me/adaccounts` muestra ambas.
- ✅ Pixel `1193902929595904` **NO está asociado** a la cuenta COP actual → al crear
  anuncios la app cae a `LINK_CLICKS`/`IMPRESSIONS` (sin píxel), que es lo correcto.
  Si algún día se quiere optimizar por conversiones reales, el píxel hay que
  reasociarlo o crear uno en esta cuenta.
- ✅ El `userAccessToken` del tenant es un token de **usuario** (199 chars) distinto
  del token de página; la creación real de anuncios lo usa (el token de página no
  sirve para ads).

---

## 5. Resuelto y verificado en vivo

| Commit | Problema real que cerró |
|---|---|
| `abf0ce9` | `productId: 0` llegaba al admin y reventaba **después** de su confirmación |
| `b4db407` | El prompt ordenaba "prueba social" y el validador la prohibía: se contradecían, ningún anuncio pasaba |
| `62e1fe2` | `list_products` buscaba la frase entera solo en el nombre → *"no encontré el producto"* → ofrecía crear un duplicado |
| `619dece` | Un id vacío se rechaza ahora en **cualquier** herramienta, no solo en las anotadas a mano |
| `8aab39e` | Terminar preguntando era una salida infinita para no ejecutar |
| `85261ad` | El copy se guardaba con las comillas del modelo pegadas |
| `fd580a5` | Un resumen que reventaba reportaba como fallida una acción que **sí** se ejecutó |
| `9041e0e` | El candado anti-"ya lo hice" reconoce la forma del participio, no una lista cerrada de verbos |

**Ciclo probado punta a punta:** un solo mensaje → encuentra el producto → escribe el
copy anclado en datos reales → el servidor lo obliga a proponer → confirmación →
borrador guardado (id 89, con presupuesto, sin promesas inventadas). El 2026-08-19
noche ese mismo borrador #89 quedó **subido a Meta en PAUSA** y verificado contra
Graph (ver §7.1) — el ciclo completo ya incluye la creación real.

## 6. Desplegado pero SIN probar

- `36d6721` — rollback de campañas huérfanas en `ad-strategist.ts`
- `3b4cda8` — `fb_delete_campaign` (destructiva; se niega si la campaña gastó, salvo
  `borrarAunqueTengaGasto: true`)
- `cc916e5` — el plan muestra título, texto y presupuesto antes de que apruebes

---

## 7. Lo que falta

### 7.1 ~~Bloqueante~~ RESUELTO: subir a Meta con su conjunto ✅
**Estado: resuelto y verificado en vivo el 2026-08-19 noche.**

**Causa raíz** (no era un bug de creación):
1. **Atlas mentía**: afirmaba "✅ subido a Meta en pausa" sin ejecutar nunca la subida.
   El borrador #89 ("PACK EDUCA A TU PERRO", $20.000) llevaba 2 días con
   `campaign_id=null`. El candado `9041e0e` frena la mentira en la respuesta, pero no
   la crea: la subida había que ejecutarla.
2. **Dos cuentas**: la campaña histórica del 8-ago estaba en `act_1545022093928422`
   (USD), pero el tenant ahora apunta a `act_1041451215504206` (COP). Por eso
   `/campaigns` devolvía `[]` aunque "hubiera campañas": miraban la cuenta equivocada.

**Prueba de raíz ejecutada (todas contra producción):**
- Graph directo con el token descifrado del tenant: campaña→conjunto→creativo→anuncio
  PAUSED creados y borrados en cascada OK.
- Camino real del servidor: plan pendiente `fb_upload_draft_to_meta` (#89) → aprobación
  "sí" vía `POST /api/code-agent/operator-opencode` → **campaña creada**.
- Verificación contra Meta (no al chat): campaña `120249109637600097`
  "PACK EDUCA A TU PERRO - 19/8/2026" **PAUSED**, objetivo `OUTCOME_SALES`, con su
  conjunto (`120249109637790097`, `daily_budget=20000` COP, targeting CO 18-65, sin
  píxel → `LINK_CLICKS`). Borrador actualizado a `status=created`, `fbStatus=PAUSED`.

**Ciclo completo hoy:** mensaje → Atlas encuentra producto → copy anclado → propone →
admin aprueba → **borrador #N** → `fb_upload_draft_to_meta` → campaña PAUSED en la
cuenta COP → `fb_make_campaign_deliver`/`fb_pause_campaign`/`fb_resume_campaign` la
encienden/apagan. La cuenta hoy tiene 1 campaña real (la del #89), pausada, sin gastar.

**Para retomar más adelante:**
- El píxel `1193902929595904` no pertenece a la cuenta COP → mientras tanto las
  campañas optimizan por clics (LINK_CLICKS), no por conversiones. Reasociar/crear
  píxel en esta cuenta si se quiere optimización por compra.
- `catalogId` vacío en el tenant → `fb_sync_catalog` sigue sin poder funcionar
  (pendiente aparte, no bloquea la creación).

### 7.2 Atlas no conoce el negocio
`construirBrief()` y `validarContenidoAnuncio()` tienen **cero** referencias a los
settings del negocio. Por eso frena "garantía" (lo compara contra el producto) pero **no
puede** frenar "clases en vivo" o "presencial": nadie le dijo nunca cómo trabaja el
negocio.

- En la BD: `settings.businessDescription` dice solo *"Tienda virtual de productos
  digitales y servicios tecnológicos"*, y `businessConfig` (que ya tiene campos
  `deliveryInfo`/`guaranteeInfo`/`businessNiche`) está vacío.
- Arreglo barato sin pedirle nada al usuario: el producto ya trae `kind: "digital"` +
  `deliveryLink` de Drive → derivar de ahí la prohibición de presencial/en vivo/envío.
- **Es la base del punto 2 de la hoja de ruta.** Multiplicado por cada cliente que cree
  su usuario.

### 7.3 Imágenes de terceros
`search_product_images` ofrece fotos de freepik, eukanuba y blogs ajenos. Único pendiente
con **riesgo legal** si alguna llega a publicarse. El producto ya tiene su propia imagen.

---

## 8. Hoja de ruta del usuario (su orden explícito)

1. **Atlas maneja el 100% de las herramientas de Facebook** — autónomo pero asistido.
   *Estamos acá.* No avanzar hasta que crear → activar → desactivar esté probado.
2. **Un agente por tipo de negocio.** Al dar de alta a un usuario nuevo, el agente debe
   **preguntarle en detalle qué ofrece, su alcance y qué NO puede hacer** — justamente
   para que no invente.
3. **La agencia de marketing profesional**: entiende la empresa del cliente y le construye
   un sistema para hacer crecer su tienda, como una agencia real.

---

## 9. Dos reglas aprendidas a golpes

**El validador solo actúa al PROPONER, no cuando el modelo habla.** Atlas puede escribir
un copy lleno de mentiras en el chat y el admin lo lee como si estuviera aprobado. Lo
único que no puede es *guardarlo*. Si vas a juzgar la calidad, mirá el borrador guardado.

**Las listas cerradas de palabras siempre pierden.** El mismo bug se escapó tres veces por
enumerar verbos o campos de a uno (`productId` ausente → `productId: 0` → `draftId: null`;
y el candado anti-mentira dejando pasar "subido"/"pausada"). Cuando puedas, validá por
**forma** (¿es un id?, ¿es un participio?) o de forma **universal** en el punto por donde
pasan todos los casos — no por enumeración.
