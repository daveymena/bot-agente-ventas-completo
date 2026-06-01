import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const DATABASE_URL = "postgres://posgrest:6715320Dvd.@35.254.218.190:5435/agente?sslmode=disable";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: false,
  connectionTimeoutMillis: 15000,
});

async function run() {
  const client = await pool.connect();
  console.log("✅ Conectado a PostgreSQL en Easypanel");

  try {
    // ── 1. CREAR TABLAS SI NO EXISTEN ─────────────────────────────────────────
    console.log("\n📋 Creando tablas si no existen...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        password_hash TEXT,
        slug TEXT NOT NULL UNIQUE,
        domain TEXT,
        status TEXT DEFAULT 'active',
        plan TEXT DEFAULT 'basic',
        brand_name TEXT NOT NULL,
        brand_logo TEXT,
        brand_colors TEXT,
        brand_theme TEXT,
        brand_social TEXT,
        agent_personality TEXT DEFAULT 'professional',
        agent_prompt TEXT,
        agent_name TEXT DEFAULT 'Asistente Virtual',
        contact_email TEXT,
        contact_phone TEXT,
        support_email TEXT,
        payment_methods TEXT,
        woocommerce_integration TEXT,
        limits TEXT,
        settings TEXT,
        subscription_id TEXT,
        subscription_status TEXT,
        trial_ends_at TIMESTAMPTZ,
        subscription_ends_at TIMESTAMPTZ,
        metadata TEXT,
        email_verified BOOLEAN DEFAULT false,
        email_verification_code TEXT,
        email_verification_expiry TIMESTAMPTZ,
        password_reset_code TEXT,
        password_reset_expiry TIMESTAMPTZ,
        two_factor_enabled BOOLEAN DEFAULT false,
        two_factor_secret TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("  ✅ Tabla tenants OK");

    await client.query(`
      CREATE TABLE IF NOT EXISTS product_categories (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("  ✅ Tabla product_categories OK");

    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        price NUMERIC(12,2) NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        sku TEXT,
        category_id INTEGER REFERENCES product_categories(id) ON DELETE SET NULL,
        category TEXT,
        kind TEXT NOT NULL DEFAULT 'digital',
        image_url TEXT,
        highlight TEXT,
        features TEXT[],
        payment_link TEXT,
        delivery_link TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        metadata TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("  ✅ Tabla products OK");

    await client.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        stage TEXT DEFAULT 'new',
        value NUMERIC(12,2) DEFAULT 0,
        notes TEXT,
        source TEXT,
        payment_status TEXT,
        lifetime_value NUMERIC(12,2) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("  ✅ Tabla leads OK");

    await client.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        tone TEXT NOT NULL,
        language TEXT DEFAULT 'es',
        model TEXT DEFAULT 'gpt-4o-mini',
        system_prompt TEXT NOT NULL,
        stages JSONB DEFAULT '[]',
        metadata JSONB,
        is_active BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("  ✅ Tabla agents OK");

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        contact_name TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        avatar_color TEXT DEFAULT '#10b981',
        last_message TEXT,
        last_message_at TIMESTAMPTZ,
        unread_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'ai',
        current_stage TEXT,
        agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
        lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
        payment_status TEXT,
        payment_method TEXT,
        payment_amount NUMERIC(12,2),
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("  ✅ Tabla conversations OK");

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        stage TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("  ✅ Tabla messages OK");

    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_events (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("  ✅ Tabla activity_events OK");

    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        business_name TEXT DEFAULT 'TecnoVariedades',
        business_description TEXT DEFAULT '',
        timezone TEXT DEFAULT 'America/Bogota',
        working_hours_start TEXT DEFAULT '09:00',
        working_hours_end TEXT DEFAULT '18:00',
        auto_reply_enabled BOOLEAN DEFAULT true,
        off_hours_message TEXT DEFAULT 'Gracias por escribirnos...',
        escalation_keywords TEXT DEFAULT '[]',
        ai_provider TEXT DEFAULT 'nvidia_nim_bridge',
        github_token TEXT,
        github_model TEXT DEFAULT 'gpt-4o-mini',
        nvidia_api_key TEXT,
        nvidia_model TEXT DEFAULT 'meta/llama-3.1-70b-instruct',
        ollama_url TEXT,
        ollama_model TEXT DEFAULT 'hermes3:8b',
        business_config JSONB DEFAULT '{}'
      )
    `);
    console.log("  ✅ Tabla settings OK");

    await client.query(`
      CREATE TABLE IF NOT EXISTS follow_ups (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
        lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
        contact_name TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        scheduled_for TIMESTAMPTZ NOT NULL,
        follow_up_type TEXT DEFAULT 'check_in',
        message TEXT NOT NULL,
        priority TEXT DEFAULT 'medium',
        stage TEXT NOT NULL,
        last_score INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        completed BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("  ✅ Tabla follow_ups OK");

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
        lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        amount NUMERIC(12,2) NOT NULL,
        currency TEXT DEFAULT 'COP',
        method TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        proof_received BOOLEAN DEFAULT false,
        proof_url TEXT,
        bank_reference TEXT,
        payer_name TEXT,
        payer_email TEXT,
        payer_phone TEXT,
        notes TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("  ✅ Tabla payments OK");

    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_links (
        id SERIAL PRIMARY KEY,
        short_code TEXT NOT NULL UNIQUE,
        original_url TEXT NOT NULL,
        method TEXT NOT NULL,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        client_phone TEXT,
        clicks INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        last_click_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("  ✅ Tabla payment_links OK");

    await client.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_auth (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log("  ✅ Tabla whatsapp_auth OK");

    // ── 2. TENANT POR DEFECTO ─────────────────────────────────────────────────
    console.log("\n👤 Verificando tenant por defecto...");
    const tenantCheck = await client.query("SELECT id FROM tenants WHERE id = 1");
    if (tenantCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO tenants (id, name, email, slug, brand_name, status, plan)
        VALUES (1, 'TecnoVariedades', 'deinermena25@gmail.com', 'tecnovariedades', 'TecnoVariedades', 'active', 'premium')
        ON CONFLICT (id) DO NOTHING
      `);
      console.log("  ✅ Tenant por defecto creado");
    } else {
      console.log("  ✅ Tenant por defecto ya existe");
    }

    // ── 3. CATEGORÍA POR DEFECTO ──────────────────────────────────────────────
    console.log("\n📁 Verificando categoría por defecto...");
    const catCheck = await client.query("SELECT id FROM product_categories WHERE tenant_id = 1 LIMIT 1");
    let catId = 1;
    if (catCheck.rows.length === 0) {
      const catInsert = await client.query(`
        INSERT INTO product_categories (tenant_id, name) VALUES (1, 'Megapacks Digitales') RETURNING id
      `);
      catId = catInsert.rows[0].id;
      console.log(`  ✅ Categoría creada (ID: ${catId})`);
    } else {
      catId = catCheck.rows[0].id;
      console.log(`  ✅ Categoría existente (ID: ${catId})`);
    }

    // ── 4. LIMPIAR E INSERTAR LOS 81 PRODUCTOS ────────────────────────────────
    const jsonPath = path.resolve(__dirname, "products-full.json");
    console.log(`\n📄 Leyendo productos desde: ${jsonPath}`);
    const rawData = fs.readFileSync(jsonPath, "utf-8");
    const productsData = JSON.parse(rawData);
    console.log(`📊 Total de productos: ${productsData.length}`);

    // Limpiar productos anteriores del tenant 1
    await client.query("DELETE FROM products WHERE tenant_id = 1");
    console.log("🗑️  Productos anteriores eliminados");

    let inserted = 0;
    let errors = 0;

    for (const p of productsData) {
      try {
        await client.query(
          `INSERT INTO products 
            (tenant_id, name, description, price, currency, category_id, category, kind, image_url, delivery_link, features, is_active, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12)`,
          [
            1,
            p.name,
            p.description,
            p.price,
            p.currency || "USD",
            catId,
            p.category,
            p.kind || "digital",
            p.image_url || null,
            p.deliveryLink || null,
            p.features || [],
            JSON.stringify({ drive_folder_id: p.drive_folder_id || null }),
          ]
        );
        inserted++;
        if (inserted % 10 === 0) process.stdout.write(`   ✅ ${inserted}/${productsData.length}\n`);
      } catch (err) {
        errors++;
        console.error(`   ❌ Error en: ${p.name} — ${err.message}`);
      }
    }

    console.log(`\n✅ COMPLETADO: ${inserted} productos insertados, ${errors} errores`);

    // ── 5. SETTINGS POR DEFECTO ───────────────────────────────────────────────
    const settingsCheck = await client.query("SELECT id FROM settings LIMIT 1");
    if (settingsCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO settings (business_name, business_description, timezone)
        VALUES ('TecnoVariedades', 'Megapacks digitales de cursos y contenido premium', 'America/Bogota')
      `);
      console.log("✅ Settings por defecto creados");
    }

  } finally {
    client.release();
    await pool.end();
    console.log("\n🔒 Conexión cerrada.");
  }
}

run().catch((err) => {
  console.error("❌ Error fatal:", err.message);
  process.exit(1);
});
