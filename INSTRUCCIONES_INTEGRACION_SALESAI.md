# 🔧 INSTRUCCIONES DE INTEGRACIÓN - SalesAI

## 📋 Checklist de Integración

- [ ] Paso 1: Compilar TypeScript
- [ ] Paso 2: Modificar agent.ts
- [ ] Paso 3: Agregar configuración
- [ ] Paso 4: Probar en desarrollo
- [ ] Paso 5: Desplegar a producción
- [ ] Paso 6: Monitorear resultados

---

## PASO 1: Compilar TypeScript

```bash
cd Agent-Sales-Bot

# Instalar dependencias si no están
pnpm install

# Compilar el proyecto
pnpm run build
```

**Verificar**: El archivo `sales-ai.ts` debe compilarse sin errores.

---

## PASO 2: Modificar agent.ts

### 2.1 Importar SalesAI

Agregar al inicio de `artifacts/api-server/src/lib/agent.ts`:

```typescript
import { SalesAI, type SalesVerdict } from './sales-ai';
```

### 2.2 Crear instancia global

Después de las importaciones:

```typescript
// Instancia global de SalesAI (sin APIs externas)
const salesAI = new SalesAI();
```

### 2.3 Agregar análisis antes de llamar APIs

Buscar la función `generateAgentResponse` y agregar ANTES de llamar a las APIs:

```typescript
export async function generateAgentResponse(
  conversationId: number,
  agentId: number,
  userMessage: string
): Promise<string> {
  
  // ═══════════════════════════════════════════════════════════
  // NUEVO: Análisis con SalesAI (IA Local - Sin APIs)
  // ═══════════════════════════════════════════════════════════
  
  console.log(`🧠 [SALESAI] Analizando conversación ${conversationId}...`);
  
  // Obtener historial de mensajes
  const messageHistory = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(20);
  
  // Preparar contexto para SalesAI
  const salesContext = {
    messages: messageHistory.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.createdAt
    })),
    leadBehavior: conversationContext.leadBehavior,
    currentStage: convo.currentStage,
    productsShown: [], // TODO: extraer de messageHistory
    lastInteractionTime: messageHistory.length > 0 
      ? messageHistory[messageHistory.length - 1].createdAt 
      : null
  };
  
  // Analizar con IA local
  const verdict: SalesVerdict = salesAI.analyze(salesContext);
  
  console.log(`🎯 [SALESAI] Veredicto: ${verdict.intent} | Score: ${verdict.score}/100 | Confianza: ${(verdict.confidence * 100).toFixed(1)}%`);
  console.log(`📊 [SALESAI] Etapa: ${verdict.stage_label} | Acción: ${verdict.suggested_action}`);
  
  // ═══════════════════════════════════════════════════════════
  // DECISIÓN: ¿Usar respuesta local o consultar API?
  // ═══════════════════════════════════════════════════════════
  
  const USE_LOCAL_AI = process.env.USE_LOCAL_AI === 'true';
  const LOCAL_AI_CONFIDENCE_THRESHOLD = parseFloat(process.env.LOCAL_AI_CONFIDENCE_THRESHOLD || '0.80');
  
  // Opción 1: Modo 100% Local (si está habilitado)
  if (USE_LOCAL_AI) {
    console.log(`⚡ [SALESAI] Modo LOCAL activado - usando respuesta de IA local`);
    
    // Guardar análisis en metadata del mensaje
    await db.insert(messages).values({
      conversationId,
      role: 'assistant',
      content: verdict.suggested_response,
      metadata: JSON.stringify({
        salesai_verdict: verdict,
        used_local_ai: true,
        reasoning: verdict.reasoning_chain
      }),
      createdAt: new Date()
    });
    
    return verdict.suggested_response;
  }
  
  // Opción 2: Modo Híbrido (usar local si confianza es alta)
  if (verdict.confidence >= LOCAL_AI_CONFIDENCE_THRESHOLD) {
    console.log(`⚡ [SALESAI] Alta confianza (${(verdict.confidence * 100).toFixed(1)}%) - usando respuesta local`);
    
    await db.insert(messages).values({
      conversationId,
      role: 'assistant',
      content: verdict.suggested_response,
      metadata: JSON.stringify({
        salesai_verdict: verdict,
        used_local_ai: true,
        skipped_api: true
      }),
      createdAt: new Date()
    });
    
    return verdict.suggested_response;
  }
  
  // Opción 3: Confianza baja - consultar API externa
  console.log(`🌐 [SALESAI] Confianza baja (${(verdict.confidence * 100).toFixed(1)}%) - consultando API externa`);
  console.log(`💡 [SALESAI] Sugerencia local: ${verdict.suggested_action}`);
  
  // Continuar con el flujo normal de APIs...
  // (el código existente sigue aquí)
```

