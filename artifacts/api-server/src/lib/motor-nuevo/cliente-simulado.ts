/**
 * CLIENTE SIMULADO — Arquetipos de clientes para entrenamiento del agente.
 *
 * 14 perfiles que representan comportamientos reales de clientes.
 * Cada uno reacciona de forma distinta a las mismas respuestas del vendedor.
 *
 * Usado por Agent Lab para simular conversaciones y detectar errores
 * antes de poner el agente en producción.
 */

export interface PerfilCliente {
  clave: string;
  nombre: string;
  descripcion: string;
  objetivoInicial: string;

  // Variables psicológicas (0-100)
  intencionCompra: number;      // probabilidad de comprar al entrar
  sensibilidadPrecio: number;   // qué tan importante es el precio
  confianza: number;            // nivel inicial de confianza en el vendedor
  paciencia: number;            // turnos antes de abandonar si no avanza

  // Contexto de origen
  canalOrigen: "facebook_ads" | "instagram_ads" | "google" | "tiktok" | "web" | "landing" | "referido" | "recurrente" | "organico";

  // Instrucciones para el LLM que juega el rol
  instruccionesDeRol: string;

  // Reglas específicas de evaluación para este arquetipo
  reglasEvaluacion: {
    descripcion: string;
    validar: (respuesta: string) => boolean;
  }[];
}

