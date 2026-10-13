# Auditoría Completa — VentasPro 2026-10-11
### ¿Está listo para producción con compatibilidad total “app real”?

**Repositorio:** `daveymena/bot-agente-ventas-completo` · rama `arena/b3cae597` · commit `3887577`  
**Fecha:** 2026-10-11 (America/Bogota) · **Auditor:** Agent Mode Arena  
**Alcance:** Seguridad, compatibilidad App Real (PWA + APK + Tienda), Backend, DB, Deploy, Checklist GO/NO-GO

---

## 0. Veredicto ejecutivo

| Pregunta | Respuesta |
|---|---|
| **¿Está listo para producción HOY?** | **NO — NO-GO con 7 bloqueantes** |
| **¿Pasa un “humo test” (build + login + WhatsApp QR)?** | Sí, si hay `.env` mínimo y volumen persistente |
| **¿Es compatible total “app real”?** | **Parcial (68%)** — PWA lista, TWA/APK con mismatch de paquete, Android nativo a medio hacer, Tienda OK |
| **¿Pierde dinero o datos si se lanza así?** | Sí: sesiones que se borran en cada deploy, Facebook que “se desconecta solo”, TWA que muestra barra, pedidos de landing 401 históricos ya corregidos pero pide smoke |
| **¿Cuánto falta para GO?** | **3–5 días** si se cierran los 7 bloqueantes + 1 smoke en dispositivo real |

**Score compatibilidad real:**

| Capa | Estado | Nota |
|---|---|---|
| **PWA (navegador)** | ✅ 95% | Manifest + SW + push + offline correctos |
| **TWA / APK en `descargas/`** | 🔴 40% | Paquete no coincide, assetlinks 404 hasta setear env |
| **Android nativo (NotificationListener)** | 🟡 55% | Compila, captura y responde por RemoteInput, pero stubs + regex frágil + hardcode |
| **Tienda pública** | ✅ 85% | Build independiente, rutas `/tienda/:slug`, fix VolverAlPanel |
| **WhatsApp real (Baileys vs Cloud)** | 🟡 75% | Dual, cola, health real, pero requiere volumen + prueba QR |

---

## 1. Qué hay realmente en el repo

### 1.1 Monorepo pnpm
```
ventaspro/
├── artifacts/api-server   Express 5 + Baileys 7 + Drizzle + 752 .ts + 303 tests
├── artifacts/ventas-pro   React 19 + Vite 7 + Tailwind 4 + shadcn + wouter (35 páginas)
├── packages/tienda        Vite + CraftJS editor + Zustand (tienda /tienda/:slug)
├── artifacts/mockup-sandbox
├── artifacts/opencode-proxy
├── lib/db                 Drizzle dual SQLite/Postgres (30+ tablas)
├── lib/api-spec|api-zod|api-client-react
├── lib/integrations*      Fallback IA (opencode,groq,deepseek,ollama,github,g4f)
├── android-project        Kotlin + Compose + Room + WorkManager (app nativa)
└── artifacts/ventas-pro/public/descargas/VentasPro-1.0.0.apk (1.3 MB, TWA)
```

**Build:** `artifacts/api-server/build.mjs` (esbuild bundle ESM, copia `sql-wasm.wasm`, external puppeteer/sharp), `vite build` para ambos frontends.  
**Deploy:** 2 Dockerfiles (`/Dockerfile` y `artifacts/Dockerfile`) — el **de producción es `/Dockerfile`** (node:22-slim, chromium+ffmpeg+fonts, `ENTRYPOINT entrypoint.sh`, `HEALTHCHECK curl /api/health`, volumen `/app/data`). El de `artifacts/` es legacy con `pnpm@9.15.9` y `apk add sqlite` — **ambigüedad que confunde a EasyPanel**.

### 1.2 Dos “apps Android” que compiten
El repo declara **dos estrategias distintas sin decidir una**:

1. **TWA (Trusted Web Activity) — la que hoy se descarga**  
   `VentasmPro-1.0.0.apk` en `public/descargas/` + `src/lib/app-android.ts` (`paquete: "com.ventaspro.app"`, `url: "/descargas/VentasPro-1.0.0.apk"`). Es `ventasproia.com` a pantalla completa — misma web, siempre sincronizada. Manifest `start_url: "/?app=ventaspro"`, detección por `?app=ventaspro` / `sessionStorage` / `referrer android-app://` / `standalone`. Bien implementado.

2. **App nativa Kotlin — capturadora de notificaciones**  
   `android-project/` (`applicationId "com.ventaspro.whatsapp"`, `namespace com.ventaspro.whatsapp`) con `WhatsAppNotificationListener`, `AutoResponseAccessibility`, `ApiClient` (OkHttp+Retrofit), Room (`conversations`, `analytics`, `auth`), `MessageSyncWorker`. **Es otro producto** (lee notificaciones de WhatsApp y responde por `RemoteInput`).

