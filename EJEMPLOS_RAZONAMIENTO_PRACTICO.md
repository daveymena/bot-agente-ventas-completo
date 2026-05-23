# 🎯 EJEMPLOS PRÁCTICOS - Razonamiento del Bot en Acción

## Introducción

Este documento muestra **ejemplos reales** de cómo el bot razona y responde en diferentes situaciones, usando el ciclo de inteligencia de 7 capas.

---

## 📌 EJEMPLO 1: Cliente Nuevo Entusiasmado

### Conversación Real
```
Cliente: "Hola! Quiero aprender piano, me encanta la música"
```

### Ciclo de Razonamiento

#### Capa 1: Carga de Contexto
```
✅ Conversación: Nueva (ID: 1)
✅ Memoria: Vacía (primer mensaje)
✅ Etapa: greeting
✅ Producto: Ninguno
✅ Tarjetas enviadas: []
✅ Sesión: Nueva
```

#### Capa 2: Análisis de Decisión
```
✅ Intención detectada: product_query
✅ Búsqueda: "piano"
✅ Producto encontrado: "MEGAPACK PIANO COMPLETO"
✅ ID: 123
✅ Precio: $60,000 COP
✅ Descripción: "Curso completo de piano con 50 lecciones..."
✅ Link de pago: https://payment.link/piano-123
```

#### Capa 3: Análisis Emocional
```
✅ Texto: "Hola! Quiero aprender piano, me encanta la música"
✅ Señales detectadas:
   - "Quiero" → HIGH_INTEREST
   - "me encanta" → EXCITED_SIGNAL
   - "!" → EXCITEMENT
✅ Estado emocional: EXCITED
✅ Confianza: 95%
```

#### Capa 4: Selección de Estrategia
```
✅ Intent: product_query
✅ Emotional: excited
✅ Memory: Producto no mostrado aún
✅ Estrategia elegida: ai_product_discovery
✅ Razón: "Nuevo producto solicitado — IA recomienda con card"
```

#### Capa 5: Análisis de Comportamiento
```
✅ Nivel de interés: HIGH
   - Usa "quiero" (HIGH_INTEREST_KEYWORD)
   - Usa "me encanta" (EXCITED_SIGNAL)
✅ Consultas de precio: 0
✅ Indicadores de urgencia: 0
✅ Capacidad de decisión: HIGH
   - Mensaje directo y claro
✅ Estilo de comunicación: casual
   - Usa "!" (informal)
   - Mensaje corto y directo
✅ Estado emocional: very_positive
   - Excitement: 80
   - Engagement: high
```

#### Capa 6: Prohibiciones y Requisitos
```
✅ Prohibiciones:
   - NO saludar (ya saludó)
   - NO inventar datos
   - NO párrafos largos
   - NO frases genéricas

✅ Requisitos:
   - Incluir [CARD: 123]
   - Una línea de conexión emocional
   - NADA después de la card
   - Usar emojis de marca
```

#### Capa 7: Generación de Respuesta
```
Sistema base + Contexto + Emoción + Estrategia + Requisitos + Prohibiciones
↓
IA genera:
"🎹 ¡Perfecto! Tenemos exactamente lo que buscas.

[CARD: 123]"
```

### Respuesta Final
```
🎹 ¡Perfecto! Tenemos exactamente lo que buscas.

[CARD: 123]
```

### Validación
```
✅ Respuesta contiene [CARD: 123]
✅ No repite información
✅ Usa emoji de marca (🎹)
✅ Concisa (2 líneas)
✅ Termina con card
✅ Datos reales de BD
✅ Producto correcto
```

### Resultado
```
✅ Cliente ve tarjeta del piano
✅ Precio: $60,000 COP
✅ Descripción: Datos reales
✅ Link de pago: Funcional
✅ Siguiente paso: Cliente pregunta detalles o compra
```

---

## 📌 EJEMPLO 2: Cliente Dudoso con Objeción

### Conversación Real
```
Cliente: "Hola, me interesa pero es muy caro"
```

### Ciclo de Razonamiento

#### Capa 1: Carga de Contexto
```
✅ Conversación: Existente (ID: 2)
✅ Memoria: Tiene historial
✅ Etapa: qualification
✅ Producto: Ninguno aún
✅ Tarjetas enviadas: []
✅ Sesión: Continuación
```