export const ARQUETIPOS_CLIENTE: Record<string, PerfilCliente> = {
  NORMAL: {
    clave: "NORMAL",
    nombre: "Cliente normal (de línea base)",
    descripcion: "Comprador típico que escucha, pregunta lo esencial, decide rápido.",
    objetivoInicial: "Entender qué es, cuánto cuesta, cómo funciona.",
    intencionCompra: 65,
    sensibilidadPrecio: 50,
    confianza: 70,
    paciencia: 6,
    canalOrigen: "facebook_ads",
    instruccionesDeRol: `Eres un cliente interesado pero cauteloso. Preguntas lo básico (qué es,
precio, cómo funciona, para quién). No eres experto ni paranoico. Si la respuesta
tiene sentido, avanzas. Si es confusa, repites la pregunta.`,
    reglasEvaluacion: [
      {
        descripcion: "El vendedor debe responder directo (no evasivo)",
        validar: (r) => r.length > 50 && !r.includes("[CARD:"),
      },
    ],
  },

  CURIOSO: {
    clave: "CURIOSO",
    nombre: "Cliente curioso (analítico)",
    descripcion: "Quiere detalles, hace muchas preguntas, compara, estudia antes de decidir.",
    objetivoInicial: "Entender completamente el producto antes de decidir.",
    intencionCompra: 55,
    sensibilidadPrecio: 40,
    confianza: 60,
    paciencia: 8,
    canalOrigen: "web",
    instruccionesDeRol: `Eres analítico y meticuloso. Haces muchas preguntas: qué incluye exactamente,
cuál es la diferencia vs competencia, cuáles son los casos de uso, qué dicen otros usuarios.
No te presiones fácil. Quieres hechos, no promesas.`,
    reglasEvaluacion: [
      {
        descripcion: "Las respuestas deben ser específicas (no generales)",
        validar: (r) => !r.match(/mejor|único|garantizado|siempre/i),
      },
    ],
  },

  INDECISO: {
    clave: "INDECISO",
    nombre: "Cliente indeciso (vacilante)",
    descripcion: "Puede estar listo pero duda, pide que le ayude a decidir, miedoso al cambio.",
    objetivoInicial: "Superar la duda antes de tomar la decisión.",
    intencionCompra: 60,
    sensibilidadPrecio: 55,
    confianza: 50,
    paciencia: 5,
    canalOrigen: "instagram_ads",
    instruccionesDeRol: `Estás interesado pero inseguro. Dices cosas como "lo voy a pensar",
"¿y si no me gusta?", "¿alguien más lo usa?". Necesitas que te convenzas de que es seguro.
Reagies bien a ejemplos y testimonios, pero desconfías de promesas.`,
    reglasEvaluacion: [
      {
        descripcion: "Debe diagnosticar la duda real, no ignorarla",
        validar: (r) => r.length > 80 && (r.includes("?") || r.includes("porque")),
      },
    ],
  },

  DESCONFIADO: {
    clave: "DESCONFIADO",
    nombre: "Cliente desconfiado (escéptico)",
    descripcion: "Rechaza buzzwords, pide evidencia real, no cree en promesas tipo marketing.",
    objetivoInicial: "Encontrar evidencia de que esto es real y vale la pena.",
    intencionCompra: 40,
    sensibilidadPrecio: 70,
    confianza: 30,
    paciencia: 4,
    canalOrigen: "google",
    instruccionesDeRol: `Eres escéptico por naturaleza. No crees en "el mejor", "garantizado", "cambiarás tu vida".
Quieres números reales, ejemplos concretos, gente que lo usa. Si sientes presión de venta,
desapareces. Prefieres que te digan la verdad incómoda a que te mienta bonito.`,
    reglasEvaluacion: [
      {
        descripcion: "No debe usar buzzwords ni promesas genéricas",
        validar: (r) => !r.match(/mejor|único|revolucionario|garantizado|transformará/i),
      },
      {
        descripcion: "Debe ofrecer evidencia concreta (números, ejemplos, hechos)",
        validar: (r) => r.match(/\d+|caso|ejemplo|cliente|usuario|real/i) !== null,
      },
    ],
  },

  PRECIO_SENSIBLE: {
    clave: "PRECIO_SENSIBLE",
    nombre: "Cliente sensible al precio (negocia)",
    descripcion: "Siempre pregunta por descuentos, compara precios, busca la mejor oferta.",
    objetivoInicial: "Conseguir el mejor precio posible.",
    intencionCompra: 70,
    sensibilidadPrecio: 95,
    confianza: 60,
    paciencia: 6,
    canalOrigen: "facebook_ads",
    instruccionesDeRol: `Tu presupuesto es limitado. Preguntas "¿hay descuento?", "vi otro más barato en otro lado",
"¿a cuánto lo dejarías?". No es que no tengas dinero, sino que quieres maximizar valor.
Si la propuesta de precio es clara y justa, compras.`,
    reglasEvaluacion: [
      {
        descripcion: "No debe ofrecer descuento antes de que lo pidan",
        validar: (r) => !r.match(/descuento|oferta|promoción/i) || r.includes("promoción activa"),
      },
      {
        descripcion: "Debe enfrcar el valor, no solo el costo",
        validar: (r) => r.includes("inversión") || r.includes("valor") || r.includes("costo"),
      },
    ],
  },

  APRESURADO: {
    clave: "APRESURADO",
    nombre: "Cliente apresurado (impulsivo)",
    descripcion: "Decide en 2-3 turnos, quiere link de pago YA, sin análisis profundo.",
    objetivoInicial: "Comprar rápido y terminar.",
    intencionCompra: 85,
    sensibilidadPrecio: 30,
    confianza: 75,
    paciencia: 2,
    canalOrigen: "landing",
    instruccionesDeRol: `Vienes con prisa. Preguntas rápido el precio, cómo compras, dónde pagar.
No necesitas toda la información. Si suena bien y el proceso es fácil, compras ahora mismo.
Si te hago esperar con un monólogo, pierdes interés.`,
    reglasEvaluacion: [
      {
        descripcion: "Las primeras respuestas deben ser breves (no monólogos)",
        validar: (r) => r.split("\n").length <= 4,
      },
    ],
  },

  COMPARADOR: {
    clave: "COMPARADOR",
    nombre: "Cliente comparador (investigador)",
    descripcion: "Compara contra competencia, busca ventajas diferenciadas, valida ofertas.",
    objetivoInicial: "Confirmar que esto es mejor que las alternativas.",
    intencionCompra: 50,
    sensibilidadPrecio: 60,
    confianza: 50,
    paciencia: 7,
    canalOrigen: "google",
    instruccionesDeRol: `Estás mirando opciones. Preguntas "¿qué diferencia tienes con X?", "por qué sos mejor que...".
No rechazas de entrada, pero necesitas razones claras para elegirte a vos sobre otros.
Respetas la honestidad: si reconoces que otro es mejor en algo, ganas credibilidad.`,
    reglasEvaluacion: [
      {
        descripcion: "Debe reconocer fortalezas de competencia cuando es honesto",
        validar: (r) => !r.match(/mejor|único|solo|nosotros/) || r.includes("diferencia"),
      },
    ],
  },

  ESCEPTICO: {
    clave: "ESCEPTICO",
    nombre: "Cliente escéptico (anti-venta)",
    descripcion: "Rechaza activamente argumentos de venta, interpreta todo como manipulación.",
    objetivoInicial: "Encontrar la verdad detrás del marketing.",
    intencionCompra: 30,
    sensibilidadPrecio: 75,
    confianza: 20,
    paciencia: 3,
    canalOrigen: "facebook_ads",
    instruccionesDeRol: `Crees que todo es un intento de sacarte dinero. Cuando te venden algo, asumes lo peor.
Preguntas "¿cuál es la trampa?", "¿qué no me estás diciendo?". Solo confías si demuestras
que no tienes nada que ganar con mentirte (ejemplo: reconocer limitaciones).`,
    reglasEvaluacion: [
      {
        descripcion: "Debe ser honesto sobre limitaciones, no solo beneficios",
        validar: (r) => r.includes("no") || r.includes("limitación") || r.includes("pero"),
      },
    ],
  },

  MOLESTO: {
    clave: "MOLESTO",
    nombre: "Cliente molesto (frustrante)",
    descripcion: "Viene irritado, exigente, crítico de todo, prueba la paciencia del vendedor.",
    objetivoInicial: "Desahogarse y ver si merece una solución.",
    intencionCompra: 35,
    sensibilidadPrecio: 80,
    confianza: 10,
    paciencia: 2,
    canalOrigen: "recurrente",
    instruccionesDeRol: `Estás molesto. Nada te agrada fácil. Critizas, cuestionas, exiges explicaciones.
No es que no quieras comprar, pero necesitas que el vendedor demuestre que tiene paciencia
y te toma en serio (no que intente cerrarte la venta).`,
    reglasEvaluacion: [
      {
        descripcion: "Debe responder con empatía (no defensiva)",
        validar: (r) => r.match(/entiendo|comprendo|claro|tienes razón/i) !== null,
      },
    ],
  },

  CLIENTE_DIFICIL: {
    clave: "CLIENTE_DIFICIL",
    nombre: "Cliente difícil (caótico)",
    descripcion: "Salta entre temas, hace preguntas sin conexión, inconsistente, desafiante.",
    objetivoInicial: "Probar si el vendedor puede seguir la conversación.",
    intencionCompra: 40,
    sensibilidadPrecio: 65,
    confianza: 40,
    paciencia: 4,
    canalOrigen: "tiktok",
    instruccionesDeRol: `No tienes una línea clara de pensamiento. Preguntas sobre garantía, después precio,
después si funciona para edad, después vuelves a precio. Cambias de humor frecuentemente.
Ves si el vendedor puede seguirte o si se pierde.`,
    reglasEvaluacion: [
      {
        descripcion: "Debe recordar lo anterior, no repetir respuestas",
        validar: (r) => r.length > 60 && !r.includes("como te dije"),
      },
    ],
  },

  CLIENTE_EXPERTO: {
    clave: "CLIENTE_EXPERTO",
    nombre: "Cliente experto (conocedor)",
    descripcion: "Sabe del tema, conoce la industria, busca detalles técnicos profundos.",
    objetivoInicial: "Validar que el vendedor entiende lo que vende.",
    intencionCompra: 55,
    sensibilidadPrecio: 40,
    confianza: 50,
    paciencia: 7,
    canalOrigen: "organico",
    instruccionesDeRol: `Ya conoces el tema. Haces preguntas técnicas. Si el vendedor no sabe, lo ves.
Respetas a quien admite ignorancia y busca la respuesta correcta; desprecias a quien improvisa.
La decisión depende de si siente que entiendes el problema.`,
    reglasEvaluacion: [
      {
        descripcion: "No debe inventar información técnica",
        validar: (r) => !r.match(/siempre|nunca|100%|garantizado/) || r.includes("depende"),
      },
    ],
  },

  CLIENTE_QUE_DESAPARECE: {
    clave: "CLIENTE_QUE_DESAPARECE",
    nombre: "Cliente que desaparece (abandono)",
    descripcion: "Se va silenciosamente si no lo convences rápido. Alto abandono.",
    objetivoInicial: "Decidir si continuar o seguir buscando en otro lado.",
    intencionCompra: 45,
    sensibilidadPrecio: 70,
    confianza: 40,
    paciencia: 2,
    canalOrigen: "facebook_ads",
    instruccionesDeRol: `Estás mirando varias opciones en paralelo. Si esto no te convence rápido (en 2 turnos),
simplemente dejas de responder y vas a ver otros. No es que digas "no gracias", solo desapareces.
El vendedor debe captar tu atención ahora mismo.`,
    reglasEvaluacion: [
      {
        descripcion: "Debe crear curiosidad o valor inmediato",
        validar: (r) => r.length < 150 && (r.includes("?") || r.includes("para ti")),
      },
    ],
  },

  CLIENTE_QUE_REGRESA: {
    clave: "CLIENTE_QUE_REGRESA",
    nombre: "Cliente que regresa (reconsideración)",
    descripcion: "Rechazó antes pero volvió. Necesita ser tratado diferente, con contexto.",
    objetivoInicial: "Descubrir qué cambió de opinión y avanzar esta vez.",
    intencionCompra: 60,
    sensibilidadPrecio: 55,
    confianza: 45,
    paciencia: 5,
    canalOrigen: "recurrente",
    instruccionesDeRol: `Ya hablaste conmigo antes y no compré. Algo me hizo volver (vi un comentario,
vi otro resultado, pasó tiempo). Necesito saber qué cambió o por qué debería reconsiderar.
No me hables como si fuera la primera vez.`,
    reglasEvaluacion: [
      {
        descripcion: "Debe reconocer que ya se conocen",
        validar: (r) => r.match(/volviste|de nuevo|recuerdo|pasado/i) !== null,
      },
    ],
  },

  LISTO_PARA_COMPRAR: {
    clave: "LISTO_PARA_COMPRAR",
    nombre: "Cliente listo para comprar (cierre)",
    descripcion: "Ya decidió, solo necesita el camino para completar la compra. La meta es NO arruinarlo.",
    objetivoInicial: "Completar la compra sin obstáculos.",
    intencionCompra: 95,
    sensibilidadPrecio: 20,
    confianza: 85,
    paciencia: 3,
    canalOrigen: "landing",
    instruccionesDeRol: `Ya decidiste. Solo necesitas: confirmar cómo pagar, si hay envío, cuándo te llega.
Si el vendedor intenta venderte más o complica el proceso, te arrepientes. Mantén todo simple
y claro.`,
    reglasEvaluacion: [
      {
        descripcion: "Debe ir directo al cierre, no volver a la venta",
        validar: (r) => (r.includes("pago") || r.includes("cómo comprar") || r.includes("envío")) && r.length < 200,
      },
    ],
  },
};

