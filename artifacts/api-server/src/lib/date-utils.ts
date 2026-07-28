export function safeISO(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * Valor "ahora" para ESCRIBIR en una columna timestamp, correcto para el
 * motor de BD activo.
 *
 * El esquema de Postgres declara las columnas timestamp en modo Date:
 * Drizzle espera un objeto Date y las serializa él mismo — pasarle un string
 * (como hacía `new Date().toISOString()` en todo el código, heredado de
 * cuando la app solo corría con SQLite) revienta con "value.toISOString is
 * not a function", porque Drizzle intenta llamar toISOString() sobre un
 * string.
 *
 * El esquema de SQLite declara las mismas columnas como texto y necesita el
 * string.
 */
export function dbNow(): Date | string {
  return process.env.USE_SQLITE === "true" ? new Date().toISOString() : new Date();
}

/**
 * Igual que dbNow() pero para una fecha arbitraria (no "ahora") que va a
 * escribirse en una columna timestamp — ej. fechas calculadas de expiración
 * o de un follow-up programado.
 */
export function toDbDate(d: Date): Date | string {
  return process.env.USE_SQLITE === "true" ? d.toISOString() : d;
}
