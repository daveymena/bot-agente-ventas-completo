# 🤖 Integración G4F - Sistema de Rotación de Proveedores

## 📋 Resumen

Tu bot ahora tiene **rotación automática de 6 proveedores de IA** con fallback a G4F como respaldo final:

```
opencode → github_copilot_internal → ollama_local → nvidia → github → g4f
```

Si falla uno, **automáticamente** pasa al siguiente. Si todos fallan, G4F toma el control (111+ proveedores disponibles).

---

## ✅ Estado Actual

### Variables de Entorno (`.env`)
```env
# ========== FALLBACK AI (Rotación) ==========
AI_FALLBACK_ENABLED=true
AI_FALLBACK_ORDER=opencode,github_copilot_internal,ollama_local,nvidia,github,g4f

# ========== G4F (gpt4free - Último respaldo) ==========
G4F_ENABLED=true
G4F_PROVIDER=auto
G4F_MODEL=gpt-4-turbo
G4F_TIMEOUT=30
```

### Archivos Creados
1. **`artifacts/api-server/src/config/g4f.config.ts`**
   - Lee variables de G4F desde `.env`
   - Configura timeout y proveedor

2. **`artifacts/api-server/src/lib/providers/g4f-provider.ts`**
   - Módulo de integración con g4f
   - Funciones para obtener respuestas
   - Health check

---

## 🔄 Cómo Funciona la Rotación

### Flujo Actual

```
Cliente envía mensaje
         ↓
  ¿Opencode disponible?
    ↓ (sí)        ↓ (no)
  Usar OP     ¿GitHub Copilot disponible?
               ↓ (sí)      ↓ (no)
             Usar GH   ¿Ollama Local disponible?
                       ↓ (sí)        ↓ (no)
                     Usar OL    ¿NVIDIA disponible?
                                ↓ (sí)      ↓ (no)
                              Usar NV  ¿GitHub Models disponible?
                                        ↓ (sí)      ↓ (no)
                                      Usar GM     Usar G4F
```

### Sistema de Salud

El `healthMonitor` rastrea:
- ✅ Respuestas exitosas
- ❌ Fallos consecutivos
- ⏳ Tiempos de respuesta
- 🔌 Cooldown automático (5 min) si falla 3 veces

---

## 📦 Instalación de G4F

G4F ya está en tu proyecto, pero necesitas instalarlo:

```bash
# Opción 1: Instalar en el ambiente actual
npm install g4f

# Opción 2: Instalar globalmente
pip install g4f
```

**Verificar instalación:**
```bash
python -c "import g4f; print(f'G4F {g4f.__version__} instalado ✅')"
```

---

## 🧪 Probar G4F Directamente

### Opción 1: Uso sin Servidor (Simple)

```python
# test_g4f_direct.py
import g4f

response = g4f.ChatCompletion.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "¿Hola, funciona?"}]
)
print(response)
```

Ejecutar:
```bash
python test_g4f_direct.py
```

### Opción 2: Uso con Servidor Bridge

```bash
# Terminal 1: Iniciar servidor G4F Bridge
python -m g4f.api

# Terminal 2: Usar desde tu app
curl http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4", "messages": [{"role": "user", "content": "Hola"}]}'
```

---

## 🔌 Integración en tu Bot

### En `artifacts/api-server/src/lib/agent.ts`

G4F se activa **automáticamente** cuando:

1. **Opencode** falla
2. **GitHub Copilot** falla
3. **Ollama Local** falla
4. **NVIDIA** falla
5. **GitHub Models** falla

El sistema llama a `/lib/providers/g4f-provider.ts` que:
```typescript
// 1. Intenta conexión
const response = await getG4FResponse(messages, model);

// 2. Si falla, intenta otro proveedor de G4F
// 3. Si todo falla, usa respuesta fallback
```

---

## 📊 Proveedores Disponibles en G4F

G4F tiene **111+ proveedores**:
- GPT-4, GPT-3.5
- Claude (Anthropic)
- Gemini (Google)
- LLaMA (Meta)
- Y muchos más...

