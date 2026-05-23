# ⚡ ANÁLISIS DE LATENCIA Y PERFORMANCE

## 🔴 Problema Identificado

El bot se está demorando más de lo normal en responder. He identificado **7 cuellos de botella** principales.

---

## 📊 Cuellos de Botella Identificados

### 1. ❌ Carga de Productos Completa (CRÍTICO)

**Ubicación:** `agent.ts` línea ~570
```typescript
const productList = await db.select().from(products).where(eq(products.isActive, true));
```

**Problema:**
- Carga **TODOS** los 86 productos en CADA respuesta
- Cada producto tiene: id, name, description, price, features, images, etc.
- Se envía todo al prompt de la IA (aumenta tamaño del prompt)
- Operación de BD lenta si hay muchos productos

**Impacto:** 
- ⏱️ +500-1000ms por respuesta
- 📦 Aumenta tamaño del prompt en 50-100KB

**Solución:**
```typescript
// ❌ ACTUAL (lento)
const productList = await db.select().from(products).where(eq(products.isActive, true));

// ✅ OPTIMIZADO (rápido)
// Solo cargar productos si es necesario (product_query, payment_intent)
let productList = [];
if (["product_query", "payment_intent", "confirmation"].includes(decision.intent)) {
  productList = await db.select().from(products)
    .where(eq(products.isActive, true))
    .limit(50); // Limitar a 50 productos más recientes
}
```

---

### 2. ❌ Construcción de Catálogo Completo (CRÍTICO)

**Ubicación:** `agent.ts` línea ~600
```typescript
const productsBlock = productList.map(p => {
  const features = (p.features as string[]) || [];
  return `[PRODUCTO ID: ${p.id}] ${p.name} | Precio: ${formatPrice(...)} | ${p.description}...`;
}).join("\n");
```

**Problema:**
- Construye string de **50-100KB** con TODOS los productos
- Se envía al prompt de la IA en CADA respuesta
- Aumenta tokens consumidos (costo + latencia)
- La IA no necesita ver todos los productos

**Impacto:**
- ⏱️ +200-500ms por respuesta
- 💰 Aumenta tokens consumidos en 30-50%

**Solución:**
```typescript
// ❌ ACTUAL (lento)
const productsBlock = productList.map(p => {
  const features = (p.features as string[]) || [];
  return `[PRODUCTO ID: ${p.id}] ${p.name} | Precio: ${formatPrice(...)} | ${p.description}...`;
}).join("\n");

// ✅ OPTIMIZADO (rápido)
// Solo incluir productos relevantes
let productsBlock = "";
if (decision.productToShow) {
  // Si hay producto en contexto, solo mostrar ese
  const p = decision.productToShow;
  productsBlock = `[PRODUCTO ID: ${p.id}] ${p.name} | Precio: ${formatPrice(...)} | ${p.description}`;
} else if (["product_query", "payment_intent"].includes(decision.intent)) {
  // Si es búsqueda, mostrar solo top 5 productos relevantes
  const topProducts = productList.slice(0, 5);
  productsBlock = topProducts.map(p => {
    const features = (p.features as string[]) || [];
    return `[PRODUCTO ID: ${p.id}] ${p.name} | Precio: ${formatPrice(...)}`;
  }).join("\n");
} else {
  // Para otros intents, no incluir catálogo
  productsBlock = "[Catálogo disponible bajo demanda]";
}
```

---

### 3. ❌ Prompt Demasiado Grande (CRÍTICO)

**Ubicación:** `agent.ts` línea ~650-700
```typescript
const systemPrompt = `Eres **${voice.agentName}**...
[CATÁLOGO COMPLETO DE 86 PRODUCTOS]
[INSTRUCCIONES LARGAS]
[CONTEXTO COMPLETO]
...`;
```

**Problema:**
- Prompt base: ~5-10KB
- Catálogo: ~50-100KB
- Contexto: ~5-10KB
- **Total: 60-120KB por respuesta**
- Aumenta latencia de la IA en 30-50%

**Impacto:**
- ⏱️ +1000-2000ms por respuesta
- 💰 Aumenta tokens consumidos en 50-100%

**Solución:**
```typescript
// ❌ ACTUAL (lento)
const systemPrompt = `Eres **${voice.agentName}**...
[CATÁLOGO COMPLETO]
[INSTRUCCIONES LARGAS]
...`;

// ✅ OPTIMIZADO (rápido)
const systemPrompt = `Eres **${voice.agentName}**, ${voice.agentRole}.
[INSTRUCCIONES CRÍTICAS SOLO]
[PRODUCTO EN CONTEXTO SI APLICA]
[SIN CATÁLOGO COMPLETO]`;
```

---

### 4. ❌ Carga de Categorías Innecesaria

**Ubicación:** `agent.ts` línea ~575
```typescript
const allCategories = await db.select().from(productCategories);
const categoryMap = new Map(allCategories.map(c => [c.id, c.name.toLowerCase()]));
```

**Problema:**
- Carga categorías en CADA respuesta
- Se usa solo en `computeDecision()` para búsqueda
- Operación de BD innecesaria si no es product_query

**Impacto:**
- ⏱️ +100-200ms por respuesta

