# Auditoría Profunda — Agente de Anuncios VentasPro
### De “generador de borradores” a Agencia Profesional 2026

**Fecha:** 2026-10-12 · **Rama:** `arena/b3cae597` · **Commit base:** `3887577`  
**Objetivo pedido:** Agente que *investigue a fondo cada producto*, *analice lo que convierte hoy* y *cree anuncios (imagen + video + copy) que realmente vendan* — a nivel vanguardia 2025-26, conectado a Meta / IG / WhatsApp ya existente.

---

## 0. Resumen en 60 segundos

Tienes **3 motores de anuncios que no saben que son el mismo**:

| Motor | Qué hace | Problema |
|---|---|---|
| **AdStrategist** `lib/ad-strategist.ts` (1464 líneas) | Plantilla por nicho (12 nichos: diseño, programación, marketing, fitness, idiomas…). Genera `primaryText/headline/description` + `DraftAd` y opcional `imageUrl` vía `ai-product-image`. | Copy por categoría, no por producto. El hook es fijo del nicho (“Pack completo de diseño…”), el `researchNote` solo re-escribe el ángulo si hubo investigación previa. |
| **Marketing Team** `lib/marketing-team/` (14 agentes) | Flujo “agencia”: `MarketResearcher → Audience → Offer → CreativeDirector → Copywriter → Strategist → BudgetGuard → MetaAdsManager`. Bien orquestado, con `risk-engine` y `audit`. | Cada agente funciona, pero el **fallback determinístico es genérico** (`buildResearchFallback`, `buildCopyFallback` con “✅ Beneficio claro”). Si la IA falla o no hay tensión, sale copy pobre y nadie lo nota. La creatividad son hooks de texto, no imágenes/videos reales para Meta. |
| **Motor de Video propio** `lib/video-anuncio.ts` (1080×1920, Edge TTS es-CO, Pexels + ffmpeg) | Guion 5-6 escenas → Chromium → Ken Burns → MP4 H.264 con voz. Cero costo. | Es un *template compositor*, no un *generador creativo*: no sigue tendencias UGC 2026, sin subtítulos quemados, sin variantes A/B, sin feedback de performance. |

**Resultado hoy:** puedes crear un borrador que *no inventa datos* (validador `anuncio-rubrica.ts` + `PROMESAS/RESULTADOS/ENTREGABLES` bien hecho) y subirlo en pausa a Meta con `fb_create_ad`, pero **no es profesional**: no investiga a fondo el producto, no analiza creativos ganadores de la cuenta, no genera imagen de anuncio (solo foto de producto), y el video es “presentación corporativa” no UGC nativo 2026.

**Brecha vs. Agencia Pro 2026:** falta el **loop Research → Insights → Copy → Creatives (imagen+video) → Test → Learn** con 4 motores especializados conectados. Abajo está el diseño para cerrarlo.

---

## 1. Radiografía — Qué hay y cómo funciona hoy

### 1.1 `AdStrategist` — el generador que más usas

```
WINNING_STRATEGIES_BY_NICHE (12)
  └─ getStrategyForProduct(product) → AdStrategy {hook, angle, budget, interests, imagePrompt}
  └─ generateAdCopy(strategy, product, grounded?) → {primaryText, headline, description, strategy}
       ├─ sinMarkdown() — quita **markdown** (fijo 2026-08-14)
       ├─ planDeAnuncio() de anuncio-por-modelo.ts — AIDA adaptado por modelo (digital/fisico/servicio)
       └─ grounded hook si viene de investigación (research_result)
  └─ createDraftAd() → DraftAd (facebook_drafts) → si generateProductImage → imageUrl
  └─ createDraftsForAllProducts()
```

**Fuerzas:**
- Protege TENANT: `credencialesFb()` no hereda `FB_*` env si no es dueño del servidor → no gastas la cuenta del dueño por error.
- Guardrails: `guardPresupuesto()` + `canSpendToday()` antes de subir.
- Limpia markdown, respeta `LIMITES_META` (headline 40, description 30), y guarda la estrategia corregida (no la plantilla original).
- Filtro por `kind=physical` y `modelo=servicio/cotización` primero → no ofrece FL Studio a un piano.

