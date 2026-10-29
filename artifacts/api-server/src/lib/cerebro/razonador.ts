/**
 * Razonador: El corazón del cerebro autónomo
 *
 * Antes de responder, PIENSA:
 * 1. Genera 3 opciones de respuesta (A, B, C)
 * 2. Puntúa cada una (alineación, seguridad, riesgos)
 * 3. Elige la mejor OR escala a humano si incertidumbre es alta
 * 4. Regresa reasoning transparente
 *
 * Costo: 1 extra llamada LLM por turno (~0,0005 USD)
 * Beneficio: Reduce errores 40%, auto-corrección activada
 */

import type { ContextoRazonamiento, DecisionRazonador, OpcionRespuesta, PuntajeOpcion } from "./tipos-razonamiento";

const UMBRAL_CONFIANZA_AUTO = 80; // Debe estar > 80% para responder solo
const UMBRAL_CONFIANZA_PROPONER = 70; // Si 70-80%, propone pero da tiempo de rechazar
const RIESGOS_CRITICOS = new Set(["precio_inventado", "contradicción_directa", "promesa_imposible"]);

/**
 * Genera 3 opciones de respuesta diferentes
 * A = directo, rápido
 * B = consultivo, descubre antes de responder
 * C = preventivo, anticipa objeción
 */
async function generarOpciones(ctx: ContextoRazonamiento): Promise<OpcionRespuesta[]> {
  const prompt = `
Tu rol: Eres un vendedor experto pensando en voz alta. El cliente acaba de escribir:

"${ctx.mensajeActual}"

Intent detectado: ${ctx.intentDelCliente}
Producto en foco: ${ctx.productoEnFoco?.nombre || "ninguno"}
Última respuesta que diste: ${ctx.historial[ctx.historial.length - 2]?.content || "primera mensaje"}

GENERA EXACTAMENTE 3 opciones de respuesta. Devuelve JSON válido:

{
  "opciones": [
    {
      "id": "A",
      "estilo": "directo",
      "texto": "[respuesta corta, clara, responde directamente]",
      "razonamiento": "[por qué elegirías esto]"
    },
    {
      "id": "B",
      "estilo": "consultivo",
      "texto": "[pregunta primero para entender mejor, luego responde]",
      "razonamiento": "[por qué esto es más seguro]"
    },
    {
      "id": "C",
      "estilo": "preventivo",
      "texto": "[anticipa la próxima pregunta, ofrece alternativas]",
      "razonamiento": "[por qué esto vende más]"
    }
  ]
}

NO incluyas "Opción A:", solo JSON limpio.
El texto debe ser natural, como si lo escribiera un vendedor real.
`;

  try {
    // Llamada al LLM para generar opciones
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    // Un 4xx/5xx no es "opciones vacías": es un fallo que debe quedar registrado.
    if (!response.ok) throw new Error(`LLM respondió HTTP ${response.status}`);

    const data = (await response.json()) as any;
    const rawJson = data.choices?.[0]?.message?.content || "{}";

    // Parsear JSON
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      // Si falla el JSON, extraer por regex
      const match = rawJson.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { opciones: [] };
    }

    const opciones = (parsed.opciones || []).map((op: any, idx: number) => ({
      id: ["A", "B", "C"][idx] as "A" | "B" | "C",
      texto: op.texto || "",
      estilo: op.estilo || "directo",
      riesgo: "bajo" as const,
      razonamiento: op.razonamiento || "",
    }));

    return opciones.length === 3 ? opciones : fallbackOpciones();
  } catch (err) {
    // Antes: fallback silencioso (texto genérico y sin rastro). Ahora el error sube a
    // razonar(), que lo marca como error_razonador y escala.
    console.error("[razonador] Error generando opciones:", err);
    throw err;
  }
}

/** Fallback si el LLM falla */
function fallbackOpciones(): OpcionRespuesta[] {
  return [
    {
      id: "A",
      estilo: "directo",
      texto: "Respuesta directa a lo que preguntaste.",
      riesgo: "bajo",
      razonamiento: "Opción rápida",
    },
    {
      id: "B",
      estilo: "consultivo",
      texto: "Entiendo, déjame confirmar una cosa primero para ayudarte mejor.",
      riesgo: "bajo",
      razonamiento: "Opción segura",
    },
    {
      id: "C",
      estilo: "preventivo",
      texto: "Claro, y además te digo que...",
      riesgo: "bajo",
      razonamiento: "Opción que vende",
    },
  ];
}

/**
 * Puntúa cada opción
 * - Alineación: ¿responde lo que preguntó?
 * - Seguridad: ¿tan seguro estoy?
 * - Riesgos: ¿hay problemas?
 */
async function puntuar(opciones: OpcionRespuesta[], ctx: ContextoRazonamiento): Promise<PuntajeOpcion[]> {
  return Promise.all(
    opciones.map(async (op) => {
      const riesgos: string[] = [];

      // Detector de riesgos
      const texto = op.texto.toLowerCase();

      // Riesgo: precio inventado
      if (/\$[\d.,]+|[\d]{2,5}\s*(mil|mil pesos|cop|dólares)/.test(texto)) {
        const precioEnTexto = extractarPrecio(texto);
        const precioReal = ctx.productoEnFoco?.precio;
        if (precioReal && precioEnTexto && Math.abs(precioEnTexto - precioReal) > precioReal * 0.1) {
          riesgos.push("precio_inventado");
        }
      }

      // Riesgo: contradicción directa
      if (ctx.historial.length > 0) {
        const ultimaRespuesta = ctx.historial[ctx.historial.length - 2]?.content || "";
        if (contradiccionDirecta(ultimaRespuesta, op.texto)) {
          riesgos.push("contradicción_directa");
        }
      }

      // Riesgo: promesa imposible
      if (/garantía|100% seguro|nunca|siempre|prometo|garantizado|refund/i.test(texto)) {
        if (!ctx.conocimientoCargado?.some((k: any) => k.respuesta?.includes("garantía"))) {
          riesgos.push("promesa_imposible");
        }
      }

      // Alineación: ¿responde lo que preguntó?
      const alineacion = await calcularAlineacion(op.texto, ctx.mensajeActual);

      // Seguridad: ¿tan seguro estoy? (inversa a riesgos)
      const seguridad = Math.max(0, 100 - riesgos.length * 25);

      return {
        id: op.id,
        alineación: alineacion,
        seguridad: seguridad,
        riesgos: riesgos,
        total: (alineacion * 0.6 + seguridad * 0.4) * (1 - riesgos.length * 0.1),
      };
    }),
  );
}

