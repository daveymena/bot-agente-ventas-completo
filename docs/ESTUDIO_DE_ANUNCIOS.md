# Estudio de anuncios (VentasPro)

Una petición por producto → paquete completo de creativos hechos con las
**fotos reales** del producto: 12 imágenes (4 plantillas × 1:1, 4:5 y 9:16)
y un vídeo vertical de 15–30 s, a partir de un catálogo de 31.000+
plantillas (maqueta × estilo × tema) y las propias del negocio. Todo editable desde el panel
(`/estudio-anuncios`) con un editor de lienzo (Fabric.js) y un editor de vídeo
por escenas. Disponibilidad alta: sale aunque falten Chromium, la IA, Pexels o
la voz; solo necesita `sharp` (imágenes) y `ffmpeg` (vídeo). Desde la etapa 3
el producto **se mueve dentro del cuadro** (recorte sin IA que flota, late o
gira, partículas, cámara 3D) y hay un espacio de **IA fiel a la foto real**
(nunca inventa el producto: solo pinta el entorno o lo anima).

## Dónde vive

| Pieza | Ruta |
|---|---|
| Esquema de diseño (capas, formatos, animación, patrones, validación) | `artifacts/api-server/src/lib/estudio-anuncios/esquema.ts` (`diseno.ts` lo reexporta todo) |
| Maquetas (11) y paquete por defecto | `…/estudio-anuncios/maquetas.ts` |
| Estilos (26 a mano + 100 paletas), temas (23 temporadas/nichos) | `…/estudio-anuncios/estilos.ts`, `temas.ts` |
| Catálogo combinatorio, búsqueda, plantillas propias, importación de Fabric | `…/estudio-anuncios/plantillas.ts` |
| Tipografías (20 familias OFL vía `@fontsource`, trazadas con opentype) | `…/estudio-anuncios/tipografia.ts` |
| Elementos abiertos (emoji, iconos, logos, formas) | `…/estudio-anuncios/elementos.ts` |
| Guiones de vídeo (5) y escenas con entradas animadas | `…/estudio-anuncios/escenas.ts` |
| Recorte del producto sin IA (fondo liso → PNG con alfa, sombra, máscara de conservación) | `…/estudio-anuncios/recorte.ts` |
| IA fiel a la foto real (proveedores por clave, imagen a imagen con máscara, imagen a vídeo, verificación) | `…/estudio-anuncios/ia.ts` |
| Herramientas de Atlas | `…/estudio-anuncios/atlas.ts` (se enchufan en `app-operator.ts`) |
| Contenido del anuncio (qué se dice) | `…/estudio-anuncios/contenido.ts` |
| Render servidor (sharp + Inter en contornos) | `…/estudio-anuncios/render.ts`, `tipografia.ts`, `assets/fonts/` |
| Vídeo por escenas (ffmpeg + edge-tts) | `…/estudio-anuncios/video.ts` |
| Cola con reintentos | `…/estudio-anuncios/cola.ts` |
| Orquestador + persistencia | `…/estudio-anuncios/estudio.ts` |
| Fotogramas sin Chromium para el motor viejo | `…/estudio-anuncios/fotogramas.ts` (lo usa `video-anuncio.ts` si puppeteer no arranca) |
| API | `artifacts/api-server/src/routes/estudio-anuncios.ts` → `/api/estudio-anuncios` |
| Panel | `artifacts/ventas-pro/src/pages/estudio-anuncios.tsx`, `components/estudio/editor-imagen.tsx`, `editor-video.tsx`, `lib/estudio/` |
| Pruebas | `artifacts/api-server/src/lib/__tests__/estudio-anuncios.test.ts`, `estudio-plantillas.test.ts`, `estudio-rutas-archivos.test.ts`, `estudio-movimiento.test.ts`, `estudio-ia.test.ts` |

## El Diseño (JSON)

