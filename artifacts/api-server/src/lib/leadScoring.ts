import { eq, desc } from "drizzle-orm";
import { db, conversations, messages, leads, settings as settingsTable } from "@workspace/db";
import { logger } from "./logger";
import { scheduleIntelligentFollowUp, getFollowUpMetrics, getDueFollowUps } from "./followUpScheduler";

// ─── AI client factory (injectable for testing) ──────────────────────────────

type AIClientFactory = (settings: any) => Promise<AILeadAnalysis | null>;

let _aiAnalyzer: AIClientFactory | null = null;

/** Override the AI analyzer in tests */
export function setAIAnalyzer(fn: AIClientFactory) {
  _aiAnalyzer = fn;
}

async function callAI(history: Array<{ role: string; content: string }>, settings: any): Promise<AILeadAnalysis | null> {
  if (_aiAnalyzer) {
    try {
      return await _aiAnalyzer(settings);
    } catch {
      return null; // triggers keywordFallback in caller
    }
  }

  // Lazy-load the AI integration to avoid import issues in test environments
  try {
    const { getProviderConfig, getProviderConfigFromSettings, createAIClient } =
      await import("@workspace/integrations-openai-ai-server");
    return await analyzeLeadWithAI(history, settings, { getProviderConfig, getProviderConfigFromSettings, createAIClient });
  } catch {
    return null;
  }
}

// Lead Scoring Types
export interface LeadScore {
  totalScore: number;
  interestLevel: number;
  priceInquiries: number;
  urgencyIndicators: number;
  decisionCapacity: number;
  stage: LeadStage;
  lastUpdated: Date;
  nextFollowUp?: Date;
  reasoning?: string; // AI explanation of the classification
}

export type LeadStage =
  | "cold"
  | "warm"
  | "hot"
  | "qualified"
  | "negotiating"
  | "closing"
  | "converted"
  | "lost";

/**
 * Traducción del vocabulario de PUNTAJE al del EMBUDO del CRM.
 *
 * Son dos vocabularios distintos que compartían la misma columna: este módulo
 * clasifica temperatura del lead (cold/warm/hot...) y el CRM tiene etapas de
 * embudo (new/contacted/qualified/proposal/won/lost). Escribir uno donde se
 * espera el otro es lo que dejaba la pantalla de Prospectos en blanco.
 *
 * "converted" NO se traduce a "won" a propósito: que la IA crea que el cliente
 * se convirtió no es un pago. Ganar un trato exige confirmación de la pasarela
 * o del admin (ver los webhooks de pago y confirm_transfer_payment).
 */
const ETAPA_CRM_DESDE_PUNTAJE: Record<string, string> = {
  cold: "new",
  warm: "contacted",
  hot: "qualified",
  qualified: "qualified",
  negotiating: "proposal",
  closing: "proposal",
  converted: "proposal",
  lost: "lost",
};

// The structured response we ask the AI to return
interface AILeadAnalysis {
  stage: LeadStage;
  totalScore: number;       // 0-100
  interestLevel: number;    // 0-100
  priceInquiries: number;   // 0-100
  urgencyIndicators: number;// 0-100
  decisionCapacity: number; // 0-100
  reasoning: string;        // brief explanation
}

// ─── AI-powered analysis ────────────────────────────────────────────────────

/**
 * Calls the AI to classify a lead based on the full conversation history.
 * Falls back to a simple heuristic if the AI call fails.
 */
