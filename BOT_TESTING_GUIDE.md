# Guía de Testing del Bot de Ventas Inteligente

## 🧪 Preguntas de Testing Reales

### Categoría 1: Preguntas sobre Producto

#### Test 1.1 - Características Básicas
```
Cliente: "¿Qué características tiene este producto?"
Bot Debe:
✅ Identificar intención: PRODUCT
✅ Extraer especificaciones técnicas
✅ Mantener contexto del producto actual
✅ Responder de forma clara y estructurada
```

#### Test 1.2 - Comparación de Modelos
```
Cliente: "¿Cuál es la diferencia entre el modelo A y el modelo B?"
Bot Debe:
✅ Entender que es una pregunta comparativa
✅ Buscar ambos productos en BD
✅ Listar diferencias clave
✅ Recomendar según necesidad del cliente
```

#### Test 1.3 - Accesorios Incluidos
```
Cliente: "¿Qué viene incluido? ¿Tiene accesorios?"
Bot Debe:
✅ Identificar pregunta sobre contenido del paquete
✅ Listar todos los accesorios
✅ Mencionar si hay accesorios opcionales
✅ Ofrecer información de precios adicionales
```

---

### Categoría 2: Preguntas sobre Precio

#### Test 2.1 - Precio Simple
```
Cliente: "¿Cuánto cuesta?"
Bot Debe:
✅ Proporcionar precio actual
✅ Mencionar si hay descuentos
✅ Indicar formas de pago disponibles
✅ Mantener contexto del producto
```

#### Test 2.2 - Descuentos por Cantidad
```
Cliente: "¿Hay descuento si compro más de 5?"
Bot Debe:
✅ Buscar en BD políticas de descuento
✅ Calcular precio con descuento
✅ Mostrar ahorro total
✅ Facilitar compra en cantidad
```

#### Test 2.3 - Comparación de Precios
```
Cliente: "¿Es más caro que el modelo anterior?"
Bot Debe:
✅ Recordar producto anterior mencionado
✅ Comparar precios
✅ Explicar diferencia de valor
✅ Justificar diferencia de precio
```

---

### Categoría 3: Preguntas sobre Entrega

#### Test 3.1 - Tiempo de Entrega
```
Cliente: "¿Cuánto tarda en llegar?"
Bot Debe:
✅ Identificar intención: DELIVERY
✅ Proporcionar tiempo estimado
✅ Mencionar si es a nivel nacional
✅ Ofrecer opciones de envío rápido
```

#### Test 3.2 - Envío a Ubicación Específica
```
Cliente: "¿Hacen envío a Bogotá? ¿Cuál es el costo?"
Bot Debe:
✅ Verificar cobertura de envío
✅ Calcular costo de envío
✅ Proporcionar tiempo estimado
✅ Ofrecer alternativas (recogida, etc.)
```

#### Test 3.3 - Opciones de Recogida
```
Cliente: "¿Puedo recoger en tienda?"
Bot Debe:
✅ Identificar pregunta sobre recogida
✅ Proporcionar ubicaciones disponibles
✅ Horarios de atención
✅ Proceso de recogida
```

---

### Categoría 4: Preguntas sobre Garantía

#### Test 4.1 - Cobertura de Garantía
```
Cliente: "¿Qué cubre la garantía?"
Bot Debe:
✅ Listar lo que cubre
✅ Listar lo que NO cubre
✅ Duración de la garantía
✅ Proceso de reclamación
```

#### Test 4.2 - Duración de Garantía
```
Cliente: "¿Por cuánto tiempo está garantizado?"
Bot Debe:
✅ Proporcionar período de garantía
✅ Mencionar si hay extensión disponible
✅ Costo de extensión (si aplica)
✅ Cómo activar la garantía
```

#### Test 4.3 - Proceso de Reclamo
```
Cliente: "¿Cómo hago un reclamo si falla?"
Bot Debe:
✅ Explicar proceso paso a paso
✅ Documentos necesarios
✅ Tiempo de respuesta
✅ Opciones de solución (cambio, reembolso, etc.)
```

---

### Categoría 5: Preguntas sobre Pago

#### Test 5.1 - Formas de Pago
```
Cliente: "¿Qué formas de pago aceptan?"
Bot Debe:
✅ Listar todas las opciones
✅ Indicar si hay comisión
✅ Seguridad del pago
✅ Confirmación de pago
```

#### Test 5.2 - Pago en Cuotas
```
Cliente: "¿Puedo pagar en cuotas?"
Bot Debe:
✅ Confirmar disponibilidad de cuotas
✅ Número de cuotas disponibles
✅ Tasa de interés (si aplica)
✅ Proceso de solicitud
```

