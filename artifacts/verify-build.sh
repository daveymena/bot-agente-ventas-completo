#!/bin/bash

# Script de verificación del build para Easypanel
# Este script verifica que todo esté listo para desplegar

echo "🔍 Verificando build del proyecto..."
echo ""

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Contador de errores
ERRORS=0

# 1. Verificar que exista el directorio del frontend compilado
echo "1️⃣ Verificando frontend compilado..."
if [ -d "ventas-pro/dist/public" ]; then
    echo -e "${GREEN}✅ Directorio ventas-pro/dist/public existe${NC}"
    
    # Verificar archivos críticos
    if [ -f "ventas-pro/dist/public/index.html" ]; then
        echo -e "${GREEN}✅ index.html encontrado${NC}"
    else
        echo -e "${RED}❌ index.html NO encontrado${NC}"
        ERRORS=$((ERRORS + 1))
    fi
    
    if [ -d "ventas-pro/dist/public/assets" ]; then
        echo -e "${GREEN}✅ Directorio assets/ encontrado${NC}"
        ASSET_COUNT=$(ls -1 ventas-pro/dist/public/assets | wc -l)
        echo -e "${GREEN}   📦 $ASSET_COUNT archivos en assets/${NC}"
    else
        echo -e "${RED}❌ Directorio assets/ NO encontrado${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${RED}❌ Directorio ventas-pro/dist/public NO existe${NC}"
    echo -e "${YELLOW}💡 Ejecuta: pnpm --filter @workspace/ventas-pro run build${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# 2. Verificar que exista el backend compilado
echo "2️⃣ Verificando backend compilado..."
if [ -d "api-server/dist" ]; then
    echo -e "${GREEN}✅ Directorio api-server/dist existe${NC}"
    
    if [ -f "api-server/dist/index.mjs" ]; then
        echo -e "${GREEN}✅ index.mjs encontrado${NC}"
    else
        echo -e "${RED}❌ index.mjs NO encontrado${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${RED}❌ Directorio api-server/dist NO existe${NC}"
    echo -e "${YELLOW}💡 Ejecuta: pnpm --filter @workspace/api-server run build${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# 3. Verificar Dockerfile
echo "3️⃣ Verificando Dockerfile..."
if [ -f "Dockerfile" ]; then
    echo -e "${GREEN}✅ Dockerfile existe${NC}"
    
    # Verificar que tenga la línea correcta de copia del frontend
    if grep -q "COPY --from=builder /app/artifacts/ventas-pro/dist/public /app/artifacts/ventas-pro/dist/public" Dockerfile; then
        echo -e "${GREEN}✅ Dockerfile tiene la ruta correcta del frontend${NC}"
    else
        echo -e "${RED}❌ Dockerfile NO tiene la ruta correcta del frontend${NC}"
        echo -e "${YELLOW}💡 Verifica que la línea COPY del frontend sea correcta${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${RED}❌ Dockerfile NO existe${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# 4. Verificar package.json
echo "4️⃣ Verificando configuración de pnpm..."
if [ -f "../pnpm-workspace.yaml" ]; then
    echo -e "${GREEN}✅ pnpm-workspace.yaml existe${NC}"
else
    echo -e "${RED}❌ pnpm-workspace.yaml NO existe${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# 5. Verificar variables de entorno
echo "5️⃣ Verificando variables de entorno..."
if [ -f "api-server/.env" ]; then
    echo -e "${GREEN}✅ .env existe${NC}"
    
    # Verificar variables críticas
    if grep -q "NODE_ENV" api-server/.env; then
        echo -e "${GREEN}✅ NODE_ENV configurado${NC}"
    else
        echo -e "${YELLOW}⚠️  NODE_ENV no encontrado en .env${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  .env NO existe (puede estar en Easypanel)${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Resumen
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ ¡Todo listo para desplegar!${NC}"
    echo ""
    echo "Próximos pasos:"
    echo "1. docker build -t ventas-pro:latest ."
    echo "2. docker push tu-registry/ventas-pro:latest"
    echo "3. Desplegar en Easypanel"
    exit 0
else
    echo -e "${RED}❌ Se encontraron $ERRORS errores${NC}"
    echo ""
    echo "Por favor, corrige los errores antes de desplegar."
    exit 1
fi
