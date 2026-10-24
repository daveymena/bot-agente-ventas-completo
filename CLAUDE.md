# CLAUDE.md — VentasPro / Agent-Sales-Bot

## Fuente de verdad para esta fase

Antes de modificar código relacionado con el frontend o el vendedor de WhatsApp, leer obligatoriamente:

1. `WHATSAPP_SALES_PLAYBOOK_RESEARCH_2026.md` — comportamiento comercial del agente vendedor de WhatsApp.
2. `REDESENO_FRONTEND_UX_UI_2026.md` — auditoría y rediseño responsive de VentasPro.
3. `AGENTS.md` — arquitectura general y reglas del repositorio.
4. `ESTADO_MOTOR_VENTAS.md` — auditoría previa del motor comercial y trabajo pendiente.
5. `ESTADO_WHATSAPP_24AGO.md` — estado operativo, incidentes reales y precauciones del canal WhatsApp.

## Separación de agentes — NO mezclar

- **Atlas / Operator** = agente administrativo/estratégico. Usa sus propias herramientas y, cuando corresponda, OpenCode/MCP.
- **Agente vendedor de WhatsApp** = servicio independiente que atiende al cliente final. Su camino crítico NO debe pasar por Atlas ni por OpenCode.
- `AgentOrchestrator` consume la cola y llama a `runAgentReply(conversationId)` para el vendedor de WhatsApp.
- `whatsapp-brain.ts` es código específico de WhatsApp; no debe confundirse con el cerebro de Atlas.

## Dos motores de venta (v1 y v2)

`lib/motor-nuevo/` es el motor nuevo. Se prende **por negocio** con la bandera de
`lib/motor-nuevo/activacion.ts` (defecto `v1`, o sea el de siempre). Reglas:

- **No se le agregan capas al motor v1.** Si un caso falla y el negocio está en
  v2, el arreglo va en `motor-nuevo/`: en las herramientas (una regla que se
  puede probar) o en el estado (un hecho que se registra), nunca en otra
  instrucción condicional ni en otra regex sobre el texto.
- **Los hechos los emiten las herramientas.** Precio, ficha, video, medios de
  pago y entrega salen de la base. El modelo escribe la conversación.
- **El nicho se deriva, no se elige de una lista.** Ver `motor-nuevo/nicho.ts`.
  Si aparece un negocio nuevo, no se agrega un `case`: se revisa qué señal de las
  que ya existen no se está leyendo.
- **Lo que no está configurado no se afirma:** un dato faltante se convierte en
  prohibición explícita. Ver `business-context.ts`.
- Documentación viva: `artifacts/api-server/src/lib/motor-nuevo/README.md` y
  `TRASPASO_2026-09-21.md`.

## Regla principal de implementación

No agregar otra capa de prompt o una nueva lista de palabras clave para tapar un caso aislado. Primero localizar la fuente de verdad de la decisión y corregir la arquitectura o el estado que produce el problema.

## Vendedor WhatsApp — objetivo

El agente debe comportarse como un vendedor humano profesional con memoria y herramientas:

`entender → responder → descubrir cuando haga falta → recomendar → resolver objeción → detectar intención de compra → ejecutar siguiente acción → cerrar → postventa`

La conversación NO es un formulario y NO debe seguir etapas rígidas. El cliente puede saltar directamente al precio, pago, producto, objeción o cierre.

## Reglas de conversación

- Responder primero a lo que el cliente acaba de preguntar.
- Una pregunta estratégica como máximo cuando sea necesaria para cambiar la recomendación o descubrir la objeción real.
- No repetir datos que ya fueron entregados, salvo que el cliente los pida de nuevo.
- El producto mencionado en el mensaje actual tiene prioridad sobre cualquier producto viejo del historial.
- No inventar precios, descuentos, garantías, stock, testimonios, tiempos ni características.
- Las herramientas comerciales deben aportar hechos y ejecutar acciones; el modelo debe redactar la conversación.
- Cuando el cliente está listo para comprar, dejar de explicar y pasar a la acción de compra.
- `"¿cómo pago?"`, `"mándame el link"`, `"lo quiero"`, `"me sirve"`, `"dale"` y equivalentes deben interpretarse con contexto, no mediante `includes()` ingenuos.
- `"gracias"` no significa automáticamente despedida si existe otra pregunta o intención en el mismo mensaje.
- `"lo voy a pensar"` debe activar diagnóstico de la duda, no una despedida automática.