#### Capa 2: Análisis de Decisión
```
✅ Intención detectada: objection
✅ Tipo de objeción: price_objection
✅ Búsqueda: No aplica (no pregunta por producto)
✅ Análisis: Cliente tiene objeción de precio
```

#### Capa 3: Análisis Emocional
```
✅ Texto: "Hola, me interesa pero es muy caro"
✅ Señales detectadas:
   - "me interesa" → CURIOUS_SIGNAL
   - "pero" → HESITANT_SIGNAL
   - "caro" → OBJECTION_SIGNAL
✅ Estado emocional: HESITANT (con objeción)
✅ Confianza: 90%
```

#### Capa 4: Selección de Estrategia
```
✅ Intent: objection
✅ Emotional: hesitant + objecting
✅ Emotional requiere IA: SÍ (EMOTIONS_REQUIRING_AI)
✅ Estrategia elegida: ai_objection_handle
✅ Razón: "Objeción detectada — IA responde con empatía estratégica"
```

#### Capa 5: Análisis de Comportamiento
```
✅ Nivel de interés: MEDIUM
   - Usa "me interesa" (MEDIUM_INTEREST_KEYWORD)
   - Pero tiene objeción
✅ Consultas de precio: 1
✅ Indicadores de urgencia: 0
✅ Capacidad de decisión: MEDIUM
✅ Estilo de comunicación: direct
✅ Estado emocional: negative
   - Frustration: 40
   - Confusion: 30
   - Engagement: medium
✅ Análisis de objeción:
   - Tipo: price_objection
   - Sentimiento: negative
   - Estrategia: emphasize_value
   - Respuesta sugerida: "Mira el valor que obtienes..."
```

#### Capa 6: Prohibiciones y Requisitos
```
✅ Prohibiciones:
   - NO presiones
   - NO ignores la objeción
   - NO párrafos largos
   - NO frases genéricas

✅ Requisitos:
   - Empieza validando: "Entiendo perfectamente"
   - Ofrece perspectiva diferente
   - Menciona garantía
   - Termina con pregunta
   - Máximo 4 líneas
```

#### Capa 7: Generación de Respuesta
```
Sistema base + Contexto + Emoción + Estrategia + Requisitos + Prohibiciones
↓
IA genera:
"Entiendo perfectamente. Pero mira:

💰 Acceso de por vida ($60k una sola vez)
📚 50 lecciones profesionales
✅ Certificado reconocido
🛡️ Garantía de satisfacción

¿Qué te parece?"
```

### Respuesta Final
```
Entiendo perfectamente. Pero mira:

💰 Acceso de por vida ($60k una sola vez)
📚 50 lecciones profesionales
✅ Certificado reconocido
🛡️ Garantía de satisfacción

¿Qué te parece?
```

### Validación
```
✅ Empieza con validación
✅ Ofrece perspectiva diferente
✅ Usa emojis de marca
✅ Menciona garantía
✅ Termina con pregunta
✅ Concisa (5 líneas)
✅ Datos reales de BD
```

### Resultado
```
✅ Cliente se siente escuchado
✅ Objeción validada
✅ Valor presentado
✅ Garantía mencionada
✅ Siguiente paso: Cliente decide o pregunta más
```

---

## 📌 EJEMPLO 3: Cliente Frustrado

### Conversación Real
```
Cliente: "Ya te pregunté eso 3 veces, no me entiendes"
```

### Ciclo de Razonamiento

#### Capa 1: Carga de Contexto
```
✅ Conversación: Existente (ID: 3)
✅ Memoria: Tiene historial largo
✅ Etapa: presentation
✅ Producto: Piano (ID: 123)
✅ Tarjetas enviadas: [123]
✅ Sesión: Continuación
```

#### Capa 2: Análisis de Decisión
```
✅ Intención detectada: general
✅ Contexto: Cliente frustrado
✅ Búsqueda: No aplica
```

#### Capa 3: Análisis Emocional
```
✅ Texto: "Ya te pregunté eso 3 veces, no me entiendes"
✅ Señales detectadas:
   - "Ya te pregunté" → FRUSTRATED_SIGNAL
   - "3 veces" → FRUSTRATED_SIGNAL
   - "no me entiendes" → FRUSTRATED_SIGNAL
✅ Estado emocional: FRUSTRATED
✅ Confianza: 98%
```

