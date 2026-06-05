-- Agrega columna metadata a messages para rastrear producto, intención y proveedor IA
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- Índice para búsquedas por productId en metadata
CREATE INDEX IF NOT EXISTS idx_messages_metadata_product_id
  ON messages ((metadata->>'productId'))
  WHERE metadata->>'productId' IS NOT NULL;
