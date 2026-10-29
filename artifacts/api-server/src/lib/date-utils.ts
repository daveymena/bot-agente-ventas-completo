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

/** Rango del día civil actual de Colombia, sin depender de la TZ del servidor. */
export function rangoHoyColombia(ahora = new Date()): { desde: Date; hasta: Date; etiqueta: string } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(ahora);
  const valor = (tipo: string) => p.find((x) => x.type === tipo)?.value || "0";
  const anio = Number(valor("year"));
  const mes = Number(valor("month"));
  const dia = Number(valor("day"));
  // Colombia usa UTC-5 y no tiene horario de verano.
  const desde = new Date(Date.UTC(anio, mes - 1, dia, 5));
  const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000);
  return { desde, hasta, etiqueta: `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}` };
}
