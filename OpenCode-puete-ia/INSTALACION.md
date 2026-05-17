# 📦 Guía de Instalación Completa

Esta guía te llevará paso a paso para instalar y configurar el wrapper de OpenCode en tu sistema.

## 🎯 Requisitos del Sistema

- **Sistema Operativo**: Windows 10/11, Linux, o macOS
- **Python**: 3.7 o superior
- **Espacio en Disco**: ~500 MB para OpenCode
- **Internet**: Requerido para usar modelos gratuitos

## 📋 Paso 1: Instalar OpenCode

### Windows

#### Opción A: Instalador Oficial (Recomendado)

1. Ve a https://opencode.ai
2. Descarga el instalador para Windows
3. Ejecuta el instalador
4. Sigue las instrucciones en pantalla

#### Opción B: Via npm

```powershell
# Instalar Node.js primero si no lo tienes
# Descargar de: https://nodejs.org

# Instalar OpenCode
npm install -g @opencode-ai/cli
```

#### Verificar Instalación

```powershell
# Abrir PowerShell o CMD
opencode --version

# Deberías ver algo como: 1.15.3
```

### Linux

```bash
# Instalar OpenCode
curl -fsSL https://opencode.ai/install.sh | sh

# Agregar al PATH (si es necesario)
export PATH="$HOME/.opencode/bin:$PATH"

# Agregar a .bashrc o .zshrc para hacerlo permanente
echo 'export PATH="$HOME/.opencode/bin:$PATH"' >> ~/.bashrc

# Verificar
opencode --version
```

### macOS

```bash
# Instalar OpenCode
curl -fsSL https://opencode.ai/install.sh | sh

# Verificar
opencode --version
```

## 📋 Paso 2: Configurar OpenCode

### Conectar a OpenCode Zen (Modelos Gratuitos)

1. **Crear cuenta en OpenCode Zen**:
   - Ve a https://opencode.ai
   - Regístrate (gratis)
   - Obtén tu API key de Zen

2. **Configurar en OpenCode**:

```bash
# Abrir OpenCode
opencode

# Dentro de OpenCode, ejecutar:
/connect

# Seleccionar "OpenCode Zen"
# Pegar tu API key cuando te lo pida
```

3. **Seleccionar modelo gratuito**:

```bash
# Dentro de OpenCode:
/models

# Seleccionar uno de estos modelos gratuitos:
# - opencode/deepseek-v4-flash-free
# - opencode/qwen3.6-plus-free
# - opencode/minimax-m2.5-free
# - opencode/nemotron-3-super-free
```

4. **Probar**:

```bash
# Dentro de OpenCode, escribe:
Hola, ¿cómo estás?

# Deberías recibir una respuesta del modelo
```

## 📋 Paso 3: Instalar el Wrapper

### Opción A: Clonar desde Git

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/opencode-wrapper.git
cd opencode-wrapper

# No hay dependencias externas necesarias!
# El wrapper solo usa la biblioteca estándar de Python
```

### Opción B: Descargar ZIP

1. Descarga el ZIP del repositorio
2. Extrae en tu carpeta de proyectos
3. Navega a la carpeta

### Verificar Archivos

Deberías tener estos archivos:

```
opencode-wrapper/
├── opencode_cli_wrapper.py    ← Archivo principal
├── chat_interactivo.py         ← Chat interactivo
├── README.md                   ← Documentación
├── INSTALACION.md              ← Esta guía
└── .gitignore                  ← Configuración Git
```

## 📋 Paso 4: Probar la Instalación

### Test Rápido

**Windows:**
```powershell
python -c "from opencode_cli_wrapper import OpenCodeCLI; client = OpenCodeCLI('opencode.cmd'); print(client.chat('Di solo: hola'))"
```

**Linux/Mac:**
```bash
python3 -c "from opencode_cli_wrapper import OpenCodeCLI; client = OpenCodeCLI('opencode'); print(client.chat('Di solo: hola'))"
```

**Resultado esperado:**
```
hola
```

### Test Completo

```bash
# Ejecutar todos los ejemplos
python opencode_cli_wrapper.py
```

**Resultado esperado:**
```
✅ Ejemplo 1: Chat Básico - FUNCIONA
✅ Ejemplo 2: Conversación con Contexto - FUNCIONA
✅ Ejemplo 3: Generar Código - FUNCIONA
✅ Ejemplo 4: Explicar Código - FUNCIONA
```

### Chat Interactivo

```bash
python chat_interactivo.py
```

## 🔧 Configuración Específica por Sistema

### Windows

**Ruta de OpenCode:**
```python
client = OpenCodeCLI("opencode.cmd")
```

**Ubicación típica:**
```
C:\Users\TuUsuario\AppData\Roaming\npm\opencode.cmd
```

### Linux

**Ruta de OpenCode:**
```python
client = OpenCodeCLI("opencode")
```

**Ubicación típica:**
```
~/.opencode/bin/opencode
```

### macOS

**Ruta de OpenCode:**
```python
client = OpenCodeCLI("opencode")
```

**Ubicación típica:**
```
~/.opencode/bin/opencode
```

## 🐛 Solución de Problemas Comunes

### Problema 1: "opencode: command not found"

**Causa:** OpenCode no está en el PATH

**Solución Windows:**
```powershell
# Buscar opencode
where opencode

