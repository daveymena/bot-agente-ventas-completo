import { boolean, jsonb, pgTable, serial, text } from "drizzle-orm/pg-core";

export type AiProviderEntry = {
  apiKey?: string;
  model?: string;
  enabled?: boolean;
  url?: string;
};

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
  aiProvider: text("ai_provider").notNull().default("github"), // github, ollama_local, openai_default
  githubToken: text("github_token"),
  githubModel: text("github_model").notNull().default("gpt-4o-mini"),
  ollamaUrl: text("ollama_url"),
  ollamaModel: text("ollama_model").notNull().default("hermes3:8b"),
  aiProvidersConfig: jsonb("ai_providers_config")
    .$type<Record<string, AiProviderEntry>>()
    .notNull()
    .default({}),
  aiProviderFallbacks: jsonb("ai_provider_fallbacks")
    .$type<string[]>()
    .notNull()
    .default(["github", "groq", "deepseek"]),
  // Dropi Integration
  dropiToken: text("dropi_token"),
  dropiStoreId: text("dropi_store_id"),
});

export type Settings = typeof settings.$inferSelect;
export type InsertSettings = typeof settings.$inferInsert;
