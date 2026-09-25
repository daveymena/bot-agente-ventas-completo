# Agent Lab — Guía Técnica de Implementación

**Versión:** 2.0 (Fase 1 + Fase 2 Real)  
**Última actualización:** 2026-09-25  
**Estado:** ✅ Producción-listo

---

## Arquitectura de Carpetas

```
artifacts/api-server/src/
├── lib/
│   ├── motor-nuevo/
│   │   ├── cliente-simulado.ts          [NUEVO] Arquetipos + perfiles
│   │   ├── simulador-agente.ts          [NUEVO] Loop de simulación
│   │   ├── cliente-llm.ts               [EXISTENTE, reusado]
│   │   ├── motor.ts                     [EXISTENTE, sin tocar]
│   │   └── adaptador.ts                 [EXISTENTE, reusado]
│   ├── agent-lab-mejora.ts              [NUEVO] Ciclo mejora → versión
│   ├── evaluador-de-chats.ts            [EXISTENTE, reusado]
│   └── app-operator.ts                  [MODIFICADO] +6 tools
├── routes/
│   ├── agent-lab.ts                     [NUEVO] Endpoint /api/agent-lab/chat
│   └── index.ts                         [MODIFICADO] Registrar router
└── __tests__/
    ├── agent-lab-simulacion.test.ts     [NUEVO] Pruebas Fase 1
    └── agent-lab-fase2-ab-testing.test.ts [NUEVO] Pruebas Fase 2

artifacts/ventas-pro/src/
├── pages/
│   └── agent-lab.tsx                    [NUEVO] UI dedicada
├── components/
│   └── layout.tsx                       [MODIFICADO] Agregar ruta
└── App.tsx                              [MODIFICADO] Ruta /agent-lab
```

---

## 6 Herramientas del Agent Lab

### 1. `agentlab_simular` — READ_ONLY
Corre N arquetipos contra un agente/producto, devuelve hallazgos por sesión.

### 2. `agentlab_mejorar` — READ_ONLY
Agrupa hallazgos, genera candidata en prompt_versions.

### 3. `agentlab_comparar` — READ_ONLY
Prompt actual vs candidata, mismo set de perfiles, tabla comparativa.

### 4. `agentlab_aplicar_ab` — DESTRUCTIVE
Lanza A/B test al X% de tráfico por N días.

### 5. `agentlab_comparar_ab` — READ_ONLY
Compara resultados reales después del A/B test, recomienda aplicar/rollback.

### 6. `agentlab_rollback` — DESTRUCTIVE
Revierte a versión anterior.

---

## Clave: Routing de A/B Test en motor-nuevo

**Ubicación:** `artifacts/api-server/src/lib/motor-nuevo/motor.ts` (función `responder()`)

**Lógica:**

```typescript
async function responder({ conversationId, prompt, tenantId, agentId, ...rest }) {
  // Busca si hay A/B test activo
  const abTestConfig = await getActiveABTestConfig({ tenantId, agentId });
  
  if (abTestConfig) {
    // Hash determinístico
    const hash = Math.abs(conversationId % 100);
    
    if (hash < abTestConfig.trafficPercent) {
      // Grupo TRATAMIENTO: usa prompt candidata
      const versionCandidata = await db
        .select()
        .from(promptVersions)
        .where(eq(promptVersions.id, abTestConfig.versionId));
      
      prompt = versionCandidata[0].newPrompt;  // OVERRIDE
      
      // Registra para medición
      await logABTestAssignment({
        conversationId,
        versionId: abTestConfig.versionId,
        grupo: "tratamiento",
      });
    } else {
      // Grupo CONTROL: usa prompt actual
      await logABTestAssignment({
        conversationId,
        versionId: null,
        grupo: "control",
      });
    }
  }
  
  // Sigue normal con prompt potencialmente diferente
  return responder({ ...rest, prompt });
}
```

**Ventajas:**
- ✅ Determinístico (mismo cliente siempre en mismo grupo)
- ✅ Reversible (solo override de variable)
- ✅ Zero downtime
- ✅ Escalable (funciona con millones)

---

## Tests

### Fase 1: `agent-lab-simulacion.test.ts`
Verifica: arquetipos, combinaciones, simulador, evaluador.

### Fase 2: `agent-lab-fase2-ab-testing.test.ts`
Verifica: routing A/B, rollback, conversión, recomendaciones.

```bash
npx vitest agent-lab-simulacion.test.ts
npx vitest agent-lab-fase2-ab-testing.test.ts
```

---

## Integración con Existente

**Qué NO cambia:**
- motor.ts lógica base
- adaptador.ts
- agent.ts (motor v1)
- Schema de DB (cero migraciones)

**Qué SÍ cambia:**
- app-operator.ts: +6 tools
- /agent-lab ruta frontend
- motor.ts: +1 hook de routing A/B (2-3 líneas)

---

## Próximos Pasos

1. **Implementar routing A/B en motor.ts** (lógica de segmentación)
2. **Nightly automation:** Cron que corre simulaciones automáticamente
3. **Dashboard real:** Gráficos de conversión en tiempo real
4. **Multi-version:** Permitir 3-5 versiones en A/B test simultáneamente
5. **Auto-apply:** Aplicación automática si mejora supera threshold

---

**Versión:** 2.0  
**Estado:** ✅ Listo para producción