```jsonc
{ "version": 1, "formato": "historia", "ancho": 1080, "alto": 1920, "plantilla": "destacado",
  "capas": [
    { "id": "f", "tipo": "fondo", "relleno": "#0B0B14", "imagen": "/images/products/7.jpg", "desenfoque": 46, "oscurecer": 0.5 },
    { "id": "i", "tipo": "imagen", "src": "/images/products/7.jpg", "ajuste": "contener", "x": 64, "y": 500, "w": 952, "h": 952, "radio": 28, "sombra": true },
    { "id": "t", "tipo": "texto", "texto": "¿Dolor de espalda?", "tam": 92, "peso": 900, "color": "#111827", "alinear": "centro", "resaltado": "#FFD60A", "x": 64, "y": 268, "w": 952, "h": 208 },
    { "id": "r", "tipo": "rect", "relleno": "#25D366", "radio": 52, "x": 216, "y": 1496, "w": 648, "h": 104 }
  ] }
```

Dos renderizadores leen el mismo JSON: el servidor (`render.ts`, para la
generación automática, miniaturas y fotogramas) y el navegador (Fabric, para
editar y exportar lo que el dueño ve). El alto de línea del servidor usa el
mismo factor 1.13 de Fabric y el texto se dibuja con los contornos de Inter
(`opentype.js` glifo a glifo: `font.getPath` se cae con Inter) porque el VPS
no tiene fuentes del sistema.

Formatos: `cuadrado` 1080×1080 (feed), `vertical` 1080×1350 (feed 4:5),
`historia` 1080×1920 (historias/reels). Plantillas: `destacado`, `oferta`,
`beneficios`, `minimal`. Zona segura por formato en `zonaSegura()`.

## Qué se dice

`contenido.ts` solo usa lo que el producto y el negocio respaldan: ganchos
(aprobados → `lanzamiento.copies.ganchos` → titular/primaryText de
`anuncio-por-modelo` → beneficio curado → puntos reales), beneficios
(`puntosReales`), precio corto, sellos del negocio (`sellosDelNegocio`; los de
envío solo para físicos) y CTA según destino. La IA (`ganchosConIA`,
proveedores gratuitos primero) es opcional y solo propone ganchos más cortos;
si no responde, sale igual. Emojis y símbolos que la fuente no dibuja se
quitan (`limpiarTexto`).

## Flujo

1. `POST /api/estudio-anuncios/:productId/generar` `{ conIA?, conVideo?, plantillas?, formatos?, ganchos?, destino? }`
   → encola `paquete:<id>` (cola en memoria, concurrencia `ESTUDIO_CONCURRENCIA`=1, 3 intentos con espera creciente).
2. El trabajo lee marca (`tenants.brandName/brandColors`), condiciones
   (`getBusinessContext`), fotos únicas (`fotosUnicasDelProducto`, con
   respaldo `fotosDelProducto`), arma `paqueteDeDisenos`, pinta cada pieza a
   `IMAGE_STORE_DIR/anuncios/<productId>/<plantilla>-<formato>.jpg`
   (servido en `/uploads/anuncios/…`) y guarda en
   `products.metadata.estudio = { paquete, contenido, imagenes[], disenos{}, escenas[], video }`.
3. Al terminar encola `video:<id>` con `escenasAutomaticas` (gancho →
   producto → beneficios → precio → cierre). `video.ts` pinta cada escena (o
   usa el PNG que exportó el editor), graba la locución (`hablar`, Salomé o
   Gonzalo es-CO), anima (zoompan), transiciona (xfade), mezcla música
   opcional de `data/musica` y escribe `video-<ts>.mp4`.
4. `GET /:productId` devuelve estado persistido + progreso de la cola
   (`trabajos.paquete/video` con `progreso`, `detalle`, `posicion`, `intento`).

Edición: `PUT /:productId/diseno/:id` `{ diseno, imagen? }` (si viene el JPG
del navegador se guarda tal cual; si no, se repinta en el servidor),
`PUT /:productId/escenas`, `POST /:productId/fotograma` (PNG binario → nombre
temporal), `POST /:productId/video` `{ escenas?, fotogramas?, voz?, conVoz?,
conMusica? }`, `POST /:productId/archivo` (imagen binaria → URL en
`/uploads/anuncios/<id>/subidos/`), `POST /:productId/vista-previa`,
`DELETE /:productId/imagen/:id`, `DELETE /:productId`.

`GET /imagen?src=` es un proxy same-origin de las fotos (solo http(s) públicas
o `/images/products|/uploads`) para que el canvas se pueda exportar sin
"taint" por CORS.

Reutilizar en Meta: el panel marca imágenes y llama al endpoint que ya
existía `POST /api/facebook/strategist/draft/:productId` con `images: [...]`
(crea el borrador en pausa, no gasta).

