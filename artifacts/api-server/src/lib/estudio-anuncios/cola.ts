/**
 * Cola de trabajos en memoria para el Estudio de anuncios.
 *
 * - Un trabajo a la vez por defecto (sharp + ffmpeg son pesados; en el VPS
 *   compiten con WhatsApp y la API), configurable por `concurrencia`.
 * - Reintentos con espera creciente: una foto que no bajó o una voz que no
 *   salió no tumban el paquete entero.
 * - Estado consultable por clave (`paquete:12`, `video:12`) para que el panel
 *   muestre "en cola / generando / listo / falló" sin sockets.
 * - Si se vuelve a pedir una clave que está pendiente o en curso, se devuelve
 *   ese mismo trabajo (no se duplica).
 */

export type EstadoTrabajo = "pendiente" | "en_curso" | "listo" | "fallo";

export interface Trabajo<T = unknown> {
  clave: string;
  estado: EstadoTrabajo;
  intento: number;
  intentos: number;
  creadoEn: string;
  iniciadoEn?: string;
  terminadoEn?: string;
  error?: string;
  resultado?: T;
  /** Posición en la cola (1 = siguiente) mientras está pendiente. */
  posicion?: number;
  /** Avance opcional 0–100 que el trabajo reporta. */
  progreso?: number;
  detalle?: string;
}

export interface Avance { progreso?: number; detalle?: string }
export type Tarea<T> = (avance: (a: Avance) => void, intento: number) => Promise<T>;

interface Interno<T> extends Trabajo<T> {
  tarea: Tarea<T>;
  promesa: Promise<Trabajo<T>>;
  resolver: (t: Trabajo<T>) => void;
}

export interface OpcionesCola {
  concurrencia?: number;
  intentos?: number;
  /** Espera base entre reintentos (ms); se duplica en cada intento. */
  esperaMs?: number;
  /** Cuántos trabajos terminados se conservan para consultar su estado. */
  historial?: number;
  dormir?: (ms: number) => Promise<void>;
}

export class Cola {
  private pendientes: Interno<any>[] = [];
  private activos = new Map<string, Interno<any>>();
  private terminados = new Map<string, Interno<any>>();
  private readonly concurrencia: number;
  private readonly intentos: number;
  private readonly esperaMs: number;
  private readonly historial: number;
  private readonly dormir: (ms: number) => Promise<void>;

  constructor(opts: OpcionesCola = {}) {
    this.concurrencia = Math.max(1, opts.concurrencia ?? 1);
    this.intentos = Math.max(1, opts.intentos ?? 3);
    this.esperaMs = Math.max(0, opts.esperaMs ?? 1500);
    this.historial = Math.max(10, opts.historial ?? 200);
    this.dormir = opts.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Encola (o devuelve el trabajo ya pendiente/en curso con esa clave). */
  encolar<T>(clave: string, tarea: Tarea<T>, opts: { intentos?: number } = {}): Trabajo<T> {
    const existente = this.activos.get(clave) || this.pendientes.find((p) => p.clave === clave);
    if (existente) return this.publico(existente);
    let resolver!: (t: Trabajo<T>) => void;
    const promesa = new Promise<Trabajo<T>>((r) => { resolver = r; });
    const t: Interno<T> = { clave, estado: "pendiente", intento: 0, intentos: Math.max(1, opts.intentos ?? this.intentos), creadoEn: new Date().toISOString(), tarea, promesa, resolver };
    this.terminados.delete(clave);
    this.pendientes.push(t);
    queueMicrotask(() => this.bombear());
    return this.publico(t);
  }

  /** Promesa que termina cuando el trabajo acaba (listo o fallo). */
  esperar<T = unknown>(clave: string): Promise<Trabajo<T>> | null {
    const t = this.activos.get(clave) || this.pendientes.find((p) => p.clave === clave) || this.terminados.get(clave);
    return t ? (t.estado === "listo" || t.estado === "fallo" ? Promise.resolve(this.publico(t)) : t.promesa) : null;
  }

  estado<T = unknown>(clave: string): Trabajo<T> | null {
    const t = this.activos.get(clave) || this.pendientes.find((p) => p.clave === clave) || this.terminados.get(clave);
    return t ? this.publico(t) : null;
  }

  resumen(): { pendientes: number; enCurso: number; claves: string[] } {
    return { pendientes: this.pendientes.length, enCurso: this.activos.size, claves: [...this.activos.keys(), ...this.pendientes.map((p) => p.clave)] };
  }

  private publico<T>(t: Interno<T>): Trabajo<T> {
    const { tarea: _t, promesa: _p, resolver: _r, ...resto } = t;
    const posicion = t.estado === "pendiente" ? this.pendientes.indexOf(t) + 1 : undefined;
    return { ...resto, posicion };
  }

  private bombear(): void {
    while (this.activos.size < this.concurrencia && this.pendientes.length) {
      const t = this.pendientes.shift()!;
      this.activos.set(t.clave, t);
      void this.correr(t);
    }
  }

  private async correr<T>(t: Interno<T>): Promise<void> {
    t.estado = "en_curso";
    t.iniciadoEn = new Date().toISOString();
    const avance = (a: Avance) => { if (a.progreso != null) t.progreso = Math.max(0, Math.min(100, a.progreso)); if (a.detalle != null) t.detalle = a.detalle; };
    for (let i = 1; i <= t.intentos; i++) {
      t.intento = i;
      try {
        t.resultado = await t.tarea(avance, i);
        t.estado = "listo";
        t.progreso = 100;
        t.error = undefined;
        break;
      } catch (e: any) {
        t.error = String(e?.message || e);
        if (i < t.intentos) await this.dormir(this.esperaMs * 2 ** (i - 1));
      }
    }
    if (t.estado !== "listo") t.estado = "fallo";
    t.terminadoEn = new Date().toISOString();
    this.activos.delete(t.clave);
    this.terminados.set(t.clave, t);
    while (this.terminados.size > this.historial) {
      const primera = this.terminados.keys().next().value;
      if (primera == null) break;
      this.terminados.delete(primera);
    }
    t.resolver(this.publico(t));
    this.bombear();
  }
}

/** Cola compartida del Estudio (un proceso = una cola). */
let compartida: Cola | null = null;
export function colaDelEstudio(): Cola {
  if (!compartida) compartida = new Cola({ concurrencia: Math.max(1, Number(process.env.ESTUDIO_CONCURRENCIA) || 1), intentos: 3, esperaMs: 2000 });
  return compartida;
}
