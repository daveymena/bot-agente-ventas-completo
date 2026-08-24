# TRASPASO — cómo retomar esto en otra terminal

Escrito el 2026-08-24 para que una sesión nueva de Claude arranque en frío sin
releer el historial. El estado del motor de ventas está en
`ESTADO_MOTOR_VENTAS.md`; esto es lo operativo: MCPs, accesos y qué está
bloqueado ahora mismo.

---

## 1. LO QUE ESTÁ BLOQUEADO AHORA (empezar por acá)

**El código está en `origin/master` pero NO está desplegado.**

La prueba: el desglose de tiempos de Atlas sigue mostrando la cadena vieja
(`deepseek → mistral → nemotron-nano → laguna → nemotron-ultra → big-pickle`).
El commit `569c3df` insertó `groq/openai/gpt-oss-120b` entre mistral y los
gratis de OpenRouter. **Si Groq no aparece en ese desglose, el deploy no
entró.** Ese es el canario más simple y no requiere acceso a EasyPanel.

**Qué hacer:** en EasyPanel, sobre el servicio del api-server, **stopService +
startService** — no otro "Deploy". Son ~30 s de caída y hay clientes
escribiendo (106 mensajes en 24 h), así que **hay que pedírselo al admin, no
hacerlo por cuenta propia**.

⚠️ Nunca dar un deploy por vivo mirando el hash de commit de EasyPanel: mintió
un día entero. Verificar siempre por comportamiento.

---

## 2. MCP: qué hay, qué funciona y qué no

Configurados en `~/.claude.json` (todos con `node <ruta al .js>`):

| Servidor | Comando | Estado al cierre |
|---|---|---|
| `pc-control-mcp` | `node C:\Users\ADMIN\pc-control-mcp\dist\index.js` | ⚠️ se desconectó a mitad de sesión |
| `playwright` | `node …\@playwright\mcp\cli.js` | ⚠️ se desconectó a mitad de sesión |
| `desktop-commander` | `node …\@wonderwhy-er\desktop-commander\dist\index.js` | ❌ nunca registró sus tools |
| `claude-in-chrome` | (extensión de Chrome) | ✅ el que sí funcionó |

### Trampas comprobadas — no volver a tropezar

1. **En Windows, nada de shims `.cmd`.** Un MCP lanzado con `npx` o con el bin
   global arranca pero **no registra sus herramientas en la sesión**, y
   `claude mcp list` igual dice "Connected". Hay que usar `node <ruta al .js>`.
   Los tres de arriba ya están así.

2. **`desktop-commander` dice "Connected" y no expone nada.** Pasó toda la
   sesión: `claude mcp list` lo daba por conectado y `ToolSearch` no encontraba
   ni una de sus herramientas (`start_process`, `edit_block`, `list_directory`).
   Arrancó tarde, después del inicio de sesión. **Se arregla reiniciando la
   sesión de Claude**, no tocando la config. Mientras tanto Bash + PowerShell
   cubren lo mismo.

3. **`browser_control` (pc-control) NO se engancha a un Chromium ya abierto**
   con su perfil: solo sabe lanzarlo él. Si hay uno corriendo con
   `C:\Users\ADMIN\pc-control-mcp\data\browser-profile`, hay que cerrarlo
   primero — la sesión vive en disco, no se pierde. Cerrarlo con PowerShell
   (`Get-CimInstance Win32_Process … Stop-Process`): la acción `close` de
   `window_control` tiene un bug de paso de parámetros y falla.

4. **`claude-in-chrome` es el más confiable** para leer producción, pero se
   cuelga con scripts largos: el `javascript_tool` corta a los 45 s. Partir en
   llamadas chicas (2-3 peticiones por vez), no lotes de 6.

### Cómo activarlos al abrir la sesión nueva

Los MCP se cargan solos, pero sus herramientas quedan **diferidas**: hay que
pedirlas con `ToolSearch` antes de usarlas, **todas en UNA llamada**:

```
ToolSearch: "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__get_page_text"
```

Si `pc-control` volvió: `ToolSearch: "+pc-control mouse keyboard window browser"`.

---

## 3. Cómo leer producción sin acceso a la base

La base (`tecnoia_tecnologi:5432`) es interna de EasyPanel: **no se alcanza
desde el PC**. Lo que sí funciona es la API con la sesión del navegador:

```js
// con claude-in-chrome, sobre una pestaña en ventasproia.com
await fetch('/api/conversations').then(r => r.json())
await fetch('/api/conversations/1/messages').then(r => r.json())
await fetch('/api/dashboard/summary').then(r => r.json())
await fetch('/api/products/cobrabilidad').then(r => r.json())
await fetch('/api/ai/catalog').then(r => r.json())          // proveedores + si tienen clave
await fetch('/api/ai/models/groq').then(r => r.json())       // modelos de un proveedor
// Probar un modelo DE VERDAD (llamada real al proveedor):
await fetch('/api/ai/test', { method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ proveedor:'groq', model:'openai/gpt-oss-120b' }) })
```

