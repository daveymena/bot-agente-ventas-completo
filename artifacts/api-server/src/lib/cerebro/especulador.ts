/**
 * Especulador: Anticipa el próximo turno
 *
 * En lugar de esperar que el cliente pregunte,
 * predice QUÉ va a preguntar y prepara respuesta.
 *
 * Ejemplo:
 * Cliente pregunta por precio → Especulador predice "va a pedir descuento"
 * Prepara: "Si preguntas por descuento, aquí están mis opciones"
 * Cliente dice: "¿Hay descuento?" → ¡ACERTÓ! Tenía respuesta lista
 */

import type {
  HipotesisDelProximoTurno,
  PatronDeComportamiento,
  ValidacionDeHipotesis,
  RegistroDeEspeculacion,
  PerfilDeCliente,
} from "./tipos-especulador";

/**
 * Genera hipótesis sobre qué va a pasar en el próximo turno
 */
export function generarHipotesis(
  historicoMensajes: Array<{ role: string; content: string }>,
  tags: string[],
  pasoActual: number,
): HipotesisDelProximoTurno {
  // Patrones comunes según contexto
  const patrones: Record<string, HipotesisDelProximoTurno[]> = {
    precio: [
      {
        intent: "descuento",
        tema: "Va a pedir descuento",
        descripcion: "Cliente preguntó por precio → probable que pida descuento",
        probabilidad: 65,
        razonamiento: "Es patrón común después de oír precio",
        respuestaAnticipada: "El precio es fijo, pero tengo alternativas más económicas",
        alternativas: ["Plan de pagos", "Bundle con otros productos", "Referral discount"],
      },
      {
        intent: "alternativa_economica",
        tema: "Va a preguntar por opción más barata",
        descripcion: "Cliente es precio-sensible",
        probabilidad: 72,
        razonamiento: "Mostró sensibilidad a cifra alta",
        respuestaAnticipada: "Sí, tengo opciones desde...",
        alternativas: ["Versión básica", "Plan trimestral", "Alianza con proveedor"],
      },
    ],
    garantia: [
      {
        intent: "garantia_extended",
        tema: "Va a preguntar por garantía extendida",
        descripcion: "Cliente preguntó por garantía → quiere más cobertura",
        probabilidad: 58,
        razonamiento: "Patrón: después de garantía → extensión",
        respuestaAnticipada: "Sí, tenemos garantía extendida 2 años",
        alternativas: ["Plan de cobertura total", "Servicio técnico prioritario"],
      },
    ],
    envio: [
      {
        intent: "tracking",
        tema: "Va a preguntar por tracking",
        descripcion: "Cliente preguntó envío → querrá saber dónde está",
        probabilidad: 61,
        razonamiento: "Después de envío, cliente quiere rastrear",
        respuestaAnticipada: "Te mando link de tracking en tiempo real",
        alternativas: ["Notificaciones por SMS", "Actualizaciones por WhatsApp"],
      },
    ],
    objecion: [
      {
        intent: "volver_a_opciones",
        tema: "Va a volver a opciones anteriores",
        descripcion: "Cliente en objeción → probablemente quiera reconsiderar",
        probabilidad: 68,
        razonamiento: "Objeción = indecisión temporal",
        respuestaAnticipada: "Claro, volvemos a las opciones. ¿Quieres que repase?",
        alternativas: ["Mostrar tabla comparativa nuevamente", "Ofrecer período de prueba"],
      },
    ],
  };

  // Busca patrón basado en último mensaje
  const ultimoMensaje = historicoMensajes[historicoMensajes.length - 1]?.content.toLowerCase() || "";

  for (const [clave, hipotesis] of Object.entries(patrones)) {
    if (ultimoMensaje.includes(clave)) {
      // Elige la hipótesis más probable
      return hipotesis.sort((a, b) => b.probabilidad - a.probabilidad)[0];
    }
  }

  // Fallback: hipótesis genérica
  return {
    intent: "mas_informacion",
    tema: "Va a pedir más información",
    descripcion: "Cliente aún está evaluando",
    probabilidad: 45,
    razonamiento: "Patrón neutral cuando no hay señal clara",
    respuestaAnticipada: "¿Hay algo más que quieras saber?",
    alternativas: ["¿Qué dudas tienes?", "Estoy aquí para ayudarte"],
  };
}

/**
 * Valida si la hipótesis fue correcta
 */
