# MASTER SPEC — SOFÍA WHATSAPP SALES ENGINE

## Propósito

Este documento es la especificación operativa para Claude Code/terminal. Debe leerse antes de modificar el agente de WhatsApp.

El objetivo NO es crear otro chatbot ni otro prompt. El objetivo es convertir la infraestructura existente de VentasPro en un agente de ventas conversacional real, controlado y medible.

Repositorio:
`daveymena/bot-agente-ventas-completo`

Rama de trabajo actual:
`feat/sofia-conversational-engine`

Documentación específica:
`docs/SOFIA_CONVERSATIONAL_ENGINE.md`

Motor inicial:
`artifacts/api-server/src/lib/sofia-conversational-engine.ts`

---

# 1. PRINCIPIO FUNDAMENTAL

La IA NO es la fuente de verdad.

La IA interpreta el lenguaje del cliente y ayuda a redactar. El sistema determina:

- producto
- precio
- características
- FAQ
- modalidad
- garantía
- métodos de pago
- enlaces
- entrega
- activos multimedia
- estado de la conversación
- qué información ya fue enviada
- qué puede enviarse en este turno

Nunca permitir:

`mensaje -> LLM -> WhatsApp`

El flujo objetivo es:

`WhatsApp -> normalización -> intención -> contexto/estado -> producto real -> facts autorizados -> estrategia -> respuesta -> validación -> envío -> persistencia de LO REALMENTE ENVIADO`

---

# 2. CONTEXTO DEL SISTEMA EXISTENTE

El repositorio ya contiene una arquitectura grande. Antes de crear código nuevo, localizar y reutilizar:

- `artifacts/api-server/src/lib/whatsapp-brain.ts`
- `artifacts/api-server/src/routes/whatsapp.ts`
- `artifacts/api-server/src/lib/whatsapp-factory.ts`
- `artifacts/api-server/src/lib/whatsapp-monitor.ts`
- `artifacts/api-server/src/lib/whatsapp-singleton.ts`
- `artifacts/api-server/src/agent.ts`
- `artifacts/api-server/src/lib/supervisor.ts`
- `artifacts/api-server/src/lib/conversation-engine.ts`
- `artifacts/api-server/src/lib/conocimiento-producto.ts`
- `artifacts/api-server/src/lib/ficha-parcial.ts`
- `artifacts/api-server/src/lib/sales-playbook.ts`
- `artifacts/api-server/src/lib/response-brain.ts`
- pruebas existentes de WhatsApp/IA/ventas

No duplicar funcionalidades sin justificarlo.

---

# 3. OBJETIVO COMERCIAL

Sofía debe comportarse como una vendedora humana profesional de Colombia:

- entiende preguntas cortas
- responde solo lo necesario
- recuerda lo que realmente dijo
- no repite fichas completas
- detecta intención de compra
- resuelve objeciones
- usa evidencia real para generar confianza
- puede usar imágenes y video
- entrega datos de pago reales
- sabe cuándo esperar
- no presiona artificialmente
- no inventa
- no promete lo que el sistema no puede cumplir
- mantiene contexto aunque el cliente cambie la forma de preguntar

---

# 4. ESTADO CONVERSACIONAL

Implementar o adaptar estado estructurado por conversación.

Mínimo:

```text
productId
stage
lastIntent
customerName
factsAlreadyShared
assetsSent
paymentMethodsShown
priceShown
productImageSent
introVideoSent
lastQuestion
lastResponseSent
pendingAction
paymentState
```

Etapas:

```text
greeting
discovery
consideration
evaluation
payment
verification
delivery
post_sale
```

La memoria NO debe guardar una propuesta de IA rechazada.

Ejemplo:

IA propone:
`El curso incluye Discord.`

Supervisor lo bloquea.

La memoria debe registrar:
`Discord = NO ENVIADO`

Nunca:
`Discord = dicho al cliente`

---

# 5. INTENCIONES

