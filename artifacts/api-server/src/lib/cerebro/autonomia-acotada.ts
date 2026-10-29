/**
 * Autonomía Acotada: Auto-mejora sin intervención
 *
 * Flujo:
 * 1. Evaluador detecta error (redacción, tono, omisión, etc)
 * 2. Generador propone mejora al prompt
 * 3. Simulador prueba contra 14 arquetipos
 * 4. Decidor: ¿auto-aplicar, proponer+4h, o pedir aprobación?
 *
 * Decisiones automáticas (TÁCTICAS):
 * - Redacción, tono, reordenamiento
 *
 * Decisiones escaladas (ESTRATÉGICAS):
 * - Objetivo de campaña, público, presupuesto, políticas
 */

import type {
  DeteccionErrores,
  CandidataDeMejora,
  ComparacionPrompt,
  DecisionAutonomia,
  RegistroAprendizaje,
  ResultadoSimulacion,
} from "./tipos-autonomia";

const ARQUETIPOS = [
  "normal",
  "curioso",
  "indeciso",
  "desconfiado",
  "precio_sensible",
  "apresurado",
  "comparador",
  "esceptico",
  "molesto",
  "dificil",
  "experto",
  "desaparece",
  "regresa",
  "listo_para_comprar",
];

/**
 * Detecta errores en conversaciones pasadas
 * Se llama cada 10 conversaciones o cada 1 hora
 */
export async function detectarErrores(
  tenantId: number,
  ultimasConversaciones: any[],
): Promise<DeteccionErrores[]> {
  const errores: DeteccionErrores[] = [];

  for (const conv of ultimasConversaciones) {
    // Busca patrones de error en el historial
    const mensajeroAgente = conv.messages.filter((m: any) => m.role === "agent");

    // Error: Redacción repetitiva
    const respuestasUniques = new Set(mensajeroAgente.map((m: any) => m.content.slice(0, 30)));
    if (respuestasUniques.size < mensajeroAgente.length * 0.5) {
      errores.push({
        tipo: "redaccion",
        descripcion: "Respuestas muy repetitivas (mismo patrón >50% de las veces)",
        severidad: "medio",
        ejemploProblema: "¿Y qué más quisiera saber?",
        ejemploCorreccion: "Varía: ¿Hay algo más que te gustaría explorar?",
        frecuencia: Math.floor(mensajeroAgente.length * 0.5),
      });
    }

    // Error: Omisión de preguntas estratégicas
    if (conv.intent === "comparacion" && !mensajeroAgente.some((m: any) => m.content.includes("diferencia"))) {
      errores.push({
        tipo: "omision",
        descripcion: "Cliente comparando pero agente no explica diferencias",
        severidad: "alto",
        ejemploProblema: "[sin comparativa]",
        ejemploCorreccion: "Tabla comparativa o contraste directo",
        frecuencia: 1,
      });
    }

    // Error: Contradicción
    const primeraRespuesta = mensajeroAgente[0]?.content.toLowerCase() || "";
    const ultimaRespuesta = mensajeroAgente[mensajeroAgente.length - 1]?.content.toLowerCase() || "";
    if (primeraRespuesta.includes("sí") && ultimaRespuesta.includes("no") && conv.duration < 60) {
      // Cambió de opinión en <1 min = posible contradicción
      errores.push({
        tipo: "contradiccion",
        descripcion: "Agente cambió de opinión sin explicación",
        severidad: "alto",
        ejemploProblema: "Primero dijo sí, después dijo no",
        ejemploCorreccion: "Mantener coherencia o explicar cambio",
        frecuencia: 1,
      });
    }
  }

  return errores;
}

/**
 * Genera candidata de mejora basada en errores detectados
 */
