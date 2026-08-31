# Estado del proyecto y qué falta — 30 de agosto de 2026

Documento de traspaso. Lo que quedó funcionando, lo que falta, y **por qué**
cada cosa importa. Escrito para retomar sin releer toda la conversación.

Al empezar el día: **987 pruebas**. Al cerrar: **1.088**.

---

## 1. Lo que quedó listo y desplegado

### El bot de WhatsApp

| Qué se arregló | Cómo se veía el fallo |
|---|---|
| Ficha del producto equivocado | `"información"` → Cojín Moto Viajero · `"key"` → LIQUID FIBRA, a leads pagos |
| Dos agentes en la misma conversación | El cliente hablaba con Camila y le contestaba Sofía |
| Preguntas múltiples | De 5 preguntas contestaba 1 y descartaba el resto sin avisar |
| Un cliente = una conversación | El teléfono se normalizaba distinto en 4 caminos → historial partido |
| Ofrecer lo ya enviado | Listaba el contenido y preguntaba *"¿te cuento qué incluye?"* |
| Cobrarle al que dijo "Sí" | Un "Sí" a una oferta se leía como *"sí, quiero pagar"* → checkout |
| Markdown crudo | Al cliente le llegaba `**Pack**` y `[CARD: 123]` |
| Billeteras colombianas a todo el mundo | "Nequi/Daviplata" fijo, para un negocio peruano |
| `"➕ Y 1 cosas más"` | Plural con uno, y escondía la 5ª de 5 características |

### Los anuncios

- **No inventa herramientas.** Prometía ChatGPT, Perplexity, Midjourney y 5 más
  en un curso que no las enseña. El validador cubría promesas pero no marcas.
- **El titular largo se acorta solo** en vez de tumbar el turno (41 caracteres,
  uno de más, le costaba el anuncio entero).
- **Reconoce el llamado a la acción.** Decía *"no pide nada"* sobre un copy que
  cerraba con *"👉 Empezá a automatizar hoy"*.
- **Un emoji por ítem** (📚 contenido · 💰 precio · ♾️ acceso), no tres ✅ iguales.
- **El plan no propone tres veces la misma campaña.**
- **La estrategia guardada = la publicada** (antes guardaba el gancho de plantilla).

### Atlas

- **Estaba mudo por una contraseña con un carácter de más** (401 contra el
  servidor OpenCode). Ése era el *"No pude terminar de responder"*.
- **De 98 s a 33 s**, y ahora contesta **DeepSeek, el proveedor pago**, en vez de
  caer a un modelo gratis. El culpable era el modelo: `deepseek-v4-pro` (grande)
  se comía 55 s y fallaba; `deepseek-v4-flash` contesta en 6 s.
- **Cerrar la pestaña ya no mata el turno**: sigue y se guarda.
- **Hora y fecha en cada mensaje** + cronómetro durante la espera.
- **No muestra errores internos** (nombres de modelos, segundos): van al log.
- **Nombrar una herramienta ahora te la da** (`fb_status` fallaba porque el
  filtro busca palabras en español, no nombres de tools).

### Meta

- `fb_status` detecta la **cuenta restringida** — así encontramos los **$3.192**
  pendientes que impedían que los anuncios entregaran. Ya pagados.
- El **token vencido** se dice en castellano y con el paso a seguir.
- `fb_status` informa **qué permisos hay y cuáles faltan**.

### Estrategia de agencia (fases 1 y 2)

- `plan_de_contenido`: calendario de 4 semanas, con **intención por pieza**
  (atraer / educar / demostrar / vender), regla **80/20**, formato por
  intención, días alternos, productos rotando.
- **El texto listo para publicar** de cada pieza, armado con datos reales.

### El estándar que funciona (`estandar-que-funciona.ts`)

Investigado contra benchmarks públicos y **codificado**, no documentado:

| | malo | mediana | excelente |
|---|---|---|---|
| Costo por conversación (LATAM) | >$1,20 | $0,70 | <$0,25 |
| CTR | <1% | 2% | >3,5% |
| Clic → conversación | <45% | 68% | >82% |
| Conversación → venta (30 d) | <4% | 8% | >14% |
| Tiempo de respuesta | >60 s | — | <5 s |

Meta **no cobra** la conversación durante **3 días** si entró por anuncio.

`dondeSePierde()` dice **en qué etapa** se pierde la plata, no un puntaje.

---

## 2. Lo que falta — en orden de impacto

### 🔴 1. Las etapas de venta (lo más importante)

**El problema:** el bot va de *"me interesa"* a caja en dos mensajes. La
estructura existe (`currentStage`, fichas parciales en `ficha-parcial.ts`) pero
no se usa como embudo.

El admin lo dijo así: *"no está manejando las etapas, responde de una y no se
siente humano"* y *"no analiza si lo que está enviando está bien, y no tiene
memoria de lo que pasa"*.