## Plantillas (etapa 2)

No existe un repositorio abierto con "miles de plantillas de Canva" (su
catálogo es propietario y las licencias de los editores abiertos que lo
imitan —Polotno, Remotion, tldraw— no son libres para uso comercial). Lo que
sí existe y se usa aquí son **bloques abiertos** combinados en un catálogo
propio:

* **Id de plantilla** = `maqueta.estilo.tema`, p. ej. `oferta.pop.navidad`.
  11 maquetas × 126 estilos × 23 temas = **31.878 plantillas** por formato
  (`totalDePlantillas()`); también vale la maqueta sola (`oferta`) o
  `maqueta.estilo`. `buscarPlantillas({q, categoria, tema, estilo, pagina})`
  busca por palabras en español.
* **Maquetas**: destacado, oferta, beneficios, minimal, pregunta, lista,
  collage, etiqueta (sello de precio), marco, precio, banda.
* **Estilos**: paleta (fondo, texto, acento, botón…), par tipográfico
  titular/cuerpo, fondo (foto/sólido/degradado/patrón), radios, mayúsculas.
  26 hechos a mano (`marca`, `limpio`, `nocturno`, `pop`, `elegante`,
  `calido`…) + 100 de `nice-color-palettes` (MIT).
* **Temas**: navidad, amor, madre, padre, halloween, blackfriday, anonuevo,
  escolar, vacaciones, diasinvia, deportes, fitness, mascotas, belleza,
  tecnologia, comida, hogar, bebes, fiesta, naturaleza, lujo, envios (+
  `ninguno`). Cada uno trae cinta ("Navidad") y adornos (emojis) que se
  colocan **esquivando** textos, botones y chips (`decoracionesDeTema` con
  `esquivar`); si no caben, se omiten.
* **Tipografías** (20, todas OFL): Inter, Montserrat, Poppins, Nunito,
  Raleway, Roboto, Bebas Neue, Anton, Oswald, Archivo Black, Bangers,
  Righteous, Fredoka, Playfair Display, Abril Fatface, Lobster, Pacifico,
  Dancing Script, Caveat, Permanent Marker. El servidor las traza como
  contornos (sin fuentes del sistema) y las sirve al editor en
  `GET /api/estudio-anuncios/fuentes.css`, así lo que se ve es lo que sale.
* **Elementos** (`buscarElementos`, `GET /elementos?q=`): Fluent Emoji Flat
  (MIT, 3.174), Tabler Icons (MIT, 6.286, coloreables), Simple Icons (CC0,
  3.739 logos: WhatsApp, Instagram, Visa, Mercado Pago…) y formas propias.
  Capa `icono` (`coleccion:nombre` o `svg:<markup>` saneado).
* **Fondos**: color, degradado o patrón (13 baldosas SVG propias:
  `GET /patrones/:id.svg`).
* **Plantillas propias**: desde el editor («Plantilla») se guarda el Diseño
  con roles (Gancho, Precio, Texto del botón, Beneficio, Marca, Foto del
  producto); `aplicarDisenoAContenido` lo rellena con otro producto.
  `POST /plantillas/importar` acepta JSON de Fabric (`desdeFabricJSON`
  reconoce roles por heurística). Ids `personal:<id>`, un JSON por tenant.
* **Vídeo**: 5 guiones (clasico, rapido, beneficios, fotos, pregunta), 21
  transiciones xfade, movimiento de cámara y **entradas por capa**
  (`anim: {entrada, retraso, duracion}`: aparecer, deslizar ×4, zoom,
  rebote) que ffmpeg anima con overlays por grupo (`agruparCapas`,
  `filtroDeEntrada`). Si el editor manda fotogramas propios, se usa el
  fotograma completo.
* Regla de la casa: las plantillas no traen frases; todo texto sale de la
  ficha, de las condiciones del negocio o de lo que diga el dueño. La muestra
  del catálogo usa "Tu producto / Tu sello".

### API de plantillas

