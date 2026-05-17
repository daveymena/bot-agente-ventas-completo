# 🚀 Acceso Rápido - Cómo Usar los Modelos

## 📦 Instalación en 3 Pasos

### 1. Clonar el Repositorio

```bash
git clone https://github.com/gavimosquera3-netizen/OpenCode-ia-puetne.git
cd OpenCode-ia-puetne
```

### 2. Instalar OpenCode (si no lo tienes)

**Windows:**
```powershell
# Descargar de https://opencode.ai
# O instalar con npm:
npm install -g @opencode-ai/cli
```

**Linux/Mac:**
```bash
curl -fsSL https://opencode.ai/install.sh | sh
```

### 3. Verificar

```bash
opencode --version
python --version  # Debe ser 3.7+
```

## 🎯 Uso Inmediato

### Opción 1: Chat Interactivo (Más Fácil)

```bash
python chat_interactivo.py
```

Luego simplemente escribe tus preguntas:
```
Tú: ¿Cuánto es 2+2?
🤖 Bot: 4

Tú: Explica qué es recursión
🤖 Bot: [Explicación detallada...]
```

### Opción 2: Desde tu Código Python

```python
from opencode_cli_wrapper import OpenCodeCLI

# Windows
client = OpenCodeCLI("opencode.cmd")

# Linux/Mac
# client = OpenCodeCLI("opencode")

# Hacer una pregunta
respuesta = client.chat("¿Qué es Python?")
print(respuesta)
```

## 🤖 Modelos Disponibles (GRATIS)

### Modelo por Defecto
```python
# DeepSeek V4 Flash (rápido y gratis)
client = OpenCodeCLI("opencode.cmd")
respuesta = client.chat("Hola")
```

### Cambiar de Modelo

```python
# Qwen 3.6 Plus (muy bueno para código)
respuesta = client.chat(
    "Genera una función Python",
    model="opencode/qwen3.6-plus-free"
)

# Minimax M2.5 (bueno para conversación)
respuesta = client.chat(
    "Cuéntame un chiste",
    model="opencode/minimax-m2.5-free"
)

# Nemotron 3 Super (bueno para análisis)
respuesta = client.chat(
    "Analiza este código",
    model="opencode/nemotron-3-super-free"
)
```

### Ver Todos los Modelos

```bash
opencode models
```

## 📝 Ejemplos Rápidos

### 1. Pregunta Simple

```python
from opencode_cli_wrapper import OpenCodeCLI

client = OpenCodeCLI("opencode.cmd")
respuesta = client.chat("¿Cuánto es 2+2?")
print(respuesta)  # Output: 4
```

### 2. Generar Código

```python
from opencode_cli_wrapper import OpenCodeCLI

client = OpenCodeCLI("opencode.cmd")

codigo = client.generate_code(
    description="Función que valida emails",
    language="Python"
)

print(codigo)
```

### 3. Explicar Código

```python
from opencode_cli_wrapper import OpenCodeCLI

client = OpenCodeCLI("opencode.cmd")

codigo = "def fib(n): return n if n<=1 else fib(n-1)+fib(n-2)"
explicacion = client.explain_code(codigo)

print(explicacion)
```

### 4. Conversación con Contexto

```python
from opencode_cli_wrapper import OpenCodeCLI

client = OpenCodeCLI("opencode.cmd")

messages = [
    {"role": "user", "content": "Mi nombre es Juan"},
    {"role": "assistant", "content": "Hola Juan"},
    {"role": "user", "content": "¿Cuál es mi nombre?"}
]

respuesta = client.chat_conversation(messages)
print(respuesta)  # Output: Tu nombre es Juan
```

## 🔧 Configuración de Modelos

### Primera Vez: Configurar OpenCode Zen

Si es tu primera vez, necesitas configurar OpenCode Zen (gratis):

```bash
# 1. Abrir OpenCode
opencode

# 2. Dentro de OpenCode, ejecutar:
/connect

# 3. Seleccionar "OpenCode Zen"
# 4. Pegar tu API key (obtener gratis en opencode.ai)

# 5. Seleccionar modelo
/models

# 6. Elegir uno de los modelos gratuitos:
#    - opencode/deepseek-v4-flash-free
#    - opencode/qwen3.6-plus-free
#    - opencode/minimax-m2.5-free
```

### Verificar Configuración

```bash
# Ver modelos configurados
opencode models

# Probar manualmente
opencode run --model opencode/deepseek-v4-flash-free "Hola"
```

## 🎨 Casos de Uso Comunes

### Chatbot Simple

```python
from opencode_cli_wrapper import OpenCodeCLI

client = OpenCodeCLI("opencode.cmd")

print("Chatbot iniciado. Escribe 'salir' para terminar.")

while True:
    pregunta = input("Tú: ")
    if pregunta.lower() == "salir":
        break
    
    respuesta = client.chat(pregunta)
    print(f"Bot: {respuesta}\n")
```

