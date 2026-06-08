import { config } from "dotenv";
import path from "path";
import fs from "fs";

config({ path: path.resolve(process.cwd(), ".env") });

const useSqlite = process.env.USE_SQLITE === "true";

let db: any;
let pool: any = null;

if (useSqlite) {
  const initSqlJs = (await import("sql.js")).default;
  const { drizzle } = await import("drizzle-orm/sql-js");
  const SQL = await initSqlJs({
    locateFile: (file: string) => path.resolve(process.cwd(), "artifacts/api-server/dist", file),
  });
  const dbPath = path.resolve(process.cwd(), "data/ventas.db");
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  let sqliteDb: any;
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    sqliteDb = new SQL.Database(buffer);
  } else {
    sqliteDb = new SQL.Database();
  }
  const schema = await import("./schema");
  db = drizzle(sqliteDb, { schema });

  // Inicializar tablas para SQLite si no existen
  const existingTables = sqliteDb.exec("SELECT name FROM sqlite_master WHERE type='table'");
  if (existingTables.length === 0 || existingTables[0].values.length === 0) {
    sqliteDb.run("PRAGMA foreign_keys = OFF");
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS tenants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        slug TEXT NOT NULL UNIQUE,
        domain TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        plan TEXT NOT NULL DEFAULT 'basic',
        brand_name TEXT NOT NULL,
        brand_logo TEXT,
        brand_colors TEXT,
        brand_theme TEXT,
        brand_social TEXT,
        agent_personality TEXT NOT NULL DEFAULT 'professional',
        agent_prompt TEXT,
        agent_name TEXT NOT NULL DEFAULT 'Asistente Virtual',
        contact_email TEXT,
        contact_phone TEXT,
        support_email TEXT,
        payment_methods TEXT,
        woocommerce_integration TEXT,
        limits TEXT,
        settings TEXT,
        subscription_id TEXT,
        subscription_status TEXT,
        trial_ends_at TEXT,
        subscription_ends_at TEXT,
        metadata TEXT,
        email_verified INTEGER DEFAULT 0,
        email_verification_code TEXT,
        email_verification_expiry TEXT,
        password_reset_code TEXT,
        password_reset_expiry TEXT,
        two_factor_enabled INTEGER DEFAULT 0,
        two_factor_secret TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        tone TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'es',
        model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
        system_prompt TEXT NOT NULL,
        stages TEXT NOT NULL DEFAULT '[]',
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS product_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        color TEXT NOT NULL DEFAULT '#0ea5e9',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        price REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        sku TEXT,
        category_id INTEGER REFERENCES product_categories(id) ON DELETE SET NULL,
        category TEXT,
        kind TEXT NOT NULL DEFAULT 'digital',
        image_url TEXT,
        highlight TEXT,
        features TEXT,
        payment_link TEXT,
        delivery_link TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        stage TEXT NOT NULL DEFAULT 'new',
        value REAL NOT NULL DEFAULT 0,
        notes TEXT,
        source TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        contact_name TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        avatar_color TEXT NOT NULL DEFAULT '#10b981',
        last_message TEXT,
        last_message_at TEXT,
        unread_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ai',
        current_stage TEXT,
        agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
        lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        stage TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_name TEXT NOT NULL DEFAULT 'TecnoVariedades D&S',
        business_description TEXT NOT NULL DEFAULT '',
        timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
        working_hours_start TEXT NOT NULL DEFAULT '09:00',
        working_hours_end TEXT NOT NULL DEFAULT '18:00',
        auto_reply_enabled INTEGER NOT NULL DEFAULT 1,
        off_hours_message TEXT NOT NULL DEFAULT 'Gracias por escribirnos. Un asesor te responderá en horario de atención.',
        escalation_keywords TEXT NOT NULL DEFAULT '[]',
        ai_provider TEXT NOT NULL DEFAULT 'github',
        github_token TEXT,
        github_model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
        ollama_url TEXT,
        ollama_model TEXT NOT NULL DEFAULT 'hermes3:8b'
      )
    `);
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS payment_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        short_code TEXT NOT NULL UNIQUE,
        original_url TEXT NOT NULL,
        method TEXT NOT NULL,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        client_phone TEXT,
        clicks INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_click_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS follow_ups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
        contact_name TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        scheduled_for TEXT NOT NULL,
        follow_up_type TEXT NOT NULL DEFAULT 'check_in',
        message TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'medium',
        stage TEXT NOT NULL,
        last_score INTEGER DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS whatsapp_auth (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqliteDb.run(`
      CREATE TABLE IF NOT EXISTS activity_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    sqliteDb.run("PRAGMA foreign_keys = ON");

    // Seed datos por defecto si la tabla tenants está vacía
    const tenantCount = sqliteDb.exec("SELECT COUNT(*) as c FROM tenants");
    if (!tenantCount[0]?.values[0]?.[0]) {
      sqliteDb.run("INSERT INTO tenants (name, email, slug, brand_name) VALUES ('Deiner Mena', 'deinermena25@gmail.com', 'tecnovariedades', 'TecnoVariedades D&S')");
      sqliteDb.run(`INSERT INTO settings (business_name, business_description, ai_provider) VALUES (
        'TecnoVariedades D&S',
        'MegaPacks digitales con cursos premium en diseño, música, trading, idiomas, programación y más. Acceso de por vida por Google Drive.',
        'opencode'
      )`);
      sqliteDb.run(`INSERT INTO agents (tenant_id, name, role, tone, system_prompt, is_active) VALUES (
        1, 'Sofía', 'Directora de Ventas Élite', 'Profesional y cálido',
        'Eres Sofía, la Directora de Ventas Élite de TecnoVariedades.', 1
      )`);
      sqliteDb.run("INSERT INTO product_categories (name, icon, color) VALUES ('Música', '🎹', '#8b5cf6')");
      sqliteDb.run("INSERT INTO product_categories (name, icon, color) VALUES ('Diseño', '🎨', '#f59e0b')");
      sqliteDb.run("INSERT INTO product_categories (name, icon, color) VALUES ('Trading', '📈', '#10b981')");
      sqliteDb.run("INSERT INTO product_categories (name, icon, color) VALUES ('Idiomas', '🌎', '#3b82f6')");
      sqliteDb.run("INSERT INTO product_categories (name, icon, color) VALUES ('Programación', '💻', '#ef4444')");
      sqliteDb.run("INSERT INTO product_categories (name, icon, color) VALUES ('Marketing', '📊', '#ec4899')");
      sqliteDb.run("INSERT INTO product_categories (name, icon, color) VALUES ('Fitness', '💪', '#14b8a6')");
      sqliteDb.run("INSERT INTO product_categories (name, icon, color) VALUES ('Hacking', '🔒', '#dc2626')");
      sqliteDb.run("INSERT INTO product_categories (name, icon, color) VALUES ('Excel', '📗', '#22c55e')");
      sqliteDb.run(`INSERT INTO products (name, description, price, currency, category_id, category, highlight, is_active) VALUES
        ('Curso Completo de Piano', 'Aprende piano desde cero con nuestro método paso a paso. Incluye videos HD, partituras y ejercicios prácticos.', 45.00, 'USD', 1, 'Música', '🎹 Domina el piano desde tu casa', 1)`);
      sqliteDb.run(`INSERT INTO products (name, description, price, currency, category_id, category, highlight, is_active) VALUES
        ('MasterClass Guitarra Eléctrica y Acústica', 'Curso completo de guitarra para todos los niveles. Técnicas, acordes, escalas y canciones.', 49.00, 'USD', 1, 'Música', '🎸 Conviértete en guitarrista profesional', 1)`);
      sqliteDb.run(`INSERT INTO products (name, description, price, currency, category_id, category, highlight, is_active) VALUES
        ('Photoshop + Illustrator Pro', 'Domina el diseño gráfico con los dos software más poderosos. Ideal para principiantes y avanzados.', 39.00, 'USD', 2, 'Diseño', '🎨 Diseño profesional al alcance de todos', 1)`);
      sqliteDb.run(`INSERT INTO products (name, description, price, currency, category_id, category, highlight, is_active) VALUES
        ('Trading desde Cero hasta Experto', 'Aprende a invertir en Forex, acciones y criptomonedas. Estrategias probadas de traders profesionales.', 55.00, 'USD', 3, 'Trading', '📈 Genera ingresos desde casa haciendo trading', 1)`);
      sqliteDb.run(`INSERT INTO products (name, description, price, currency, category_id, category, highlight, is_active) VALUES
        ('Inglés Completo', 'Curso intensivo de inglés desde básico hasta avanzado. Gramática, conversación, listening y writing.', 35.00, 'USD', 4, 'Idiomas', '🌎 Habla inglés con fluidez', 1)`);
      sqliteDb.run(`INSERT INTO products (name, description, price, currency, category_id, category, highlight, is_active) VALUES
        ('Programación Web Full Stack', 'Aprende HTML, CSS, JavaScript, React y Node.js. Conviértete en desarrollador web completo.', 59.00, 'USD', 5, 'Programación', '💻 Desarrolla sitios web completos', 1)`);
      sqliteDb.run(`INSERT INTO products (name, description, price, currency, category_id, category, highlight, is_active) VALUES
        ('Marketing Digital Completo', 'SEO, redes sociales, publicidad, email marketing y más. Todo lo que necesitas para vender online.', 42.00, 'USD', 6, 'Marketing', '📊 Haz crecer tu negocio digitalmente', 1)`);
      sqliteDb.run(`INSERT INTO products (name, description, price, currency, category_id, category, highlight, is_active) VALUES
        ('Fitness Total', 'Plan completo de entrenamiento y nutrición. Transforma tu cuerpo desde casa con rutinas guiadas.', 30.00, 'USD', 7, 'Fitness', '💪 Transforma tu cuerpo en 90 días', 1)`);
      sqliteDb.run(`INSERT INTO products (name, description, price, currency, category_id, category, highlight, is_active) VALUES
        ('Ciberseguridad y Hacking Ético', 'Aprende ciberseguridad desde cero. Protege sistemas y redes con técnicas profesionales.', 50.00, 'USD', 8, 'Hacking', '🔒 Conviértete en experto en seguridad informática', 1)`);
      sqliteDb.run(`INSERT INTO products (name, description, price, currency, category_id, category, highlight, is_active) VALUES
        ('Excel Avanzado y Power BI', 'Domina Excel desde nivel básico hasta avanzado con macros, tablas dinámicas y Power BI.', 25.00, 'USD', 9, 'Excel', '📗 Excel profesional para negocios', 1)`);
    }
  }

  const saveDb = () => {
    const data = sqliteDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  };
  setInterval(saveDb, 15000);
  process.on("exit", saveDb);
  process.on("SIGINT", () => { saveDb(); process.exit(0); });
  process.on("SIGTERM", () => { saveDb(); process.exit(0); });
} else {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
  }
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pg = await import("pg");
  const { Pool } = pg.default || pg;
  const schema = await import("./schema");
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
}

export { db, pool };
export * from "./schema";
