# ✅ Paso a paso — Cómo sacar cada API y dónde colocarla

Guía práctica, en orden. Sigue los pasos tal cual. Cada valor que copies lo
pegas en **EasyPanel** (ver Paso 0). **Nunca** pegues estos valores en un chat
ni los subas a git.

---

## Paso 0 — Cómo colocar una variable en EasyPanel (esto lo harás muchas veces)

1. Entra a tu **EasyPanel** → abre tu **proyecto**.
2. Clic en el servicio **Sofía API Server** (el backend).
3. Ve a la pestaña **Environment** (Variables de entorno).
4. Cada variable se escribe así, una por línea:
   ```
   NOMBRE_VARIABLE=valor
   ```
   Ejemplo: `FB_PAGE_ID=1234567890`
5. Al terminar de pegar todas, clic en **Save** y luego **Deploy** (redeploy).

> Regla: aquí van TODOS los secretos. No en el repo, no en el chat.

---

## Paso 1 — IA (obligatorio: al menos UNA)

El bot necesita un motor de IA. La más fácil y gratis es **Groq**:

1. Entra a **https://console.groq.com/keys**
2. Inicia sesión (con Google o correo).
3. Clic en **Create API Key** → ponle un nombre → **Submit**.
4. **Copia** la key (empieza con `gsk_...`). *Solo se muestra una vez.*
5. En EasyPanel agrega:
   ```
   GROQ_API_KEY=gsk_lo_que_copiaste
   GROQ_MODEL=llama-3.1-8b-instant
   AI_FALLBACK_ORDER=groq,opencode,g4f
   G4F_ENABLED=true
   ```

