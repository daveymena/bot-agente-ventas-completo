#!/bin/bash
# Script de instalación para OpenCode Bridge

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║           OpenCode Bridge - Instalación Automática          ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para imprimir con color
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "ℹ️  $1"
}

# Verificar si OpenCode está instalado
echo "🔍 Verificando OpenCode..."
if command -v opencode &> /dev/null; then
    print_success "OpenCode está instalado"
    opencode --version
else
    print_warning "OpenCode no está instalado"
    echo ""
    echo "Para instalar OpenCode:"
    echo "  curl -fsSL https://opencode.ai/install.sh | sh"
    echo ""
    read -p "¿Quieres instalar OpenCode ahora? (s/n): " install_opencode
    
    if [ "$install_opencode" = "s" ] || [ "$install_opencode" = "S" ]; then
        echo "📦 Instalando OpenCode..."
        curl -fsSL https://opencode.ai/install.sh | sh
        print_success "OpenCode instalado"
    else
        print_error "OpenCode es necesario para continuar"
        exit 1
    fi
fi

echo ""

# Verificar Python
echo "🔍 Verificando Python..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    print_success "Python está instalado: $PYTHON_VERSION"
else
    print_error "Python 3 no está instalado"
    echo "Instala Python 3.8+ desde: https://www.python.org/downloads/"
    exit 1
fi

echo ""

# Instalar dependencias Python
echo "📦 Instalando dependencias Python..."
if pip3 install -r requirements.txt; then
    print_success "Dependencias Python instaladas"
else
    print_error "Error instalando dependencias Python"
    exit 1
fi

echo ""

# Verificar Node.js (opcional)
echo "🔍 Verificando Node.js (opcional)..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js está instalado: $NODE_VERSION"
    
    echo "📦 Instalando dependencias Node.js..."
    if npm install; then
        print_success "Dependencias Node.js instaladas"
    else
        print_warning "Error instalando dependencias Node.js (opcional)"
    fi
else
    print_warning "Node.js no está instalado (opcional)"
    echo "Si quieres usar los clientes JavaScript, instala Node.js desde:"
    echo "https://nodejs.org/"
fi

echo ""

# Hacer scripts ejecutables
echo "🔧 Configurando permisos..."
chmod +x method1-server/client.py
chmod +x method1-server/test_connection.py
chmod +x method2-proxy/proxy_server.py
chmod +x examples/*.py
print_success "Permisos configurados"

echo ""

# Verificar configuración de OpenCode
echo "🔍 Verificando configuración de OpenCode..."
if [ -d "$HOME/.config/opencode" ]; then
    print_success "Directorio de configuración encontrado"
else
    print_warning "Directorio de configuración no encontrado"
    echo "Ejecuta 'opencode' para crear la configuración inicial"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║                  ✅ Instalación Completada                  ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

print_info "Próximos pasos:"
echo ""
echo "1️⃣  Configurar OpenCode con modelo gratuito:"
echo "    opencode"
echo "    /connect  # Seleccionar 'OpenCode Zen'"
echo "    /models   # Seleccionar 'deepseek/deepseek-v4-flash'"
echo ""
echo "2️⃣  Iniciar OpenCode en modo servidor:"
echo "    opencode serve"
echo ""
echo "3️⃣  Probar la conexión (en otra terminal):"
echo "    python3 method1-server/test_connection.py"
echo ""
echo "4️⃣  Probar ejemplos:"
echo "    python3 examples/chatbot_simple.py"
echo "    python3 examples/generador_codigo.py"
echo ""
echo "📚 Documentación completa: README.md y GUIA_RAPIDA.md"
echo ""