export async function generarMejora(
  error: DeteccionErrores,
  promptActual: string,
  llm: any,
): Promise<CandidataDeMejora> {
  const suggestionsMap: Record<string, string> = {
    redaccion: "Varía más las respuestas. No repitas la misma estructura.",
    tono: "Sé más cálido y menos corporativo.",
    omision: "Haz preguntas estratégicas según el intent del cliente.",
    contradiccion: "Mantén coherencia en la conversación.",
    precio_inventado: "Siempre verifica precio real antes de mencionar cifra.",
  };

  const instruccion = suggestionsMap[error.tipo];

  // Prompt para generar mejora
  const promptGenerador = `
El prompt actual del agente:

---
${promptActual}
---

Problema detectado: ${error.descripcion}
Instrucción: ${instruccion}

Genera una versión MEJORADA del prompt que:
1. Corrija el problema específico
2. NO rompa lo que ya funciona
3. Sea una línea de 1-2 párrafos, no una reescritura completa

DEVUELVE SOLO EL PROMPT NUEVO, sin explicación:`;

  try {
    // En producción: llamar LLM para generar mejora
    // Por ahora: fallback simple basado en tipo de error
    const promptNuevo = generarMejoraHardcodeada(error.tipo, promptActual);

    return {
      tenantId: 0,
      agentId: 0,
      tipo: error.severidad === "alto" ? "operativo" : "tactico",
      titulo: `Mejora: ${error.tipo}`,
      descripcion: error.descripcion,
      promptActual,
      promptNuevo,
      razon: instruccion,
      diff: {
        removed: [promptActual.slice(0, 50)],
        added: [promptNuevo.slice(0, 50)],
      },
      createdAt: new Date(),
    };
  } catch (err) {
    console.warn("[autonomia] Error generando mejora:", err);
    throw err;
  }
}

function generarMejoraHardcodeada(tipo: string, promptActual: string): string {
  const mejoras: Record<string, (p: string) => string> = {
    redaccion: (p) =>
      p.includes("¿Y qué")
        ? p.replace(/¿Y qué[^?]*\?/g, "¿Hay algo más que te gustaría explorar? ¿Quieres comparar opciones?")
        : p + "\nVaría las preguntas estratégicas según el intent.",
    tono: (p) => p.replace(/Correcto\./g, "Entiendo.").replace(/¡Excelente!/g, "Perfecto,"),
    omision: (p) =>
      p.includes("comparacion")
        ? p + "\nSi el cliente compara: explica diferencias con tabla o contraste."
        : p,
    contradiccion: (p) =>
      p +
      "\nMantén coherencia durante la conversación. Si cambias de opinión, explica por qué.",
    precio_inventado: (p) =>
      p +
      "\nNunca menciones precio sin verificarlo. Si no lo sabes, ofrece confirmarlo.",
  };

  const mejora = mejoras[tipo];
  return mejora ? mejora(promptActual) : promptActual;
}

/**
 * Simula la mejora contra 14 arquetipos
 * Devuelve: antes vs después para cada arquetipo
 */
export async function simularMejora(
  mejora: CandidataDeMejora,
  agentId: number,
  productId: number,
  llm: any,
): Promise<ResultadoSimulacion[]> {
  const resultados: ResultadoSimulacion[] = [];

  for (const arquetipoId of ARQUETIPOS) {
    try {
      // Simular con prompt actual
      const respuestaAntes = await simularTurno(
        mejora.promptActual,
        arquetipoId,
        productId,
        llm,
      );
      const tasaExitoAntes = evaluarRespuesta(respuestaAntes, arquetipoId);

      // Simular con prompt nuevo
      const respuestaDespues = await simularTurno(
        mejora.promptNuevo,
        arquetipoId,
        productId,
        llm,
      );
      const tasaExitoDespues = evaluarRespuesta(respuestaDespues, arquetipoId);

      resultados.push({
        arquetipoId,
        arquitectoNombre: arquetipoId.replace(/_/g, " "),
        tasaExitoAntes,
        tasaExitoDespues,
        mejora: tasaExitoDespues - tasaExitoAntes,
        mensajeEjemplo: `"${generarMensajeDelArquetipo(arquetipoId)}"`,
        respuestaAntes: respuestaAntes.slice(0, 100),
        respuestaDespues: respuestaDespues.slice(0, 100),
      });
    } catch (err) {
      console.warn(`[autonomia] Error simulando ${arquetipoId}:`, err);
      resultados.push({
        arquetipoId,
        arquitectoNombre: arquetipoId.replace(/_/g, " "),
        tasaExitoAntes: 50,
        tasaExitoDespues: 50,
        mejora: 0,
        mensajeEjemplo: "error",
        respuestaAntes: "",
        respuestaDespues: "",
      });
    }
  }

  return resultados;
}

