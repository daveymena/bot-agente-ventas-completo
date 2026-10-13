# Auditoría Landing + Imagen + Video — Nivel DIOS
**Repo:** `artifacts/api-server/src/lib/ai-product-image.ts` + `video-anuncio.ts` + `landing/agente-landing.ts` + `landingforge-client.ts`  
**Fecha:** 2026-10-12  
**Objetivo:** Profesionalizar a nivel agencia top lo que ya tienes pro: generador de landings + imágenes de producto + videos. No plantilla, sistema que convierte.

---

## 1. Resumen 60s — Qué tienes hoy

| Motor | Qué hace hoy | Bien | Lejos de DIOS |
|-------|--------------|------|---------------|
| **ai-product-image** | 2 variantes: mockup 3D (MacBook+iPad+iPhone) vs UGC iPhone, juez visión elige 1 ganadora 1080x1080, fallback G4F→Pollinations FLUX | No deja placeholder gris, juez evita collage aleatorio, guarda variante ganadora | 1:1 fijo (4:5 feed no), solo 2 estilos (no estudio premium / lifestyle dirigido), Pollinations gratis sin control de marca, no genera galería 3 imgs, no relighting, no 4K |
| **video-anuncio** | Vertical 1080x1920 5-6 escenas Ken Burns + Pexels B-roll + EdgeTTS + ffmpeg, subs no quemados | Vertical nativo, TTS colombiano, ffmpeg pipeline probado | No UGC, no avatar, voz robot, cortes genéricos, sin hook 0-2s, sin proof, sin dynamic product in video |
| **landing agente** | Redactor con cadena proveedores (DeepSeek>GROQ>ollama) + REGLAS_DEL_AGENTE (1 hero, 1 precio, 1 form, móvil primero, colores neutros, sin inventos) | Reglas anti-invento, diseño móvil primero, bitácora, validación HTML, 12k tokens | Sin personalización por tráfico, sin A/B auto, sin prueba social real, sin pixel/CAPI check, sin video hero, sin galería 3, sin oferta anclada |

**Veredicto:** Tienes **nivel PRO** (mejor que plantilla), no **DIOS** (agencia que cobra $2k por landing+pack). Gap = investigación real + relighting + UGC video + landing que se adapta al ad.

---

## 2. Estándar DIOS 2025-26 — Qué hace una agencia que vende

**Imagen DIOS (3 niveles, no 1):**
- **L1 Estudio Dios:** fondo infinito #FAFAF9, sombra contacto, luz de estudio 3 puntos, 4K, recorte perfecto, sin IA manos deformes. Ratio 4:5 feed (1080x1350) y 1:1 carrusel (1080x1080) desde la misma toma.
- **L2 Lifestyle dirigido:** producto EN USO por persona de tu buyer (no gringo stock), en contexto real Cali (oficina, casa), luz natural, sin packshot. Prompt dirigido por ResearchDeep (ángulo ganador).
- **L3 Prueba:** "así se ve por dentro" (Drive/área miembros) o macro textura. Nunca collage de carpetas.

**Video DIOS (no Pexels genérico):**
- **Hook 0-2s textual gigante** + subs quemados karaoke, corte cada 1.2s, B-roll de TU producto (no "woman working"), voz clonada o Salome con entonación, CTA con botón WA.
- **Avatar UGC opcional:** actor IA con lip-sync diciendo tu guión (HeyGen/D-ID style), no locutor.
- **6 escenas:** Hook → Dolor → Producto en mano → 3 beneficios (1 por corte) → Precio framing → CTA.

**Landing DIOS (no One-Page estática):**
- **Hero con video/img según ad:** si el ad es video, el hero arranca con ese video (consistencia). Si es imagen, hero 4:5.
- **Galería 3 + sticky CTA + prueba social real** (solo la que existe en metadata, no "4.8★ 1234 reseñas" inventado).
- **Oferta anclada:** precio vs valor ancla ($60k vs $740/curso), garantía solo si existe, y formulario con total visible.
- **Pixel + CAPI verificado:** dispara ViewContent/InitiateCheckout/Purchase, sino Meta optimiza a clic barato.
- **A/B auto:** variante A hero video / B hero galería, gana la que convierte.

---

## 3. Radiografía profunda — Código actual

### 3.1 ai-product-image.ts — 220L
- `VARIANT_STYLES[2]` fijos: mockup 3D vs UGC iPhone. Bien para MVP, mal para Dios: no hay `studio premium` ni `lifestyle dirigido por nicho` ni `4:5`.
- `buildPollinationsUrl` → 1080x1080 forzado. Comentario dice "1:1 para ambos casos sin generar dos variantes — por eso se mantiene" — es deuda técnica: Meta no acepta 4:5 en carrusel, rechaza tu galería.
- `judgeBestCandidate` con visión: bueno, pero elige 1 y tira la otra. Dios necesita guardar **TODAS las que pasan filtro** para asset_feed_spec (tu `generateProductImageVariants` ya lo hace pero el llamador principal no lo usa).
- Fallback chain: OpenAI → G4F → Pollinations (gratis). Bien para no quedar sin imagen, mal para marca: Pollinations sin control de colores.