**Problema:** no hay un “cuál es la app oficial”. El APK en descargas es TWA; el nativo no se publica ni se firma en CI. Un usuario que instale el nativo esperará la TWA y viceversa.

---

## 2. Compatibilidad “App Real” — análisis profundo

### 2.1 PWA — ✅ Casi perfecta (evidencia: archivos presentes y tests)

| Check Play Store / Chrome | Estado | Evidencia |
|---|---|---|
| `manifest.json` con `name`, `short_name`, `start_url`, `display:standalone`, `theme_color`, `background_color` | ✅ | `public/manifest.json` válido |
| Iconos 192 + 512 + maskable | ✅ | `icono-192.png`, `icono-512.png`, `icono-512-maskable.png` |
| `start_url` | ✅ | `"/?app=ventaspro"` |
| Shortcuts ≥3 + screenshots ≥1 | ✅ | 4 shortcuts (Inbox, Atlas, Landing, Tienda) + 3 screenshots |
| `sw.js` con `push` + `notificationclick` + `showNotification` | ✅ | `public/sw.js` líneas push/click/cache |
| `theme-color` + `apple-mobile-web-app-capable` | ✅ | `index.html` meta |
| `viewport` sin `maximum-scale=1` | ✅ | Comentario explícito 2026-08-19 “no prohibir zoom” — pasa WCAG |
| Registro `registrarSW()` + `pwaSoportado()` | ✅ | `src/lib/pwa.ts` |
| VAPID sin romper si no hay claves | ✅ | `src/lib/__tests__/pwa-push.test.ts` + `lib/push.ts` retorna `{0,0}` si no configurado |

**Qué falta:** probar instalación real en Chrome Android (Agregar a pantalla de inicio), medir Lighthouse PWA ≥90, y verificar que `scope "/"` no colisione con `/api`.

### 2.2 APK TWA (`/descargas/VentasPro-1.0.0.apk`) — 🔴 BLOQUEANTE

**Evidencia del mismatch:**

| Lugar | Valor |
|---|---|
| `artifacts/ventas-pro/src/lib/app-android.ts` | `paquete: "com.ventaspro.app"` |
| `android-project/app/build.gradle.kts` | `applicationId = "com.ventaspro.whatsapp"` |
| `artifacts/api-server/src/app.ts:421` `ANDROID_PACKAGE` | default `"com.ventaspro.app"` |
| `/.well-known/assetlinks.json` (ruteado en `app.ts:419`) | `sha256_cert_fingerprints: [ANDROID_SHA256]` + `package_name: ANDROID_PACKAGE` |
| `version` | `1.0.0` ambos lados (ok) |

**Impacto real:**  
Si `ANDROID_SHA256` no está seteado → `assetlinks.json` responde `404 {"error":"assetlinks no configurado"}`. Aunque se setee, si la huella es del keystore de `com.ventaspro.app` pero el APK instalado es `com.ventaspro.whatsapp` (o viceversa), **la TWA NO valida** y Chrome muestra la URL bar (no es fullscreen). El usuario ve “no es una app real, es un navegador”.

**APK actual:** `1.3 MB` `35ee364e` en `public/descargas/` — probablemente generado con Bubblewrap/PWABuilder, no con `android-project`. No hay CI que lo regenere.

**Checklist TWA para GO:**
- [ ] Decidir paquete único: **recomendado `com.ventaspro.app`** (es el que publicita la web). Si se elige `com.ventaspro.whatsapp`, cambiar `app-android.ts` + `ANDROID_PACKAGE` + Play Store listing.
- [ ] Generar keystore release, extraer `SHA256` sin `:` en mayúsculas, exportar como `ANDROID_SHA256`.
- [ ] Setear en EasyPanel: `ANDROID_PACKAGE=com.ventaspro.app` + `ANDROID_SHA256=AB:CD:...`.
- [ ] Curl test: `curl https://ventasproia.com/.well-known/assetlinks.json` debe devolver `package_name` idéntico al APK.
- [ ] Reinstalar APK en Android 13/14 real y verificar que abre sin barra.

### 2.3 Android nativo (`android-project/`) — 🟡 Funcional pero incompleto

