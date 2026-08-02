-- Agregar columnas nuevas al schema de tenants
-- Este script es idempotente (puede ejecutarse múltiples veces sin errores)

-- Agregar columna isAdmin si no existe
ALTER TABLE tenants ADD COLUMN is_admin INTEGER DEFAULT 0 NOT NULL;

-- Agregar columna facebookIntegration si no existe
ALTER TABLE tenants ADD COLUMN facebook_integration TEXT;

-- Agregar columna emailConfig si no existe
ALTER TABLE tenants ADD COLUMN email_config TEXT;

-- Agregar columna apiKeys si no existe
ALTER TABLE tenants ADD COLUMN api_keys TEXT;

-- Actualizar tenant 1 como admin
UPDATE tenants SET is_admin = 1 WHERE id = 1;

-- Verificar cambios
SELECT id, email, name, is_admin FROM tenants WHERE id = 1;
