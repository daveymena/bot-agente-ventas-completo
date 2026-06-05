# 🤖 Cómo Acceder a los Modelos - Guía Completa

## 🎯 Resumen Rápido

**3 formas de acceder a los modelos gratuitos:**

1. **Chat Interactivo** (más fácil) → `python chat_interactivo.py`
2. **Desde tu código Python** → `from opencode_cli_wrapper import OpenCodeCLI`
3. **Comando directo** → `opencode run --model <modelo> "mensaje"`

## 📋 Requisito Previo: Configurar OpenCode Zen

**Solo necesitas hacer esto UNA VEZ:**

### Paso 1: Obtener API Key de Zen (Gratis)

1. Ve a https://opencode.ai
2. Regístrate (gratis)
3. Ve a tu perfil/settings
4. Copia tu API key de Zen

### Paso 2: Configurar en OpenCode

```bash
# Abrir OpenCode
opencode

# Dentro de OpenCode, ejecutar estos comandos:
/connect
# Seleccionar: "OpenCode Zen"
# Pegar tu API key

/models
# Seleccionar: opencode/deepseek-v4-flash-free
```

### Paso 3: Verificar

```bash
# Salir de OpenCode (Ctrl+C o escribir /exit)

# Probar desde terminal
opencode run --model opencode/deepseek-v4-flash-free "Hola"

# Deberías ver una respuesta
```

## 🚀 Método 1: Chat Interactivo (Recomendado para Empezar)

### Ejecutar

```bash
python chat_interactivo.py
```

### Usar

```
╔══════════════════════════════════════════════════════════════╗
║          Chat Interactivo con OpenCode (Gratis)              ║
╚══════════════════════════════════════════════════════════════╝

🔌 Inicializando OpenCode...
✅ Listo para chatear!

Tú: ¿Cuánto es 2+2?
🤖 Bot: 4

Tú: Explica qué es recursión
🤖 Bot: La recursión es una técnica de programación...

Tú: salir
👋 ¡Hasta luego!
```

**Ventajas:**
- ✅ Más fácil para probar
- ✅ No necesitas escribir código
- ✅ Ideal para experimentar

## 💻 Método 2: Desde tu Código Python

### Código Básico

```python
from opencode_cli_wrapper import OpenCodeCLI

# Crear cliente
client = OpenCodeCLI("opencode.cmd")  # Windows
# client = OpenCodeCLI("opencode")    # Linux/Mac

# Hacer pregunta
respuesta = client.chat("¿Qué es Python?")
print(respuesta)
```

### Acceder a Modelos Específicos

#### Modelo por Defecto (DeepSeek V4 Flash)

```python
from opencode_cli_wrapper import OpenCodeCLI

client = OpenCodeCLI("opencode.cmd")

# Usa DeepSeek V4 Flash automáticamente
respuesta = client.chat("Hola mundo")
print(respuesta)
```

#### Cambiar de Modelo

```python
from opencode_cli_wrapper import OpenCodeCLI

client = OpenCodeCLI("opencode.cmd")

# Usar Qwen 3.6 Plus (mejor para código)
respuesta = client.chat(
    "Genera una función Python que ordene una lista",
    model="opencode/qwen3.6-plus-free"
)
print(respuesta)

# Usar Minimax M2.5 (mejor para conversación)
respuesta = client.chat(
    "Cuéntame un chiste",
    model="opencode/minimax-m2.5-free"
)
print(respuesta)

# Usar Nemotron 3 Super (mejor para análisis)
respuesta = client.chat(
    "Analiza este código: def f(x): return x*2",
    model="opencode/nemotron-3-super-free"
)
print(respuesta)
```

#### Configurar Modelo por Defecto

```python
from opencode_cli_wrapper import OpenCodeCLI

# Usar Qwen como modelo por defecto
client = OpenCodeCLI(
    opencode_path="opencode.cmd",
    default_model="opencode/qwen3.6-plus-free"
)

# Ahora todas las llamadas usan Qwen
respuesta = client.chat("Hola")  # Usa Qwen
```

### Métodos Disponibles

#### 1. `chat()` - Chat Simple

```python
# Básico
respuesta = client.chat("Tu pregunta")

# Con modelo específico
respuesta = client.chat(
    "Tu pregunta",
    model="opencode/qwen3.6-plus-free"
)

# Con timeout personalizado
respuesta = client.chat(
    "Pregunta compleja",
    timeout=180  # 3 minutos
)
```

#### 2. `generate_code()` - Generar Código

```python
codigo = client.generate_code(
    description="Función que valida emails",
    language="Python"
)
print(codigo)

# Con modelo específico
codigo = client.generate_code(
    description="Clase para manejar usuarios",
    language="Python",
    model="opencode/qwen3.6-plus-free"  # Mejor para código
)
```

#### 3. `explain_code()` - Explicar Código

```python
codigo = "def fib(n): return n if n<=1 else fib(n-1)+fib(n-2)"
explicacion = client.explain_code(codigo)
print(explicacion)
```

#### 4. `chat_conversation()` - Chat con Contexto

```python
messages = [
    {"role": "user", "content": "Mi nombre es Juan"},
    {"role": "assistant", "content": "Hola Juan"},
    {"role": "user", "content": "¿Cuál es mi nombre?"}
]

respuesta = client.chat_conversation(messages)
print(respuesta)  # Output: Tu nombre es Juan
```

#### 5. `chat_with_file()` - Chat con Archivo

```python
respuesta = client.chat_with_file(
    message="Resume este código",
    file_path="mi_script.py"
)
print(respuesta)
```

## 🔧 Método 3: Comando Directo (Terminal)

### Uso Básico

