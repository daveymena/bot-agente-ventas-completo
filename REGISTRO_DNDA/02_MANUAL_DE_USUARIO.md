# MANUAL DE USUARIO — VENTASPRO

## 1. Introducción
VentasPro permite administrar un negocio y automatizar parte de su atención comercial mediante WhatsApp y agentes de inteligencia artificial.

## 2. Acceso al sistema
El administrador accede al panel web mediante las credenciales configuradas para el negocio. La instalación puede ejecutarse localmente o desplegarse en infraestructura de servidor compatible.

## 3. Configuración inicial
1. Configurar variables de entorno.
2. Configurar la base de datos.
3. Crear/configurar el usuario administrador.
4. Configurar el negocio (tenant).
5. Configurar identidad y datos comerciales.
6. Configurar proveedores de IA cuando se utilicen.
7. Conectar WhatsApp.
8. Crear o importar productos/servicios.
9. Configurar métodos de pago e integraciones necesarias.

## 4. Gestión de productos
El administrador puede crear y modificar productos y servicios con información comercial, precios, categorías, imágenes y otros datos utilizados por los agentes.

## 5. Gestión de WhatsApp
El sistema permite conectar una cuenta mediante el mecanismo de WhatsApp implementado en el proyecto, obtener el estado de conexión, recibir conversaciones y enviar respuestas.

## 6. Conversaciones
El panel permite consultar conversaciones y su contexto. El agente responde de acuerdo con el negocio, los productos disponibles, las reglas comerciales y el estado de la conversación.

## 7. Agentes
El sistema contempla agentes con diferentes roles. Sofía, en la versión de referencia, funciona como recepcionista: recibe al cliente, identifica lo que busca y puede derivarlo al especialista correspondiente. Otros agentes pueden atender dominios comerciales específicos.

## 8. Compra y pagos
Cuando el cliente demuestra intención de compra, el flujo puede conducir a los mecanismos de pago configurados. Los pagos y sus estados se registran en el sistema cuando la integración correspondiente está habilitada.

## 9. Tienda pública
La plataforma incluye una tienda pública asociada al negocio, con consulta de productos y flujo de compra.

## 10. Facebook/Meta
El sistema contiene módulos para integración con catálogo y publicidad de Meta. Las acciones que impliquen publicación o gasto deben operar según los controles y confirmaciones implementados.

## 11. Analítica
El administrador puede consultar métricas y resultados comerciales disponibles en el sistema, incluyendo información relacionada con conversaciones y ventas.

## 12. Administración multi-tenant
Cada negocio se maneja como un tenant y sus datos deben mantenerse aislados mediante las reglas de acceso y consultas correspondientes.

## 13. Motor de ventas
El repositorio contiene un motor tradicional y un motor nuevo. El motor nuevo se activa por negocio y utiliza herramientas/estado explícito para evitar que el modelo invente hechos comerciales.

## 14. Auto-reflexión
La versión de referencia incorpora un módulo de auto-reflexión curada. Su ejecución está desactivada por defecto y puede activarse mediante la configuración correspondiente. El mecanismo analiza señales agregadas, genera una posible lección, la filtra y, si procede, aplica una mejora aditiva con versionado para permitir rollback.

## 15. Buenas prácticas
- Mantener precios y datos comerciales actualizados.
- No introducir secretos en el código.
- Configurar correctamente los proveedores externos.
- Revisar permisos y credenciales.
- Probar cambios antes de desplegarlos.
- Mantener respaldos de la base de datos.
