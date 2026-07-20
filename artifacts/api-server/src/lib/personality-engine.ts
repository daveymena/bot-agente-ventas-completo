import { db, personalityProfiles, agents } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type {
  PersonalityProfile,
  InsertPersonalityProfile,
  AgentType,
  BrandVoiceOverrides,
} from "@workspace/db/schema";
import type { InsertAgent } from "@workspace/db/schema";
import { AGENT_TEMPLATES } from "./agent-templates";
import { logger } from "./logger";

export interface GeneratedAgent {
  name: string;
  role: string;
  tone: string;
  systemPrompt: string;
  agentType: AgentType;
  keywords: string[];
}

export class PersonalityEngine {

  async createProfile(data: InsertPersonalityProfile): Promise<PersonalityProfile> {
    const [profile] = await db
      .insert(personalityProfiles)
      .values({
        ...data,
        keywords: data.keywords || [],
        brandVoiceOverrides: data.brandVoiceOverrides || null,
        isActive: data.isActive ?? true,
      })
      .returning();
    logger.info({ profileId: profile.id, name: profile.name }, "[PersonalityEngine] Profile created");
    return profile;
  }

  async updateProfile(id: number, data: Partial<InsertPersonalityProfile>): Promise<PersonalityProfile | null> {
    const [profile] = await db
      .update(personalityProfiles)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(personalityProfiles.id, id))
      .returning();
    if (!profile) return null;
    logger.info({ profileId: id }, "[PersonalityEngine] Profile updated");
    return profile;
  }

  async getProfile(id: number): Promise<PersonalityProfile | null> {
    const [profile] = await db
      .select()
      .from(personalityProfiles)
      .where(eq(personalityProfiles.id, id))
      .limit(1);
    return profile || null;
  }

  async listProfiles(tenantId?: number): Promise<PersonalityProfile[]> {
    if (tenantId) {
      return db
        .select()
        .from(personalityProfiles)
        .where(eq(personalityProfiles.tenantId, tenantId))
        .orderBy(personalityProfiles.createdAt);
    }
    return db
      .select()
      .from(personalityProfiles)
      .orderBy(personalityProfiles.createdAt);
  }

  async deleteProfile(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(personalityProfiles)
      .where(eq(personalityProfiles.id, id))
      .returning();
    return !!deleted;
  }

  generateAgentFromProfile(profile: PersonalityProfile): GeneratedAgent {
    const template = AGENT_TEMPLATES.find(
      (t) => t.agentType === profile.agentType
    );
    const basePrompt = template?.systemPrompt || "";
    const overrides = profile.brandVoiceOverrides as BrandVoiceOverrides | null;

    const systemPrompt = [
      `## IDENTIDAD DEL AGENTE`,
      `Eres **${profile.agentName}**, ${profile.agentRole}.`,
      `Tono: ${profile.tone} | Lenguaje: ${profile.language} | Formalidad: ${profile.formality}`,
      ``,
      `## INSTRUCCIONES DE PERSONALIDAD`,
      profile.systemPromptCore,
      ``,
      overrides?.phrases ? `## FRASES PERSONALIZADAS` : null,
      overrides?.phrases ? JSON.stringify(overrides.phrases, null, 2) : null,
      ``,
      `## SISTEMA BASE`,
      basePrompt,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      name: profile.agentName,
      role: profile.agentRole,
      tone: profile.tone,
      systemPrompt,
      agentType: profile.agentType as AgentType,
      keywords: (profile.keywords as string[]) || [],
    };
  }

  async materializeAgent(
    profileId: number,
    tenantId: number
  ): Promise<InsertAgent | null> {
    const profile = await this.getProfile(profileId);
    if (!profile) return null;

    const generated = this.generateAgentFromProfile(profile);

    const stages =
      AGENT_TEMPLATES.find((t) => t.agentType === profile.agentType)?.stages ||
      [];

    const [agent] = await db
      .insert(agents)
      .values({
        tenantId,
        name: generated.name,
        role: generated.role,
        tone: generated.tone,
        language: profile.language || "es",
        model: "gpt-4o-mini",
        systemPrompt: generated.systemPrompt,
        stages: stages as any,
        metadata: {
          personalityProfileId: profileId,
          profileName: profile.name,
          agentType: generated.agentType,
          keywords: generated.keywords,
          brandVoiceOverrides: profile.brandVoiceOverrides,
        },
        isActive: true,
      })
      .returning();

    logger.info(
      { agentId: agent.id, profileId, name: generated.name },
      "[PersonalityEngine] Agent materialized from profile"
    );
    return agent;
  }

  async applyPersonalityToResponse(
    profile: PersonalityProfile,
    baseResponse: string
  ): Promise<string> {
    const overrides = profile.brandVoiceOverrides as BrandVoiceOverrides | null;

    if (!overrides) return baseResponse;

    let response = baseResponse;

    if (overrides.signature) {
      response = response.replace(
        /_TecnoVariedades[\s\S]*?_/,
        overrides.signature
      );
    }

    return response;
  }

  getKeywordsForAgentType(agentType: AgentType): string[] {
    const keywordMap: Record<AgentType, string[]> = {
      general: [
        "producto",
        "curso",
        "megapack",
        "precio",
        "comprar",
        "información",
        "ayuda",
        "servicio",
      ],
      dropshipping: [
        "envío",
        "domicilio",
        "físico",
        "producto físico",
        "talla",
        "color",
        "catálogo",
        "pedido",
      ],
      digital_products: [
        "digital",
        "descargar",
        "megapack",
        "cursos",
        "online",
        "virtual",
        "acceso",
        "drive",
      ],
      services: [
        "servicio",
        "consultoría",
        "asesoría",
        "personalizado",
        "cotización",
        "proyecto",
      ],
      telecom: ["internet", "teléfono", "plan", "megas", "señal", "fibra"],
      marketing: [
        "publicidad",
        "marketing",
        "redes",
        "facebook",
        "instagram",
        "anuncio",
        "campaña",
      ],
      courses: [
        "curso",
        "aprender",
        "clase",
        "formación",
        "capacitación",
        "educación",
        "taller",
      ],
      b2b: [
        "empresa",
        "negocio",
        "corporativo",
        "mayorista",
        "distribuidor",
        "volumen",
      ],
      subscriptions: [
        "suscripción",
        "membresía",
        "plan",
        "mensual",
        "anual",
        "renovación",
      ],
      followup: [
        "seguimiento",
        "recordatorio",
        "carrito",
        "abandonado",
        "oferta",
        "descuento",
      ],
      architect: [
        "crear",
        "diseñar",
        "configurar",
        "personalidad",
        "agente",
        "perfil",
        "arquitecto",
      ],
    };
    return keywordMap[agentType] || keywordMap.general;
  }
}

export const personalityEngine = new PersonalityEngine();