Hoy se parcheó por casos (no ofrecer lo ya enviado, el "Sí" que no es compra),
pero **el diseño de fondo sigue pendiente**: qué se entrega en cada etapa, qué
se pregunta, y cuándo corresponde pasar a la siguiente.

**Es lo que más cambiaría la conversión.** Empezar por acá.

### 🟠 2. Fase 3 de la estrategia: publicar y programar

El calendario y el copy están; falta publicarlo. Necesita permisos de Meta:

- `pages_manage_posts` — publicar en la página
- `instagram_basic` + `instagram_content_publish` — feed, reels e historias

**No requieren App Review** mientras el admin sea administrador de la app.
Sí requieren que la cuenta de Instagram sea **Empresa/Creador** y esté
**vinculada a la página**.

Preguntarle a Atlas *"revisá la conexión con facebook"* — ahora informa qué
falta.

### 🟠 3. Conectar el estándar al diagnóstico de Atlas

`dondeSePierde()` existe y está probado, pero Atlas todavía no lo usa. Cuando
el admin pregunte *"¿cómo va mi campaña?"*, debería responder con estos
umbrales en vez de números sueltos.

### 🟡 4. La investigación se come 22 s de 33

Es el 68% del turno de anuncio. Ya se sacó de los pedidos de anuncio (el copy
lo escribe el servidor con datos reales), pero conviene medir de nuevo.

### 🟡 5. Código muerto

`experiment-manager` y `optimization-agent` tienen **una sola referencia** cada
uno — casi seguro el import y nada más. Medir y borrar.
`niche-adapter.ts` duplica `agent-templates.ts`.

---

## 3. Pendiente del admin (no lo puedo hacer yo)

### 🔴 Credenciales expuestas

| Qué | Dónde |
|---|---|
| **Contraseña de VentasPro** | `OPENCODE_CONFIG_CONTENT` de `opencode-clean`, en texto plano. **Verificada: funciona.** |
| `GROQ_API_KEY`, `OPENROUTER_API_KEY` | historial de git (commit `fd02734` las sacó del árbol, **no del historial**) |
| `GITHUB_TOKEN` | historial de git **y** en texto plano en la URL del remoto |
| Credenciales de EasyPanel | mismo `OPENCODE_CONFIG_CONTENT` |

### 🟠 Otras

- **4 campañas huérfanas** en Meta (todas en pausa, sin gastar). Dos son de
  agosto y una la generé yo al regenerar borradores.
- **El arreglo del MCP de OpenCode** (dos líneas) — pasárselo a OpenCode.

---

## 4. Los MCP de `opencode-clean`: 4 de 7 rotos

```
operator     ❌ timeout 30 s      ventaspro    ❌ timeout 30 s
filesystem   ❌ conexión cerrada  git          ❌ conexión cerrada
brain        ✅                   fetch        ✅        commands  ✅
```

**No causan lentitud** (medido: el fallo se cachea al arrancar).

**La causa exacta:** los scripts hablan el marco de **LSP**
(`Content-Length: N\r\n\r\n`) y MCP por stdio usa **JSON por línea**. Por eso
arrancan, viven y nunca contestan el saludo.

El arreglo está en `PENDIENTE_ADMIN.md`. **Recomendación: no arreglarlos** —
hacen lo que ya hace el puente MCP propio, pero **sin pasar por
`propose_action`**, o sea que podrían escribir sin que el admin apruebe.

`git` no puede funcionar: `mcp-server-git` es de **Python**, se corre con `uvx`.

---

## 5. Lecciones que se repitieron todo el día

Vale la pena leerlas antes de tocar nada:

1. **La capacidad existe, el dato no llega.** Pasó con el objetivo del anuncio,
   el targeting, `monitoring.ts`, el video de producto, `conversations.agentId`
   y `architect_memory.createdAt`. Antes de construir algo: **buscar si ya está**.

2. **Medir antes de tocar.** Casi optimizo la investigación creyendo que se
   comía 60 s; el presupuesto era 35 s y la traza no alcanzaba para saberlo. El
   desglose por tramos existía pero solo se registraba cuando el turno fallaba.

3. **El `\b` de JavaScript es ASCII.** Después de vocal acentuada (`sí`,
   `empezá`, `únete`) **no hay borde de palabra**. Tropecé tres veces el mismo
   día. Usar `(?![a-záéíóúñ...])`.

4. **Enumerar palabras siempre deja afuera un caso obvio.** Le pasó al detector
   de CTA, al de intenciones y al de productos. Cuando se pueda, detectar por
   forma o por señal estructural (el 👉 del renglón), no por lista.

5. **Bloquear algo legítimo es peor que dejar pasar algo dudoso.** El filtro de
   marcas rechazó la palabra *"Aprendé"* y le costó el anuncio dos veces.

6. **Leer el campo correcto.** Dije "0 campañas" y "ningún borrador está en
   Meta" — las respuestas usaban `campaigns`, `adSets` y `campaignId`, y yo
   buscaba `data` y `metaCampaignId`. Verificar la forma antes de concluir.