### Asistente de Código

```python
from opencode_cli_wrapper import OpenCodeCLI

client = OpenCodeCLI("opencode.cmd")

# Generar función
print("Generando función...")
codigo = client.generate_code(
    "Función que ordena una lista de números",
    "Python"
)
print(codigo)

# Explicar función
print("\nExplicando función...")
explicacion = client.explain_code(codigo)
print(explicacion)
```

### Documentador Automático

```python
from opencode_cli_wrapper import OpenCodeCLI
import os

client = OpenCodeCLI("opencode.cmd")

# Documentar archivo
archivo = "mi_script.py"
with open(archivo) as f:
    codigo = f.read()

docs = client.chat(f"Genera documentación para: {codigo}")

# Guardar documentación
with open(f"{archivo}.md", "w") as f:
    f.write(docs)

print(f"Documentación guardada en {archivo}.md")
```

## 🌐 Integración en Proyectos

### Flask API

```python
from flask import Flask, request, jsonify
from opencode_cli_wrapper import OpenCodeCLI

app = Flask(__name__)
client = OpenCodeCLI("opencode.cmd")

@app.route('/chat', methods=['POST'])
def chat():
    mensaje = request.json.get('message')
    respuesta = client.chat(mensaje)
    return jsonify({'response': respuesta})

if __name__ == '__main__':
    app.run(port=5000)
```

Usar:
```bash
curl -X POST http://localhost:5000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hola"}'
```

## 📊 Comparación de Modelos

| Modelo | Velocidad | Calidad | Mejor Para |
|--------|-----------|---------|------------|
| **deepseek-v4-flash-free** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Uso general, rápido |
| **qwen3.6-plus-free** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Código, técnico |
| **minimax-m2.5-free** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Conversación |
| **nemotron-3-super-free** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Análisis profundo |

## 🐛 Solución Rápida de Problemas

### Error: "opencode: command not found"

```bash
# Verificar instalación
where opencode  # Windows
which opencode  # Linux/Mac

# Si no está instalado:
# Windows: Descargar de https://opencode.ai
# Linux/Mac: curl -fsSL https://opencode.ai/install.sh | sh
```

### Error: "ModuleNotFoundError"

```bash
# Asegúrate de estar en el directorio correcto
cd OpenCode-ia-puetne

# Verificar que el archivo existe
ls opencode_cli_wrapper.py  # Linux/Mac
dir opencode_cli_wrapper.py  # Windows
```

### Error: "You must provide a message"

```python
# ❌ Mal
client.chat("")

# ✅ Bien
client.chat("Tu mensaje aquí")
```

### Respuestas Lentas

```python
# Aumentar timeout
respuesta = client.chat("Pregunta compleja", timeout=180)

# O usar modelo más rápido
respuesta = client.chat(
    "Pregunta",
    model="opencode/deepseek-v4-flash-free"
)
```

## 📚 Archivos Importantes

- **`opencode_cli_wrapper.py`** - Biblioteca principal ⭐
- **`chat_interactivo.py`** - Chat interactivo
- **`README.md`** - Documentación completa
- **`INSTALACION.md`** - Guía de instalación
- **`INTEGRACION.md`** - Guía de integración

## 🎯 Próximos Pasos

1. **Prueba el chat interactivo**: `python chat_interactivo.py`
2. **Lee los ejemplos**: `python opencode_cli_wrapper.py`
3. **Integra en tu proyecto**: Ver `INTEGRACION.md`
4. **Explora modelos**: `opencode models`

## 💡 Tips

### Tip 1: Usa el Modelo Correcto

```python
# Para código: Qwen
client.chat("Genera código", model="opencode/qwen3.6-plus-free")

# Para conversación: Minimax
client.chat("Cuéntame algo", model="opencode/minimax-m2.5-free")

# Para velocidad: DeepSeek (default)
client.chat("Respuesta rápida")
```

### Tip 2: Maneja Timeouts

```python
# Para preguntas complejas
respuesta = client.chat("Pregunta difícil", timeout=120)
```

### Tip 3: Cachea Respuestas

```python
from functools import lru_cache

@lru_cache(maxsize=100)
def chat_cached(mensaje):
    return client.chat(mensaje)
```

## 🆘 Ayuda

- **Documentación completa**: `README.md`
- **Instalación**: `INSTALACION.md`
- **Integración**: `INTEGRACION.md`
- **Issues**: https://github.com/gavimosquera3-netizen/OpenCode-ia-puetne/issues

## 🎉 ¡Listo!

Ya puedes usar IA gratis en tus proyectos. Empieza con:

```bash
python chat_interactivo.py
```

O desde tu código:

```python
from opencode_cli_wrapper import OpenCodeCLI

client = OpenCodeCLI("opencode.cmd")
print(client.chat("Hola mundo"))
```

---

**¿Preguntas?** Abre un issue en GitHub o consulta la documentación completa.
