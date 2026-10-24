# VentasPro: infraestructura, campañas y Studio

## Resultado y límite de capacidad

No se certifica capacidad para 1.000 negocios ni para 1.000 conversaciones simultáneas.
No se ha accedido al servidor ni a sus métricas, cuotas de IA o PostgreSQL de producción.
El sistema actual conserva un runtime de sesiones y tareas programadas. Duplicar
réplicas sin particionar sesiones y programadores puede duplicar envíos y tareas.
Meta Cloud sigue limitado al tenant configurado por sus variables actuales.

## Cambios

- Outbox PostgreSQL opcional: guarda trabajos, reintentos y respuesta generada;
  recupera pendientes al reiniciar. Se activa con WHATSAPP_DURABLE_QUEUE=true.
  Requiere conexión PostgreSQL directa o pool por sesión, permisos CREATE TABLE
  y una conexión reservada. Un advisory lock rechaza otro runtime con esta opción.
  TODOS los runtimes deben usar la misma configuración; no mezclar activado/desactivado.
- Antes de enviar se espera persistencia de la respuesta. Entrega al menos una vez:
  una caída entre envío y confirmación durable todavía puede repetir una respuesta.
- Reparto de turnos entre negocios, reintentos con espera y consulta de conversación
  filtrada por tenant. La concurrencia global sigue en 4; AGENT_CONCURRENCIA permite
  ajuste hasta 128, que es un tope de configuración, no capacidad validada.
- Restauración de sesiones guardadas con concurrencia limitada (WA_STARTUP_CONCURRENCY,
  defecto 4). Solo se crean sesiones con identidad del negocio real cargada.
- DB_POOL_MAX ajustable (20 por defecto). Reservar conexiones para outbox y operación.
- Consultas del panel cada 30–60 segundos; navegación agrupada y pantallas cargadas
  bajo demanda. Bundle principal bajó de aproximadamente 2.084 kB a 376 kB sin gzip
  en las compilaciones locales; no equivale a una medición de latencia en producción.
- Campañas: producto → objetivo/presupuesto → revisión/generación de borrador.
  El botón no publica en Meta; la configuración manual permanece disponible.
- Studio: Academia editorial, Digital nocturno y Boutique esencial como maquetas
  de creativos y temas de landing editables. Preview y publicación usan el mismo retoque.
- Dirección de imagen por tipo de producto y variante; excluye páginas completas
  dentro de imágenes. Se modifica el generador, no el catálogo existente.

## Validación ejecutada

Backend y frontend compilados. 34 pruebas seleccionadas pasan: outbox durable con
almacén simulado, restauración limitada, reparto entre tenants, pruebas existentes
de cola y Studio. No se probó el almacén con PostgreSQL real, ni WhatsApp/Meta real,
ni generación con proveedores de imagen, ni revisión visual completa de navegador.
El typecheck general y la suite completa no se consideran aprobados por este reporte.

## Despliegue y validación pendiente

1. Staging con PostgreSQL y copia sanitizada de datos, secretos propios, sin clientes.
2. Activar outbox solo en staging. Verificar segundo runtime rechazado, reinicio
   con pendientes, pérdida de conexión, restauración y retención de credenciales.
3. Simular carga de API autenticada y conversaciones: 100, 500 y 1.000 negocios;
   medir p95, errores, espera de cola, CPU, RAM y conexiones de PostgreSQL.
4. Medir cuota de IA: mensajes por segundo y tokens por respuesta. Aumentar
   AGENT_CONCURRENCIA gradualmente según mediciones, nunca por número de cuentas.
5. Probar UI a 390, 430, 1024, 1280 y 1440 px, modo oscuro y textos largos.
6. Regenerar imágenes en copia del catálogo, revisar producto por producto y
   publicar las aprobadas. No hay reemplazo masivo de fotos en esta entrega.
7. Para múltiples runtimes: separar gateway Baileys, sesiones con propietario,
   trabajos con reclamación atómica y programadores con liderazgo antes de replicar.

Fuentes técnicas: https://www.postgresql.org/docs/17/explicit-locking.html
(advisory locks por sesión); https://github.com/WhiskeySockets/Baileys
(recomendación de auth persistente de producción). Se usan como documentación,
no como evidencia de capacidad de esta instalación.

El workflow gstack mencionado por AGENTS.md no está instalado en este entorno.
La revisión se realizó leyendo el diff, compilando y ejecutando las pruebas indicadas.
