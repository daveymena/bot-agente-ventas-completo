-- Agregar campo de integración con WooCommerce
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS woocommerce_integration JSONB DEFAULT NULL;

-- Comentario para documentar el campo
COMMENT ON COLUMN tenants.woocommerce_integration IS 'Configuración de integración con WooCommerce: enabled, storeUrl, consumerKey, consumerSecret, syncProducts, autoCreateOrders, syncInterval, lastSync, webhookSecret';
