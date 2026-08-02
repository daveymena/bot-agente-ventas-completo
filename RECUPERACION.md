# Recuperación del servicio — qué tenés que hacer vos

Estado al 2 de agosto de 2026. Ordenado por urgencia: hacé 1 → 2 → 3 → 4.

El código está listo y verificado. Todo lo que queda acá requiere credenciales
o accesos que yo no tengo.

---

## Diagnóstico en una línea

**Tu servidor y tu contenedor están bien.** Lo que se rompió es el camino
hasta ellos: el dominio `easypanel.host` quedó aparcado.

| Comprobación | Resultado |
|---|---|
| `https://tecnoia-bot-agenwhatsapp.2xs2bu.easypanel.host` | TLS no completa ❌ |
| Vía HTTP (puerto 80) | 200, pero es una **página de parking de Namecheap** |
| `easypanel.host` (dominio raíz) | La misma página de parking |
| Un subdominio inventado que nunca existió | También responde con el parking |
| **Tu VPS `https://144.91.112.79`** | **200 — panel de EasyPanel vivo ✅** |

La fila del subdominio inventado es la que cierra el caso: si algo que nunca
existió responde igual que lo tuyo, es DNS comodín apuntando todo a un
parking. Ningún cambio dentro de tu panel puede causar eso.

---

## 1. Recuperar el acceso (urgente)

Entrá al panel **por IP**, no por dominio:

```
https://144.91.112.79
```

Vas a ver un aviso de certificado inválido — es esperable, el certificado está
emitido para el dominio, no para la IP. Aceptá y seguí.

Ahí confirmá si el servicio `Sofía API Server` sigue corriendo.

> **Ojo:** el panel responde por IP pero `/api/health` da 404, así que el
> proxy interno no está ruteando hacia tu app. Puede que además del dominio
> haya quedado desarmada la ruta del servicio. Revisá la config de dominios
> del servicio dentro del panel.

---

## 2. Conectar un dominio propio (la solución de fondo)

Mientras dependas de `*.easypanel.host` estás atado a que un tercero mantenga
ese dominio. Con uno tuyo esto no vuelve a pasar.

1. Comprá o usá un dominio que ya tengas
2. Apuntá un registro **A** a `144.91.112.79`
3. En EasyPanel → tu servicio → **Domains** → agregalo y activá el certificado
   automático (Let's Encrypt)

### Después de conectarlo, actualizá estas tres cosas

**a) `APP_URL`** — en las variables de entorno del servicio:

```
APP_URL=https://tu-dominio-nuevo.com
```

Esto ahora es **un solo cambio**. Antes había 14 lugares con el dominio viejo
clavado; ya está centralizado.

**b) Webhooks de pago.** Mientras estuvo caído, **las confirmaciones de pago
no llegaron**: alguien pudo pagar sin que el sistema se entere. Actualizá la
URL en ambas pasarelas:

- MercadoPago → `https://tu-dominio.com/api/webhooks/...`
- PayPal → igual

Y revisá si hubo pagos huérfanos durante la caída.

**c) Facebook.** Las URLs de webhook de Messenger, Lead Ads y del catálogo
también apuntan al dominio muerto.

---

## 3. Desplegar los arreglos pendientes

Hay tres PRs listos que **nunca llegaron a producción**:

| PR | Qué arregla |
|---|---|
| [#9](https://github.com/daveymena/bot-agente-ventas-completo/pull/9) | Menú móvil tapado, chat del Arquitecto aplastado, mensajes ilegibles, login rediseñado |
| [#10](https://github.com/daveymena/bot-agente-ventas-completo/pull/10) | El Arquitecto anuncia y se queda sin actuar |
| (rama) | Tope de gasto diario, multi-negocio, dominio aparcado removido |

Mergealos y hacé **un solo Deploy**.

> El menú móvil de la app está roto en producción desde hace horas por este
> motivo: el arreglo existe y está commiteado, pero nunca se reconstruyó la
> imagen. EasyPanel **no auto-despliega** en push — hay que darle Deploy a mano.

---

## 4. Seguridad — hacelo hoy

**a) Revocá el token de GitHub.** El `ghp_DPZ...` que pasaste por el chat
quedó en texto plano en la conversación. GitHub → Settings → Developer
settings → Personal access tokens → revocar.

Para la próxima, evitás pasarlo por chat con:

```bash
gh auth login --scopes repo --hostname github.com
```

**b) Guardá el token de EasyPanel en archivo, no en el chat.** Si querés que
yo opere el panel por API, generá un token en Settings → API Tokens y creá:

```bash
echo "EASYPANEL_URL=https://144.91.112.79" > .easypanel.env
```

Después agregale `EASYPANEL_TOKEN=<tu-token>` con un editor. Ese archivo ya
está en `.gitignore` justamente para esto. Yo lo leo de ahí y nunca pasa por
la conversación.

---

## Pendientes que quedan abiertos (no urgentes hoy)

- **Pagos multi-tenant.** Hoy el checkout lee `process.env.PAYPAL_CLIENT_ID` y
  `MERCADO_PAGO_ACCESS_TOKEN`: **los cobros de todos tus clientes caen en tu
  cuenta**, no en la de cada uno. 17 usos de credenciales globales contra 3
  del tenant. El modelo de datos ya soporta credenciales por cliente; el
  código de cobro las ignora. Es lo más grave que queda.
- **Aislamiento entre clientes.** Quedó a medias la auditoría: encontré 21
  usos de `getDefaultTenant()` como fallback y `tenantId` clavado en 1 en
  varios lugares (`app.ts`, `channel-manager.ts`, `personality-profiles.ts`,
  `whatsapp.ts`). Hay que revisar cada uno.
- **`typecheck` de ventas-pro es `"exit 0"`** — un no-op. Por eso llegó a
  producción el bug del menú móvil: TypeScript lo habría marcado. Activarlo
  va a destapar errores acumulados.
- **Backup de la base.** `*.db` está en `.gitignore` y los 83 productos viven
  solo en el volumen de EasyPanel. Si ese volumen se recrea, se pierde todo.
- **Nombre de marca inconsistente:** el login dice "Sofía AI Sales", el panel
  dice "VentasPro".
