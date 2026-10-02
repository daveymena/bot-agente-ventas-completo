# VentasPro — agente comercial omnicanal completo

**Decisiones del producto (2026-09-27)**

- Canales: modo mixto. Se conserva WhatsApp QR/Baileys y se suman las APIs oficiales de Meta para WhatsApp Cloud, Instagram y Messenger.
- Servicios: agenda interna multiempresa.
- Autonomía: controlada. El agente prepara y ejecuta operaciones reversibles; cobros, cancelaciones, devoluciones y excepciones requieren confirmación o intervención humana.

## Objetivo verificable

Un solo vendedor atiende productos, servicios o ambos desde WhatsApp, Instagram, Messenger, Telegram y webchat. Todos los canales usan el mismo catálogo, perfil de cliente, conversación, memoria, reglas, carrito/pedido/reserva y bandeja humana. El modelo redacta y decide qué herramienta solicitar; el servidor aporta los hechos y autoriza las acciones.

No se considera terminado por tener un prompt largo o una demostración. Deben pasar los contratos y pruebas de cada sección.

## Arquitectura

```text
Canales (adaptadores)
  WhatsApp QR | WhatsApp Cloud | Instagram | Messenger | Telegram | Webchat
                              |
                    Ingreso omnicanal común
           identidad -> deduplicación -> conversación -> cola
                              |
                    Motor vendedor v2 único
       contexto + catálogo + conocimiento + memoria + políticas
                              |
                   Herramientas transaccionales
 búsqueda | stock | carrito | pedido | pago | agenda | caso | handoff
                              |
          PostgreSQL/SQLite + auditoría + eventos + métricas
```

### Regla de aislamiento

Cada lectura y escritura lleva `tenantId`. Ningún token, contacto, producto, agenda, pedido, mensaje o memoria puede cruzarse entre negocios. La resolución del tenant se hace a partir del identificador receptor oficial (número, página, cuenta de Instagram, bot o widget), nunca con `tenantId = 1` como respaldo silencioso en un webhook público.

## Dominios obligatorios

### 1. Negocio y agente

- Perfil del negocio, marca, país, moneda, zona horaria, horario y cobertura.
- Productos físicos/digitales, servicios y catálogos mixtos.
- Políticas verificadas: entrega, cambios, garantía, cancelación, privacidad y pagos.
- Voz del agente, límites, herramientas permitidas y reglas de escalamiento.
- Base de conocimiento versionada con fuente, vigencia y responsable.
- Simulador y publicación segura de cambios.

### 2. Contacto e identidad omnicanal

- Un contacto puede tener varias identidades de canal.
- La unión automática solo ocurre con una señal verificada (teléfono confirmado, inicio de sesión o enlace firmado).
- Consentimiento por canal, finalidad, fecha y evidencia.
- Preferencias, idioma, ciudad, intereses, historial, etiquetas y responsable.
- Derecho a exportación, corrección y eliminación.

### 3. Conversación

- Bandeja unificada con canal, prioridad, etapa, SLA y responsable.
- Mensajes de texto, audio, imagen, documento, ubicación y respuestas a mensajes.
- Idempotencia por identificador externo del mensaje.
- Ordenación por timestamp del proveedor y control de eventos repetidos.
- Estado explícito del motor; no inferir hechos releyendo texto con regex.
- Handoff con resumen estructurado y pausa real de automatización.

### 4. Comercio de productos

- Búsqueda tolerante a errores y búsqueda semántica.
- Variantes, inventario, precio, impuestos, promociones y disponibilidad reales.
- Comparación y recomendación explicable.
- Carrito persistente por contacto/negocio.
- Cotización, pedido, dirección, envío y pago.
- Confirmación antes de crear el pedido final.
- Posventa: estado, cambio, garantía, devolución y escalamiento.

### 5. Servicios y agenda interna

Entidades mínimas:

- `service_offerings`: duración, buffers, precio fijo o cotizable, modalidad, sede y requisitos.
- `service_resources`: profesionales, equipos o espacios.
- `availability_rules`: horario recurrente por recurso y zona horaria.
- `availability_exceptions`: vacaciones, cierres y aperturas excepcionales.
- `appointments`: cliente, servicio, recurso, inicio/fin, estado, canal y conversación.
- `appointment_holds`: bloqueo temporal para evitar doble reserva.
- `appointment_events`: historial auditable.

Estados: `hold -> pending_confirmation -> confirmed -> completed`, con salidas `cancelled`, `no_show` y `expired`.

Contratos:

- Calcular slots en la zona horaria del negocio.
- Evitar solapamiento mediante transacción/índice, no solo desde la interfaz.
- Mantener un hold mientras el cliente confirma.
- Confirmar el resumen antes de reservar.
- Aplicar política de cancelación/reprogramación.
- Programar recordatorios idempotentes.
- Nunca afirmar disponibilidad antes de consultar la agenda.

### 6. Autonomía controlada

| Acción | Agente | Confirmación requerida |
|---|---|---|
| Buscar, comparar, responder | Ejecuta | No |
| Crear/editar carrito | Ejecuta | No |
| Crear hold de cita | Ejecuta | No |
| Confirmar pedido o reserva | Ejecuta | Sí, del cliente |
| Compartir enlace de pago | Ejecuta | Sí, resumen previo |
| Aplicar descuento | Solo dentro de reglas | Si excede regla: humano |
| Cancelar/reembolsar/cambiar pago | Prepara | Humano |
| Excepción de garantía o política | Prepara | Humano |
| Asuntos médicos, legales o de riesgo | Informa límites | Humano |

