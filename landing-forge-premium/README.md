# Landing Forge Premium – VentasProIA

Generador de landing pages de alta conversión para tráfico pago de Facebook e
Instagram, conectado al catálogo real de la tienda
`https://ventasproia.com/tienda/sofia-premium`.

Cubre los tres tipos de oferta:

| Tipo | Qué hace |
| --- | --- |
| **Físico (dropshipping)** | Formulario de pago contra entrega con los 32 departamentos y sus ciudades, resumen del pedido, WhatsApp prellenado y webhook. |
| **Digital (cursos, packs, plantillas)** | Entrega inmediata, temario, bonos, precio ancla. **Nunca** menciona pago contra entrega ni envíos. |
| **Servicio** | Agenda por WhatsApp, proceso en pasos, planes y alcance por escrito. |

Es un módulo **independiente**: vive en su propia carpeta, con su propio
`package.json`, y no toca el monorepo. Todo el motor está en `src/premium/` y se
importa desde un único barril (`src/premium/index.ts`).

---

## 1. Cómo correrlo

```bash
cd landing-forge-premium
npm install
cp .env.example .env.local      # opcional: funciona sin configurar nada
npm run dev                     # http://localhost:3000
```

| Ruta | Qué es |
| --- | --- |
| `/premium` | El generador (panel de 7 pasos + vista previa en vivo). |
| `/premium/demo` | Matriz de **4 plantillas × 4 temas** con productos reales. |
| `/l/{slug}` | La landing publicada, HTML autocontenido. |
| `/` | Portada del módulo con los accesos. |

Otros comandos:

```bash
npm run typecheck   # tsc --noEmit
npm run build       # build de producción (salida standalone)
npm start           # sirve el build en 0.0.0.0:3000
```

### Con Docker

```bash
docker build -t landing-forge-premium .
docker run -p 3000:3000 --env-file .env.local -v landings:/app/.data landing-forge-premium
```

El volumen `/app/.data` guarda las landings publicadas en `/l/{slug}`.

---

## 2. Flujo del panel

1. **Producto** — buscador + grilla del catálogo real, filtros por tipo y
   categoría. Tres modos: catálogo, **Servicio** (se arma a mano tomando las
   fotos de un producto real) y **Pegar JSON** (respaldo si la API no responde).
2. **Plantilla y tema** — 4 plantillas y 4 temas con sugerencia automática según
   el tipo de producto y la categoría, más selector de color de acento.
3. **Público y ángulo** — nivel de conciencia (frío / conoce el problema /
   conoce el producto) y ángulo de venta (dolor, deseo, ahorro, regalo,
   estatus). Cada cambio regenera el copy.
4. **Oferta** — precio, precio tachado, paquetes por cantidad, bonos, garantía,
   fecha real de fin de promoción, envío gratis, contra entrega, financiación y
   **reseñas reales cargadas a mano**.
5. **Textos** — todos los campos del copy editables por grupos, listas de
   beneficios/temario/FAQ y un botón opcional de *pulir con IA*.
6. **Secciones** — reordenar arrastrando, ocultar con el ojo, quitar y agregar
   secciones del registro completo.
7. **Exportar** — **Descargar HTML**, **Copiar código**, **Copiar link UTM**,
   abrir en pestaña, **publicar en `/l/{slug}`**, configurar Pixel/CAPI/webhook y
   copiar la plantilla como JSON `{ theme, sections: [{ type, props }] }`.

La vista previa va en marco de **celular y escritorio**, y el texto se **edita
haciendo clic directamente sobre la landing**: el cambio sube al panel por
`postMessage` y queda guardado en el borrador.

Los borradores se guardan solos en `localStorage` (`lf_drafts_v1`) y se listan en
*Mis landings*.

---

## 3. Las 4 plantillas

| Id | Nombre | Para | Secciones |
| --- | --- | --- | --- |
| `cod-product` | Producto COD | Físico | barra, hero, marquee, beneficios bento, problema→solución, cómo se usa, paquetes, reseñas, garantía, envío, FAQ, formulario, relacionados, cierre + barra fija y WhatsApp flotante |
| `advertorial` | Advertorial / Listicle | Físico, público frío | artículo, cuerpo, listicle, oferta, reseñas, paquetes, garantía, envío, FAQ, formulario, relacionados, cierre |
| `digital-course` | Curso / Infoproducto | Digital | hero con mockup, acceso inmediato, para quién es/no es, temario, bonos, precio ancla, garantía, FAQ, CTA final |
| `service-whatsapp` | Servicio WhatsApp | Servicio | hero, proceso, qué incluye, galería, planes, garantía, FAQ, cierre |

