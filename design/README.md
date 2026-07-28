repo: daveymena/bot-agente-ventas-completo
branch: main
path: artifacts/ventas-pro, packages/tienda

## Last sync
date: 2026-07-26T06:13:27Z
commit: da72870bc656

### Updated in this project
- Repositorio corregido: ahora apunta a daveymena/bot-agente-ventas-completo
- Menú lateral alineado con upstream: se retiró "Arquitecto Visual" (ya no existe en layout.tsx)
- Verificadas las 13 entradas de navegación y el bloque de estado de WhatsApp contra el código actual

## Screen map
| Pantalla | Archivo de diseño | Origen en el repo |
| --- | --- | --- |
| Shell + Panel | VentasPro.dc.html | artifacts/ventas-pro/src/components/layout.tsx, src/pages/dashboard.tsx |
| Conversaciones | VentasPro.dc.html | artifacts/ventas-pro/src/pages/conversations.tsx |
| Productos | VentasPro.dc.html | artifacts/ventas-pro/src/pages/products.tsx |
| Prospectos | VentasPro.dc.html | artifacts/ventas-pro/src/pages/leads.tsx |
| Agentes IA | VentasPro.dc.html | artifacts/ventas-pro/src/pages/agents.tsx |
| App móvil | VentasPro Movil.dc.html | rediseño nuevo (sin equivalente en el repo) |
| Tienda pública | Tienda.dc.html | packages/tienda/src/pages/Shop.tsx, PublicLayout.tsx |
| Panel de tienda | Tienda.dc.html | rediseño nuevo (referencia: packages/tienda/src/pages/AdminDashboard.tsx) |

Tokens: índigo #4F46E5, slate #0F172B, superficie #F8FAFC, tipografía Inter.
Catálogo: products_to_gen.json (cursos digitales, precios en USD).
Imágenes: artifacts/ventas-pro/public/images/products/{41,42,43,44,45,46,47}.jpg
(48.jpg está corrupto en el repo — no se puede decodificar).
Logotipo rediseñado en assets/: logo-mark.svg, logo-sidebar.svg, logo.svg.

## Sync history
- 2026-07-25 — sincronización inicial contra eladiosmena-debug/bot-agente-ventas (repo equivocado, vacío)
