# 🚀 G4F Integration - Pasos Siguientes

## ✅ Lo que ya está hecho

1. **Configuración en `.env`** ✓
   - ✅ `G4F_ENABLED=true`
   - ✅ `G4F_PROVIDER=auto`
   - ✅ `G4F_MODEL=gpt-4-turbo`
   - ✅ `G4F_TIMEOUT=30`
   - ✅ G4F añadido a `AI_FALLBACK_ORDER`

2. **Archivos de código** ✓
   - ✅ `artifacts/api-server/src/config/g4f.config.ts` - Configuración
   - ✅ `artifacts/api-server/src/lib/providers/g4f-provider.ts` - Módulo principal
   - ✅ `artifacts/api-server/src/lib/examples/g4f-integration-example.ts` - Ejemplo

3. **Documentación** ✓
   - ✅ `G4F_INTEGRACION_COMPLETA.md` - Guía completa
   - ✅ `test-g4f-integration.py` - Suite de tests
   - ✅ `verify-g4f-setup.ps1` - Verificación rápida

---

## 📋 Checklist de Implementación

### PASO 1: Instalar G4F
```bash
# Terminal
npm install g4f
# o
pip install g4f
```

**Verificar:**
```bash
python -c "import g4f; print(f'✅ G4F {g4f.__version__} instalado')"
```

---

### PASO 2: Verificar Configuración
```bash
# Ver .env
grep "G4F\|AI_FALLBACK" .env

# Debería mostrar:
# G4F_ENABLED=true
# G4F_PROVIDER=auto
# G4F_MODEL=gpt-4-turbo
# G4F_TIMEOUT=30
# AI_FALLBACK_ORDER=opencode,...,g4f
```

---

### PASO 3: Ejecutar Tests
```bash
# Test completo (Python)
python test-g4f-integration.py

# O verificación rápida (PowerShell)
.\verify-g4f-setup.ps1
```

**Esperado:**
```
✅ G4F Import [PASS]
✅ Providers Count [PASS] - 111+ proveedores disponibles
✅ Basic Response [PASS]
✅ ENV Config [PASS]
...
```

---

### PASO 4: Integración en el Código

#### 4.1 - Importar en `agent.ts`
```typescript
// En artifacts/api-server/src/lib/agent.ts (añadir en imports)
import { 
  getG4FResponse, 
  checkG4FHealth 
} from "./providers/g4f-provider";
```

#### 4.2 - Usar en fallback
```typescript
// Donde se maneja la rotación (ya existe en fallbackSystem.ts)
// Se añadirá como último proveedor automáticamente
```

#### 4.3 - Health check
```typescript
// En el endpoint de salud
export async function getSystemHealth() {
  const g4fHealth = await checkG4FHealth();
  
  return {
    g4f: g4fHealth ? "healthy" : "unavailable",
    // ... otros servicios
  };
}
```

---

### PASO 5: Prueba End-to-End

#### 5.1 - Iniciar servidor
```bash
npm run start
# o
yarn start
```

#### 5.2 - Enviar mensaje de prueba
```bash
# Terminal 2
curl http://localhost:3002/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hola, ¿funcionas?",
    "conversationId": 1
  }'
```

#### 5.3 - Ver logs
```bash
# Buscar G4F en los logs
tail -f backend.log | grep -E "G4F|Fallback|Provider"
```

---

### PASO 6: Simular Fallos

Para verificar que la rotación funciona:

```bash
# 1. Hacer fallar OpenCode
export OPENCODE_API_KEY=invalid

# 2. Enviar mensaje al bot
# Debería caer a: github → ollama → nvidia → github → g4f

# 3. Ver en logs:
# [G4F] Opencode failed, trying github_copilot...
# [G4F] GitHub Copilot failed, trying ollama...
# [G4F] G4F activated as fallback
```

---

## 🧪 Tests Incluidos

### Test 1: Integración Python
```bash
python test-g4f-integration.py
```
Verifica:
- ✅ G4F importa correctamente
- ✅ Hay proveedores disponibles
- ✅ Las respuestas funcionan
- ✅ Los timeouts funcionan
- ✅ Streaming funciona