## Formato WhatsApp

La respuesta debe ser visualmente cómoda y natural:

- 1 idea principal por bloque.
- Párrafos cortos de 1–2 frases.
- Separar bloques con una línea en blanco.
- Pregunta simple: 1–2 frases. Amplía solo si el cliente pide detalle, hace varias preguntas o necesita completar una compra o pedido.
- Listas solo cuando enumerar opciones o contenido aporta claridad.
- No convertir cada respuesta en una ficha.
- No usar el mismo emoji repetidamente.
- Emojis semánticos y variados; 0–1 en respuestas breves, más solo si ayudan a entender una presentación o un paso de compra. No son obligatorios.
- Contestar la necesidad exacta del cliente con información útil y directa; nunca inventar datos para complacerlo.
- No comenzar todas las respuestas con `Perfecto`, `Claro`, `¡Excelente!` o el nombre del cliente.
- Mantener una voz humana, comercial, cálida y adaptada al español del negocio.

Ejemplo de mala salida:

`¡Buenísimo Duvier! 😊 El curso de IA... ¿Ya pudiste hacer la transferencia?...`

cuando el cliente acaba de preguntar por otro producto.

Ejemplo de comportamiento correcto:

`Sí, tenemos alternativas de IA, pero el curso de diseño gráfico como tal no está en el catálogo actual. 🎨\n\nSi buscas aprender diseño usando herramientas de IA, sí puedo mostrarte el curso que tenemos y decirte exactamente qué incluye.`

No mencionar pagos de un producto anterior si el cliente cambió claramente de intención.

## Investigación y evidencia

Cuando se proponga una técnica nueva de ventas o UX:

1. Buscar primero evidencia actual.
2. Priorizar documentación oficial, resultados publicados por empresas/clientes y casos reproducibles.
3. Distinguir `verified / vendor-reported / hypothesis`.
4. No presentar una cifra promocional como benchmark universal.
5. Registrar la fuente y fecha en la documentación antes de convertir la técnica en regla del producto.

## Frontend — dirección 2026

Adoptar `Calm Sales OS`:

- jerarquía fuerte
- espacios generosos
- menos ruido
- menos glassmorphism global
- acciones claras
- progressive disclosure
- responsive real
- móvil como experiencia de primera clase
- accesibilidad desde el sistema de componentes

Mantener la identidad existente (Inter + índigo/slate) como base, pero reducir la sensación de panel administrativo saturado.

### Desktop

Agrupar navegación por intención: Operación, Automatización, Crecimiento y Sistema. Evitar una lista larga donde cada función compite con las demás.

### Mobile

No comprimir el desktop. Mantener una navegación inferior pequeña y agrupar el resto semánticamente en `Más`.

### Dashboard

Priorizar: ventas → requiere atención → KPIs → tendencia → actividad → insights. El dashboard debe responder `¿qué está pasando?` y `¿qué debo hacer ahora?`.

### Inbox

Convertir conversaciones en experiencia central del producto. Desktop puede usar 3 paneles (inbox / conversación / contexto); móvil debe usar navegación por stack.

## No romper lo que ya funciona

Antes de refactorizar:

- comprobar qué archivos son realmente consumidos;
- revisar tests y scripts de prueba existentes;
- reutilizar infraestructura existente;
- no sustituir el transporte WhatsApp ni el multi-tenant para resolver un problema de conversación;
- no introducir OpenCode en el camino crítico del vendedor.

## Definición de terminado

Una mejora solo se considera terminada cuando:

- compila y pasa las pruebas relevantes;
- no rompe los flujos existentes;
- tiene al menos un caso de prueba para el fallo corregido;
- se verifica el comportamiento real del agente o de la pantalla;
- la documentación queda actualizada si cambia una regla de arquitectura.
