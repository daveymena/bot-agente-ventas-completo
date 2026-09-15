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
  // Dueño de la plataforma: puede ver y administrar TODOS los tenants (no
  // solo el propio). Antes esto se chequeaba en el frontend comparando el
  // email contra un valor hardcodeado ("daveymena16@gmail.com") y las rutas
  // de administración multi-tenant (/api/whatsapp/instances, /health,
  // /metrics, /cleanup) no verificaban nada en el backend -- cualquier
  // tenant autenticado podía ver y controlar las sesiones de WhatsApp de
  // TODOS los demás tenants con solo llamar a la API directamente.
  isAdmin: boolean("is_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
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
    mercadopago?: { accessToken: string; publicKey?: string; enabled: boolean };
    paypal?: { clientId: string; clientSecret: string; mode: "sandbox" | "live"; enabled: boolean };
    transfer?: { enabled: boolean; accounts: Array<{ type: string; number: string; name: string }> };
  }>(),
  facebookIntegration: jsonb("facebook_integration").$type<{
    appId?: string;
    appSecret?: string;
    pageId?: string;
    pageAccessToken?: string;
    adAccountId?: string;
    webhookVerifyToken?: string;
    messengerVerifyToken?: string;
    enabled: boolean;
  }>(),
  emailConfig: jsonb("email_config").$type<{
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPassword?: string;
    emailFrom?: string;
    emailTo?: string;
    enabled: boolean;
  }>(),
  /**
   * Cuentas de GitHub Copilot DE ESTE CLIENTE, en cola.
   *
   * ⚠️ Vive en el inquilino y NO en `settings` a proposito. `settings` es una
   * tabla de UNA sola fila para toda la plataforma: con el token de Copilot
   * ahi, todos los clientes gastaban la cuota del DUENO sin saberlo, y una
   * sola cuenta agotada los dejaba a todos sin IA al mismo tiempo.
   *
   * Ademas de la cuota, hay un riesgo de negocio: los terminos de Copilot son
   * para asientos individuales o de empresa, no para dar servicio de IA a
   * terceros que pagan. Si GitHub lo lee como reventa, suspende la cuenta y
   * caen TODOS los clientes de golpe.
   *
   * Decision del dueno (2026-09-05): cada cliente conecta la suya y NO hay
   * respaldo a la del dueno. Quien no conecte Copilot usa otro proveedor --
   * DeepSeek responde en 1,7s-- en vez de gastar cuota ajena en silencio.
   *
   * Mismo formato que la cola global que reemplaza: [{ token, cuenta }], con
   * el correo para que el cliente sepa cual recargar.
   */
  copilotTokens: jsonb("copilot_tokens").$type<Array<{ token: string; cuenta?: string }>>(),
  apiKeys: jsonb("api_keys").$type<{
    openai?: string;
    groq?: string;
    nvidia?: string;
    opencode?: string;
    opencodeZen?: string;
    github?: string;
    pexels?: string;
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
  // Google OAuth / OpenID Connect. `google_id` guarda el `sub` de Google, que
  // es el identificador primario de la cuenta vinculada (no el email, que puede
  // cambiar). `auth_provider` distingue el origen de la cuenta (password|google)
  // y `avatar_url` la foto de perfil de Google. Todos nullable para no tocar
  // las cuentas que ya existen.
  googleId: text("google_id"),
  authProvider: text("auth_provider").notNull().default("password"),
  avatarUrl: text("avatar_url"),
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
