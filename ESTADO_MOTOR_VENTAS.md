# ESTADO DEL MOTOR DE VENTAS — Auditoría para SalesBot V2

Fecha: 2026-08-23. Fase 1 del plan V2: **auditar antes de tocar**.

Todo lo que dice "verificado" acá se comprobó leyendo el código o midiendo
producción, no asumiendo. Lo que no se pudo verificar está marcado como tal.

---

## 0. El dato que enmarca todo

Panel de producción, 10 conversaciones reales:

| Métrica | Valor |
|---|---|
| Conversaciones | 10 |
| En etapa de cierre | **0** |
| Tratos ganados | **0** |
| Conversión | **0,0 %** |

Etapas reales: `warm`, `discovery` ×4, `presentation` ×4, `details`.
Ninguna llegó a `closing`.

El problema no es que el bot cierre mal. **Es que nunca intenta cerrar.**

---

## 1. LAS CINCO CAPAS: qué existe hoy

| Capa | Estado | Evidencia |
|---|---|---|
| 1 — Comprensión | ⚠️ Parcial | `detectIntent()` es keywords (`GREETING_PATTERNS`, `PAYMENT_PATTERNS`, `OBJECTION_PATTERNS`… 8 listas en `conversation-engine.ts:141+`). El modelo recibe contexto, pero **la intención que enruta el turno la deciden las listas** |
| 2 — Memoria comercial | ❌ No existe el perfil | Se guarda la conversación (`messages`) y hay `leads`, pero **no hay `customerProfile`** persistente. El único `customerProfile` del repo vive en `hermes-ultra-prompt.ts`, que **nadie importa** |
| 3 — Estado comercial | ✅ Existe | `LeadStage` en `leadScoring.ts:49`: cold, warm, hot, qualified, negotiating, closing, converted, lost. Con scoring dinámico |
| 4 — Next Best Action | ❌ **No existe** | Cero coincidencias de `nextBestAction` / `siguienteAccion` en todo `src` |
| 5 — Ejecución por herramientas | ❌ **No existe** | Cero `tool_calls` / `function_call` en `src/lib`. El agente de ventas es **prompt puro**: no consulta stock ni pedidos, los "sabe" por el contexto que se le inyecta |

> `mcp-bridge.ts` y `architect-tools.ts` sí son herramientas, pero son de
> Atlas/Operator (el agente de marketing), **no** del agente de ventas.

---

## 2. LO QUE YA EXISTE Y FUNCIONA — no rehacerlo

Reutilizar, que es lo que pide el spec:

- **Atribución completa**: `marketing-team/attribution.ts` cruza `leads.adContext`
  con `payments`. La columna `ad_context JSONB` ya existe y `message-handler.ts`
  la copia al lead. Anuncio → lead → venta **ya se puede medir**.
- **Objeciones**: `objectionHandler.ts`, 11 tipos y 8 estrategias, conectado al
  turno vía `sales-playbook.ts`.
- **Manual de venta por turno**: `sales-playbook.ts` decide la jugada
  (cierre / aislar objeción / descubrimiento / postventa) y prohíbe inventar.
- **Detector de invenciones**: `detectarInventos()` / `quitarInventos()` valida
  la SALIDA, no solo el prompt.
- **Contexto de negocio multi-tenant**: `business-context.ts` (20 KB).
- **Fallback de proveedores**: `fallbackSystem.ts` (12 KB) + clasificación de
  fallos por forma del mensaje con cooldowns por tipo.
- **Contraentrega**: tabla `dropshipping_orders` + `CAMPOS_DE_ENVIO` +
  `abrirPedido/guardarDatos/despacharPedido` → WooCommerce con `payment_method: cod`.
- **Anti-bloqueo de WhatsApp**: espaciado 8–20 s al cambiar de destinatario,
  60 msg/h, 400/día, corte de circuito a 5 fallos → pausa 30 min.
- **Follow-up con candados**: uno por conversación y por pasada; no escribe a
  quien mandó menos de 2 mensajes.

---

## 3. LO QUE ESTÁ ROTO — verificado

### 3.1 La contradicción de la pregunta — VIVA
`conversation-engine.ts:1581` sigue diciendo:

> *"NUNCA termines con preguntas como «¿qué tipo buscas?» o «¿te interesa alguno?»"*

Mientras `sales-playbook.ts` manda hacer **una** pregunta estratégica para aislar
la objeción. El modelo recibe las dos órdenes en el mismo prompt.
`conversation-engine.ts:1796` documenta que la regla se quitó *de ahí*, pero
quedó viva en la línea 1581.

### 3.2 ~100 KB de código muerto que parece vivo
Nadie los importa. Verificado uno por uno:

| Archivo | Importado por |
|---|---|
| `hermes-ultra-prompt.ts` | **0** |
| `hermes-master-prompt.ts` | **0** |
| `sales-ai.ts` | **0** |
| `conversation-flow.ts` | **0** |
| `conversation-metrics.ts` | **0** |

