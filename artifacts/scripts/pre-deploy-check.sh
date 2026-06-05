#!/bin/bash

# Pre-deployment checks for EasyPanel
# Run this before deploying to catch common issues

set -e

echo "🔍 Ejecutando verificaciones pre-despliegue..."
echo ""

# Check 1: Node version
echo "✓ Verificando versión de Node..."
NODE_VERSION=$(node -v)
echo "  Node version: $NODE_VERSION"
if [[ ! $NODE_VERSION =~ v20 ]] && [[ ! $NODE_VERSION =~ v18 ]]; then
  echo "  ⚠️  Se recomienda Node 18+ (tienes $NODE_VERSION)"
fi
echo ""

# Check 2: pnpm installed
echo "✓ Verificando pnpm..."
if ! command -v pnpm &> /dev/null; then
  echo "  ❌ pnpm no está instalado"
  exit 1
fi
PNPM_VERSION=$(pnpm -v)
echo "  pnpm version: $PNPM_VERSION"
echo ""

# Check 3: Dependencies
echo "✓ Verificando dependencias..."
if [ ! -d "node_modules" ]; then
  echo "  Instalando dependencias..."
  pnpm install --frozen-lockfile
fi
echo "  ✓ Dependencias OK"
echo ""

# Check 4: Build API Server
echo "✓ Compilando API Server..."
if ! pnpm --filter @workspace/api-server run build; then
  echo "  ❌ Error compilando API Server"
  exit 1
fi
echo "  ✓ API Server compilado"
echo ""

# Check 5: Build Frontend
echo "✓ Compilando Frontend..."
if ! pnpm --filter @workspace/ventas-pro run build; then
  echo "  ❌ Error compilando Frontend"
  exit 1
fi
echo "  ✓ Frontend compilado"
echo ""

# Check 6: Verify build outputs
echo "✓ Verificando archivos de salida..."
if [ ! -f "artifacts/api-server/dist/index.mjs" ]; then
  echo "  ❌ API Server dist no encontrado"
  exit 1
fi
if [ ! -f "artifacts/ventas-pro/dist/public/index.html" ]; then
  echo "  ❌ Frontend dist no encontrado"
  exit 1
fi
echo "  ✓ Archivos de salida OK"
echo ""

# Check 7: Environment variables
echo "✓ Verificando variables de entorno..."
REQUIRED_VARS=(
  "DATABASE_URL"
  "NODE_ENV"
  "PORT"
)

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo "  ⚠️  Variable $var no está definida"
  else
    echo "  ✓ $var definida"
  fi
done
echo ""

# Check 8: Docker (if available)
if command -v docker &> /dev/null; then
  echo "✓ Verificando Docker..."
  DOCKER_VERSION=$(docker -v)
  echo "  $DOCKER_VERSION"
  
  echo "  Construyendo imagen Docker..."
  if docker build -t sofia-api:test . > /dev/null 2>&1; then
    echo "  ✓ Imagen Docker construida exitosamente"
  else
    echo "  ⚠️  Error construyendo imagen Docker (puede ser normal si no tienes Docker)"
  fi
else
  echo "⚠️  Docker no está instalado (necesario para EasyPanel)"
fi
echo ""

# Check 9: Git status
echo "✓ Verificando estado de Git..."
if [ -d ".git" ]; then
  UNCOMMITTED=$(git status --porcelain | wc -l)
  if [ $UNCOMMITTED -gt 0 ]; then
    echo "  ⚠️  Hay cambios sin commitear:"
    git status --short
  else
    echo "  ✓ Todos los cambios están commiteados"
  fi
else
  echo "  ⚠️  No es un repositorio Git"
fi
echo ""

echo "✅ Verificaciones completadas"
echo ""
echo "Próximos pasos:"
echo "1. Asegúrate de que todas las variables de entorno estén configuradas en EasyPanel"
echo "2. Verifica que la base de datos esté accesible"
echo "3. Haz push de los cambios: git push origin main"
echo "4. En EasyPanel, haz click en 'Deploy'"
echo ""