**Solución:**
```typescript
// ❌ ACTUAL (lento)
const allCategories = await db.select().from(productCategories);
const categoryMap = new Map(allCategories.map(c => [c.id, c.name.toLowerCase()]));

// ✅ OPTIMIZADO (rápido)
let categoryMap = new Map();
if (["product_query", "payment_intent"].includes(decision.intent)) {
  const allCategories = await db.select().from(productCategories);
  categoryMap = new Map(allCategories.map(c => [c.id, c.name.toLowerCase()]));
}
```

---

### 5. ❌ Historial de Chat Completo

**Ubicación:** `agent.ts` línea ~750
```typescript
const chatHistory = buildChatHistory(memory, 5); // últimos 5 mensajes
```

**Problema:**
- Incluye últimos 5 mensajes en CADA respuesta
- Cada mensaje puede tener 500-1000 caracteres
- Total: 2500-5000 caracteres adicionales
- Aumenta tokens consumidos

**Impacto:**
- ⏱️ +200-300ms por respuesta
- 💰 Aumenta tokens consumidos en 10-20%

**Solución:**
```typescript
// ❌ ACTUAL (lento)
const chatHistory = buildChatHistory(memory, 5); // últimos 5 mensajes

// ✅ OPTIMIZADO (rápido)
// Solo incluir últimos 2-3 mensajes para contexto
const chatHistory = buildChatHistory(memory, 2); // últimos 2 mensajes
```

---

### 6. ❌ Rotación de Proveedores Lenta

**Ubicación:** `agent.ts` línea ~800-900
```typescript
// Fase 1: Cola inicial con orden optimizado
const rotationQueue: { config: any; source: string }[] = [];
// ... construir cola con 20+ proveedores ...

// Fase 2: Si proveedor seleccionado falló → rotación inteligente
if (!raw && isUserSelected) {
  // ... intentar fallbacks ...
}

// Fase 3: G4F como último respaldo
if (!raw) {
  // ... intentar G4F ...
}
```

**Problema:**
- Intenta múltiples proveedores secuencialmente
- Cada intento tiene timeout de 30-60 segundos
- Si el proveedor principal falla, espera 30-60 segundos antes de intentar siguiente
- Puede tomar 2-3 minutos si hay múltiples fallos

**Impacto:**
- ⏱️ +30-180 segundos si hay fallos
- 🔴 **ESTE ES EL PROBLEMA PRINCIPAL**

**Solución:**
```typescript
// ❌ ACTUAL (lento)
// Intenta proveedores secuencialmente con timeouts largos
const timeout = getProviderTimeout(providerName); // 30-60 segundos
const completion = await client.chat.completions.create({...});

// ✅ OPTIMIZADO (rápido)
// Usar timeouts más cortos y fallback más rápido
const timeout = 15000; // 15 segundos máximo
const completion = await Promise.race([
  client.chat.completions.create({...}),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error("Timeout")), timeout)
  )
]);
```

---

### 7. ❌ Análisis de Contexto Completo

**Ubicación:** `agent.ts` línea ~650
```typescript
const engineContextBlock = `${decision.contextBlock}\n\n${AdvancedIntelligence.generateIntelligentContext(...)}`;
```

**Problema:**
- Genera contexto inteligente completo en CADA respuesta
- Analiza historial completo
- Genera múltiples bloques de contexto
- Aumenta tamaño del prompt

**Impacto:**
- ⏱️ +100-200ms por respuesta

**Solución:**
```typescript
// ❌ ACTUAL (lento)
const engineContextBlock = `${decision.contextBlock}\n\n${AdvancedIntelligence.generateIntelligentContext(...)}`;

// ✅ OPTIMIZADO (rápido)
// Solo generar contexto si es necesario
let engineContextBlock = decision.contextBlock;
if (["ai_objection_handle", "ai_general_response"].includes(brain.strategy)) {
  engineContextBlock += `\n\n${AdvancedIntelligence.generateIntelligentContext(...)}`;
}
```

---

## 🎯 Resumen de Optimizaciones

| Cuello de Botella | Impacto Actual | Optimización | Mejora |
|------------------|----------------|-------------|--------|
| Carga de productos | +500-1000ms | Cargar solo si necesario | -500-1000ms |
| Catálogo completo | +200-500ms | Solo productos relevantes | -200-500ms |
| Prompt grande | +1000-2000ms | Reducir tamaño | -1000-2000ms |
| Categorías | +100-200ms | Cargar solo si necesario | -100-200ms |
| Historial chat | +200-300ms | Últimos 2 mensajes | -100-150ms |
| Rotación proveedores | +30-180s | Timeouts más cortos | -20-120s |
| Contexto completo | +100-200ms | Contexto selectivo | -50-100ms |
| **TOTAL** | **+2130-4380ms** | **Optimizaciones** | **-2070-4070ms** |

---

## 🚀 Plan de Optimización

### Fase 1: Optimizaciones Críticas (Implementar AHORA)

1. **Reducir carga de productos**
   - Cargar solo si intent es product_query, payment_intent, confirmation
   - Limitar a 50 productos máximo

2. **Reducir catálogo en prompt**
   - Solo incluir producto en contexto
   - No incluir catálogo completo

3. **Reducir timeouts de proveedores**
   - Cambiar de 30-60 segundos a 15 segundos
   - Fallback más rápido

### Fase 2: Optimizaciones Secundarias (Implementar después)

4. **Cargar categorías solo si necesario**
5. **Reducir historial de chat a 2 mensajes**
6. **Contexto selectivo según estrategia**

---

## 📝 Implementación

Voy a crear un archivo de optimizaciones que puedas aplicar inmediatamente.