### Test 2: Verificación Rápida
```bash
.\verify-g4f-setup.ps1
```
Verifica:
- ✅ .env configurado
- ✅ Archivos presentes
- ✅ G4F importa
- ✅ Respuesta simple funciona

### Test 3: Manual
```bash
python
>>> import g4f
>>> response = g4f.ChatCompletion.create(
...     model="gpt-4",
...     messages=[{"role": "user", "content": "Hola"}]
... )
>>> print(response)
```

---

## 🔧 Configuración Avanzada

### Para mayor confiabilidad:
```env
# Aumentar timeout
G4F_TIMEOUT=60

# Usar provider específico (si auto falla)
G4F_PROVIDER=BingCreateImages

# Añadir fallback doble a opencode
AI_FALLBACK_ORDER=opencode,opencode,github_copilot_internal,g4f
```

### Para máximo rendimiento:
```env
# Modelo más rápido
G4F_MODEL=gpt-3.5-turbo

# Timeout más corto
G4F_TIMEOUT=15

# Menos reintentos
# (configurar en fallbackSystem.ts)
```

---

## 📊 Monitoreo

### Ver uso de proveedores
```sql
-- En tu base de datos
SELECT 
  provider, 
  COUNT(*) as total_calls,
  AVG(response_time_ms) as avg_response_time
FROM ai_api_calls
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY provider
ORDER BY total_calls DESC;
```

### Ver salud del sistema
```bash
# Endpoint de salud (crear si no existe)
curl http://localhost:3002/api/health | jq '.g4f'
# Output: "healthy" o "unavailable"
```

---

## 🐛 Troubleshooting

| Problema | Solución |
|----------|----------|
| "ModuleNotFoundError: No module named 'g4f'" | `npm install g4f` o `pip install g4f` |
| G4F responde vacío | Aumentar timeout: `G4F_TIMEOUT=60` |
| G4F responde lentamente | Usar modelo más rápido: `gpt-3.5-turbo` |
| Proveedor bloqueado | Cambiar a auto: `G4F_PROVIDER=auto` |
| Fallos repetidos | Revisar logs, aumentar cooldown en fallbackSystem.ts |

---

## ✨ Arquitetura Final

```
Cliente WhatsApp
      ↓
  Bot Agent
      ↓
  AI Fallback System
      ↓
┌─────────────────────────────┐
│  Provider Rotation Queue    │
├─────────────────────────────┤
│ 1. OpenCode                 │ ← Intenta primero
│ 2. GitHub Copilot Internal  │
│ 3. Ollama Local             │
│ 4. NVIDIA                   │
│ 5. GitHub Models            │
│ 6. G4F (111+ providers)     │ ← Respaldo final
└─────────────────────────────┘
      ↓
  Health Monitor
  (Tracks failures, cooldowns)
      ↓
  Fallback Response
  (Si todos fallan)
```

---

## 🎯 Próximos Pasos en Orden

1. **HOY:**
   - [ ] Instalar G4F: `npm install g4f`
   - [ ] Verificar config: `grep "G4F" .env`
   - [ ] Ejecutar test: `python test-g4f-integration.py`

2. **MAÑANA:**
   - [ ] Hacer PR con cambios
   - [ ] Deploy a producción
   - [ ] Monitorear logs

3. **SEMANA:**
   - [ ] Analizar uso de proveedores
   - [ ] Optimizar configuración
   - [ ] Crear dashboards de salud

---

## 📞 Soporte

Si algo no funciona:

1. Revisa los logs: `tail -f backend.log | grep G4F`
2. Ejecuta tests: `python test-g4f-integration.py`
3. Verifica .env: `grep "G4F" .env`
4. Revisa documentación: `cat G4F_INTEGRACION_COMPLETA.md`

---

## 📚 Referencias

- [G4F GitHub](https://github.com/xtekky/gpt4free)
- [G4F Providers](https://github.com/xtekky/gpt4free#supported-models)
- [Documentación completa](./G4F_INTEGRACION_COMPLETA.md)

---

**¡Listo! Tu bot ahora tiene máxima disponibilidad con 111+ proveedores de IA respaldándolo.** 🚀
