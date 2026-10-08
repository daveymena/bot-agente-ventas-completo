/**
 * Atlas sigue trabajando aunque el admin cierre la app.
 *
 * El dueño (07-10): "siempre que me salgo de la aplicación se cae la señal, y
 * no debería: no depende de que yo tenga la app abierta sino de que el
 * servidor funcione". Tenía razón. Un pedido grande no entra en un turno
 * (~135 s): el turno guarda lo hecho como PARCIAL y avisa `needsContinuation`.
 * Hasta hoy, el que pedía el tramo siguiente era la PÁGINA
 * (code-agent.tsx → seguirPendiente/handleSubmit con "Continuá con lo que ya
 * tenías…"). Con la app cerrada, o el celular pausándola en segundo plano,
 * nadie lo pedía y el trabajo quedaba congelado hasta volver a entrar.
 *
 * Ahora, cuando un turno termina pidiendo continuación, el servidor espera un
 * instante: si la página pidió el tramo (hay turno en vuelo), ella sigue
 * manejándolo como siempre, con el avance en vivo; si no, el servidor lo pide
 * solo, con la misma sesión del admin, hasta MAX_RONDAS tramos seguidos.
 */
import { logger } from "./logger";
import { hayTurnoEnVuelo } from "./turnos-en-vuelo";

/** El mismo texto que manda la página: el turno lo reconoce como continuación. */
export const TEXTO_CONTINUAR = "Continuá con lo que ya tenías, sin repetir lo que ya hiciste.";
export const MAX_RONDAS = 4;
const ESPERA_MS = 8_000;

const rondas = new Map<string, number>();
const programadas = new Map<string, ReturnType<typeof setTimeout>>();

/** Un pedido nuevo del admin (no una continuación) reinicia la cuenta. */
export function reiniciarRondas(clave: string): void {
  rondas.delete(clave);
  const t = programadas.get(clave);
  if (t) clearTimeout(t);
  programadas.delete(clave);
}

export interface Continuacion {
  clave: string;
  sessionId: string;
  /** Cabeceras de autenticación del pedido original (cookie / Authorization). */
  cabeceras: Record<string, string>;
  /** Cómo llamar al propio servidor. */
  base?: string;
  esperaMs?: number;
  /** Inyectable en pruebas. */
  pedir?: (url: string, init: RequestInit) => Promise<unknown>;
  enVuelo?: (clave: string) => boolean;
}

/** Devuelve false si ya se agotaron los tramos automáticos. */
export function programarContinuacion(c: Continuacion): boolean {
  const n = rondas.get(c.clave) ?? 0;
  if (n >= MAX_RONDAS) {
    logger.warn({ clave: c.clave, rondas: n }, "[AtlasContinua] tope de tramos automáticos: queda para cuando el admin vuelva");
    return false;
  }
  const previa = programadas.get(c.clave);
  if (previa) clearTimeout(previa);
  const enVuelo = c.enVuelo ?? hayTurnoEnVuelo;
  const pedir = c.pedir ?? ((url, init) => fetch(url, init));
  const base = c.base ?? `http://127.0.0.1:${process.env.PORT || 3002}`;

  const t = setTimeout(async () => {
    programadas.delete(c.clave);
    // La página pidió el tramo: ella lo maneja (con el avance en vivo).
    if (enVuelo(c.clave)) return;
    rondas.set(c.clave, (rondas.get(c.clave) ?? 0) + 1);
    logger.info({ clave: c.clave, ronda: rondas.get(c.clave) }, "[AtlasContinua] el admin no está: el servidor sigue con el tramo siguiente");
    try {
      await pedir(`${base}/api/code-agent/operator-opencode`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-atlas-continuacion": "servidor", ...c.cabeceras },
        body: JSON.stringify({ prompt: TEXTO_CONTINUAR, sessionId: c.sessionId, history: [], stream: false }),
      });
    } catch (e) {
      logger.warn({ clave: c.clave, err: String(e) }, "[AtlasContinua] no se pudo pedir el tramo siguiente");
    }
  }, c.esperaMs ?? ESPERA_MS);
  programadas.set(c.clave, t);
  return true;
}