### 2.4 Usar veredicto para optimizar prompt

Más adelante en la función, cuando construyas el prompt para la API:

```typescript
// Agregar contexto de SalesAI al prompt
const salesAIContext = `
[ANÁLISIS PREVIO - SalesAI]
Intención detectada: ${verdict.intent}
Score: ${verdict.score}/100
Etapa del lead: ${verdict.stage_label}
Acción sugerida: ${verdict.suggested_action}

${verdict.evidence_for.length > 0 ? `Señales positivas:\n${verdict.evidence_for.map(e => `- ${e}`).join('\n')}` : ''}
${verdict.evidence_against.length > 0 ? `Objeciones detectadas:\n${verdict.evidence_against.map(e => `- ${e}`).join('\n')}` : ''}

Usa esta información para generar una respuesta más efectiva.
`;

// Agregar al system prompt
const enhancedSystemPrompt = systemPrompt + '\n\n' + salesAIContext;
```

---

## PASO 3: Agregar Configuración

### 3.1 Actualizar .env

Agregar al archivo `.env`:

```bash
# ========== SALESAI - IA LOCAL ==========
USE_LOCAL_AI=false                    # true = usar solo IA local, false = modo híbrido
LOCAL_AI_CONFIDENCE_THRESHOLD=0.80    # Umbral de confianza para usar respuesta local (0-1)
SALESAI_LOGGING=true                  # Registrar decisiones de SalesAI
```

### 3.2 Configuración Recomendada por Entorno

**Desarrollo:**
```bash
USE_LOCAL_AI=true                     # Probar IA local pura
LOCAL_AI_CONFIDENCE_THRESHOLD=0.70
SALESAI_LOGGING=true
```

**Staging:**
```bash
USE_LOCAL_AI=false                    # Modo híbrido
LOCAL_AI_CONFIDENCE_THRESHOLD=0.80
SALESAI_LOGGING=true
```

**Producción:**
```bash
USE_LOCAL_AI=false                    # Modo híbrido optimizado
LOCAL_AI_CONFIDENCE_THRESHOLD=0.85    # Más conservador
SALESAI_LOGGING=true
```

---

## PASO 4: Probar en Desarrollo

### 4.1 Iniciar servidor

```bash
cd Agent-Sales-Bot
pnpm run dev
```

### 4.2 Probar casos de uso

Enviar mensajes de prueba vía WhatsApp o API:

**Test 1: Intención de compra clara**
```
"Quiero comprar el curso de Python, cuánto cuesta?"
```
**Esperado**: SalesAI detecta BUY con alta confianza → responde localmente

**Test 2: Objeción de precio**
```
"Me parece muy caro"
```
**Esperado**: SalesAI detecta OBJECTION → sugiere manejar objeción

**Test 3: Mensaje ambiguo**
```
"Mmm no sé, tal vez"
```
**Esperado**: SalesAI tiene baja confianza → consulta API externa

### 4.3 Verificar logs

Buscar en los logs:

```
🧠 [SALESAI] Analizando conversación...
🎯 [SALESAI] Veredicto: buy | Score: 90/100 | Confianza: 92.9%
⚡ [SALESAI] Alta confianza - usando respuesta local
```

---

## PASO 5: Desplegar a Producción

### 5.1 Commit y push

```bash
git add .
git commit -m "feat: Integrar SalesAI - IA local sin APIs externas"
git push origin main
```

### 5.2 Actualizar variables en EasyPanel

1. Ir a EasyPanel Dashboard
2. Seleccionar el servicio `Agent-Sales-Bot`
3. Ir a "Environment Variables"
4. Agregar:
   ```
   USE_LOCAL_AI=false
   LOCAL_AI_CONFIDENCE_THRESHOLD=0.85
   SALESAI_LOGGING=true
   ```
