/**
 * AGENT LAB — Ciclo de mejora.
 *
 * Diagnóstico → Propuesta → Versionado → Comparación → Aplicación.
 *
 * Lee hallazgos (de simulación o de conversaciones reales),
 * propone un prompt mejorado, lo guarda como candidato en `promptVersions`,
 * y expone operaciones para comparar y aplicar.
 */

import { ensureDbReady, agents, promptVersions } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { ResultadoSimulacion } from "./motor-nuevo/simulador-agente";

export interface Hallazgo {
  descripcion: string;
  turnoSimulacion?: number;
  conversacionReal?: number;
  severidad: "critico" | "advertencia" | "info";
}

/**
 * Agrupa hallazgos repetidos para identificar patrones.
 */
export function agruparHallazgos(hallazgos: Hallazgo[]): Map<string, number> {
  const agrupados = new Map<string, number>();

  for (const h of hallazgos) {
    const clave = h.descripcion;
    agrupados.set(clave, (agrupados.get(clave) || 0) + 1);
  }

  return agrupados;
}

/**
 * Extrae hallazgos de múltiples simulaciones.
 */
export function extraerHallazgosDeSimulaciones(
  simulaciones: ResultadoSimulacion[],
): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];

  for (const sim of simulaciones) {
    // Hallazgos explícitos detectados durante la simulación
    for (const p of sim.resumenProblemas) {
      hallazgos.push({
        descripcion: p.problema,
        turnoSimulacion: p.turno,
        severidad: "advertencia",
      });
    }

    // Reglas de evaluación específicas del arquetipo
    const ultimasRespuestasDelVendedor = sim.turnos
      .filter((t) => t.quienDice === "vendedor")
      .map((t) => t.texto);

    for (const respuesta of ultimasRespuestasDelVendedor) {
      for (const regla of sim.perfilCliente.reglasEvaluacion) {
        if (!regla.validar(respuesta)) {
          hallazgos.push({
            descripcion: regla.descripcion,
            turnoSimulacion: sim.turnos.findIndex((t) => t.texto === respuesta),
            severidad: "advertencia",
          });
        }
      }
    }
  }

  return hallazgos;
}

/**
 * Propone un prompt mejorado basado en hallazgos.
 *
 * Contacta al LLM (mismo que usa el vendedor) para generar un prompt corregido.
 */
export async function proponerMejora({
  tenantId,
  agentId,
  promptActual,
  hallazgos,
  llmForGeneration,
}: {
  tenantId: number;
  agentId: number;
  promptActual: string;
  hallazgos: Hallazgo[];
  llmForGeneration: any; // ClienteLLM o similar
}): Promise<{ nuevoprompt: string; resumenDeCambios: string }> {
  const agrupados = agruparHallazgos(hallazgos);

  const descripcionDeProblemas = Array.from(agrupados.entries())
    .map(([desc, freq]) => `- ${desc} (${freq} veces)`)
    .join("\n");

  const solicitud = `Eres un expert en prompt engineering para agentes de venta.

Dado el siguiente prompt actual y lista de problemas detectados,
propón mejoras específicas al prompt.

PROMPT ACTUAL:
${promptActual}

PROBLEMAS DETECTADOS (de simulaciones de entrenamiento):
${descripcionDeProblemas}

Tu tarea:
1. Identifica qué parte del prompt contribuye a cada problema.
2. Escribe un prompt mejorado que corrija esos puntos.
3. Mantén las reglas de negocio y el tono del vendedor.
4. Sé explícito: si dice "no inventes precios", debe seguir siendo claro.

Devuelve:
- El nuevo prompt completo (entre markers)
- Una lista de cambios (1-2 líneas cada uno)

[NUEVO PROMPT]
... aquí el prompt mejorado ...
[/NUEVO PROMPT]

[CAMBIOS]
- Cambio 1
- Cambio 2
...
[/CAMBIOS]`;

  try {
    const respuesta = await llmForGeneration.message({
      messages: [
        {
          role: "user",
          content: solicitud,
        },
      ],
    });

    const texto = respuesta.content[0]?.type === "text" ? respuesta.content[0].text : "";

    const matchPrompt = texto.match(/\[NUEVO PROMPT\]([\s\S]*?)\[\/NUEVO PROMPT\]/);
    const matchCambios = texto.match(/\[CAMBIOS\]([\s\S]*?)\[\/CAMBIOS\]/);

    if (!matchPrompt) {
      throw new Error("LLM no devolvió nuevo prompt en formato esperado");
    }

    const nuevoPrompt = matchPrompt[1].trim();
    const resumenDeCambios = matchCambios ? matchCambios[1].trim() : "Cambios aplicados por IA.";

    return { nuevoprompt: nuevoPrompt, resumenDeCambios };
  } catch (e) {
    throw new Error(`Error proponiendo mejora: ${(e as any).message}`);
  }
}