## 4. Los 4 temas

| Id | Estética |
| --- | --- |
| `clean-luxe` | Fondo `#FAF7F2`, serif editorial + Inter. Moda, joyería, belleza, hogar, regalos. |
| `bold-sport` | Space Grotesk / Archivo Black, lima y naranja eléctrico. Deporte, herramientas, tecnología. |
| `soft-wellness` | Salvia y arena, formas orgánicas en SVG. Salud, cuidado personal, mascotas, cocina. |
| `dark-tech` | `#0B0B12`, degradados violeta-azul y tarjetas glass. Cursos y productos digitales. |

Los temas son **variables CSS**: `themeCssVars(theme)` emite los tokens y el
acento se puede sobreescribir con un color propio desde el panel.

---

## 5. Integración con tu generador

Todo se importa desde el barril:

```ts
import {
  renderLanding,
  renderLandingDocument,
  createLandingDocument,
  suggestTemplate,
  suggestTheme,
  TEMPLATES,
  THEMES,
  normalizeProductPayload,
} from '@/premium';

// 1. Normaliza el payload de la API pública
const { store, product, related } = normalizeProductPayload(await res.json());

// 2. Crea el documento (JSON serializable, es lo que guardas en tu base)
const doc = createLandingDocument({ product, store, related });

// 3. Renderiza
const html = renderLandingDocument(doc);
```

O con la firma que pide el brief:

```ts
const html = renderLanding(product, store, {
  slug: 'ab-roller',
  template: 'cod-product',
  theme: 'bold-sport',
  settings: doc.settings,
  sections: doc.sections,   // [{ id, type, props, hidden }]
  related,
});
```

El documento guardado tiene esta forma:

```jsonc
{
  "version": 1,
  "slug": "ab-roller-fitness-wheel",
  "template": "cod-product",
  "theme": "bold-sport",
  "accent": null,
  "store": { "...": "..." },
  "product": { "...": "..." },
  "settings": { "offer": {}, "copy": {}, "tracking": {}, "utm": {} },
  "sections": [{ "id": "hero-product_a1b2", "type": "hero-product", "props": {} }]
}
```

Para cambiar dónde se guardan las landings publicadas, reemplaza las cuatro
funciones de `src/lib/landing-store.ts` (`saveLanding`, `getLanding`,
`listLandings`, `deleteLanding`) por tu propio repositorio. Nada más depende de
ellas.

---

## 6. Datos: proxy y respaldo

El navegador nunca llama a la tienda directo (CORS). Todo pasa por rutas de
servidor con caché de 5 minutos:

| Ruta | Origen |
| --- | --- |
| `GET /api/store/products` | `/api/public/products/{slug}` |
| `GET /api/store/product/{id}` | `/api/public/product/{slug}/{id}` |
| `GET /api/store/whatsapp` | `/api/public/whatsapp-info/{slug}` |
| `POST /api/store/product/{id}` | Modo manual: le pasas el JSON pegado |
| `POST /api/store/order` | Reenvía el pedido al webhook configurado |
| `POST /api/store/capi` | Conversions API de Meta (token solo del servidor) |
| `POST /api/store/ai-copy` | Pulido opcional del copy con un LLM |
| `GET/POST/DELETE /api/store/publish` | Landings publicadas en `/l/{slug}` |

La normalización resuelve lo que trae la API real: precios como `"60000.00"`,
rutas relativas `/uploads/...` y `/images/...`, URLs absolutas de CloudFront y
Google Drive, `image: ""`, `images: []` y `features` con emoji al inicio.

Si la tienda no responde, el módulo cae a los **datos de semilla**
(`src/premium/data/seed.ts`): productos reales copiados de la API, para que el
panel y la demo funcionen sin conexión. El panel avisa cuando está en ese modo.

---

## 7. Medición

