import { db, agents, conversations, messages } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Agent Router - Selecciona el agente más apropiado según el contexto
 */

interface AgentScore {
  agentId: number;
  agentName: string;
  score: number;
  reason: string;
}

// Palabras clave por tipo de agente
const AGENT_KEYWORDS: Record<string, string[]> = {
  dropshipping: [
    "producto", "envío", "entrega", "físico", "gadget", "accesorio",
    "comprar", "precio", "stock", "disponible", "cuánto cuesta",
    "dónde envían", "tiempo de entrega", "garantía"
  ],
  digital_products: [
    "curso", "megapack", "digital", "descarga", "drive", "pdf",
    "aprender", "tutorial", "lección", "video", "contenido",
    "acceso", "descargar", "online"
  ],
  services: [
    "servicio", "diseño", "desarrollo", "web", "página", "logo",
    "branding", "marketing", "redes sociales", "gestión",
    "crear", "hacer", "necesito ayuda con"
  ],
  telecom: [
    "internet", "wifi", "fibra", "megas", "plan", "telefonía",
    "tv", "cable", "cobertura", "instalación", "velocidad",
    "mb", "gb", "datos", "minutos"
  ],
  marketing: [
    "publicidad", "ads", "facebook", "instagram", "tiktok",
    "campaña", "anuncio", "seguidores", "engagement", "alcance",
    "posicionamiento", "seo", "google", "meta ads"
  ],
  courses: [
    "aprender", "estudiar", "formación", "capacitación", "clase",
    "academia", "enseñar", "profesor", "certificado", "diploma",
    "habilidad", "skill", "práctica"
  ],
  b2b: [
    "empresa", "negocio", "corporativo", "equipo", "empleados",
    "licencia", "factura", "contrato", "b2b", "empresarial",
    "pyme", "startup", "compañía"
  ],
  subscriptions: [
    "suscripción", "membresía", "mensual", "plan", "renovar",
    "cancelar", "premium", "vip", "acceso ilimitado",
    "recurrente", "cuota"
  ],
  followup: [
    "pensándolo", "después", "luego", "no estoy seguro",
    "déjame ver", "tal vez", "no sé", "dudas"
  ],
  general: [
    "hola", "buenos días", "buenas tardes", "buenas noches",
    "ayuda", "información", "qué venden", "catálogo",
    "opciones", "disponible"
  ]
};

/**
 * Analiza el mensaje y retorna scores para cada agente activo
 */
async function scoreAgents(
  messageText: string,
  conversationId: number,
  tenantId: number
): Promise<AgentScore[]> {
  // Obtener todos los agentes activos
  const activeAgents = await db
    .select()
    .from(agents)
    .where(and(
      eq(agents.tenantId, tenantId),
      eq(agents.isActive, true)
    ));

  if (activeAgents.length === 0) {
    logger.warn({ tenantId }, "[AgentRouter] No hay agentes activos");
    return [];
  }

  // Si solo hay un agente activo, usarlo directamente
  if (activeAgents.length === 1) {
    return [{
      agentId: activeAgents[0].id,
      agentName: activeAgents[0].name,
      score: 100,
      reason: "Único agente activo"
    }];
  }

  const messageLower = messageText.toLowerCase();
  const scores: AgentScore[] = [];

  // Obtener historial de la conversación para contexto
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt)
    .limit(10);

  for (const agent of activeAgents) {
    let score = 0;
    const reasons: string[] = [];

    // 1. Matching por palabras clave del tipo de agente
    const agentType = getAgentType(agent.role, agent.name);
    const keywords = AGENT_KEYWORDS[agentType] || AGENT_KEYWORDS.general;
    
    const matchedKeywords = keywords.filter(kw => messageLower.includes(kw));
    if (matchedKeywords.length > 0) {
      score += matchedKeywords.length * 10;
      reasons.push(`${matchedKeywords.length} keywords matched`);
    }

    // 2. Bonus si el agente ya participó en esta conversación
    const agentParticipated = history.some(msg => 
      msg.role === "agent" && msg.content.includes(agent.name)
    );
    if (agentParticipated) {
      score += 20;
      reasons.push("Continuidad de conversación");
    }

    // 3. Bonus para agente general (Sofía) si no hay match claro
    if (agent.name === "Sofía" && score < 10) {
      score += 15;
      reasons.push("Agente general por defecto");
    }

    // 4. Penalización si el mensaje es muy corto y no hay contexto
    if (messageText.length < 10 && history.length === 0) {
      score += 5; // Todos los agentes tienen chance
      reasons.push("Mensaje inicial corto");
    }

    scores.push({
      agentId: agent.id,
      agentName: agent.name,
      score,
      reason: reasons.join(", ") || "Sin match específico"
    });
  }

  // Ordenar por score descendente
  scores.sort((a, b) => b.score - a.score);

  return scores;
}

/**
 * Determina el tipo de agente basado en su rol y nombre
 */
function getAgentType(role: string, name: string): string {
  const roleLower = role.toLowerCase();
  const nameLower = name.toLowerCase();

  if (roleLower.includes("dropshipping") || roleLower.includes("físico")) return "dropshipping";
  if (roleLower.includes("digital") || roleLower.includes("megapack")) return "digital_products";
  if (roleLower.includes("servicio") || roleLower.includes("consultor")) return "services";
  if (roleLower.includes("telecom") || roleLower.includes("internet")) return "telecom";
  if (roleLower.includes("marketing") || roleLower.includes("estratega")) return "marketing";
  if (roleLower.includes("curso") || roleLower.includes("formación")) return "courses";
  if (roleLower.includes("b2b") || roleLower.includes("empresarial")) return "b2b";
  if (roleLower.includes("suscripción") || roleLower.includes("membresía")) return "subscriptions";
  if (roleLower.includes("seguimiento") || roleLower.includes("recuperación")) return "followup";
  
  return "general";
}

/**
 * Selecciona el mejor agente para responder
 */
export async function selectBestAgent(
  messageText: string,
  conversationId: number,
  tenantId: number
): Promise<{ agentId: number; agentName: string; confidence: number } | null> {
  try {
    const scores = await scoreAgents(messageText, conversationId, tenantId);
    
    if (scores.length === 0) {
      logger.warn({ tenantId }, "[AgentRouter] No se encontraron agentes");
      return null;
    }

    const best = scores[0];
    const confidence = Math.min(100, (best.score / 50) * 100); // Normalizar a 0-100%

    logger.info({
      conversationId,
      selectedAgent: best.agentName,
      confidence: confidence.toFixed(1),
      reason: best.reason,
      allScores: scores.map(s => ({ name: s.agentName, score: s.score }))
    }, "[AgentRouter] Agente seleccionado");

    return {
      agentId: best.agentId,
      agentName: best.agentName,
      confidence
    };
  } catch (error) {
    logger.error({ error, conversationId }, "[AgentRouter] Error seleccionando agente");
    return null;
  }
}

/**
 * Obtiene el agente activo (para compatibilidad con código existente)
 * Si hay múltiples activos, usa el router
 */
export async function getActiveAgent(
  messageText: string,
  conversationId: number,
  tenantId: number
) {
  // Intentar seleccionar el mejor agente
  const selected = await selectBestAgent(messageText, conversationId, tenantId);
  
  if (selected) {
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, selected.agentId))
      .limit(1);
    
    return agent;
  }

  // Fallback: obtener cualquier agente activo
  const [fallback] = await db
    .select()
    .from(agents)
    .where(and(
      eq(agents.tenantId, tenantId),
      eq(agents.isActive, true)
    ))
    .limit(1);

  return fallback;
}
