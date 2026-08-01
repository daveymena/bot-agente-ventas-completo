# 📘 Guía de Despliegue y Seguridad — Agent-Sales-Bot (VentasPro)

> Documento de referencia. Aquí está **todo lo que debes hacer**: variables de
> entorno, tokens de Facebook, rotación de secretos, backups y despliegue en
> EasyPanel. Consúltalo cuando lo necesites.

---

## 🔑 Regla de oro de seguridad

1. **Las credenciales NUNCA van en el chat, ni en el repositorio (git).**
2. Viven **solo** en la configuración de **variables de entorno de EasyPanel**
   (o en archivos locales `.env*` que están en `.gitignore`).
3. Si una credencial se filtra (se sube a git o se pega en un chat), hay que
   **rotarla** (generar nueva + revocar la vieja). Borrarla no basta: ya estuvo expuesta.

---

## 1) Variables de entorno

**Dónde se ponen:** EasyPanel → tu proyecto → servicio **Sofía API Server** →
pestaña **Environment**. No en el repo.

### 🟢 Mínimas para arrancar
| Variable | Ejemplo / valor | Para qué |
|---|---|---|
| `NODE_ENV` | `production` | Modo |
| `PORT` | `3002` | Puerto del backend |
| `HOST` | `0.0.0.0` | Bind |
| `APP_URL` | `https://tudominio.com` | URL pública |
| `USE_SQLITE` | `true` | Usa SQLite (sin servidor de DB) |
| `SQLITE_PATH` | `./data/tecnovariedades.db` | Ruta de la DB |
| `LOG_LEVEL` | `info` | Logs |

> Si usas PostgreSQL en vez de SQLite: pon `USE_SQLITE=false` y
> `DATABASE_URL=postgres://usuario:pass@host:5432/tecnovariedades-db`.

### 🤖 IA (al menos UNA key es obligatoria)
Orden de fallback configurable con `AI_FALLBACK_ORDER` (ej: `opencode,groq,github,g4f`).

| Variable | Cómo obtenerla |
|---|---|
| `OPENCODE_API_KEY` (+ `OPENCODE_API_URL`, `OPENCODE_MODEL`) | https://api.freemodel.dev (gratis) |
| `GROQ_API_KEY` (+ `GROQ_MODEL`) | https://console.groq.com/keys (gratis) |
| `GITHUB_TOKEN` (+ `GITHUB_MODEL`) | https://github.com/settings/tokens (GitHub Models) |
| `NVIDIA_API_KEY` (+ `NVIDIA_MODEL`) | https://build.nvidia.com |
| `G4F_ENABLED=true` | Respaldo gratuito sin key |

> El código soporta 30+ proveedores más (DeepSeek, Mistral, Together, Cohere,
> OpenRouter, etc.) — todos opcionales, mismo patrón `XXX_API_KEY` + `XXX_MODEL`.

### 💳 Pagos
| Variable | Cómo obtenerla |
|---|---|
| `MERCADO_PAGO_PUBLIC_KEY`, `MERCADO_PAGO_ACCESS_TOKEN` | https://www.mercadopago.com/developers → Tus integraciones |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE` (`live`/`sandbox`) | https://developer.paypal.com → Apps & Credentials |
| `TRANSFER_NUMBER`, `TRANSFER_NAME` | Datos de tu cuenta para transferencia bancaria |

### 📧 Notificaciones (SMTP)
| Variable | Ejemplo |
|---|---|
| `SMTP_HOST` / `SMTP_PORT` | `smtp.gmail.com` / `587` |
| `SMTP_USER` / `SMTP_PASS` | tu correo / **contraseña de aplicación** (no la normal) |
| `EMAIL_FROM` / `EMAIL_TO` | remitente / destino de avisos |

### 👤 Admin
| Variable | Para qué |
|---|---|
| `ADMIN_PHONE` | WhatsApp del admin para notificaciones |

---

## 2) 📱 Facebook — todos los tokens

**Dónde se ponen:** las mismas variables de entorno de EasyPanel.