async function simularTurno(
  prompt: string,
  arquetipoId: string,
  productId: number,
  llm: any,
): Promise<string> {
  // En producción: llamar motor.responder() con el prompt
  // Por ahora: fallback simulado
  await new Promise((r) => setTimeout(r, 50)); // Simular latencia
  return `Respuesta simulada para ${arquetipoId}`;
}

function evaluarRespuesta(respuesta: string, arquetipoId: string): number {
  // Heurística simple: evalúa calidad basada en longitud y palabras clave
  let score = 50; // baseline

  if (respuesta.length > 50) score += 10;
  if (respuesta.includes("?")) score += 10;
  if (respuesta.includes("precio") || respuesta.includes("opciones")) score += 10;

  // Penalidades por arquetipos específicos
  if (arquetipoId === "esceptico" && respuesta.includes("garantía")) score += 10;
  if (arquetipoId === "precio_sensible" && respuesta.includes("alternativa")) score += 10;
  if (arquetipoId === "apresurado" && respuesta.length < 100) score += 10;

  return Math.min(100, score);
}

function generarMensajeDelArquetipo(arquetipoId: string): string {
  const mensajes: Record<string, string> = {
    precio_sensible: "¿Cuánto cuesta el más barato?",
    apresurado: "¿Cuándo lo tienes? Necesito urgente.",
    esceptico: "¿Realmente funciona? ¿Garantía?",
    comparador: "¿Cuál es la diferencia con el otro?",
    molesto: "Esto no es lo que esperaba.",
    listo_para_comprar: "Dale, lo quiero. ¿Cómo pago?",
  };

  return mensajes[arquetipoId] || "Cuéntame más del producto.";
}

/**
 * Compara resultados: antes vs después
 */
export function compararSimulaciones(simulaciones: ResultadoSimulacion[]): ComparacionPrompt {
  const mejoras = simulaciones.filter((s) => s.mejora > 0);
  const empeoramientos = simulaciones.filter((s) => s.mejora < 0);
  const mejoraMean = mejoras.reduce((s, m) => s + m.mejora, 0) / mejoras.length || 0;

  // Desviación estándar
  const varianza = simulaciones.reduce((sum, s) => sum + Math.pow(s.mejora - mejoraMean, 2), 0) / simulaciones.length;
  const desvio = Math.sqrt(varianza);

  // Confianza = balance neto de simulaciones (mejoras − empeoramientos) sobre el total.
  // Ya no suma 5 puntos por victoria: con 14 mejoras no debe valer 100% por cantidad.
  const total = simulaciones.length || 1;
  const confianza = Math.max(0, Math.round(((mejoras.length - empeoramientos.length) / total) * 100));

  return {
    simulacionesTotal: simulaciones.length,
    mejoraMedia: mejoraMean,
    mejora: {} as CandidataDeMejora,
    simulaciones,
    confianzaPromedio: Math.min(100, Math.max(0, confianza)),
    desvioEstandar: desvio,
    sinRiesgos: empeoramientos.length === 0,
    arquetiposMejoraron: mejoras.map((m) => m.arquetipoId),
    arquetiposEmpeoraron: empeoramientos.map((e) => e.arquetipoId),
  };
}

/** Hay evidencia suficiente para aplicar sin revisión humana. */
function evidenciaFuerte(c: ComparacionPrompt, mejoraMinima: number): boolean {
  return c.simulacionesTotal >= 10 && c.mejoraMedia >= mejoraMinima;
}

/**
 * Decide: ¿auto-aplicar, proponer+4h, o pedir aprobación?
 * Auto-aplicar solo con evidencia (>=10 simulaciones, mejora media mínima y cero empeoramientos).
 */