⚠️ **Rate limit: 100 peticiones / 900 s.** Abrir el panel se come varias. Si
sale "Rate limit exceeded", hay que esperar (el `retryAfter` viene en la
respuesta).

---

## 4. Estado de los proveedores de IA (medido, no supuesto)

Ver la tabla completa en `ESTADO_MOTOR_VENTAS.md` §10. Resumen:

- ✅ **Groq es lo único que responde** (0,3–0,8 s). Ya está en la cadena.
- ❌ DeepSeek y Mistral: **sin saldo**.
- ❌ `opencode/big-pickle`, **el respaldo**: sin cuota. Es la red que evita que
  Atlas quede mudo.
- ❌ Anthropic: **clave inválida (401)** — está mal pegada, no sin saldo. Es un
  copiar-pegar en EasyPanel y sería el mejor modelo de la lista.
- ❓ Sin verificar: `nvidia_nim`, `mimo`, y `github` (falló con `gpt-4o-mini`,
  pero su catálogo vino vacío: puede ser el id del modelo y no el token).

---

## 5. Convivencia: hay OTRO agente en el mismo repo

Trabaja en paralelo sobre el mismo worktree y **commitea con `git add -A`**.
Tres veces se llevó trabajo ajeno dentro de commits suyos.

- Revisar `git status` **antes** de commitear y no asumir que el árbol es propio.
- Si un archivo cambió solo, tomarlo como estado actual: puede ser suyo.
- Al cierre de esta sesión estaba trabajando en `agent.ts` (detector de
  inventos de producto). No tocarlo.

⚠️ **El token de GitHub está en texto plano en la URL del remoto** — sale
completo con `git remote -v`. Rotarlo.

---

## 6. Qué se hizo hoy (todo en `origin/master`)

```
9f02708  Que se acuerde de cual no anda, en vez de reintentarlo en cada mensaje
feb08ac  Que token de IA sirve y cual no, probado uno por uno
569c3df  Groq era lo unico que contestaba, y era el unico que no se probaba
7e1d6c5  Atlas tenia GitHub y Groq configurados y no los intentaba nunca
eedd3cc  Decirle que se quedo sin saldo, en vez de un desglose de segundos
b45ce47  Que cada comprador reciba su propio enlace, con su propia clave
178b818  Por que a veces publica el anuncio y a veces no
```

Antes de eso, las fases 0-4 y 8 del plan de SalesBot V2 (ver
`ESTADO_MOTOR_VENTAS.md` §8 y §9).

**Nada de esto corre todavía**: falta el stop/start del punto 1.

---

## 7. Lo único que mide si algo de esto sirvió

**Tratos ganados: 0**, con 18 conversaciones y 106 mensajes en 24 h.

Todo lo construido son medios. La verificación pendiente sigue siendo la misma:
una conversación real que llegue al cierre y cobre.

---

## 8. Pista abierta: `oc-groq` podría estar apuntando a un modelo que ya no existe

Encontrado al final de la sesión, **sin terminar de verificar**.

Hay un pool de tres OpenCode standalone para INVESTIGACIÓN (websearch), aparte
de la cadena principal de Atlas — `EXTERNAL_RESEARCH_AGENTS` en
`app-operator.ts:120`:

| Instancia | Proveedor | Modelo configurado |
|---|---|---|
| `oc-zen` | opencode | `nemotron-3-ultra-free` |
| `oc-groq` | groq | **`llama-3.3-70b-versatile`** |
| `oc-router` | openrouter | `google/gemma-4-26b-a4b-it:free` |

**El problema:** `llama-3.3-70b-versatile` NO aparece entre los 13 modelos que
Groq ofrece hoy, según `/api/ai/models/groq`:

```
allam-2-7b · canopylabs/orpheus-* · groq/compound · groq/compound-mini
meta-llama/llama-prompt-guard-2-* · openai/gpt-oss-120b · openai/gpt-oss-20b
openai/gpt-oss-safeguard-20b · qwen/qwen3.6-27b · whisper-large-v3*
```

Groq lo dio de baja en algún momento y la configuración quedó vieja.

⚠️ **Es una sospecha fuerte, no un hecho comprobado.** Ese catálogo sale de la
config de proveedores de la app (models.dev), que puede diferir de lo que la
API de Groq acepta de verdad. Lo que SÍ está verificado con llamada real es que
`openai/gpt-oss-120b` (0,8 s) y `openai/gpt-oss-20b` (0,3 s) funcionan.

**Cómo cerrarlo en la sesión siguiente** — una sola llamada:

```js
await fetch('/api/ai/test', { method:'POST',
  headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ proveedor:'groq', model:'llama-3.3-70b-versatile' }) })
```

Si falla con "model not found", hay que cambiar ese `modelID` por
`openai/gpt-oss-120b` en `app-operator.ts:121`. Importa porque estas instancias
son las que hacen la investigación REAL con websearch — y la investigación
inventada ya fue el peor problema encontrado en este proyecto (ver el comentario
del "desmentido automático" en `operator-opencode.ts`).

Los otros dos del pool tampoco se verificaron: `nemotron-3-ultra-free` y
`gemma-4-26b-a4b-it:free`. Vale probar los tres de una.