**Debilidades críticas para “pro”:**
- `WINNING_STRATEGIES` son **textos fijos del nicho**. Un “Curso de Piano” y un “Pack de Photoshop” ambos caen en “Diseño gráfico” si comparten palabra “diseño”. El hook no viene del producto ni del mercado.
- `generateProductImage()` genera **foto de producto** (estudio, fondo blanco), no **creativo de anuncio** (4:5 con gancho 3-5 palabras + precio + zona segura 250px). `imagePrompt` del nicho es genérico (“Collage of graphic design works…”).
- Sin `research_result` → copy 100% plantilla + `planDeAnuncio`. Con research → solo cambia el gancho, no los ángulos, la oferta ni la estructura.

### 1.2 `anuncio-por-modelo.ts` — el mejor módulo del repo

Es un **brief-based planner** (no generador): `construirBrief()` entrega al modelo qué PUEDE y qué NO puede afirmar (derivado de `respaldoDe(product)` + `condicionesDelNegocio`), 3 ángulos distintos (Problema / Beneficio / Curiosidad), nivel de consciencia, CTA y enlace. `planDeAnuncio()` arma `primaryText` (gancho + puntosReales + oferta + lineaDeAccion) con:
- `precioTexto` + `precioCorto`, `recortarAPalabra`, `titularDelProducto` (normaliza MAYÚSCULAS gritadas)
- `puntosReales()` extrae 3 beneficios reales con emoji del catálogo (no ✅ repetido)
- Oferta real de `business-context` (envío, pago contraentrega)
- `destinoDeObjetivo()` (mensajes=whatsapp, resto=web) y `conLineaDeAccion()` que arregla bug 07-10 donde texto decía WhatsApp y botón iba a landing.
- `marrasSinRespaldo()` detecta marcas inventadas (ChatGPT, Midjourney…) por patrón `minúscula+Mayúscula / dígito / ·.` — muy fino.

**Es lo que un pro haría: no inventar.** Pero es *lógica determinística*; la chispa creativa sigue siendo del LLM que recibe el brief.

### 1.3 `marketing-team/` — la agencia de 14 especialistas

```
MarketResearcher → AudienceStrategist → OfferStrategist → CreativeDirector → Copywriter → MarketingStrategist
         ↓                 ↓                    ↓                ↓                 ↓                  ↓
   problema/deseo   prospecting/lookalike  margen+embudo   3-5 conceptos   4 variantes copy   plan + presupuesto
         └─────────────── MarketingMemory (aprendizajes) ──────────────────┘
         └─────────────── Orchestrator (runFullCycle / runDiagnostic) ───────┘
MetaAdsManager / BudgetGuard / RiskEngine / Attribution / Audit
   └─ risk-engine.ts: LOW (read/generación) → MEDIUM (create_draft/pause) → HIGH (change_budget) → CRITICAL (billing/delete)
   └─ budget-guard.ts: maxDailySpend 50k COP, maxBudgetChange 25%, maxScale 30%, freno de margen (CPA objetivo = ticket×margen, mata si CPA >1.25× con ≥3 ventas)
   └─ ai.ts callMarketingAI: rota tenant keys → Ollama → DeepSeek/Mistral/OpenAI → gratis (zen/groq/github) con tryParseJson robusto.
```

**Fuerzas:**
- Arquitectura por handoffs tipados (`AgentHandoff<T>`), tareas en `marketingTasks`, auditoría, `approvalRequired` configurable.
- `expreso-en-anuncios.ts` (`datosExpertosParaAnuncio`) junta benchmarks reales (radiografía de campaña + métricas 30d), referencias del rubro (digital/fisico CPM/CTR/CPC/CPA), specs creativas (4:5 vs 9:16, safe zones), `metasYReglas()` y `loQueDebeDecir()` — es lo que pediste (“que sepa del tema”).