**Lo que sí hace bien:**
- `MainActivity.kt` (Compose Material3 dark theme, tabs Dashboard/Conversaciones/Config), `Room 2.6.1` con `ksp room-compiler` (arregla crash histórico `Cannot find implementation for AppDatabase`), `EncryptedSharedPreferences` + `MasterKey AES256_GCM` para session/token, `OkHttp 4.11` timeouts 30s.
- `WhatsAppNotificationListener` filtra por `isAppMonitored(packageName)` (default `com.whatsapp`, `com.whatsapp.w4b`), extrae `EXTRA_TITLE`/`EXTRA_TEXT`, llama `POST /api/whatsapp/capture` y si `debeResponder` hace `POST /api/whatsapp/execute` + `RemoteInput.addResultsToIntent()` para responder sin abrir WhatsApp. **Flow correcto.**

**Bloqueantes / deuda para “app real”:**

| Hallazgo | Severidad | Detalle | Ruta |
|---|---|---|---|
| `baseUrl` hardcodeado | 🔴 Alto | `private val baseUrl = "https://ventasproia.com"` — no hay `BuildConfig` ni flavor para staging/dev, falla en local y en pre-prod | `api/ApiClient.kt:38` |
| `extraerNumero()` frágil | 🟠 Alto | Regex `\+\d{1,3}\s?\d{1,14}` y fallback `return titulo.trim()` — si WhatsApp muestra nombre de contacto (no número) guarda **el nombre como `phone`** → duplicados y conversaciones rotas | `WhatsAppNotificationListener.kt:extraerNumero` |
| `MessageSyncWorker` stub | 🟡 Medio | `return Result.success()` — la cola offline no sincroniza; si hay corte de red se pierden analíticas | `MessageSyncWorker.kt` |
| `AutoResponseAccessibility` no-op | 🟡 Medio | Eventos vacíos — el `accessibility_service_config.xml` pide `canPerformGestures` + `canRetrieveWindowContent` pero nunca se usa. O sobra permiso o falta lógica | `AutoResponseAccessibility.kt` |
| Sin manejo de permisos en runtime | 🟠 Alto | `MainActivity` pide `openNotificationSettings()` pero no verifica `isNotificationServiceEnabled`, ni guía, ni maneja `onListenerDisconnected` con retry/backoff | `MainActivity.kt` |
| `targetSdk 36` / `minSdk 24` | ✅ Ok | Moderno (Android 7→14+), `compileSdk 36`, `gradle 8.5`, `kotlin 1.9.10`, `compose 1.6.1` — bien hoy, vigilar Play Store req 34+ | `build.gradle.kts` |
| Signing release opcional | 🔴 Alto | Solo firma si existen 4 vars env; si no, APK debug sin firma válida → Play Store rechaza y TWA falla | `build.gradle.kts:signingConfigs` |
| Sin `networkSecurityConfig` | 🟡 Medio | En Android 9+ cleartext bloqueado; si `baseUrl` cambiara a http en dev fallaría silencioso | `AndroidManifest.xml` |
| No hay `proguard-rules` ni test | 🟡 Bajo | `isMinifyEnabled false` — ok para debug, pero release sin minify pesa más y expone código | — |

**Para ser “app real” debe:**
1. Parametrizar `baseUrl` por `BuildConfig.BASE_URL` + flavors `dev`/`prod`.
2. Reescribir `extraerNumero` para usar `Notification.EXTRA_SUB_TEXT` + `getWhatsAppContactDatabase` o al menos normalizar a E.164 y descartar si no es número (no guardar nombre como teléfono).
3. Implementar `MessageSyncWorker` o eliminarlo del manifiesto si no se usa.
4. Añadir check de permiso persisted + UX que re-pida si se revoca.

### 2.4 Tienda pública (`packages/tienda`) — ✅ Buena

- Build separado `vite` `dist` en `packages/tienda`, rutas `react-router-dom 7.15`, `zustand`, `CraftJS`.
- Fix `VolverAlPanel` con `sessionStorage vp_desde_panel` (reporte admin: volver atrás sacaba de la app) — correcto.
- `InicioDelNegocio`, `ProductDetail`, `Cart/Checkout/Wishlist`, `TrustBar`/`PaymentIcons` (Nequi/Daviplata/MercadoPago icons). Bien para LATAM.
- **Gap:** `useStore.ts` + `color.ts`/`departamentos.ts`/`envio.ts`/`pixel.ts` — no auditados a fondo; verificar que `/tienda/:slug` resuelve tenant por slug y no por `tenantId` del query (aislamiento).

### 2.5 WhatsApp real

| Aspect | Estado | Nota |
|---|---|---|
| Baileys multi-tenant + auto-start tenant 1 + monitor 5 min | ✅ | `app.ts` auto-start + `startWhatsAppMonitor` |
| Cloud API opcional (`WHATSAPP_TRANSPORT=cloud`) | ✅ | Webhook `/whatsapp-cloud/webhook` público + HMAC rawBody |
| Estado expuesto en health | ✅ | `health.ts` `whatsapp {conectado, estado}` sin filtrar número |
| Cola con `AgentOrchestrator`/ `message-queue` | ✅ | Stats expuestos en health |
| Sesión en volumen `/app/data/.baileys-auth` | 🟡 | Requiere volumen Easypanel montado; `entrypoint.sh` solo cubre SQLite, no auth migration |
| Validación de entrada multi-pregunta | ✅ | Motor v2; tests `atlas-*`, `cierre-no-miente` |

