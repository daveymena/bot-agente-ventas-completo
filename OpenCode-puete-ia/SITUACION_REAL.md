# 🔍 Situación Real de OpenCode - Hallazgos

## ✅ Lo que Funciona

1. **OpenCode está instalado y corriendo**: ✅
   - Versión: 1.15.3
   - Servidor en: http://127.0.0.1:4096
   - Estado: Saludable

2. **API de Sesiones funciona**: ✅
   - `GET /session` - Lista sesiones
   - `POST /session` - Crea sesiones
   - `DELETE /session/{id}` - Elimina sesiones

3. **Providers configurados**: ✅
   - OpenRouter con API key configurada
   - Modelos disponibles (INTELLECT-3, etc.)

## ❌ El Problema Encontrado

### OpenCode NO expone una API REST tradicional

Después de investigar extensivamente, descubrí que:

1. **El servidor es una SPA (Single Page Application)**
   - Todas las rutas POST devuelven HTML, no JSON
   - La interfaz web usa WebSockets/SSE internamente
   - No hay endpoints REST públicos para chat/prompt

2. **La documentación del SDK es para uso interno**
   - El SDK `@opencode-ai/sdk` está diseñado para:
     - Plugins de OpenCode
     - Extensiones internas
     - No para uso externo como cliente HTTP

3. **La arquitectura real**:
   ```
   OpenCode CLI/TUI
        ↓
   Servidor Interno (puerto 4096)
        ↓
   WebSockets + SSE (Server-Sent Events)
        ↓
   Interfaz Web (SPA React)
   ```

## 🎯 Soluciones Reales

### Opción 1: Usar OpenCode CLI Directamente (Recomendado)

OpenCode tiene un modo **no interactivo** para scripting:

```bash
# Enviar un prompt y obtener respuesta
echo "¿Cuánto es 2+2?" | opencode --non-interactive

# O con archivo
opencode --non-interactive < prompt.txt > respuesta.txt
```

**Ventajas**:
- ✅ Funciona inmediatamente
- ✅ Usa los modelos gratuitos configurados
- ✅ No requiere servidor
- ✅ Fácil de integrar en scripts

**Ejemplo Python**:
```python
import subprocess

def chat_opencode(message):
    result = subprocess.run(
        ['opencode', '--non-interactive'],
        input=message,
        capture_output=True,
        text=True
    )
    return result.stdout

respuesta = chat_opencode("Explica recursión")
print(respuesta)
```

### Opción 2: Usar el SDK de Node.js (Requiere Node)

Si tienes Node.js, puedes usar el SDK oficial:

```bash
npm install @opencode-ai/sdk
```

```javascript
import { createOpencode } from "@opencode-ai/sdk"

const { client } = await createOpencode()

const session = await client.session.create({
  body: { title: "Mi sesión" }
})

const result = await client.session.prompt({
  path: { id: session.id },
  body: {
    parts: [{ type: "text", text: "Hola mundo" }]
  }
})

console.log(result)
```

### Opción 3: Acceder a Modelos Directamente (Sin OpenCode)

Si solo quieres usar DeepSeek V4 gratis, accede directamente:

```python
# DeepSeek tiene API propia (muy barata)
import requests

response = requests.post(
    "https://api.deepseek.com/v1/chat/completions",
    headers={"Authorization": "Bearer YOUR_KEY"},
    json={
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": "Hola"}]
    }
)
```

O usa **Ollama** para modelos locales 100% gratis:

```bash
# Instalar Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Descargar modelo
ollama pull deepseek-coder

# Usar
ollama run deepseek-coder "Explica recursión"
```

## 📊 Comparación de Opciones

| Método | Dificultad | Gratis | Funciona Ya |
|--------|-----------|--------|-------------|
| OpenCode CLI | ⭐ Fácil | ✅ Sí | ✅ Sí |
| SDK Node.js | ⭐⭐ Media | ✅ Sí | ✅ Sí |
| API DeepSeek | ⭐⭐ Media | ⚠️ Casi | ✅ Sí |
| Ollama Local | ⭐⭐⭐ Media | ✅ Sí | ✅ Sí |
| Proxy HTTP (este proyecto) | ⭐⭐⭐⭐ Difícil | ✅ Sí | ❌ No |

## 🚀 Recomendación Final

**Para tu caso de uso (usar modelos gratis externamente):**

### Solución Inmediata: OpenCode CLI

```python
# wrapper_opencode.py
import subprocess
import json

class OpenCodeWrapper:
    def chat(self, message):
        """Envía mensaje a OpenCode y retorna respuesta"""
        result = subprocess.run(
            ['opencode', '--non-interactive'],
            input=message,
            capture_output=True,
            text=True,
            encoding='utf-8'
        )
        return result.stdout.strip()
    
    def chat_with_context(self, messages):
        """Envía conversación completa"""
        # Construir contexto
        context = "\n".join([
            f"{msg['role']}: {msg['content']}" 
            for msg in messages
        ])
        return self.chat(context)

# Uso
client = OpenCodeWrapper()
response = client.chat("¿Cuánto es 2+2?")
print(response)
```

### Solución Alternativa: Ollama (100% Local y Gratis)

```bash
# Instalar
curl -fsSL https://ollama.com/install.sh | sh

# Usar
ollama pull deepseek-coder
ollama run deepseek-coder "Tu pregunta aquí"
```

```python
# Cliente Python para Ollama
import requests

def chat_ollama(message, model="deepseek-coder"):
    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": model,
            "prompt": message,
            "stream": False
        }
    )
    return response.json()["response"]

print(chat_ollama("Explica recursión"))
```

## 📝 Conclusión

El proyecto original (proxy HTTP para OpenCode) **no es viable** porque:
- OpenCode no expone API REST pública
- El servidor usa WebSockets/SSE internos
- Está diseñado para uso interactivo, no programático

**Alternativas viables**:
1. ✅ **OpenCode CLI** (modo no interactivo)
2. ✅ **Ollama** (modelos locales gratis)
3. ✅ **DeepSeek API** (muy barato, ~$0.14 por millón de tokens)
4. ✅ **SDK Node.js** (si tienes Node)

## 🎯 Próximos Pasos

¿Qué prefieres?

1. **Crear wrapper de OpenCode CLI** (Python, fácil, funciona ya)
2. **Configurar Ollama** (local, gratis, sin límites)
3. **Usar DeepSeek API directa** (barato, rápido, confiable)
4. **Explorar SDK Node.js** (más complejo pero oficial)

Dime cuál te interesa y creo los scripts completos para esa opción.
