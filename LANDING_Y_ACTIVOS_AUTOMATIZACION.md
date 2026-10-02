# Landing, imágenes, videos y anuncios — cómo lo hace el curso y cómo lo automatizamos

**Fuentes leídas completas (2026-10-01):**
- Curso 2026 de Iván Caicedo, 16 capítulos (ver `CURSO_DROPSHIPPING_2026_CONDENSADO.md`).
- 14 transcripciones del curso 2024 que pasó el dueño: caps. 11, 13, 15-21, 27-29, el caso "Creo una tienda desde cero" y "Probé 3 páginas de venta" (este último es de septiembre de 2026).
- Las transcripciones venían duplicadas: cada una repetía su texto entero. Se leyó cada una una sola vez.

**Marcas de fuente:** [autor] lo dice él. Vende la mentoría y la app Master Escala, así que no es dato neutral. · [verificado] lo comprobamos en código o datos. · [hipótesis] es nuestro.

---

## 1. Cómo crea la landing, en tres épocas

| Época | Herramienta | Cómo |
|---|---|---|
| 2024 | Página de producto de Shopify, a mano | Copys con ChatGPT a partir de la landing de otro país, GIFs cortados de videos del fabricante, iconos propios en Canva, reseñas con app, formulario contraentrega de un paso (Releasit). Meta: tenerla lista **en 1 hora**. |
| 2026 (curso) | Shopify + IA | Igual, pero las infografías, imágenes de urgencia y caras salen de ChatGPT/Gemini. Página mínima en 5 min con Fluxi (del que es socio). |
| Sep-2026 | **App Master Escala** | Eliges 3 fotos → nombre, país, público (hombre/mujer/ambos), precio desde la calculadora → la IA propone **ángulos y buyer persona** → eliges secciones → genera → publica en Shopify. Tres tipos: **solo imágenes**, **híbrida HTML** (secciones de código + imágenes de IA) y **réplica** de la landing de un competidor. |

**Su prueba de septiembre de 2026** [autor]: mismo producto (gafas con cámara a 249.900 COP), mismos videos, 3 campañas de 60.000 COP/día. Solo vendió la **híbrida HTML**: 2 ventas con 34.884 COP gastados. Es una sola prueba con poco gasto; sirve como pista, no como regla.

## 2. De dónde sale cada activo

| Activo | De dónde lo saca el autor | ¿Sirve para VentasPro? |
|---|---|---|
| Fotos del producto | Proveedor (Dropi); AliExpress/Alibaba por búsqueda de imagen, la del que más vendió y mejor reseña; descarga en máxima resolución | ✅ Fotos del proveedor ya entran (`fotos-de-producto.ts`). Las de AliExpress son del fabricante y las usa todo el mercado. |
| GIFs | Recortes de 3-5 s del **video del fabricante** (AliExpress) o del anuncio de otro país, mostrando UN beneficio | ✅ Automatizable con ffmpeg, que ya está en el servidor (`video-anuncio.ts`). |
| Infografía | ChatGPT/Gemini con la foto + beneficios | ✅ Se puede componer con Chromium como las escenas de `video-anuncio.ts`, sin API paga y con texto exacto. |
| Imágenes "últimas unidades", "pide tranquilo", garantía | ChatGPT/Gemini/Canva | ⚠️ Solo si el dato es real y está cargado. |
| Textos | Prompt AIDA sobre el texto de la landing modelo, más lista de beneficios, preguntas frecuentes, 3 textos con dolores distintos y una narración de 100 palabras para la voz en off | ✅ Ya lo hace `agente-landing.ts` + `plantillas.ts`. Falta el **ángulo**. |
| Landing modelo | Biblioteca de anuncios: anuncio activo hace tiempo, **de otro país/idioma**; él busca en neerlandés y alemán | ✅ `fb_ad_library` + `landing_clonar_url` / `landing_adaptar` ya existen. Falta buscar en varios idiomas. |
| Videos para la página | Links de TikTok del producto pegados en una sección | 🟡 El renderer **no tiene** sección de video. |
| Creativos | Anuncio original descargado de otro mercado, variaciones de gancho y voz (ElevenLabs/CapCut), personas con IA (Gemini + Grok) | 🟡 `video-anuncio.ts` hace un video. Faltan variaciones de gancho. |
| Reseñas | Fotos de compradores de Temu/AliExpress con **nombres inventados**; en la app, "reseñas con foto con IA" | ❌ No. Es fabricar prueba social. |