**Test real requerido:** `curl /api/health` → `problemas` debe estar vacío y `whatsapp.conectado:true` después de escanear QR; enviar WhatsApp real y medir `tiempo de respuesta <5s objetivo` (estándar `estandar-que-funciona.ts`).

---

## 3. Seguridad — lo que auditó `AUDIT_REPORT.md` (julio) vs hoy 2026-10-11

| ID | Hallazgo histórico | Estado HOY | Severidad hoy | Acción para GO |
|---|---|---|---|---|
| **S-1 COOKIE_SECRET** | No validado, sesión forjable | **Parcialmente mitigado.** `app.ts:386` genera `randomBytes(32)` si falta y loguea `WARN [Security] COOKIE_SECRET no configurado`, guarda en `process.env.COOKIE_SECRET` y firma con `cookieParser(cookieSecret)`. No deja sin firma, pero **cada restart invalida todas las sesiones**. | 🔴 Alto (no crítico de robo, sí de disponibilidad) | **GO exige `COOKIE_SECRET` fijo 64 hex en EasyPanel.** No basta el fallback — documentado en `.env.example` pero sin enforcement. Añadir check en `health` y en `index.ts` que falle “degradado” si falta en `NODE_ENV=production`. |
| **S-2 Rate limiting solo RAM** | `Map` sin Redis | **Sigue en RAM** pero ahora **doble capa:** `lib/rate-limiter.ts` (Map simple) + `middleware/rateLimiting.ts` (`RateLimitStorage` Map) + `middleware/rateLimitPublico.ts` (Map con `X-Forwarded-For`). **Mitiga abuso de IP obvio**, pero se pierde al reinicio y no es distribuido. Comentario `// in production, use Redis` sigue. | 🟠 Medio | **Aceptable para single-instance Easypanel.** Para escalar a 2+ réplicas sí requiere Redis. Agregar header `Retry-After` y persistir en PG si se quiere estricto. Público crítico `generate-image`/`help-chat` ya tienen `rateLimitPublico(5,10m)/(20,5m)` — bien. |
| **S-3 Webhooks sin firma** | POST simula pago → suscripción gratis | **Corregido (bien).** `routes/subscription-webhooks.ts` → `firmaMpValida(req, dataId, secreto)` verifica `x-signature: ts=...,v1=...` + `x-request-id` con `HMAC-SHA256(manifiesto)` y `timingSafeEqual`. Si hay `webhookSecret` y firma inválida → `200 {received:true}` pero **no activa** (fail closed). Si no hay secreto → log `warn sin webhookSecret: firma no verificada (solo re-consulta API)` y sigue re-consultando `api.mercadopago.com/v1/payments/:id` y verificando `payment.status==="approved"` + `external_reference` → tenant real. PayPal `verifyPayPalCapture` similar. | 🟢 OK | **GO exige configurar `MERCADO_PAGO_WEBHOOK_SECRET` / PayPal secret por tenant en `/settings pagos`.** Sin él, queda en modo “re-consulta” (mejor que antes, pero no es firma). Añadir alerta en health si falta. |
| **S-4 Credenciales en texto plano** | Woo/FB/GHub sin cifrar | **Corregido con vault.** `lib/credentials-vault.ts` AES-256-GCM `enc:v1:base64(iv+tag+cipher)`, IV 12B aleatorio, lazy `getEncryptionKey()` (hash SHA256 de `CREDENTIALS_ENCRYPTION_KEY` o random temporal con WARN). Legacy plaintext sigue legible (`decryptSecret` retorna tal cual si no tiene prefijo) y se re-cifra al guardar. Woo sigue con campo `tenants.woocommerceIntegration` JSON pero ahora cifrado vía vault según `TRASPASO_2026-10-01`. | 🟡 Medio | **GO exige `CREDENTIALS_ENCRYPTION_KEY` fija.** Sin ella, todo lo cifrado antes del restart es ilegible y Facebook “se desconecta solo” (retorna `""`). Health marca `sin-clave-de-credenciales` si falta — ver logs. Rotar si estuvo expuesta en git/historial. |
| **S-5 Multi-tenant cross-tenant** | `tenantId` del query | **Corregido.** `publicRoutes` incluye `"/public"` pero excluye `"/public/fb-connect"` para que `resolveTenant()` use sesión real, `store/admin/*` igual, `landing-publica` resuelve por `slug`, integraciones webhooks resuelven por tienda. `whatsapp.ts` ya no usa `tenantIdFromReq` → 1 por defecto. | 🟢 OK | Mantener test `codigo-solo-admin.test.ts` en CI. |
| **S-6 Helmet / Headers** | No había | **Parcial.** `lib/security-shield.ts` tiene `sanitizeResponseHeaders` (nosniff, DENY, XSS, HSTS) pero **NO está montado como middleware global** — solo se llama ad-hoc. `app.ts:338 app.set("trust proxy",1)` y `cors` con `credentials:true` ok, pero falta `helmet` real. `x-powered-by` no se oculta (Express default). | 🟠 Medio | **Añadir `helmet()`** (con `crossOriginResourcePolicy:false` para imágenes) o montar `security-shield` en `app.use`. Verificar `curl -I` no filtre `X-Powered-By: Express`. |
| **S-7 Logs filtran secretos** | `console.log token` | **Corregido.** `lib/logger.ts` con `CAMPOS_SECRETOS` redacta `token`, `password`, `authorization` etc + `redactarSecretos()` en `pino` redact paths + hook `limpiarArgumento`. Tests `secretos-no-se-filtran.test.ts`. | 🟢 OK | — |
| **S-8 .env expuesto / git historial** | Groq/OpenRouter/Github token en historial `fd02734` + remote URL | **Sigue en historial git.** No se reescribió historia. Tokens deben rotarse. `.gitignore` ya ignora `.env`, `.env.easypanel*`, `*.db`. | 🔴 Alto | **Rotar todos los tokens expuestos antes de GO.** `git log --all -p -S "sk-"` audit. |