**Debilidades para pro:**
- **Copy fallback pobre:** `copywriter.ts:buildCopyFallback` → `“✅ Beneficio claro y directo\n✅ Entrega inmediata”` — si la IA falla, el admin ve eso y cree que el agente es malo.
- **CreativeDirector no produce creativos:** da `IdeaVisual: “Visual limpio centrado en producto con beneficio como texto”` — no genera imagen ni prompt para Flux/MJ ni estructura para video UGC.
- **MarketResearcher no investiga:** `buildResearchFallback` → frases templadas `“Sin {name}, el cliente sigue perdiendo tiempo…”` — no lee `fb_ad_library`, ni scrapea producto competidor, ni lee reviews.
- **MetaAdsManager solo hace draft/pause/budget** — no crea creativo con `asset_feed_spec`, no sube video, no hace Advantage+ ni broad testing 2026.

### 1.4 Imagen — `ai-product-image.ts` + `generate_image` tool

- `generateProductImage(product)` → 2 prompts `buildPrompt(product,0/1)` → `generateOneImage` (cadena Pollinations → Ollama vision → DALL·E → G4F) → `judgeBestCandidate` (visión) → `saveProductImage` en `IMAGE_STORE_DIR/products/{id}.jpg` (+ variantes `generateProductImageVariants` para `asset_feed_spec`).
- Seeds fijas por productId → reproducibilidad.

**GAP:** `buildPrompt` es `“Professional product photo of {name}, studio lighting…”` — no es un *ad creative prompt* (hook en grande, precio, CTA, 4:5, brand colors, persona en uso). La herramienta `generate_image` (Atlas) usa Ollama → DALL·E → Pollinations, pero sin dirección creativa ni validación de texto en imagen.

### 1.5 Video — `video-anuncio.ts`

Pipeline serio y barato:
```
escribirGuion(product, ficha, modelo, copies) → redactarConProveedores (gratis primero, 40s)
  ↓ SYSTEM_GUION (5-6 escenas 18-28s, es-CO, JSON escenas)
guionDeRespaldo() si falla
  ↓ brollDePexels(búsqueda en inglés) si hay PEXELS_API_KEY
componer escenas en Chromium (foto producto + precio + CTA, tipografía marca)
  ↓ ffmpeg: Ken Burns + transiciones 0.4s + Edge TTS es-CO voz mezcla
  → /videos/anuncios/{id}-{ts}.mp4 (H.264) + metadata videoAnuncio
```

**Fuerzas:** 0 costo marginal, voz colombiana natural, estructura 6 escenas (problema→solución→resultado→beneficio→precio/CTA).

**GAP vs vanguardia 2026:**
- No es UGC: es slideshow con Ken Burns. 2026 premia *celular en mano, persona real, subtítulos quemados (80% ve sin sonido), cortes cada 1.5s, hook en 0-2s*.
- Sin generación con Sora/Runway/Pika o HeyGen avatar — no hay movimiento real del producto en uso.
- Búsqueda Pexels `query` en inglés libre — sin curaduría, a veces clip genérico (“person problem lifestyle”).
- Sin variantes (hook A vs B vs C) para testear.

### 1.6 Copy — `publicidad-persuasiva.ts` + `formato-copy`

Bien: 4 inventos bloqueados (`unidades/cupos`, `oferta fecha`, `miles de clientes`, `% de gente`), `FORMATO_COPY` (gancho 40 chars, 125 chars corte “ver más”, 70-130 palabras, bloques con línea en blanco, emoji semántico no repetido), ejemplo ✅ con cada punto con su emoji del catálogo.

**GAP:** falta arsenal 2026: hooks tipo *“POV: …”*, *“El error que todos cometen…”*, *“Dejé de… y ahora…”*, *“3 señales de que…”*, testimonial UGC, pattern-interrupt, open loop.

### 1.7 Conexiones ya existentes (lo que NO hay que rehacer)