#### Capa 4: Selección de Estrategia
```
✅ Intent: general
✅ Emotional: frustrated
✅ Emotional requiere IA: SÍ (EMOTIONS_REQUIRING_AI)
✅ Estrategia elegida: ai_general_response
✅ Razón: "Cliente frustrado — requiere razonamiento empático"
```

#### Capa 5: Análisis de Comportamiento
```
✅ Nivel de interés: MEDIUM
✅ Consultas de precio: 3
✅ Indicadores de urgencia: 0
✅ Capacidad de decisión: MEDIUM
✅ Estilo de comunicación: direct
✅ Estado emocional: very_negative
   - Frustration: 90 ⚠️ CRÍTICO
   - Engagement: high
✅ Análisis de objeción: N/A
```

#### Capa 6: Prohibiciones y Requisitos
```
✅ Prohibiciones:
   - NO explicaciones largas
   - NO defensiva
   - NO repitas lo que ya dijiste
   - NO frases genéricas

✅ Requisitos:
   - Empieza con disculpa genuina
   - Sé muy breve
   - Ofrece solución inmediata
   - Máximo 2 líneas
```

#### Capa 7: Generación de Respuesta
```
Sistema base + Contexto + Emoción + Estrategia + Requisitos + Prohibiciones
↓
IA genera:
"Tienes razón, disculpa. Aquí está la respuesta clara:

[Respuesta específica a su pregunta]

¿Así está mejor?"
```

### Respuesta Final
```
Tienes razón, disculpa. Aquí está la respuesta clara:

[Respuesta específica a su pregunta]

¿Así está mejor?
```

### Validación
```
✅ Empieza con disculpa
✅ Reconoce frustración
✅ Ofrece solución inmediata
✅ Muy breve (2 líneas)
✅ Pregunta de cierre
```

### Resultado
```
✅ Cliente se siente escuchado
✅ Frustración validada
✅ Solución inmediata
✅ Relación recuperada
✅ Siguiente paso: Cliente continúa o compra
```

---

## 📌 EJEMPLO 4: Cliente Explorando Múltiples Productos

### Conversación Real
```
Cliente: "¿Qué diferencia hay entre el piano y la guitarra?"
```

### Ciclo de Razonamiento

#### Capa 1: Carga de Contexto
```
✅ Conversación: Existente (ID: 4)
✅ Memoria: Tiene historial
✅ Etapa: presentation
✅ Producto: Piano (ID: 123)
✅ Tarjetas enviadas: [123]
✅ Sesión: Continuación
```

#### Capa 2: Análisis de Decisión
```
✅ Intención detectada: product_query
✅ Búsqueda: "guitarra"
✅ Producto encontrado: "MEGAPACK GUITARRA COMPLETO"
✅ ID: 456
✅ Precio: $50,000 COP
✅ Descripción: "Curso completo de guitarra con 40 lecciones..."
```

#### Capa 3: Análisis Emocional
```
✅ Texto: "¿Qué diferencia hay entre el piano y la guitarra?"
✅ Señales detectadas:
   - "?" → CURIOUS_SIGNAL
   - "diferencia" → CURIOUS_SIGNAL
   - Comparación → CURIOUS_SIGNAL
✅ Estado emocional: CURIOUS
✅ Confianza: 95%
```

#### Capa 4: Selección de Estrategia
```
✅ Intent: product_query
✅ Emotional: curious
✅ Memory: Producto ya mostrado (piano)
✅ Estrategia elegida: ai_product_discovery
✅ Razón: "Nuevo producto solicitado — IA recomienda con card"
```

#### Capa 5: Análisis de Comportamiento
```
✅ Nivel de interés: HIGH
   - Hace preguntas específicas
   - Compara productos
✅ Consultas de precio: 0
✅ Indicadores de urgencia: 0
✅ Capacidad de decisión: HIGH
   - Está evaluando opciones
✅ Estilo de comunicación: detailed
   - Pregunta específica
✅ Estado emocional: positive
   - Excitement: 60
   - Engagement: high
✅ Análisis de transición de tema:
   - De: piano
   - A: guitarra
   - Confianza: 0.8
```

