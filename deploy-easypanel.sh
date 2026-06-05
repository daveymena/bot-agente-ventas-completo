#!/bin/bash
# EasyPanel Deployment Script
# Despliegue del proyecto en EasyPanel con PostgreSQL

set -e

echo "🚀 INICIANDO DEPLiegue en EasyPanel"
echo "=================================="

# Variables de entorno (debe configurarse en EasyPanel)
DATABASE_URL="${DATABASE_URL:-postgres://postgres:6715320Dvd@79.143.187.160:5432/tecnovariedades-db?sslmode=disable}"
NODE_ENV="${NODE_ENV:-production}"
PORT="${PORT:-3002}"
API_VERSION="${API_VERSION:-v1}"

echo "📦 Configuración de entorno:"
echo "   DATABASE_URL: $DATABASE_URL"
echo "   NODE_ENV: $NODE_ENV"
echo "   PORT: $PORT"
echo ""

# Paso 1: Clonar o actualizar el código
echo "📝 Paso 1: Actualizando código..."
git fetch origin
git checkout main
git pull origin main

# Paso 2: Instalar dependencias
echo "📦 Paso 2: Instalando dependencias..."
pnpm install --frozen-lockfile

# Paso 3: Compile el backend
echo "🔨 Paso 3: Compilando backend..."
cd artifacts/api-server
pnpm run build
cd ../..

# Paso 4: Compile el frontend
echo "🎨 Paso 4: Compilando frontend..."
cd artifacts/ventas-pro
pnpm run build
cd ../..

# Paso 5: Verificar conexión a base de datos
echo "🗄️ Paso 5: Verificando conexión a PostgreSQL..."
node -e "
const { Pool } = require('pg');
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL || '$DATABASE_URL',
  ssl: { rejectUnauthorized: false }
});
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Error conectando a PostgreSQL:', err.message);
    process.exit(1);
  }
  console.log('✅ PostgreSQL connection successful');
  console.log('   Server time:', res.rows[0].now);
  pool.end();
});
"

# Paso 6: Ejecutar migraciones si existen
echo "迁移 Step 6: Ejecutar migraciones..."
# Aquí se pueden agregar migraciones con Drizzle or Prisma

# Paso 7: Iniciar el servidor
echo "🚀 Paso 7: Iniciando servidor en puerto $PORT..."
node artifacts/api-server/dist/index.mjs

echo ""
echo "✅ SERVIDOR LISTO EN EasyPanel"
echo "   URL: http://localhost:$PORT"
echo "   API: http://localhost:$PORT/api"
echo ""
echo "💡 Configurar en EasyPanel:"
echo "   - PORT=$PORT"
echo "   - NODE_ENV=production"
echo "   - DATABASE_URL (PostgreSQL connection string)"
echo "   - Variables de SMTP para emails"
echo "   - API Keys de GitHub, Copilot, etc."