# Si no aparece, reinstalar OpenCode
```

**Solución Linux/Mac:**
```bash
# Agregar al PATH
export PATH="$HOME/.opencode/bin:$PATH"

# Hacer permanente
echo 'export PATH="$HOME/.opencode/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Problema 2: "ModuleNotFoundError: No module named 'opencode_cli_wrapper'"

**Causa:** No estás en el directorio correcto

**Solución:**
```bash
# Navegar al directorio del proyecto
cd /ruta/a/opencode-wrapper

# Verificar que el archivo existe
ls opencode_cli_wrapper.py  # Linux/Mac
dir opencode_cli_wrapper.py  # Windows
```

### Problema 3: "You must provide a message or a command"

**Causa:** OpenCode no tiene modelo configurado

**Solución:**
```bash
# Configurar modelo
opencode
/models
# Seleccionar un modelo gratuito
```

### Problema 4: "Error: Timeout"

**Causa:** El modelo está tardando mucho

**Solución:**
```python
# Aumentar timeout
client.chat("Tu pregunta", timeout=180)
```

### Problema 5: Encoding en Windows

**Causa:** Problemas con caracteres especiales

**Solución:**
```python
# El wrapper ya maneja esto automáticamente
# Si tienes problemas, asegúrate de usar UTF-8
import sys
sys.stdout.reconfigure(encoding='utf-8')
```

## ✅ Verificación Final

Ejecuta este script para verificar que todo funciona:

```python
# test_instalacion.py
from opencode_cli_wrapper import OpenCodeCLI
import sys

print("🔍 Verificando instalación...")

# Detectar sistema operativo
import os
if os.name == 'nt':
    opencode_cmd = "opencode.cmd"
    print("✅ Sistema: Windows")
else:
    opencode_cmd = "opencode"
    print("✅ Sistema: Linux/Mac")

# Crear cliente
try:
    client = OpenCodeCLI(opencode_cmd)
    print("✅ Cliente creado")
except Exception as e:
    print(f"❌ Error creando cliente: {e}")
    sys.exit(1)

# Probar chat
try:
    respuesta = client.chat("Di solo: OK")
    print(f"✅ Chat funciona: {respuesta}")
except Exception as e:
    print(f"❌ Error en chat: {e}")
    sys.exit(1)

print("\n🎉 ¡Instalación exitosa! Todo funciona correctamente.")
```

Guarda como `test_instalacion.py` y ejecuta:

```bash
python test_instalacion.py
```

## 📚 Próximos Pasos

Una vez instalado:

1. **Lee el README.md** - Documentación completa de la API
2. **Prueba los ejemplos** - `python opencode_cli_wrapper.py`
3. **Crea tu primer proyecto** - Ver sección "Casos de Uso" en README
4. **Explora modelos** - `opencode models`

## 🆘 Ayuda Adicional

Si sigues teniendo problemas:

1. **Verifica versiones**:
   ```bash
   python --version  # Debe ser 3.7+
   opencode --version  # Debe estar instalado
   ```

2. **Revisa logs**:
   ```bash
   opencode run --print-logs "test"
   ```

3. **Consulta documentación**:
   - OpenCode: https://opencode.ai/docs
   - Este proyecto: README.md

4. **Abre un issue** en GitHub con:
   - Tu sistema operativo
   - Versión de Python
   - Versión de OpenCode
   - Mensaje de error completo

---

**¿Todo funcionando?** ¡Genial! Ahora puedes empezar a usar IA gratis en tus proyectos 🚀
