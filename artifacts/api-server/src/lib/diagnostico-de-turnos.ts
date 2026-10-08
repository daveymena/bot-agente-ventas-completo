/**
 * EL DESGLOSE DE CADA TURNO DE ATLAS, GUARDADO DONDE SE PUEDA LEER.
 *
 * El 2026-09-03 el admin preguntó "¿tenés el curso de inteligencia
 * artificial?" y cinco minutos después recibió "No pude terminar de
 * responder". Una pregunta de una línea. El desglose por tramos que diría
 * dónde se fueron esos cinco minutos EXISTE desde el 2026-08-19 y se escribe
 * en el log del contenedor... que en este EasyPanel **no se puede leer por
 * la API**: probados diez endpoints en dos sesiones distintas, todos 404.
 *
 * Así que la medición existía y era inalcanzable, que a los efectos prácticos
 * es lo mismo que no existir. Tres veces seguidas se diagnosticó la lentitud
 * de Atlas por deducción --primero la subida a Meta, después el encadenado del
 * plan, después el presupuesto de investigación-- y cada arreglo sirvió para
 * otra cosa. Adivinar tres veces cuesta más que instrumentar una.
 *
 * Esto guarda el desglose en la MISMA base que ya se usa para la memoria de
 * Atlas, y lo expone por `GET /api/code-agent/atlas-diagnostico`. No agrega
 * tabla ni migración: es una fila más en `architect_memory` con su propio
 * `memoryType`, así que no se mezcla con la conversación (que se lee filtrando
 * por `observation`).
 *
 * ── Reglas que se respetan acá ────────────────────────────────────────────
 *
 * · Guardar el diagnóstico NUNCA puede romper el turno. Todo va envuelto en
 *   try/catch: si la base falla, el admin igual recibe su respuesta. Es el
 *   mismo criterio que `aperturasDelNegocio` en agent.ts -- una métrica no
 *   puede dejar a nadie sin contestación.
 * · No se guarda el texto de la conversación, solo tiempos y estado. El
 *   contenido ya vive en las filas de la charla; duplicarlo acá sería llenar
 *   la base con lo mismo dos veces.
 */
import { db, architectMemory } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { logger } from "./logger";

export const TIPO_DIAGNOSTICO = "diagnostico_turno";

/** Cuántos turnos se conservan al leer. Alcanza para ver un patrón sin traer media base. */
const CUANTOS = 25;

export interface DiagnosticoDeTurno {
  /** Cómo terminó: "completo", "parcial", "cortado", "detenido", "error". */
  estado: string;
  /** Milisegundos de punta a punta. */
  totalMs: number;
  /** Dónde se fue el tiempo, etapa por etapa. */
  tramos: Array<{ etapa: string; ms: number }>;
  /** El modelo que terminó contestando, si hubo alguno. */
  modelo?: string | null;
  /** El error crudo, cuando lo hubo. Sirve para distinguir "sin tiempo" de "sin saldo". */
  error?: string | null;
  /** Las primeras palabras del pedido: sin esto no se sabe si el turno lento fue el pesado o el simple. */
  pedido?: string | null;
  /**
   * Qué CONSULTÓ este turno, por nombre de herramienta.
   *
   * Lo preguntó el admin el 2026-09-03: "Atlas dice que esto no fue consultado
   * cuando sí; ¿cómo saber si consultó algo o no?". El sistema lo registraba
   * desde antes --hay una fila `tool_used` por lectura-- pero el dato moría en
   * el log del contenedor, que en este EasyPanel no se puede leer.
   *
   * Registrado y no registrado no son lo mismo que visible. Acá se vuelve
   * visible: la lista sale por `GET /api/code-agent/atlas-diagnostico` junto al
   * resto del turno, así que ante la duda se mira en vez de discutirla.
   */
  lecturas?: string[];
  /**
   * Cuánto midió lo que le llegó al admin (07-10-2026: "que responda corto y
   * directo"). Sin medirlo, "responde largo" era una impresión; con esto se
   * ve el promedio de líneas y cuántas respuestas cierran con más de una
   * pregunta. Ver medirRespuesta en atlas-cierre-del-turno.ts.
   */
  forma?: { lineas: number; preguntas: number; caracteres: number };
}

/**
 * Anota cómo le fue a un turno.
 *
 * No se espera con `await` en el camino de la respuesta: el admin no tiene por
 * qué esperar a que se escriba una métrica. Se llama y se sigue.
 */
