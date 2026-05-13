#!/bin/bash

# Script para compilar todo el proyecto
# Ejecutar desde la raíz del proyecto

echo "🚀 Compilando proyecto completo..."
echo ""

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 1. Instalar dependencias
echo -e "${YELLOW}📦 Instalando dependencias...${NC}"
pnpm install
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Error instalando dependencias${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Dependencias instaladas${NC}"
echo ""

# 2. Compilar backend
echo -e "${YELLOW}🔧 Compilando backend...${NC}"
pnpm --filter @workspace/api-server run build
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Error compilando backend${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Backend compilado${NC}"
echo ""

# 3. Compilar frontend
echo -e "${YELLOW}🎨 Compilando frontend...${NC}"
export NODE_ENV=production
pnpm --filter @workspace/ventas-pro run build
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Error compilando frontend${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Frontend compilado${NC}"
echo ""

# 4. Verificar build
echo -e "${YELLOW}🔍 Verificando build...${NC}"
cd artifacts
chmod +x verify-build.sh
./verify-build.sh
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Verificación falló${NC}"
    cd ..
    exit 1
fi
cd ..

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ ¡Compilación completada exitosamente!${NC}"
echo ""
echo -e "${CYAN}Próximos pasos:${NC}"
echo "1. cd artifacts"
echo "2. docker build -t ventas-pro:latest ."
echo "3. docker push tu-registry/ventas-pro:latest"
echo "4. Desplegar en Easypanel"