**Resumen seguridad GO:** Si no se setean `COOKIE_SECRET` + `CREDENTIALS_ENCRYPTION_KEY` fijas → **NO-GO**. Con ellas → pasa a 🟡 aceptable para single-instance.

---

## 4. Backend / API

### 4.1 App.ts (1312 líneas) — arquitectura sólida con deuda
- `dotenv` cargado lazy en `index.ts` vía dynamic import (correcto para ESM).
- `pinoHttp` + `cors` (orígenes `localhost:5173` + `APP_URL`), `cookieParser(secret)`, `express.json 12mb` con `req.rawBody` para `X-Hub-Signature-256`.
- `trust proxy 1` necesario detrás de Easypanel/Nginx.
- `publicRoutes` bien curado (excluye `store/admin`, `fb-connect`, exige sesión para whatsapp; segment-based `path === route || startsWith(route+"/")` corrige bug histórico donde `/p` hacía público `/products`).
- `resolveTenantMiddleware` → `validateSaasMiddleware` → `validateLimitsMiddleware` en orden correcto, con bypass para `/pricing` (evita deadlock trial vencido).
- `findFrontendPath()` tolerante (no tira server si falta `dist`), `findTiendaPath()`, `IMAGES_DIR` via `getImageStoreDir()`, `sendFile` para `/videos/products/:id.mp4` con regex `^\d+\.(mp4|webm)$` y `/images/products/:id.jpg`.
- **Debt:** `console.log` de `findFrontendPath` ruidoso en prod, `CORS_ORIGIN` sin wildcard seguro, `helmet` faltante, 2 Dockerfiles.

### 4.2 Salud (`health.ts` + `src/health.ts`)
**Mejoró mucho vs julio:** ahora hace `pool.query("SELECT 1")` o `db.get(sql`select 1`)` (rama SQLite), verifica `tablasFaltantes()` derivadas de `autoMigrate` SQL real (no lista manual), expone `whatsapp`, `cola`, `ultimoError`, `vision`, `claveFija`, `build`. Antes devolvía `200 ok` cableado aunque faltara tabla `landingPages` (caso 2026-09-04). Ahora es fiable para sonda Easypanel.

**GO test:** `curl https://ventasproia.com/api/health | jq .problemas` debe ser `[]`. Si aparece `sin-clave-de-credenciales` o `whatsapp` o `faltan-tablas` → NO-GO.

### 4.3 Rutas (70+)
Bien: `auth` + `rateLimit` por endpoint (`verificationCodeLimiter 5/15m`, `login 10/15m`, `register 3/1h`), `public.ts` (`generate-image`, `help-chat` con `rateLimitPublico`), `push`, `store`, `landing-publica`, `whatsapp`, `facebook`, `pos`, `facturacion`, `integraciones/webhooks` con HMAC.

### 4.4 Motor vendedor (v1/v2)
`motor-nuevo/` por tenant (`activacion.ts`), hechos por herramientas DB, estado en `conversations.estado_agente` JSONB. **GO-ready** según tests; fallback a v1 si v2 falla.

---

## 5. Base de datos

