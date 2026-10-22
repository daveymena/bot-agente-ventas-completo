/**
 * Worker de trabajos de Meta. Corre como servicio propio en EasyPanel
 * (misma imagen, META_ROLE=worker), separado de la API.
 */

import { completar, fallar, recuperarArrendosVencidos, reclamar, type Sql, type Trabajo } from "./cola";
import { MetaError } from "./graph";

export type Manejador = (trabajo: Trabajo) => Promise<void>;

export interface OpcionesWorker {
  sql: Sql;
  manejadores: Record<string, Manejador>;
  /** Se llama cuando Meta dice que el token del negocio no sirve. */
  alTokenInvalido?: (trabajo: Trabajo, error: MetaError) => Promise<void>;
  registrar?: (mensaje: string, datos?: Record<string, unknown>) => void;
  esperaSinTrabajoMs?: number;
}

export type ResultadoTrabajo = "hecho" | "reintentara" | "fallido" | "sin_manejador" | "vacio";

/** Procesa un solo trabajo, si hay uno disponible. */
export async function procesarUno(opciones: OpcionesWorker): Promise<ResultadoTrabajo> {
  const trabajo = await reclamar(opciones.sql);
  if (!trabajo) return "vacio";

  const manejador = opciones.manejadores[trabajo.tipo];
  if (!manejador) {
    await fallar(opciones.sql, trabajo, `sin manejador para el tipo ${trabajo.tipo}`, { reintentable: false });
    return "sin_manejador";
  }

  try {
    await manejador(trabajo);
    await completar(opciones.sql, trabajo.id);
    return "hecho";
  } catch (e) {
    const esMeta = e instanceof MetaError;
    const mensaje = (e as Error).message ?? String(e);
    if (esMeta && e.categoria === "token_invalido" && opciones.alTokenInvalido) {
      await opciones.alTokenInvalido(trabajo, e).catch(() => {});
    }
    const resultado = await fallar(opciones.sql, trabajo, mensaje, {
      // Errores de Meta: solo los reintentables. Errores propios del código
      // (bugs, datos mal formados) se reintentan hasta agotar intentos para
      // que un fallo puntual no deje el trabajo perdido.
      reintentable: esMeta ? e.reintentable : true,
      esperaMs: esMeta && e.categoria === "limite_uso" ? 15 * 60_000 : undefined,
    });
    opciones.registrar?.("trabajo_meta_error", { id: trabajo.id, tipo: trabajo.tipo, resultado, mensaje });
    return resultado === "fallido" ? "fallido" : "reintentara";
  }
}

export interface ControlWorker {
  detener: () => void;
  terminado: Promise<void>;
}

/** Bucle del worker. Devuelve un control para detenerlo (apagado limpio). */
export function iniciarWorker(opciones: OpcionesWorker): ControlWorker {
  let activo = true;
  const espera = opciones.esperaSinTrabajoMs ?? 2_000;
  let ultimoBarrido = 0;

  const terminado = (async () => {
    while (activo) {
      try {
        if (Date.now() - ultimoBarrido > 60_000) {
          ultimoBarrido = Date.now();
          const recuperados = await recuperarArrendosVencidos(opciones.sql);
          if (recuperados) opciones.registrar?.("trabajo_meta_recuperados", { recuperados });
        }
        const r = await procesarUno(opciones);
        if (r === "vacio") await new Promise((res) => setTimeout(res, espera));
      } catch (e) {
        opciones.registrar?.("worker_meta_error", { mensaje: (e as Error).message });
        await new Promise((res) => setTimeout(res, espera));
      }
    }
  })();

  return { detener: () => { activo = false; }, terminado };
}