| Variable | Qué es | Dónde sacarla |
|---|---|---|
| `FB_APP_ID` | ID de tu app | https://developers.facebook.com → tu App → **Configuración → Básica** |
| `FB_APP_SECRET` | Secreto de la app | mismo lugar (**Mostrar**) |
| `FB_ACCESS_TOKEN` | Token de acceso (páginas/ads) | **Business Manager → Usuarios del sistema →** genera token con permisos (ver abajo). Para pruebas rápidas: **Graph API Explorer** |
| `FB_PAGE_ID` | ID de tu página | Tu página → **Información**, o Graph API `/me/accounts` |
| `FB_AD_ACCOUNT_ID` | Cuenta publicitaria (`act_123...`) | **Business Manager → Configuración → Cuentas publicitarias** |
| `FB_CATALOG_ID` | Catálogo de productos | **Commerce Manager → Catálogo → Configuración** |
| `FB_PIXEL_ID` | Píxel (métricas/conversiones) | **Events Manager → Orígenes de datos → tu Píxel** |
| `FB_MESSENGER_PAGE_TOKEN` | Token para Messenger | Token de página (mismo del System User) |
| `FB_WEBHOOK_VERIFY_TOKEN` | **Lo inventas tú** | Una cadena secreta cualquiera; ponla igual en la app (Webhooks) y aquí |
| `FB_MESSENGER_VERIFY_TOKEN` | **Lo inventas tú** | Ídem, para el webhook de Messenger |

### Permisos (scopes) que necesita el `FB_ACCESS_TOKEN`
- `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`
- `pages_messaging` (Messenger)
- `ads_management`, `ads_read` (crear/leer anuncios)
- `catalog_management` (catálogo)
- `business_management`
- `leads_retrieval` (si usas Lead Ads)

> ⚠️ **Sin `FB_AD_ACCOUNT_ID`, `FB_CATALOG_ID` y `FB_PIXEL_ID` la creación de
> anuncios, el catálogo y las métricas NO funcionan**, aunque tengas el token.
> El Arquitecto IA responderá "❌ Faltan variables de Facebook: ..." si faltan.

---

## 3) 🔐 Rotación de secretos filtrados (URGENTE)

Los archivos `.env.easypanel`, `.env.easypanel.optimizado` y
`artifacts/api-server/.env.easypanel` **estuvieron commiteados con credenciales
reales**. Aunque ya se destrackearon, **siguen en el historial de git** → deben
considerarse comprometidos y **rotarse**.

### Checklist de rotación (genera nuevo + revoca viejo)
- [ ] **GitHub token** → https://github.com/settings/tokens (revoca el `ghp_...` viejo)
- [ ] **Mercado Pago** → https://www.mercadopago.com/developers → Tus integraciones → renueva Access Token
- [ ] **PayPal** → https://developer.paypal.com → Apps & Credentials → regenera secret
- [ ] **NVIDIA** → https://build.nvidia.com → API Keys
- [ ] **OpenCode / FreeModel** → panel del proveedor → regenera key
- [ ] **Groq** → https://console.groq.com/keys
- [ ] **SMTP / Gmail** → https://myaccount.google.com/apppasswords → revoca y crea nueva contraseña de aplicación
- [ ] **Contraseña de la DB** (`DB_PASSWORD`) → cámbiala en EasyPanel (servicio Postgres) y en la app
- [ ] **Facebook** → si el `FB_ACCESS_TOKEN` estuvo expuesto, regénéralo en Business Manager

Después de rotar: **actualiza los valores nuevos en EasyPanel → Environment** y
haz redeploy.

### Limpiar el historial de git (opcional pero recomendado)
> No reemplaza la rotación. Reescribe la historia → cambia todos los SHAs y
> requiere `--force`. Coordina antes (rompe PRs abiertos y clones).

```bash
pip install git-filter-repo
git clone --mirror https://github.com/daveymena/bot-agente-ventas-completo.git repo-limpio
cd repo-limpio
git filter-repo --force \
  --path .env.easypanel \
  --path .env.easypanel.optimizado \
  --path artifacts/api-server/.env.easypanel \
  --path artifacts/opencode-proxy/.env.easypanel \
  --invert-paths
git push --force --all
git push --force --tags
```