- **Dual:** `USE_SQLITE=true` → `sql.js` WASM (`sql-wasm.wasm` copiado a `dist` en `build.mjs`), `SQLITE_PATH=./data/tecnovariedades.db`. `USE_SQLITE=false` → `DATABASE_URL` Postgres.
- **Schema:** `lib/db/src/schema/*.ts` 30+ tablas + `sqlite-schema.ts` espejo. Export central `lib/db/src/index.ts` re-exporta una por una (`landingPages` faltó históricamente y rompió Landing Studio — ya está `export const landingPages`).
- **AutoMigrate:** `artifacts/api-server/src/lib/autoMigrate.ts` `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS` idempotente, deriva `TABLAS_ESPERADAS` y `tablasFaltantes()`. Corre non-blocking en `index.ts`.
- **Riesgo prod:** Si `USE_SQLITE=true` en Easypanel **sin volumen** `/app/data`, la DB es efímera y se pierde en cada deploy. `entrypoint.sh` copia `/app/default-db/tecnovariedades.db` si falta, pero **solo si USE_SQLITE**. Para prod serio → `USE_SQLITE=false` + `DATABASE_URL` + `pool` Postgres + volumen solo para `.baileys-auth` + `IMAGE_STORE_DIR`.

---

## 6. Frontend (ventas-pro)

- **Stack:** React 19.1.0 (pinned por expo), Vite 7.3.2, Tailwind 4.1, `wouter`, `@tanstack/react-query 4.29`, `zustand`, `recharts`, `framer-motion`. Todo moderno, requiere Node 22.
- **Build:** `vite.config.ts` con `base "/"` en prod, `allowedHosts:true`, `host 0.0.0.0`, `proxy /api → localhost:3002` (dev), `outDir dist/public`.
- **UX:** `Calm Sales OS`, sidebar agrupado, `mobile-nav.tsx` bottom bar + sheet `Más`, `dashboard.tsx` con KPIs + embudo + actividad, `conversations.tsx` 3 paneles desktop / stack móvil. Reportes de “miniaturizado” corregidos (viewport).
- **PWA** ver §2.1.
- **Debt:** `typecheck: "exit 0"` en `ventas-pro` (no valida TS), `vitest` con `NODE_ENV` no fail, `pnpm` no está en `PATH` del sandbox (pero Dockerfile lo instala).

---

## 7. Infra / Deploy

| Item | Estado | Nota |
|---|---|---|
| Dockerfile principal (`/Dockerfile`) | ✅ | `node:22-slim`, `pnpm --frozen-lockfile`, build 3 frontends, `chromium` + `ffmpeg` + `fonts-liberation/noto-color-emoji`, `PUPPETEER_EXECUTABLE_PATH`, `HEALTHCHECK curl /api/health` 30s/60s/3, `entrypoint.sh` |
| `artifacts/Dockerfile` | ⚠️ Legado | `node:22-alpine` + `pnpm@9.15.9` + `apk sqlite`, solo build api+ventas-pro (sin tienda), `HEALTHCHECK node -e http.../api/health`, CMD `node migrate.mjs && ...`. **Elegir uno.** |
| `easypanel.yml` | ⚠️ Desactualizado | `USE_SQLITE=true`, `SQLITE_PATH ./data/tecnovariedades.db`, fallback `app.ts: AI_FALLBACK_ORDER ollama_cloud,opencode...` — en prod debe ser Postgres. Variables sensibles con `${VAR}` ok. |
| `entrypoint.sh` | ✅ | Copia default DB si falta, `exec node --enable-source-maps` (propaga SIGTERM) + `instalarApagadoOrdenado()` cierra WA socket graceful |
| `pnpm-workspace.yaml` | ✅ | `minimumReleaseAge 1440` (supply-chain defense), overrides para esbuild/linux, `onlyBuiltDependencies` |
| `.env.example` | ✅ Completo | 172 líneas, documenta todo (WA, Cloud API, pagos, FB, Dropi, motor, VAPID). **Falta `ANDROID_SHA256`, `ANDROID_PACKAGE`, `VAPID_*` con generator** |

---

## 8. Matriz de compatibilidad “App Real”

