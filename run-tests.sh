#!/bin/bash

echo "🧪 INICIANDO TESTS DE AUTENTICACIÓN"
echo "=================================="
echo ""

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test Suite 1: Backend Auth Tests
echo -e "${YELLOW}[1/4]${NC} Backend Authentication Tests..."
npx vitest run artifacts/api-server/src/routes/auth.test.ts --reporter=verbose

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backend tests PASSED${NC}"
else
    echo -e "${RED}❌ Backend tests FAILED${NC}"
fi

echo ""

# Test Suite 2: Frontend Auth Tests
echo -e "${YELLOW}[2/4]${NC} Frontend Authentication Tests..."
npx vitest run artifacts/ventas-pro/src/pages/auth.test.tsx --reporter=verbose

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Frontend tests PASSED${NC}"
else
    echo -e "${RED}❌ Frontend tests FAILED${NC}"
fi

echo ""

# Test Suite 3: E2E Tests
echo -e "${YELLOW}[3/4]${NC} E2E Authentication Flows..."
npx vitest run artifacts/api-server/src/tests/e2e.auth.test.ts --reporter=verbose

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ E2E tests PASSED${NC}"
else
    echo -e "${RED}❌ E2E tests FAILED${NC}"
fi

echo ""

# Test Suite 4: Coverage
echo -e "${YELLOW}[4/4]${NC} Test Coverage Report..."
npx vitest run --coverage

echo ""
echo "=================================="
echo -e "${GREEN}✅ ALL TEST SUITES COMPLETED${NC}"