5. Guardar y reiniciar

### 5.3 Verificar deployment

```bash
# Verificar que el servicio está corriendo
curl https://tu-dominio.easypanel.host/api/health

# Verificar logs
# En EasyPanel → Logs → buscar "[SALESAI]"
```

---

## PASO 6: Monitorear Resultados

### 6.1 Métricas a Monitorear

Crear un dashboard con:

1. **Tasa de uso de IA local**
   - % de mensajes respondidos por SalesAI
   - % de mensajes que requirieron API

2. **Ahorro de costos**
   - Mensajes locales × $0.005 = ahorro
   - Comparar con mes anterior

3. **Calidad de respuestas**
   - Tasa de conversión (leads → ventas)
   - Satisfacción del cliente
   - Tiempo de respuesta promedio

4. **Distribución de intenciones**
   - % BUY
   - % OBJECTION
   - % BROWSING
   - % LEAVING

### 6.2 Query SQL para Análisis

```sql
-- Mensajes respondidos por SalesAI
SELECT 
  DATE(created_at) as fecha,
  COUNT(*) as total_mensajes,
  SUM(CASE WHEN metadata::json->>'used_local_ai' = 'true' THEN 1 ELSE 0 END) as mensajes_locales,
  SUM(CASE WHEN metadata::json->>'used_local_ai' = 'true' THEN 1 ELSE 0 END)::float / COUNT(*) * 100 as porcentaje_local
FROM messages
WHERE role = 'assistant'
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY fecha DESC;
```

### 6.3 Ajustar Threshold

Después de 1 semana, analizar:

- Si `porcentaje_local` < 50% → **bajar** threshold (ej: 0.75)
- Si calidad baja → **subir** threshold (ej: 0.90)
- Si todo funciona bien → mantener

---

## 🚨 TROUBLESHOOTING

### Problema 1: SalesAI no se está usando

**Síntomas**: No aparecen logs `[SALESAI]`

**Solución**:
```bash
# Verificar que el archivo se compiló
ls artifacts/api-server/dist/lib/sales-ai.js

# Verificar imports
grep -r "SalesAI" artifacts/api-server/src/lib/agent.ts

# Reiniciar servidor
pnpm run dev
```

### Problema 2: Errores de TypeScript

**Síntomas**: `Cannot find module './sales-ai'`

**Solución**:
```bash
# Recompilar
pnpm run build

# Verificar tsconfig
cat tsconfig.json
```

### Problema 3: Respuestas de baja calidad

**Síntomas**: Clientes se quejan de respuestas genéricas

**Solución**:
```bash
# Subir threshold en .env
LOCAL_AI_CONFIDENCE_THRESHOLD=0.90

# O desactivar temporalmente
USE_LOCAL_AI=false
```

### Problema 4: No ahorra costos

**Síntomas**: Sigue usando muchas APIs

**Solución**:
```bash
# Bajar threshold
LOCAL_AI_CONFIDENCE_THRESHOLD=0.70

# Verificar que está habilitado el modo híbrido
USE_LOCAL_AI=false  # (false = híbrido, true = solo local)
```

---

## 📊 RESULTADOS ESPERADOS

Después de 1 semana en producción:

- ✅ **70-80%** de mensajes respondidos localmente
- ✅ **$200-300** ahorrados en costos de API
- ✅ **50-100ms** tiempo de respuesta promedio
- ✅ **Misma o mejor** tasa de conversión

---

## 🎯 PRÓXIMOS PASOS

Una vez integrado y funcionando:

1. **Semana 1**: Monitorear y ajustar threshold
2. **Semana 2**: Agregar más keywords específicos de tu negocio
3. **Semana 3**: Implementar aprendizaje adaptativo
4. **Mes 2**: Agregar análisis de sentimientos
5. **Mes 3**: Dashboard de métricas en tiempo real

---

## 📞 SOPORTE

Si tienes problemas:

1. Revisar logs: `[SALESAI]` en consola
2. Verificar configuración en `.env`
3. Probar con `test-sales-ai.mjs`
4. Revisar documentación en `SALESAI_LOCAL_IMPLEMENTATION.md`

---

**Fecha**: 2025-01-09  
**Versión**: 1.0  
**Estado**: Listo para integración  
**Tiempo estimado**: 2-3 horas
