# Configuración de OpenAI (ChatGPT) en EasyPanel

## Opción 1: Directo (más simple)
Solo agrega la API key a opencode-clean.

## Opción 2: Proxy Bridge (recomendado para múltiples servicios)
Un servicio independiente que sirve de puente entre OpenAI y todos tus servicios.

---

## Opción 1: Directo

### 1. Agregar variable de entorno
Ve a: **opencode1 → opencode-clean → Environment**

```
OPENAI_API_KEY=sk-tu-api-key-aqui
OPENAI_MODEL=gpt-4o-mini
```

### 2. Reiniciar
opencode-clean → Actions → Restart

---

## Opción 2: Proxy Bridge

### 1. Crear servicio en EasyPanel
- **Project**: opencode1
- **Service name**: openai-proxy
- **Source**: Git → `daveymena/bot-agente-ventas-completo`
- **Dockerfile**: `Dockerfile.openai-proxy`
- **Port**: 4000

### 2. Variables de entorno
```
OPENAI_API_KEY=sk-tu-api-key-aqui
OPENAI_MODEL=gpt-4o-mini
PROXY_PORT=4000
PROXY_SECRET=tu-secreto-opcional
```

### 3. Desde otros servicios
Los servicios en EasyPanel se conectan así:

```javascript
// En opencode-clean o bot-agenwhatsapp
const OPENAI_BASE_URL = "http://openai-proxy:4000/v1";
const OPENAI_API_KEY = "tu-secreto-opcional"; // o vacío si no usas auth

const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${OPENAI_API_KEY}`,
    "X-Proxy-Secret": "tu-secreto-opcional"
  },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Hola" }]
  })
});
```

### 4. Verificar
```bash
# Health check
curl http://openai-proxy:4000/health

# List models
curl http://openai-proxy:4000/v1/models

# Chat completion
curl -X POST http://openai-proxy:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"test"}]}'
```

---

## Modelos disponibles
- `gpt-4o` — El mejor (~$5/1M tokens)
- `gpt-4o-mini` — Bueno y barato (~$0.15/1M tokens) ← **Recomendado**
- `gpt-3.5-turbo` — El más barato

## Costo estimado
Con gpt-4o-mini y ~1000 mensajes/día: ~$5-15/mes
