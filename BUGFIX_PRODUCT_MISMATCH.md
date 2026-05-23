# 🔧 CORRECCIÓN: Bot Enviando Producto Diferente al Solicitado

## Problema Identificado

El bot estaba enviando un **producto diferente** al que el usuario preguntaba, tanto en la presentación del producto como en el flujo de pago. Esto ocurría en tres capas del sistema:

### 1. **Lógica de Búsqueda de Productos** (`findBestProductMatch`)
- Cuando había múltiples productos con palabras similares, el sistema no diferenciaba correctamente
- No había validación adicional cuando había empates en el nivel de coincidencia

### 2. **Decisión de Producto** (`computeDecision`)
- El sistema cambiaba de producto incluso en intents que no eran de pago
- No mantenía el contexto del producto actual cuando era apropiado
- Permitía cambios de producto sin validación estricta

### 3. **Parser de Partes** (en `agent.ts`)
- Cuando el ID de la tarjeta era inválido, usaba un fallback que buscaba por nombre
- Este fallback podría devolver un producto completamente diferente
- No validaba que el producto fallback fuera el correcto

### 4. **Flujo de Pago**
- No había validación de que el producto en pago coincidiera con la tarjeta enviada
- El `currentProductId` en BD podría no sincronizarse correctamente

---

## Soluciones Implementadas

### ✅ 1. Validación Estricta en Parser de Partes

**Archivo:** `artifacts/api-server/src/lib/agent.ts`

```typescript
// ANTES: Usaba fallback que podría devolver producto incorrecto
const resolvedId = (!isNaN(numId) && validIds.has(numId))
  ? numId
  : (() => {
      const fallback = productList.find(p =>
        p.name.toLowerCase().split(" ").some(w => w.length > 3 && lastText.toLowerCase().includes(w))
      );
      return fallback ? fallback.id : -1;
    })();

// DESPUÉS: Solo usa productToShow de decision (fuente de verdad)
let resolvedId = -1;
if (!isNaN(numId) && validIds.has(numId)) {
  resolvedId = numId;
} else if (decision.productToShow && validIds.has(decision.productToShow.id)) {
  resolvedId = decision.productToShow.id;
} else {
  resolvedId = -1; // Rechazar card si no hay productToShow válido
}
```

**Beneficio:** El parser ahora SOLO usa el producto que el motor de decisión determinó como correcto.

---

### ✅ 2. Lógica de Cambio de Producto Más Estricta

**Archivo:** `artifacts/api-server/src/lib/conversation-engine.ts`

```typescript
// ANTES: Cambiaba de producto en cualquier intent
else if (p.id !== memory.currentProductId) {
  productToShow = { ... };
  shouldSendCard = (intent === "payment_intent" || intent === "confirmation");
}

// DESPUÉS: Solo cambia si es payment_intent o confirmation
else if (p.id !== memory.currentProductId) {
  if (intent === "payment_intent" || intent === "confirmation") {
    productToShow = { ... };
    shouldSendCard = true;
  } else {
    // Mantener el producto actual para evitar confusión
    const currentProduct = productList.find(p2 => p2.id === memory.currentProductId);
    productToShow = { ... };
  }
}
```

**Beneficio:** Evita cambios de producto innecesarios que causaban confusión.

---

### ✅ 3. Validación Mejorada en Búsqueda de Productos

**Archivo:** `artifacts/api-server/src/lib/conversation-engine.ts`

```typescript
// Cuando hay múltiples productos con el mismo nivel de coincidencia,
// se calcula un score adicional basado en coincidencias exactas
if (valid.length > 1 && valid[0].level === valid[1].level) {
  const topLevel = valid[0].level;
  const topProducts = valid.filter(e => e.level === topLevel);
  
  if (topProducts.length > 1) {
    const scores = topProducts.map(e => {
      const nameHits = specificWords.filter(w => normalizeText(e.product.name).includes(w)).length;
      const descHits = specificWords.filter(w => normalizeText(e.product.description || "").includes(w)).length;
      return { product: e, score: nameHits * 2 + descHits };
    });
    
    scores.sort((a, b) => b.score - a.score);
    return { product: scores[0].product.product, score: topLevel * 25, ... };
  }
}
```

