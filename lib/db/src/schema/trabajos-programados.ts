import { integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * ============================================================
 * TRABAJOS PROGRAMADOS — EL RELOJ DEL SISTEMA
 * ============================================================
 *
 * Hasta acá el sistema sabía HACER cosas pero no sabía CUÁNDO. Publicar en la
 * página funciona (`facebook-page-posts.ts`), el plan de contenido de la
 * semana se arma solo (`calendario-de-contenido.ts`), y las reglas de pauta
 * están escritas (`reglas-de-pauta.ts`). Lo que faltaba era el reloj que una
 * las tres: nadie publicaba el martes a las 19:00, y nadie apagaba los
 * anuncios a las 2 de la mañana.
 *
 * ── Por qué una tabla y no `setInterval` ─────────────────────────────────
 *
 * `setInterval` ya se usa en `ad-growth-agent.ts` y sirve para "cada 30
 * minutos", pero no para "el martes a las 19:00", y tiene un defecto que este
 * proyecto ya pagó: **cada despliegue vuelve el reloj a cero**. Está
 * documentado en ese mismo archivo -- entre despliegues seguidos, el guardián
 * de gasto no llegaba a correr nunca y su historial marcaba "0 revisiones".
 *
 * Con la fecha en la base, un reinicio no pierde nada: el trabajo sigue
 * pendiente con su hora, y el primer arranque que llegue tarde lo ejecuta.
 *
 * ── `clave` y por qué es única ───────────────────────────────────────────
 *
 * Publicar dos veces el mismo post es peor que no publicarlo: le ensucia la
 * página al negocio y no hay forma elegante de deshacerlo. La clave describe
 * el trabajo de forma estable (por ejemplo `organico:12:2026-W36:mar-19`), así
 * que reprogramar la semana dos veces --o dos instancias del servidor
 * corriendo a la vez-- no puede generar el duplicado: la segunda inserción
 * choca contra el índice único.
 */
export const trabajosProgramados = pgTable(
  "trabajos_programados",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),

    /** Qué hay que hacer. Cada valor lo atiende un manejador en `programador.ts`. */
    tipo: text("tipo").notNull(),

    /** Identificador estable del trabajo. Ver la nota de arriba. */
    clave: text("clave").notNull(),

    /** Cuándo toca. En UTC; la hora local del negocio se resuelve al programar. */
    correAt: timestamp("corre_at", { withTimezone: true }).notNull(),

    /** pendiente | corriendo | hecho | fallado | cancelado */
    estado: text("estado").notNull().default("pendiente"),

    datos: jsonb("datos").$type<Record<string, any>>().notNull().default({}),
    resultado: jsonb("resultado").$type<Record<string, any> | null>().default(null),

    intentos: integer("intentos").notNull().default(0),
    error: text("error"),

    /**
     * Minutos hasta la próxima repetición, o null si es de una sola vez.
     *
     * Se guarda en la fila y no en el código para que un trabajo ya creado
     * conserve su ritmo aunque el código cambie: si mañana se decide que la
     * guardia horaria corre cada 30 y no cada 15, los trabajos viejos siguen
     * con lo que tenían hasta que alguien los reprograme a propósito.
     */
    repiteCadaMin: integer("repite_cada_min"),

    creadoAt: timestamp("creado_at", { withTimezone: true }).defaultNow().notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    claveUnica: uniqueIndex("trabajos_programados_clave_idx").on(t.clave),
  }),
);

export type TrabajoProgramado = typeof trabajosProgramados.$inferSelect;
export type NuevoTrabajoProgramado = typeof trabajosProgramados.$inferInsert;
