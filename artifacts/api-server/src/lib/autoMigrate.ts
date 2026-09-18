import { pool } from "@workspace/db";
import { logger } from "./logger";

const MIGRATIONS = [
  // El feed de actividad se compartia entre TODOS los negocios: el aviso de
  // uno le aparecia a los demas. Nullable porque las filas viejas no tienen
  // dueno conocido y no se puede adivinar.
  `ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS tenant_id INTEGER`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS brand_theme TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS brand_social JSONB`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS woocommerce_integration JSONB`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_verification_code TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_verification_expiry TIMESTAMP WITH TIME ZONE`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS password_reset_code TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS password_reset_expiry TIMESTAMP WITH TIME ZONE`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS two_factor_secret TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS facebook_integration JSONB`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_config JSONB`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS api_keys JSONB`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS opt_out BOOLEAN NOT NULL DEFAULT false`,
  // Memoria comercial del cliente que sobrevive a la conversacion: que fichas
  // ya vio y que objeciones puso, aunque vuelva semanas despues y en otro
  // chat. Antes eso vivia en sentProductIds de ConversationMemory y se perdia
  // al abrirse una conversacion nueva, asi que el bot le volvia a presentar lo
  // mismo. Ver CommercialProfile en lib/db/src/schema/leads.ts.
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS commercial_profile JSONB`,
  // El admin pidió separar categorías de productos Digitales vs Físicas --
  // hoy cualquier categoría se puede usar para cualquier tipo de producto,
  // sin ninguna restricción. description/icon/color ya existían en la DB
  // real (usados por routes/categories.ts) pero no en este esquema; se
  // agregan acá también por las dudas, de forma idempotente.
  `ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS description TEXT`,
  `ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS icon TEXT`,
  `ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#6b7280'`,
  `ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'digital'`,
  // Fotos múltiples para borradores de Facebook (carrusel) -- antes solo
  // existía image_url (una sola imagen por anuncio).
  `ALTER TABLE facebook_drafts ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'`,
  // Landing pages con HTML dinámico generado por OpenCode (Chat → Landing).
  // El HTML se almacena completo (inline CSS, responsive) para servirlo
  // directamente sin pasar por renderer-v3.
  `ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS html TEXT`,
  // ── Dropshipping ──────────────────────────────────────────────────────────
  // Un producto fisico no se entrega con un link de Google Drive: hay que
  // pedirle al cliente a donde se lo mandan y despachar. Hasta ahora no habia
  // NINGUN lugar donde guardar eso -- ni `leads` ni `conversations` tenian un
  // solo campo de direccion, y no existia tabla de pedidos. El agente podia
  // cerrar la venta y los datos se perdian.
  `ALTER TABLE agents ADD COLUMN IF NOT EXISTS especialidad TEXT`,
  // El conocimiento por producto que carga el dueño desde Atlas. Sin esta
  // migración la tabla no existe en producción y la herramienta falla al
  // primer uso, que es cuando el cliente nuevo intenta configurar su agente.
  `CREATE TABLE IF NOT EXISTS product_knowledge (
     id SERIAL PRIMARY KEY,
     tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
     product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
     pregunta TEXT NOT NULL,
     disparadores TEXT NOT NULL,
     respuesta TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_product_knowledge_tenant ON product_knowledge(tenant_id, product_id)`,
  `CREATE TABLE IF NOT EXISTS dropshipping_orders (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
    lead_id INTEGER,
    product_id INTEGER,
    product_name TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(12,2),
    total NUMERIC(12,2),
    -- Datos de envio. Nombres en el orden en que se le piden al cliente.
    nombre TEXT,
    telefono TEXT,
    documento TEXT,
    departamento TEXT,
    ciudad TEXT,
    direccion TEXT,
    barrio TEXT,
    notas TEXT,
    -- 'contraentrega' es el metodo por defecto en dropshipping colombiano.
    metodo_pago TEXT NOT NULL DEFAULT 'contraentrega',
    -- borrador -> datos completos -> enviado a woocommerce -> despachado
    estado TEXT NOT NULL DEFAULT 'borrador',
    woo_order_id INTEGER,
    woo_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
  )`,
  // ── Marketing & Growth Team (PR #15) ────────────────────────────────────
  // `scripts/migrate.mjs` ya trae estas tablas, pero ese script se corre a
  // mano y la Postgres de producción vive en la red interna de EasyPanel.
  // autoMigrate es lo único que corre solo en cada arranque, así que sin esto
  // el servidor levanta y TODO el dominio de marketing revienta en runtime
  // contra tablas que no existen. Mismo criterio que el resto del archivo:
  // idempotente (IF NOT EXISTS) y seguro de repetir en cada boot.
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS ad_context JSONB`,
  `CREATE TABLE IF NOT EXISTS marketing_tasks (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_task_id INTEGER,
    requested_by TEXT,
    assigned_agent TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT 'marketing',
    action TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'PENDING',
    input JSONB NOT NULL DEFAULT '{}',
    output JSONB DEFAULT NULL,
    dependencies JSONB NOT NULL DEFAULT '[]',
    risk TEXT NOT NULL DEFAULT 'LOW',
    approval_required BOOLEAN NOT NULL DEFAULT false,
    approval_status TEXT,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS marketing_tasks_tenant_idx ON marketing_tasks (tenant_id, status)`,
  `CREATE TABLE IF NOT EXISTS marketing_experiments (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    campaign_id TEXT,
    hypothesis TEXT NOT NULL,
    variable TEXT NOT NULL,
    control_draft_id INTEGER,
    variant_draft_id INTEGER,
    control_label TEXT,
    variant_label TEXT,
    budget NUMERIC(12,2),
    duration_days INTEGER,
    min_impressions INTEGER DEFAULT 1000,
    status TEXT NOT NULL DEFAULT 'EN_PRUEBA',
    result JSONB DEFAULT NULL,
    conclusion TEXT,
    learning TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS marketing_experiments_tenant_idx ON marketing_experiments (tenant_id, status)`,
  `CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    objective TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PLANNED',
    strategy JSONB DEFAULT NULL,
    budget_planned NUMERIC(12,2),
    budget_spent NUMERIC(12,2) DEFAULT '0',
    target_kpis JSONB DEFAULT NULL,
    scaling_state JSONB DEFAULT NULL,
    meta_ids JSONB DEFAULT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS marketing_campaigns_tenant_idx ON marketing_campaigns (tenant_id, status)`,
  `CREATE TABLE IF NOT EXISTS marketing_budgets (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    max_daily_spend NUMERIC(12,2) NOT NULL DEFAULT '50000',
    max_budget_change_percent NUMERIC(5,2) NOT NULL DEFAULT '25',
    max_scale_percent NUMERIC(5,2) NOT NULL DEFAULT '30',
    approval_required BOOLEAN NOT NULL DEFAULT true,
    currency TEXT NOT NULL DEFAULT 'COP',
    today_spend NUMERIC(12,2) NOT NULL DEFAULT '0',
    today_date VARCHAR(10),
    period_spend NUMERIC(12,2) NOT NULL DEFAULT '0',
    period_start TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS marketing_audit_logs (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent TEXT NOT NULL,
    task_id INTEGER,
    action TEXT NOT NULL,
    resource TEXT,
    before JSONB DEFAULT NULL,
    after JSONB DEFAULT NULL,
    approval TEXT,
    reason TEXT,
    result TEXT NOT NULL DEFAULT 'PENDING',
    error TEXT,
    request_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
   )`,
  // Bitácora transversal de Atlas. Es append-only desde la aplicación: cada
  // fila enlaza su hash con la anterior del tenant para detectar alteraciones.
  `CREATE TABLE IF NOT EXISTS control_plane_audit (
    id BIGSERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id TEXT,
    turn_id TEXT,
    request_id TEXT NOT NULL,
    actor TEXT NOT NULL,
    tool TEXT NOT NULL,
    phase TEXT NOT NULL,
    status TEXT NOT NULL,
    arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB,
    error TEXT,
    previous_hash TEXT,
    entry_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS control_plane_audit_tenant_idx ON control_plane_audit (tenant_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS marketing_audit_logs_tenant_idx ON marketing_audit_logs (tenant_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS dropshipping_orders_conv_idx ON dropshipping_orders (conversation_id)`,
  // Veredicto de Dropi sobre el pedido (lo escribe Dropify en la orden de Woo
  // y el bot lo relee al crearla). Sin esto el #323 quedó "registrado" tres
  // días mientras Dropi lo había rechazado.
  `ALTER TABLE dropshipping_orders ADD COLUMN IF NOT EXISTS dropi_estado TEXT`,
  `ALTER TABLE dropshipping_orders ADD COLUMN IF NOT EXISTS dropi_order_id TEXT`,
  `ALTER TABLE dropshipping_orders ADD COLUMN IF NOT EXISTS dropi_error TEXT`,
  `CREATE INDEX IF NOT EXISTS dropshipping_orders_estado_idx ON dropshipping_orders (tenant_id, estado)`,
  `CREATE TABLE IF NOT EXISTS remarketing_campaigns (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    segment TEXT,
    subject TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    pending_lead_ids JSONB NOT NULL DEFAULT '[]',
    total_targeted INTEGER NOT NULL DEFAULT 0,
    total_sent INTEGER NOT NULL DEFAULT 0,
    total_failed INTEGER NOT NULL DEFAULT 0,
    total_opted_out INTEGER NOT NULL DEFAULT 0,
    results JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE
  )`,
  // ── Lo que un negocio que NO vende cursos necesita el día uno ───────────
  //
  // El admin lo planteó bien el 2026-09-01: "si un cliente nuevo entra al
  // negocio tenés que tener habilitado todo eso, como lo hace WordPress".
  // Tiene razón, y WooCommerce no es más inteligente: trae el MODELO DE DATOS
  // con estos campos desde la instalación. Eso es lo que faltaba acá -- los
  // campos, no la lógica.
  //
  // Los dos van nullable a propósito. `stock = 0` por defecto haría que el bot
  // dijera "agotado" sobre 84 cursos disponibles; `null` significa "este
  // negocio no lleva control", que es distinto de "no hay".
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS opciones JSONB DEFAULT NULL`,
  // ── El reloj del sistema ────────────────────────────────────────────────
  // Ver lib/db/src/schema/trabajos-programados.ts. Va acá y no por
  // `drizzle-kit push` porque push compara TODO el esquema y puede proponer
  // cambios destructivos en tablas que nadie pidió tocar; esto crea lo nuevo
  // sin mirar lo viejo.
  `CREATE TABLE IF NOT EXISTS trabajos_programados (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    clave TEXT NOT NULL,
    corre_at TIMESTAMP WITH TIME ZONE NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    datos JSONB NOT NULL DEFAULT '{}',
    resultado JSONB DEFAULT NULL,
    intentos INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    repite_cada_min INTEGER,
    creado_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    actualizado_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
  )`,
  // Único de verdad: es lo que hace imposible publicar dos veces el mismo post
  // aunque la semana se reprograme o corran dos instancias del servidor.
  `CREATE UNIQUE INDEX IF NOT EXISTS trabajos_programados_clave_idx ON trabajos_programados (clave)`,
  // El índice que usa el buscador de trabajos vencidos en cada vuelta.
  `CREATE INDEX IF NOT EXISTS trabajos_programados_pendientes_idx ON trabajos_programados (estado, corre_at)`,

  // ── El consumo del mes, que antes vivia en memoria ──────────────────────
  //
  // El limite del plan YA se aplicaba y el contador YA se incrementaba, pero
  // vivia en un Map del proceso: cada reinicio lo ponia en cero. Un despliegue
  // es un reinicio, y el 2026-09-07 hubo doce. El limite existia y nadie lo
  // alcanzaba nunca.
  `CREATE TABLE IF NOT EXISTS consumo_mensual (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    periodo TEXT NOT NULL,
    mensajes INTEGER NOT NULL DEFAULT 0,
    actualizado_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
  )`,
  // Una sola fila por negocio y mes. Sin esto, dos envios simultaneos crean dos
  // filas y el conteo queda partido -- la forma silenciosa de que un limite
  // deje de aplicarse.
  `CREATE UNIQUE INDEX IF NOT EXISTS consumo_mensual_tenant_periodo ON consumo_mensual (tenant_id, periodo)`,
  // ── Varias cuentas de Copilot, en cola ──────────────────────────────────
  //
  // ⚠️ `ai-keys.ts` YA LEIA `row.copilotTokens` desde el 2026-08-24, pero esta
  // columna NUNCA se creo: leia `undefined` en silencio, `COPILOT_TOKENS` no
  // se poblaba nunca, y `cuentasDeCopilot()` caia al token unico. La rotacion
  // --que aparta 1 hora al candidato sin cuota y sigue con el siguiente--
  // estaba escrita y probada, pero no tenia mas de un candidato que rotar.
  //
  // Es el mismo patron que dejo a Landing Studio sin ejecutar: codigo correcto
  // leyendo algo que nadie creo. Por eso el /health ahora verifica las tablas.
  `ALTER TABLE settings ADD COLUMN IF NOT EXISTS copilot_tokens JSONB`,
  // ⚠️ Y la MISMA columna en tenants, que es donde de verdad va.
  //
  // La de `settings` quedo (es una tabla de UNA fila para toda la plataforma)
  // pero ya no se usa para decidir: con el token del dueno ahi, TODOS los
  // clientes gastaban su cuota sin saberlo, y una cuenta agotada los dejaba a
  // todos sin IA al mismo tiempo. Decision del dueno: cada cliente conecta la
  // suya y no hay respaldo a la del dueno.
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS copilot_tokens JSONB`,
  // ── Google OAuth / OpenID Connect ────────────────────────────────────────
  // Login con Google. google_id = sub de Google (id primario de la cuenta
  // vinculada), auth_provider = origen de la cuenta, avatar_url = foto.
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS google_id TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'password'`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS avatar_url TEXT`,

  // ── Landing AI Studio ───────────────────────────────────────────────────
  // Sin esto la tabla no existe en produccion y TODA la API de landings
  // revienta en runtime: guardar, cargar, listar y el comando de IA --que
  // primero lee la landing-- fallan los cuatro. Definirla en el schema de
  // Drizzle NO la crea; `db:push` se corre a mano y la Postgres de produccion
  // vive en la red interna de EasyPanel, que es justo lo que explica el
  // comentario de las tablas de marketing mas arriba.
  `CREATE TABLE IF NOT EXISTS landing_pages (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    strategy JSONB NOT NULL DEFAULT '{}',
    sections JSONB NOT NULL DEFAULT '[]',
    design JSONB NOT NULL DEFAULT '{}',
    source JSONB NOT NULL DEFAULT '{}',
    published_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS landing_pages_tenant_idx ON landing_pages (tenant_id)`,
  // El slug es la URL publica: unico POR INQUILINO, no global -- dos negocios
  // distintos pueden querer "curso-de-ia" y ninguno tiene por que ceder.
  `CREATE UNIQUE INDEX IF NOT EXISTS landing_pages_tenant_slug_idx ON landing_pages (tenant_id, slug)`,
];

/**
 * Las tablas que este archivo se compromete a crear.
 *
 * Se derivan del propio SQL en vez de escribirse a mano: una lista paralela se
 * desactualiza el dia que alguien agrega una tabla y se olvida de la lista, y
 * ahi el chequeo del /health dejaria de cubrir justo lo nuevo -- que es lo que
 * mas probabilidades tiene de estar roto.
 */
export const TABLAS_ESPERADAS: string[] = Array.from(
  new Set(
    MIGRATIONS.flatMap((sql) => {
      const m = /CREATE TABLE IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/i.exec(sql);
      return m ? [m[1].toLowerCase()] : [];
    }),
  ),
);

/**
 * Que paso la ultima vez que corrieron las migraciones.
 *
 * ⚠️ Esto existe porque `runAutoMigrations` SE TRAGA los errores: loguea y
 * sigue. Es la decision correcta --una migracion fallida no puede impedir que
 * el servidor levante y atienda clientes-- pero deja un agujero grave: si un
 * CREATE TABLE falla, el servidor arranca normal, el /health dice "ok" y la
 * funcionalidad que usa esa tabla revienta en runtime sin que nadie se entere.
 *
 * Paso de verdad con `landing_pages` el 2026-09-04: Landing Studio entero no
 * ejecutaba y todo se veia bien.
 *
 * Ahora el resultado queda registrado y el /health lo publica.
 */
export const ultimasMigraciones: {
  cuando: string | null;
  fallos: Array<{ sql: string; error: string }>;
} = { cuando: null, fallos: [] };

export async function runAutoMigrations(): Promise<void> {
  if (!pool) {
    logger.warn("[AutoMigrate] Pool no disponible, omitiendo migraciones");
    return;
  }
  logger.info("[AutoMigrate] Verificando columnas de la base de datos...");
  ultimasMigraciones.fallos = [];
  for (const sql of MIGRATIONS) {
    try {
      await pool.query(`SET lock_timeout = '5s'`);
      await pool.query(`SET statement_timeout = '10s'`);
      await pool.query(sql);
    } catch (err: any) {
      // Se sigue adelante --una migracion caida no puede dejar sin servicio a
      // los clientes-- pero el fallo YA NO desaparece: queda anotado y sale
      // por el /health, que es donde se puede ver desde afuera.
      ultimasMigraciones.fallos.push({ sql: String(sql).slice(0, 120), error: String(err?.message || err) });
      logger.error({ err, sql }, "[AutoMigrate] Error ejecutando migración");
    }
  }
  ultimasMigraciones.cuando = new Date().toISOString();
  if (ultimasMigraciones.fallos.length > 0) {
    logger.error(
      { fallos: ultimasMigraciones.fallos.length },
      "[AutoMigrate] TERMINO CON FALLOS -- hay funcionalidad que va a reventar en runtime",
    );
  }
  logger.info("[AutoMigrate] Migraciones completadas");
}

/**
 * Cuales de las tablas esperadas NO existen en la base.
 *
 * Una sola consulta a information_schema, con timeout: esto lo llama el
 * /health, que tiene que contestar rapido o no sirve como sonda.
 */
export async function tablasFaltantes(): Promise<string[] | null> {
  if (!pool || TABLAS_ESPERADAS.length === 0) return null;
  try {
    await pool.query(`SET statement_timeout = '3s'`);
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [TABLAS_ESPERADAS],
    );
    const existentes = new Set(rows.map((r: any) => String(r.table_name).toLowerCase()));
    return TABLAS_ESPERADAS.filter((t) => !existentes.has(t));
  } catch {
    // No se pudo preguntar. Devolver [] diria "no falta ninguna", que es una
    // afirmacion que no se puede sostener: null significa "no se sabe".
    return null;
  }
}