export function anotarTurno(
  tenantId: number,
  sessionId: string,
  d: DiagnosticoDeTurno,
): void {
  void (async () => {
    try {
      await db.insert(architectMemory).values({
        tenantId,
        sessionId,
        memoryType: TIPO_DIAGNOSTICO,
        title: `turno:${d.estado}`,
        content: `${d.estado} · ${(d.totalMs / 1000).toFixed(1)}s`,
        tags: [],
        metadata: {
          estado: d.estado,
          totalMs: d.totalMs,
          tramos: d.tramos,
          modelo: d.modelo ?? null,
          error: d.error ? String(d.error).slice(0, 300) : null,
          // Sin repetidos: si el turno llamó tres veces a `list_products`, lo
          // que importa es que lo consultó, no cuántas.
          lecturas: Array.from(new Set(d.lecturas || [])),
          forma: d.forma ?? null,
          // Recortado a propósito: alcanza para reconocer el pedido y no
          // duplica la conversación, que ya está guardada aparte.
          pedido: d.pedido ? String(d.pedido).slice(0, 120) : null,
          at: Date.now(),
        },
      });
    } catch (e: any) {
      // Que falle la métrica no puede notarse en la respuesta del admin.
      logger.warn({ err: e?.message }, "[AtlasDiagnostico] No se pudo anotar el turno");
    }
  })();
}

/**
 * Los últimos turnos de este negocio, del más nuevo al más viejo.
 *
 * Se ordena por `id` además de por fecha: `created_at` se guarda con
 * granularidad de UN SEGUNDO, así que varios turnos del mismo minuto empatan y
 * con el empate el motor devuelve lo que quiere. Es exactamente el bug que
 * tenía la memoria de Atlas (`architect-store.ts`), y no tiene sentido
 * repetirlo acá el mismo día que se arregló allá.
 */
export async function ultimosTurnos(tenantId: number): Promise<any[]> {
  const rows = await db
    .select()
    .from(architectMemory)
    .where(
      and(
        eq(architectMemory.tenantId, tenantId),
        eq(architectMemory.memoryType, TIPO_DIAGNOSTICO),
      ),
    )
    .orderBy(desc(architectMemory.createdAt), desc(architectMemory.id))
    .limit(CUANTOS);

  return rows.map((r: any) => ({
    sessionId: r.sessionId,
    ...(r.metadata || {}),
  }));
}

/**
 * Una lectura en castellano de los últimos turnos.
 *
 * El desglose crudo sirve para depurar; esta línea es la que contesta la
 * pregunta que el admin hace de verdad ("¿por qué tarda tanto?") sin tener que
 * leer milisegundos.
 */
export function resumirTurnos(turnos: any[]): string {
  if (turnos.length === 0) return "Todavía no hay turnos medidos.";

  const tiempos = turnos.map((t) => Number(t.totalMs) || 0).filter((n) => n > 0);
  const fallados = turnos.filter((t) => t.estado === "cortado" || t.estado === "error");
  const promedio = tiempos.length ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : 0;
  const peor = tiempos.length ? Math.max(...tiempos) : 0;

  // Dónde se va el tiempo, sumando la misma etapa en todos los turnos: un
  // tramo que aparece poco pero se lleva 40s importa más que uno que aparece
  // siempre y se lleva 200ms.
  const porEtapa = new Map<string, number>();
  for (const t of turnos) {
    for (const tr of (Array.isArray(t.tramos) ? t.tramos : [])) {
      porEtapa.set(tr.etapa, (porEtapa.get(tr.etapa) || 0) + (Number(tr.ms) || 0));
    }
  }
  const peorEtapa = [...porEtapa.entries()].sort((a, b) => b[1] - a[1])[0];

  const partes = [
    `${turnos.length} turnos medidos`,
    `promedio ${(promedio / 1000).toFixed(1)}s`,
    `el peor ${(peor / 1000).toFixed(1)}s`,
  ];
  if (fallados.length) partes.push(`${fallados.length} sin terminar`);
  if (peorEtapa) partes.push(`donde más se va el tiempo: ${peorEtapa[0]} (${(peorEtapa[1] / 1000).toFixed(1)}s sumados)`);
  const formas = turnos.map((t) => t.forma).filter((f) => f && Number.isFinite(Number(f.lineas)));
  if (formas.length) {
    const lineas = formas.reduce((a, f) => a + Number(f.lineas), 0) / formas.length;
    const conVarias = formas.filter((f) => Number(f.preguntas) > 1).length;
    partes.push(`respuestas de ${lineas.toFixed(1)} líneas en promedio, ${conVarias} de ${formas.length} con más de una pregunta`);
  }
  return partes.join(" · ");
}
