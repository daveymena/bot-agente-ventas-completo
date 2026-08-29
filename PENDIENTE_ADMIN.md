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
