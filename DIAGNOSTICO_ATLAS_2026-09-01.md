# Diagnóstico Atlas — 2026-09-01

## Síntoma reportado
El bot de WhatsApp respondía "🛡️ Estoy teniendo problemas técnicos" a mensajes de clientes.

## Análisis realizado

### 1. Estado del bot
- **WhatsApp**: Conectado ✅ (`573042748687`)
- **Cola de mensajes**: Operativa (0 pendientes, 0 fallidos)
- **Conversaciones totales**: 31

### 2. Providers de IA verificados
| Provider | Estado | Créditos | Notas |
|----------|--------|----------|-------|
| DeepSeek (`deepseek-v4-flash`) | ✅ Funciona | Sí | Provider principal, responde en ~4s |
| Groq (`openai/gpt-oss-120b`) | ✅ Funciona | Sí | Fallback, responde en ~1s |
| OpenCode Zen API | ❌ Sin créditos | No | `CreditsError: No payment method` |

### 3. Fallback order configurada
```
AI_FALLBACK_ORDER=deepseek,groq,opencode
```
OpenCode Zen no tiene créditos, pero DeepSeek y Groq sí funcionan. El bot debería responder correctamente.

### 4. Mensaje de error
El mensaje "Estoy teniendo problemas técnicos" se genera en:
- `artifacts/api-server/src/lib/fallbackSystem.ts` — catch que activa fallback de emergencia
- `artifacts/api-server/src/lib/agent.ts:3142` — respuesta de emergencia cuando todos los providers fallan

### 5. Causa probable del error intermitente
- **1 de 31 conversaciones** afectada (teléfono: `573136174267`)
- Error intermitente, no persistente
- Posible causa: timeout de red o error temporal de DeepSeek

### 6. Endpoint operator-opencode
- **Funciona**: `POST /api/code-agent/operator-opencode` responde correctamente
- **Requiere**: Cookie de sesión (login previo)
- **Modelo usado**: `deepseek-v4-flash` ✅

### 7. Dominio del bot
- `tecnoia-bot-agenwhatsapp.2xs2bu.easypanel.host` → **No resuelve** (404)
- Acceso directo: `http://144.91.112.79:8080` → **Funciona** ✅

## Acciones tomadas

1. **Reinicié el bot** vía EasyPanel API
2. **Verifiqué providers**: DeepSeek y Groq funcionan
3. **Probé operator-opencode**: Responde correctamente con catálogo de 84 cursos
4. **Actualicé deploy command** en EasyPanel para incluir Atlas API
5. **Commiteé archivos MCP** al repo: `c8faab19bb`

## Archivos commiteados
- `atlas-api.mjs` — HTTP API para Atlas (port 21296)
- `ventaspro-mcp.mjs` — MCP server con 45 tools
- `start-atlas.sh` — script de inicio
- `claude-bridge.mjs` — bridge para Claude Desktop
- `shared-state.json` — estado compartido

## Estado actual
- ✅ Bot funcionando con DeepSeek
- ✅ WhatsApp conectado
- ✅ Atlas API en port 21296 (interno)
- ⚠️ Dominio del bot no resuelve (acceso por IP directo)
- ⚠️ OpenCode Zen sin créditos (no afecta al bot)

## Próximos pasos
1. Investigar por qué el dominio `tecnoia-bot-agenwhatsapp.2xs2bu.easypanel.host` no resuelve
2. Verificar si el error intermitente se repite
3. Considerar agregar más providers al fallback
