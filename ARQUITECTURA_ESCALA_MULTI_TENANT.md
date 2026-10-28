# Ruta de escalabilidad multi-tenant de VentasPro

**Estado:** auditoría inicial y primera optimización de consultas.
**Objetivo:** crecer en negocios y conversaciones sin mezclar datos, duplicar respuestas ni degradar el servicio.

## Lo que ya existe

- Los datos principales incluyen `tenant_id` y la API resuelve el tenant desde la sesión.
- WhatsApp Web (Baileys) crea una instancia y un directorio de sesión por negocio.
- El orquestador limita la concurrencia global del proceso y evita trabajar dos veces en la misma conversación dentro de ese proceso.
- Hay un outbox PostgreSQL opcional y un bloqueo asesor que impide iniciar dos runtimes con las mismas sesiones.
- Las consultas de inbox/historial usan índices compuestos nuevos por tenant/conversación.

Esto da aislamiento funcional en un runtime, pero **no equivale todavía a escalado horizontal ni a capacidad ilimitada**.

## Hallazgos que condicionan el crecimiento

1. **Un solo gateway de Baileys.** El lock asesor de PostgreSQL impide que dos procesos sean dueños de las sesiones; un gateway único sigue siendo necesario hasta repartir explícitamente sesiones por tenant.
2. **Outbox compartido con reclamo por fila.** Los workers usan `FOR UPDATE SKIP LOCKED`, lease renovable y token de versión para reclamar mensajes; además, solo un worker procesa una conversación a la vez. Producción exige PostgreSQL. El buffer local se carga por lotes acotados.
3. **Concurrencia global, no por plan/tenant.** `AGENT_CONCURRENCIA` se aplica al proceso entero. No hay presupuestos de cola ni límites de equidad por negocio más allá del orden rotatorio de tenants.
4. **Memoria proporcional a las sesiones.** Cada socket Baileys y su estado viven en el mismo proceso. El monitor evita ciertos sockets obsoletos, pero no hay asignación/rebalanceo entre nodos.
5. **Índices insuficientes en rutas calientes.** Las búsquedas por negocio/teléfono, inbox por estado/última actividad e historial por conversación podían recorrer tablas crecientes. Se añadieron índices compuestos idempotentes para PostgreSQL y SQLite.
6. **Arranque de mensajería.** El bootstrap configura explícitamente el tenant `1`; los mensajes de otros tenants pueden entrar por las instancias conectadas, pero la configuración operativa debería descubrir los tenants activos desde base de datos y aplicar límites consistentes.

## Arquitectura objetivo

### Fase 1 — Base de producción segura

- PostgreSQL como base de producción; SQLite solo para desarrollo/local.
- Outbox durable obligatorio en producción y visible en health checks.
- Una sola réplica del runtime combinado mientras Baileys, el scheduler y la cola permanezcan en proceso.
- Índices tenant-first en consultas de lectura; migraciones verificables antes de aceptar tráfico.
- Límites de concurrencia, mensajes, conexiones y proveedores IA configurables y documentados.

### Fase 2 — Aislamiento y control de carga

- Revisar rutas/repositorios para garantizar que cada lectura y escritura de negocio filtra por `tenant_id`.
- Unicidad compuesta para entidades que no pueden duplicarse dentro de un tenant (por ejemplo, teléfono normalizado por canal), luego de limpiar duplicados históricos.
- Transacciones al crear lead + conversación + primer mensaje.
- Idempotencia duradera por `(tenant_id, provider_message_id)`; evitar deduplicar mensajes legítimos solo por texto y ventana temporal.
- Cuotas justas por tenant, backoff, límites de tasa y estados visibles para mensajes fallidos o demorados.

### Fase 3 — Escalado horizontal de workers

