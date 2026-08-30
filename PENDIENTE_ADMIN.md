# Lo que solo podés hacer vos

Escrito el 2026-08-29. Son las cosas que **no se arreglan con código**: credenciales,
cuentas y clics en paneles. Están en orden de impacto, no de dificultad.

Todo lo demás del sistema ya está desplegado y verificado contra producción.

---

## 1. Pagar el tier de Groq — es lo que más cambia por menos plata

**El problema, medido:** hay **una sola cuenta de Groq gratuita** con un tope de
**8.000 tokens por minuto**, y **dos consumidores compitiendo por ella**: Atlas
(el operador) y el bot de ventas de WhatsApp.

Cada turno de Atlas se come la cuota, y cuando un cliente escribe por WhatsApp
el modelo bueno rebota y contesta el chico. Probado el 2026-08-29: a "¿qué
incluye el curso de piano y cuánto sale?" contestó `openai/gpt-oss-20b`,
teniendo el 120B configurado como primera opción.

Es el techo de todo lo demás. Con esto resuelto desaparecen de un saque:

- los turnos de Atlas de 105 segundos
- las respuestas inventadas ("tenés 2 productos" cuando hay 84 activos)
- los contextos truncados (Atlas contestando que "las imágenes que compartiste
  eran demasiado grandes" cuando no había ninguna imagen)
- el bot de ventas atendiendo clientes con el modelo chico

**Qué hacer:** activar el Developer Tier en https://console.groq.com/settings/billing

**Alternativa sin costo, a medias:** crear una **segunda cuenta gratuita** de
Groq y usar una clave para Atlas y otra para el bot de ventas. No sube el tope,
pero **impide que el operador le robe la cuota al que vende**. Si vas por acá,
avisá y separo las claves en el código.

---

## 2. Rotar las claves de API — hay una fuga real

**El problema:** cuando el build de un servicio falla, la API de EasyPanel
devuelve el comando completo de `docker build` **con todas las claves en texto
plano**. Cualquiera con el token de EasyPanel las ve.

Verificado el 2026-08-29 al intentar desplegar `opencode-clean`: la respuesta
del error incluía `GROQ_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`,
`DEEPSEEK_API_KEY`, `FACEBOOK_SYSTEM_TOKEN` y `FACEBOOK_PAGE_TOKEN` completos.

**Qué hacer, en este orden:**

| Clave | Dónde se regenera |
|---|---|
| `GROQ_API_KEY` | https://console.groq.com/keys |
| `FACEBOOK_SYSTEM_TOKEN` y `FACEBOOK_PAGE_TOKEN` | Meta Business → Configuración → Usuarios del sistema |
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys |
| `MISTRAL_API_KEY` · `DEEPSEEK_API_KEY` | consolas respectivas (ver punto 5: quizá conviene borrarlas) |

Después se pegan en EasyPanel → `tecnoia / bot-agenwhatsapp` → Environment.

⚠️ **Y el token de GitHub también.** Está en texto plano dentro de la URL del
remoto de git: sale entero con `git remote -v`. Se regenera en
https://github.com/settings/tokens y se actualiza con `git remote set-url`.

---

## 3. Borrar las campañas de prueba

En Ads Manager hay **dos campañas creadas hoy para probar**, las dos en pausa
(no gastan un peso, pero son basura):

```
120249271112670097   INTELIGENCIA ARTIFICIAL 2026 ... - 29/8/2026
120249271574350097   INTELIGENCIA ARTIFICIAL 2026 ... (borrador 97)
```

Borrar la campaña se lleva en cascada su conjunto y su anuncio.

---

## 4. Arreglar el build de `opencode-clean`

**El problema:** ese servicio (el cerebro de Atlas) **no se puede desplegar**:
`docker buildx build` falla con exit code 1. Hoy solo se le pueden aplicar
cambios de configuración con **stop + start**, que no reconstruye la imagen.

Funciona, pero significa que **cualquier cambio de código de ese contenedor está
bloqueado**. Hay que mirar los logs del build en el panel de EasyPanel para ver
qué paso del Dockerfile revienta.

**Y de paso, algo que le falta:** ese servicio **no tiene volumen montado**. Si
alguna vez le conectás una cuenta (Copilot, por ejemplo), el login se guarda en
`/root/.local/share/opencode/auth.json` y **se borra en el próximo reinicio**.
Los tres servicios `oc-*` sí tienen ese volumen; el cerebro de Atlas no.

Se agrega en EasyPanel → `opencode1 / opencode-clean` → Mounts → Volume, con
ruta `/root/.local/share/opencode`.

---

## 5. Decidir qué hacer con las cuentas muertas

Probadas una por una con llamada real el 2026-08-29:

| Proveedor | Estado |
|---|---|
| **groq** | ✅ lo único vivo (`gpt-oss-120b` en 442 ms) |
| **opencode** (Zen free) | ⚠️ parcial — `nemotron-3-ultra-free` OK, `big-pickle` sin cupo |
| anthropic | ❌ 401, **clave inválida** (mal pegada, no sin saldo) |
| openrouter | ❌ 429, cuota agotada y sin crédito |
| deepseek · mistral · mimo | ❌ 402, sin saldo |
| nvidia_nim | ❌ 410, modelo retirado |
| github | ❌ error de conexión (GitHub Models se está retirando) |
| copilot | ❌ **sin token en ningún lado** |

**Lo que hay que decidir:**

- **Anthropic**: la clave está mal pegada, no sin saldo. Si la cuenta existe, es
  **repegar la clave** y tenés el mejor modelo de la lista. Si no existe, borrá
  la variable para que no se intente.
- **Copilot**: si tenés la suscripción activa, el token sale de VS Code
  (`%APPDATA%\GitHub Copilot\apps.json`, empieza con `gho_`) y se carga como
  `COPILOT_TOKENS=["gho_..."]`. Acepta varias cuentas en cola. Si no la tenés,
  no hay nada que hacer: el código ya lo deja detrás de Groq y se saltea gratis.
- **Las muertas con saldo en cero** (deepseek, mistral, mimo, openrouter):
  o les cargás saldo o conviene **borrar sus variables**. Con clave cargada pero
  sin saldo, cada turno gasta una llamada real en descubrir que no responden.

---

## 6. Lo único que mide si todo esto sirvió

**Tratos ganados: 0**, con 18 conversaciones y 106 mensajes.

Todo lo construido son medios. La verificación que falta es una conversación
real que llegue al cierre y cobre.

---

## Los MCP de `opencode-clean`: 4 de 7 rotos (medido 2026-08-30)

OpenCode instaló herramientas dentro del contenedor por MCP. **No están
funcionando**, y conviene saber exactamente qué pasa antes de tocarlas.

```
operator     ❌ timeout 30 s      ← el que daría poder sobre la app
ventaspro    ❌ timeout 30 s      ← el otro que importa
filesystem   ❌ conexión cerrada
git          ❌ conexión cerrada
brain        ✅ conectado
fetch        ✅ conectado
commands     ✅ conectado
```

### Lo que NO es

**No causan lentitud.** Medido: el fallo se cachea al arrancar, así que
`/mcp` responde en 0,2-0,6 s y crear sesión en 0,7 s. Los 98 segundos que
tardaba un anuncio no salían de acá.

**No es que los archivos se hayan perdido.** El patrón de error lo dice: un
archivo inexistente hace que `node` muera al instante y el cliente reporta
"conexión cerrada" (es lo que pasa con `filesystem` y `git`). Un **timeout**
significa lo contrario: el proceso arranca, vive, y nunca contesta el saludo
del protocolo.

**No es la credencial.** El `VENTASPRO_PASSWORD` del MCP se probó contra el
login real y es válido.

### Lo que sí es

Los dos scripts (`/opt/operator/operator/mcp-server.mjs` y
`/root/.local/share/opencode/ventaspro-mcp.mjs`) arrancan y se cuelgan antes
del handshake. La causa habitual en un servidor MCP por stdio es escribir en
`stdout` — un solo `console.log` corrompe el canal JSON-RPC y el cliente espera
para siempre. La otra es hacer trabajo asíncrono antes de conectar el
transporte.

`git` no va a funcionar nunca así: `mcp-server-git` es un paquete de **Python**
(se corre con `uvx`), no de npm. Con `npx` siempre va a cerrar la conexión.

### Recomendación: no arreglarlos

`operator` y `ventaspro` harían lo que **ya hace el puente MCP propio**
(`routes/mcp-bridge.ts`, endpoint `/api/internal/mcp/atlas`), que sí funciona,
filtra las herramientas por pedido y pasa toda escritura por `propose_action`
para que el admin apruebe. Duplicarlo por fuera deja dos caminos hacia la misma
app, uno de ellos **sin esos candados**.

Si aun así se quieren, hay que hornearlos en la imagen: `opencode-clean` no
tiene volumen y no se puede reconstruir (ver §2 de `TRASPASO_SESION.md`).

### 🔴 Urgente y aparte: credenciales en texto plano

`OPENCODE_CONFIG_CONTENT` de `opencode-clean` lleva, en claro:

- la contraseña de VentasPro del admin (verificada: **funciona**)
- usuario y URL de EasyPanel

Cualquiera que lea esa variable entra a la app como el admin. **Cambiar la
contraseña de VentasPro** y sacarlas de ahí. Va junto a lo ya pendiente:
`GROQ_API_KEY`, `OPENROUTER_API_KEY` y el `GITHUB_TOKEN` del historial de git.
