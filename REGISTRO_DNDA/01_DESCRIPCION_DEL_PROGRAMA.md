# DESCRIPCIÓN DEL PROGRAMA — VENTASPROIA

## 1. Identificación
**Nombre:** VentasProIA
**Naturaleza:** Programa de computador / plataforma SaaS de automatización comercial
**Versión de referencia:** estado del repositorio en el commit 823bdee6b6ce5dd593a64e624c9cef74dd8791c4
**Fecha de referencia:** 22 de septiembre de 2026
**Autor declarado:** Duvier Davey Mena Mosquera

## 2. Objeto
VentasPro es una plataforma de software orientada a la gestión y automatización de procesos comerciales mediante conversaciones digitales, especialmente WhatsApp. El sistema integra administración de negocios, productos y servicios, conversaciones, agentes de inteligencia artificial, pagos, tienda pública, analítica y herramientas de crecimiento.

## 3. Funciones principales
1. Administración de negocios y aislamiento multi-tenant.
2. Gestión de productos, categorías, servicios y fichas comerciales.
3. Gestión de conversaciones y clientes.
4. Integración de WhatsApp mediante Baileys y WhatsApp Cloud API (Graph API de Meta) como transporte alternativo activable por configuración.
5. Agentes especializados de atención y ventas.
6. Router de agentes y traspaso a especialistas.
7. Motor de ventas v1 y motor nuevo v2 activable por negocio.
8. Herramientas comerciales para obtener hechos desde la base de datos.
9. Generación de respuestas conversacionales mediante modelos de IA.
10. Gestión de pagos e integración con Mercado Pago y PayPal.
11. Tienda pública y procesos de checkout.
12. Integración con Facebook/Meta para catálogo y campañas.
13. Dashboard y analítica comercial.
14. Automatizaciones y tareas programadas.
15. Sistema de memoria y aprendizaje administrativo/estratégico.
16. Sistema de auto-reflexión curada de agentes, con versionado y posibilidad de rollback.
17. Panel web administrativo.
18. Arquitectura preparada para SQLite en desarrollo y PostgreSQL en producción.
19. Medición y cobro por conversación de WhatsApp Cloud API (excedente sobre el plan, con costo real y precio de venta configurables).
20. Desambiguación visual de productos (mostrar_opciones) con resolución de referencias ("el primero", "este") y prioridad de mostrar el precio antes de pedir datos de cierre.

## 4. Flujo funcional general
El cliente inicia una conversación. El sistema identifica el negocio/tenant, conserva el contexto de la conversación, determina el agente correspondiente y procesa la intención. El agente obtiene hechos comerciales mediante herramientas y genera una respuesta natural. Cuando corresponde, el sistema presenta información de producto, conduce al pago, registra el resultado y permite seguimiento.

## 5. Separación de agentes
El repositorio documenta una separación entre:
- Atlas/Operator: administración y operación estratégica.
- Agente vendedor de WhatsApp: atención directa al cliente.
- Especialistas: agentes destinados a determinados tipos de productos/servicios.

El camino crítico del vendedor de WhatsApp está diseñado para funcionar de forma independiente de Atlas y de OpenCode.

## 6. Inteligencia artificial
El sistema incluye una capa de integración con proveedores de IA y módulos destinados a generación de contenido, razonamiento comercial, análisis de conversaciones y optimización de agentes. Los hechos sensibles de venta —como precio, ficha, pagos y entrega— se diseñan para provenir de herramientas y datos del negocio, mientras el modelo redacta la conversación.

## 7. Seguridad funcional
La arquitectura documenta autenticación, validación de entradas, aislamiento por tenant, variables de entorno para secretos, verificación de webhooks y registros estructurados. La implementación concreta debe verificarse contra la versión depositada.

## 8. Interfaces
El sistema contiene:
- Backend API basado en Node.js/Express.
- Dashboard administrativo basado en React/Vite.
- Tienda pública.
- Interfaces y servicios de integración con WhatsApp y proveedores externos.

## 9. Alcance de la obra
El objeto de este registro es la expresión informática implementada en el código fuente y la documentación asociada, no la mera idea comercial, concepto de negocio o finalidad abstracta del sistema.

## 10. Estado de referencia
Este documento describe la versión concreta del repositorio indicada en la portada. No deben presentarse como implementadas funcionalidades que únicamente aparezcan en documentos de roadmap o planes futuros.
