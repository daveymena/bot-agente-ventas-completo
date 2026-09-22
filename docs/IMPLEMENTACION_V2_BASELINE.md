# IMPLEMENTACIÓN V2 — BASELINE (Fase 0)

Fecha: 2026-09-22. No se modificó comportamiento productivo en esta fase.

## Commit / versión
- Repo sin `.git` en `/app` (verificado `git rev-parse` → `fatal: not a git repository`).
- Baseline = árbol actual en disco al 2026-09-22 14:09 UTC.
- Motor nuevo en `artifacts/api-server/src/lib/motor-nuevo/` (7 fuentes + 7 tests).

## Configuración actual
- `MOTOR_VENDEDOR=v1` (defecto, `.env.example:122`). Desplegar no cambia nada.
- `MOTOR_VENDEDOR_TENANTS` (lista manual, ej. `3,7`) y `MOTOR_VENDEDOR_PORCENTAJE` (estable por negocio, sin parpadeo).
- Decisión explícita por negocio en `tenants.metadata.motorVendedor` (Atlas `vendedor_motor`, API `POST /api/whatsapp/motor`, `GET /api/whatsapp/motor`).
- Orden: metadata > env lista > porcentaje > defecto. Caché 60s (`activacion.ts`).
- V1 = camino por defecto (`agent.ts` `runAgentReply` 5.300 líneas). V2 enganchado en `try` con fallback automático a V1 si falla.

## Shadow mode
- Existe: `POST /api/whatsapp/sombra {conversationId|turnos}` (`routes/whatsapp.ts:152`).
- Corre V1 en conversación nueva + V2 en memoria (`correrEnSombra`, `adaptador.ts:428`), devuelve lado a lado + `evaluarChat` para cada uno. No escribe al cliente.
- Atlas: `vendedor_probar` (lectura), `vendedor_diagnosticar` (lectura, sin tokens, sobre chats reales vía `evaluador-de-chats.ts`).

## Almacenamiento
- Conversaciones: tabla `conversations`; estado V2 en `conversations.estado_agente` (`jsonb` PG / `text` SQLite, auto-migración, `null` = estado inicial, sin migración).
- Respuestas modelo: `messages` (role customer/agent) + `saveAgentMessage` (igual en V1 y V2 para inbox/reportes).
- Herramientas: no hay tabla propia; traza por turno (`traza[]`: herramienta/args/resultado) + `efectos[]` aplicados después (`dato`, `pago_reportado`, `escalar`) en `adaptador.ts:356`.
- V1 bug conocido no tocado: `currentProductId/Name` no existen en esquema (Drizzle descarta en silencio); V2 usa `estado_agente`.

## Tests (baseline)
- `vitest run src/lib/motor-nuevo`: **7 archivos, 114 tests, todos pasan** (2026-09-22).
  - `activacion 8, motor 40, cambio-producto-fase1 8, tres-negocios 13, cliente-llm 12, cierre 5, nicho 28`.
- `tsc --noEmit`: sin errores nuevos en `motor-nuevo`; solo `TS6305` preexistentes (`lib/db/dist` sin compilar) + errores viejos en `agent.ts`/`app.ts`/tests legacy.

## Comportamiento actual
- V2 apagado globalmente; hechos (precio/ficha/video/pagos/entrega) por herramientas desde la base; modelo solo conversa; única red = cifra inventada (reintento 1 vez, si insiste se corta la frase).
- Nicho derivado (digital/físico/servicio/mixto), no lista cerrada. Cambio producto Fase 1 (foco/anterior, invalida oferta, recarga guion). Retomada 8h. Cierre precio→pago.

## Riesgos
- Sin `.git` no hay rollback por commit; rollback = bandera a `v1` (inmediato, por negocio).
- `resumenPrevio` existe pero nadie lo escribe (historial se corta en 40). Conversaciones 60+ pierden contexto viejo.
- Sin `create_order`/stock; pago solo `pending` + aviso al dueño; escalado a `human`.
- Shadow compara texto+tarjetas+hallazgos, no `intent/product/tools/state/next_action` estructurado.

## Rollback
1. `POST /api/whatsapp/motor {"motor":"v1"}` o `MOTOR_VENDEDOR=v1` + `MOTOR_VENDEDOR_TENANTS=` vacío + porcentaje 0.
2. `invalidarMotor(tenantId)` (caché) — `fijarMotorDelTenant` ya lo hace.
3. Si conversación trabada: `vendedor_olvidar` (NULL a `estado_agente`).
4. V2 nunca borra V1; fallback automático ya cableado.