Como mínimo:

```text
greeting
product_interest
price
details
faq
payment_methods
payment_link
payment_confirmation
objection_price
objection_trust
objection_time
delivery
media_request
comparison
recommendation
thanks
goodbye
unknown
```

La intención se determina principalmente por el último mensaje, usando el contexto solo para desambiguar.

---

# 6. REGLA DE ALCANCE

Esta regla es crítica:

> Una pregunta concreta autoriza una respuesta concreta.

Ejemplos:

`Precio?`

=> `$60.000 COP`

NO:
- ficha completa
- características no solicitadas
- medios de pago
- promesa de acceso
- cierre artificial

`¿Qué incluye?`

=> características reales.

`¿Cuál enlace?`

=> resolver cuál enlace o preguntar qué medio de pago quiere.

`¿Cómo pago?`

=> métodos reales configurados.

---

# 7. FUENTE DE VERDAD DE PRODUCTOS

Los productos deben obtenerse desde la fuente real del sistema.

No hardcodear datos comerciales.

Cada respuesta debe usar el producto identificado en contexto.

Si el producto no está identificado:

- preguntar cuál producto
- o resolver desde el mensaje si hay evidencia suficiente

Nunca usar "el primer producto" como fallback para responder precio o características.

---

# 8. ACTIVOS MULTIMEDIA

Los recursos multimedia son parte del proceso de venta.

Puede existir:

- imagen del producto
- video introductorio
- tarjeta de catálogo
- otros medios reales

Reglas:

1. Si existe el activo, puede utilizarse cuando aporta confianza.
2. Si el cliente pide video, intentar video real.
3. Si pide imagen, intentar imagen real.
4. Si está evaluando/confianza, se puede proponer un activo apropiado.
5. Marcar el activo como enviado solo después de confirmar el envío.
6. No volver a enviar automáticamente un activo ya enviado.
7. Nunca decir "te envié el video" si el sistema no confirmó el envío.

---

# 9. PAGOS

Los pagos son datos críticos.

El LLM NO puede inventar:

- número Nequi
- Daviplata
- URL tarjeta/PSE
- URL PayPal
- cualquier otro método

Consultar configuración real.

Si un método no existe, no mencionarlo.

Si el cliente dice `¿Cuál enlace?` y existen varios:

`¿Te refieres al pago con tarjeta/PSE o PayPal?`

Si existe solo uno:

mostrar ese enlace real.

Nunca decir:

`Te dejo el link abajo`

si el servidor todavía no lo ha enviado.

---

# 10. COBRO Y ENTREGA

Flujo esperado:

```text
cliente pregunta/paga
        ↓
se muestran datos reales
        ↓
cliente envía comprobante
        ↓
backend recibe comprobante
        ↓
notificación al operador
        ↓
aprobación humana/automática según reglas
        ↓
entrega real
        ↓
confirmación al cliente
```

No prometer entrega antes de que el flujo correspondiente pueda cumplirla.

Debe existir prueba real de punta a punta antes de producción.

---

# 11. ESTILO DE SOFÍA

Español colombiano natural.

Evitar:

- `podés`
- `querés`
- `necesitás`
- `andás`
- `al toque`
- `está a un clic de llegar a ti`
- `¡Genial!` repetitivo
- `¡Perfecto!` repetitivo
- `¿Vamos?`
- saludos repetidos
- párrafos corporativos

Preferir:

`Claro 👍`

`Sí, te cuento.`

`💰 $60.000 COP`

`Puedes pagar por...`

`Si quieres, te muestro...`

La IA puede redactar, pero el sistema debe limitar alcance y claims.

---

# 12. ADAPTACIÓN DE LONGITUD

Pregunta corta = respuesta corta.

Pregunta específica = respuesta específica.

Petición amplia = respuesta más completa.

No entregar siempre el mismo bloque de ventas.

---

# 13. TRES PRODUCTOS DE REGRESIÓN