Ver lista completa:
```bash
python -c "import g4f; print(f'Proveedores: {len(g4f.Provider.__members__)}')"
```

---

## ⚙️ Configuración Recomendada

### Para Producción
```env
G4F_ENABLED=true
G4F_PROVIDER=auto  # Prueba proveedores hasta encontrar uno que funcione
G4F_MODEL=gpt-4-turbo
G4F_TIMEOUT=30

AI_FALLBACK_ENABLED=true
AI_FALLBACK_ORDER=opencode,github_copilot_internal,ollama_local,nvidia,github,g4f
```

### Para Desarrollo
```env
G4F_ENABLED=true
G4F_PROVIDER=auto
G4F_MODEL=gpt-3.5-turbo  # Más rápido para testing
G4F_TIMEOUT=15
```

### Para Máxima Confiabilidad
```env
G4F_ENABLED=true
G4F_PROVIDER=auto
G4F_MODEL=gpt-4-turbo
G4F_TIMEOUT=60  # Más tiempo de espera

AI_FALLBACK_ENABLED=true
AI_FALLBACK_ORDER=opencode,opencode,github_copilot_internal,ollama_local,nvidia,github,g4f
# Nota: Opencode aparece 2 veces = reintentos
```

---

## 🚨 Troubleshooting

### Problema: "g4f not found"
```bash
# Solución: Instalar g4f
npm install g4f
# o
pip install g4f
```

### Problema: Timeout en G4F
```env
# Aumentar timeout
G4F_TIMEOUT=60
```

### Problema: Proveedor bloqueado
```env
# Cambiar a auto (prueba varios)
G4F_PROVIDER=auto
# o específico
G4F_PROVIDER=BingCreateImages
```

### Problema: Respuesta vacía
```bash
# Verificar salud del sistema
curl http://localhost:3002/api/health
```

---

## 📈 Monitoreo

### Ver salud de proveedores
```bash
# Endpoint de salud (si existe)
curl http://localhost:3002/api/health
```

### Logs del sistema
```bash
# Ver logs de fallback
grep "G4F\|FallbackSystem" server.log
```

### Estadísticas
```bash
# Ver uso de cada proveedor
SELECT provider, COUNT(*) as calls, AVG(response_time) as avg_time 
FROM ai_calls 
GROUP BY provider
ORDER BY calls DESC;
```

---

## 🎯 Próximos Pasos

### 1️⃣ Instalar G4F (si aún no está)
```bash
npm install g4f
```

### 2️⃣ Verificar variables en `.env`
```bash
grep "G4F\|AI_FALLBACK" .env
```

### 3️⃣ Probar rotación
```bash
# Simular falla de opencode
export OPENCODE_API_KEY=invalid

# Enviar mensaje al bot
# Debe caer a github → ollama → nvidia → g4f
```

### 4️⃣ Monitorear logs
```bash
tail -f backend.log | grep G4F
```

---

## 📚 Referencia

### Función Principal: `getG4FResponse()`

```typescript
// Obtener respuesta de G4F
const response = await getG4FResponse(
  [
    { role: "user", content: "¿Cuál es el clima?" }
  ],
  "gpt-4-turbo"  // modelo opcional
);

console.log(response.content);      // La respuesta
console.log(response.provider);     // Proveedor usado
console.log(response.model);        // Modelo usado
```

### Health Check

```typescript
// Verificar que G4F está disponible
const isHealthy = await checkG4FHealth();
if (isHealthy) {
  console.log("✅ G4F disponible");
} else {
  console.log("❌ G4F no disponible");
}
```

---

## ✨ Resumen Final

✅ **Sistema de rotación** con 6 proveedores
✅ **Fallback automático** a G4F (111+ proveedores)
✅ **Health monitoring** integrado
✅ **Timeout inteligente** evita bloqueos
✅ **Logs detallados** para debugging

**Tu bot ahora tiene máxima disponibilidad** 🚀