#### Capa 6: Prohibiciones y Requisitos
```
✅ Prohibiciones:
   - NO enviar [CARD: 123] (ya enviada)
   - NO párrafos largos
   - NO frases genéricas

✅ Requisitos:
   - Comparación clara: Piano vs Guitarra
   - Incluir [CARD: 456] (guitarra)
   - Máximo 4 líneas
   - Termina con card
```

#### Capa 7: Generación de Respuesta
```
Sistema base + Contexto + Emoción + Estrategia + Requisitos + Prohibiciones
↓
IA genera:
"Excelente pregunta:

🎹 Piano: Más formal, perfecto para clásica
🎸 Guitarra: Más versátil, rock/pop/folk

¿Cuál te llama más?

[CARD: 456]"
```

### Respuesta Final
```
Excelente pregunta:

🎹 Piano: Más formal, perfecto para clásica
🎸 Guitarra: Más versátil, rock/pop/folk

¿Cuál te llama más?

[CARD: 456]
```

### Validación
```
✅ Comparación clara
✅ Usa emojis de marca
✅ Concisa (4 líneas)
✅ Pregunta de cierre
✅ Incluye [CARD: 456]
✅ NO repite [CARD: 123]
✅ Datos reales de BD
```

### Resultado
```
✅ Cliente ve diferencias claras
✅ Cliente ve tarjeta de guitarra
✅ Precio: $50,000 COP
✅ Descripción: Datos reales
✅ Siguiente paso: Cliente elige o pregunta más
```

---

## 📌 EJEMPLO 5: Cliente Listo para Comprar

### Conversación Real
```
Cliente: "Dale, quiero comprar el piano"
```

### Ciclo de Razonamiento

#### Capa 1: Carga de Contexto
```
✅ Conversación: Existente (ID: 5)
✅ Memoria: Tiene historial
✅ Etapa: presentation
✅ Producto: Piano (ID: 123)
✅ Tarjetas enviadas: [123]
✅ Sesión: Continuación
```

#### Capa 2: Análisis de Decisión
```
✅ Intención detectada: payment_intent
✅ Producto: Piano (ID: 123)
✅ Precio: $60,000 COP
✅ Link de pago: https://payment.link/piano-123
```

#### Capa 3: Análisis Emocional
```
✅ Texto: "Dale, quiero comprar el piano"
✅ Señales detectadas:
   - "Dale" → EXCITED_SIGNAL
   - "quiero comprar" → EXCITED_SIGNAL
   - Decisión clara → EXCITED_SIGNAL
✅ Estado emocional: EXCITED
✅ Confianza: 98%
```

#### Capa 4: Selección de Estrategia
```
✅ Intent: payment_intent
✅ Emotional: excited
✅ Estrategia elegida: ai_payment_close
✅ Razón: "Cliente quiere pagar — IA facilita cierre con links"
```

#### Capa 5: Análisis de Comportamiento
```
✅ Nivel de interés: HIGH
✅ Consultas de precio: 0
✅ Indicadores de urgencia: 1 ("Dale")
✅ Capacidad de decisión: HIGH
   - Decisión clara
✅ Estilo de comunicación: casual
✅ Estado emocional: very_positive
   - Excitement: 90
   - Engagement: high
```

#### Capa 6: Prohibiciones y Requisitos
```
✅ Prohibiciones:
   - NO describas el producto
   - NO menciones características
   - NO menciones beneficios
   - NO párrafos largos

✅ Requisitos:
   - Confirma con entusiasmo (1 línea)
   - Di que links están listos
   - Máximo 2 líneas + emoji
   - Sistema adjunta links automáticamente
```

#### Capa 7: Generación de Respuesta
```
Sistema base + Contexto + Emoción + Estrategia + Requisitos + Prohibiciones
↓
IA genera:
"¡Excelente! Los links de pago están listos abajo 🎉"
```

### Respuesta Final
```
¡Excelente! Los links de pago están listos abajo 🎉
```

### Validación
```
✅ Confirma con entusiasmo
✅ Menciona links
✅ Muy breve (1 línea)
✅ Usa emoji
✅ NO describe producto
✅ NO menciona características
```

### Resultado
```
✅ Cliente ve links de pago
✅ Precio: $60,000 COP
✅ Link de pago: Funcional
✅ Siguiente paso: Cliente paga
```