⚠️ Es una trampa activa: `hermes-ultra-prompt.ts` define el `customerProfile`
con señales de compra y objeciones. Cualquiera que lo lea va a creer que el
perfil comercial existe. **No corre.**

### 3.3 Arreglado hoy, **sin desplegar** (commits `fb17d6d`, `42bbdd9`)
- `"¿cómo pago?"` no disparaba el cierre: caía en la jugada genérica y recibía
  la orden *"NO empujes el pago en el mismo mensaje"*.
- `fichaEnviada` y `productoEnFoco` llegaban al playbook y **no se leían**: por
  eso el bot mostraba la ficha y se quedaba esperando.
- `"después"` como subcadena marcaba como evasiva a quien coordinaba la entrega.
- La métrica de tiempo de respuesta del panel **nunca midió** (comparaba rol
  `"assistant"` contra el `"agent"` que se guarda) — ocultó una primera
  respuesta de **85 minutos** que costó esa venta.
- Follow-ups: 2 textos por etapa al azar → 6 por etapa derivados del teléfono.

---

## 4. LO QUE FALTA — el trabajo de V2

1. **Customer Profile persistente** (Capa 2). Hoy el cliente que vuelve en 3
   semanas arranca de cero.
2. **Next Best Action** (Capa 4). Ningún lead tiene una próxima acción.
3. **Capa de herramientas** (Capa 5). Sin esto el agente no puede consultar
   stock, pedido ni pago: solo puede afirmar lo que le inyectaron.
4. **Abandono y recuperación**. No existe `ABANDONED_CHECKOUT`.
5. **Embudo y métricas comerciales**. El panel mide mensajes, no dinero.
6. **Handoff con contexto**. Hoy transfiere sin el resumen comercial.
7. **Tests de negocio end-to-end** (los 30 casos del spec).

**No verificado todavía** (queda para la fase que lo toque): manejo de audios e
imágenes, consulta de stock real, tracking de envíos.

---

## 5. PLAN POR FASES — ordenado por dinero recuperado ÷ riesgo

Cada fase termina en: **build + test + verificación en conversación real.**

| # | Fase | Por qué va acá | Riesgo |
|---|---|---|---|
| **0** | Desplegar y verificar lo ya arreglado | Son las causas medidas de las ventas perdidas. Verificar con `"¿cómo pago?"` en WhatsApp y con el tiempo de respuesta del panel dejando de decir 0s | Bajo |
| **1** | Quitar la contradicción (`1581`) y borrar los 5 módulos muertos | Una línea y un `rm`. Elimina órdenes que se pelean dentro del mismo prompt y la trampa del `customerProfile` fantasma | Muy bajo |
| **2** | Customer Profile persistente | Base de todo lo demás. Tabla + carga en `loadConversationMemory` + volcado al playbook | Medio |
| **3** | Next Best Action | Con el perfil ya cargado, es la decisión explícita del turno. Reemplaza "¿qué respondo?" por "¿qué avanzo?" | Medio |
| **4** | Abandono y recuperación | Cada lead pago que se cae hoy se pierde entero. Se apoya en el estado del perfil | Medio |
| **5** | Capa de herramientas real | El cambio más grande: pasar de prompt a function-calling para stock/pedido/pago | **Alto** |
| **6** | Intención con IA + contexto | Sustituir las 8 listas de keywords por decisión con historial y producto en foco. Va después de tener perfil y NBA, que son sus insumos | Alto |
| **7** | Embudo y métricas de dinero | Medir dónde se pierde: impresiones → clics → leads → checkout → pagado | Bajo |
| **8** | Handoff con resumen comercial | Barato una vez que existen perfil y NBA | Bajo |
| **9** | Los 30 casos de prueba del spec | Cierra el ciclo y protege todo lo anterior | Bajo |

### Por qué este orden y no el del spec
El spec pone "eliminar contradicciones" en Fase 2 y las herramientas en Fase 8.
Coincide casi todo. Dos cambios deliberados:

- **Se antepone desplegar lo ya arreglado** (Fase 0). Está hecho, probado y
  parado; no tiene sentido construir encima sin cobrarlo.
- **La intención con IA se mueve DESPUÉS del perfil y la NBA.** El spec la pone
  en Fase 6, antes de NBA. Pero la decisión de intención necesita como insumo el
  estado del lead y el producto en foco: hacerla antes obliga a rehacerla.

---

## 6. Criterio de éxito

No es que compile. Es esto, medido sobre las mismas 10 conversaciones:

- ¿Cuántas llegan a `closing`? Hoy: **0**.
- ¿Cuántos leads pagos se pierden sin próxima acción? Hoy: **todos**.
- ¿Se puede decir cuánto dinero produjo cada anuncio? La atribución existe,
  pero nadie la está mirando.