Todas las pruebas deben ejecutarse con datos reales del catálogo de:

### Piano

Producto de referencia: curso de piano.

### Inteligencia Artificial

Producto de referencia: `INTELIGENCIA ARTIFICIAL 2026: HERRAMIENTAS + AGENTES AUTÓNOMOS`.

### Educanino

Producto de referencia: curso de educación/adiestramiento canino.

No asumir precios ni características: consultar catálogo real.

---

# 14. CONVERSACIONES REALISTAS

## A. PIANO — comprador directo

Cliente: `Hola muy buenas`

Sofía: `Hola 👋 ¿Qué curso te interesa?`

Cliente: `Me interesa el curso de piano`

Sofía: `Claro 🎹 ¿Quieres saber el precio o qué incluye?`

Cliente: `Precio?`

Sofía: `💰 $60.000 COP`

Cliente: `¿Qué incluye?`

Sofía: características reales del catálogo, sin inventar.

Cliente: `¿Tienes video?`

Sofía: texto corto + envío del video real si existe.

Cliente: `¿Cómo pago?`

Sofía: medios reales configurados.

Cliente: `¿Cuál enlace?`

Sofía: resolver el medio exacto; no inventar.

Cliente: `Ya pagué, te mando el comprobante.`

Sofía: recepción y paso al flujo de verificación.

---

## B. PIANO — comprador desconfiado

Cliente: `¿Eso es confiable?`

Sofía debe responder usando solo elementos reales: modalidad, garantía, material, activos y proceso de compra.

Si hay video/imagen real, puede utilizarlo como evidencia.

No fabricar testimonios ni grupos ni certificaciones.

---

## C. IA 2026 — comprador técnico

Cliente: `Vi el curso de agentes IA`

Sofía: identificar producto.

Cliente: `¿Cuánto cuesta?`

Sofía: precio del catálogo.

Cliente: `¿Qué herramientas enseña?`

Sofía: solo herramientas registradas.

Cliente: `¿Sirve para crear agentes?`

Sofía: explicar únicamente lo respaldado por el producto.

Cliente: `¿Tienes video?`

Sofía: enviar video real si existe.

Cliente: `¿Cómo pago?`

Sofía: métodos reales.

---

## D. EDUCANINO — comprador con problema

Cliente: `Mi perro no me hace caso`

Sofía: preguntar o relacionar el problema con el curso sin garantizar resultados.

Cliente: `¿Qué enseña?`

Sofía: contenido real.

Cliente: `¿Cuánto vale?`

Sofía: precio real.

Cliente: `¿Puedo verlo antes?`

Sofía: usar imagen/video real si existe.

Cliente: `No sé si comprarlo`

Sofía: resolver objeción sin presión falsa.

---

# 15. ÁNGULOS QUE DEBEN PROBARSE

Cada producto:

1. saludo
2. interés
3. precio
4. detalles
5. información adicional
6. FAQ
7. duración
8. modalidad
9. confianza
10. garantía
11. certificado
12. imagen
13. video
14. métodos de pago
15. enlace
16. comprobante
17. entrega
18. objeción de precio
19. objeción de confianza
20. objeción de tiempo
21. comparación
22. recomendación
23. cambio de producto
24. mensajes muy cortos
25. errores ortográficos
26. emojis
27. mensajes largos
28. mensajes consecutivos
29. respuesta bloqueada seguida de nueva pregunta
30. intento de prompt injection del cliente

---

# 16. PRUEBAS CRÍTICAS DE REGRESIÓN

Estas deben pasar obligatoriamente:

### Test 1
`Precio?`

No debe aparecer la ficha completa.

### Test 2
`¿Cuál enlace?`

No debe aparecer un enlace inexistente.

### Test 3
`¿Qué incluye?`

No debe aparecer Discord si no existe.

### Test 4
El modelo genera un claim falso y el supervisor lo bloquea.

Ese claim NO debe aparecer en memoria.

