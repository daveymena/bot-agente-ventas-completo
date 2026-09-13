# Reconstrucción del agente de WhatsApp

## Por qué se reconstruye

El motor actual tiene ~7.600 líneas repartidas en ocho módulos que se pisan entre sí, y el repositorio lleva 1.360 commits. Revisando los del último mes, el patrón es siempre el mismo: aparece una frase del cliente que ninguna expresión regular contemplaba, se agrega una regex más, y a los días aparece otra frase.

Tres ejemplos reales, todos del 13 de septiembre:

- La regex `AFIRMA_PAGO_CONFIRMADO` leía *"te llega apenas se confirme el pago"* como un pago ya confirmado y bloqueaba el mensaje. Se arregló agregando un *lookbehind* con nueve conectores (`se`, `cuando`, `apenas`, `una vez`, `ni bien`…). La décima forma de decirlo lo vuelve a romper.
- Si el cliente decía *"sí"* después de *"¿querés saber cuánto está?"*, salía la ficha otra vez en vez del precio, porque dos banderas se evaluaban en el orden equivocado.
- `VENTANA_SESION_MS` estaba en 4 horas: el cliente que volvía al otro día recibía la ficha entera y el video de nuevo.

Ninguno de los tres es un error de programación tonto. Los tres son la misma decisión de arquitectura: **el sistema deduce los hechos leyendo el texto en vez de registrarlos cuando ocurren.**

## El cambio de fondo

> Un hecho se registra en el momento en que ocurre. Nunca se adivina después.

Y su consecuencia directa:

> Los hechos (precio, ficha, video, enlaces de pago) los emite una herramienta que lee la base de datos. El modelo solo escribe la parte conversacional.

Un modelo no puede inventar un precio si el precio nunca sale de su texto. No puede repetir la ficha si la herramienta que la manda se niega. No puede decir que confirmó un pago si no existe forma de que él marque un pago como confirmado.

Esto es exactamente al revés del `supervisor.ts` actual, que deja al modelo escribir lo que quiera y después intenta cazar las mentiras con regex.

## Sobre "que sea como la IA de Meta"

La fluidez que buscás no se consigue agregando reglas: se consigue **quitándolas**. Hoy el modelo recibe cientos de instrucciones condicionales que se contradicen entre sí (el propio `CLAUDE.md` del repo documenta un bug donde el prompt pedía prueba social y el validador la prohibía), y después un supervisor le reescribe la salida. Un modelo así no puede sonar natural aunque sea excelente: está amordazado.

El motor nuevo le da libertad para conversar y le quita libertad para inventar datos. Esa es la combinación que suena bien y no miente.

Dicho esto, con honestidad: **hay un techo que no depende de la arquitectura, y es el modelo que uses.** No pude verificar cuál está configurado (las variables de entorno traen secretos y preferí no abrirlas). Si hoy corre contra un modelo local pequeño en Ollama, ninguna arquitectura va a darte el nivel que pedís; con un modelo grande con buen *tool calling*, este diseño lo aprovecha entero. Vale la pena revisarlo antes de nada — es probablemente la palanca más grande que tenés.

## Qué se agrega

| Archivo | Líneas | Qué hace |
|---|---|---|
| `lib/estado-conversacion.ts` | ~210 | El estado explícito por conversación y cómo se le describe al modelo |
| `lib/herramientas.ts` | ~330 | Las ocho herramientas. Acá viven las reglas de negocio |
| `lib/motor.ts` | ~230 | El bucle de razonamiento y el prompt de sistema |
| `lib/__tests__/motor.test.ts` | ~400 | Los bugs del último mes convertidos en pruebas |

Unas 770 líneas de código productivo contra las ~7.600 actuales.

## Qué se retira

Cuando el motor nuevo esté validado en paralelo:

- `sales-playbook.ts` (649) — el prompt gigante pasa a ser el de `motor.ts`, mucho más corto
- `response-brain.ts` (573) — lo reemplaza el bucle de tool calling
- `whatsapp-brain.ts` (~200) — el motor viejo de regex y plantillas fijas, que **hoy sigue activo en paralelo** en `routes/whatsapp.ts:480`. Tener dos cerebros contestando es de por sí una fuente de incoherencia
- `precio-verificado.ts` (309) — innecesario: el precio ya no puede salir mal
- `objeciones.ts` (162), `next-best-action.ts` (99), `emojis-con-medida.ts` (171) — el modelo hace esto solo cuando lo dejás
- De `supervisor.ts` (~800) queda muy poco: la batería de regex desaparece
- De `agent.ts` (5.030) queda la carga de datos; el razonamiento se va a `motor.ts`
- De `ficha-parcial.ts`, toda la parte de desambiguar el "sí" (`seccionQueCorresponde`, `esAfirmacionSuelta`); el render de la ficha se conserva

Los tests existentes de `supervisor.test.ts` que describen comportamiento deseado (no implementación) conviene migrarlos.

## Migración de base de datos

```sql
ALTER TABLE conversations
  ADD COLUMN estado_agente JSONB;
```

Se eligió `jsonb` en vez de doce columnas para que agregar un campo más adelante no requiera otra migración. Las conversaciones existentes arrancan en `null` y toman el estado inicial; no hay que rellenar nada.

Para que una persona pueda confirmar un pago desde el panel (lo único que el agente nunca puede hacer solo):

```sql
UPDATE conversations
SET estado_agente = jsonb_set(estado_agente, '{pagoConfirmadoPorHumano}', 'true')
WHERE id = $1;
```

## Cómo se conecta

`runAgentReply(conversationId, deps)` mantiene la firma actual. En `routes/whatsapp.ts` hay que:

1. Inyectar las cuatro dependencias (`llm`, `repositorio`, `cargarHistorial`, `cargarCatalogo`, `cargarVoz`). Las tres de carga son las consultas que ya existen en `agent.ts`.
2. Adaptar `ClienteLLM.crear()` al paquete `@workspace/integrations-openai-ai-server`. Solo necesita devolver `content` y `toolCalls`; **el proveedor tiene que soportar tool calling** — es el único requisito duro del diseño.
3. Retirar la llamada a `analyzeWhatsAppMessage` (líneas 480 y 512), que es el cerebro viejo.

Los `parts` de salida usan el mismo formato que ya renderiza `whatsapp.ts` (`card`, `text`), más dos tipos explícitos (`video`, `payment`) que hoy salen escondidos dentro del render de la ficha — de ahí venía el bug del video duplicado.

## Plan de despliegue

No lo reemplaces de golpe. La forma de hacerlo sin riesgo:

1. **En paralelo, sin enviar.** El motor nuevo corre con las conversaciones reales y solo registra qué habría contestado. Se comparan salidas unos días.
2. **Un número de prueba.** Se enruta al motor nuevo solo el WhatsApp de pruebas, y le pegás vos con los casos que te vienen fallando.
3. **Un porcentaje del tráfico real**, con la bandera lista para volver atrás.
4. **Reemplazo** y borrado de los módulos viejos.

## Lo que falta y no pude hacer desde acá

Trabajé leyendo el código desde la consola del contenedor y el repo en GitHub, sin poder clonar, correr la suite de tests del proyecto ni hacer commits. Concretamente, antes de desplegar esto hay que:

- **Ajustar nombres de columnas y de tablas** a tu esquema real de Drizzle. Los puntos a tocar están marcados con `ADAPTAR` en el código y están aislados a propósito.
- **Escribir el adaptador de `ClienteLLM`** contra tu integración concreta.
- **Correr la suite completa del proyecto**, no solo estas pruebas.

Las 24 pruebas que sí escribí pasan (`npx tsx --test lib/__tests__/motor.test.ts`), y una de ellas encontró un defecto real mientras la escribía: la búsqueda devolvía "Curso de piano" cuando el cliente pedía un curso de soldadura, porque compartían la palabra "curso". Está corregido ponderando qué tan distintiva es cada palabra.

Lo natural es terminar el enganche con Claude Code corriendo sobre el repo clonado, donde se pueden correr los tests y hacer commits de verdad.