/**
 * Guarda la propuesta de mejora como versión candidata en la BD.
 * No toca el prompt actual del agente.
 */
export async function guardarVersionCandidata({
  tenantId,
  agentId,
  promptAnterior,
  promptNuevo,
  resumenDeCambios,
}: {
  tenantId: number;
  agentId: number;
  promptAnterior: string;
  promptNuevo: string;
  resumenDeCambios: string;
}): Promise<number> {
  const { db } = await ensureDbReady();

  const [fila] = await db
    .insert(promptVersions)
    .values({
      tenantId,
      agentId,
      previousPrompt: promptAnterior,
      newPrompt: promptNuevo,
      diffSummary: resumenDeCambios,
      reason: "Agent Lab: propuesta de mejora basada en simulación",
      performanceBefore: null,
      performanceAfter: null,
      appliedBy: null,
      isActive: false,
      createdAt: new Date(),
    } as any)
    .returning();

  return (fila as any).id;
}

/**
 * Compara dos versiones de prompt usando el mismo set de simulaciones.
 * Devuelve estadísticas lado a lado.
 */
export async function compararVersiones({
  versionAnterior: { promptActual, nombreVersion: nombreActual },
  versionCandidata: { promptNuevo, idVersion },
  simulacionesAComparar,
  llmForComparison,
}: {
  versionAnterior: { promptActual: string; nombreVersion: string };
  versionCandidata: { promptNuevo: string; idVersion: number };
  simulacionesAComparar: any[]; // array de { perfil, turnoCliente, respuestaEsperada }
  llmForComparison: any;
}): Promise<{
  actual: { exitosos: number; total: number; tasa: number };
  candidata: { exitosos: number; total: number; tasa: number };
  mejoroEn: number; // porcentaje de mejora
}> {
  // NOTA: Implementación simplificada. En la práctica, correría simulaciones reales
  // usando responder() con ambos prompts. Acá es un skeleton.

  const simularConPrompt = async (
    prompt: string,
    turnos: any[],
  ): Promise<{ exitosos: number; total: number }> => {
    // Placeholder: simular converaciones cortas, contar cuántas "se cierran bien"
    // En la implementación real, reusar correrSimulacionCliente con override de prompt.
    return { exitosos: Math.floor(turnos.length * 0.75), total: turnos.length };
  };

  const resultadoActual = await simularConPrompt(promptActual, simulacionesAComparar);
  const resultadoCandidata = await simularConPrompt(promptNuevo, simulacionesAComparar);

  const tasaActual = resultadoActual.exitosos / resultadoActual.total;
  const tasaCandidata = resultadoCandidata.exitosos / resultadoCandidata.total;
  const mejora = ((tasaCandidata - tasaActual) / tasaActual) * 100;

  return {
    actual: {
      exitosos: resultadoActual.exitosos,
      total: resultadoActual.total,
      tasa: tasaActual,
    },
    candidata: {
      exitosos: resultadoCandidata.exitosos,
      total: resultadoCandidata.total,
      tasa: tasaCandidata,
    },
    mejoroEn: mejora,
  };
}

/**
 * Aplica una versión candidata a producción.
 * DESTRUCTIVE: cambia el prompt actual del agente y marca la versión como activa.
 */
export async function aplicarVersionCandidata({
  agentId,
  versionId,
  aprobadoPor,
}: {
  agentId: number;
  versionId: number;
  aprobadoPor: string; // email del usuario que aprobó
}): Promise<void> {
  const { db } = await ensureDbReady();

  // Lee la versión
  const [version] = await db
    .select()
    .from(promptVersions)
    .where(eq(promptVersions.id, versionId));

  if (!version) {
    throw new Error(`Versión ${versionId} no encontrada`);
  }

  if (version.agentId !== agentId) {
    throw new Error(`Versión no pertenece al agente ${agentId}`);
  }

  // Actualiza el agente: nuevo prompt
  await db
    .update(agents)
    .set({
      systemPrompt: version.newPrompt,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId));

  // Marca la versión como activa y registra quién la aplicó
  await db
    .update(promptVersions)
    .set({
      isActive: true,
      appliedBy: aprobadoPor,
      performanceAfter: 0, // TODO: medir en tiempo real
      updatedAt: new Date(),
    })
    .where(eq(promptVersions.id, versionId));

  console.log(`[agent-lab] Versión ${versionId} aplicada al agente ${agentId} por ${aprobadoPor}`);
}
