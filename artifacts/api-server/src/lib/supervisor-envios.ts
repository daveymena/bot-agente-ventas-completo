/**
 * Supervisor anti-baneo de los envíos de WhatsApp, UNO POR NEGOCIO.
 *
 * Reemplaza al HealthManager global de 73664ac, que tenía tres fallas:
 *  1. Era un solo puntaje para toda la plataforma: los fallos del número de un
 *     negocio frenaban (x4) y hacían reescribir los mensajes de TODOS.
 *  2. Contaba como "riesgo de baneo" cualquier excepción del socket: un corte
 *     de conexión en un deploy sumaba +10 por envío y cada éxito restaba 1,
 *     guardado en Postgres entre reinicios → el bot podía quedar trabado en
 *     modo lento durante cientos de mensajes por un parpadeo de red.
 *  3. Con riesgo alto la IA reescribía el texto antes de enviarlo: podía
 *     cambiar precios o enlaces ya validados, y lo guardado en la base dejaba
 *     de ser lo que recibió el cliente. Eso se elimina: el supervisor solo
 *     regula el RITMO, nunca el contenido.
 *
 * El riesgo además se desvanece con el tiempo sin fallos (no hace falta
 * "pagar" con envíos exitosos un incidente de hace horas).
 */

export type TipoFallo = "restriccion" | "conexion" | "otro";

/** Restricción de la cuenta vs. parpadeo de conexión vs. lo demás. */
export function clasificarFallo(error: unknown): TipoFallo {
  const msg = String((error as any)?.message ?? error ?? "").toLowerCase();
  const code = Number((error as any)?.output?.statusCode ?? (error as any)?.statusCode ?? 0);
  if (code === 401 || code === 403 || /\b(401|403)\b|suspend|banned|blocked|not-authorized|forbidden|rate-overlimit|spam/.test(msg)) {
    return "restriccion";
  }
  if (code === 408 || code === 428 || code === 440 || code === 500 && /stream/.test(msg) ||
      /connection (closed|lost|was lost)|not open|socket|timed? ?out|econnreset|etimedout|stream errored|precondition/.test(msg)) {
    return "conexion";
  }
  return "otro";
}

const SUBE: Record<TipoFallo, number> = { restriccion: 30, otro: 5, conexion: 0 };
const BAJA_POR_EXITO = 2;
/** Puntos que se pierden por hora sin fallos. */
const DECAE_POR_HORA = 15;

export interface EstadoSalud {
  riesgo: number;
  ultimoFalloAt: number;
}

export class SupervisorEnvios {
  private riesgoBase = 0;
  private ultimoFalloAt = 0;

  constructor(private ahora: () => number = Date.now) {}

  /** Riesgo vigente: el guardado menos lo que decayó desde el último fallo. */
  get riesgo(): number {
    if (!this.riesgoBase) return 0;
    const horas = (this.ahora() - this.ultimoFalloAt) / 3_600_000;
    return Math.max(0, Math.round(this.riesgoBase - Math.max(0, horas) * DECAE_POR_HORA));
  }

  /** Multiplicador de las pausas humanas (lectura/escritura/grabación). */
  get multiplicador(): number {
    const r = this.riesgo;
    if (r < 30) return 1;
    if (r < 60) return 1.5;
    return 2.5;
  }

  /** Devuelve true si el cambio merece persistirse ya. */
  exito(): boolean {
    if (!this.riesgoBase) return false;
    const antes = this.riesgo;
    this.riesgoBase = Math.max(0, antes - BAJA_POR_EXITO);
    this.ultimoFalloAt = this.riesgoBase ? this.ahora() : 0;
    return antes >= 30 && this.riesgoBase < 30;
  }

  fallo(error: unknown): { tipo: TipoFallo; persistir: boolean } {
    const tipo = clasificarFallo(error);
    const sube = SUBE[tipo];
    if (!sube) return { tipo, persistir: false };
    this.riesgoBase = Math.min(100, this.riesgo + sube);
    this.ultimoFalloAt = this.ahora();
    return { tipo, persistir: true };
  }

  exportar(): EstadoSalud {
    return { riesgo: this.riesgoBase, ultimoFalloAt: this.ultimoFalloAt };
  }

  restaurar(e: Partial<EstadoSalud> | null | undefined): void {
    if (!e || typeof e.riesgo !== "number") return;
    this.riesgoBase = Math.min(Math.max(e.riesgo, 0), 100);
    this.ultimoFalloAt = Number(e.ultimoFalloAt) || this.ahora();
  }
}

/** Pausa de "grabando audio…" proporcional a la nota de voz, acotada.
 *  Antes: 8 ms por byte con tope de 15 s → casi toda nota esperaba 15 s
 *  (x4 con riesgo = 1 minuto). Una nota opus ronda 2–4 KB por segundo. */
export function pausaGrabacionMs(bytes: number, multiplicador = 1, azar = Math.random()): number {
  const segundosAudio = Math.max(0, bytes) / 3000;
  const base = Math.min(Math.max(segundosAudio * 1000 * 0.4, 1200), 5000);
  return Math.round(base * (0.85 + azar * 0.3) * multiplicador);
}
