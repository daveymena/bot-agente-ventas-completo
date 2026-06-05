-- Tabla de suscripciones para gestionar pagos de planes
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan TEXT NOT NULL, -- free, starter, professional, enterprise
  status TEXT NOT NULL DEFAULT 'pending', -- pending, active, cancelled, expired, failed
  billing_cycle TEXT NOT NULL DEFAULT 'monthly', -- monthly, annual
  
  -- Información de pago
  payment_method TEXT NOT NULL, -- mercadopago, paypal
  payment_id TEXT, -- ID de la transacción en el proveedor
  payment_status TEXT, -- approved, pending, rejected, refunded
  
  -- Montos
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  
  -- Fechas
  started_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  next_billing_date TIMESTAMP WITH TIME ZONE,
  
  -- Renovación automática
  auto_renew BOOLEAN DEFAULT true,
  
  -- Metadata adicional
  metadata JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Índices para mejorar rendimiento
CREATE INDEX idx_subscriptions_tenant_id ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_payment_id ON subscriptions(payment_id);
CREATE INDEX idx_subscriptions_expires_at ON subscriptions(expires_at);

-- Tabla de transacciones de pago
CREATE TABLE IF NOT EXISTS payment_transactions (
  id SERIAL PRIMARY KEY,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Información del pago
  payment_method TEXT NOT NULL, -- mercadopago, paypal
  payment_id TEXT NOT NULL, -- ID único del proveedor
  payment_status TEXT NOT NULL, -- approved, pending, rejected, refunded
  
  -- Montos
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  
  -- Detalles del producto
  plan TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  
  -- Información del pagador
  payer_email TEXT,
  payer_name TEXT,
  payer_id TEXT,
  
  -- Webhook data
  webhook_data JSONB,
  
  -- Fechas
  paid_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Índices
CREATE INDEX idx_payment_transactions_subscription_id ON payment_transactions(subscription_id);
CREATE INDEX idx_payment_transactions_tenant_id ON payment_transactions(tenant_id);
CREATE INDEX idx_payment_transactions_payment_id ON payment_transactions(payment_id);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(payment_status);

-- Comentarios
COMMENT ON TABLE subscriptions IS 'Gestión de suscripciones de planes SaaS';
COMMENT ON TABLE payment_transactions IS 'Registro de todas las transacciones de pago';
