import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ── tenants ──────────────────────────────────────────────────────────────────
export const tenants = sqliteTable("tenants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  slug: text("slug").notNull().unique(),
  domain: text("domain"),
  status: text("status").notNull().default("active"),
  plan: text("plan").notNull().default("basic"),
  brandName: text("brand_name").notNull(),
  brandLogo: text("brand_logo"),
  brandColors: text("brand_colors", { mode: "json" }),
  brandTheme: text("brand_theme", { mode: "json" }),
  brandSocial: text("brand_social", { mode: "json" }),
  agentPersonality: text("agent_personality").notNull().default("professional"),
  agentPrompt: text("agent_prompt"),
  agentName: text("agent_name").notNull().default("Asistente Virtual"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  supportEmail: text("support_email"),
  paymentMethods: text("payment_methods", { mode: "json" }),
  woocommerceIntegration: text("woocommerce_integration", { mode: "json" }),
  limits: text("limits", { mode: "json" }),
  settings: text("settings", { mode: "json" }),
  subscriptionId: text("subscription_id"),
  subscriptionStatus: text("subscription_status"),
  trialEndsAt: text("trial_ends_at"),
  subscriptionEndsAt: text("subscription_ends_at"),
  metadata: text("metadata", { mode: "json" }),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  emailVerificationCode: text("email_verification_code"),
  emailVerificationExpiry: text("email_verification_expiry"),
  passwordResetCode: text("password_reset_code"),
  passwordResetExpiry: text("password_reset_expiry"),
  twoFactorEnabled: integer("two_factor_enabled", { mode: "boolean" }).default(false).notNull(),
  twoFactorSecret: text("two_factor_secret"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ── agents ───────────────────────────────────────────────────────────────────
export const agents = sqliteTable("agents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role").notNull(),
  tone: text("tone").notNull(),
  language: text("language").notNull().default("es"),
  model: text("model").notNull().default("gpt-4o-mini"),
  systemPrompt: text("system_prompt").notNull(),
  stages: text("stages", { mode: "json" }).notNull().default("[]"),
  metadata: text("metadata", { mode: "json" }),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

// ── leads ────────────────────────────────────────────────────────────────────
export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  stage: text("stage").notNull().default("new"),
  value: real("value").notNull().default(0),
  notes: text("notes"),
  source: text("source"),
  paymentStatus: text("payment_status"),
  lifetimeValue: real("lifetime_value").default(0),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── product_categories ───────────────────────────────────────────────────────
export const productCategories = sqliteTable("product_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── products ─────────────────────────────────────────────────────────────────
export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: real("price").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  sku: text("sku"),
  categoryId: integer("category_id").references(() => productCategories.id, { onDelete: "set null" }),
  category: text("category"),
  kind: text("kind").notNull().default("digital"),
  imageUrl: text("image_url"),
  highlight: text("highlight"),
  features: text("features", { mode: "json" }),
  paymentLink: text("payment_link"),
  deliveryLink: text("delivery_link"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── conversations ────────────────────────────────────────────────────────────
export const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone").notNull(),
  avatarColor: text("avatar_color").notNull().default("#10b981"),
  lastMessage: text("last_message"),
  lastMessageAt: text("last_message_at"),
  unreadCount: integer("unread_count").notNull().default(0),
  status: text("status").notNull().default("ai"),
  currentStage: text("current_stage"),
  channel: text("channel").default("whatsapp"),
  agentId: integer("agent_id").references(() => agents.id, { onDelete: "set null" }),
  leadId: integer("lead_id").references(() => leads.id, { onDelete: "set null" }),
  paymentStatus: text("payment_status"),
  paymentMethod: text("payment_method"),
  paymentAmount: real("payment_amount"),
  paidAt: text("paid_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── messages ─────────────────────────────────────────────────────────────────
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  stage: text("stage"),
  metadata: text("metadata", { mode: "json" }),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── activity_events ──────────────────────────────────────────────────────────
export const activityEvents = sqliteTable("activity_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── settings ─────────────────────────────────────────────────────────────────
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessName: text("business_name").notNull().default("Mi Negocio"),
  businessDescription: text("business_description").notNull().default(""),
  timezone: text("timezone").notNull().default("America/Mexico_City"),
  workingHoursStart: text("working_hours_start").notNull().default("09:00"),
  workingHoursEnd: text("working_hours_end").notNull().default("18:00"),
  autoReplyEnabled: integer("auto_reply_enabled", { mode: "boolean" }).notNull().default(true),
  offHoursMessage: text("off_hours_message").notNull().default("Gracias por escribirnos. Un asesor te responderá en horario de atención."),
  escalationKeywords: text("escalation_keywords", { mode: "json" }).notNull().default("[]"),
  aiProvider: text("ai_provider").notNull().default("github_copilot_internal"),
  githubToken: text("github_token"),
  githubModel: text("github_model").notNull().default("gpt-4o-mini"),
  copilotSessionToken: text("copilot_session_token"),
  copilotSessionExpiresAt: text("copilot_session_expires_at"),
  nvidiaApiKey: text("nvidia_api_key"),
  nvidiaModel: text("nvidia_model").notNull().default("meta/llama-3.1-70b-instruct"),
  ollamaUrl: text("ollama_url"),
  ollamaModel: text("ollama_model").notNull().default("hermes3:8b"),
  businessConfig: text("business_config", { mode: "json" }).notNull().default("{}"),
});

// ── stores ───────────────────────────────────────────────────────────────────
export const stores = sqliteTable("stores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  theme: text("theme", { mode: "json" }),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── store_categories ─────────────────────────────────────────────────────────
export const store_categories = sqliteTable("store_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  storeId: integer("store_id").references(() => stores.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── store_products ───────────────────────────────────────────────────────────
export const store_products = sqliteTable("store_products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  storeId: integer("store_id").references(() => stores.id, { onDelete: "cascade" }).notNull(),
  categoryId: integer("category_id").references(() => store_categories.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  price: real("price").notNull(),
  thumbUrl: text("thumb_url"),
  deliveryLink: text("delivery_link"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── payment_links ────────────────────────────────────────────────────────────
export const paymentLinks = sqliteTable("payment_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shortCode: text("short_code").notNull().unique(),
  originalUrl: text("original_url").notNull(),
  method: text("method").notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }),
  clientPhone: text("client_phone"),
  clicks: integer("clicks").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  lastClickAt: text("last_click_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── follow_ups ───────────────────────────────────────────────────────────────
export const followUps = sqliteTable("follow_ups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: integer("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  leadId: integer("lead_id").references(() => leads.id, { onDelete: "set null" }),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone").notNull(),
  scheduledFor: text("scheduled_for").notNull(),
  followUpType: text("follow_up_type").notNull().default("check_in"),
  message: text("message").notNull(),
  priority: text("priority").notNull().default("medium"),
  stage: text("stage").notNull(),
  lastScore: integer("last_score").default(0),
  attempts: integer("attempts").notNull().default(0),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── subscriptions ────────────────────────────────────────────────────────────
export const subscriptions = sqliteTable("subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  plan: text("plan").notNull(),
  status: text("status").notNull().default("pending"),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  paymentMethod: text("payment_method").notNull(),
  paymentId: text("payment_id"),
  paymentStatus: text("payment_status"),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  startedAt: text("started_at"),
  expiresAt: text("expires_at"),
  cancelledAt: text("cancelled_at"),
  nextBillingDate: text("next_billing_date"),
  autoRenew: integer("auto_renew", { mode: "boolean" }).default(true),
  activationToken: text("activation_token"),
  tokenSentAt: text("token_sent_at"),
  activatedAt: text("activated_at"),
  metadata: text("metadata", { mode: "json" }),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const paymentTransactions = sqliteTable("payment_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  paymentMethod: text("payment_method").notNull(),
  paymentId: text("payment_id").notNull(),
  paymentStatus: text("payment_status").notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  plan: text("plan").notNull(),
  billingCycle: text("billing_cycle").notNull(),
  payerEmail: text("payer_email"),
  payerName: text("payer_name"),
  payerId: text("payer_id"),
  webhookData: text("webhook_data", { mode: "json" }),
  paidAt: text("paid_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ── payments ─────────────────────────────────────────────────────────────────
export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  conversationId: integer("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  leadId: integer("lead_id").references(() => leads.id, { onDelete: "set null" }),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("COP"),
  method: text("method").notNull(),
  status: text("status").notNull().default("pending"),
  paymentStatus: text("payment_status"),
  proofReceived: integer("proof_received", { mode: "boolean" }).default(false),
  proofUrl: text("proof_url"),
  bankReference: text("bank_reference"),
  payerAccount: text("payer_account"),
  payerName: text("payer_name"),
  payerEmail: text("payer_email"),
  payerPhone: text("payer_phone"),
  verificationSource: text("verification_source"),
  verifiedAt: text("verified_at"),
  verifiedBy: text("verified_by"),
  notes: text("notes"),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ── store_layouts ────────────────────────────────────────────────────────────
export const store_layouts = sqliteTable("store_layouts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  storeId: integer("store_id").references(() => stores.id, { onDelete: "cascade" }).notNull().unique(),
  layoutData: text("layout_data", { mode: "json" }).notNull().default("{}"),
  version: text("version").notNull().default("1"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ── whatsapp_auth ────────────────────────────────────────────────────────────
export const whatsappAuth = sqliteTable("whatsapp_auth", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ── personality_profiles ──────────────────────────────────────────────────────
export const personalityProfiles = sqliteTable("personality_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  agentName: text("agent_name").notNull(),
  agentRole: text("agent_role").notNull(),
  tone: text("tone").notNull(),
  language: text("language").notNull().default("es"),
  formality: text("formality").notNull().default("tú"),
  agentType: text("agent_type").notNull().default("general"),
  systemPromptCore: text("system_prompt_core").notNull(),
  keywords: text("keywords", { mode: "json" }).$type<string[]>().notNull().default([]),
  brandVoiceOverrides: text("brand_voice_overrides", { mode: "json" }).$type<any>().default(null),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ── architect_memory ──────────────────────────────────────────────────────────
export const architectMemory = sqliteTable("architect_memory", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull().default("default"),
  memoryType: text("memory_type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  metadata: text("metadata", { mode: "json" }).$type<any>().default(null),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ── response_analytics ────────────────────────────────────────────────────────
export const responseAnalytics = sqliteTable("response_analytics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  agentId: integer("agent_id"),
  profileId: integer("profile_id"),
  conversationId: integer("conversation_id"),
  messageId: integer("message_id"),
  responseText: text("response_text").notNull(),
  responseLength: integer("response_length").notNull(),
  hadCard: integer("had_card", { mode: "boolean" }).notNull().default(false),
  cardProductId: integer("card_product_id"),
  outcome: text("outcome"),
  customerMessage: text("customer_message").notNull(),
  sentimentScore: integer("sentiment_score"),
  responseTimeMs: integer("response_time_ms").notNull(),
  metadata: text("metadata", { mode: "json" }).$type<any>().default(null),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── facebook_drafts ────────────────────────────────────────────────────────────
export const facebookDrafts = sqliteTable("facebook_drafts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),
  campaignId: text("campaign_id"),
  adSetId: text("ad_set_id"),
  adId: text("ad_id"),
  status: text("status").notNull().default("draft"),
  strategy: text("strategy", { mode: "json" }),
  primaryText: text("primary_text"),
  headline: text("headline"),
  description: text("description"),
  imageUrl: text("image_url"),
  niche: text("niche"),
  budget: integer("budget"),
  fbStatus: text("fb_status"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ── prompt_versions ───────────────────────────────────────────────────────────
export const promptVersions = sqliteTable("prompt_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  agentId: integer("agent_id"),
  profileId: integer("profile_id"),
  previousPrompt: text("previous_prompt").notNull(),
  newPrompt: text("new_prompt").notNull(),
  diffSummary: text("diff_summary").notNull(),
  reason: text("reason").notNull(),
  performanceBefore: text("performance_before", { mode: "json" }).$type<any>().default(null),
  performanceAfter: text("performance_after", { mode: "json" }).$type<any>().default(null),
  appliedBy: text("applied_by").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});