---

## 4) 💾 Backups (haz esto ANTES de tocar historial o rotar)

Los datos de producción (productos, conversaciones, ventas) viven en el **volumen
`./data`** de EasyPanel, **NO en git**. Reescribir git NO los afecta.

### Respaldar la base de datos (SQLite)
En EasyPanel → servicio API → **Console**:
```bash
cp /app/data/tecnovariedades.db "/app/data/backup-$(date +%Y%m%d-%H%M).db"
ls -lh /app/data/*.db
```
Luego descarga el `.db` a tu PC (file manager de EasyPanel o `scp`).

### PostgreSQL (si lo usas)
```bash
pg_dump -U postgres -d tecnovariedades-db -F c -f /tmp/backup-$(date +%Y%m%d).dump
```

### EasyPanel UI
Proyecto → pestaña **Backups** → configura destino y **Backup Now**.
(Tu `easypanel.yml` ya define backup diario de `postgres_data` y `./data`.)

---

## 5) 🚀 Despliegue en EasyPanel

### Cómo funciona hoy
- `Dockerfile` (raíz) compila **api-server** + **ventas-pro** (dashboard).
- El **api-server** sirve el dashboard y las APIs en el puerto **3002**.
- `easypanel.yml` define los servicios: `api-server`, `postgres`, `opencode-proxy`, `ollama`.
- Volúmenes persistentes: `./data` (DB), `.baileys-auth` (WhatsApp).

### Redeploy
1. Sube el código a git (rama correspondiente).
2. EasyPanel → servicio → **Deploy** (o webhook de deploy).
3. Los volúmenes de datos se conservan; solo se reconstruye la imagen.

### Control por API (opcional, seguro)
Carpeta `scripts/easypanel/`:
```bash
# Provee la key SIN exponerla: variable de entorno o scripts/easypanel/.easypanel.env (gitignored)
export EASYPANEL_URL="https://panel.tudominio.com"
export EASYPANEL_API_KEY="****"
cd scripts/easypanel
./easypanel.sh check       # valida credenciales
./easypanel.sh deploy tienda
```

### La tienda pública (`packages/tienda`) — pendiente de cablear
Hoy **no** se compila ni se sirve en producción (no está en el Dockerfile ni en
`easypanel.yml`). Para desplegarla como servicio propio:
1. Arreglado ya: dependencia `@craftjs/core` y el `external` de react-query en `vite.config`.
2. Falta: su `Dockerfile` (build + nginx) usando `packages/tienda/nginx.conf.template`
   (SPA + proxy `/api` al api-server), y añadir el servicio `tienda` a `easypanel.yml`.

---

## 6) ✅ Orden recomendado de operación

1. **Backup** de la DB (sección 4).
2. Verifica que EasyPanel tenga **todas las variables** puestas (secciones 1 y 2).
3. **Rota** las credenciales filtradas (sección 3) y actualízalas en EasyPanel.
4. (Opcional) **Limpia el historial** de git.
5. **Redeploy** y verifica: `https://tudominio.com/api/health`.

---

## 7) 📝 Qué se hizo en esta sesión (contexto)

- **Fix del chat "Arquitecto IA"**: se veía comprimido y sin auto-scroll; ahora
  llena la pantalla y baja a la última respuesta (`code-agent.tsx`, `architect.tsx`).
- **Ejecutor de acciones del Arquitecto**: antes decía "listo" sin hacer nada;
  ahora ejecuta de verdad (crear/mejorar productos, anuncios y catálogo de
  Facebook) y muestra un reporte real ✅/❌ (`architect-executor.ts`).
- **Seguridad**: se destrackearon los `.env.easypanel` con secretos y se añadió
  `.gitignore` + el helper seguro `scripts/easypanel/`.
- **Tienda**: arreglos de build (`@craftjs/core`, react-query) y `nginx.conf.template`.
