# Estudio de anuncios (VentasPro)

Una petición por producto → paquete completo de creativos hechos con las
**fotos reales** del producto: 12 imágenes (4 plantillas × 1:1, 4:5 y 9:16)
y un vídeo vertical de 15–30 s. Todo editable desde el panel
(`/estudio-anuncios`) con un editor de lienzo (Fabric.js) y un editor de vídeo
por escenas. Disponibilidad alta: sale aunque falten Chromium, la IA, Pexels o
la voz; solo necesita `sharp` (imágenes) y `ffmpeg` (vídeo).

## Dónde vive

| Pieza | Ruta |
|---|---|
| Esquema de diseño, plantillas, escenas | `artifacts/api-server/src/lib/estudio-anuncios/diseno.ts` |
| Contenido del anuncio (qué se dice) | `…/estudio-anuncios/contenido.ts` |
| Render servidor (sharp + Inter en contornos) | `…/estudio-anuncios/render.ts`, `tipografia.ts`, `assets/fonts/` |
| Vídeo por escenas (ffmpeg + edge-tts) | `…/estudio-anuncios/video.ts` |
| Cola con reintentos | `…/estudio-anuncios/cola.ts` |
| Orquestador + persistencia | `…/estudio-anuncios/estudio.ts` |
| Fotogramas sin Chromium para el motor viejo | `…/estudio-anuncios/fotogramas.ts` (lo usa `video-anuncio.ts` si puppeteer no arranca) |
| API | `artifacts/api-server/src/routes/estudio-anuncios.ts` → `/api/estudio-anuncios` |
| Panel | `artifacts/ventas-pro/src/pages/estudio-anuncios.tsx`, `components/estudio/editor-imagen.tsx`, `editor-video.tsx`, `lib/estudio/` |
| Pruebas | `artifacts/api-server/src/lib/__tests__/estudio-anuncios.test.ts` |

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

## Editor del panel

* **Editor de imagen** (`editor-imagen.tsx`): Fabric a tamaño real escalado a
  la pantalla; mover/escalar/rotar; texto (contenido, tamaño, grosor, color,
  alineación, resaltado), fotos (completa/rellenar, esquinas, sombra, cambiar
  por otra foto, subir propia), cajas y círculos, fondo (color, foto
  difuminada, oscurecer), orden de capas, duplicar, borrar, deshacer/rehacer
  (Ctrl+Z/Y), atajos. Guarda el Diseño + el JPG exportado.
* **Editor de vídeo** (`editor-video.tsx`): tira de escenas con miniaturas,
  duración, locución, transición, movimiento, reordenar/duplicar/eliminar,
  "Editar diseño de la escena" (abre el editor de imagen en 9:16), voz
  (Salomé/Gonzalo), música. Al generar exporta cada fotograma en el navegador
  y lo sube; si falla, el servidor pinta las escenas él mismo.
* Los editores se cargan con `lazy()` (Fabric pesa ~300 KB) solo al abrirlos.

## Etapas

* **Etapa 1 (esta)**: generador completo + editor de imagen + editor de vídeo
  por escenas. Tipografía única (Inter 400/700/900).
* **Etapa 2**: línea de tiempo libre (recortar/solapar clips, subtítulos
  sincronizados con la voz), más elementos (flechas, iconos, degradados en
  texto), más tipografías, plantillas por nicho.
* **Etapa 3**: biblioteca de música/stickers, kits de marca, variantes A/B
  automáticas, programación al calendario orgánico.

## Operación

* Requiere `ffmpeg` en el servidor para el vídeo (el Dockerfile lo instala);
  las imágenes no dependen de él. `GET /api/estudio-anuncios/salud` lo dice.
* Fuentes: `artifacts/api-server/assets/fonts/Inter-*.ttf` (licencia OFL).
  `FUENTES_DIR` para moverlas.
* Música opcional: pistas en `data/musica/*.mp3` (`MUSICA_DIR`).
* Pruebas: `cd artifacts/api-server && node_modules/.bin/vitest run src/lib/__tests__/estudio-anuncios.test.ts`.