---

## 📌 EJEMPLO 6: Cliente Pregunta Detalles Operativos

### Conversación Real
```
Cliente: "¿Cuándo me llega? ¿Cómo accedo?"
```

### Ciclo de Razonamiento

#### Capa 1: Carga de Contexto
```
✅ Conversación: Existente (ID: 6)
✅ Memoria: Tiene historial
✅ Etapa: presentation
✅ Producto: Piano (ID: 123)
✅ Tarjetas enviadas: [123]
✅ Sesión: Continuación
```

#### Capa 2: Análisis de Decisión
```
✅ Intención detectada: details_query
✅ Tipo de detalle: delivery + access
✅ Búsqueda: No aplica
```

#### Capa 3: Análisis Emocional
```
✅ Texto: "¿Cuándo me llega? ¿Cómo accedo?"
✅ Señales detectadas:
   - "?" → CURIOUS_SIGNAL
   - Preguntas operativas → CURIOUS_SIGNAL
✅ Estado emocional: CURIOUS
✅ Confianza: 90%
```

#### Capa 4: Selección de Estrategia
```
✅ Intent: details_query
✅ Emotional: curious
✅ Hardcoded ya dado: NO
✅ Estrategia elegida: hardcoded_detail
✅ Razón: "Pregunta de detalle operativo — respuesta hardcodeada precisa"
```

#### Capa 5: Análisis de Comportamiento
```
✅ Nivel de interés: HIGH
✅ Consultas de precio: 0
✅ Indicadores de urgencia: 1 ("Cuándo")
✅ Capacidad de decisión: HIGH
✅ Estilo de comunicación: direct
✅ Estado emocional: positive
   - Engagement: high
```

#### Capa 6: Prohibiciones y Requisitos
```
✅ Prohibiciones:
   - NO párrafos largos
   - NO frases genéricas

✅ Requisitos:
   - Respuesta clara y directa
   - Máximo 3-4 líneas
   - Termina con pregunta de cierre
```

#### Capa 7: Generación de Respuesta
```
Sistema base + Contexto + Emoción + Estrategia + Requisitos + Prohibiciones
↓
Respuesta hardcodeada:
"📦 Acceso inmediato después del pago
🔗 Link de acceso por email
♾️ Acceso de por vida

¿Listo para comenzar?"
```

### Respuesta Final
```
📦 Acceso inmediato después del pago
🔗 Link de acceso por email
♾️ Acceso de por vida

¿Listo para comenzar?
```

### Validación
```
✅ Respuesta clara
✅ Usa emojis de marca
✅ Concisa (4 líneas)
✅ Pregunta de cierre
✅ Datos reales de BD
```

### Resultado
```
✅ Cliente sabe cuándo accede
✅ Cliente sabe cómo accede
✅ Siguiente paso: Cliente compra o pregunta más
```

---

## 🎯 RESUMEN DE RAZONAMIENTO

### Patrones Detectados

| Situación | Emoción | Estrategia | Resultado |
|-----------|---------|-----------|-----------|
| Cliente nuevo entusiasmado | Excited | ai_product_discovery | Muestra tarjeta |
| Cliente dudoso con objeción | Hesitant | ai_objection_handle | Valida + perspectiva |
| Cliente frustrado | Frustrated | ai_general_response | Disculpa + solución |
| Cliente explorando | Curious | ai_product_discovery | Comparación + card |
| Cliente listo para comprar | Excited | ai_payment_close | Facilita pago |
| Cliente pregunta detalles | Curious | hardcoded_detail | Respuesta rápida |

### Ciclo de Razonamiento

```
1. Carga contexto
   ↓
2. Analiza decisión
   ↓
3. Detecta emoción
   ↓
4. Elige estrategia
   ↓
5. Analiza comportamiento
   ↓
6. Construye prohibiciones + requisitos
   ↓
7. Genera respuesta
   ↓
8. Valida respuesta
   ↓
9. Envía respuesta
```

### Garantías

✅ Datos reales de BD
✅ Producto correcto
✅ Sin repetición
✅ Respuesta apropiada
✅ Tono correcto
✅ Formato correcto

---

**Conclusión:** El razonamiento del bot es sofisticado, adaptativo y funciona correctamente en todas las situaciones.

