/**
 * Cola durable de trabajos de Meta, sobre Postgres.
 *
 * Reglas:
 * - Todo trabajo lleva `tenant_id` y `cuenta` (id de la cuenta publicitaria).
 * - Concurrencia 1 por cuenta: el reclamo bloquea la fila de la cuenta en
 *   `meta_cuentas_cola` con FOR UPDATE SKIP LOCKED, así que dos workers nunca
 *   ejecutan trabajos de la misma cuenta a la vez, pero sí de cuentas distintas.
 * - Arriendo (lease): un trabajo en curso vuelve a pendiente si el worker
 *   murió y el arriendo venció.
 * - Idempotencia: (tenant_id, clave_idempotencia) es único.
 *
 * La cola recibe un `Sql` inyectado para poder probarla con PGlite (Postgres
 * real en WASM) y usarla con el `pool` de producción.
 */

export interface Filas {
  rows: Record<string, unknown>[];
}

export interface Sql {
  query(texto: string, params?: unknown[]): Promise<Filas>;
  transaccion<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
}

export const ESTADOS = ["pendiente", "en_curso", "hecho", "fallido"] as const;
export type EstadoTrabajo = (typeof ESTADOS)[number];

export const DDL_COLA: string[] = [
  `CREATE TABLE IF NOT EXISTS meta_cuentas_cola (
     tenant_id INTEGER NOT NULL,
     cuenta TEXT NOT NULL,
     creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (tenant_id, cuenta)
   )`,
  `CREATE TABLE IF NOT EXISTS meta_trabajos (
     id BIGSERIAL PRIMARY KEY,
     tenant_id INTEGER NOT NULL,
     cuenta TEXT NOT NULL,
     tipo TEXT NOT NULL,
     payload JSONB NOT NULL DEFAULT '{}'::jsonb,
     clave_idempotencia TEXT,
     estado TEXT NOT NULL DEFAULT 'pendiente',
     intentos INTEGER NOT NULL DEFAULT 0,
     max_intentos INTEGER NOT NULL DEFAULT 5,
     disponible_en TIMESTAMPTZ NOT NULL DEFAULT now(),
     arrendado_hasta TIMESTAMPTZ,
     ultimo_error TEXT,
     creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
     actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS meta_trabajos_idempotencia
     ON meta_trabajos (tenant_id, clave_idempotencia)
     WHERE clave_idempotencia IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS meta_trabajos_cola
     ON meta_trabajos (estado, disponible_en)`,
  `CREATE INDEX IF NOT EXISTS meta_trabajos_tenant
     ON meta_trabajos (tenant_id, creado_en)`,
];

export async function migrarCola(sql: Sql): Promise<void> {
  for (const ddl of DDL_COLA) await sql.query(ddl);
}

export interface NuevoTrabajo {
  tenantId: number;
  cuenta: string;
  tipo: string;
  payload?: Record<string, unknown>;
  claveIdempotencia?: string;
  maxIntentos?: number;
}

export interface Trabajo {
  id: number;
  tenantId: number;
  cuenta: string;
  tipo: string;
  payload: Record<string, unknown>;
  intentos: number;
  maxIntentos: number;
}

/** Espera antes del siguiente intento: 30 s, 60 s, 120 s… con tope de 1 h y jitter. */
export function esperaDeReintento(intento: number, azar: () => number = Math.random): number {
  const base = Math.min(3_600_000, 30_000 * 2 ** Math.max(0, intento - 1));
  const jitter = base * 0.2 * azar();
  return Math.round(base + jitter);
}

function aTrabajo(fila: Record<string, unknown>): Trabajo {
  return {
    id: Number(fila.id),
    tenantId: Number(fila.tenant_id),
    cuenta: String(fila.cuenta),
    tipo: String(fila.tipo),
    payload: (fila.payload as Record<string, unknown>) ?? {},
    intentos: Number(fila.intentos),
    maxIntentos: Number(fila.max_intentos),
  };
}

/**
 * Encola un trabajo. Si ya existe uno con la misma clave de idempotencia para
 * el mismo negocio, no crea otro y devuelve `null`.
 */
