# 🚀 Guía Rápida - OpenCode Bridge

## ¿Qué hace este proyecto?

Te permite usar los **modelos gratuitos de OpenCode** (como DeepSeek V4) desde tus propias aplicaciones, sin necesidad de API keys ni pagos.

## 📋 Requisitos Previos

1. **OpenCode instalado**
   ```bash
   # Instalar OpenCode (si no lo tienes)
   curl -fsSL https://opencode.ai/install.sh | sh
   ```

2. **Configurar modelo gratuito en OpenCode**
   ```bash
   # Abrir OpenCode
   opencode
   
   # Dentro de OpenCode:
   /connect
   # Seleccionar "OpenCode Zen"
   # Pegar tu API key de Zen (gratis en opencode.ai)
   
   /models
   # Seleccionar: deepseek/deepseek-v4-flash (FREE)
   ```

## 🎯 Método Recomendado: Server Mode

### Paso 1: Iniciar OpenCode en modo servidor

```bash
# Terminal 1: Iniciar OpenCode Server
opencode serve
```

Deberías ver algo como:
```
✓ Server running on http://localhost:4096
```

### Paso 2: Instalar dependencias

```bash
# Python
pip install -r requirements.txt

# O Node.js
npm install
```

### Paso 3: Probar la conexión

```bash
# Con Python
python method1-server/client.py

# Con Node.js
node method1-server/client.js
```

## 💡 Ejemplo de Uso en tu Código

### Python

```python
from method1_server.client import OpenCodeClient

# Crear cliente
client = OpenCodeClient()

# Usar el modelo gratuito
response = client.chat("Explica qué es recursión en Python")
print(response)
```

### JavaScript

```javascript
const OpenCodeClient = require('./method1-server/client.js');

// Crear cliente
const client = new OpenCodeClient();

// Usar el modelo gratuito
const response = await client.chat("Explica qué es recursión en JavaScript");
console.log(response);
```

## 🌐 Método Alternativo: Proxy Compatible con OpenAI

Si quieres usar el formato de OpenAI API:

### Paso 1: Iniciar OpenCode Server

```bash
# Terminal 1
opencode serve
```

### Paso 2: Iniciar el Proxy

```bash
# Terminal 2
python method2-proxy/proxy_server.py
```

### Paso 3: Usar con cualquier cliente OpenAI

```python
from openai import OpenAI

# Apuntar al proxy local (¡sin API key real!)
client = OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="dummy"
)

response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[
        {"role": "user", "content": "Hola mundo"}
    ]
)

print(response.choices[0].message.content)
```

## 🔧 Troubleshooting

### Error: "Connection refused"

**Problema**: No se puede conectar al servidor OpenCode

**Solución**:
```bash
# Verifica que OpenCode Server esté corriendo
opencode serve

# En otra terminal, verifica que responda
curl http://localhost:4096/api/status
```

### Error: "Model not found"

**Problema**: El modelo no está configurado

**Solución**:
```bash
# Configura el modelo en OpenCode
opencode
/models
# Selecciona: deepseek/deepseek-v4-flash
```

### Error: "Rate limit exceeded"

**Problema**: Has excedido el límite gratuito

**Solución**: Los modelos gratuitos tienen límites. Espera unos minutos o considera OpenCode Go ($10/mes).

## 📚 Documentación Completa

- **Método 1 (Server)**: Ver `method1-server/README.md`
- **Método 2 (Proxy)**: Ver `method2-proxy/README.md`

## ⚠️ Notas Importantes

1. **Uso Personal**: Este proyecto es para uso educativo y personal
2. **Límites**: Los modelos gratuitos tienen límites de uso
3. **Términos**: Respeta los términos de servicio de OpenCode
4. **Comercial**: No uses esto para servicios comerciales sin autorización

## 🎉 ¡Listo!

Ahora puedes usar DeepSeek V4 y otros modelos gratuitos de OpenCode en tus propios proyectos sin pagar por API keys.

## 💬 Ejemplos de Uso Real

### Chatbot Simple

```python
from method1_server.client import OpenCodeClient

client = OpenCodeClient()
session_id = client.create_session()

while True:
    user_input = input("Tú: ")
    if user_input.lower() in ['salir', 'exit']:
        break
    
    response = client.chat(user_input, session_id=session_id)
    print(f"Bot: {response}")
```

### Generador de Código

```python
from method1_server.client import OpenCodeClient

client = OpenCodeClient()

prompt = """
Crea una función en Python que:
- Reciba una lista de números
- Retorne solo los números pares
- Use list comprehension
"""

code = client.chat(prompt)
print(code)
```

### Análisis de Texto

```python
from method1_server.client import OpenCodeClient

client = OpenCodeClient()

texto = "Tu texto largo aquí..."
analisis = client.chat(f"Analiza el siguiente texto y dame un resumen: {texto}")
print(analisis)
```

## 🚀 Próximos Pasos

1. Explora los ejemplos en cada carpeta de método
2. Adapta el código a tus necesidades
3. Crea tus propias aplicaciones con IA gratuita
4. ¡Comparte tus proyectos!