`GET /plantillas` (resumen: maquetas, estilos, temas, guiones, propias),
`GET /plantillas/buscar?q=&tema=&estilo=&categoria=&pagina=&formato=&producto=`,
`GET /plantillas/:id/vista-previa.jpg?formato=&producto=` (con las fotos del
producto si se pasa), `GET /plantillas/:id`, `GET|POST /plantillas/personales`,
`DELETE /plantillas/personales/:id`, `POST /plantillas/importar`,
`POST /:productId/pieza {plantilla, formato, estilo?, tema?, gancho?}` (una
pieza al instante), `PUT /:productId/pieza/:id/textos {Gancho?, Precio?…}`,
`GET /elementos`, `GET /elementos/svg?ref=&color=`, `GET /fuentes`,
`GET /fuentes.css`, `GET /patrones/:id.svg`. `/generar` y `/video` aceptan
`estilo`, `tema`, `guion`; `/video` además `conAnimaciones`, `movimiento`
(cámara), `ambiente`, `productoVivo`. Etapa 3: `GET /plantillas` añade
`movimientos`, `camaras`, `ambientes` e `ia`; `GET /ia` (proveedores
configurados), `POST /:productId/recortar {foto?}` → `{recorte: {url,
confianza, usable, motivo?}}`, `POST /:productId/ia`, `POST
/:productId/ia/:cid/usar`, `DELETE /:productId/ia/:cid`.

### Atlas

`HERRAMIENTAS_ESTUDIO` (`atlas.ts`): `estudio_plantillas` (lee: busca en el
catálogo y lista estilos/temas/guiones/propias), `estudio_generar` (paquete
con plantillas/estilo/tema/guion, avisa al terminar), `estudio_pieza` (una
imagen al instante, devuelve enlace e id), `estudio_editar_texto` (cambia
textos por rol y repinta), `estudio_video` (rearma con otro guion/tema,
cámara, ambiente y producto vivo), `estudio_estado`, `estudio_recortar`
(quita el fondo de la foto real y dice si sirve) y `estudio_ia_crear` (crea
una imagen o un clip con IA sobre la foto real; avisa si no hay proveedor).
Entran por las familias "video" y "plantilla|estudio|navidad|…"; las de
lectura están en `READ_ONLY_TOOLS`.

## Producto vivo (etapa 3): el producto se mueve dentro del cuadro

Hasta la etapa 2 el vídeo movía la cámara (zoom) y las capas entraban
animadas; ahora **las capas se mueven de forma continua** mientras la escena
dura, como lo haría una pieza hecha con IA, pero sin IA y sin inventar nada:

* **Recorte sin IA** (`recorte.ts`, `recortarProducto`): si la foto es de
  estudio (fondo liso), se separa el producto por inundación desde el borde
  con tolerancia adaptada al ruido del fondo, se quita la **sombra
  proyectada** (mismo tono que el fondo, más oscura, bajo el producto), se
  borran las motas lejanas, se rellenan los brillos interiores pequeños y se
  mide una **confianza** (0–1). Solo se usa a partir de `UMBRAL_RECORTE`
  (0,72). Se rebaja o se descarta —con motivo en español— cuando:
  el fondo no es liso (`uniformidad < 0,6`), **la imagen es un montaje**
  (banner con textos e iconos sueltos: ≥ 6 piezas lejos del cuerpo, o ≥ 3 con
  ≥ 6 componentes → ×0,35; se usa entera para no comerse las letras), el
  producto es del color del fondo (**fuga** > 12 % tras cerrar y rellenar la
  máscara → ×0,5; una zapatilla blanca sobre gris no se recorta), ocupa casi
  toda la foto o está cortado por el borde. Un aro o un asa (un único hueco
  grande) no cuenta como fuga. Los PNG/WebP que ya traen alfa se respetan.
  Resultado: `/uploads/anuncios/<id>/recortes/<hash>.png`, guardado en
  `metadata.estudio.recortes[fotoUrl]` y reutilizado por todos los diseños.
* **Dónde se aplica** (`aplicarRecortes`): solo en las vitrinas `contener`
  (la foto completa) → capa `recortada: true` con `sombra` de silueta y sin
  esquinas. El fondo "foto difuminada" de esa misma foto se cambia por un
  **degradado del color de la marca** (una foto de estudio difuminada queda
  gris y deja un fantasma del producto detrás del recorte). Las fotos
  `cubrir` (tarjetas, collages) y los montajes siguen enteros.