## 3. La estructura que repite (todas las épocas)

1. **Primer pantallazo:** foto o GIF que muestra el resultado, título corto con el beneficio, precio grande, botón. ~50% se va en el primer scroll. [autor]
2. Barra o iconos de confianza **propios** (envío al país, paga en casa, garantía **real**) y no los dorados que usa todo el mundo. [autor]
3. Bloques de **imagen/GIF → título con beneficio → una línea**, repetidos. Poco texto. [autor]
4. Cómo se usa (3 pasos), cómo se limpia o se carga, guía de tallas: cada duda respondida con imagen. [autor]
5. Lista de beneficios y características, cada una con su emoji fijo. [autor]
6. Videos del producto **debajo del primer botón**. [autor]
7. "Te escribimos por WhatsApp para confirmar tu pedido". [autor]
8. Reseñas (dice que sin reseñas no sale). [autor] → nosotros solo con reseñas reales.
9. Preguntas frecuentes al final: envío, devolución, tiempo. [autor]
10. Botón **pegado abajo**, de color que contraste, con animación de pulso; formulario contraentrega de un paso con "confirmo que voy a recibir" y punto de referencia. [autor]
11. Ofertas por cantidad: 2 unidades con un descuento menor o igual a lo que se ahorra en publicidad y flete (él usó 25-30%). En su caso de estudio entró un pedido doble el primer día. [autor]

## 4. Lo que tiene VentasPro hoy (revisado en código)

| Pieza | Estado | Dónde |
|---|---|---|
| Crear landing en segundo plano desde un producto | ✅ | `landing_crear` → `agente-landing.ts` |
| Estructura por tipo de producto; una sección sin dato real se cae | ✅ | `plantillas.ts` |
| Copiar HTML de una URL y adaptarlo (texto, fotos, botones) | ✅ | `clonar-html.ts`, `landing_clonar_url`, `landing_adaptar` |
| Copiar solo el estilo de una URL | ✅ | `estilo-desde-url.ts` |
| Editar con una instrucción | ✅ | `editar.ts`, `landing_editar` |
| Fotos del proveedor (Dropi/Woo) y galería del dueño | ✅ | `fotos-de-producto.ts` |
| Ficha leída de las imágenes del proveedor | ✅ | `ficha-desde-imagenes.ts` |
| Botón pegado abajo + formulario contraentrega + cupón | ✅ | `renderer-v3.ts`, `landing-publica.ts` |
| Video de anuncio vertical con voz en off | ✅ | `video-anuncio.ts` |
| Biblioteca de anuncios | ✅ | `fb_ad_library` |
| Precio con devoluciones y punto de equilibrio | ✅ (nuevo hoy) | `metodo_de_venta {tema:'costeo'}` |
| **Ángulos de venta / buyer persona** | ❌ | — |
| **GIFs desde video** | ❌ | — |
| **Infografía automática** | ❌ | — |
| **Sección de video en la landing** | ❌ | el renderer no tiene `<video>` ni incrustado |
| **Píxel de Meta en la landing** | ✅ (corregido 01-10-2026: sí existe) | `lib/landing/monitor.ts` inyecta `fbq` en la landing pública (PageView, ViewContent con valor, InitiateCheckout y Purchase al confirmar el pedido) + evento servidor en `compra-verificada-meta.ts` |
| **Ofertas por cantidad** | ❌ | el formulario acepta `cantidad`, pero no hay oferta 2×/3× |
| **Variantes A/B de una landing** | ❌ | — |

