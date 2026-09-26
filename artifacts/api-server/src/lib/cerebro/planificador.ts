/**
 * Planificador: Piensa la conversación completa
 *
 * En lugar de responder turno a turno sin strategy,
 * genera un árbol de pasos y branches, y alinea cada respuesta con el plan.
 *
 * Ejemplo:
 * Intent: compra_evaluando
 * Plan:
 *   1. Confirmar necesidad
 *      ├─ Éxito → 2. Mostrar opciones
 *      └─ Fracaso → 3. Diagnosticar objeción
 *   2. Mostrar opciones
 *      ├─ Éxito → 4. Cierre
 *      └─ Fracaso → 3. Diagnosticar objeción
 */

import type {
  PasoDelPlan,
  RamaAlternativa,
  PlanDelCliente,
  EvaluacionAlineacion,
  ActualizacionDelPlan,
} from "./tipos-planificador";

/**
 * Genera un plan de conversación basado en el intent
 */
export function generarPlan(intent: string, tags: string[]): PlanDelCliente {
  const planesBase: Record<string, PasoDelPlan[]> = {
    compra_evaluando: [
      {
        id: 1,
        nombre: "Confirmar necesidad",
        descripcion: "Entender qué busca exactamente",
        objetivo: "validar que entiendemos la necesidad",
        preguntaOAccion: "¿Cuál es tu necesidad exacta?",
        siExito: 2,
        siFracaso: 3,
        maxTurnos: 2,
        dispara: ["compra", "busca", "necesito", "quiero"],
        senalesExito: ["perfecto", "exacto", "eso es", "claro"],
        senalesFracaso: ["no", "nada", "no entiendo"],
      },
      {
        id: 2,
        nombre: "Mostrar opciones",
        descripcion: "Presentar 2-3 soluciones",
        objetivo: "cliente elige una dirección",
        preguntaOAccion: "Tengo estas opciones para ti",
        siExito: 4,
        siFracaso: 3,
        maxTurnos: 3,
        dispara: ["opción", "alternativa", "qué tienes"],
        senalesExito: ["me interesa", "cuánto cuesta", "cuéntame más"],
        senalesFracaso: ["ninguna", "no me gusta", "muy caro"],
      },
      {
        id: 3,
        nombre: "Diagnosticar objeción",
        descripcion: "Entender por qué dice no",
        objetivo: "resolver la objeción real",
        preguntaOAccion: "¿Qué es lo que te preocupa?",
        siExito: 2,
        siFracaso: 5,
        maxTurnos: 2,
        dispara: ["precio", "garantía", "envío", "tiempo", "dudoso"],
        senalesExito: ["entiendo", "tiene sentido", "pero si..."],
        senalesFracaso: ["mejor dejarlo", "gracias no", "voy a pensarlo"],
      },
      {
        id: 4,
        nombre: "Cierre",
        descripcion: "Pasar a compra o postventa",
        objetivo: "confirmar decisión",
        preguntaOAccion: "¿Cómo hacemos?",
        siExito: "cierre",
        siFracaso: 5,
        maxTurnos: 2,
        dispara: ["cómo pago", "dale", "sí", "quiero"],
        senalesExito: ["listo", "dale", "transfiero", "envía"],
        senalesFracaso: ["mejor no", "otro día"],
      },
      {
        id: 5,
        nombre: "Alternativa final",
        descripcion: "Última opción antes de cerrar",
        objetivo: "no perder la venta",
        preguntaOAccion: "Te dejo mis datos para después",
        siExito: "cierre",
        siFracaso: "cierre",
        maxTurnos: 1,
        dispara: [],
        senalesExito: ["ok", "bueno", "vale"],
        senalesFracaso: ["no gracias"],
      },
    ],
    comparacion: [
      {
        id: 1,
        nombre: "Entender comparación",
        descripcion: "Qué quiere comparar exactamente",
        objetivo: "saber qué diferencias importan",
        preguntaOAccion: "¿Qué te interesa comparar?",
        siExito: 2,
        siFracaso: 3,
        maxTurnos: 2,
        dispara: ["diferencia", "vs", "mejor", "peor"],
        senalesExito: ["exacto", "eso", "claro"],
        senalesFracaso: ["no sé", "igual"],
      },
      {
        id: 2,
        nombre: "Tabla comparativa",
        descripcion: "Mostrar lado a lado",
        objetivo: "cliente ve claramente",
        preguntaOAccion: "Aquí ves las diferencias",
        siExito: 3,
        siFracaso: 4,
        maxTurnos: 2,
        dispara: [],
        senalesExito: ["ahora veo", "claro", "este"],
        senalesFracaso: ["confuso", "no cambio"],
      },
      {
        id: 3,
        nombre: "Recomendar",
        descripcion: "Explicar cuál es mejor por qué",
        objetivo: "cliente confía en consejo",
        preguntaOAccion: "Yo recomendaría este por...",
        siExito: 4,
        siFracaso: 4,
        maxTurnos: 1,
        dispara: [],
        senalesExito: ["tiene sentido", "buena idea"],
        senalesFracaso: ["pero prefiero", "el otro"],
      },
      {
        id: 4,
        nombre: "Cierre",
        descripcion: "Decisión y compra",
        objetivo: "confirmar",
        preguntaOAccion: "¿Vamos con este?",
        siExito: "cierre",
        siFracaso: "cierre",
        maxTurnos: 1,
        dispara: [],
        senalesExito: ["sí", "dale"],
        senalesFracaso: ["no", "otro"],
      },
    ],
  };

  const pasos = planesBase[intent] || planesBase.compra_evaluando;

  return {
    conversationId: "",
    intent,
    pasos,
    ramasAlternativas: generarRamas(tags),
    pasoActual: 1,
    pasosSeguidos: [1],
    turnoActual: 0,
    completitud: 0,
    señalización: {
      pasoActualCorrecto: true,
      ramaActualCorrecta: true,
      alineacion: 100,
    },
  };
}