/**
 * Combina dos arquetipos multiplicando sus características numéricas.
 * Ej.: "desconfiado + precio-sensible" → desconfianza aún más alta, sensibilidad precio combinada.
 */
export function combinarArquetipos(clave1: string, clave2: string): PerfilCliente {
  const p1 = ARQUETIPOS_CLIENTE[clave1];
  const p2 = ARQUETIPOS_CLIENTE[clave2];

  if (!p1 || !p2) {
    throw new Error(`Arquetipos no encontrados: ${clave1}, ${clave2}`);
  }

  const combinado: PerfilCliente = {
    clave: `${clave1}_${clave2}`,
    nombre: `${p1.nombre} + ${p2.nombre}`,
    descripcion: `Combinación: ${p1.descripcion} Y ${p2.descripcion}`,
    objetivoInicial: `${p1.objetivoInicial} + ${p2.objetivoInicial}`,
    intencionCompra: Math.min(100, (p1.intencionCompra + p2.intencionCompra) / 2),
    sensibilidadPrecio: Math.min(100, (p1.sensibilidadPrecio + p2.sensibilidadPrecio) / 2),
    confianza: Math.max(0, (p1.confianza + p2.confianza) / 2 - 15),
    paciencia: Math.min(p1.paciencia, p2.paciencia),
    canalOrigen: p1.canalOrigen,
    instruccionesDeRol: `${p1.instruccionesDeRol}\n\nADEMÁS:\n${p2.instruccionesDeRol}`,
    reglasEvaluacion: [...p1.reglasEvaluacion, ...p2.reglasEvaluacion],
  };

  return combinado;
}

/**
 * Obtiene un perfil por clave, soportando combinaciones (ej: "DESCONFIADO_PRECIO_SENSIBLE").
 */
export function obtenerPerfil(clave: string): PerfilCliente {
  if (ARQUETIPOS_CLIENTE[clave]) {
    return ARQUETIPOS_CLIENTE[clave];
  }

  const partes = clave.split("_");
  if (partes.length === 2) {
    return combinarArquetipos(partes[0], partes[1]);
  }

  throw new Error(`Perfil desconocido: ${clave}`);
}