### ⚠️ Problema encontrado en cambios sin commitear

`renderer-v3.ts` tiene cambios locales sin commitear (+187 líneas) que **inventan datos en todas las landings físicas**:

- `🚚 Envío Gratis · 💵 Pago Contra Entrega · ✅ Garantía 30 días`, fijo y sin mirar la configuración del negocio.
- Precio tachado calculado como **precio × 1,45** y "Ahorras X hoy".
- `★★★★★ 4.9/5` sin ninguna reseña detrás.

Eso rompe la regla central del repo ("lo que no está configurado no se afirma") y es justo lo que el curso hace y nosotros no. Estado 01-10-2026: ese trabajo quedó respaldado en la rama `respaldo/antes-alinear-2026-10-01` de `Videos/Agent-Sales-Bot` y NO se portó a este repo (solo lo bueno: audiencias + método de venta). El renderer de este repo nunca tuvo esos inventos.

## 5. Plan de automatización: "de producto a campaña"

Cada paso deja su resultado guardado en el producto, para que landing, anuncio y vendedor de WhatsApp lean lo mismo.

| # | Paso | Qué hace | Nuevo / existe | Costo |
|---|---|---|---|---|
| 1 | **Referencias** | `fb_ad_library` en el país + en 2-3 idiomas (términos traducidos por IA); guarda en `metadata.referencias` los anuncios activos de más de 15 días y sus landings | amplía lo existente | gratis |
| 2 | **Activos** | Junta fotos del proveedor + las de la landing de referencia (solo del fabricante, sin marcas ajenas); baja los videos del fabricante | amplía `clonar-html` | gratis |
| 3 | **GIFs** | ffmpeg corta 2-4 tramos de 3 s del video (o de las fotos con zoom) → GIF/WebP cuadrado de 600 px | nuevo | gratis |
| 4 | **Ángulos** | La IA lee ficha + referencias y propone 3-6 ángulos con su buyer persona; el dueño elige (sin gastar nada) | nuevo, era la idea #1 de la vez pasada | modelo gratis |
| 5 | **Precio** | `precioDeVenta` → precio sugerido y punto de equilibrio; precio tachado **solo** si el dueño carga un precio anterior real | existe la cuenta; falta el campo | gratis |
| 6 | **Landing** | Plantilla + ángulo + GIFs + infografía (Chromium) + sección de video + oferta 2× calculada + "te confirmamos por WhatsApp" + **píxel** | amplía `agente-landing` / `renderer-v3` | gratis |
| 7 | **Variantes** | 2-3 landings del mismo producto con ángulos distintos, cada una con su propio enlace | nuevo (usa `landing_clonar`) | gratis |
| 8 | **Creativos** | `video-anuncio` por ángulo y 3 ganchos distintos para los primeros 3 s | amplía | gratis |
| 9 | **Campaña** | `crear_anuncio`: una campaña por variante para leer el gasto aparte; corte por la regla elegida | existe | pauta |
| 10 | **Post-pedido** | Pedido contraentrega de la landing → el vendedor confirma por WhatsApp (ya existe en `dropshipping.ts`) → Purchase a Meta **con pedido real**, nunca del simulador | ya existe la confirmación; falta corregir el Purchase | gratis |

**Orden recomendado:**
- **Ya (01-10-2026):** Purchase falso de `agent.ts` corregido (sale solo desde pago verificado vía `compra-verificada-meta.ts`); inventos de `renderer-v3.ts` descartados (no entraron a este repo); método de venta y audiencias portados. Pendiente: 6-píxel (verificado que ya existe) y 10.
- **Después:** 4 → 3 → 6.
- **Más adelante:** 7, 8 y 1-2.

## 6. Lo que NO se va a automatizar

