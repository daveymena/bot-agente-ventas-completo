# Motor de ventas de WhatsApp — versión 2

> Este archivo empezó siendo la propuesta de septiembre ("hay que reconstruir el
> motor"). Lo de abajo es lo que quedó construido y cómo se usa. La propuesta
> original sigue siendo válida como diagnóstico del problema; el estado actual
> está en `TRASPASO_2026-09-21.md` en la raíz del repo.

## El problema, en una frase

El motor viejo **deducía los hechos leyendo el texto**: corría expresiones
regulares sobre la conversación para saber si ya le había dado el precio al
cliente, si el video ya había salido o si un pago estaba confirmado. Cada
redacción nueva que la regex no contemplaba rompía algo, y cada arreglo
destapaba el siguiente caso.

Tres ejemplos reales, todos del 13-09-2026, todos hoy cubiertos por pruebas:

- `AFIRMA_PAGO_CONFIRMADO` leía *"te llega apenas se confirme el pago"* como un
  pago confirmado y bloqueaba el mensaje. Se arregló con un *lookbehind* de
  nueve conectores. La décima forma de decirlo lo volvía a romper.
- Un *"sí"* después de *"¿querés saber cuánto está?"* volvía a mandar la ficha,
  porque dos banderas se evaluaban en el orden equivocado.
- `VENTANA_SESION_MS` en 4 horas: el cliente que volvía al otro día recibía la
  ficha y el video otra vez.

## El cambio de fondo

> Un hecho se registra en el momento en que ocurre. Nunca se adivina después.

Y su consecuencia:

> Los hechos (precio, ficha, video, medios de pago, entrega) los emite una
> herramienta que lee la base de datos. El modelo solo escribe la conversación.

Un modelo no puede inventar un precio si el precio nunca sale de su texto. No
puede repetir la ficha si la herramienta se niega a mandarla. No puede decir que
confirmó un pago si no existe forma de que él marque un pago como confirmado.

## Qué hay adentro

| Archivo | Qué hace |
|---|---|
| `estado-conversacion.ts` | La memoria explícita por conversación, su persistencia (`conversations.estado_agente`) y cómo se le describe al modelo |
| `herramientas.ts` | Las nueve herramientas. Acá viven las reglas de negocio |
| `nicho.ts` | El guion de ventas **derivado** del negocio: cómo se entrega, qué se puede prometer, qué falta saber para cerrar, qué objeciones van a aparecer |
| `motor.ts` | El bucle de razonamiento, el armado del prompt y la única red de seguridad (cifras inventadas) |
| `cliente-llm.ts` | La cadena de modelos (DeepSeek primero) y el modo JSON para los que no traen herramientas |
| `adaptador.ts` | El motor conectado a la base real: catálogo, perfil del negocio, pagos, conocimiento, historial |
| `activacion.ts` | La bandera por negocio (v1 / v2) |

## El nicho no se elige de una lista: se deriva

El sistema anterior traía seis rubros escritos a mano y un `switch`. Una
funeraria, un taller de motos o un adiestrador canino caían en `general`, o sea
en ninguno, y el bot volvía a vender como si fueran cursos digitales.

Lo que de verdad cambia la forma de vender no es el rubro: es **cómo se entrega**
y **qué hay que saber para entregarlo**. Y eso está en los datos:

- `products.kind` y `deliveryLink` → ¿se manda un enlace, un paquete o se agenda
  una hora?
- el perfil del negocio → el dueño ya escribió cómo entrega, en qué plazo y hasta
  dónde llega;
- `products.opciones` → ¿hay tallas, colores o variantes que elegir?

De ahí salen cuatro formas de vender (digital, físico, servicio, mixto) y un
guion completo por conversación. El rubro no hace falta clasificarlo: el modelo
lo lee del nombre del negocio y de los productos. Lo que `nicho.ts` le da es lo
que un modelo no puede deducir mirando un catálogo.

**Lo que no está configurado no se afirma:** un dato faltante se convierte en
una prohibición explícita. Antes se rellenaba con el del negocio del dueño y el
agente inventaba con total seguridad.

Ver `nicho.ts` y `__tests__/nicho.test.ts` (incluye un negocio que no existía
cuando se escribió el código).

## Cómo se atiende un turno

```
1. Se carga el estado de la conversación (qué se le dijo, qué se le ofreció,
   qué datos dio el cliente).
2. Se deriva el guion del negocio.
3. Se arma un solo bloque de HECHOS (no cuarenta instrucciones condicionales).
4. El modelo contesta. Si pide herramientas, se ejecutan y se le devuelve el
   resultado para que siga.
5. El texto del modelo va primero y las partes que pusieron las herramientas
   después.
6. Se guarda el estado y se aplican los efectos (pago reportado, escalado,
   datos del cliente).
```

Si el modelo escribe una cifra de plata que no existe en el catálogo, se le pide
**una vez** que la reescriba. Si insiste, la respuesta sale sin esa frase. Es la
única red que queda, y no reescribe el texto por atrás: eso era lo que partía las
respuestas a la mitad.

## Los modelos que no traen herramientas

La plataforma rota por modelos gratis y varios no soportan *tool calling*. Si el
proveedor rechaza las herramientas, el servidor le pide el mismo razonamiento en
un JSON chico y ejecuta las herramientas igual. Se pierde una vuelta de
conversación, no la garantía de que los datos salgan de la base. El modelo queda
marcado y la próxima vez va directo al JSON.

## Cómo se prende

Está en producción **apagado**. El valor por defecto es `v1` para todo el mundo,
así que desplegar esto no le cambia nada a ningún cliente.

```bash
# Variables de entorno (EasyPanel)
MOTOR_VENDEDOR=v1                 # defecto: nadie cambia
MOTOR_VENDEDOR_TENANTS=3,7        # estos negocios sí
MOTOR_VENDEDOR_PORCENTAJE=10      # o un porcentaje estable por negocio
```

Por negocio, desde Atlas o por API (es inmediato, sin redesplegar):

```
POST /api/whatsapp/motor   { "motor": "v2" }
GET  /api/whatsapp/motor
```

Antes de prenderlo en un negocio real:

```
POST /api/whatsapp/sombra  { "conversationId": 165 }
```

Corre los mismos turnos por los dos motores y los pone lado a lado con los
hallazgos del evaluador. No le escribe a nadie.

Desde Atlas: `vendedor_diagnosticar` (lee conversaciones reales, sin gastar
tokens) → `vendedor_probar` (sombra) → `vendedor_motor` (prender, con aprobación
del admin).

## Lo que se retira cuando el v2 quede prendido para todos

Marcado en el código con `RETIRAR CON EL V1`. Hoy siguen vivos y son el camino
por defecto: `sales-playbook.ts`, `response-brain.ts`, `whatsapp-brain.ts`,
`precio-verificado.ts`, `objeciones.ts`, `next-best-action.ts`,
`emojis-con-medida.ts` y la mayor parte de `supervisor.ts`.

No se borra nada hasta que el v2 haya atendido conversaciones reales en al menos
un negocio y el diagnóstico salga limpio.

## Migración de base de datos

La columna nueva es `conversations.estado_agente` (`jsonb` en Postgres, `text`
en SQLite). Se crea sola:

- Postgres: `autoMigrate.ts` (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
- SQLite: `ensureSqliteTables()` en `lib/db/src/index.ts`.

Las conversaciones que nunca pasaron por el v2 tienen la columna en `null` y
arrancan del estado inicial: no hay nada que migrar.