/**
 * Genera ramas alternativas según tags/perfil del cliente
 */
function generarRamas(tags: string[]): RamaAlternativa[] {
  const ramas: RamaAlternativa[] = [];

  if (tags.includes("precio")) {
    ramas.push({
      id: "precio_sensible",
      nombre: "Cliente precio-sensible",
      condicion: "cliente_precio_sensible",
      pasos: [
        {
          id: 101,
          nombre: "Mostrar opciones económicas primero",
          descripcion: "No empezar por premium",
          objetivo: "cliente vea que hay soluciones asequibles",
          preguntaOAccion: "Tenemos opciones desde...",
          siExito: 102,
          siFracaso: 103,
          maxTurnos: 2,
          dispara: ["precio", "caro", "asequible"],
          senalesExito: ["ese sí", "cuéntame más"],
          senalesFracaso: ["aún caro", "no"],
        },
      ],
      probabilidad: 65,
    });
  }

  if (tags.includes("urgencia")) {
    ramas.push({
      id: "urgencia",
      nombre: "Cliente con urgencia",
      condicion: "cliente_urgencia",
      pasos: [
        {
          id: 201,
          nombre: "Ofrecer entrega express",
          descripcion: "Ir directo, sin preguntas extra",
          objetivo: "cliente sabe cuándo llega",
          preguntaOAccion: "Entrega express: mañana",
          siExito: 202,
          siFracaso: 202,
          maxTurnos: 1,
          dispara: ["urgente", "rápido", "ya", "prisa"],
          senalesExito: ["perfecto", "dale"],
          senalesFracaso: [],
        },
      ],
      probabilidad: 80,
    });
  }

  if (tags.includes("comparacion")) {
    ramas.push({
      id: "comparacion",
      nombre: "Cliente que compara",
      condicion: "cliente_comparacion",
      pasos: [
        {
          id: 301,
          nombre: "Tabla comparativa específica",
          descripcion: "Mostrar lado a lado exactamente",
          objetivo: "cliente ve claramente qué prefiere",
          preguntaOAccion: "Aquí la comparativa",
          siExito: 302,
          siFracaso: 302,
          maxTurnos: 2,
          dispara: ["diferencia", "vs", "mejor"],
          senalesExito: ["ahora veo", "prefiero"],
          senalesFracaso: [],
        },
      ],
      probabilidad: 72,
    });
  }

  return ramas;
}

/**
 * Evalúa si la respuesta actual está alineada con el plan
 */
