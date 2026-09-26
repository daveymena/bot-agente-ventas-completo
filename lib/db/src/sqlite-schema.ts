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
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
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
  facebookIntegration: text("facebook_integration", { mode: "json" }),
  emailConfig: text("email_config", { mode: "json" }),
  apiKeys: text("api_keys", { mode: "json" }),
  // Espejo de schema/tenants.ts: las cuentas de Copilot son DE CADA CLIENTE,
  // no de la plataforma. Ver el comentario largo alla.
  copilotTokens: text("copilot_tokens", { mode: "json" }).$type<Array<{ token: string; cuenta?: string }>>(),
  woocommerceIntegration: text("woocommerce_integration", { mode: "json" }),
  limits: text("limits", { mode: "json" }),
  settings: text("settings", { mode: "json" }),
  subscriptionId: text("subscription_id"),
  subscriptionStatus: text("subscription_status"),
  trialEndsAt: text("trial_ends_at"),
  subscriptionEndsAt: text("subscription_ends_at"),
  metadata: text("metadata", { mode: "json" }),
  googleId: text("google_id"),
  authProvider: text("auth_provider").notNull().default("password"),
  avatarUrl: text("avatar_url"),
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
  // Filtra qué productos ve el agente ("digital", "dropshipping", o vacío para
  // ver todo). Tiene que estar acá y no solo en el schema de Postgres: si
  // falta, el enrutador por tipo de producto se comporta distinto en local que
  // en producción, que es peor que no tenerlo.
  especialidad: text("especialidad"),
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
  adContext: text("ad_context", { mode: "json" }),
  paymentStatus: text("payment_status"),
  lifetimeValue: real("lifetime_value").default(0),
  optOut: integer("opt_out", { mode: "boolean" }).notNull().default(false),
  // Memoria comercial que sobrevive a la conversación (ver schema/leads.ts).
  commercialProfile: text("commercial_profile", { mode: "json" }),
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
  // Espejo de schema/products.ts. Nullables los dos: null = "este negocio no
  // lleva control", que es distinto de "no hay".
  stock: integer("stock"),
  opciones: text("opciones", { mode: "json" }),
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
  // Memoria explícita del vendedor (motor v2). En SQLite no hay jsonb: se
  // guarda el JSON como texto y el repositorio lo parsea. Ver
  // `lib/motor-nuevo/estado-conversacion.ts`.
  estadoAgente: text("estado_agente"),
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
  // Espejo de schema/settings.ts: varias cuentas de Copilot en cola. Los jsonb
  // de Postgres son text(mode json) aca, como el resto de las columnas JSON.
  copilotTokens: text("copilot_tokens", { mode: "json" }).$type<Array<{ token: string; cuenta?: string }>>(),
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

// ── ad_agent_logs ───────────────────────────────────────────────────────────
export const adAgentLogs = sqliteTable("ad_agent_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull(),
  adSetId: text("ad_set_id"),
  productName: text("product_name"),
  checkType: text("check_type").notNull(),
  status: text("status").notNull().default("suggested"),
  suggestedAction: text("suggested_action"),
  reason: text("reason").notNull(),
  metricsSnapshot: text("metrics_snapshot"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  respondedAt: text("responded_at"),
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

// ── trabajos_programados: el reloj ───────────────────────────────────────────
// Espejo sqlite de schema/trabajos-programados.ts. Las pruebas corren sobre
// sqlite, y un reloj sin pruebas es justo el componente que uno NO quiere
// descubrir roto en producción a las 3 de la mañana.
// ── consumo_mensual: cuantos mensajes lleva cada negocio este mes ───────────
// Espejo sqlite de schema/consumo-mensual.ts. El limite del plan se prueba
// contra esto, asi que sin el espejo las pruebas medirian otra cosa que
// produccion.
export const consumoMensual = sqliteTable("consumo_mensual", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  periodo: text("periodo").notNull(),
  mensajes: integer("mensajes").notNull().default(0),
  actualizadoAt: text("actualizado_at").notNull(),
});

export const consumoConversaciones = sqliteTable("consumo_conversaciones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  periodo: text("periodo").notNull(),
  conversaciones: integer("conversaciones").notNull().default(0),
  actualizadoAt: text("actualizado_at").notNull(),
});