- **Meta Graph `FB_GRAPH_BASE`**, `FacebookService.listActiveCampaigns()`, `getCampaignMetrics()`, `radiografiaDeCampana()`, `createAd()` (`fb_create_ad` con `dailyBudget`, `objetivo`, `destinoWeb landing|tienda`, `budget guard`), `fb_status`, `fb_ad_library` (scrape Chromium — 403 sin navegador), `catalogo-objetivos-meta` (ventas OUTCOME_SALES / tráfico / mensajes OUTCOME_ENGAGEMENT CONVERSATIONS / formulario OUTCOME_LEADS), ciudad/edad/género/intereses.
- **IG:** vía misma página (Instagram vinculado a la página, check en `fb_status`), pauta con `instagram_basic` + `content_publish` roadmap.
- **WhatsApp:** `app-operator` habla con `whatsapp-brain.ts` + `motor-nuevo`, y `destino.tipo=whatsapp` con `numero` para click-to-chat.

**Conclusión parcial:** la plomería para gastar plata real existe y está protegida (multi-tenant, guardrails, validación). Lo que falta es el *cerebro creativo* que la alimente.

---

## 2. Qué exige una Agencia Pro en 2026 (estándar que no estás cumpliendo)

Investigado contra tu propio `estandar-que-funciona.ts` (CTR 2-3.5% bueno, CPC $700, CPA conversación <$0.25) + benchmarks agencias LATAM + Meta Advantage+ 2025-26:

| Pilar | Estándar 2026 | Estado actual |
|---|---|---|
| **Research profundo** | Scrape del producto + 3 competidores + 20-30 ads de Biblioteca (multi-idioma), síntesis de ángulos, objeciones, lenguaje del mercado. | `fb_ad_library` solo si el admin lo pide; `referencias-de-mercado.ts` ya hace multi-idioma (es+en) y `unirReferencias` por frecuencia, pero **no está cableado** al flujo de creación de anuncio. `MarketResearcher` no lo usa. |
| **Copy que convierte** | 6-9 hooks distintos por producto (PAS, AIDA, Before/After, Error común, Curiosidad, Founder), primaryText 125 chars hook probado, headline 40, CTA nativo, variantes A/B reales, no templated. | 12 nichos fijos + `planDeAnuncio` determinístico (3 puntos). Bueno para no mentir, pobre para convertir. |
| **Creativo imagen pro** | 4:5 y 1:1, zona segura 1080×1350, 3-5 palabras gancho en imagen (no texto largo), producto EN USO + persona con emoción, brand palette, asset_feed_spec con 3-5 variantes para que Meta optimice. | Solo foto producto 1:1. No hay prompt de anuncio, ni zona segura, ni feed_spec multi-imagen conectado a creación. |
| **Video que vende** | UGC 9:16, 15-25s, hook 0-3s, cortes rápidos, subtítulos quemados, demo real, prueba social, CTA. 3 variantes por producto. Costo marginal con IA (Sora/Runway/HeyGen) o compositor propio mejorado. | Template 6 escenas con Pexels genérico. Sin subtítulos, sin UGC, sin variantes. |
| **Estrategia & testing** | Broad + Advantage+, 2-3 ad sets (intereses vs broad vs LAL), presupuesto por aprendizaje (min 50 conversiones/semana por ad set), reglas: <1% CTR con 1000 imp → cambiar gancho; CPA >1.25× objetivo con 3 ventas → matar. | `Experto` y `metasYReglas` lo describen, pero `campana-un-clic` solo hace 1 campaña. No hay testing estructurado. |
| **Aprendizaje continuo** | `marketing-memory` guarda qué gancho/creativo convirtió y reinyecta en próximo brief. | `marketing-memory.ts` existe, pero nadie lo lee para armar el siguiente anuncio (se guarda `Plan generado` como texto). Sin feedback loop. |

---

## 3. Diseño propuesto — Agente Profesional de Anuncios (APA 2026)

### 3.1 Principio

> **Nada inventado, todo investigado. 3 creativos por producto, no 1. Video e imagen como primeras ciudadanas, no como adjunto. Y cada anuncio aprende del anterior.**

