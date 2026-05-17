# Método 1: OpenCode Server Mode

## 🎯 Descripción

Este método usa el comando `opencode serve` que expone una API REST HTTP nativa de OpenCode. Es el método más limpio y oficial.

## 📦 Cómo Funciona

1. OpenCode se ejecuta en modo servidor (`opencode serve`)
2. Expone una API REST en `http://localhost:4096` (puerto por defecto)
3. Tu aplicación hace peticiones HTTP a esta API
4. OpenCode procesa las peticiones usando sus modelos gratuitos

## 🚀 Configuración

### Paso 1: Iniciar OpenCode en Modo Servidor

```bash
# Iniciar servidor en puerto por defecto (4096)
opencode serve

# O especificar puerto personalizado
opencode serve --port 8080

# Con autenticación (opcional)
export OPENCODE_SERVER_PASSWORD="tu-password"
opencode serve
```

### Paso 2: Configurar el Modelo Gratuito

Antes de iniciar el servidor, asegúrate de tener configurado un modelo gratuito:

```bash
# Conectar a OpenCode Zen (si aún no lo has hecho)
opencode

# Dentro de OpenCode, ejecutar:
/connect
# Seleccionar "OpenCode Zen"
# Pegar tu API key de Zen

# Seleccionar modelo gratuito
/models
# Elegir: deepseek/deepseek-v4-flash (FREE)
```

### Paso 3: Usar el Cliente Python

```python
# Ver client.py para el código completo
from opencode_client import OpenCodeClient

client = OpenCodeClient(base_url="http://localhost:4096")

response = client.chat("Explica qué es recursión en Python")
print(response)
```

## 📁 Archivos

- `client.py` - Cliente Python para conectar con OpenCode Server
- `client.js` - Cliente Node.js alternativo
- `test_connection.py` - Script para probar la conexión
- `api_examples.py` - Ejemplos de uso avanzado

## 🔧 API Endpoints

OpenCode Server expone varios endpoints:

```
POST /api/chat
POST /api/prompt
GET /api/status
GET /api/models
POST /api/session/new
```

## ⚙️ Configuración Avanzada

### Archivo de Configuración

Crea `~/.config/opencode/config.json`:

```json
{
  "server": {
    "enabled": true,
    "port": 4096,
    "host": "localhost"
  },
  "model": "deepseek/deepseek-v4-flash",
  "provider": "zen"
}
```

## 🐛 Troubleshooting

**Problema**: "Connection refused"
- Solución: Verifica que `opencode serve` esté corriendo

**Problema**: "Model not found"
- Solución: Configura el modelo con `/models` antes de iniciar el servidor

**Problema**: "Rate limit exceeded"
- Solución: Los modelos gratuitos tienen límites, espera unos minutos