* **Movimiento interno por capa** (`anim.movimiento` + `intensidad` 1–3):
  `flotar`, `latido`, `balancear`, `deriva`, `orbita`, `brillo` (barrido de
  luz) o `ninguno`. En ffmpeg cada grupo de capas con el mismo movimiento se
  pinta aparte (`agruparCapas`, máx. 14 grupos) y se superpone con
  expresiones por fotograma (`filtroMovimiento`), encima del fondo y debajo
  del contenido estático.
* **Cámara nueva**: además de `acercar`/`alejar`/`fijo`, `balanceo`,
  `respirar` y `giro3d` (perspectiva con sobreescaneo 1,06× y recorte para
  no dejar bordes).
* **Ambiente** (`Escena.ambiente`): partículas `nieve`, `confeti`,
  `corazones`, `burbujas`, `chispas`, `hojas` con sprite propio por ambiente;
  `undefined` = según el tema (`ambienteDeTema`), `null` = sin partículas.
* **Clip de fondo** (`Escena.clip`): un MP4 propio (o creado con IA, abajo)
  que vive bajo `IMAGE_STORE_DIR`; las capas van encima.
* `darVidaAEscenas` lo decide solo cuando nadie configuró movimiento: la
  foto del producto flota o late, el sello de precio late, las decoraciones
  se balancean, la cámara va rotando por escena y el tema trae sus
  partículas. Es idempotente y `pedirVideo` lo aplica salvo
  `productoVivo: false`.

## IA sobre la foto real (etapa 3)

Un espacio para crear **con IA pero sobre el producto real** (`ia.ts`): la
IA nunca parte de un texto solo; siempre recibe la foto del producto y, si
hay recorte, una **máscara de conservación** (`mascaraDeConservacion`) que
protege los píxeles del producto y solo deja pintar el fondo.

* **Proveedores por clave** (`proveedoresDeIA`, `hayIAConfigurada`): OpenAI
  `gpt-image-1` (imagen a imagen con máscara), Google Gemini
  `gemini-2.5-flash-image` (imagen a imagen), Google **Veo** (imagen a
  vídeo, 5–8 s desde la foto real), Replicate `flux-kontext-pro` (edición
  fiel). Claves: `OPENAI_API_KEY`/`AI_INTEGRATIONS_OPENAI_API_KEY`,
  `GOOGLE_API_KEY`/`GEMINI_API_KEY`, `REPLICATE_API_TOKEN`/`REPLICATE_API_KEY`;
  modelos con `ESTUDIO_IA_MODELO_*` y sondeo con `ESTUDIO_IA_SONDEO_MS`. Sin
  claves, `GET /ia` lo dice y el panel lo explica; todo lo demás sigue
  funcionando sin IA.
* **Instrucción fiel** (`instruccionFiel`): a la petición del dueño se le
  añade siempre "no cambies el producto, ni su forma, color, etiquetas o
  texto; solo el entorno".
* **Fidelidad** de cada creación (`CreacionIA.fidelidad`): `protegida` (se
  pintó con máscara y además se vuelve a pegar el recorte real encima),
  `verificada` (sin máscara, pero el desvío medio bajo la silueta del
  producto es < 0,18), `baja` (la IA tocó el producto: se guarda, pero no se
  deja usar como foto) o `no_verificable` (vídeo o sin recorte).
* **Flujo**: `POST /:productId/ia {tipo: "imagen"|"video", instruccion,
  foto, proveedor?, duracion?, conservarProducto?}` → 202 con la creación en
  cola (`ia:<id>:<creacionId>`); `POST /:productId/ia/:cid/usar {como:
  "foto"|"clip", escena?}` la mete como foto del contenido (y se recorta) o
  como clip de una escena; `DELETE /:productId/ia/:cid`. Nada entra solo al
  anuncio: el dueño elige.
* Panel: pestaña **IA** (`panel-ia.tsx`) con estado de proveedores, foto de
  partida, instrucción, galería de creaciones con su fidelidad y botones
  «Usar como foto» / «Usar como clip». Atlas: `estudio_recortar` y
  `estudio_ia_crear`.

## Editor del panel

