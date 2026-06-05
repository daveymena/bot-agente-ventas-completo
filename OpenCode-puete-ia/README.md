# 🚀 OpenCode Free Models Wrapper

Wrapper de Python para usar los **modelos gratuitos de OpenCode** (DeepSeek V4, Qwen, Minimax, etc.) desde tus propias aplicaciones.

## ✨ Características

- ✅ **100% Funcional** - Todos los tests pasan
- ✅ **Modelos Gratuitos** - DeepSeek V4 Flash, Qwen 3.6+, Minimax M2.5, etc.
- ✅ **Fácil de Usar** - API simple en Python
- ✅ **Sin API Keys** - Usa tu instalación local de OpenCode
- ✅ **Múltiples Modelos** - Cambia entre modelos fácilmente

## 📋 Requisitos

1. **OpenCode instalado** (https://opencode.ai)
2. **Python 3.7+**
3. **Windows, Linux o Mac**

## 🚀 Instalación Rápida

### 1. Instalar OpenCode (si no lo tienes)

**Windows:**
```powershell
# Descargar e instalar desde https://opencode.ai
# O usar npm:
npm install -g @opencode-ai/cli
```

**Linux/Mac:**
```bash
curl -fsSL https://opencode.ai/install.sh | sh
```

### 2. Clonar este Repositorio

```bash
git clone https://github.com/gavimosquera3-netizen/OpenCode-ia-puetne.git
cd OpenCode-ia-puetne
```

### 3. Verificar Instalación

```bash
# Verificar que OpenCode funciona
opencode --version

# Listar modelos disponibles
opencode models
```

## 💡 Uso Básico

### Ejemplo Simple

```python
from opencode_cli_wrapper import OpenCodeCLI

# Crear cliente
client = OpenCodeCLI("opencode.cmd")  # Windows
# client = OpenCodeCLI("opencode")    # Linux/Mac

# Hacer una pregunta
respuesta = client.chat("¿Cuánto es 2+2?")
print(respuesta)  # Output: 4
```

### Chat Interactivo

```bash
python chat_interactivo.py
```

### Ejemplos Completos

```bash
python opencode_cli_wrapper.py
```

## 📚 API Completa

### Inicializar Cliente

```python
from opencode_cli_wrapper import OpenCodeCLI

# Configuración básica
client = OpenCodeCLI("opencode.cmd")  # Windows
client = OpenCodeCLI("opencode")      # Linux/Mac

# Con modelo personalizado
client = OpenCodeCLI(
    opencode_path="opencode.cmd",
    default_model="opencode/qwen3.6-plus-free"
)
```

### Métodos Disponibles

#### 1. `chat()` - Chat Simple

```python
respuesta = client.chat("Explica qué es recursión")
print(respuesta)

# Con modelo específico
respuesta = client.chat(
    "Hola mundo",
    model="opencode/minimax-m2.5-free"
)
```

#### 2. `chat_conversation()` - Chat con Contexto

```python
messages = [
    {"role": "user", "content": "Mi nombre es Juan"},
    {"role": "assistant", "content": "Hola Juan"},
    {"role": "user", "content": "¿Cuál es mi nombre?"}
]

respuesta = client.chat_conversation(messages)
print(respuesta)  # Output: Tu nombre es Juan
```

#### 3. `generate_code()` - Generar Código

```python
codigo = client.generate_code(
    description="Recibe una lista de números y retorna solo los pares",
    language="Python"
)
print(codigo)
```

#### 4. `explain_code()` - Explicar Código

```python
codigo = "def fib(n): return n if n<=1 else fib(n-1)+fib(n-2)"
explicacion = client.explain_code(codigo)
print(explicacion)
```

#### 5. `chat_with_file()` - Chat con Archivo

```python
respuesta = client.chat_with_file(
    message="Resume este código",
    file_path="mi_script.py"
)
print(respuesta)
```

## 🎯 Casos de Uso

### 1. Chatbot Simple

```python
from opencode_cli_wrapper import OpenCodeCLI

client = OpenCodeCLI("opencode.cmd")

while True:
    pregunta = input("Tú: ")
    if pregunta.lower() == "salir":
        break
    
    respuesta = client.chat(pregunta)
    print(f"Bot: {respuesta}")
```

### 2. Generador de Documentación

```python
from opencode_cli_wrapper import OpenCodeCLI
import os

client = OpenCodeCLI("opencode.cmd")

# Documentar todos los archivos .py
for archivo in os.listdir("."):
    if archivo.endswith(".py"):
        with open(archivo) as f:
            codigo = f.read()
        
        docs = client.chat(f"Documenta este código: {codigo}")
        
        with open(f"{archivo}.md", "w") as f:
            f.write(docs)
```

### 3. Asistente de Código

```python
from opencode_cli_wrapper import OpenCodeCLI

client = OpenCodeCLI("opencode.cmd")

# Generar función
codigo = client.generate_code(
    "Función que valida emails",
    "Python"
)

# Generar tests
tests = client.generate_code(
    f"Tests unitarios para: {codigo}",
    "Python"
)

print("Código:", codigo)
print("Tests:", tests)
```

### 4. Integración en Flask API

```python
from flask import Flask, request, jsonify
from opencode_cli_wrapper import OpenCodeCLI

app = Flask(__name__)
client = OpenCodeCLI("opencode.cmd")

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    mensaje = data.get('message')
    
    respuesta = client.chat(mensaje)
    
    return jsonify({
        'response': respuesta
    })

if __name__ == '__main__':
    app.run(port=5000)
```

## 🔧 Modelos Disponibles

### Modelos Gratuitos

```python
# DeepSeek V4 Flash (por defecto)
client.chat("Hola", model="opencode/deepseek-v4-flash-free")

# Qwen 3.6 Plus
client.chat("Hola", model="opencode/qwen3.6-plus-free")

# Minimax M2.5
client.chat("Hola", model="opencode/minimax-m2.5-free")

# Nemotron 3 Super
client.chat("Hola", model="opencode/nemotron-3-super-free")
```

### Listar Todos los Modelos

```bash
opencode models
```

## ⚙️ Configuración Avanzada

### Timeout Personalizado

```python
# Timeout de 60 segundos
respuesta = client.chat("Pregunta compleja", timeout=60)
```

### Directorio de Trabajo

```python
# Ejecutar en directorio específico
respuesta = client.chat(
    "Analiza los archivos aquí",
    cwd="/ruta/a/proyecto"
)
```

### Manejo de Errores

```python
try:
    respuesta = client.chat("Tu pregunta")
    print(respuesta)
except Exception as e:
    print(f"Error: {e}")
```

## 🐛 Solución de Problemas

### Error: "OpenCode no encontrado"

**Solución:**
```bash
# Verificar instalación
opencode --version

# Si no está instalado:
# Windows: Descargar de https://opencode.ai
# Linux/Mac: curl -fsSL https://opencode.ai/install.sh | sh
```

### Error: "You must provide a message"

**Causa:** Mensaje vacío o mal formateado

**Solución:**
```python
# ❌ Mal
client.chat("")

# ✅ Bien
client.chat("Tu mensaje aquí")
```

### Error: Timeout

**Solución:**
```python
# Aumentar timeout
respuesta = client.chat("Pregunta", timeout=180)
```

### Respuestas Lentas

**Causa:** Modelo gratuito con límites

**Soluciones:**
1. Usar modelo más rápido: `opencode/deepseek-v4-flash-free`
2. Preguntas más cortas
3. Considerar OpenCode Go ($10/mes)

## 📊 Comparación con Alternativas

| Característica | Este Wrapper | OpenAI API | Ollama Local |
|----------------|--------------|------------|--------------|
| **Costo** | ✅ Gratis | ❌ Pago | ✅ Gratis |
| **Setup** | ⭐⭐⭐⭐⭐ Fácil | ⭐⭐⭐⭐ Fácil | ⭐⭐⭐ Media |
| **Velocidad** | ⭐⭐⭐⭐ Buena | ⭐⭐⭐⭐⭐ Excelente | ⭐⭐⭐ Variable |
| **Límites** | ⚠️ Sí (gratis) | ⚠️ Por pago | ✅ Sin límites |
| **Offline** | ❌ No | ❌ No | ✅ Sí |

## 🔐 Privacidad y Seguridad

- ✅ **Local First**: Usa tu instalación local de OpenCode
- ✅ **Sin API Keys**: No necesitas claves de terceros
- ⚠️ **Conexión a Internet**: Los modelos gratuitos requieren conexión
- ⚠️ **Límites de Uso**: Los modelos gratuitos tienen límites

## 📝 Licencia

MIT License - Uso libre para proyectos personales y comerciales

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama (`git checkout -b feature/mejora`)
3. Commit tus cambios (`git commit -am 'Agrega mejora'`)
4. Push a la rama (`git push origin feature/mejora`)
5. Abre un Pull Request

## � Soporte

- **Issues**: Abre un issue en GitHub
- **Documentación**: Lee `INSTRUCCIONES_COMPLETAS.md`
- **OpenCode**: https://opencode.ai/docs

## 🎉 Créditos

- **OpenCode**: https://opencode.ai
- **DeepSeek**: https://deepseek.com
- **Modelos**: Qwen, Minimax, Nemotron

## 📈 Roadmap

- [ ] Soporte para streaming de respuestas
- [ ] Cache de respuestas
- [ ] Rate limiting automático
- [ ] Integración con LangChain
- [ ] API REST opcional
- [ ] Interfaz web

---

**¿Preguntas?** Abre un issue o consulta la documentación completa.

**¿Te gusta el proyecto?** Dale una ⭐ en GitHub!
