import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import type { ToneStyle, EmojiSet, BrandPhrases } from "./brand-voice-types";

export type AgentType =
  | "general"
  | "dropshipping"
  | "digital_products"
  | "services"
  | "telecom"
  | "marketing"
  | "courses"
  | "b2b"
  | "subscriptions"
  | "followup"
  | "architect";

export interface BrandVoiceOverrides {
  tone?: ToneStyle;
  language?: string;
  formality?: "tú" | "usted";
  emojis?: Partial<EmojiSet>;
  phrases?: Partial<BrandPhrases>;
  deliveryInfo?: { details: string; timeframe: string };
  guaranteeInfo?: { description: string; duration: string };
  accessInfo?: { description: string; type: string };
  signature?: string;
  separatorChar?: string;
}

export interface PersonalityProfile {
  id: number;
  tenantId: number | null;
  name: string;
  description: string;
  agentName: string;
  agentRole: string;
  tone: string;
  language: string;
  formality: string;
  agentType: AgentType;
  systemPromptCore: string;
  keywords: string[];
  brandVoiceOverrides: BrandVoiceOverrides | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertPersonalityProfile {
  tenantId?: number | null;
  name: string;
  description: string;
  agentName: string;
  agentRole: string;
  tone: string;
  language?: string;
  formality?: string;
  agentType: AgentType;
  systemPromptCore: string;
  keywords?: string[];
  brandVoiceOverrides?: BrandVoiceOverrides | null;
  isActive?: boolean;
}

export const personalityProfiles = pgTable("personality_profiles", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  agentName: text("agent_name").notNull(),
  agentRole: text("agent_role").notNull(),
  tone: text("tone").notNull(),
  language: text("language").notNull().default("es"),
  formality: text("formality").notNull().default("tú"),
  agentType: text("agent_type").$type<AgentType>().notNull().default("general"),
  systemPromptCore: text("system_prompt_core").notNull(),
  keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
  brandVoiceOverrides: jsonb("brand_voice_overrides")
    .$type<BrandVoiceOverrides | null>()
    .default(null),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