> Alternativas (opcionales): OpenCode (`OPENCODE_API_KEY` en https://api.freemodel.dev),
> GitHub Models (`GITHUB_TOKEN`), NVIDIA (`NVIDIA_API_KEY` en https://build.nvidia.com).

---

## Paso 2 — Facebook (la parte más larga)

### 2.1 — Crear/abrir tu App y sacar App ID y Secret
1. Entra a **https://developers.facebook.com/apps**
2. Si no tienes app: **Crear app** → tipo **Empresa / Business** → nómbrala.
3. Abre tu app → menú izquierdo **Configuración → Básica**.
4. Copia **Identificador de la app** y **Clave secreta** (clic en *Mostrar*):
   ```
   FB_APP_ID=tu_app_id
   FB_APP_SECRET=tu_app_secret
   ```

### 2.2 — Sacar el ID de tu Página
1. Entra a tu **página de Facebook** → **Información / Acerca de**.
2. Baja hasta **Identificador de la página** y cópialo:
   ```
   FB_PAGE_ID=el_id_de_tu_pagina
   ```

### 2.3 — Sacar el Token de acceso (el más importante)
La forma correcta y duradera es con un **Usuario del sistema**:
1. Entra a **Business Manager**: **https://business.facebook.com/settings**
2. Menú izquierdo → **Usuarios → Usuarios del sistema**.
3. Clic **Agregar** → crea uno (rol: Admin) → **Asignar activos**: asígnale tu
   **Página**, tu **Cuenta publicitaria** y tu **Catálogo**.
4. Clic **Generar nuevo token** → elige tu app → marca estos permisos:
   - `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`
   - `pages_messaging`
   - `ads_management`, `ads_read`
   - `catalog_management`
   - `business_management`
   - `leads_retrieval`
5. **Genera** y **copia** el token (largo). En EasyPanel:
   ```
   FB_ACCESS_TOKEN=el_token_largo
   FB_MESSENGER_PAGE_TOKEN=el_mismo_token
   ```

### 2.4 — Sacar el ID de la Cuenta Publicitaria
1. En **Business Manager → Configuración → Cuentas publicitarias**.
2. Copia el ID (viene como `act_1234567890`). En EasyPanel pon **con** el `act_`:
   ```
   FB_AD_ACCOUNT_ID=act_1234567890
   ```

### 2.5 — Sacar el ID del Catálogo
1. Entra a **Commerce Manager**: **https://business.facebook.com/commerce**
2. Abre tu **Catálogo** → **Configuración / Settings**.
3. Copia el **Catalog ID**:
   ```
   FB_CATALOG_ID=el_id_del_catalogo
   ```

### 2.6 — Sacar el ID del Píxel
1. Entra a **Events Manager**: **https://business.facebook.com/events_manager2**
2. Selecciona tu **Píxel** (Orígenes de datos) → copia su **ID**:
   ```
   FB_PIXEL_ID=el_id_del_pixel
   ```

### 2.7 — Tokens de verificación de webhook (TÚ los inventas)
No se sacan de ningún lado: son una palabra secreta que eliges tú, y debe ser
**igual** en la app (Webhooks) y aquí:
```
FB_WEBHOOK_VERIFY_TOKEN=inventate_algo_secreto_2024
FB_MESSENGER_VERIFY_TOKEN=inventate_otra_cosa_2024
```
Luego, en developers.facebook.com → tu app → **Webhooks**, cuando configures el
callback, pon exactamente ese mismo texto en "Verify Token".

---

## Paso 3 — Pagos

### 3.1 — Mercado Pago
1. Entra a **https://www.mercadopago.com/developers/panel** → **Tus integraciones**.
2. Crea/abre una aplicación → sección **Credenciales de producción**.
3. Copia **Public Key** y **Access Token**:
   ```
   MERCADO_PAGO_PUBLIC_KEY=APP_USR-...
   MERCADO_PAGO_ACCESS_TOKEN=APP_USR-...
   ```

### 3.2 — PayPal
1. Entra a **https://developer.paypal.com/dashboard/applications/live**
2. **Create App** (o abre la existente) → copia **Client ID** y **Secret**:
   ```
   PAYPAL_CLIENT_ID=tu_client_id
   PAYPAL_CLIENT_SECRET=tu_secret
   PAYPAL_MODE=live
   ```

### 3.3 — Transferencia bancaria (datos, no API)
```
TRANSFER_NUMBER=tu_numero_de_cuenta
TRANSFER_NAME=nombre_del_titular
```

---

## Paso 4 — Correo (SMTP, para notificaciones)

Con Gmail:
1. Activa verificación en 2 pasos en tu cuenta Google.
2. Entra a **https://myaccount.google.com/apppasswords**
3. Crea una **contraseña de aplicación** → copia los 16 caracteres.
4. En EasyPanel:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=tucorreo@gmail.com
   SMTP_PASS=los_16_caracteres
   EMAIL_FROM=tucorreo@gmail.com
   EMAIL_TO=donde_quieres_recibir_avisos@gmail.com
   ```

---

## Paso 5 — Base de datos y admin

```
USE_SQLITE=true
SQLITE_PATH=./data/tecnovariedades.db
ADMIN_PHONE=549XXXXXXXXXX
APP_URL=https://tudominio.com
NODE_ENV=production
PORT=3002
```

---

## Paso 6 — Guardar y desplegar

1. En EasyPanel → **Save** todas las variables.
2. Clic en **Deploy** (redeploy).
3. Verifica que arrancó: abre `https://tudominio.com/api/health` → debe responder OK.
4. Prueba el bot: entra al dashboard, y en **Arquitecto IA** pídele algo como
   "crea los borradores de anuncios de todos los productos" → debe ejecutar y
   mostrar ✅/❌ real (si algo falla por falta de variable, te lo dirá).

---

## Resumen de TODAS las variables (para copiar/pegar y rellenar)

```
# App
NODE_ENV=production
PORT=3002
HOST=0.0.0.0
APP_URL=
USE_SQLITE=true
SQLITE_PATH=./data/tecnovariedades.db
LOG_LEVEL=info
ADMIN_PHONE=

# IA
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
AI_FALLBACK_ORDER=groq,opencode,g4f
G4F_ENABLED=true

# Facebook
FB_APP_ID=
FB_APP_SECRET=
FB_PAGE_ID=
FB_ACCESS_TOKEN=
FB_MESSENGER_PAGE_TOKEN=
FB_AD_ACCOUNT_ID=
FB_CATALOG_ID=
FB_PIXEL_ID=
FB_WEBHOOK_VERIFY_TOKEN=
FB_MESSENGER_VERIFY_TOKEN=

# Pagos
MERCADO_PAGO_PUBLIC_KEY=
MERCADO_PAGO_ACCESS_TOKEN=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_MODE=live
TRANSFER_NUMBER=
TRANSFER_NAME=

# Correo
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
EMAIL_TO=
```

> ⚠️ Rellena estos valores **solo dentro de EasyPanel**, nunca en el repo ni en el chat.
