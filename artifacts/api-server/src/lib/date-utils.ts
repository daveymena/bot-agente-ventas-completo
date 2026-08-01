export function safeISO(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * Valor "ahora" para ESCRIBIR en una columna timestamp, correcto para el
 * motor de BD que esté activo.
 *
 * El esquema de Postgres declara estas columnas como `timestamp` en modo
 * Date: Drizzle espera un objeto Date y lo serializa él mismo — si le pasas
 * un string (como hacía `new Date().toISOString()` en todo el código,
 * heredado de cuando la app solo corría con SQLite) revienta dentro de
 * Drizzle con "value.toISOString is not a function", PORQUE intenta llamar
 * toISOString() sobre un string.
 *
 * El esquema de SQLite (sql.js) declara las mismas columnas como `text` y
 * necesita el string.
 *
 * Se vio en producción: la IA generaba una respuesta de venta válida, pero
 * al guardar conversations.lastMessageAt como string crasheaba, y el
 * cliente de WhatsApp recibía el mensaje de "problemas técnicos" en vez de
 * la respuesta real — apareció el mismo día que production pasó a Postgres.
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