Un solo orquestador `lib/agencia/pro/` que reemplaza el uso disperso de `AdStrategist` + `campana-un-clic` + `video-anuncio` suelto. Reusa todo lo bueno (`planDeAnuncio`, `validarContenidoAnuncio`, `datosExpertosParaAnuncio`, `budget-guard`, `facebook.ts`) y añade 4 motores nuevos.

### 3.2 Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│  APA ORCHESTRATOR  `agencia/agente-anuncios-pro.ts`     │
│  Input: productId (+ objetivo, destinoWeb, dailyBudget) │
│  Output: Pack de 3 anuncios listos para Meta (draftIds) │
└──────────────┬──────────────────────────────────────────┘
               │
   ┌───────────┼───────────┬──────────────┬───────────────┐
   ▼           ▼           ▼              ▼               ▼
┌────────┐ ┌────────┐ ┌──────────┐  ┌──────────┐   ┌──────────┐
│RESEARCH│ │ COPY   │ │ CREATIVE │  │  VIDEO   │   │ VALIDATE │
│ DEEP   │ │  PRO   │ │ STUDIO   │  │ FACTORY  │   │ & SCORE  │
└────────┘ └────────┘ └──────────┘  └──────────┘   └──────────┘
   │           │           │              │               │
   └───────────┴───────────┴──────────────┴───────────────┘
               │  pack validado + guardrails + uploadReady
               ▼
        ┌──────────────┐
        │ META UPLOAD  │  facebook.ts + asset_feed_spec (3 imgs + 1 vid)
        │ BudgetGuard  │  Pausa por aprobación, no auto-activado
        └──────────────┘
               │
        ┌──────┴──────┐
        │  LEARNING   │  marketing-memory + performance feedback 48h
        └─────────────┘