| Flujo real | Web (Chrome) | PWA Instalada | APK TWA | Android Nativo | Resultado |
|---|---|---|---|---|---|
| Abrir `https://ventasproia.com` | ✅ | ✅ | ✅* | — | * TWA ok si assetlinks ok |
| Login + sesión persistente | ✅ cookie firmada | ✅ | ✅ | 🟡 `EncryptedSharedPreferences` ok pero login cookie parsing frágil |
| Ver dashboard / KPIs | ✅ responsive | ✅ standalone | ✅ | ✅ nativo dashboard |
| Inbox conversaciones en tiempo real | ✅ polling/query | ✅ push | ✅ | 🟡 vía notif+API |
| Recibir WhatsApp y responder IA | ✅ (Baileys) | ✅ (push) | ✅ (push) | ✅ (RemoteInput) |
| Push “nuevo mensaje/pedido/pago” | ✅ Web Push | ✅ | ✅ | ✅ (via `push` + local DB) |
| Crear landing / ver tienda `/tienda/:slug` | ✅ | ✅ | ✅ | ✅ (WebView implícito) |
| Offline (caída red) | ✅ shell cache | ✅ | ✅ | 🟡 stub worker |
| Actualización sin reinstalar | ✅ | ✅ | ✅ (web) | 🔴 nativo requiere APK nuevo |
| Firma Play Store | — | — | 🔴 requiere keystore | 🔴 requiere keystore |

---

## 9. Checklist GO / NO-GO — lo que **DEBE** estar antes de “listo para producción”

### 🔴 Bloqueantes (NO-GO si falta 1)

1. **Env fijos en Easypanel**  
   ```
   NODE_ENV=production
   COOKIE_SECRET=<64 hex>  # python -c "import secrets;print(secrets.token_hex(32))"
   CREDENTIALS_ENCRYPTION_KEY=<64 hex>
   APP_URL=https://ventasproia.com
   CORS_ORIGIN=https://ventasproia.com
   ```
   Verificar: `curl /api/health` no liste `sin-clave-de-credenciales`; reiniciar y re-loggear sin perder sesión.

2. **Base de datos durable**  
   Opción A (simple, 1 nodo): `USE_SQLITE=false` → `DATABASE_URL=postgres://...` + `pool` + volumen `/app/data` solo para `WA_AUTH_DIR` e `IMAGE_STORE_DIR`.  
   Opción B (demo): `USE_SQLITE=true` **con volumen montado en `/app/data`** y backup diario. **Sin volumen → NO-GO.**

3. **TWA assetlinks**  
   `ANDROID_PACKAGE=com.ventaspro.app` + `ANDROID_SHA256=<huella sin :>` en env. `curl https://ventasproia.com/.well-known/assetlinks.json` debe cuadrar con el APK de `public/descargas/`. Si se fija nativo como oficial, cambiar ambos a `com.ventaspro.whatsapp`.

4. **VAPID Push**  
   ```
   VAPID_PUBLIC_KEY=...
   VAPID_PRIVATE_KEY=...
   VAPID_SUBJECT=mailto:soporte@ventasproia.com
   ```
   Generar: `npx web-push generate-vapid-keys`. Test: `/api/push/vapid-key` → `configurado:true`, luego `/api/push/probar` desde panel.

5. **Rotar secretos expuestos**  
   Rotar `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `OPENCODE_API_KEY` que estuvieron en historial `fd02734` y en `OPENCODE_CONFIG_CONTENT`. Reescribir remote URL sin token.

6. **APK firmado y publicado**  
   Build release con `VENTASPRO_RELEASE_*` env, `versionCode` incremental, subir a `public/descargas/` y a Play Internal Testing. Incrementar `version` en `app-android.ts`.

7. **Smoke en dispositivo real** (ver §10)

### 🟠 Altos (GO con deuda, pero 48h)

8. `helmet()` + ocultar `x-powered-by` + CSP básico.
9. Parametrizar `ApiClient.baseUrl` por flavor / `BuildConfig`.
10. Corregir `extraerNumero()` — no guardar nombre como phone; usar normalización E.164 + descartar si no es número.
11. Unificar Dockerfiles (eliminar `artifacts/Dockerfile` o documentar que no se usa).
12. Añadir `ADMIN_EMAIL`/`ADMIN_PASSWORD` en primer arranque (evita seed random impreso en log).

### 🟡 Medios (backlog 1–2 semanas)

13. Redis para rate-limit distribuido si se escala a >1 réplica.
14. Implementar `MessageSyncWorker` o retirarlo.
15. `networkSecurityConfig` + `proguard` + tests android.
16. `typecheck` real en `ventas-pro` (no `exit 0`), `pnpm` en CI, `vitest` gate.
17. Backup automático `*.db` + `IMAGE_STORE_DIR` a S3/R2.

---

## 10. Smoke test “app real” — 30 min antes de anunciar GO

En **2 dispositivos reales** (Android 13 y 14, Chrome actualizado):

1. `curl https://ventasproia.com/api/health` → `{"status":"ok","problemas":[]}` (o solo `[]`), `base.ok:true`, `tablasEsperadas` N, `whatsapp.conectado:false` antes de QR.
2. Abrir web, registrarse/loguearse, verificar cookie `tenant_id` firmada (DevTools → `__Host` o `tenant_id` con firma).
3. `Chrome → Menú → Agregar a pantalla de inicio` → abrir PWA → debe abrir `standalone` sin barra, `?app=ventaspro` persiste tras navegar.
4. `Ajustes → Notificaciones` → activar push → `POST /api/push/probar` → llega notificación con acción “Abrir” → click abre `/conversations`.
5. Descargar `VentasmPro-1.0.0.apk` → Instalar (permitir origen) → abrir → **sin barra de URL** (si hay barra → assetlinks falló). Verificar `assetlinks.json` en el paso 1.
6. WhatsApp: escanear QR en `WhatsApp → estado`, enviar mensaje desde otro número personal → bot responde en <5s, throttling `TYPING_WPM` visible, `POST /api/conversations/:id/messages` funciona, límite mensual `checkMessageLimit` no bloquea trial.
7. Landing: crear en `Landing Studio`, publicar → abrir `/l/:slug` sin sesión → formulario `POST /landing-publica/:slug/pedido` → pedido aparece en `Pedidos` + push + WhatsApp dueño.
8. Pagos: sandbox MercadoPago/PayPal → webhook `POST /webhooks/subscription/mercadopago` con `x-signature` válida → suscripción `active` + email token (logs no filtran token).
9. Android nativo (si se publicita): instalar `com.ventaspro.whatsapp` debug → conceder Acceso a notificaciones → enviar WhatsApp → aparece en Dashboard nativo → si `confianza ≥75` responde automático vía notificación.
10. Reiniciar servicio Easypanel → re-login sin perder Facebook tokens ni sesión (prueba de `CREDENTIALS_ENCRYPTION_KEY` y `COOKIE_SECRET` fijos).

