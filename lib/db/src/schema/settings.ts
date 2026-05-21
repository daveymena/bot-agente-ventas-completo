import { boolean, jsonb, pgTable, serial, text } from "drizzle-orm/pg-core";

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  businessName: text("business_name").notNull().default("Mi Negocio"),
  businessDescription: text("business_description").notNull().default(""),
  timezone: text("timezone").notNull().default("America/Mexico_City"),
  workingHoursStart: text("working_hours_start").notNull().default("09:00"),
  workingHoursEnd: text("working_hours_end").notNull().default("18:00"),
  autoReplyEnabled: boolean("auto_reply_enabled").notNull().default(true),
  offHoursMessage: text("off_hours_message")
    .notNull()
    .default(
      "Gracias por escribirnos. Un asesor te responderá en horario de atención.",
    ),
  escalationKeywords: jsonb("escalation_keywords")
    .$type<string[]>()
    .notNull()
    .default([]),
  // AI Provider Configuration
  aiProvider: text("ai_provider").notNull().default("github_copilot_internal"), // github_copilot_internal, github, ollama_local, openai_default
  githubToken: text("github_token"),
  githubModel: text("github_model").notNull().default("gpt-4o-mini"),
  copilotSessionToken: text("copilot_session_token"),
  copilotSessionExpiresAt: text("copilot_session_expires_at"),
  nvidiaApiKey: text("nvidia_api_key"),
  nvidiaModel: text("nvidia_model").notNull().default("meta/llama-3.1-70b-instruct"),
  ollamaUrl: text("ollama_url"),
  ollamaModel: text("ollama_model").notNull().default("hermes3:8b"),

  // ─── Business-Specific Config (portable across projects) ─────────────────────
  // All brand/business data in one JSON column so any project can override without code changes.
  // Keys: transferNumber, transferOwner, businessNiche, brandVoiceConfig (partial BrandVoice),
  //       paymentMethodsConfig, deliveryInfo, guaranteeInfo, customPhrases
  businessConfig: jsonb("business_config")
    .$type<Record<string, any>>()
    .notNull()
    .default({}),
});

export type Settings = typeof settings.$inferSelect;
export type InsertSettings = typeof settings.$inferInsert;