7. **La suite es intermitente.** Falla a nivel de archivo por una carrera al
   inicializar la base y pasa al reintentar. **No declarar verde sin repetir.**

---

## 6. Cómo se trabaja acá

- **Deploy:** `POST $EASYPANEL_URL/api/trpc/services.app.deployService` con el
  token de `.easypanel.env`. Tarda varios minutos; conviene lanzarlo en
  segundo plano.
- **Verificar que bajó:** `GET /api/health` → si `uptime` es bajo, reinició.
- **Leer producción:** sesión del navegador logueada en ventasproia.com y
  `fetch('/api/...')`. La base es interna de EasyPanel y no se alcanza desde
  el PC.
- **Leer archivos del contenedor de OpenCode:**
  `GET {host}/file/content?path=...` con Basic auth. Sirve para diagnosticar.
- **Los logs del contenedor NO se pueden leer** desde afuera: EasyPanel no
  expone endpoint. Por eso el desglose de tiempos viaja en la respuesta HTTP.

---

# Segunda parte del 30 de agosto

Todo lo de abajo salió después de escribir lo de arriba. Cierre: **1.119
pruebas** en 85 archivos.

## Lo que se cerró

### La columna vertebral de la venta

**No hubo que reescribir nada.** `calcularEtapa` ya existía y calculaba bien en
qué punto va el trato. El problema era que su resultado viajaba al prompt
**como texto** — una sugerencia al modelo. Y faltaba la regla que más caro
sale: ninguna etapa prohibía mandar el checkout.

Ahora `puedeMandarPago` es regla del servidor: en `explorando` o `interesado`
no sale el cobro, **salvo que el cliente lo pida** — negárselo a quien quiere
pagar es el error opuesto y sale igual de caro.

### El precio se defiende, no se rebaja

Antes: *"El precio es $60.000 y es fijo 🙏 No manejo descuentos"* — niega dos
veces y no da una razón.

Ahora `defenderElPrecio` lo sostiene con lo que el producto **realmente trae**,
sin compararse con la competencia (el sistema no sabe qué cobran otros).

### Las cuatro objeciones

`objeciones.ts`: "lo voy a pensar", "¿es confiable?", "¿me sirve a mí?", "no
tengo tiempo". Ninguna se contesta con adjetivos —*"somos serios"* lo dice
igual el que estafa— y si el negocio no cargó la garantía, **devuelve `null`**
en vez de inventarla.

### El comprobante de compra

Se manda pegado a la entrega cuando el admin aprueba, con el monto **real del
pago registrado**, no el precio de lista.

⚠️ Se llama **comprobante**, no factura: este sistema no emite facturación
electrónica ni tiene resolución de la DIAN.

### La suite dejó de ser intermitente

**No tenía ningún defecto.** Un archivo con seis funciones puras tardaba
5,95 s: `ensureDbReady()` creaba las 30 tablas desde cero **en cada archivo**.
Con 85 archivos son ocho minutos de trabajo idéntico, y bajo paralelismo el
hook se pasaba de los 30 s.

Ahora el esquema se construye **una vez** (`vitest.globalSetup.js`) y cada
archivo se lleva una copia.

### Multi-tenant: el texto asumía cursos

Los cierres decían *"¿Te muestro cómo son las clases?"* — y le fallaba al
propio admin, que vende Cojín Moto Viajero. `esFisico` ya estaba en la función
y no se usaba.

## Dos correcciones mías, anotadas a propósito

**1. Reescribí la verificación de pagos que ya existía.** Construí el aviso al
admin, la lectura del "sí" y la búsqueda de su teléfono sin mirar antes — las
tres ya estaban en `verificacion-pago.ts`, conectadas. Miré
`payment-confirmation.ts`, vi que no estaba conectado, y **nunca busqué si
había otro módulo**. Borrado el duplicado.

**2. Casi entrego las objeciones sin conectar.** Las funciones estaban escritas
y probadas, y **nadie las llamaba**. El bot habría seguido improvisando igual.

Las dos son el mismo error que este documento ya nombraba en su lección #1.
Escribir la función es la mitad del trabajo.

## Lo que falta ahora

1. **Que cada negocio configure lo suyo** — garantía, entrega, tono, si negocia
   precio. Hoy, si no lo carga, el bot calla. Es lo que separa "funciona para
   usted" de "se lo puedo vender a otro".
2. **Un negocio nuevo arranca en blanco.** No hay asistente que le pregunte qué
   vende y cómo entrega.
3. **Auditar los prompts**, donde todavía queda texto que asume cursos.
4. Fase 3 de la estrategia: publicar y programar el contenido.
5. Conectar `dondeSePierde()` al diagnóstico de Atlas.

## Lección que se agrega a las siete

**8. Buscar en TODO el repo antes de construir, no en el archivo que uno
supone.** Las dos correcciones de hoy salieron de mirar un módulo y no el que
de verdad hacía el trabajo. `grep -rn` sobre `src/` completo, no sobre el
archivo que suena parecido.