export async function encolar(sql: Sql, nuevo: NuevoTrabajo): Promise<number | null> {
  if (!Number.isInteger(nuevo.tenantId) || nuevo.tenantId <= 0) throw new Error("tenantId inválido");
  if (!nuevo.cuenta) throw new Error("cuenta requerida");
  return sql.transaccion(async (tx) => {
    await tx.query(
      `INSERT INTO meta_cuentas_cola (tenant_id, cuenta) VALUES ($1, $2)
       ON CONFLICT (tenant_id, cuenta) DO NOTHING`,
      [nuevo.tenantId, nuevo.cuenta],
    );
    const { rows } = await tx.query(
      `INSERT INTO meta_trabajos (tenant_id, cuenta, tipo, payload, clave_idempotencia, max_intentos)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       ON CONFLICT (tenant_id, clave_idempotencia) WHERE clave_idempotencia IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        nuevo.tenantId,
        nuevo.cuenta,
        nuevo.tipo,
        JSON.stringify(nuevo.payload ?? {}),
        nuevo.claveIdempotencia ?? null,
        nuevo.maxIntentos ?? 5,
      ],
    );
    return rows.length ? Number(rows[0].id) : null;
  });
}

/**
 * Reclama el siguiente trabajo disponible de una cuenta que no esté ocupada.
 * Devuelve `null` si no hay nada que hacer en este momento.
 */
export async function reclamar(sql: Sql, arriendoMs = 120_000): Promise<Trabajo | null> {
  return sql.transaccion(async (tx) => {
    // 1) Bloquea una cuenta libre (las ocupadas por otro worker se saltan).
    const { rows: cuentas } = await tx.query(
      `SELECT c.tenant_id, c.cuenta
         FROM meta_cuentas_cola c
        WHERE EXISTS (
                SELECT 1 FROM meta_trabajos t
                 WHERE t.tenant_id = c.tenant_id AND t.cuenta = c.cuenta
                   AND t.estado = 'pendiente' AND t.disponible_en <= now())
          AND NOT EXISTS (
                SELECT 1 FROM meta_trabajos t
                 WHERE t.tenant_id = c.tenant_id AND t.cuenta = c.cuenta
                   AND t.estado = 'en_curso' AND t.arrendado_hasta > now())
        ORDER BY c.cuenta
        LIMIT 1
          FOR UPDATE SKIP LOCKED`,
    );
    if (!cuentas.length) return null;
    const { tenant_id, cuenta } = cuentas[0];

    // 2) Toma el trabajo pendiente más antiguo de esa cuenta.
    const { rows } = await tx.query(
      `UPDATE meta_trabajos
          SET estado = 'en_curso',
              intentos = intentos + 1,
              arrendado_hasta = now() + ($3::int * interval '1 millisecond'),
              actualizado_en = now()
        WHERE id = (
          SELECT id FROM meta_trabajos
           WHERE tenant_id = $1 AND cuenta = $2
             AND estado = 'pendiente' AND disponible_en <= now()
           ORDER BY disponible_en, id
           LIMIT 1)
        RETURNING *`,
      [tenant_id, cuenta, arriendoMs],
    );
    return rows.length ? aTrabajo(rows[0]) : null;
  });
}

export async function completar(sql: Sql, id: number): Promise<void> {
  await sql.query(
    `UPDATE meta_trabajos
        SET estado = 'hecho', arrendado_hasta = NULL, ultimo_error = NULL, actualizado_en = now()
      WHERE id = $1`,
    [id],
  );
}

/**
 * Registra un fallo. Si es reintentable y quedan intentos, vuelve a pendiente
 * con espera creciente; si no, queda fallido para revisión humana.
 */
export async function fallar(
  sql: Sql,
  trabajo: Pick<Trabajo, "id" | "intentos" | "maxIntentos">,
  error: string,
  { reintentable, esperaMs }: { reintentable: boolean; esperaMs?: number },
): Promise<"reintentara" | "fallido"> {
  const agotado = !reintentable || trabajo.intentos >= trabajo.maxIntentos;
  if (agotado) {
    await sql.query(
      `UPDATE meta_trabajos
          SET estado = 'fallido', arrendado_hasta = NULL, ultimo_error = $2, actualizado_en = now()
        WHERE id = $1`,
      [trabajo.id, error.slice(0, 2000)],
    );
    return "fallido";
  }
  const espera = esperaMs ?? esperaDeReintento(trabajo.intentos);
  await sql.query(
    `UPDATE meta_trabajos
        SET estado = 'pendiente', arrendado_hasta = NULL, ultimo_error = $2,
            disponible_en = now() + ($3::int * interval '1 millisecond'), actualizado_en = now()
      WHERE id = $1`,
    [trabajo.id, error.slice(0, 2000), espera],
  );
  return "reintentara";
}

/** Devuelve a pendiente los trabajos cuyo worker dejó de responder. */
export async function recuperarArrendosVencidos(sql: Sql): Promise<number> {
  const { rows } = await sql.query(
    `UPDATE meta_trabajos
        SET estado = 'pendiente', arrendado_hasta = NULL, actualizado_en = now()
      WHERE estado = 'en_curso' AND arrendado_hasta < now()
      RETURNING id`,
  );
  return rows.length;
}

/** Lectura para paneles: siempre filtrada por negocio. */
export async function listarTrabajos(
  sql: Sql,
  tenantId: number,
  { estado, limite = 50 }: { estado?: EstadoTrabajo; limite?: number } = {},
): Promise<Record<string, unknown>[]> {
  const params: unknown[] = [tenantId, Math.min(500, Math.max(1, limite))];
  let filtro = "";
  if (estado) {
    params.push(estado);
    filtro = " AND estado = $3";
  }
  const { rows } = await sql.query(
    `SELECT id, cuenta, tipo, estado, intentos, ultimo_error, disponible_en, creado_en
       FROM meta_trabajos
      WHERE tenant_id = $1${filtro}
      ORDER BY creado_en DESC, id DESC
      LIMIT $2`,
    params,
  );
  return rows;
}