#### Test 5.3 - Financiamiento
```
Cliente: "¿Ofrecen financiamiento?"
Bot Debe:
✅ Explicar opciones de financiamiento
✅ Requisitos
✅ Tasa de interés
✅ Tiempo de aprobación
```

---

### Categoría 6: Preguntas sobre Disponibilidad

#### Test 6.1 - Stock Disponible
```
Cliente: "¿Tienen en stock?"
Bot Debe:
✅ Verificar disponibilidad actual
✅ Cantidad disponible
✅ Ubicación del stock
✅ Tiempo de entrega si no hay stock
```

#### Test 6.2 - Próximas Entregas
```
Cliente: "¿Cuándo llega nuevo stock?"
Bot Debe:
✅ Buscar en BD próximas entregas
✅ Fecha estimada
✅ Cantidad esperada
✅ Opción de pre-orden
```

---

## 🔄 Pruebas de Coherencia

### Test de Coherencia 1: Cambio de Producto
```
Cliente: "¿Cuánto cuesta el producto A?"
Bot: "El producto A cuesta $100"
Cliente: "¿Y el producto B?"
Bot Debe:
✅ Cambiar contexto a producto B
✅ Proporcionar precio de B
✅ Recordar que A cuesta $100 (si pregunta de nuevo)
✅ No confundir precios
```

### Test de Coherencia 2: Preguntas Consecutivas
```
Cliente: "¿Cuánto cuesta?"
Bot: "Cuesta $100"
Cliente: "¿Cuánto tarda en llegar?"
Bot Debe:
✅ Cambiar de tema (precio → entrega)
✅ Mantener contexto del producto
✅ No repetir información anterior
✅ Responder la nueva pregunta
```

### Test de Coherencia 3: Validación de Información
```
Cliente: "¿Tiene garantía?"
Bot: "Sí, 2 años"
Cliente: "¿Qué cubre?"
Bot Debe:
✅ Recordar que mencionó 2 años
✅ Proporcionar detalles de cobertura
✅ No contradecir información anterior
✅ Ser consistente
```

---

## 📊 Métricas de Éxito

### Por Categoría
| Categoría | Éxito | Fallo | % Éxito |
|-----------|-------|-------|---------|
| Producto | 0 | 0 | 0% |
| Precio | 0 | 0 | 0% |
| Entrega | 0 | 0 | 0% |
| Garantía | 0 | 0 | 0% |
| Pago | 0 | 0 | 0% |
| Disponibilidad | 0 | 0 | 0% |

### Coherencia
| Prueba | Resultado |
|--------|-----------|
| Cambio de Producto | ❌ |
| Preguntas Consecutivas | ❌ |
| Validación de Info | ❌ |

---

## 🚀 Procedimiento de Testing

### Paso 1: Preparación
```bash
# Iniciar servidor
npm run start

# En otra terminal, abrir cliente de prueba
curl -X POST http://localhost:3002/api/whatsapp/test-ia \
  -H "Content-Type: application/json" \
  -d '{"message":"Hola"}'
```

### Paso 2: Ejecutar Pruebas
1. Ejecutar cada test de la lista anterior
2. Registrar respuesta del bot
3. Marcar como ✅ o ❌
4. Anotar problemas encontrados

### Paso 3: Validar Coherencia
1. Ejecutar pruebas de coherencia
2. Verificar que el bot mantiene contexto
3. Verificar que no hay contradicciones

### Paso 4: Documentar Resultados
1. Llenar tabla de métricas
2. Listar problemas encontrados
3. Priorizar fixes

---

## 🐛 Problemas Comunes

### Problema 1: Bot No Entiende Pregunta
**Síntoma:** Bot responde genéricamente
**Causa:** Intención no detectada correctamente
**Solución:** Revisar `semantic-analyzer.ts` - agregar patrones

### Problema 2: Bot Cambia de Contexto
**Síntoma:** Bot olvida producto anterior
**Causa:** Contexto no se mantiene
**Solución:** Revisar `conversation-flow.ts` - validar estado

### Problema 3: Bot Contradice Información
**Síntoma:** Bot da respuestas inconsistentes
**Causa:** Validación de coherencia no funciona
**Solución:** Revisar `validateBotResponse()` en `conversation-flow.ts`

---

## ✅ Checklist de Validación

- [ ] Bot entiende todas las categorías de preguntas
- [ ] Bot mantiene coherencia en cambios de tema
- [ ] Bot no contradice información anterior
- [ ] Bot responde en menos de 2 segundos
- [ ] Bot proporciona información completa
- [ ] Bot es amigable y profesional
- [ ] Bot facilita la compra
- [ ] Bot maneja errores gracefully

---

## 📝 Notas

- Ejecutar tests en orden
- Documentar cada resultado
- Reportar bugs inmediatamente
- Validar en staging antes de producción