export function evaluarAlineacion(
  plan: PlanDelCliente,
  respuestaAgente: string,
): EvaluacionAlineacion {
  const pasoActual = plan.pasos.find((p) => p.id === plan.pasoActual);

  if (!pasoActual) {
    return {
      pasoActual: plan.pasoActual,
      respuestaAgente,
      alineacion: 50,
      detalle: "Paso no encontrado",
      sugiere: "continuar",
      razon: "Plan roto",
    };
  }

  // Evalúa alineación
  let alineacion = 50; // baseline

  // ¿La respuesta contiene elementos del paso?
  if (respuestaAgente.toLowerCase().includes(pasoActual.preguntaOAccion.toLowerCase().split(" ")[0])) {
    alineacion += 20;
  }

  // ¿Tiene longitud razonable?
  if (respuestaAgente.length > 50 && respuestaAgente.length < 500) {
    alineacion += 15;
  }

  // ¿Contiene señales de éxito?
  const tieneSenal = pasoActual.senalesExito.some((s) =>
    respuestaAgente.toLowerCase().includes(s.toLowerCase()),
  );
  if (tieneSenal) {
    alineacion += 15;
  }

  alineacion = Math.min(100, alineacion);

  let sugiere: "continuar" | "ajustar" | "saltarpaso" | "volver" = "continuar";
  if (alineacion < 60) sugiere = "ajustar";
  if (alineacion > 85) sugiere = "continuar";

  return {
    pasoActual: plan.pasoActual,
    respuestaAgente,
    alineacion,
    detalle: `Paso ${pasoActual.id}: ${pasoActual.nombre}`,
    sugiere,
    razon: `Alineación ${alineacion}%`,
  };
}

/**
 * Actualiza el plan según señales del cliente
 */
export function actualizarPlan(
  plan: PlanDelCliente,
  mensajeCliente: string,
  respuestaAgente: string,
): ActualizacionDelPlan | null {
  const pasoActual = plan.pasos.find((p) => p.id === plan.pasoActual);

  if (!pasoActual) return null;

  const texto = (mensajeCliente + " " + respuestaAgente).toLowerCase();

  // Detecta señales de éxito
  const exitoDetectado = pasoActual.senalesExito.some((s) => texto.includes(s));
  const fracasoDetectado = pasoActual.senalesFracaso.some((s) => texto.includes(s));

  let proximoPaso = pasoActual.siExito;
  let razonCambio = "";
  let senalDetectada = "";

  if (exitoDetectado) {
    proximoPaso = pasoActual.siExito;
    razonCambio = "Señal de éxito detectada";
    senalDetectada = pasoActual.senalesExito.find((s) => texto.includes(s)) || "";
  } else if (fracasoDetectado) {
    proximoPaso = pasoActual.siFracaso;
    razonCambio = "Señal de fracaso detectada";
    senalDetectada = pasoActual.senalesFracaso.find((s) => texto.includes(s)) || "";
  } else {
    // Sin señal clara: continúa o se queda en el paso
    return null;
  }

  const turnosEnPaso = plan.pasosSeguidos.filter((id) => id === plan.pasoActual).length;

  if (proximoPaso === "cierre") {
    plan.completitud = 100;
  } else if (typeof proximoPaso === "number") {
    plan.pasoActual = proximoPaso;
    plan.pasosSeguidos.push(proximoPaso);
    plan.completitud = Math.min(100, (plan.pasosSeguidos.length / plan.pasos.length) * 100);
  }

  return {
    pasoActualAnterior: pasoActual.id,
    pasoActualNuevo: typeof proximoPaso === "number" ? proximoPaso : -1,
    razonCambio,
    senalDetectada,
    turnosEnPaso,
  };
}

/**
 * Visualiza el plan para debugging
 */
export function visualizarPlan(plan: PlanDelCliente): string {
  const pasosVisuales = plan.pasos.map((p) => {
    const marca = p.id === plan.pasoActual ? "→" : " ";
    return `${marca} ${p.id}. ${p.nombre}`;
  });

  return `
Plan: ${plan.intent}
Paso actual: ${plan.pasoActual}
Completitud: ${plan.completitud}%

${pasosVisuales.join("\n")}
`;
}

/**
 * Orquestación: generar plan + evaluar + actualizar
 */
export function procesarConPlan(
  intent: string,
  tags: string[],
  mensajeCliente: string,
  respuestaAgente: string,
  planExistente?: PlanDelCliente,
): { plan: PlanDelCliente; evaluacion: EvaluacionAlineacion; actualizacion: ActualizacionDelPlan | null } {
  // Generar o reutilizar plan
  const plan = planExistente || generarPlan(intent, tags);

  // Evaluar alineación
  const evaluacion = evaluarAlineacion(plan, respuestaAgente);

  // Actualizar
  const actualizacion = actualizarPlan(plan, mensajeCliente, respuestaAgente);

  return { plan, evaluacion, actualizacion };
}