async function analyzeLeadWithAI(
  conversationHistory: Array<{ role: string; content: string }>,
  settings?: any,
  aiDeps?: { getProviderConfig: any; getProviderConfigFromSettings: any; createAIClient: any }
): Promise<AILeadAnalysis> {
  const systemPrompt = `Eres un experto en ventas y CRM. Analiza la conversación de WhatsApp entre un cliente y un agente de ventas.

Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta (sin markdown, sin texto extra):
{
  "stage": "<cold|warm|hot|qualified|negotiating|closing|converted|lost>",
  "totalScore": <0-100>,
  "interestLevel": <0-100>,
  "priceInquiries": <0-100>,
  "urgencyIndicators": <0-100>,
  "decisionCapacity": <0-100>,
  "reasoning": "<explicación breve en español de máximo 2 oraciones>"
}

Definición de etapas:
- cold: Sin interés real, solo curiosidad pasiva o sin respuesta
- warm: Interés inicial, hace preguntas generales
- hot: Interés claro, pregunta por detalles específicos o precios
- qualified: Tiene intención de compra, evalúa opciones
- negotiating: Discute precio, condiciones o comparaciones
- closing: Listo para comprar, pide instrucciones de pago
- converted: Confirmó el pago o envió comprobante
- lost: Rechazó explícitamente o dejó de responder tras interés previo

Criterios de puntuación (0-100):
- interestLevel: qué tan interesado está el cliente en los productos
- priceInquiries: cuánto pregunta por precios, costos o formas de pago
- urgencyIndicators: señales de que quiere comprar pronto
- decisionCapacity: señales de que tiene poder de decisión y puede comprar
- totalScore: promedio ponderado de los anteriores`;

  const userPrompt = `Analiza esta conversación y clasifica al lead:\n\n${
    conversationHistory
      .map(m => `${m.role === "customer" ? "Cliente" : "Agente"}: ${m.content}`)
      .join("\n")
  }`;

  // Build provider rotation queue (same pattern as agent.ts)
  const rotationQueue: Array<{ config: any; source: string }> = [];

  const deps = aiDeps;
  if (!deps) return keywordFallback(conversationHistory);

  if (settings) {
    const dbConfig = deps.getProviderConfigFromSettings(settings);
    if (dbConfig) rotationQueue.push({ config: dbConfig, source: "database" });
  }
  const envConfig = deps.getProviderConfig("github");
  if (envConfig) rotationQueue.push({ config: envConfig, source: "environment" });

  for (const { config, source } of rotationQueue) {
    try {
      const client = deps.createAIClient(config);
      // Ver agent.ts: createAIClient trae 60s + 1 reintento fijos por
      // defecto y los ignora un caller que no los overridea explícitamente.
      const completion = await client.chat.completions.create(
        {
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.1, // Low temperature for consistent structured output
          max_tokens: 300,
        },
        { timeout: 10000, maxRetries: 0 },
      );

      const raw = completion.choices[0]?.message?.content?.trim() ?? "";
      if (!raw) continue;

      // Strip possible markdown code fences
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed: AILeadAnalysis = JSON.parse(jsonStr);

      // Validate required fields
      if (!parsed.stage || typeof parsed.totalScore !== "number") {
        throw new Error("Invalid AI response structure");
      }

      logger.info({
        source,
        stage: parsed.stage,
        totalScore: parsed.totalScore,
        reasoning: parsed.reasoning
      }, "[LeadScoring] AI analysis completed");

      return parsed;

    } catch (err) {
      logger.warn({ err, source }, "[LeadScoring] AI provider failed, trying next");
    }
  }

  // ── Fallback: simple heuristic when AI is unavailable ──────────────────
  logger.warn("[LeadScoring] All AI providers failed, using keyword fallback");
  return keywordFallback(conversationHistory);
}

/**
 * Minimal keyword-based fallback used ONLY when the AI is unreachable.
 */
