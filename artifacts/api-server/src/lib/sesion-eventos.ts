/**
 * Verificación de sesión para el canal en vivo (WebSocket).
 *
 * El handshake de un WebSocket NO pasa por Express, así que no tiene
 * `req.signedCookies` ni los middlewares. Este módulo reproduce la misma
 * decisión que toma `resolveTenant()` — y a propósito lee de la MISMA fuente:
 * la cookie firmada `tenant_id`.
 *
 * Por qué importa: el canal en vivo entrega mensajes de clientes reales. Si
 * acá se aceptara un header, un slug o cualquier cosa que escribe quien llama,
 * sería una puerta trasera que saltea todo el aislamiento multi-tenant que el
 * resto del sistema cuida. La regla del proyecto ya está escrita en
 * `tenantManager.ts`: *"lo que venga en un header no prueba nada"*.
 */

import type { IncomingMessage } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface SesionDeEventos {
  tenantId: number;
  isAdmin: boolean;
}

/** Lee una cookie del header `cookie` sin depender de cookie-parser. */
function leerCookie(req: IncomingMessage, nombre: string): string | null {
  const crudo = req.headers.cookie;
  if (!crudo) return null;
  for (const parte of crudo.split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    if (parte.slice(0, i).trim() !== nombre) continue;
    try {
      return decodeURIComponent(parte.slice(i + 1).trim());
    } catch {
      return parte.slice(i + 1).trim();
    }
  }
  return null;
}

/**
 * Verifica una cookie firmada por `cookie-parser`.
 *
 * El formato es `s:<valor>.<firma>` donde la firma es HMAC-**SHA256** base64url
 * sin relleno, con el `COOKIE_SECRET`. Se lee del propio `cookie-signature`
 * (la dependencia que usa `cookie-parser`): usar SHA-1 acá haría que ninguna
 * cookie real validara.
 *
 * Se reimplementa porque el handshake de un WebSocket no pasa por el middleware
 * de Express y por lo tanto no tiene `req.signedCookies`.
 *
 * Comparación en tiempo constante: una firma se puede adivinar byte a byte si
 * la comparación corta en el primer byte distinto.
 */
export function valorDeCookieFirmada(req: IncomingMessage, nombre: string): string | null {
  const crudo = leerCookie(req, nombre);
  if (!crudo) return null;
  if (!crudo.startsWith("s:")) return null;

  const cuerpo = crudo.slice(2);
  const punto = cuerpo.lastIndexOf(".");
  if (punto < 0) return null;

  const valor = cuerpo.slice(0, punto);
  const firma = cuerpo.slice(punto + 1);
  const secreto = process.env.COOKIE_SECRET || "";
  if (!secreto) return null;

  // SHA-256, igual que cookie-signature@1.x (el que usa cookie-parser).
  const esperada = createHmac("sha256", secreto).update(valor).digest("base64").replace(/=+$/, "");
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return valor;
}

/**
 * La sesión del panel a partir del handshake. `null` si no hay sesión válida:
 * quien llama DEBE rechazar el upgrade, no dejarlo pasar con un default.
 */
export async function verificarSesionDeEventos(req: IncomingMessage): Promise<SesionDeEventos | null> {
  const idDeSesion = valorDeCookieFirmada(req, "tenant_id");
  if (!idDeSesion) return null;

  const id = Number(idDeSesion);
  if (!Number.isFinite(id) || id <= 0) return null;

  try {
    const [fila] = await db
      .select({ id: tenants.id, isAdmin: (tenants as any).isAdmin })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);
    if (!fila) return null;
    return { tenantId: Number(fila.id), isAdmin: Boolean((fila as any).isAdmin) };
  } catch {
    // Si la base no contesta, NO se abre el canal: un fallo no puede
    // convertirse en acceso sin verificar.
    return null;
  }
}