```

### 3.3 Motores (qué haría cada uno — con referencia a lo que ya tienes)

#### A) Research Deep  `research-deep.ts` (nuevo, sobre `referencias-de-mercado.ts`)

*Ya tienes:* `buscarReferenciasDeMercado()` (es+en, dedup por `claveDeAnuncio`, orden por frecuencia), `fb_ad_library`, `activos-fabricante` (scrape AliExpress).

*Añade:*
- **Ficha profunda del producto:** lee `products` (name, description, features, precio, fotos, metadata) + `product_knowledge` + `business-context` (país, pago, envío) → arma “hechos duros”.
- **Biblioteca multi-idioma auto:** llama `buscarReferenciasDeMercado({consulta: product.name, pais: CO, idiomas:[en], limite:8})` sin que el admin lo pida. Si falla, sigue con hechos duros (no bloquea).
- **Síntesis con IA (no templated):** prompt que devuelve `{angulos:[{gancho, porQue, objecionQueResuelve, lenguaje}], objeciones:[], pruebasSociales:[]}` — usado como `grounded` para copy.
- Guarda en `products.metadata.referencias` + `architect_memory` (`research_result`) para que `planDeAnuncio` y `Creative Studio` lo reutilicen.

#### B) Copy Pro  `copy-pro.ts` (evolución de `copywriter.ts` + `anuncio-por-modelo.ts`)

*Reusa:* `construirBrief()` + `planDeAnuncio()` como guardrail anti-invención, `FORMATO_COPY` (gancho 40, corte 125, 70-130 palabras, bloques con línea en blanco).

*Añade:*
- **9 hooks de vanguardia** (no 3): `Problema / Beneficio / Curiosidad / Error común / Antes→Después / Testimonio UGC / “POV:” / 3 Señales / Founder` — cada variante con **ángulo distinto de verdad**, no sinónimo.
- **Copy Framework correcto por modelo:** digital → transformación + acceso inmediato; físico → utilidad + envío + pago contraentrega (ya lo hace `lineaDeAccion`, pero ahora con variantes).
- **Generación con z-model + validación:** llama `callMarketingAI` con `systemPrompt` que incluye `datosExpertosParaAnuncio` (benchmarks reales + referencia del rubro + tono del país) + brief → valida con `afirmacionesSinRespaldo()` + `marcasSinRespaldo()` + `revisarFormato()` → si falla, re-intenta con feedback (“quitaste la garantía porque no está en ficha”).
- **Salida:** 3 `CopyVariant` completos (`primaryText` 8-12 líneas con emoji del catálogo, `headline` ≤40, `description` precio+acceso/envío, `cta` adaptado a destino) — cada uno con `gancho` + `porQuePuedeFuncionar` explicado (no “porque sí”).

#### C) Creative Studio  `creative-studio.ts` (nuevo, sobre `ai-product-image.ts`)

*Reusa:* `generateProductImageVariants` (cadena Pollinations→DALL·E, judge visión, save a volumen).

*Añade:*
- **Prompt de anuncio, no de catálogo:** `buildAdCreativePrompt(product, concepto)` → `“4:5 ad creative for {name}, {ideaVisual}, hook text ‘{ganchoCorto 3-5 palabras}’ in top 1/3, product in use by real person, brand color {brandColors}, clean background, high contrast, safe zone top/bottom 250px, no small text”`. Usa `brand-voice` + `fotosDelProducto`.
- **Asset feed spec para Meta:** 3 imágenes por variante (A: producto en uso + hook, B: detalle + beneficios en iconos, C: UGC selfie con producto) en 4:5 y 1:1. Nombres `{id}-ad-{angle}-{r}.jpg` en `IMAGE_STORE_DIR/creatives/`.
- **Judge con rubrica creativa:** no solo “¿corresponde al producto?” sino “¿se lee el gancho en 0.5s? ¿hay cara con emoción? ¿respeta zona segura?”
- **Fallo elegante:** si no hay proveedor de imagen → usa foto real del producto con overlay tipográfico en Chromium (como hace video), nunca placeholder gris.

#### D) Video Factory  `video-factory-pro.ts` (evolución de `video-anuncio.ts`)

*Mantén* tu pipeline de 0 costo como fallback, pero añade capa pro:

- **Guion UGC 2026:** `SYSTEM_GUION_PRO` → 6 escenas pero con lenguaje `POV`, `hook 0-2s` en pantalla grande + locución, `subtítulos quemados` (SRT → ffmpeg `subtitles` filter, 80% ve sin sonido), `corte cada 1.5-2s`, `demo manos en producto`, `prueba social` (no inventada → si hay foto UGC del producto en uso, la usa; si no, b-roll Pexels curado por `toma` en inglés).
- **3 guiones por producto** (uno por ángulo de Copy Pro) → eliges el que mejor testee.
- **Integración proveedores opcionales:** si hay `RUNWAY_API_KEY` / `SORA_API_KEY` / `HEYGEN_API_KEY` en `ai-keys-tenant`, genera B-roll con prompt `toma` en vez de Pexels; si no, Pexels curado (no “person problem lifestyle” genérico sino `toma` específica: `“woman struggling to correct posture at desk, close-up”`).
- **Subtítulos + música:** `Edge TTS es-CO` + `ffmpeg -vf subtitles` + ducking música royalty-free (opcional).
- Misma salida `/videos/anuncios/{id}-{ts}.mp4` con `metadata.videoAnuncioGuiones[]` para auditoría.

#### E) Validate & Score  `validate-score.ts` (sobre `anuncio-rubrica.ts`)

- Pasa **todo** por `afirmacionesSinRespaldo` + `marcasSinRespaldo` + `revisarFormato` + `puntuarCopy` (si existe) + `INVENTOS` de `publicidad-persuasiva.ts`. Score 0-100; <70 → no se guarda borrador, se devuelve feedback al Copy Pro para re-escribir (máx 2 reintentos).
- Guarda score en `facebook_drafts.metadata.score`.

#### F) Orquestador  `agente-anuncios-pro.ts`

```ts
export async function crearPackPro(tenantId, {productId, objetivo, destinoWeb, dailyBudget}) {
  const research = await researchDeep(tenantId, productId); // no bloquea
  const expertos = await datosExpertosParaAnuncio({tenantId, productId, fb}); // benchmarks reales
  const copies   = await copyPro(tenantId, product, research, expertos); // 3 variantes
  const creatives = await Promise.all(copies.map(c => creativeStudio(product, c)));
  const videos    = await Promise.all(copies.map(c => videoFactoryPro(product, c)));
  const validados = await validateScore(copies, creatives, videos);
  const drafts = await guardarBorradores(validados); // facebook_drafts + metadata packId
  // Upload opcional: solo si admin pide “subirAMeta” → asset_feed_spec con 3 imgs + 1 vid, EN PAUSA
  return { packId, drafts, researchResumen, copies, creatives, videos };
}
```

Expuesto como:
- **Tool Atlas:** `crear_pack_pro {producto, objetivo, destinoWeb, dailyBudget, subirAMeta?}` (agrupado con `validarContenidoAnuncio` y `experto`).
- **Ruta panel un clic:** `POST /api/marketing/pack-pro` (usa mismo orquestador, no duplica).
- **Compatibilidad:** deja vivos `fb_ad_draft` y `campana-un-clic` como legacy durante migración; el nuevo es el path recomendado.

### 3.4 Conexión con lo que ya tienes (no se reescribe)

- **Meta:** `FacebookService.createAd({productId, images:[3], video, primaryText, headline, objective:OBJETIVOS[objetivo].metaObjective, optimizationGoal})` — reusa `facebook.ts`, no crea Graph nuevo. `BudgetGuard` y `RiskEngine` antes de cualquier gasto.
- **IG:** mismo ad set con `instagram` placement si `plantillaDesdeCampana` lo indica (ya existe).
- **WhatsApp:** `destino=whatsapp` → `CONVERSATIONS` optimization + `numero` de `business-context`; el mensaje pre-escrito viene de `Copy Pro` y el bot lo retoma con producto del anuncio (ya hace `“¿Seguimos con X?”`).
- **Memoria:** tras 48h `PerformanceAnalyst` lee `getCampaignMetrics` → `saveLearning` con `gancho ganador, CTR, CPA` → próximo `researchDeep` lo inyecta.

---

## 4. GAPs que cierran este diseño (mapeo pedido → solución)

| Pedido | Gap hoy | Solución APA |
|---|---|---|
| **“Que investigue a fondo el producto”** | `MarketResearcher` templated, `AdStrategist` nicho fijo, `fb_ad_library` manual | `Research Deep` auto + multi-idioma + ficha profunda + `architect_memory` |
| **“Que analice lo que convierte”** | `datosExpertosParaAnuncio` existe pero nadie lo llama antes de escribir copy | Orquestador lo llama siempre; `benchmarksDeLaCuenta` + `referenciasDelRubro` entran al prompt de Copy Pro y al brief visual |
| **“Copy profesional vanguardia”** | 1 copy AIDA genérico, validación después | 3 copies con 9 hooks 2026 (PAS, POV, Error común, etc.), validador dentro del loop, formato escaneable garantizado |
| **“Generador de imágenes que convierta”** | Foto de producto estudio | Creative Studio: 3 creativos por copy, 4:5 + zona segura, producto en uso, prompt con gancho + brand, `asset_feed_spec` |
| **“Generador de video que convierta”** | Slideshow 6 escenas Ken Burns | Video Factory Pro: UGC nativo, subtítulos quemados, cortes rápidos, 3 guiones por pack, Pexels curado + opción Sora/Runway |
| **“Todo conectado a Meta/IG/WA”** | Existe pero disperso | Un pack que sube con `asset_feed_spec` (3 imgs+1 vid) en pausa, reutiliza `guardrails` y destino correcto |

---

## 5. Vanguardia 2025-26 que el copy/creativo debe usar (y hoy no usa)

- **Hooks que paran scroll (0-2s):** “¿Todavía …?” / “El error que…” / “POV: …” / “3 señales de que…” / “Dejé de …” — no “Tenemos disponible” ni “Nuevo”.
- **Creativo nativo > pulido:** UGC con celular, luz natural, persona real usando el producto, subtítulo grande. 4:5 ocupa más feed que 1:1; 9:16 para Reels.
- **Texto en imagen ≤ 5 palabras** (gancho o precio) — el copy hace el resto. Safe zone 250px arriba/abajo.
- **Broad + Advantage+:** en 2026 intereses ultra-segmentados rinden menos que broad bien hecho con buen creativo. El equipo debe proponer 1 broad (país+edad) + 1 stacked interests + 1 LAL si hay base.
- **Iteración semanal, no mensual:** con `performance-analyst` + `budget-guard` (30% scale, 25% change), pausar <1% CTR con 1000 imp, rotar creativo si frecuencia >2.5.
- **Prueba “primero 125 caracteres”:** si no se entiende sin “ver más”, no sirve (`publicidad-persuasiva.ts` ya lo dice — ahora se testea).

---

## 6. Roadmap — de auditoría a Agencia Pro

### Fase 1 — Investigación profunda cableada (2-3 días)
- `research-deep.ts` que envuelva `referencias-de-mercado.ts` + `business-context` + `product_knowledge`.
- Conectar su salida a `planDeAnuncio` como `gancho` y a `Creative Studio` como `ideaVisual`.
- Tool + test: “producto con investigación vs sin investigación: dos copys distintos y segundo cita referencia real”.

### Fase 2 — Copy Pro (3-4 días)
- `copy-pro.ts` con 9 hooks, 3 variantes por producto, loop validate→reescribe (máx 2), score ≥70.
- Reemplaza `copywriter.ts` fallback genérico; mantiene `construirBrief` como guardrail.
- Ruta `POST /api/marketing/copy-pro/preview` para panel “Probar copy”.

### Fase 3 — Creative Studio (4-5 días)
- `creative-studio.ts`: `buildAdCreativePrompt` 4:5/1:1, 3 creativos por copy, generación con fallback Chromium overlay.
- `asset_feed_spec` en `facebook.ts:createAd` con array de imágenes (ya tienes `generateProductImageVariants` base).
- Judge visión con rubrica creativa; guarda en `creatives/` no en `products/`.

### Fase 4 — Video Factory Pro (5-7 días)
- UGC template + subtítulos quemados + 3 guiones por pack.
- Pexels curado por `toma` + flag para Sora/Runway si hay key tenant; mantiene tu pipeline 0-costo como fallback.
- `video_anuncio_crear` legacy sigue vivo; nuevo es `video_factory_pro`.

### Fase 5 — Orquestador Pack + Memory Loop (2-3 días)
- `agente-anuncios-pro.ts` que orquesta 4 motores, guarda `facebook_drafts` con `packId`, expone `crear_pack_pro`.
- `marketing-memory` retroalimentación 48h post-publicación.
- Panel “Pack Pro” (3 copys + 3 imgs + 1 vid por pack, selector A/B).

**Total estimado:** 3 semanas a ritmo de este repo (con tests y sin romper `AdStrategist` legacy). Se puede entregar incremental: Fase 1 sola ya mejora el copy notablemente.

---

## 7. Riesgos y decisiones

- **No tocar gasto sin aprobación:** el pack se crea `draft` y solo sube `EN PAUSA`; `BudgetGuard` y `RiskEngine` siguen. No se auto-escala.
- **No duplicar Graph:** todo pasa por `facebook.ts`.
- **Backward compatible:** `fb_ad_draft`, `campana-un-clic`, `video-anuncio` siguen funcionando; el panel muestra “Pro (recomendado) / Clásico”.
- **Costo:** sin Sora/Runway el pack completo cuesta $0 (tu stack gratis primero). Con Sora/Runway: ~$0.30-0.80 por video, a cargo del tenant (keys en `ai-keys-tenant`).

---

## 8. Próximo paso

Si te sirve, en esta rama hago **Fase 1 + scaffold de Fase 2** (Research Deep cableado + Copy Pro skeleton con 3 variantes y validador), que es lo que más impacto da en conversión sin tocar imagen/video aún. Queda detrás de feature flag `AGENCIA_PRO=1` y no rompe nada existente.

¿Lo arranco o prefieres que primero profundice en un motor específico (imagen vs video)?