export const trabajosProgramados = sqliteTable("trabajos_programados", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  tipo: text("tipo").notNull(),
  clave: text("clave").notNull().unique(),
  correAt: text("corre_at").notNull(),
  estado: text("estado").notNull().default("pendiente"),
  datos: text("datos", { mode: "json" }).notNull().default({}),
  resultado: text("resultado", { mode: "json" }),
  intentos: integer("intentos").notNull().default(0),
  error: text("error"),
  repiteCadaMin: integer("repite_cada_min"),
  creadoAt: text("creado_at").notNull().default(sql`(datetime('now'))`),
  actualizadoAt: text("actualizado_at").notNull().default(sql`(datetime('now'))`),
});

// ── marketing_tasks (MASTER PLAN §20) ────────────────────────────────────────
export const marketingTasks = sqliteTable("marketing_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  parentTaskId: integer("parent_task_id"),
  requestedBy: text("requested_by"),
  assignedAgent: text("assigned_agent").notNull(),
  domain: text("domain").notNull().default("marketing"),
  action: text("action").notNull(),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("PENDING"),
  input: text("input", { mode: "json" }).notNull().default({}),
  output: text("output", { mode: "json" }),
  dependencies: text("dependencies", { mode: "json" }).notNull().default([]),
  risk: text("risk").notNull().default("LOW"),
  approvalRequired: integer("approval_required", { mode: "boolean" }).notNull().default(false),
  approvalStatus: text("approval_status"),
  error: text("error"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ── marketing_experiments (MASTER PLAN §13) ──────────────────────────────────
export const marketingExperiments = sqliteTable("marketing_experiments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  campaignId: text("campaign_id"),
  hypothesis: text("hypothesis").notNull(),
  variable: text("variable").notNull(),
  controlDraftId: integer("control_draft_id").references(() => facebookDrafts.id, { onDelete: "set null" }),
  variantDraftId: integer("variant_draft_id").references(() => facebookDrafts.id, { onDelete: "set null" }),
  controlLabel: text("control_label"),
  variantLabel: text("variant_label"),
  budget: real("budget"),
  durationDays: integer("duration_days"),
  minImpressions: integer("min_impressions").default(1000),
  status: text("status").notNull().default("EN_PRUEBA"),
  result: text("result", { mode: "json" }),
  conclusion: text("conclusion"),
  learning: text("learning"),
  startedAt: text("started_at"),
  endedAt: text("ended_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── marketing_campaigns (MASTER PLAN §12, §18) ───────────────────────────────
export const marketingCampaigns = sqliteTable("marketing_campaigns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  objective: text("objective").notNull(),
  status: text("status").notNull().default("PLANNED"),
  strategy: text("strategy", { mode: "json" }),
  budgetPlanned: real("budget_planned"),
  budgetSpent: real("budget_spent").default(0),
  targetKpis: text("target_kpis", { mode: "json" }),
  scalingState: text("scaling_state", { mode: "json" }),
  metaIds: text("meta_ids", { mode: "json" }),
  startedAt: text("started_at"),
  endedAt: text("ended_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── marketing_budgets (MASTER PLAN §17, §31) ─────────────────────────────────
export const marketingBudgets = sqliteTable("marketing_budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull().unique(),
  maxDailySpend: real("max_daily_spend").notNull().default(50000),
  maxBudgetChangePercent: real("max_budget_change_percent").notNull().default(25),
  maxScalePercent: real("max_scale_percent").notNull().default(30),
  approvalRequired: integer("approval_required", { mode: "boolean" }).notNull().default(true),
  currency: text("currency").notNull().default("COP"),
  todaySpend: real("today_spend").notNull().default(0),
  todayDate: text("today_date"),
  periodSpend: real("period_spend").notNull().default(0),
  periodStart: text("period_start"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ── marketing_audit_logs (MASTER PLAN §32) ───────────────────────────────────
export const marketingAuditLogs = sqliteTable("marketing_audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  agent: text("agent").notNull(),
  taskId: integer("task_id"),
  action: text("action").notNull(),
  resource: text("resource"),
  before: text("before", { mode: "json" }),
  after: text("after", { mode: "json" }),
  approval: text("approval"),
  reason: text("reason"),
  result: text("result").notNull().default("PENDING"),
  error: text("error"),
  requestId: text("request_id"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── remarketing_campaigns ────────────────────────────────────────────────────
export const remarketingCampaigns = sqliteTable("remarketing_campaigns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  segment: text("segment"),
  subject: text("subject"),
  message: text("message").notNull(),
  status: text("status").notNull().default("queued"),
  pendingLeadIds: text("pending_lead_ids", { mode: "json" }).notNull().default([]),
  totalTargeted: integer("total_targeted").notNull().default(0),
  totalSent: integer("total_sent").notNull().default(0),
  totalFailed: integer("total_failed").notNull().default(0),
  totalOptedOut: integer("total_opted_out").notNull().default(0),
  results: text("results", { mode: "json" }).default([]),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  completedAt: text("completed_at"),
});

// ── opencode_* ───────────────────────────────────────────────────────────────
export const opencodeConfig = sqliteTable("opencode_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const opencodeSkills = sqliteTable("opencode_skills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  content: text("content").notNull(),
  files: text("files", { mode: "json" }).default({}),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const opencodeMcpServers = sqliteTable("opencode_mcp_servers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  type: text("type").notNull().default("local"),
  command: text("command", { mode: "json" }).notNull(),
  enabled: text("enabled").notNull().default("true"),
  env: text("env", { mode: "json" }).default({}),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const opencodeCommands = sqliteTable("opencode_commands", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  template: text("template").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const opencodeSession = sqliteTable("opencode_session", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull().unique(),
  type: text("type").notNull(),
  data: text("data", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

/**
 * Proyectos de Landing AI Studio -- espejo SQLite de schema/landing-pages.ts.
 *
 * ⚠️ Esta tabla FALTABA acá, y por eso `landingPages` no se podía exportar del
 * punto de entrada del paquete: `src/index.ts` elige el esquema con
 * `USE_SQLITE ? sqliteSchema : pgSchema` y re-exporta tabla por tabla, así que
 * una tabla que existe en un solo lado queda `undefined` del otro. Las pruebas
 * corren con USE_SQLITE=true.
 *
 * Los jsonb de Postgres son text(mode json) acá, que es como este archivo
 * modela el resto de las columnas JSON (ver facebookDrafts.strategy).
 */
export const landingPages = sqliteTable("landing_pages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  status: text("status").notNull().default("draft"),
  strategy: text("strategy", { mode: "json" }).$type<Record<string, any>>().notNull().default({}),
  sections: text("sections", { mode: "json" }).$type<Array<Record<string, any>>>().notNull().default([]),
  design: text("design", { mode: "json" }).$type<Record<string, any>>().notNull().default({}),
  source: text("source", { mode: "json" }).$type<Record<string, any>>().notNull().default({}),
  html: text("html"),
  publishedUrl: text("published_url"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

// ── product_knowledge ────────────────────────────────────────────────────────
// Lo que el dueño le enseña al agente sobre un producto. Tiene que estar acá y
// no solo en el schema de Postgres: si falta, el conocimiento cargado por
// Atlas se lee distinto en local que en producción.
export const productKnowledge = sqliteTable("product_knowledge", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "cascade" }),
  pregunta: text("pregunta").notNull(),
  disparadores: text("disparadores").notNull(),
  respuesta: text("respuesta"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").default(sql`(datetime('now'))`),
});

/**
 * Cupones / promociones reales -- espejo SQLite de schema/coupons.ts.
 * Igual que landingPages: tiene que estar acá para que `coupons` no quede
 * `undefined` cuando USE_SQLITE=true (local y pruebas).
 */
export const coupons = sqliteTable("coupons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  code: text("code").notNull(),
  tipo: text("tipo").notNull().default("porcentaje"),
  valor: real("valor").notNull(),
  minimoCompra: real("minimo_compra"),
  usosMax: integer("usos_max"),
  usos: integer("usos").notNull().default(0),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  vigenciaInicio: text("vigencia_inicio"),
  vigenciaFin: text("vigencia_fin"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});
