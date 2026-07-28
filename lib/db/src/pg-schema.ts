// Esquema de tablas de PostgreSQL (extraido de scripts/migrate.mjs).
// Se ejecuta al arrancar la app cuando USE_SQLITE=false, para crear las
// tablas automaticamente (idempotente: CREATE TABLE IF NOT EXISTS).

export const ALL_TABLES = [
  {
    name: 'tenants',
    sql: `
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        slug TEXT NOT NULL UNIQUE,
        domain TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        plan TEXT NOT NULL DEFAULT 'basic',
        brand_name TEXT NOT NULL,
        brand_logo TEXT,
        brand_colors JSONB,
        brand_theme TEXT,
        brand_social JSONB,
        agent_personality TEXT NOT NULL DEFAULT 'professional',
        agent_prompt TEXT,
        agent_name TEXT NOT NULL DEFAULT 'Asistente Virtual',
        contact_email TEXT,
        contact_phone TEXT,
        support_email TEXT,
        payment_methods JSONB,
        woocommerce_integration JSONB,
        limits JSONB,
        settings JSONB,
        subscription_id TEXT,
        subscription_status TEXT,
        trial_ends_at TIMESTAMPTZ,
        subscription_ends_at TIMESTAMPTZ,
        metadata JSONB,
        email_verified BOOLEAN DEFAULT false,
        email_verification_code TEXT,
        email_verification_expiry TIMESTAMPTZ,
        password_reset_code TEXT,
        password_reset_expiry TIMESTAMPTZ,
        two_factor_enabled BOOLEAN DEFAULT false,
        two_factor_secret TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'product_categories',
    sql: `
      CREATE TABLE IF NOT EXISTS product_categories (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'settings',
    sql: `
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        business_name TEXT NOT NULL DEFAULT 'Mi Negocio',
        business_description TEXT NOT NULL DEFAULT '',
        timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
        working_hours_start TEXT NOT NULL DEFAULT '09:00',
        working_hours_end TEXT NOT NULL DEFAULT '18:00',
        auto_reply_enabled BOOLEAN NOT NULL DEFAULT true,
        off_hours_message TEXT NOT NULL DEFAULT 'Gracias por escribirnos. Estamos fuera de horario laboral. Te responderemos en cuanto estemos disponibles.',
        escalation_keywords JSONB NOT NULL DEFAULT '[]',
        ai_provider TEXT NOT NULL DEFAULT 'github_copilot_internal',
        github_token TEXT,
        github_model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
        copilot_session_token TEXT,
        copilot_session_expires_at TEXT,
        nvidia_api_key TEXT,
        nvidia_model TEXT NOT NULL DEFAULT 'meta/llama-3.1-70b-instruct',
        ollama_url TEXT,
        ollama_model TEXT NOT NULL DEFAULT 'hermes3:8b',
        business_config JSONB NOT NULL DEFAULT '{}'
      )
    `
  },
  {
    name: 'activity_events',
    sql: `
      CREATE TABLE IF NOT EXISTS activity_events (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'whatsapp_auth',
    sql: `
      CREATE TABLE IF NOT EXISTS whatsapp_auth (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'agents',
    sql: `
      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        tone TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'es',
        model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
        system_prompt TEXT NOT NULL,
        stages JSONB NOT NULL DEFAULT '[]',
        metadata JSONB DEFAULT '{}',
        is_active BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
  },
  {
    name: 'leads',
    sql: `
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        stage TEXT NOT NULL DEFAULT 'new',
        value NUMERIC(12,2) NOT NULL DEFAULT 0,
        notes TEXT,
        source TEXT,
        payment_status TEXT,
        lifetime_value NUMERIC(12,2) DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'products',
    sql: `
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'stores',
    sql: `
      CREATE TABLE IF NOT EXISTS stores (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        theme JSON DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'store_categories',
    sql: `
      CREATE TABLE IF NOT EXISTS store_categories (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'architect_memory',
    sql: `
      CREATE TABLE IF NOT EXISTS architect_memory (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL DEFAULT 'default',
        memory_type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags JSONB NOT NULL DEFAULT '[]',
        metadata JSONB DEFAULT null,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
  },
  {
    name: 'personality_profiles',
    sql: `
      CREATE TABLE IF NOT EXISTS personality_profiles (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        agent_role TEXT NOT NULL,
        tone TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'es',
        formality TEXT NOT NULL DEFAULT 'tú',
        agent_type TEXT NOT NULL DEFAULT 'general',
        system_prompt_core TEXT NOT NULL,
        keywords JSONB NOT NULL DEFAULT '[]',
        brand_voice_overrides JSONB DEFAULT null,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `
  },
  {
    name: 'subscriptions',
    sql: `
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        plan TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        billing_cycle TEXT NOT NULL DEFAULT 'monthly',
        payment_method TEXT NOT NULL,
        payment_id TEXT,
        payment_status TEXT,
        amount DECIMAL(10,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        started_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        next_billing_date TIMESTAMPTZ,
        auto_renew BOOLEAN DEFAULT true,
        activation_token TEXT,
        token_sent_at TIMESTAMPTZ,
        activated_at TIMESTAMPTZ,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'conversations',
    sql: `
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        contact_name TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        avatar_color TEXT NOT NULL DEFAULT '#10b981',
        last_message TEXT,
        last_message_at TIMESTAMPTZ,
        unread_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ai',
        current_stage TEXT,
        channel TEXT DEFAULT 'whatsapp',
        agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
        lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
        payment_status TEXT,
        payment_method TEXT,
        payment_amount NUMERIC(12,2),
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'store_products',
    sql: `
      CREATE TABLE IF NOT EXISTS store_products (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        category_id INTEGER REFERENCES store_categories(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        price NUMERIC(12,2) NOT NULL,
        thumb_url TEXT,
        delivery_link TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'store_layouts',
    sql: `
      CREATE TABLE IF NOT EXISTS store_layouts (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
        layout_data JSONB NOT NULL DEFAULT '{}',
        version TEXT NOT NULL DEFAULT '1',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'payment_links',
    sql: `
      CREATE TABLE IF NOT EXISTS payment_links (
        id SERIAL PRIMARY KEY,
        short_code TEXT NOT NULL UNIQUE,
        original_url TEXT NOT NULL,
        method TEXT NOT NULL,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        client_phone TEXT,
        clicks INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        last_click_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'payment_transactions',
    sql: `
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id SERIAL PRIMARY KEY,
        subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        payment_method TEXT NOT NULL,
        payment_id TEXT NOT NULL,
        payment_status TEXT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        plan TEXT NOT NULL,
        billing_cycle TEXT NOT NULL,
        payer_email TEXT,
        payer_name TEXT,
        payer_id TEXT,
        webhook_data JSONB,
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'messages',
    sql: `
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        stage TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'follow_ups',
    sql: `
      CREATE TABLE IF NOT EXISTS follow_ups (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
        contact_name TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        scheduled_for TIMESTAMPTZ NOT NULL,
        follow_up_type TEXT NOT NULL DEFAULT 'check_in',
        message TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'medium',
        stage TEXT NOT NULL,
        last_score INTEGER DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        completed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'payments',
    sql: `
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
        lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        amount NUMERIC(12,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'COP',
        method TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        payment_status TEXT,
        proof_received BOOLEAN DEFAULT false,
        proof_url TEXT,
        bank_reference TEXT,
        payer_account TEXT,
        payer_name TEXT,
        payer_email TEXT,
        payer_phone TEXT,
        verification_source TEXT,
        verified_at TIMESTAMPTZ,
        verified_by TEXT,
        notes TEXT,
        metadata TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'response_analytics',
    sql: `
      CREATE TABLE IF NOT EXISTS response_analytics (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
        profile_id INTEGER,
        conversation_id INTEGER,
        message_id INTEGER,
        response_text TEXT NOT NULL,
        response_length INTEGER NOT NULL,
        had_card BOOLEAN NOT NULL DEFAULT false,
        card_product_id INTEGER,
        outcome TEXT,
        customer_message TEXT NOT NULL,
        sentiment_score INTEGER,
        response_time_ms INTEGER NOT NULL,
        metadata JSONB DEFAULT null,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'prompt_versions',
    sql: `
      CREATE TABLE IF NOT EXISTS prompt_versions (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
        profile_id INTEGER,
        previous_prompt TEXT NOT NULL,
        new_prompt TEXT NOT NULL,
        diff_summary TEXT NOT NULL,
        reason TEXT NOT NULL,
        performance_before JSONB DEFAULT null,
        performance_after JSONB DEFAULT null,
        applied_by TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  },
  {
    name: 'facebook_drafts',
    sql: `
      CREATE TABLE IF NOT EXISTS facebook_drafts (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_name TEXT NOT NULL,
        campaign_id TEXT,
        ad_set_id TEXT,
        ad_id TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        strategy JSONB,
        primary_text TEXT,
        headline TEXT,
        description TEXT,
        image_url TEXT,
        niche TEXT,
        budget INTEGER,
        fb_status TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  }
];