function keywordFallback(
  history: Array<{ role: string; content: string }>
): AILeadAnalysis {
  const customerText = history
    .filter(m => m.role === "customer")
    .map(m => m.content.toLowerCase())
    .join(" ");

  const conversionWords = ["pagué", "transferí", "comprobante", "realicé el pago", "ya pagué"];
  const closingWords = ["quiero pagar", "cómo pago", "envíame el link", "cuánto es", "precio"];
  const hotWords = ["necesito", "urgente", "cuánto cuesta", "me interesa mucho", "quiero comprar"];
  const warmWords = ["interesa", "información", "detalles", "cuéntame"];

  let stage: LeadStage = "cold";
  let totalScore = 5;

  if (conversionWords.some(w => customerText.includes(w))) {
    stage = "converted"; totalScore = 95;
  } else if (closingWords.some(w => customerText.includes(w))) {
    stage = "closing"; totalScore = 80;
  } else if (hotWords.some(w => customerText.includes(w))) {
    stage = "hot"; totalScore = 55;
  } else if (warmWords.some(w => customerText.includes(w))) {
    stage = "warm"; totalScore = 30;
  }

  return {
    stage,
    totalScore,
    interestLevel: totalScore,
    priceInquiries: closingWords.some(w => customerText.includes(w)) ? 60 : 10,
    urgencyIndicators: customerText.includes("urgente") ? 70 : 10,
    decisionCapacity: stage === "converted" ? 95 : totalScore,
    reasoning: "Clasificación por palabras clave (IA no disponible)"
  };
}

// ─── Lead Scoring Engine ─────────────────────────────────────────────────────

export class LeadScoringEngine {

  /**
   * Analyzes a conversation using AI and returns a LeadScore.
   */
  async calculateLeadScore(conversationId: number): Promise<LeadScore> {
    try {
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      // Fetch last 20 messages for context
      const recentMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(desc(messages.createdAt))
        .limit(20);

      recentMessages.reverse(); // oldest first for the AI

      if (recentMessages.length === 0) {
        return this.defaultScore();
      }

      // Load settings for provider config
      const [appSettings] = await db.select().from(settingsTable).limit(1);

      // Build conversation history for AI
      const history = recentMessages.map(m => ({
        role: m.role === "customer" ? "customer" : "agent",
        content: m.content
      }));

      // Call AI for analysis
      const analysis = await callAI(history, appSettings) ?? keywordFallback(history);

      const nextFollowUp = this.calculateNextFollowUp(analysis.stage, conversation.createdAt);

      const leadScore: LeadScore = {
        totalScore: analysis.totalScore,
        interestLevel: analysis.interestLevel,
        priceInquiries: analysis.priceInquiries,
        urgencyIndicators: analysis.urgencyIndicators,
        decisionCapacity: analysis.decisionCapacity,
        stage: analysis.stage,
        reasoning: analysis.reasoning,
        lastUpdated: new Date(),
        nextFollowUp
      };

      logger.info({
        conversationId,
        stage: leadScore.stage,
        totalScore: leadScore.totalScore,
        reasoning: leadScore.reasoning,
        messageCount: recentMessages.length
      }, "[LeadScoring] Score calculated via AI");

      return leadScore;

    } catch (error) {
      logger.error({ error, conversationId }, "[LeadScoring] Failed to calculate lead score");
      return this.defaultScore();
    }
  }

