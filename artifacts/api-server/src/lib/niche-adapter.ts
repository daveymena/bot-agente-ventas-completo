export type BusinessNiche = "digital" | "retail" | "services" | "education" | "health" | "general";

export interface NicheConfig {
  id: BusinessNiche;
  name: string;
  tone: string;
  keyDirectives: string[];
  vocab: {
    product: string;
    customer: string;
    purchase: string;
  };
}

const NICHE_CONFIGS: Record<BusinessNiche, NicheConfig> = {
  digital: {
    id: "digital",
    name: "Productos Digitales (Cursos, Software)",
    tone: "Moderno, rápido, orientado a resultados inmediatos.",
    keyDirectives: [
      "Enfatiza el acceso inmediato tras el pago.",
      "Destaca que no hay envíos físicos ni tiempos de espera.",
      "Menciona garantías de devolución para reducir el riesgo."
    ],
    vocab: { product: "acceso/curso", customer: "estudiante/usuario", purchase: "acceder/descargar" }
  },
  retail: {
    id: "retail",
    name: "Productos Físicos (Retail)",
    tone: "Confiable, descriptivo, enfocado en calidad.",
    keyDirectives: [
      "Menciona tiempos y métodos de envío claramente.",
      "Si hay stock limitado, úsalo para crear urgencia.",
      "Destaca materiales, tallas o especificaciones físicas."
    ],
    vocab: { product: "artículo/producto", customer: "cliente", purchase: "comprar/pedir" }
  },
  services: {
    id: "services",
    name: "Servicios Profesionales",
    tone: "Profesional, consultivo, generador de confianza.",
    keyDirectives: [
      "Enfócate en agendar una cita o reunión.",
      "Menciona experiencia y resultados previos.",
      "Personaliza la solución según el problema del cliente."
    ],
    vocab: { product: "servicio/asesoría", customer: "cliente", purchase: "agendar/contratar" }
  },
  education: {
    id: "education",
    name: "Educación Tradicional / Academias",
    tone: "Inspirador, estructurado, académico.",
    keyDirectives: [
      "Enfócate en la transformación y el aprendizaje a largo plazo.",
      "Menciona certificaciones, profesores y metodología.",
      "Atiende dudas sobre horarios y modalidades."
    ],
    vocab: { product: "programa/carrera", customer: "estudiante", purchase: "inscribirse/matricularse" }
  },
  health: {
    id: "health",
    name: "Salud y Bienestar",
    tone: "Empático, cuidadoso, profesional.",
    keyDirectives: [
      "Prioriza la privacidad y el bienestar del paciente.",
      "Evita hacer diagnósticos directos por chat.",
      "Guía hacia una consulta profesional."
    ],
    vocab: { product: "tratamiento/consulta", customer: "paciente", purchase: "agendar cita" }
  },
  general: {
    id: "general",
    name: "General",
    tone: "Cálido, profesional y directo.",
    keyDirectives: [
      "Responde a las preguntas de manera clara.",
      "Fomenta la confianza en la marca."
    ],
    vocab: { product: "producto", customer: "cliente", purchase: "comprar" }
  }
};

export function getNicheConfig(nicheStr: string | null | undefined): NicheConfig {
  const normalized = (nicheStr || "general").toLowerCase() as BusinessNiche;
  return NICHE_CONFIGS[normalized] || NICHE_CONFIGS["general"];
}

export function buildNichePromptContext(nicheConfig: NicheConfig): string {
  return `
━━━━━━━━━━━━━━━━━━━━━━━
🏢 ADAPTACIÓN AL NICHO DE NEGOCIO: ${nicheConfig.name.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━
• Tono requerido: ${nicheConfig.tone}
• Directivas clave:
${nicheConfig.keyDirectives.map(d => `  - ${d}`).join("\n")}
• Vocabulario preferido: Usa términos como "${nicheConfig.vocab.product}", "${nicheConfig.vocab.customer}", "${nicheConfig.vocab.purchase}".
`;
}
