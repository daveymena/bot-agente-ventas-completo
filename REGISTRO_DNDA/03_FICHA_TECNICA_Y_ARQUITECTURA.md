# FICHA TÉCNICA Y ARQUITECTURA — VENTASPROIA

## 1. Tipo de arquitectura
Monorepo administrado con pnpm workspaces, con backend, frontend administrativo, librerías compartidas y tienda pública.

## 2. Tecnologías identificadas en la documentación y estructura del repositorio
- Node.js / TypeScript
- Express
- React
- Vite
- Tailwind CSS
- Drizzle ORM
- SQLite para escenarios locales
- PostgreSQL para producción
- Zod
- JWT
- Baileys
- Integraciones con proveedores de IA
- Mercado Pago
- PayPal
- Integraciones Meta/Facebook
- Nodemailer
- Docker/EasyPanel como infraestructura documentada

## 3. Componentes principales
### Backend
Ruta principal: artifacts/api-server/
Responsabilidades:
- API HTTP
- autenticación y autorización
- lógica comercial
- conversaciones
- agentes
- WhatsApp
- pagos
- integraciones
- analítica
- tareas programadas
- multi-tenancy

### Frontend
Ruta principal: artifacts/ventas-pro/
Dashboard administrativo construido con React/Vite.

### Librerías compartidas
Ruta principal: lib/
Incluye base de datos, validaciones, especificaciones API, cliente React e integraciones.

### Tienda
Ruta principal: packages/tienda/
Interfaz de tienda pública.

## 4. Motor conversacional
El sistema documenta:
- AgentOrchestrator.
- whatsapp-brain.
- agent-router.
- plantillas de agentes.
- motor de ventas v1.
- motor de ventas nuevo.
- herramientas comerciales.
- memoria administrativa.
- analítica de respuestas.

## 5. Datos
La arquitectura utiliza un modelo multi-tenant. La persistencia se apoya en Drizzle y puede operar con SQLite o PostgreSQL según el entorno.

## 6. Integraciones
### WhatsApp
Baileys y servicios internos de mensajería.

### Pagos
Mercado Pago y PayPal según configuración del negocio.

### Meta
Módulos para página/catálogo/campañas y automatización publicitaria.

### IA
Capa de abstracción de proveedores de IA y generación de respuestas/contenido.

## 7. Seguridad
Se documentan:
- JWT.
- validación Zod.
- consultas parametrizadas.
- aislamiento por tenant.
- variables de entorno.
- validación de webhooks.
- logging estructurado.
- controles de acceso.

## 8. Despliegue
El proyecto contiene configuración y scripts para despliegue mediante contenedores y EasyPanel.

## 9. Identificación técnica de la versión
Repositorio: daveymena/bot-agente-ventas-completo
Rama: master
Commit: 823bdee6b6ce5dd593a64e624c9cef74dd8791c4
Mensaje: fix(motor-v2): responder el precio antes de pedir datos y reconocer 'que vale'
Fecha del commit: 23 de septiembre de 2026

## 10. Nota sobre exactitud
Esta ficha se elaboró a partir de la estructura y documentación existentes en el repositorio. Para el depósito debe conservarse una copia íntegra e inalterada de la versión de código que se declare como obra depositada.
