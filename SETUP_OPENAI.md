# Configuración de OpenAI (ChatGPT) en EasyPanel

## Requisito
Necesitas una API key de OpenAI: https://platform.openai.com/api-keys

## Pasos en EasyPanel

### 1. Agregar la variable de entorno
Ve a: **opencode1 → opencode-clean → Environment**

Agrega estas variables:

```
OPENAI_API_KEY=sk-tu-api-key-aqui
OPENAI_MODEL=gpt-4o-mini
```

Opcional (si quieres usar un modelo específico):
```
OPENAI_BASE_URL=https://api.openai.com/v1
```

### 2. Agregar al fallback order
En la variable `AI_FALLBACK_ORDER`, agrega `openai`:

```
AI_FALLBACK_ORDER=deepseek,groq,openai
```

### 3. Reiniciar el servicio
Ve a opencode-clean → Actions → Restart

## Modelos disponibles
- `gpt-4o` — El mejor, más caro (~$5/1M tokens)
- `gpt-4o-mini` — Bueno y barato (~$0.15/1M tokens) ← **Recomendado**
- `gpt-3.5-turbo` — El más barato, menos capaz

## Costo estimado
Con gpt-4o-mini y ~1000 mensajes/día:
- ~$0.15-0.50/día
- ~$5-15/mes

## Verificar que funciona
Desde la consola de opencode-clean:
```bash
curl -X POST https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer sk-tu-api-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"test"}]}'
```

## Nota
El bot ya tiene configurado el proveedor "openai" en `provider.ts:455-461`.
Solo necesita la API key para activarse.