export function decidirAutonomia(
  mejora: CandidataDeMejora,
  comparacion: ComparacionPrompt,
): DecisionAutonomia {
  const { confianzaPromedio, arquetiposEmpeoraron, sinRiesgos } = comparacion;

  let decision: "auto_aplicar" | "proponer_4h" | "pedir_aprobacion" | "rechazar" = "rechazar";
  let razonamiento = "";

  if (mejora.tipo === "tactico") {
    // TÁCTICO: cambios de redacción, tono, reordenamiento
    // Auto-aplicar exige evidencia: muchas simulaciones y una mejora media clara.
    if (confianzaPromedio > 85 && sinRiesgos && evidenciaFuerte(comparacion, 20)) {
      decision = "auto_aplicar";
      razonamiento = `Confianza ${confianzaPromedio.toFixed(0)}% + sin riesgos → auto-aplicar`;
    } else if (confianzaPromedio > 70) {
      decision = "proponer_4h";
      razonamiento = `Confianza ${confianzaPromedio.toFixed(0)}% → proponer + 4h auto-aplica`;
    } else {
      decision = "pedir_aprobacion";
      razonamiento = `Confianza ${confianzaPromedio.toFixed(0)}% < 70% → requiere aprobación`;
    }
  } else if (mejora.tipo === "operativo") {
    // OPERATIVO: cambios mayores al prompt (omisiones, contradicciones)
    if (confianzaPromedio > 90 && sinRiesgos && evidenciaFuerte(comparacion, 25)) {
      decision = "auto_aplicar";
      razonamiento = `Operativo con alta confianza (${confianzaPromedio.toFixed(0)}%) → auto-aplica`;
    } else if (confianzaPromedio > 75) {
      decision = "proponer_4h";
      razonamiento = `Operativo mediano (${confianzaPromedio.toFixed(0)}%) → propone + 4h`;
    } else {
      decision = "pedir_aprobacion";
      razonamiento = `Operativo requiere evaluación humana`;
    }
  } else {
    // ESTRATÉGICO: nunca auto, siempre pedir
    decision = "pedir_aprobacion";
    razonamiento = "Cambios estratégicos siempre requieren aprobación";
  }

  // Si hay empeoramientos, nunca auto-aplica
  if (arquetiposEmpeoraron.length > 0) {
    decision = "pedir_aprobacion";
    razonamiento += ` (empeora para: ${arquetiposEmpeoraron.join(", ")})`;
  }

  return {
    mejora,
    decision,
    confianza: confianzaPromedio,
    razonamiento,
    fechaAplicacion: decision === "auto_aplicar" ? new Date() : undefined,
  };
}

/**
 * Orquestación: detectar → generar → simular → decidir
 */
export async function mejorarAgentAutonomamente(
  tenantId: number,
  agentId: number,
  productId: number,
  ultimasConversaciones: any[],
  promptActual: string,
  llm: any,
): Promise<DecisionAutonomia[]> {
  const decisiones: DecisionAutonomia[] = [];

  try {
    // 1. Detectar
    const errores = await detectarErrores(tenantId, ultimasConversaciones);
    if (errores.length === 0) {
      console.log("[autonomia] Sin errores detectados");
      return decisiones;
    }

    // 2. Generar mejora para cada error
    for (const error of errores) {
      const mejora = await generarMejora(error, promptActual, llm);
      mejora.tenantId = tenantId;
      mejora.agentId = agentId;

      // 3. Simular
      const simulaciones = await simularMejora(mejora, agentId, productId, llm);
      const comparacion = compararSimulaciones(simulaciones);
      comparacion.mejora = mejora;

      // 4. Decidir
      const decision = decidirAutonomia(mejora, comparacion);

      decisiones.push(decision);

      console.log("[autonomia]", {
        error: error.tipo,
        confianza: decision.confianza.toFixed(0),
        decision: decision.decision,
        razonamiento: decision.razonamiento,
      });
    }

    return decisiones;
  } catch (err) {
    console.error("[autonomia] Error en mejora:", err);
    return decisiones;
  }
}