- El código ya admite `VENTASPRO_PROCESS_ROLE=combined` (predeterminado), `gateway` o `worker`: el gateway es dueño de los sockets y persiste entradas; los workers reclaman trabajos de PostgreSQL y envían respuestas por un endpoint interno autenticado.
- El lock asesor permite varias réplicas `worker`; los reclamos usan leases y fencing tokens para que un worker atrasado no sobrescriba ni envíe si perdió su reclamo.
- El gateway guarda recibos de entrega por ID para que una repetición HTTP después de un envío confirmado no vuelva a mandar el mismo contenido. Mantener el gateway en una sola réplica y montarle el volumen persistente de autenticación. Iniciarlo primero y esperar `/api/ready`; luego iniciar workers. `WHATSAPP_GATEWAY_URL` debe ser HTTPS en producción y `WHATSAPP_GATEWAY_TOKEN` debe ser el mismo secreto largo en ambos servicios.
- El reclamo limita por defecto a 2 trabajos activos por tenant entre todos los workers (`AGENT_MAX_EN_PARALELO_TENANT`, máximo 16), para que una ráfaga de un negocio no ocupe todos los espacios.
- El servicio worker debe permanecer en la red interna, sin dominio público. El gateway sigue ejecutando los programadores; el worker solo procesa la cola de conversaciones.
- Presupuestar conexiones: cada worker usa por defecto `DB_POOL_MAX=8` más su conexión de lock; fijar `DB_POOL_MAX` según el límite total de PostgreSQL y la cantidad de réplicas. El pool de conexión debe mantener sesiones (no transaction pooling), porque los locks asesores viven en una conexión.
- El gateway envía respuestas por la sesión dueña; ningún worker puede enviar por un número ajeno.
- Reintentos con dead-letter, métricas de edad/profundidad de cola y recuperación tras caída.
- La topología de roles está implementada en código, pero no activada en EasyPanel: el despliegue sigue usando `combined` hasta configurar y verificar esas variables y servicios.

### Fase 4 — Operación y crecimiento medible

- Métricas por tenant y globales: p95 de API, profundidad/edad de cola, mensajes fallidos, sockets, memoria, CPU, conexiones de DB y costo IA.
- Alertas por saturación, desconexión prolongada, errores de base y consumo anormal.
- Pruebas de carga con mezcla de tenants, mensajes por conversación y desconexiones; fijar SLOs antes de subir límites.
- Retención/archivado de mensajes, índices revisados con `EXPLAIN`, backups y restauración ensayada.

## Criterios antes de declarar “listo para muchos usuarios”

- El aislamiento tenant pasa pruebas cruzadas en todas las rutas críticas.
- Reinicios no pierden mensajes entrantes ni duplican respuestas.
- Una caída o ráfaga de un negocio no bloquea a los demás.
- El comportamiento de cola y sesiones está probado con la topología exacta desplegada.
- Hay límites y alarmas; la carga objetivo se mide con datos y no se promete como “ilimitada”.

## Cambios de esta etapa

- El backend ahora inicializa PostgreSQL y ejecuta las migraciones antes de importar `app.ts`, cuyos efectos laterales arrancan WhatsApp y los programadores. `/ready` no acepta tráfico hasta que la base responda, las migraciones terminen sin fallos, existan las tablas esperadas y, en producción, la cola de WhatsApp tenga persistencia PostgreSQL saludable.
- El consumidor refresca desde PostgreSQL lotes acotados y reclama trabajos con lease/`SKIP LOCKED`, fencing token y exclusión por conversación. El worker envía la respuesta al gateway mediante un endpoint interno con token comparado en tiempo constante.
- Añadidos índices compuestos para conversaciones por tenant/teléfono, inbox por estado/actividad e historial de mensajes por conversación/rol.
- Los índices se crean idempotentemente en PostgreSQL y SQLite para instalaciones existentes.
- Se eliminó el relleno automático de medios de pago del tenant con credenciales del servidor; las integraciones que el negocio ya guardó se conservan, incluso si coinciden con las del propietario.
- El prompt del vendedor ahora se arma desde los medios que ese tenant tiene conectados; las plantillas genéricas ya no recomiendan cuentas o pasarelas fijas. El motor v2 se niega a emitir la acción de pago si el negocio no tiene un medio integrado/configurado.
- Enrutamiento de agentes y lectura/escritura de asignación ahora validan también el tenant de la conversación.
- Producción deja de permitir cola de WhatsApp volátil: PostgreSQL/outbox es requisito de arranque.

## Límite actual

El código permite separar gateway y workers, pero no se ha desplegado ni validado en la topología de EasyPanel. El gateway continúa siendo único; el servicio worker también levanta HTTP y debe mantenerse privado. Antes de activar el rol dividido hay que configurar la red interna HTTPS, el secreto compartido y el volumen persistente solo en el gateway.
