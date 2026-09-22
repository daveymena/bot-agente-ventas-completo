# MOTOR V2 — IMPLEMENTACIÓN CONTROLADA (Misión 2)

## Arquitectura

```
MENSAJE CLIENTE → INTERPRETACIÓN (modelo) → ESTADO ÚNICO → DECISIÓN
→ ¿TOOL? NO→RESPUESTA / SÍ→TOOL→RESULTADO→ACTUALIZAR ESTADO→RESPUESTA→ESTADO FINAL
```

- El modelo interpreta y conversa. El estado representa la realidad.
- Las herramientas proveen los hechos (precio/ficha/video/pagos/entrega desde la base).
- La base persiste (`conversations.estado_agente`). El historial es contexto, no verdad.
- Sin regex para reconstruir hechos. Sin OpenCode en runtime.

## Estado (`estado-conversacion.ts`)
Base previa + Fase 1 (todo aditivo, `normalizarEstado` backward-compat) + multimodelo:
- `productoEnFoco/productoAnterior`, `seccionesEnviadas`, `ultimaOferta`, `datos`, `objecionesVistas`, `etapa`, `turnos`, timestamps, `resumenPrevio`, `escalado`.
- Fase 1: `intencionActual/Anterior`, `preguntaPendiente`, `accionPendiente`, `hechosEntregados/Pedidos`, `compra`, `pago`, `entregaEstado`, `ultimaHerramienta`, `ultimaPreguntaAgente`, `ultimoMensajeClienteTexto`, `siguienteAccion`, `resumenActualizadoEn`.
- Multimodelo: `contextosPrevios[]` (máx 5, para "y la cámara?" tras la laptop), `detalleProducto{variante,cantidad,stock,stockEstado}`, `servicio{necesidad,alcance,citaCuando,cotizacion}`, `consultoria{problema,objetivo,tipoNegocio,alcance,cotizacion}`, `pasosCompletados[]`, `pagoMetodo`, `entregaMetodo`. `datos` suma `cantidad/alcance/problema/objetivo`.
- Helpers: `registrarIntencion/Herramienta/HechoEntregado/Pedido`, `actualizarResumenDesdeEstado`, `apilarContexto`, `marcarPaso`.

## Herramientas (`herramientas.ts`)
12 herramientas (9 previas + `anotar_contexto` + `consultar_disponibilidad` + `registrar_caso` + `solicitar_cotizacion`).
- `buscar_en_catalogo` solo consulta (IDF 2/3). `mostrar` emite maquetas y mueve `compra/pago/entrega` + `hechosEntregados`, apila contexto previo y marca pasos. `enfocar_producto` actualiza foco+anterior, invalida oferta vieja, recarga guion, apila contexto.
- `consultar_disponibilidad` lee `products.stock` real: sin stock configurado → "reviso y confirmo" (nunca inventa); agotado → no ofrecer; variante inexistente → no afirmar. Guarda `detalleProducto{variante,cantidad,stock,stockEstado}`.
- `registrar_caso` (servicio: necesidad/alcance/cita; consultoría: problema/objetivo/alcance) + efecto `dato` para notas del lead. `solicitar_cotizacion` → `cotizacion=en_proceso`, `siguienteAccion=preparar_cotizacion`, sin inventar valor.
- `registrar_dato` guarda + efecto `dato` (ciudad+dirección → `entregaEstado=datos_listos`). `que_falta_para_cerrar` pide UNO y fija `accionPendiente/siguienteAccion`. `registrar_pago_reportado` → `compra=pago_reportado, pago=reportado`, efecto para aviso al dueño, nunca confirma. `escalar_a_humano` → `esperar_humano` + efecto.
- Toda excepción → `{ok:false}` en traza + `ultimaHerramienta`, nunca éxito falso (F7). `motor.ts` registra cada tool en estado.