* **Editor de imagen** (`editor-imagen.tsx`): Fabric a tamaño real escalado a
  la pantalla; mover/escalar/rotar; texto (contenido, tamaño, grosor,
  tipografía, color, alineación, resaltado, contorno), fotos
  (completa/rellenar, esquinas, sombra, cambiar por otra foto, subir propia),
  cajas y círculos, **elementos** (buscador de emojis/iconos/logos/formas,
  color), fondo (color, degradado, patrón, foto difuminada, oscurecer),
  **animación de entrada por capa** (solo cuenta en el vídeo), orden de capas,
  duplicar, borrar, deshacer/rehacer (Ctrl+Z/Y), atajos, «Plantilla» (guardar
  como propia). Guarda el Diseño + el JPG exportado.
* **Pestaña Plantillas** (página): buscador del catálogo con vista previa ya
  hecha con el producto, filtros por tema/categoría/formato, «Usar» crea la
  pieza al instante; «Mis plantillas» con borrar. Arriba, selector de estilo,
  tema y guion que aplica a «Generar».
* **Editor de imagen, novedades etapa 3**: tarjeta «Quitar el fondo» en la
  foto del producto (muestra confianza y motivo si no se puede) y selector
  de **movimiento interno** e intensidad por capa.
* **Editor de vídeo** (`editor-video.tsx`): tira de escenas con miniaturas,
  duración, locución, transición, movimiento de cámara (incluye balanceo,
  respirar y giro 3D), **ambiente** de partículas, **producto vivo**
  (recorte flotando) y clip de fondo (propio o de la pestaña IA),
  reordenar/duplicar/eliminar,
  "Editar diseño de la escena" (abre el editor de imagen en 9:16), voz
  (Salomé/Gonzalo), música. Al generar exporta cada fotograma en el navegador
  y lo sube; si falla, el servidor pinta las escenas él mismo.
* Los editores se cargan con `lazy()` (Fabric pesa ~300 KB) solo al abrirlos.

## Etapas

* **Etapa 1**: generador completo + editor de imagen + editor de vídeo por
  escenas.
* **Etapa 2 (esta)**: catálogo de plantillas (maqueta × estilo × tema),
  20 tipografías, elementos abiertos, fondos con degradado/patrón, temas por
  temporada/nicho con adornos, entradas animadas por capa, 21 transiciones,
  5 guiones, plantillas propias e importación de Fabric, herramientas de
  Atlas. Pendiente de esta etapa: línea de tiempo libre y subtítulos
  sincronizados con la voz.
* **Etapa 3 (esta)**: producto vivo (recorte sin IA con sombra, montaje y
  fuga detectados, movimiento interno por capa, cámara con balanceo/respirar/
  giro 3D, partículas de ambiente, clip de fondo) y el espacio de IA fiel a
  la foto real (proveedores por clave, máscara de conservación, fidelidad
  verificada, usar como foto o clip). Límites conocidos: el recorte es por
  color (fondo liso); con fondo de ambiente o producto del color del fondo
  se deja la foto entera y lo dice; el movimiento interno no se previsualiza
  en el lienzo del editor (solo en el vídeo); con fotogramas del navegador
  el servidor aplica ambiente pero no movimiento por capa ni clip.
* **Etapa 4**: biblioteca de música/stickers, kits de marca, variantes A/B
  automáticas, programación al calendario orgánico, previsualización del
  movimiento en el editor.

## Operación

* Requiere `ffmpeg` en el servidor para el vídeo (el Dockerfile lo instala);
  las imágenes no dependen de él. `GET /api/estudio-anuncios/salud` lo dice.
* Fuentes: Inter en `artifacts/api-server/assets/fonts/Inter-*.ttf`
  (`FUENTES_DIR` para moverlas); las otras 19 vienen de `@fontsource/*`
  (dependencias del api-server). Las que falten se pintan con Inter.
* Música opcional: pistas en `data/musica/*.mp3` (`MUSICA_DIR`).
* IA opcional: con `OPENAI_API_KEY`, `GOOGLE_API_KEY`/`GEMINI_API_KEY` o
  `REPLICATE_API_TOKEN` aparece la pestaña IA activa; sin ellas el Estudio
  funciona igual (recorte, movimiento y partículas son locales).
* Pruebas (69): `cd artifacts/api-server && node_modules/.bin/vitest run src/lib/__tests__/estudio-anuncios.test.ts src/lib/__tests__/estudio-plantillas.test.ts src/lib/__tests__/estudio-rutas-archivos.test.ts src/lib/__tests__/estudio-movimiento.test.ts src/lib/__tests__/estudio-ia.test.ts`.
