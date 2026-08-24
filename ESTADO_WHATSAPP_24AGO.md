# Estado del agente de WhatsApp — 2026-08-24

**Todo pusheado y desplegado.** Último commit en producción: `252f159`.
Verificado: `/api/health` ok, WhatsApp `connected`, contenedor `running healthy`.

Documento de traspaso. Léelo antes de tocar el flujo de WhatsApp.

---

## 1. Lo que se arregló hoy (y por qué importaba)

### 1.1 Mensajes perdidos en cada deploy — CAUSA RAÍZ, por fin

**El síntoma:** clientes que llegaban de anuncios PAGOS escribían mientras el bot
se reiniciaba, y no quedaba ni rastro. Se paga el clic, el cliente escribe, y del
otro lado no hay nada.

**La causa:** en TODO `src/` no había un solo `process.on(...)`. Sin manejador de
SIGTERM, Docker mata el proceso de golpe y el WebSocket de Baileys **nunca se
cierra**: queda a medio morir, sin close frame.

Para los servidores de WhatsApp ese teléfono **sigue en línea**, así que los
mensajes de esa ventana se entregan al socket muerto y se dan por entregados.
No se encolan, y por eso no se reenvían al reconectar. El mensaje no se perdió
"en el aire": WhatsApp cree que ya lo entregó.

**Por qué el intento anterior falló:** se probó `syncFullHistory: true` (411ab91)
y hubo que revertirlo (fa7b948) porque el resync dejaba la sesión sin procesar
eventos en vivo — el bot decía "connected" y no contestaba a nadie. La causa
nunca estuvo en la sincronización de historial.

**El arreglo:** `artifacts/api-server/src/lib/apagado-ordenado.ts`, cableado en
`index.ts` justo después del `listen`. Cierra cada socket con `stop(true)`:
quita listeners y hace `sock.end()` **conservando credenciales** (nada de
`logout()`, que obligaría a escanear el QR). Tope propio de 8s porque Docker
manda SIGKILL a los 10. Cubre también `uncaughtException`, que dejaba el socket
colgado con la misma consecuencia.

⚠️ **Sin verificar en vivo todavía.** La forma de comprobarlo: escribirle al bot
justo mientras se despliega y ver si el mensaje llega igual al terminar.

### 1.2 Dos basuras que le llegaron al cliente

Encontradas leyendo la **conversación 13** (Samuel Antolinez, 2026-08-24). El
cliente venía de un anuncio de piano; esto quedó guardado, textual:

```
cliente: "¡Hola! Me gustaría conseguir más información sobre esto."
agente:  "...te cuento todo sobre el piano desde cero..."
cliente: "key"                                    ← nadie escribió eso
agente:  [CARD: LIQUID FIBRA "DESINTOXICACION"]   ← otro producto, texto crudo
cliente: "Pero cuanto es el costo del curso?."
```

**`"key"`** es el campo `msg.key` de Baileys. El rebusque de texto hacía
`JSON.stringify(msgObj).match(...)`, que devuelve también los NOMBRES DE LOS
CAMPOS; el filtro de campo técnico exigía camelCase, así que cualquier clave de
una sola palabra en minúscula pasaba derecho. Ahora se recorren los **valores**:
un nombre de campo no es un valor, así que no puede llegar.

**El marcador de ficha** llegó crudo porque el patrón era `[\w-]+`, que no
admite espacios ni comillas: no matcheaba, así que ni se resolvía la ficha ni se
limpiaba del texto. Ahora entra cualquier contenido y se decide adentro; si no
resuelve, se descarta. Además, si el modelo escribe el NOMBRE en vez del id, se
resuelve contra el catálogo — solo con coincidencia inequívoca (exacta a
cualquier largo, o parcial con 8+ caracteres). Una prueba cazó que con umbral 4,
`[CARD: curso]` resolvía al piano y le mandaba esa ficha a quien preguntaba por
Excel.

### 1.3 El prompt se contradecía a sí mismo

Decía, textual: *"RESPONDE SIEMPRE USANDO ESTE PATRÓN (sin excepciones)"* con
cuatro líneas de emoji + máximo 5 palabras. Y tres renglones después: *"Este
formato es SOLO para enumerar lo que trae un producto"*.

El modelo obedece lo primero que lee. Por eso contestaba en viñetas hasta cuando
el cliente pedía un argumento: a "está muy caro" le devolvía una lista.

Mismo patrón del bug `b4db407` (el prompt pedía prueba social y el validador la
prohibía): dos instrucciones peleándose en el mismo texto.

Ahora el modo NORMAL es prosa (2 a 4 frases) y la lista de emojis es la
EXCEPCIÓN, solo para enumerar qué incluye un producto.

### 1.4 Razonar y recomendar

Bloque nuevo en `sales-playbook.ts`. El agente informaba bien y no decidía nada.
Ahora: conectar lo que dijo con lo que le conviene, recomendar con nombre y
motivo, anticiparse a la duda que viene, y preguntar SOLO cuando la respuesta
cambia la recomendación.

---

## 2. Cómo probar la calidad (y el error que NO hay que repetir)

`npx tsx scripts/probar-venta.ts` en `artifacts/api-server` corre una
conversación de seis objeciones (interés → precio → duda → largas → competencia
→ cierre) y limpia lo que siembra.

⚠️ **Local corre con `nemotron-3-ultra-free`: DeepSeek solo está configurado en
producción.** De ahí salió un "consideration" en inglés y respuestas más flojas
de lo que se ve en vivo. Local sirve para verificar **estructura** (prosa vs
viñetas, si aísla la objeción), NO el acabado.

⚠️ La base local puede quedarse **sin agente activo** (`agents` vacía) y entonces
TODAS las respuestas salen vacías con `❌ [AGENT-ERROR] No hay agente activo`.
No es un bug del código: hay que sembrar un agente con `isActive: true`.

**Lo mejor de la última corrida**, justo donde antes se rendía:
> cliente: "lo voy a pensar y te aviso"
> agente: "a veces 'lo voy a pensar' esconde algo que se puede resolver rápido —
> ¿qué te frena, el precio o no estar seguro de que sea para alguien que nunca
> tocó nada?"

---

## 3. Lo que sigue abierto

- **Verificar el arreglo del deploy en vivo**: escribirle al bot mientras se
  despliega. Es lo único que confirma 1.1 de verdad.
- **Calidad de conversación con DeepSeek**: hay que leer conversaciones reales de
  producción. Con una sola no se distingue un patrón de un accidente.
- `flujo-completo-venta.test.ts` pasa **7/7 corriendo sola** y falla 7/7 en la
  suite completa: contención sobre el SQLite compartido, previo a estos cambios.
  No es regresión — pero conviene aislarlo algún día.

---

## 4. Recordatorios de infraestructura

- **`deployService` NO corta solo.** Devuelve `{}`, actualiza el hash del panel,
  y el contenedor viejo puede seguir sirviendo. Siempre `stopService` +
  `startService` después. Lo único que dice la verdad es el `Id`/`Created` de
  `projects.getDockerContainers` (parámetro `service`, con el nombre completo de
  docker: `tecnoia_bot-agenwhatsapp`).
- **El contenedor puede tardar en aparecer.** Hoy `getDockerContainers` devolvió
  `{"json":[]}` un rato tras el start y parecía que no había levantado; a los
  segundos estaba `running healthy`. No re-disparar el start por las dudas.
- **Pegarle a un endpoint y mirar el código HTTP no prueba nada** en esta app:
  hay un middleware de sesión global antes del ruteo, así que una ruta nueva y
  una inexistente devuelven ambas 401 con el mismo cuerpo.