### Test 5
Se envía video.

El estado debe registrar video enviado.

### Test 6
Cliente vuelve a preguntar.

No debe reenviar automáticamente el video.

### Test 7
Cliente cambia de Piano a IA.

No deben mezclarse características ni precios.

### Test 8
Producto inexistente.

No inventar.

### Test 9
Método de pago inexistente.

No inventar URL.

### Test 10
Respuesta con voseo argentino.

Debe rechazarse/corregirse.

---

# 17. OBSERVABILIDAD

Registrar en modo seguro:

```text
conversationId
messageId
productId
intent
stage
facts_authorized
facts_sent
assets_authorized
assets_sent
response_validation
violations
final_response
```

No registrar secretos ni credenciales.

La trazabilidad debe permitir responder:

`¿Por qué Sofía dijo esto?`

---

# 18. NO HACER

No:

- reemplazar toda la arquitectura
- crear otro bot independiente
- meter toda la lógica en un prompt gigante
- hardcodear precios
- hardcodear teléfonos
- hardcodear URLs
- confiar en memoria textual para hechos comerciales
- guardar respuestas rechazadas como memoria
- mandar ficha completa en cada turno
- inventar características
- inventar testimonios
- inventar urgencia
- inventar descuentos
- afirmar que algo fue enviado sin confirmación

---

# 19. PLAN DE EJECUCIÓN PARA CLAUDE CODE

### Fase 1 — Auditoría

Leer la arquitectura actual y localizar el pipeline real.

### Fase 2 — Integración

Conectar el engine existente al pipeline real, evitando duplicación.

### Fase 3 — Estado

Garantizar memoria estructurada y persistencia post-envío.

### Fase 4 — Facts

Garantizar catálogo/FAQ como fuente de verdad.

### Fase 5 — Multimedia

Integrar imagen/video reales.

### Fase 6 — Pagos

Integrar configuración real y flujo de comprobante.

### Fase 7 — Validación

Ejecutar hard validator antes de enviar.

### Fase 8 — Pruebas

Ejecutar la matriz completa para Piano, IA y Educanino.

### Fase 9 — Prueba real

Levantar entorno y probar el flujo real de WhatsApp cuando las credenciales estén disponibles.

### Fase 10 — Producción

Solo después de pasar pruebas y revisión.

---

# 20. DEFINITION OF DONE

No considerar el trabajo terminado porque compile.

Se considera terminado cuando:

- [ ] mensajes reales llegan al engine
- [ ] intención correcta
- [ ] producto correcto
- [ ] facts correctos
- [ ] respuesta proporcional
- [ ] no hay invenciones
- [ ] no hay voseo
- [ ] no hay muletillas repetitivas
- [ ] imágenes funcionan
- [ ] video funciona
- [ ] pagos funcionan
- [ ] comprobantes funcionan
- [ ] entrega funciona
- [ ] memoria representa lo enviado
- [ ] respuestas bloqueadas no contaminan memoria
- [ ] cambio de producto funciona
- [ ] 3 productos pasan la matriz de regresión
- [ ] pruebas automatizadas pasan
- [ ] prueba real de WhatsApp pasa
- [ ] logs permiten auditar la decisión

---

# 21. INSTRUCCIÓN FINAL PARA CLAUDE

No te limites a revisar este documento.

**Inspecciona el código real, ejecuta el sistema, encuentra dónde se rompe el flujo y corrígelo.**

Si una regla de este documento contradice el comportamiento actual, conserva la arquitectura útil existente pero modifica el punto responsable para cumplir la especificación.

No declares éxito por tener tests unitarios verdes.

El criterio final es comportamiento real de ventas.

La pregunta que debes poder contestar después de cada prueba es:

> `¿Sofía respondió exactamente a lo que el cliente preguntó, usando únicamente información real y aprovechando los recursos disponibles para vender con confianza?`

Si la respuesta es no, el trabajo no está terminado.