  /**
   * Persists the lead score to the database.
   */
  async updateLeadScore(conversationId: number, leadScore: LeadScore): Promise<void> {
    try {
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);

      if (!conversation) {
        logger.warn({ conversationId }, "[LeadScoring] Conversation not found for score update");
        return;
      }

      await db
        .update(conversations)
        .set({ currentStage: leadScore.stage })
        .where(eq(conversations.id, conversationId));

      if (conversation.leadId) {
        // El puntaje NO se escribe en `value`.
        //
        // `value` es el MONTO del trato -- de ahí sale "ingresos del mes" del
        // panel. Guardar ahí el puntaje del lead (un número de 0 a 100)
        // mezclaba dos cosas que no tienen nada que ver: un lead con puntaje
        // 85 figuraba como una venta de $85.
        //
        // Y la etapa se traduce al vocabulario del CRM. Este módulo usa el
        // suyo (cold/warm/hot/negotiating...) y lo escribía tal cual en la
        // MISMA columna que el CRM lee como new/contacted/qualified/... Con
        // eso, GET /api/leads devolvía 400 y la pantalla de Prospectos
        // quedaba en blanco: la validación rechazaba la lista ENTERA por unas
        // pocas filas con "cold"/"warm".
        const etapaCrm = ETAPA_CRM_DESDE_PUNTAJE[leadScore.stage];
        if (etapaCrm) {
          await db
            .update(leads)
            .set({ stage: etapaCrm })
            .where(eq(leads.id, conversation.leadId));
        }
      }

      logger.info({
        conversationId,
        leadId: conversation.leadId,
        newStage: leadScore.stage,
        totalScore: leadScore.totalScore
      }, "[LeadScoring] Lead score persisted");

    } catch (error) {
      logger.error({ error, conversationId }, "[LeadScoring] Failed to persist lead score");
    }
  }

  /**
   * Main entry point: score a message and persist the result.
   */
  async processMessageForScoring(conversationId: number, messageContent: string): Promise<LeadScore> {
    try {
      const leadScore = await this.calculateLeadScore(conversationId);
      await this.updateLeadScore(conversationId, leadScore);

      if (leadScore.nextFollowUp) {
        await this.scheduleFollowUp(conversationId, leadScore);
      }

      return leadScore;
    } catch (error) {
      logger.error({ error, conversationId }, "[LeadScoring] processMessageForScoring failed");
      // Don't throw — scoring is non-critical, the conversation must continue
      return this.defaultScore();
    }
  }

  /**
   * Dashboard data: scores all conversations DEL TENANT dado.
   * Antes no filtraba -- cualquier tenant autenticado veía nombre, teléfono,
   * último mensaje y score de los leads de TODOS los negocios de la plataforma.
   */
  async getLeadScoringDashboard(tenantId: number) {
    try {
      const allConversations = await db
        .select({
          id: conversations.id,
          contactName: conversations.contactName,
          contactPhone: conversations.contactPhone,
          currentStage: conversations.currentStage,
          lastMessage: conversations.lastMessage,
          lastMessageAt: conversations.lastMessageAt,
          leadId: conversations.leadId
        })
        .from(conversations)
        .where(eq(conversations.tenantId, tenantId));

      const leadsWithScores = await Promise.all(
        allConversations.map(async (conv) => {
          const score = await this.calculateLeadScore(conv.id);
          return {
            conversationId: conv.id,
            contactName: conv.contactName,
            contactPhone: conv.contactPhone,
            score: score.totalScore,
            stage: score.stage,
            reasoning: score.reasoning,
            lastMessage: conv.lastMessage,
            lastMessageAt: conv.lastMessageAt
          };
        })
      );

      const scoreDistribution: Record<LeadStage, number> = {
        cold: 0, warm: 0, hot: 0, qualified: 0,
        negotiating: 0, closing: 0, converted: 0, lost: 0
      };
      leadsWithScores.forEach(l => { scoreDistribution[l.stage]++; });

      const highValueLeads = leadsWithScores
        .filter(l => l.score > 70)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      const followUpsDue = (await getDueFollowUps(tenantId)).map(f => ({
        leadId: f.leadId || 0,
        conversationId: f.conversationId,
        scheduledFor: f.scheduledFor,
        followUpType: f.followUpType,
        message: f.message,
        priority: f.priority
      }));

      return {
        totalLeads: allConversations.length,
        scoreDistribution,
        highValueLeads,
        followUpsDue,
        followUpMetrics: getFollowUpMetrics()
      };
    } catch (error) {
      logger.error({ error }, "[LeadScoring] Failed to get dashboard data");
      throw error;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private defaultScore(): LeadScore {
    return {
      totalScore: 0,
      interestLevel: 0,
      priceInquiries: 0,
      urgencyIndicators: 0,
      decisionCapacity: 0,
      stage: "cold",
      lastUpdated: new Date(),
      reasoning: "Sin datos suficientes para clasificar"
    };
  }

  private calculateNextFollowUp(stage: LeadStage, createdAt: Date): Date | undefined {
    const daysMap: Record<LeadStage, number> = {
      cold: 7,
      warm: 3,
      hot: 1,
      qualified: 1,
      negotiating: 0.5,
      closing: 0.25,
      converted: -1,
      lost: -1
    };

    const days = daysMap[stage];
    if (days <= 0) return undefined;

    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  private async scheduleFollowUp(conversationId: number, leadScore: LeadScore): Promise<void> {
    try {
      const followUp = await scheduleIntelligentFollowUp(
        conversationId,
        leadScore.stage,
        leadScore.totalScore
      );
      if (followUp) {
        logger.info({
          conversationId,
          followUpId: followUp.id,
          stage: leadScore.stage,
          scheduledFor: followUp.scheduledFor
        }, "[LeadScoring] Follow-up scheduled");
      }
    } catch (error) {
      logger.error({ error, conversationId }, "[LeadScoring] Failed to schedule follow-up");
    }
  }

  /**
   * Generates a follow-up message appropriate for the lead's stage.
   * Now uses AI reasoning context when available.
   */
  generateFollowUpMessage(stage: LeadStage, lastInteraction: string): string {
    const templates: Record<LeadStage, string[]> = {
      cold: [
        "¡Hola! 😊 Hace unos días me preguntaste sobre nuestros cursos. ¿Sigues interesado? Tengo algunas novedades que podrían gustarte.",
        "¡Hola de nuevo! 👋 Vi que estuviste viendo nuestros productos. ¿Te gustaría que te cuente sobre alguna promoción especial?"
      ],
      warm: [
        "¡Hola! 😊 Veo que has mostrado interés en nuestros cursos. ¿Te gustaría que resolvamos alguna duda específica?",
        "¡Hola! 👋 ¿Cómo va todo? Quería saber si necesitas más información sobre los productos que vimos."
      ],
      hot: [
        "¡Hola! 😊 Vi que tienes bastante interés en nuestros cursos. ¿Te gustaría que coordinemos tu acceso hoy mismo?",
        "¡Hola! 👋 Veo que estás muy interesado. ¿Hay algo específico que te gustaría saber antes de decidirte?"
      ],
      qualified: [
        "¡Hola! 😊 Veo que estás listo para dar el siguiente paso. ¿Te gustaría que te ayude con el proceso de adquisición?",
        "¡Hola! 👋 Estoy aquí para facilitarte el acceso a los cursos que te interesan."
      ],
      negotiating: [
        "¡Hola! 😊 ¿Cómo estás? Quería saber si resolviste las dudas sobre el precio. Estoy aquí para ayudarte.",
        "¡Hola! 👋 ¿Has tenido oportunidad de revisar las opciones de pago? Podemos encontrar la mejor para ti."
      ],
      closing: [
        "¡Hola! 😊 ¿Cómo va el proceso? Estoy aquí para ayudarte a completar tu acceso de forma rápida y segura.",
        "¡Hola! 👋 ¿Necesitas ayuda con algún paso del proceso de pago? Estoy aquí para apoyarte."
      ],
      converted: [],
      lost: []
    };

    const options = templates[stage];
    if (!options || options.length === 0) {
      return "¡Hola! 😊 ¿Cómo estás? Quería saber cómo puedo ayudarte hoy.";
    }
    return options[Math.floor(Math.random() * options.length)];
  }
}

// ─── Singleton & exports ─────────────────────────────────────────────────────

export const leadScoringEngine = new LeadScoringEngine();

export async function processMessageForLeadScoring(
  conversationId: number,
  messageContent: string
): Promise<LeadScore> {
  return leadScoringEngine.processMessageForScoring(conversationId, messageContent);
}

export async function getLeadScore(conversationId: number): Promise<LeadScore> {
  return leadScoringEngine.calculateLeadScore(conversationId);
}

export async function getLeadScoringDashboard(tenantId: number) {
  return leadScoringEngine.getLeadScoringDashboard(tenantId);
}
