-- =============================================================================
--  Business Config Portability
--  Adds businessConfig JSONB column to settings so any project/brand can
--  fully configure its bot without touching source code.
--  Keys stored in businessConfig (all optional):
--    transferNumber, transferOwner           — datos de transferencia/banco
--    businessNiche                            — nic Key para preset de voz de marca
--    brandVoiceConfig                         — overrides parciales del BrandVoice
--    paymentInfo                              — métodos de pago habilitados, links, etc.
--    deliveryInfo                             — override de info de entrega
--    guaranteeInfo                            — override de info de garantía
--    brandAgentName                           — sobrescribe el nombre del agente
--    greetingNew                              — plantilla de saludo nuevo
--    greetingReturn                           — plantilla de saludo de retorno
-- =============================================================================

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS business_config JSONB DEFAULT '{}'::jsonb;

-- ── Back-fill: migra los datos que existían en DEFAULT_TENANT (tenantManager.ts)
--     para el settings de tenant=1 que ya esté en producción.
UPDATE settings
SET business_config = jsonb_build_object(
  'transferNumber',    COALESCE(business_config->>'transferNumber',    '3136174267'),
  'transferOwner',     COALESCE(business_config->>'transferOwner',     'Deiner Mena'),
  'businessNiche',     COALESCE(business_config->>'businessNiche',     'digital_products'),
  'brandAgentName',    COALESCE(business_config->>'brandAgentName',    'Sofía'),
  'paymentInfo',       COALESCE(business_config->>'paymentInfo',        '{"nequi": {"number": "3136174267", "name": "Deiner Mena", "enabled": true}, "daviplata": {"number": "3136174267", "name": "Deiner Mena", "enabled": true}, "mercadopago": {"accessToken": "", "enabled": false}, "paypal": {"clientId": "", "clientSecret": "", "mode": "live", "enabled": false}}'),
  'deliveryInfo',       COALESCE(business_config->>'deliveryInfo',       '{"method": "Google Drive", "timeframe": "inmediato", "description": "La entrega es 100% digital. Una vez confirmado tu pago, recibes el enlace de Google Drive directamente por este chat. Acceso inmediato desde cualquier dispositivo."}'),
  'guaranteeInfo',     COALESCE(business_config->>'guaranteeInfo',      '{"days": 7, "description": "Tienes 7 días de garantía sin preguntas. Si por cualquier razón no estás satisfecho, te devolvemos el dinero completo sin complicaciones."}')
)
WHERE business_config = '{}'::jsonb OR business_config IS NULL;

-- ── Comment
COMMENT ON COLUMN settings.business_config IS 'Configuración específica del negocio — hace el sistema portable para cualquier proyecto. Incluye: transferNumber, transferOwner, businessNiche, brandVoiceConfig, paymentInfo, deliveryInfo, guaranteeInfo, brandAgentName.';