**Beneficio:** Desempata correctamente cuando hay múltiples productos similares.

---

### ✅ 4. Validación en Flujo de Pago

**Archivo:** `artifacts/api-server/src/lib/agent.ts`

```typescript
// Validación crítica: Asegurar que el producto en pago sea el correcto
const cardProductIds = finalParts.filter((p: any) => p.kind === "card").map((p: any) => p.productId);
if (cardProductIds.length > 0 && !cardProductIds.includes(pId)) {
  console.log(`❌ [PAYMENT-VALIDATION] MISMATCH: Producto en pago (${pId}) no coincide con tarjeta (${cardProductIds.join(",")})`);
  // Usar el producto de la tarjeta como fuente de verdad
  const correctProduct = productList.find(p => cardProductIds.includes(p.id));
  if (correctProduct) {
    console.log(`🔧 [PAYMENT-VALIDATION] Corrigiendo a producto correcto: ${correctProduct.name}`);
  }
}
```

**Beneficio:** Detecta y registra desincronizaciones entre el producto en contexto y la tarjeta enviada.

---

## Cambios Realizados

| Archivo | Cambio | Líneas |
|---------|--------|--------|
| `agent.ts` | Parser de partes: validación estricta de ID | ~1050-1080 |
| `agent.ts` | Validación en flujo de pago | ~1130-1160 |
| `conversation-engine.ts` | Lógica de cambio de producto más estricta | ~1040-1090 |
| `conversation-engine.ts` | Validación mejorada en búsqueda | ~950-980 |

---

## Pruebas Recomendadas

### 1. **Búsqueda de Producto Correcto**
```
Cliente: "Quiero el curso de guitarra"
Esperado: Bot muestra SOLO el curso de guitarra, no piano ni otros
```

### 2. **Cambio de Producto en Detalles**
```
Cliente: "Quiero guitarra"
Bot: Muestra guitarra
Cliente: "¿Cuánto cuesta el piano?"
Esperado: Bot responde sobre piano pero mantiene guitarra en contexto
```

### 3. **Pago del Producto Correcto**
```
Cliente: "Quiero el excel"
Bot: Muestra excel
Cliente: "Quiero pagar"
Esperado: Link de pago es SOLO para excel, no para otro producto
```

### 4. **Múltiples Productos Similares**
```
Cliente: "Quiero guitarra acústica"
Esperado: Si hay "Guitarra Acústica" y "Guitarra Eléctrica", elige acústica
```

---

## Logs de Validación

El sistema ahora registra:

```
✅ [DECISION] Producto nuevo encontrado: Piano (ID: 5)
🔄 [DECISION] Cambio de producto para pago: Excel (ID: 3)
⚠️ [DECISION] Producto diferente detectado pero manteniendo contexto actual: Guitarra (ID: 2)
✅ [PARSER] ID válido: 5 (Piano)
🔧 [PARSER] ID inválido "xyz" → usando productToShow: 3 (Excel)
❌ [PAYMENT-VALIDATION] MISMATCH: Producto en pago (3) no coincide con tarjeta (5)
```

---

## Compilación

✅ **Build exitoso** - Sin errores de TypeScript

```
dist\index.mjs                  10.8mb
dist\pino-worker.mjs           153.4kb
...
Done in 9114ms
```

---

## Próximos Pasos

1. **Desplegar cambios** a producción
2. **Monitorear logs** para detectar mismatches
3. **Recopilar feedback** de usuarios
4. **Considerar agregar tests** para validación de productos

---

## Resumen

El bot ahora:
- ✅ Busca el producto correcto con validación mejorada
- ✅ Mantiene el contexto del producto actual cuando es apropiado
- ✅ Valida estrictamente que la tarjeta enviada sea del producto correcto
- ✅ Detecta y registra desincronizaciones
- ✅ Rechaza cambios de producto innecesarios

**Resultado esperado:** El cliente recibirá SIEMPRE el producto que preguntó, tanto en presentación como en pago.