## Memoria (F5)
- `MENSAJES_DE_HISTORIAL=40` al modelo; `cargarHistorial` trae últimos 60 y recorta.
- `resumenPrevio` = resumen de HECHOS derivado del estado (`actualizarResumenDesdeEstado`), se genera si `historial>30` o cada 10 turnos. No hay resumidor LLM (pendiente explícito, no simulado).
- Retomada 8h (`volvioDespuesDe`) con timestamp real del cliente.

## Procesos (F4)
- Digital: producto→precio→pago (sin dirección; `entregaEstado=no_aplica`).
- Físico: + nombre/ciudad/dirección (`calificacionDe`), `entregaEstado` pendiente→listos.
- Contraentrega: si `condiciones.pagoEnvio` la menciona, `cargarGuion` agrega medio "Contraentrega".
- Servicio: necesidad+cuándo obligatorios; caso vía `registrar_caso`, cotización vía `solicitar_cotizacion` (sin precio inventado).
- Consultoría: problema→objetivo→alcance→cotización en proceso; nunca precio fijo inventado.
- `create_order`/pedido aún no existe: el motor nunca afirma `pedido_creado` (cubierto por test 26).

## Shadow (F11) + detector (F12)
- `POST /api/whatsapp/sombra` corre V1 (conversación nueva) y V2 (`correrEnSombra`, en memoria) + `evaluarChat` en ambos. V2 no envía.
- `correrEnSombra` ahora devuelve por turno: texto, tarjetas, `intencion/producto/toolCalls/state/nextAction`.
- `detector-regresiones.ts`: `clasificarTurno`/`compararConversacion` → `SAFE/BETTER/REGRESSION/UNCERTAIN` + `conversation_id/turn/intent/product/tools/state/next_action`. Reglas deterministas (sin modelo). Solo clasificación técnica.

## Activación (F13) y rollback
- `MOTOR_VENDEDOR=v1` defecto. Orden: `tenants.metadata.motorVendedor` > `MOTOR_VENDEDOR_TENANTS` > `PORCENTAJE` estable > defecto. Caché 60s.
- Prender: `POST /api/whatsapp/motor {motor:v2}` o Atlas `vendedor_motor` (aprobación reforzada). Probar antes: `POST /api/whatsapp/sombra`, Atlas `vendedor_diagnosticar` → `vendedor_probar`.
- Rollback inmediato: mismo endpoint con `{motor:v1}` (limpia caché) o env a `v1`; conversación trabada → `vendedor_olvidar`. Fallback auto a V1 si V2 lanza.

## Observabilidad (F14)
Log `[MOTOR-V2] turno` en `adaptador.ts`: mensaje (200 ch), estado antes (foco/anterior/intención/oferta/compra/pago), intención detectada, producto activo, herramientas, estado después, siguiente acción, proveedor/modoPlan/corregido/forma. Sin datos sensibles completos.

## V1 intacto (F15)
No se tocó `agent.ts` ni ruta productiva. V1 sigue defecto y fallback.

## Tests
- `motor-nuevo`: **9 archivos, 163 tests, pasan** (114 previos + 31 `mision-fase10` + 18 `conversaciones-reales`: digital, sí/ese/primero, cambios, objeción/garantía, compra pendiente, físico con stock real, variante, contraentrega, pago no confirmado, servicio, consultoría, multicotexto cámara+laptop).
- Cobertura F10: productos 1-6, referencias 7-12, cambios 13-17, compras 18-21, errores 22-26, largas 27-30.
- `tsc --noEmit`: sin errores nuevos en `motor-nuevo` (solo `TS6305` preexistentes por `dist` sin compilar).

## Pendiente honesto
1. Resumidor LLM de charlas 60+ (hoy hechos-extracto, suficiente pero básico).
2. `create_order`/stock/pedido + `pedido_creado/entregado`; `follow_ups` no alimentado por V2.
3. Probar en negocio real de pruebas con sombra antes; retirar módulos V1 solo tras diagnóstico limpio.