- Reseñas con nombres inventados o fotos de clientes de otra tienda presentadas como propias.
- "Más de 450 unidades vendidas esta semana", "últimas unidades", precio tachado o garantía que no sean reales.
- Usar tal cual el video, las fotos con marca o la landing de un competidor (la réplica de la app traduce las imágenes ajenas y las publica como propias).
- Bloquear clic derecho "para que no te copien": el mismo autor muestra que se salta con una extensión. Si el contenido es propio, se protege con marca de agua.

---

# 7. ESTADO VERIFICADO EN CÓDIGO (2026-10-02)

> Corrige las tablas de arriba, que quedaron viejas: varias cosas que figuran
> como ❌ **ya están construidas y en uso**. Se verificó leyendo qué código se
> consume de verdad (no comentarios) y corriendo las pruebas.

| Pieza | Lo que decía el plan | Estado REAL | Evidencia |
|---|---|---|---|
| Datos inventados en landings | ❌ quitarlos | ✅ **hecho** | `__tests__/plantillas-sin-inventos.test.ts` (59 casos) en verde |
| Purchase falso a Meta | ❌ quitarlo | ✅ **hecho** | `compra-verificada-meta.ts` + test: el Purchase sale SOLO de un pago verificado |
| Píxel de Meta en la landing | ❌ falta | ✅ **hecho** | `landing-publica.ts:57` usa `landing/monitor.ts` (`PageView`, `ViewContent`, `InitiateCheckout`, `Purchase`) |
| Sección de video en la landing | ❌ el renderer no tiene `<video>` | ✅ **hecho** | `renderer-cod.ts:158`; y `sanear-html.ts` borra el `<video>` sin fuente real (guardia anti-invento) |
| Ofertas por cantidad (2×/3×) | ❌ | ✅ **hecho** | `ofertasValidas` en `landing/crear-landing-imagenes.ts` + "Elige tu oferta" en `renderer-v3/moderno/cod/imagenes/pro` |
| Ángulos / buyer persona | ❌ (la idea #1 pendiente) | ✅ **hecho** | `construirBrief()` devuelve 3 ángulos; `ruta-guiada.ts` (cableado en `routes/operator-opencode.ts`) los ofrece paso a paso |
| **GIFs desde video (ffmpeg)** | ❌ | ✅ **hecho (02-10)** | `lib/gifs-de-producto.ts` + 8 tests (args puros: el CI no tiene ffmpeg) |
| **Campaña en un clic (panel)** | no estaba en el plan | ✅ **hecho (02-10)** | `lib/campana-un-clic.ts` + `routes/campana.ts` (`POST /api/campana/generar`) + botón en `facebook.tsx` |
| Variantes A/B de landing | ❌ | 🟡 **parcial** | `routes/marketing.ts` ya tiene experimentos (hipótesis + variante + presupuesto + duración); falta la UI |
| Referencias en 2-3 idiomas | amplía lo existente | 🟡 **parcial** | `fb_ad_library` busca por país; falta traducir el término y recorrer idiomas |
| Infografía automática | ❌ | 🟡 **parcial (otro camino)** | `crear-landing-imagenes.ts` + `plan-imagenes.ts` generan paneles con IA; no es la compuesta con Chromium |
| 3 ganchos distintos por video | 🟡 | ❌ | `video-anuncio.ts` hace un video por producto, no 3 ganchos |

### Lo que sigue, en orden

1. **Cablear los GIFs**: el módulo existe pero **nadie lo llama todavía**. Va en el
   flujo de campaña (guardado en el producto) y en la landing.
2. **Infografía compuesta con Chromium** (texto exacto, sin API paga), reusando el
   patrón de `video-anuncio.ts`.
3. **Variantes A/B**: UI sobre los experimentos que ya existen en `routes/marketing.ts`.
4. **Referencias multi-idioma** en `fb_ad_library`.
5. **3 ganchos distintos** por video.

⚠️ **Regla que no cambia**: nada de la sección 6 se automatiza. Un activo sin
dato real detrás se cae, no se rellena.

