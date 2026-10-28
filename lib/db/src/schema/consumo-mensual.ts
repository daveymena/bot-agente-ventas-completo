import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * ============================================================
 * CUÁNTOS MENSAJES LLEVA CADA NEGOCIO ESTE MES
 * ============================================================
 *
 * ── Por qué hace falta una tabla ──────────────────────────────────────────
 *
 * El límite del plan YA se aplicaba: `agent.ts` y `agent-orchestrator.ts`
 * llaman a `checkMessageLimit` y cortan la respuesta cuando se pasa. El
 * contador también se incrementaba, en `whatsapp.ts`, con cada envío.
 *
 * Lo que faltaba es que ese contador SOBREVIVIERA. Vivía en
 * `private costStorage: Map<string, UsageMetrics>` -- memoria del proceso.
 * Cada reinicio lo pone en cero, y un despliegue es un reinicio: el 2026-09-07
 * hubo doce.
 *
 * Resultado: un límite perfectamente implementado que nadie alcanza jamás,
 * porque se compara contra un número que se borra solo. Un cliente de Starter
 * (USD 19, 1.500 mensajes) puede mandar 20.000 y costar USD 66. La pérdida no
 * se ve al vender: aparece en la factura del mes siguiente.
 *
 * ── Por qué por período y no un contador que se resetea ───────────────────
 *
 * Guardar "mensajes de este mes" en una columna obliga a alguien a ponerla en
 * cero el día 1, y ese alguien es un trabajo programado que puede no correr.
 * Con una fila por (negocio, período) el mes nuevo simplemente no existe
 * todavía y cuenta cero solo, sin que nadie tenga que acordarse.
 *
 * Y de paso queda el historial: cuánto consumió cada cliente cada mes es
 * justo lo que hace falta para saber si un plan da o no da.
 */
export const consumoMensual = pgTable(
  "consumo_mensual",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    /** "2026-09". Se guarda como texto para poder agrupar sin funciones de fecha. */
    periodo: text("periodo").notNull(),
    /** Mensajes que el negocio ENVIÓ. Es lo que cuesta plata. */
    mensajes: integer("mensajes").notNull().default(0),
    respuestasIa: integer("respuestas_ia").notNull().default(0),
    /** Contadores del día UTC actual, reiniciados por cambio de fecha al sumar. */
    dia: text("dia").notNull().default(""),
    mensajesDia: integer("mensajes_dia").notNull().default(0),
    respuestasIaDia: integer("respuestas_ia_dia").notNull().default(0),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // Una sola fila por negocio y mes. Sin esto, dos envíos simultáneos crean
    // dos filas y el conteo queda partido -- que es la forma silenciosa de que
    // un límite deje de aplicarse.
    porNegocioYPeriodo: uniqueIndex("consumo_mensual_tenant_periodo").on(t.tenantId, t.periodo),
  }),
);

export type ConsumoMensual = typeof consumoMensual.$inferSelect;
