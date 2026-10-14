# VentasPro Stock

Banco de recursos creativos con licencia — fotos, vectores, ilustraciones, vídeos HD/4K, audio, plantillas y 3D — construido como réplica funcional de [Adobe Stock](https://stock.adobe.com/es), en español y con precios en COP. Es un paquete independiente del monorepo (`@workspace/stock`): tiene su propia base de datos, usuarios y servidor, y no toca el panel de VentasPro ni el motor de WhatsApp.

## Qué incluye

**Portal público (compradores)**

- Portada con buscador grande, modo *Buscar / Generar*, pestañas por tipo (Todos, Imágenes, Vídeos, Audio, Plantillas, 3D, Gratis, Prémium), colecciones curadas, categorías populares, FAQ y banner de prueba gratuita.
- Búsqueda de texto completo (SQLite FTS5 + bm25): sin acentos, por prefijo, sinónimos español ⇄ inglés (`coffee cup` encuentra "taza de café"), sugerencias relacionadas, facetas por tipo y tiempo de respuesta.
- Búsqueda visual (subís una imagen y encuentra parecidas por color y dHash).
- Panel de filtros plegable: tipo, orientación, color, precio (gratis / estándar / prémium), IA generada, editorial, personas y cantidad, tamaño mínimo, duración y resolución de vídeo, colaborador, periodo, SafeSearch y orden (relevancia, recientes, descargas, sin descubrir).
- Rejilla justificada tipo Adobe con badges HD/4K y duración, previsualización de vídeo al pasar el cursor y reproductor de audio con forma de onda.
- Ficha de recurso: previsualización con marca de agua, caja de licencia (estándar / ampliada, cobertura por suscripción, créditos), metadatos técnicos, palabras clave, serie, recursos similares y más del mismo colaborador; descarga de comp.
- Bibliotecas (colecciones privadas y públicas), cuenta con historial de licencias, certificados de licencia en HTML, descargas, créditos y pedidos.
- Planes y paquetes de créditos calcados del modelo de Adobe (suscripciones mensuales con cuota de vídeo, paquetes de 5 a 150 créditos, licencias ampliadas, comparativa y FAQ). Pago por Mercado Pago (opcional) o transferencia confirmada por el admin.
- AI Studio: generación de imágenes desde texto (con cualquier API compatible con OpenAI) y publicación de las generaciones al catálogo como recursos "IA generada".

**Portal de colaboradores**

- Alta como colaborador, subida de archivos (imagen ≥ 4 MP, vídeo, audio, SVG/plantillas), autoetiquetado con IA, series, metadatos y liberaciones de modelo/propiedad, cola de revisión, estadísticas, regalías (33 % imágenes, 35 % vídeo/audio) y solicitud de pagos.

**Administración**

- Moderación (aprobar/rechazar con motivos, destacar), gestión de recursos, usuarios y créditos, pedidos, pagos a colaboradores, categorías, colecciones curadas y textos de la portada.

## Stack

| Capa | Tecnología |
| --- | --- |
| API | Node 22 · Express 5 · `@libsql/client` (SQLite local con FTS5, SQL plano) · sharp · ffmpeg opcional |
| Web | React 19 · Vite 7 · Tailwind 4 · Radix UI · TanStack Query 4 · react-router 7 · zustand |
| Medios | Miniatura (`-t.webp`), tarjeta (`-c.webp`), previsualización con marca de agua (`-p.webp` / `-comp.mp4`), streaming con `Range` para audio/vídeo, originales fuera del directorio público |
| Tests | Vitest: unitarios (búsqueda, precios, metadatos MP4, sinónimos) + smoke de la interfaz con jsdom contra la API real |

## Arranque rápido

```bash
# desde la raíz del monorepo
pnpm install
pnpm --filter @workspace/stock dev       # API en :3010 + Vite en :5180 (proxy /api y /media)
```

La primera vez, la API crea la base de datos y genera un catálogo de demostración (10 fotos, 20 vectores/plantillas procedurales, 8 vídeos si hay ffmpeg y 5 pistas de audio). Para regenerarlo desde cero:

```bash
pnpm --filter @workspace/stock seed -- --reset
```

### Cuentas de demostración (contraseña `demo12345`)

| Rol | Correo |
| --- | --- |
| Administración | `admin@stock.local` (contraseña `admin12345` en desarrollo) |
| Colaboradores | `laura@stock.local`, `andres@stock.local`, `camila@stock.local` |
| Cliente con créditos | `cliente@stock.local` |

### Producción

```bash
pnpm --filter @workspace/stock build     # dist/public (web) + dist/server/index.mjs (API)
pnpm --filter @workspace/stock start     # un solo proceso sirve API + interfaz en STOCK_PORT
```

o con Docker desde la raíz del repo:

```bash
docker build -f Dockerfile.stock -t ventaspro-stock .
docker run -p 3010:3010 -v stock-data:/app/artifacts/stock/data \
  -e STOCK_SESSION_SECRET=una-cadena-larga-y-aleatoria \
  -e STOCK_ADMIN_EMAIL=admin@tudominio.com -e STOCK_ADMIN_PASSWORD=una-clave-segura \
  ventaspro-stock
```

Variables en [.env.example](.env.example). En producción `STOCK_SESSION_SECRET` (≥ 16 caracteres) y `STOCK_ADMIN_PASSWORD` son obligatorias; `STOCK_SEED_DEMO=false` desactiva el catálogo demo. Todo el estado vive en `STOCK_DATA_DIR` (por defecto `artifacts/stock/data/`): base SQLite, originales privados y derivados públicos.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` / `dev:api` / `dev:web` | Desarrollo (API con `tsx watch`, web con Vite) |
| `pnpm build` | `vite build` + `node build.mjs` (esbuild; sharp y libsql quedan externos) |
| `pnpm start` | Sirve `dist/` en producción |
| `pnpm seed [-- --reset]` | Datos base y catálogo demo |
| `pnpm typecheck` | `tsc` para web (`tsconfig.json`) y servidor (`tsconfig.server.json`) |
| `pnpm test` | Vitest (requiere la API en `:3010` para `tests/web.smoke.test.tsx`; los unitarios no) |

## Estructura

```
artifacts/stock/
├── server/            API Express
│   ├── routes/        public, assets, auth, billing+licenses, collections, contributor, admin, ai
│   ├── lib/           search (FTS5), media (sharp/dHash/probeMp4), ffmpeg, ingest, commerce, auth, ai, synonyms
│   └── db/            client (libsql), migrate (esquema + FTS5 + triggers), seed, seed-cli
├── shared/            tipos y reglas de precios compartidas con la web
├── web/               SPA React (pages, components, store, lib)
├── seed/              fotos de demostración y generadores procedurales (SVG, audio, vídeo)
├── tests/             unitarios + smoke jsdom
├── build.mjs          empaquetado de la API
└── data/              (ignorado) base de datos y medios
```

## API (resumen)

Todas las rutas cuelgan de `/api` y responden JSON; los errores son `{ error, details? }`. Sesión por cookie HMAC `stock_session`.

- Público: `GET /meta`, `/categories`, `/trending`, `/home`, `/search`, `POST /search/visual`, `GET /assets/:id`, `/assets/:id/similar|series|contributor-more|comp|stream`, `/contributors/:id`, `/collections/:slug`, `/licenses/text`, `/billing/catalog`, `/ai/status`.
- Cuenta: `POST /auth/register|login|logout|password`, `GET|PATCH /auth/me`, `/auth/sessions`, `/auth/credits/transactions`; bibliotecas `/collections/mine` + CRUD; `GET /licenses/quote`, `POST /licenses`, `GET /licenses[/:id[/download|certificate]]`; pedidos `/billing/orders`.
- Colaborador: `POST /contributor/join`, `/contributor/upload` (multipart), `/contributor/autotag`, `GET|PATCH|DELETE /contributor/assets`, `/contributor/stats|earnings|payouts`.
- Admin: `/admin/stats|assets|users|orders|payouts|categories|collections|settings` y acciones `approve|reject|paid|cancel|resolve`.
- IA: `POST /ai/generate`, `GET /ai/generations`, `POST /ai/generations/:id/publish`.

## Decisiones

- **Sin dependencia de CDN externos**: todo el catálogo demo se genera localmente (fotos incluidas en `seed/photos`, el resto procedural), así la demo funciona sin internet.
- **SQLite + FTS5** en lugar de Postgres/Elastic: cero infraestructura adicional y suficiente para cientos de miles de recursos; el módulo `server/lib/search.ts` concentra el ranking para poder cambiar de motor después.
- **Un solo proceso** en producción (API + estáticos) para desplegar como un servicio más en EasyPanel.
- **Diseño**: Inter autoalojada, paleta clara con acentos índigo (misma familia visual que el panel VentasPro), rejilla justificada y filtros laterales como Adobe Stock, *mobile-first*.
