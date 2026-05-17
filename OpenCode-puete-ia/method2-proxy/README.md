# Método 2: Proxy Interceptor

## 🎯 Descripción

Este método crea un proxy que intercepta las comunicaciones internas de OpenCode y las expone como una API compatible con OpenAI, permitiendo usar cualquier cliente que soporte el formato OpenAI API.

## 📦 Cómo Funciona

1. OpenCode se ejecuta normalmente (CLI o servidor)
2. El proxy intercepta las peticiones/respuestas
3. Transforma el formato a OpenAI-compatible
4. Tu aplicación usa cualquier SDK de OpenAI apuntando al proxy

## 🚀 Configuración

### Paso 1: Configurar OpenCode

```bash
# Asegúrate de tener OpenCode configurado con modelo gratuito
opencode
/connect  # Conectar a Zen
/models   # Seleccionar deepseek/deepseek-v4-flash
```

### Paso 2: Iniciar el Proxy

```bash
# Con Python
python proxy_server.py --port 8000

# Con Node.js
node proxy_server.js --port 8000
```

### Paso 3: Usar desde tu Aplicación

```python
# Usa cualquier cliente OpenAI apuntando al proxy
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="dummy-key"  # No se necesita key real
)

response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[
        {"role": "user", "content": "Hola, explica recursión"}
    ]
)

print(response.choices[0].message.content)
```

## 🔧 Características

- ✅ Compatible con OpenAI API
- ✅ Soporta streaming
- ✅ Mantiene sesiones/contexto
- ✅ Funciona con cualquier SDK de OpenAI
- ✅ No requiere modificar tu código existente

## 📁 Archivos

- `proxy_server.py` - Servidor proxy en Python
- `proxy_server.js` - Servidor proxy en Node.js
- `config.json` - Configuración del proxy
- `test_proxy.py` - Tests del proxy

## ⚙️ Configuración Avanzada

### Archivo config.json

```json
{
  "proxy": {
    "port": 8000,
    "host": "0.0.0.0"
  },
  "opencode": {
    "server_url": "http://localhost:4096",
    "default_model": "deepseek/deepseek-v4-flash"
  },
  "logging": {
    "level": "INFO",
    "file": "proxy.log"
  }
}
```

## 🌐 Endpoints Disponibles

```
POST /v1/chat/completions
POST /v1/completions
GET /v1/models
```

## 💡 Casos de Uso

1. **Migración desde OpenAI**: Cambia solo la URL base
2. **Testing**: Prueba tu app sin gastar en API
3. **Desarrollo local**: Trabaja offline con modelos gratuitos
4. **Integración con herramientas**: LangChain, LlamaIndex, etc.

## 🐛 Troubleshooting

**Problema**: "Model not found"
- Solución: Verifica que el modelo esté configurado en OpenCode

**Problema**: "Proxy timeout"
- Solución: Aumenta el timeout en config.json

**Problema**: "Invalid API key"
- Solución: El proxy no valida keys, usa cualquier string
