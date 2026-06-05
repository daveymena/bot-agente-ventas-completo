-- =============================================================================
--  Pagos manuales / transferencias (consignaciones)
--  Crea tabla payments y agrega columnas de pago a conversations y leads
-- =============================================================================

-- ── Tabla de pagos ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                  SERIAL PRIMARY KEY,
  tenant_id           INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id     INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
  lead_id             INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  product_id          INTEGER REFERENCES products(id) ON DELETE SET NULL,

  amount              NUMERIC(12, 2) NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'COP',

  method              TEXT NOT NULL,                                -- nequi | daviplata | transferencia | mercadopago | paypal | efectivo | otro
  status              TEXT NOT NULL DEFAULT 'pending',              -- pending | confirmed | rejected | partial | refunded
  payment_status      TEXT,                                         -- approved | pending | rejected  (estado de la pasarela)

  proof_received      BOOLEAN DEFAULT false,
  proof_url           TEXT,
  bank_reference      TEXT,
  payer_account       TEXT,
  payer_name          TEXT,
  payer_email         TEXT,
  payer_phone         TEXT,

  verification_source TEXT,                                         -- webhook | email_bank | manual | whatsapp_image | self_declared
  verified_at         TIMESTAMP WITH TIME ZONE,
  verified_by         TEXT,                                         -- user id o 'system'

  notes               TEXT,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ── Índices para búsquedas frecuentes ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payments_conversation ON payments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_payments_lead         ON payments(lead_id);
CREATE INDEX IF NOT EXISTS idx_payments_status       ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_tenant       ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_bank_ref     ON payments(bank_reference)
  WHERE bank_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_method       ON payments(method);

-- ── Columnas de pago en conversations ───────────────────────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS payment_status  TEXT,
  ADD COLUMN IF NOT EXISTS payment_method  TEXT,
  ADD COLUMN IF NOT EXISTS payment_amount  NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS paid_at         TIMESTAMP WITH TIME ZONE;

-- ── Columnas de pago en leads ────────────────────────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS payment_status       TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS lifetime_value       NUMERIC(12, 2) DEFAULT 0;

-- ── Comentarios ─────────────────────────────────────────────────────────────
 COMMENT ON TABLE  payments                   IS 'Pagos de productos (no suscripciones) — incluye consignaciones manuales';
 COMMENT ON COLUMN payments.bank_reference    IS 'Número de referencia de la transferencia bancaria para matching automático';
 COMMENT ON COLUMN payments.verification_source IS 'Origen de la verificación del pago';
 COMMENT ON COLUMN payments.verification_source IS 'Si fue self_declared o webhook';

 COMMIT ON COLUMN conversations.payment_status IS 'Estado de pago de la conversación';
 COMMENT ON COLUMN leads.payment_status       IS 'Estado de pago del lead';
 COMMENT ON COLUMN leads.lifetime_value       IS 'Valor total pagado por este lead';