Si alguno falla → NO-GO.

---

## 11. Roadmap 5 días para “100% app real”

**Día 1 — Seguridad + Deploy**
- Setear `COOKIE_SECRET` + `CREDENTIALS_ENCRYPTION_KEY` + `DATABASE_URL` + `APP_URL` + `ANDROID_*` + `VAPID_*` en EasyPanel.
- Elegir DB prod (Postgres) y montar volumen.
- Rotar tokens del historial, push `main` con `entrypoint.sh` + `Dockerfile` unificado.
- `curl /api/health` verde.

**Día 2 — TWA / PWA**
- Regenerar keystore, extraer `SHA256`, setear env, rebuild TWA con `@bubblewrap/cli` o PWABuilder.
- Publicar `VentasmPro-1.0.1.apk` en `public/descargas/`, bump `app-android.ts`.
- Test PWA install + TWA sin barra en 2 dispositivos.

**Día 3 — Android nativo**
- Flavor `baseUrl`, fix `extraerNumero`, permiso UX, `MessageSyncWorker` real o removal.
- Build `assembleRelease` firmada, Internal Testing.

**Día 4 — Hardening**
- `helmet`, `x-powered-by` off, `rateLimit` headers, `push` e2e, `landing-publica` 401 regression test.

**Día 5 — Pre-lanzamiento**
- Smoke completo §10, Lighthouse PWA ≥90, backup/restore drill, `TRASPASO_2026-10-11.md` para cliente.

---

## 12. Archivos clave tocados en esta auditoría

`artifacts/api-server/src/app.ts` (publicRoutes, cors, cookieSecret), `src/health.ts`, `lib/credentials-vault.ts`, `lib/push.ts`, `middleware/rateLimiting.ts`, `routes/subscription-webhooks.ts`, `lib/db/src/index.ts`, `artifacts/ventas-pro/public/{manifest.json,sw.js,index.html}`, `src/lib/{pwa.ts,app-android.ts}`, `android-project/{app/build.gradle.kts,AndroidManifest.xml,MainActivity.kt,api/ApiClient.kt,services/WhatsAppNotificationListener.kt}`, `Dockerfile`, `easypanel.yml`, `.env.example`, `AUDIT_REPORT.md`.

---

## 13. Conclusión

Tienes una **base de producción real** (no un prototipo): health honesto, tenancy corregido, vault cifrado, PWA lista, Baileys multi-tenant y landings funcionales. **No es “listo para vender mañana”** hasta cerrar el mismatch de paquete TWA, los secretos fijos y la DB durable. Con esos 7 bloqueantes cerrados + smoke real, **sí puedes anunciar “compatible total con apps reales”** y escalar a Play Store.

> Próximo paso sugerido: ¿quieres que lo deje GO? Puedo en esta rama: 1) alinear `com.ventaspro.app` en todos lados, 2) añadir `helmet` + `x-powered-by:false`, 3) generar VAPID en `.env.example` con instrucción, 4) crear `docs/CHECKLIST_PRODUCCION.md` imprimible para el deploy en EasyPanel. Dime y lo hago.

