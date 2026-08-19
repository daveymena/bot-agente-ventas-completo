# Estado del sistema de anuncios de Atlas

**Última actualización:** 2026-08-19 · **Rama:** `master` · **Todo pusheado y desplegado**

Documento de traspaso. Léelo antes de tocar el flujo de anuncios: evita re-descubrir
problemas que ya costaron una sesión entera.

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
borrador guardado (id 89, con presupuesto, sin promesas inventadas).

## 6. Desplegado pero SIN probar

- `36d6721` — rollback de campañas huérfanas en `ad-strategist.ts`
- `3b4cda8` — `fb_delete_campaign` (destructiva; se niega si la campaña gastó, salvo
  `borrarAunqueTengaGasto: true`)
- `cc916e5` — el plan muestra título, texto y presupuesto antes de que apruebes

---

## 7. Lo que falta

### 7.1 Bloqueante: subir a Meta con su conjunto
Atlas responde *"✅ subido a Meta en pausa"* y `GET /api/facebook/campaigns` devuelve
`[]`. **Nada se crea.** Sin esto no hay campaña que activar ni desactivar.

Datos útiles para retomar:
- La jerarquía correcta (campaña → conjunto → creativo → anuncio, todo `PAUSED`) ya está
  implementada en `facebook.ts` y en `ad-strategist.ts`.
- El motor de **encender** (`fb_make_campaign_deliver`, `fb_pause_campaign`,
  `fb_resume_campaign`) es del 16-ago y está en `master`. **No hay que rehacerlo.**
- Un borrador sin presupuesto hacía fallar el conjunto y dejaba la campaña huérfana; eso
  ya se valida antes de tocar Meta.
- Verificación obligatoria: `/campaigns` **y** `/campaigns/:id/adsets`. Un cascarón sin
  conjunto **no** es un resultado aceptable.

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