### 3.2 video-anuncio.ts — 400L (inferido)
- Pipeline probado: TTS es-CO + Pexels + ffmpeg. Bien para 5-6 escenas Ken Burns.
- Gap: sin guión pro (hook 0-2s), sin subs quemados, sin cortes 1.2s, sin B-roll de TU producto, sin avatar.

### 3.3 landing/agente-landing.ts — 600L + REGLAS
- `candidatos()` orden DeepSeek>GROQ>ollama, 12k tokens, validación `<html`. Bien: no se queda sin landing.
- `REGLAS_DEL_AGENTE` son oro: 1 hero/1 precio/1 form, móvil primero (foto arriba 4:5, etiqueta, titular degradado, 3 checks, botón ancho), fondos alternados, tarjetas 24px, barra fija móvil, colores neutros. Es DIOS en estructura.
- Gap: no lee `ResearchDeep` (no sabe qué hook ganó), no inyecta video hero del ad, no arma galería 3 desde `fotosDelProducto`, no verifica pixel.

---

## 4. Arquitectura DIOS Propuesta — Incremental, detrás de flag `DIOS=1`

```
Producto + ResearchDeep(9 hooks)
   → ImagenDiosStudio (L1 4K + L2 lifestyle dirigido + L3 prueba) → 3 imgs 4:5 + 3 imgs 1:1 + variantes con juez
   → VideoDiosFactory (UGC 18s + avatar lip-sync opcional + subs quemados)
   → LandingDios (hero dinámico: video si el ad es video, galería 3 si es imagen) + oferta anclada + pixel check
   → ValidateScore Dios (≥80, no 70) → Guardar en pausa con BudgetGuard
```

**Módulos nuevos (no reemplazan, conviven):**

| Módulo | Archivo | Qué agrega |
|--------|---------|------------|
| `ImagenDios` | `lib/agencia/dios/imagen-dios.ts` | 3 niveles, generación 4K, relighting, 1:1+4:5 desde misma toma, juez guarda las 3, fallback con brand-kit (color marca) |
| `VideoDios` | `lib/agencia/dios/video-dios.ts` | Guión pro (hook 0-2s), TTS neural + subs quemados, B-roll de producto real (no Pexels genérico) + avatar opcional (HeyGen stub) |
| `LandingDios` | `lib/landing/dios/landing-dios.ts` | Inyecta research hook ganador, elige hero video vs galería según pack, arma galería 3 desde fotosDelProducto, ancla precio ($740/curso), verifica pixel/CAPI, genera variante A/B |
| `Orquestador Dios` | `lib/agencia/dios/orquestador-dios.ts` | Flag `DIOS=1`, chain Imagen→Video→Landing, guarda `landing_drafts` + `facebook_drafts` en pausa |

**Guardrails:** nunca inventa garantía/testimonio, ratio 1:1 para carrusel, 4:5 para feed, texto overlay ≤5 palabras.

---

## 5. Checklist DIOS por nicho (lo que la gente necesita y tu sistema ya deriva)

- **Digital (81EN1, piano, Office):** hero con video del contenido por dentro, galería 3 = captura por dentro + mockup dispositivos + testimonial real (si existe). Oferta: "$60k vs $740/curso".
- **Físico dropshipping (mochilas, corrector):** hero lifestyle persona usando, galería macro + en uso + antes/después sin claim salud, video UGC con prueba, oferta: "pago contraentrega + envío 2-4 días".
- **Servicio:** hero con agenda, galería = instalación / resultado, video = necesidad → diagnóstico.

Tu `nicho.ts` ya deriva `fisico/digital/servicio/mixto` por `kind + deliveryLink` — el Dios lo consume, no lo re-deriva.

---

## 6. Roadmap 4 fases (sin romper lo pro)

**F1 (esta semana, en esta rama):** `ImagenDios` L1+L2+L3 con 4:5+1:1 + `VideoDios` UGC 18s + `LandingDios` hero dinámico. Flag `DIOS=1`, tests `landing-dios.test.ts`.

**F2:** Avatar lip-sync (stub HeyGen) + pixel/CAPI verifier en landing.

**F3:** A/B auto hero video vs galería + memoria 48h de qué gancho ganó.

**F4:** Publicación en pausa con BudgetGuard (igual que Agencia Pro).

¿Sigo con F1 en esta rama? No toco tu `landing/agente-landing` actual hasta tu OK, todo nuevo detrás de flag.
