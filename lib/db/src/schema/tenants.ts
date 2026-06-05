import { boolean, integer, pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  slug: text("slug").notNull().unique(),
  domain: text("domain"),
  status: text("status").notNull().default("active"),
  plan: text("plan").notNull().default("basic"),
  brandName: text("brand_name").notNull(),
  brandLogo: text("brand_logo"),
  brandColors: jsonb("brand_colors").$type<{
    primary: string;
    secondary: string;
    accent: string;
  }>(),
  brandTheme: text("brand_theme"),
  brandSocial: jsonb("brand_social").$type<Record<string, string>>(),
  agentPersonality: text("agent_personality").notNull().default("professional"),
  agentPrompt: text("agent_prompt"),
  agentName: text("agent_name").notNull().default("Asistente Virtual"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  supportEmail: text("support_email"),
  paymentMethods: jsonb("payment_methods").$type<{
    mercadopago?: { accessToken: string; enabled: boolean };
    paypal?: { clientId: string; clientSecret: string; mode: "sandbox" | "live"; enabled: boolean };
    transfer?: { enabled: boolean; accounts: Array<{ type: string; number: string; name: string }> };
  }>(),
  woocommerceIntegration: jsonb("woocommerce_integration").$type<{
    url?: string;
    consumerKey?: string;
    consumerSecret?: string;
    enabled: boolean;
  }>(),
  limits: jsonb("limits").$type<{
    maxConversations: number;
    maxProducts: number;
    maxAgents: number;
    maxMonthlyMessages: number;
    apiCallsPerMinute: number;
  }>(),
  settings: jsonb("settings").$type<{
    timezone: string;
    language: string;
    currency: string;
    autoRespond: boolean;
    workingHours?: { enabled: boolean; start: string; end: string; days: number[] };
  }>(),
  subscriptionId: text("subscription_id"),
  subscriptionStatus: text("subscription_status"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  subscriptionEndsAt: timestamp("subscription_ends_at", { withTimezone: true }),
  metadata: jsonb("metadata"),
  emailVerified: boolean("email_verified").default(false),
  emailVerificationCode: text("email_verification_code"),
  emailVerificationExpiry: timestamp("email_verification_expiry", { withTimezone: true }),
  passwordResetCode: text("password_reset_code"),
  passwordResetExpiry: timestamp("password_reset_expiry", { withTimezone: true }),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  twoFactorSecret: text("two_factor_secret"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;