```bash
# Con modelo por defecto
opencode run "¿Cuánto es 2+2?"

# Con modelo específico
opencode run --model opencode/deepseek-v4-flash-free "Hola"
```

### Ejemplos

```bash
# Pregunta simple
opencode run --model opencode/deepseek-v4-flash-free "¿Qué es Python?"

# Generar código
opencode run --model opencode/qwen3.6-plus-free "Genera una función que ordene listas"

# Conversación
opencode run --model opencode/minimax-m2.5-free "Cuéntame sobre IA"

# Análisis
opencode run --model opencode/nemotron-3-super-free "Analiza: def f(x): return x*2"
```

## 📊 Modelos Disponibles

### Modelos Gratuitos

| Modelo | ID | Mejor Para | Velocidad |
|--------|-----|-----------|-----------|
| **DeepSeek V4 Flash** | `opencode/deepseek-v4-flash-free` | Uso general | ⭐⭐⭐⭐⭐ |
| **Qwen 3.6 Plus** | `opencode/qwen3.6-plus-free` | Código, técnico | ⭐⭐⭐⭐ |
| **Minimax M2.5** | `opencode/minimax-m2.5-free` | Conversación | ⭐⭐⭐⭐ |
| **Nemotron 3 Super** | `opencode/nemotron-3-super-free` | Análisis profundo | ⭐⭐⭐ |

### Ver Todos los Modelos

```bash
# Listar todos los modelos disponibles
opencode models

# Filtrar solo modelos gratuitos
opencode models | grep "free"
```

## 🎯 Casos de Uso por Modelo

### DeepSeek V4 Flash (Por Defecto)

**Mejor para**: Respuestas rápidas, uso general

```python
client = OpenCodeCLI("opencode.cmd")

# Preguntas generales
client.chat("¿Qué es Python?")

# Cálculos simples
client.chat("¿Cuánto es 15 * 23?")

# Explicaciones breves
client.chat("Explica qué es una variable")
```

### Qwen 3.6 Plus

**Mejor para**: Generación de código, análisis técnico

```python
# Generar código
client.chat(
    "Crea una clase Python para manejar usuarios con CRUD",
    model="opencode/qwen3.6-plus-free"
)

# Refactorizar código
client.chat(
    "Refactoriza este código: [tu código]",
    model="opencode/qwen3.6-plus-free"
)

# Debugging
client.chat(
    "¿Por qué este código da error? [tu código]",
    model="opencode/qwen3.6-plus-free"
)
```

### Minimax M2.5

**Mejor para**: Conversación natural, creatividad

```python
# Conversación
client.chat(
    "Cuéntame sobre la historia de la programación",
    model="opencode/minimax-m2.5-free"
)

# Creatividad
client.chat(
    "Escribe un poema sobre Python",
    model="opencode/minimax-m2.5-free"
)

# Explicaciones detalladas
client.chat(
    "Explica machine learning como si tuviera 5 años",
    model="opencode/minimax-m2.5-free"
)
```

### Nemotron 3 Super

**Mejor para**: Análisis profundo, razonamiento complejo

```python
# Análisis de código
client.chat(
    "Analiza la complejidad de este algoritmo: [código]",
    model="opencode/nemotron-3-super-free"
)

# Comparaciones
client.chat(
    "Compara Python vs JavaScript para backend",
    model="opencode/nemotron-3-super-free"
)

# Arquitectura
client.chat(
    "Diseña la arquitectura de un sistema de chat",
    model="opencode/nemotron-3-super-free"
)
```

## 🔄 Cambiar Entre Modelos Dinámicamente

```python
from opencode_cli_wrapper import OpenCodeCLI

client = OpenCodeCLI("opencode.cmd")

# Usar diferentes modelos según la tarea
def procesar_tarea(tarea, contenido):
    if tarea == "codigo":
        return client.chat(contenido, model="opencode/qwen3.6-plus-free")
    elif tarea == "conversacion":
        return client.chat(contenido, model="opencode/minimax-m2.5-free")
    elif tarea == "analisis":
        return client.chat(contenido, model="opencode/nemotron-3-super-free")
    else:
        return client.chat(contenido)  # DeepSeek por defecto

# Uso
print(procesar_tarea("codigo", "Genera una función de fibonacci"))
print(procesar_tarea("conversacion", "Cuéntame un chiste"))
print(procesar_tarea("analisis", "Analiza este algoritmo"))
```

## 🐛 Solución de Problemas

### Error: "Model not found"

**Causa**: El modelo no está disponible o mal escrito

**Solución**:
```bash
# Ver modelos disponibles
opencode models

# Verificar que el modelo existe
opencode models | grep "deepseek"
```

### Error: "Rate limit exceeded"

**Causa**: Has excedido el límite de uso gratuito

**Solución**:
- Espera unos minutos
- Los modelos gratuitos tienen límites
- Considera OpenCode Go ($10/mes) para más uso

### Respuestas Lentas

**Solución**:
```python
# Usar modelo más rápido
client.chat("Pregunta", model="opencode/deepseek-v4-flash-free")

# O aumentar timeout
client.chat("Pregunta compleja", timeout=180)
```

## 📚 Recursos Adicionales

- **Documentación completa**: `README.md`
- **Instalación**: `INSTALACION.md`
- **Integración**: `INTEGRACION.md`
- **Acceso rápido**: `ACCESO_RAPIDO.md`

## 🎉 ¡Listo!

Ahora sabes cómo acceder a todos los modelos. Empieza con:

```bash
# Probar chat interactivo
python chat_interactivo.py

# O desde tu código
python -c "from opencode_cli_wrapper import OpenCodeCLI; print(OpenCodeCLI('opencode.cmd').chat('Hola'))"
```

---

**¿Preguntas?** Consulta la documentación o abre un issue en GitHub.