Toda herramienta debe producir: `operationId`, estado, resultado, error seguro, actor, tenant, timestamps e idempotency key.

## Canales

### WhatsApp QR/Baileys

Se conserva como adaptador. Debe publicar mensajes normalizados al ingreso común y usar el mismo servicio de salida. Reconexión, cola y deduplicación permanecen independientes del motor.

### WhatsApp Cloud API

Webhook firmado, resolución por `phone_number_id`, estados de entrega, plantillas para conversaciones fuera de ventana y soporte de medios. Nunca mezclar sus credenciales con Baileys.

### Instagram Messaging

Webhook oficial de Meta, resolución por cuenta profesional, mensajes/medios/respuestas y salida con token del tenant. Comentarios y menciones crean oportunidades, pero no se fusionan con DM sin evidencia.

### Messenger

Webhook oficial, resolución por `page_id`, eco/lectura/entrega ignorados, token por tenant y política de ventana de mensajería.

### Telegram

Bot vendedor separado del bot administrativo de Atlas. Resolución por token/bot del tenant, webhook secreto y soporte de texto/medios/callbacks.

### Webchat

Token público rotatorio por tenant, sesión firmada, rate limit, consentimiento y conexión por WebSocket/SSE con respaldo HTTP.

## Herramientas del vendedor

```text
buscar_catalogo             consultar_producto
comparar_opciones           consultar_disponibilidad
consultar_conocimiento      registrar_dato_cliente
crear_carrito               actualizar_carrito
preparar_cotizacion         solicitar_aprobacion_cotizacion
crear_resumen_pedido        confirmar_pedido
consultar_pedido            reportar_pago
buscar_slots                crear_hold_cita
confirmar_cita              reprogramar_cita
solicitar_cancelacion       crear_caso_soporte
escalar_a_humano            programar_seguimiento
```

Los precios, stock, slots, enlaces, pedidos, pagos y estados salen de herramientas. El LLM no puede inventarlos ni marcarlos como exitosos.

## Seguridad y confiabilidad

- Firmas de webhooks y secretos cifrados por tenant.
- RBAC, 2FA para administradores y auditoría inmutable de acciones sensibles.
- Rate limiting por IP, canal, tenant y contacto.
- Idempotencia de webhooks y operaciones.
- Cifrado en tránsito y secretos fuera del frontend/logs.
- Redacción de PII en telemetría.
- Protección contra prompt injection en fichas, documentos y mensajes.
- Límites de gasto y circuit breaker de proveedores de IA.
- Cola con reintentos y dead-letter queue.
- Fallback: si la IA falla, registrar el caso y transferir; nunca inventar.

## Observabilidad y calidad

Métricas por tenant/canal/agente:

- Primera respuesta, tiempo de resolución y SLA.
- Conversaciones atendidas, handoffs y abandono.
- Leads calificados, carritos, pedidos, reservas y conversión.
- Ingresos atribuidos y recuperación.
- Errores de herramienta, duplicados y mensajes no entregados.
- Afirmaciones no sustentadas detectadas.
- CSAT y motivos de pérdida.

Cada versión del agente se evalúa con conversaciones anonimizadas y escenarios sintéticos antes de publicarse. Debe existir rollback por tenant.

## Entrega incremental sin falsos “completado”

### Fase A — núcleo transaccional

1. Normalizador común de entrada/salida e identidad externa por tenant.
2. Agenda interna completa y herramientas de servicios.
3. Carrito/cotización/pedido con confirmación e idempotencia.
4. Handoff, permisos y auditoría.

**Aceptación:** pruebas de aislamiento, doble reserva, doble webhook, doble pedido, confirmaciones y fallos de proveedor.

### Fase B — canales

1. Llevar Messenger actual al ingreso común y eliminar tenant implícito.
2. Instagram Messaging oficial.
3. Telegram vendedor separado de Atlas.
4. Webchat.
5. Mantener Baileys y Cloud API como adaptadores paralelos.

**Aceptación:** la misma conversación de prueba produce las mismas decisiones comerciales en todos los canales y conserva la semántica propia de cada uno.

### Fase C — operación profesional

1. Bandeja omnicanal y perfil 360.
2. Constructor guiado de negocio/agente.
3. Panel de agenda, pedidos, aprobaciones y SLA.
4. Analítica, evaluación continua y alertas.
5. Retención, consentimiento y gestión de datos.

## Estado real encontrado en este repositorio

Ya existe una base considerable que debe reutilizarse:

- Motor vendedor v2 con estado explícito, herramientas, catálogo, conocimiento, pedidos, simulación y fallback.
- WhatsApp QR/Baileys y WhatsApp Cloud.
- Messenger, comentarios de Facebook y lead ads parcialmente implementados.
- Telegram administrativo para Atlas.
- Perfil multiempresa, agentes, productos, conversaciones, pagos y panel web.

Brechas que impiden llamar al sistema “completo” hoy:

- Instagram Messaging no está integrado al vendedor.
- Telegram existente es administrativo, no un canal de atención al cliente.
- `ChannelManager` no incluye Instagram, Telegram vendedor, WhatsApp Cloud ni webchat y todavía permite tenant por defecto.
- Messenger procesa webhooks sin resolver consistentemente el tenant desde la página receptora.
- Servicios registran el caso y solicitan cotización, pero no existe todavía una agenda transaccional que reserve slots.
- No existe todavía identidad omnicanal verificada ni carrito común para todos los canales.

Estas brechas se cierran por dominio y con pruebas; no agregando otro prompt o simulando éxito.