- **Meta Pixel** con el `pixelId` del catálogo (editable en el panel):
  `PageView`, `ViewContent` (con `content_ids`, `value` y `currency: "COP"`),
  `InitiateCheckout` y `Lead` o `Purchase` al enviar el pedido.
- **Conversions API** opcional: el token se lee de `META_CAPI_TOKEN` en el
  servidor y **nunca** viaja al navegador. Se hashean con SHA-256 teléfono,
  nombre, apellido, ciudad y país; se reenvían `fbc`, `fbp`, IP y user agent, y
  se manda el mismo `event_id` que el Pixel para deduplicar.
- Se capturan y guardan `utm_source`, `utm_medium`, `utm_campaign`,
  `utm_content`, `utm_term` y `fbclid`, y viajan con cada pedido.
- El Pixel **no se dispara en la vista previa** del panel.

Link para el anuncio:
`https://tu-dominio/l/{slug}?utm_source=facebook&utm_medium=paid&utm_campaign={slug}`

---

## 8. Reglas de honestidad (políticas de Meta)

Están en el código, no solo en la documentación:

- **Cero reseñas inventadas.** Se cargan a mano; si no hay, la sección
  desaparece.
- **Cero contadores falsos.** La cuenta regresiva solo existe si configuras una
  fecha real; nunca se reinicia sola. Sin "quedan 3 unidades".
- **Cero promesas médicas.** `sanitizeClaims()` y `BANNED_PATTERNS` bloquean
  "clínicamente probado", "cura", "aprobado por la FDA" y similares, tanto en el
  copy por plantillas como en la salida del LLM opcional.
- **Cero marcas de terceros** en los titulares.
- **Nunca** se habla de pago contra entrega en productos digitales.
- **Las fotos salen únicamente del producto de la tienda** (`image`, `images` y
  las de `related`). No hay stock, ni Unsplash, ni imágenes generadas. Si el
  producto tiene una sola foto, se reutiliza con recortes, encuadres y fondos de
  color distintos (`object-position`, zoom, marco), nunca estirada ni pixelada:
  `object-fit: contain` sobre fondo de color y `cover` solo cuando la foto lo
  permite.

---

## 9. Sistema de diseño

- Escala tipográfica fluida con `clamp()`: H1 de 40–64 px en escritorio y
  32–40 px en móvil, `letter-spacing` negativo, antetítulos en mayúsculas.
- Rejillas asimétricas 7/5, fondos alternados, tarjetas bento, numerales
  grandes `01 · 02 · 03`, franja marquee de sellos.
- Microinteracciones con `IntersectionObserver`, sin librerías, respetando
  `prefers-reduced-motion`.
- Un solo set de íconos SVG de línea (estilo Lucide) en `src/premium/icons.ts`.
  Los emojis solo aparecen en el copy tipo anuncio, y se pueden apagar.
- Botones de CTA de 52 px o más y contraste AA.
- `loading="lazy"`, `decoding="async"` y `display=swap` en las fuentes.
- El HTML exportado es **autocontenido**: CSS y JS embebidos, sin dependencias.
  Pesa entre 85 y 115 KB según la plantilla.

Todo el texto de la interfaz y de las landings está en **español de Colombia**,
con precios en COP formateados como `$60.000`, y el diseño es **mobile-first**.

---

## 10. Estructura

```
src/
├─ premium/                  ← el motor (lo único que necesitas para integrar)
│  ├─ index.ts               API pública
│  ├─ render.ts              renderLanding / renderLandingFull / buildUtmLink
│  ├─ types.ts               tipos del documento
│  ├─ themes.ts              4 temas + tokens CSS + sugerencia por categoría
│  ├─ templates/index.ts     4 plantillas como listas de secciones
│  ├─ sections/              31 renderers (core, article, digital, service)
│  ├─ copy/                  ángulos, familias de producto y generador sin IA
│  ├─ runtime/               CSS y JS que se embeben en la landing
│  ├─ data/                  32 departamentos de Colombia + datos de semilla
│  ├─ store.ts               normalización de la API pública
│  ├─ icons.ts               set de íconos de línea
│  └─ format.ts              COP, slugify, escape, utilidades
├─ components/forge/         el panel (React, solo cliente)
├─ lib/                      proxy con caché, almacén de landings, demo
└─ app/                      rutas: /premium, /premium/demo, /l/[slug], /api/store/*
```
