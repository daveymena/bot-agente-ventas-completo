-- Agregar campo activation_token a subscriptions
ALTER TABLE subscriptions
ADD COLUMN activation_token TEXT UNIQUE,
ADD COLUMN token_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN activated_at TIMESTAMP WITH TIME ZONE;

-- Crear índice para búsqueda rápida por token
CREATE INDEX idx_subscriptions_activation_token ON subscriptions(activation_token);

-- Comentarios
COMMENT ON COLUMN subscriptions.activation_token IS 'Token único para activar la suscripción después del pago';
COMMENT ON COLUMN subscriptions.token_sent_at IS 'Fecha en que se envió el token por email';
COMMENT ON COLUMN subscriptions.activated_at IS 'Fecha en que se activó la suscripción con el token';