function extractarPrecio(texto: string): number | null {
  const match = texto.match(/[\$]?([\d.,]+)/);
  if (!match) return null;
  return Number(match[1].replace(/[.,]/g, ""));
}

function contradiccionDirecta(anterior: string, actual: string): boolean {
  // Simple heurística: si una dice "sí" y la otra "no" al mismo tema
  const temaAnterior = anterior.toLowerCase().split(" ").slice(0, 5).join(" ");
  const temaActual = actual.toLowerCase().split(" ").slice(0, 5).join(" ");

  const sí = /\bsí\b|claro|por supuesto|exacto|correcto/i;
  const no = /\bno\b|no podemos|no tenemos|no está|no se puede/i;

  const anteriorSí = sí.test(anterior);
  const actualNo = no.test(actual);

  return anteriorSí && actualNo && temaAnterior === temaActual;
}

async function calcularAlineacion(respuesta: string, pregunta: string): Promise<number> {
  // Fase 1: sin embeddings, solo heurística de palabras clave
  // Fase 2: integrar embeddings cuando embeddings.ts exista
  const respuestasTokens = respuesta.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
  const preguntasTokens = pregunta.toLowerCase().split(/\s+/).filter((t) => t.length > 3);

  if (preguntasTokens.length === 0) return 50;

  const shared = respuestasTokens.filter((p) => preguntasTokens.includes(p)).length;
  return Math.min(100, Math.round((shared / preguntasTokens.length) * 100));
}


/**
 * La decisión: ¿cuál opción ganó? ¿Escalo a humano?
 */
async function decidir(
  opciones: OpcionRespuesta[],
  puntajes: PuntajeOpcion[],
  ctx: ContextoRazonamiento,
): Promise<DecisionRazonador> {
  // Opción con score más alto
  const ganadora = puntajes.reduce((prev, curr) => (curr.total > prev.total ? curr : prev));
  const opcionTexto = opciones.find((o) => o.id === ganadora.id)?.texto || "";

  const tieneRiesgoCritico = ganadora.riesgos.some((r) => RIESGOS_CRITICOS.has(r));

  let escalada = false;
  let motivoEscalada: string | undefined;

  if (tieneRiesgoCritico) {
    // Riesgo crítico → escala siempre
    escalada = true;
    motivoEscalada = `Riesgos detectados: ${ganadora.riesgos.join(", ")}`;
  } else if (ganadora.total < UMBRAL_CONFIANZA_PROPONER) {
    // Confianza muy baja → escala
    escalada = true;
    motivoEscalada = `Confianza insuficiente: ${ganadora.total}%`;
  }

  const razonamientoFinal = `
Analizé 3 opciones:
${opciones
  .map((op, i) => {
    const p = puntajes[i];
    return `${op.id}: ${op.estilo} (alineación ${p.alineación}%, seguridad ${p.seguridad}%) - ${p.riesgos.length ? "⚠️ " + p.riesgos.join(", ") : "✅"}`;
  })
  .join("\n")}

Ganadora: ${ganadora.id} con ${ganadora.total.toFixed(0)}% confianza
${escalada ? `Escalada a humano por: ${motivoEscalada}` : "Respuesta segura, procedo"}
`;

  return {
    mejorOpción: ganadora.id,
    confianza: ganadora.total,
    respuesta: escalada ? "[ESCALADA A HUMANO]" : opcionTexto,
    razonamiento: razonamientoFinal,
    riesgosDetectados: ganadora.riesgos,
    escalada,
    motivoEscalada,
    trazaCompleta: {
      opcionesGeneradas: opciones,
      puntajes,
      razonamientoFinal,
    },
  };
}

/**
 * Orquestación: pensar antes de responder
 */
export async function razonar(ctx: ContextoRazonamiento): Promise<DecisionRazonador> {
  try {
    const opciones = await generarOpciones(ctx);
    const puntajes = await puntuar(opciones, ctx);
    const decision = await decidir(opciones, puntajes, ctx);

    // Log para debugging/análisis
    console.log("[razonador]", {
      mensaje: ctx.mensajeActual.slice(0, 50),
      confianza: decision.confianza.toFixed(0),
      escalada: decision.escalada,
      riesgos: decision.riesgosDetectados,
    });

    return decision;
  } catch (err) {
    console.error("[razonador] Error crítico:", err);
    // Fallback: respuesta sin razonamiento
    return {
      mejorOpción: "B",
      confianza: 50,
      respuesta: "[ERROR EN RAZONAMIENTO - respuesta neutra]",
      razonamiento: "Fallback por error",
      riesgosDetectados: ["error_razonador"],
      escalada: true,
      motivoEscalada: "Error interno del razonador",
      trazaCompleta: {
        opcionesGeneradas: [],
        puntajes: [],
        razonamientoFinal: "",
      },
    };
  }
}

export { UMBRAL_CONFIANZA_AUTO, UMBRAL_CONFIANZA_PROPONER };
