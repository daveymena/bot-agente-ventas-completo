# Encargo para OpenCode: 4 familias visuales PROFESIONALES para el renderer V3

**Fecha:** 15-09-2026. **Pedido del dueño:** "plantillas profesionales, no una cosa toda simple".

## Por qué se ve simple hoy (medido)

`artifacts/api-server/src/lib/landing/design-system.ts` define 13 familias (`FAMILIAS`), pero
`renderer-v3.ts` solo tiene CSS propio para UNA: `cssFamilia()` devuelve `CSS_LAUNCH` para
`"launch"` y **cadena vacía para las otras 12**. Esas doce son el mismo layout con otros
colores y tipografía. Una plantilla profesional necesita composición propia, no solo tokens.

## Qué hay que entregar

Para CADA una de estas cuatro familias, un bloque CSS propio al estilo de `CSS_LAUNCH`
(renderer-v3.ts, línea ~199), registrado en `cssFamilia()`:

| familia | referencia visual (solo inspiración, NO copiar código sin licencia) | sensación |
|---|---|---|
| `premium` | shadcnstore dashboard+landing (MIT), Apple product pages | mucho aire, tipografía grande, fotos enmarcadas, sombras suaves |
| `respuesta-directa` | landings de dropshipping LatAm que convierten (contraentrega) | urgencia honesta, precio visible, CTA en bloque, prueba social arriba |
| `ecommerce` | Shopify Dawn, ixartz SaaS-Boilerplate (MIT) | galería protagonista, tarjeta de compra pegajosa, beneficios en 3 columnas |
| `oscura` | Launch UI (ya portada), Linear, Vercel | fondo oscuro, acento luminoso, degradados sutiles, bordes 1px |

## Contrato (lo que el CSS puede tocar y lo que NO)

- **Solo CSS.** Nada de HTML nuevo, nada de JS, nada de fuentes externas (las tipografías salen
  de `TOKENS[familia].tipografia`, ya cargadas). Sin `@import`, sin URLs.
- **Clases disponibles** (las únicas que emite el renderer): `top brand hero hero--center
  hero-copy hero-media hero-price eyebrow lead actions btn btn--primary btn--soft trust sec
  shell narrow head bento bento-card feature-copy feature-media gallery faq offer-main
  offer-side offer-price checkout checkout-form checkout-grid field summary lines strip
  sticky cierre footer muted tiny num media-frame`.
- **Variables CSS disponibles** (de `cssBase`): `--bg --surface --text --muted --accent
  --on-accent --border --radius --shadow` y las de ritmo. Usar `color-mix()` como en
  `CSS_LAUNCH` para derivar tonos; no inventar colores fijos que pisen la familia.
- **Móvil primero:** todo tiene que verse bien a 390px. Probar con `previewMode: "mobile"` del
  Landing Studio. Nada con `min-width` mayor a la pantalla; las grillas colapsan a 1 columna.
- **El CTA se lee:** contraste mínimo 4.5:1 entre `--on-accent` y `--accent`. Botón ≥ 44px.
- **La foto manda** en `ecommerce` y `respuesta-directa` (`imagen: "en-contexto"` /
  `"flotante"`); en `premium` va enmarcada; en `oscura` con borde 1px y brillo sutil.
- **Cero texto inventado.** El CSS no agrega contenido (`::before{content:"…"}` con palabras
  está prohibido; solo íconos/decoración).
- Tamaño: ≤ 6 KB por familia, minificado a mano como `CSS_LAUNCH`.

## Cómo se prueba (antes de dar por terminado)

1. `cd artifacts/api-server && npx vitest run src/lib/landing` → todo en verde (hay 143 pruebas).
2. En el Landing Studio, generar la landing del producto **172 (FAJA HOT TRIMMER)** y del
   **123 (Curso de Piano)** con cada familia; mirar escritorio Y móvil.
3. Capturas de las 8 combinaciones en `artifacts/api-server/scratch/familias-YYYY-MM-DD/`.
4. Un commit por familia: `feat(landing): familia visual "<nombre>" con CSS propio`.

## Lo que NO hay que hacer

- No tocar `renderizarLanding()`, ni el orden de secciones, ni `design-system.ts` salvo para
  ajustar `cuando`/`nombre` de la familia.
- No generar landings completas con el modelo: el HTML lo arma el servidor con hechos reales.
- No traer componentes React: la landing pública es HTML estático.
