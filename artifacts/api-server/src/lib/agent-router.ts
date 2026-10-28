import { db, agents, conversations, messages } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { PAYMENT_KEYWORDS, URGENCY_KEYWORDS } from "./agent";

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

  // ── Enrutado por el TIPO del producto que el cliente está pidiendo ────────
  //
  // Manda sobre cualquier otra señal, y por una razón concreta: el resto del
  // scoring adivina por palabras del rol del agente ("producto", "envío") y
  // por si el agente ya habló en la conversación. Nada de eso mira lo que el
  // cliente realmente quiere comprar. Si pregunta por una rodillera, tiene que
  // atenderlo el agente de dropshipping aunque el de digitales venga hablando
  // desde hace diez mensajes: es el único que sabe pedir la dirección y crear
  // el pedido.
  const conEspecialidad = activeAgents.filter((a: any) => {
    const e = String(a.especialidad || "").toLowerCase();
    return e === "digital" || e === "dropshipping";
  });
  if (conEspecialidad.length > 0) {
    try {
      const { db: base, products } = await import("@workspace/db");
      const { findBestProductMatch, mensajeNombraProducto } = await import("./conversation-engine");
      const catalogo = await base.select().from(products)
        .where(and(eq(products.isActive, true), eq(products.tenantId, tenantId))).limit(200);
      // Solo si el mensaje NOMBRA un producto. "Para mi" (lead de Instagram
      // del piano, 12-09-2026 21:19) casó con "RUEDAS PARA MUEBLES", pasó la
      // conversación a AtlasDrops y el cliente recibió "no tengo ese
      // producto… lo que sí manejo es: Corrector de Postura, RUEDAS…".
      // Un cambio de agente exige un motivo duro, no una palabra suelta.
      const match = mensajeNombraProducto(messageText) ? await findBestProductMatch(messageText, catalogo as any, new Map()) : null;
      // ── Sin producto nombrado y sin agente todavía: manda el catálogo ──
      //
      // "¡Hola! Quiero más información" lo atendía AtlasDrops (6 productos
      // físicos) en un negocio con 84 cursos digitales: le preguntaba "¿hogar,
      // tecnología o cuidado personal?" a gente que venía por un curso, y a
      // "entrenamiento para cachorro" le decía que no manejaba adiestramiento
      // (EDUCANINO existe). Medido con el evaluador sobre 10 chats de agosto.
      // El agente por defecto es el de la especialidad con MÁS productos:
      // es lo más probable que el cliente busque, y no exige configurar nada.
      if (!match?.product) {
        const [convoActual] = await base.select({ agentId: conversations.agentId }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId))).limit(1);
        if (!convoActual?.agentId) {
          const fisicos = catalogo.filter((p: any) => String(p.kind || "digital") === "physical").length;
          const digitales = catalogo.length - fisicos;
          const tipo = digitales >= fisicos ? "digital" : "dropshipping";
          const porDefecto = conEspecialidad.find((a: any) => String(a.especialidad).toLowerCase() === tipo);
          if (porDefecto) {
            logger.info({ tenantId, agente: porDefecto.name, digitales, fisicos }, "[AgentRouter] Sin producto nombrado: atiende la especialidad con más productos");
            return [{ agentId: porDefecto.id, agentName: porDefecto.name, score: 90, reason: `Sin producto nombrado: la especialidad con más productos (${tipo}: ${Math.max(digitales, fisicos)})` }];
          }
        }
      }
      if (match?.product && match.score >= 50) {
        const tipo = String((match.product as any).kind || "digital") === "physical" ? "dropshipping" : "digital";
        const elegido = conEspecialidad.find((a: any) => String(a.especialidad).toLowerCase() === tipo);
        if (elegido) {
          logger.info(
            { tenantId, agente: elegido.name, producto: (match.product as any).name, tipo },
            "[AgentRouter] Enrutado por el tipo de producto que pidió el cliente",
          );
          return [{
            agentId: elegido.id,
            agentName: elegido.name,
            score: 100,
            reason: `El cliente preguntó por un producto ${tipo === "dropshipping" ? "físico" : "digital"}`,
          }];
        }
      }
    } catch (e: any) {
      // Si el catálogo falla, se sigue con el scoring de siempre: preferible
      // un agente elegido por palabras clave que ninguna respuesta.
      logger.warn({ tenantId, err: e?.message }, "[AgentRouter] No se pudo enrutar por tipo de producto");
    }
  }

  // ── ¿Esta conversación ya tiene agente? ───────────────────────────────────
  //
  // `conversations.agentId` existe en el esquema desde siempre y NADIE lo leía
  // ni lo escribía. Sin él, quién atiende se recalculaba en CADA mensaje a
  // partir de palabras clave, así que dos agentes activos se turnaban dentro
  // de la misma conversación: el cliente hablaba con Camila, mandaba otro
  // mensaje y le contestaba Sofía, con otro nombre, otra personalidad y sin
  // saber lo que la otra había prometido.
  //
  // Va DESPUÉS del enrutado por tipo de producto y ANTES del scoring por
  // palabras, y ese orden es la regla entera: cambiar de agente se permite
  // por un motivo duro (el cliente pasó de un digital a un físico, y solo uno
  // de los dos sabe pedir la dirección), nunca porque el mensaje de turno
  // tenga la palabra "envío".
  //
  // El bonus de continuidad de más abajo intentaba esto mismo buscando el
  // NOMBRE del agente dentro del texto de los mensajes. El agente no firma
  // sus mensajes, así que casi nunca daba positivo.
  const [convo] = await db
    .select({ agentId: conversations.agentId })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId)))
    .limit(1);

  if (convo?.agentId) {
    const dueño = activeAgents.find((a: any) => a.id === convo.agentId);
    if (dueño) {
      // ── REGLA DE TRASPASO: Sofía -> Especialista ──────────────────────
      //
      // Si el agente actual es "general" (Recepcionista), permitimos que el
      // router busque un especialista si el cliente nombra un producto o servicio concreto.
      // Sin esto, Sofía se quedaría con la conversación aunque el cliente pida un curso.
      const agentType = getAgentType(dueño.role, dueño.name);
      if (agentType === "general") {
        try {
          const { findBestProductMatch, mensajeNombraProducto } = await import("./conversation-engine");
          const { db: base, products } = await import("@workspace/db");
          const catalogo = await base.select().from(products)
            .where(and(eq(products.isActive, true), eq(products.tenantId, tenantId))).limit(200);

          const match = mensajeNombraProducto(messageText) ? await findBestProductMatch(messageText, catalogo as any, new Map()) : null;

          // Si hay un match fuerte, ignoramos la continuidad y dejamos que el scoring busque al especialista
          if (match?.product && match.score >= 50) {
            logger.info({ tenantId, conversationId, agente: dueño.name, producto: (match.product as any).name }, "[AgentRouter] Traspaso: Cliente nombra producto mientras habla con general");
          } else {
            logger.info({ tenantId, conversationId, agente: dueño.name }, "[AgentRouter] Sigue el agente que ya venía atendiendo esta conversación");
            return [{ agentId: dueño.id, agentName: dueño.name, score: 100, reason: "Ya venía atendiendo esta conversación" }];
          }
        } catch (e: any) {
          logger.warn({ tenantId, err: e?.message }, "[AgentRouter] Error en lógica de traspaso desde general");
        }
      } else {
        logger.info({ tenantId, conversationId, agente: dueño.name }, "[AgentRouter] Sigue el agente que ya venía atendiendo esta conversación");
        return [{ agentId: dueño.id, agentName: dueño.name, score: 100, reason: "Ya venía atendiendo esta conversación" }];
      }
    }
    // El agente asignado se desactivó o se borró: se vuelve a elegir, y el
    // nuevo queda asignado al final de `getActiveAgent`.
    logger.warn({ tenantId, conversationId, agentId: convo.agentId }, "[AgentRouter] El agente asignado ya no está activo — se reasigna");
  }

  // Obtener historial de la conversación para contexto
  const history = await db
    .select({ id: messages.id, role: messages.role, content: messages.content, createdAt: messages.createdAt })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(and(eq(messages.conversationId, conversationId), eq(conversations.tenantId, tenantId)))
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
    const agentParticipated = history.some((msg: { role: string; content: string }) =>
      msg.role === "agent" && msg.content.includes(agent.name)
    );
    if (agentParticipated) {
      score += 20;
      reasons.push("Continuidad de conversación");
    }

    // 3. Bonus para el agente GENERAL si no hay match claro.
    //
    // Acá decía `agent.name === "Sofía"`. Sofía es el agente de UN negocio:
    // en cualquier otro tenant ese bonus no se aplicaba nunca, así que el
    // desempate que existe para el caso ambiguo --el más común, un cliente
    // que escribe "hola"-- simplemente no funcionaba fuera de esa cuenta.
    // El tipo del agente sale de su rol, que es el dato del negocio.
    if (agentType === "general" && score < 10) {
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
export function getAgentType(role: string, name: string): string {
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
 * Deja asentado qué agente atiende esta conversación.
 *
 * Sin esto, quién responde se recalcula en cada mensaje y el cliente ve
 * cambiar de nombre y de tono a mitad de charla. Se escribe solo si cambió,
 * para no tocar la fila en cada mensaje.
 *
 * Un fallo acá no puede tumbar la respuesta: el cliente está esperando. Se
 * registra y se sigue -- el peor caso es que el próximo mensaje lo vuelva a
 * elegir, que es exactamente como funcionaba antes.
 */
async function recordarQuienAtiende(conversationId: number, tenantId: number, agentId: number): Promise<void> {
  try {
    const [actual] = await db
      .select({ agentId: conversations.agentId })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId)))
      .limit(1);
    if (actual?.agentId === agentId) return;
    await db.update(conversations).set({ agentId }).where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId)));
    logger.info({ conversationId, agentId }, "[AgentRouter] Conversación asignada");
  } catch (e: any) {
    logger.warn({ conversationId, agentId, err: e?.message }, "[AgentRouter] No se pudo asentar el agente de la conversación");
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
  // Un agente sin nombre no puede atender a nadie: se presenta como nadie y
  // no tiene flujo. Se encontró uno OPERANDO en producción (auditoría del
  // 16-08-2026), creado con el registro corrupto. La validación al activar
  // evita que vuelva a pasar, pero el que ya está activo en la base tiene que
  // quedar fuera acá, que es donde de verdad se elige quién responde.
  const sirve = (a: any) => !!a && String(a.name || "").trim().length > 0;

  // Intentar seleccionar el mejor agente
  const selected = await selectBestAgent(messageText, conversationId, tenantId);

  if (selected) {
    // El filtro por tenant NO es opcional acá: buscar solo por id significaba
    // que un id de otro negocio -- por un bug de selección o un id viejo --
    // traía el agente de ESE otro negocio, con su prompt y su personalidad,
    // para contestarle a un cliente que no es suyo.
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, selected.agentId), eq(agents.tenantId, tenantId)))
      .limit(1);

    if (sirve(agent)) {
      await recordarQuienAtiende(conversationId, tenantId, agent.id);
      return agent;
    }
    logger.warn({ tenantId, agentId: selected.agentId }, "[AgentRouter] El agente elegido no sirve (sin nombre o de otro negocio) — se busca otro");
  }

  // Fallback: cualquier agente activo del negocio que tenga nombre.
  const activos = await db
    .select()
    .from(agents)
    .where(and(
      eq(agents.tenantId, tenantId),
      eq(agents.isActive, true)
    ));

  const usable = activos.find(sirve);
  if (usable) await recordarQuienAtiende(conversationId, tenantId, usable.id);
  if (!usable && activos.length) {
    logger.error({ tenantId, cuantos: activos.length }, "[AgentRouter] Hay agentes activos pero NINGUNO tiene nombre");
  }
  return usable;
}