export function validarHipotesis(
  hipotesis: HipotesisDelProximoTurno,
  mensajeReal: string,
): ValidacionDeHipotesis {
  const acerto = mensajeReal.toLowerCase().includes(hipotesis.intent.toLowerCase());

  let proximoTema = "desconocido";
  let razonPorQueFallo: string | undefined;
  let aprendizaje = "";

  if (acerto) {
    aprendizaje = `Patrón confirmado: ${hipotesis.tema}`;
    proximoTema = hipotesis.intent;
  } else {
    // Intenta detectar el tema real
    const temasComunes = [
      "precio",
      "garantia",
      "envio",
      "color",
      "tamanio",
      "alternativa",
      "objecion",
      "cierre",
    ];
    proximoTema = temasComunes.find((t) => mensajeReal.toLowerCase().includes(t)) || "desconocido";
    razonPorQueFallo = `Esperé ${hipotesis.intent}, pero cliente preguntó por ${proximoTema}`;
    aprendizaje = `Patrón incorrecto. Aprender: después de "${hipotesis.tema}" → "${proximoTema}"`;
  }

  return {
    hipotesis,
    mensajeReal,
    acerto,
    proximoTema,
    razonPorQueFallo,
    aprendizaje,
  };
}

/**
 * Aprende de historiales para mejorar futuras hipótesis
 */
export function derivarPatronesDelHistorial(
  registros: ValidacionDeHipotesis[],
): PatronDeComportamiento[] {
  const patrones: Map<string, PatronDeComportamiento> = new Map();

  for (const registro of registros) {
    if (registro.acerto) {
      const clave = `${registro.hipotesis.intent}_${registro.proximoTema}`;
      const existente = patrones.get(clave);

      if (existente) {
        existente.frecuencia++;
        existente.confianza = Math.min(100, existente.confianza + 5);
      } else {
        patrones.set(clave, {
          nombre: `patron_${registro.hipotesis.intent}`,
          descripcion: registro.hipotesis.tema,
          disparadores: [registro.hipotesis.intent],
          proximoComportamiento: registro.proximoTema,
          frecuencia: 1,
          confianza: registro.hipotesis.probabilidad,
          ejemplos: [registro.mensajeReal.slice(0, 50)],
        });
      }
    }
  }

  return Array.from(patrones.values()).sort((a, b) => b.confianza - a.confianza);
}

/**
 * Construye perfil de cliente basado en patrones
 */
export function construirPerfilDeCliente(
  tags: string[],
  historicoValidaciones: ValidacionDeHipotesis[],
  patrones: PatronDeComportamiento[],
): PerfilDeCliente {
  const aciertos = historicoValidaciones.filter((v) => v.acerto).length;
  const tasaAciertoPromedio = historicoValidaciones.length > 0
    ? (aciertos / historicoValidaciones.length) * 100
    : 0;

  // Próximo comportamiento esperado basado en patrón con más confianza
  const proximoComportamientoEsperado = patrones.length > 0 ? patrones[0].proximoComportamiento : "desconocido";

  return {
    tags,
    patronesDetectados: patrones,
    historicoHipotesis: historicoValidaciones,
    tasaAciertoPromedio,
    proximoComportamientoEsperado,
  };
}

/**
 * Orquestación: generar → validar → aprender
 */
export function especularYValidar(
  historicoMensajes: Array<{ role: string; content: string }>,
  tags: string[],
  pasoActual: number,
  historicoValidaciones: ValidacionDeHipotesis[] = [],
): {
  hipotesis: HipotesisDelProximoTurno;
  perfil: PerfilDeCliente;
  respuestaAnticipada: string;
} {
  // 1. Generar hipótesis
  const hipotesis = generarHipotesis(historicoMensajes, tags, pasoActual);

  // 2. Derivar patrones del historial
  const patrones = derivarPatronesDelHistorial(historicoValidaciones);

  // 3. Construir perfil
  const perfil = construirPerfilDeCliente(tags, historicoValidaciones, patrones);

  // 4. Ajustar probabilidad de hipótesis basada en perfil
  let respuestaAnticipada = hipotesis.respuestaAnticipada;
  if (patrones.length > 0 && patrones[0].proximoComportamiento === hipotesis.intent) {
    // Si el patrón coincide con hipótesis, aumentar confianza
    hipotesis.probabilidad = Math.min(100, hipotesis.probabilidad + 15);
  }

  return {
    hipotesis,
    perfil,
    respuestaAnticipada,
  };
}

/**
 * Helper: dada una conversación pasada, simular especulación
 */
export function simularEspeculacionEnHistorial(
  mensajes: Array<{ role: string; content: string }>,
  tags: string[],
): { acertos: number; total: number; tasaAcierto: number } {
  let acertos = 0;
  let total = 0;

  for (let i = 0; i < mensajes.length - 1; i++) {
    if (mensajes[i].role === "assistant" && mensajes[i + 1].role === "user") {
      const hipotesis = generarHipotesis(mensajes.slice(0, i + 1), tags, i);
      const validacion = validarHipotesis(hipotesis, mensajes[i + 1].content);

      total++;
      if (validacion.acerto) acertos++;
    }
  }

  return {
    acertos,
    total,
    tasaAcierto: total > 0 ? (acertos / total) * 100 : 0,
  };
}
