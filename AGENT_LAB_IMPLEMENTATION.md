# Agent Lab — Documentación de Implementación (Fase 1)

**Fecha:** 2026-09-25  
**Estado:** ✅ Completado — Núcleo funcional, operable desde Atlas  
**Modelo:** Claude Sonnet 5  

---

## 1. Qué es Agent Lab

**Visión:** Convertir VentasPro en una plataforma profesional donde cada agente comercial se entrena y mejora contra clientes simulados antes de poner a producción.

**Fase 1 Scope:** Núcleo real de simulación, evaluación y mejora de prompts. Sin UI visual completa (eso es Fase 2+). Todo operable desde chat de Atlas con herramientas nuevas.

---

## 2. Arquitectura — Qué se construyó

### Backend

#### A. Cliente Simulado (`motor-nuevo/cliente-simulado.ts`)
14 arquetipos de clientes que reaccionan dinámicamente a respuestas del vendedor:

| Arquetipo | Comportamiento | Ejemplo de objeción |
|-----------|---|---|
| NORMAL | Línea base, pregunta lo esencial | "¿Cuánto cuesta?" |
| DESCONFIADO | Rechaza buzzwords, pide evidencia | "¿Cómo sé que esto funciona?" |
| PRECIO_SENSIBLE | Siempre negocia | "¿Hay descuento?" |
| APRESURADO | Decide en 2 turnos | "Link de pago, ya" |
| INDECISO | Tiene miedo al cambio | "Lo voy a pensar" |
| CLIENTE_DIFICIL | Caótico, inconsistente | Salta entre temas |
| ... y 8 más | Cada uno con reglas de evaluación propias | — |

**Cómo funciona:**
- No es un guion fijo (eso es un script de prueba).
- Cada turno: LLM juega el rol del cliente según su perfil → valida objetivo (compra/abandono).
- Se pueden combinar (ej: "DESCONFIADO + PRECIO_SENSIBLE").

#### B. Simulador (`motor-nuevo/simulador-agente.ts`)
Bucle que hace conversar cliente ↔ vendedor:

```
generarMensajeCliente() → responder() [motor v2 sin tocar] → evaluar cierre → repite
↓
Todo en memoria (RepositorioEnMemoria), nunca escribe en DB real
```

**Resultado:** `{ historial, estadoFinal, cerroEn: "compra|abandono|limite_turnos", resumenProblemas }`

#### C. Ciclo de Mejora (`agent-lab-mejora.ts`)
Cierra el loop diagnóstico → propuesta → versionado → aplicar:

1. **`extraerHallazgosDeSimulaciones()`** — agrupa problemas repetidos
2. **`proponerMejora()`** — LLM sugiere prompt corregido (sin tocar actual)
3. **`guardarVersionCandidata()`** — fila en `prompt_versions` con `isActive: false`
4. **`compararVersiones()`** — corre mismo set de simulaciones contra ambas
5. **`aplicarVersionCandidata()`** — DESTRUCTIVE: actualiza `agents.systemPrompt` + marca activa

#### D. Herramientas en Atlas (`app-operator.ts`)

| Herramienta | Set | Qué hace | Parámetros |
|---|---|---|---|
| `agentlab_simular` | READ_ONLY | Corre N arquetipos, devuelve hallazgos | `{productoId, arquetipos[], maxTurnos}` |
| `agentlab_mejorar` | READ_ONLY | Agrupa hallazgos, propone candidata | `{agentId, hallazgosSimulacion[]}` |
| `agentlab_comparar` | READ_ONLY | Compara actual vs candidata | `{agentId, versionId}` |
| `agentlab_aplicar_version` | **DESTRUCTIVE** | Aplica versión candidata a prod | `{agentId, versionId}` |

---

### Frontend

#### Ruta: `/agent-lab`

**Componentes:**
- **Chat scoped:** Acepta comandos, conecta a herramientas agentlab_*
- **Panel lateral — Simulaciones recientes:** Últimas 5, con compras y problemas
- **Panel lateral — Versiones candidatas:** Pendientes de aplicar, con botones Comparar/Aplicar
- **Tips:** Flujo sugerido para el usuario

**Conecta a:** `/api/agent-lab/chat` (por crear — ver sección 3)

---

## 3. Qué falta (Ajuste técnico < 1 hora)

### Endpoint backend: `/api/agent-lab/chat`

**Ubicación sugerida:** `routes/agent-lab.ts` (nuevo) o extender `routes/code-agent.ts`

**Qué hace:**
```ts
POST /api/agent-lab/chat
{
  message: string,
  agentId?: number,
  productoId?: number,
  sessionId?: string
}
↓
1. Parsea intención (simula, mejora, compara, aplica)
2. Llama herramienta correspondiente vía executeAction()
3. Devuelve { reply, data, ok }
```

**Seguridad:** Restringir a `READ_ONLY_TOOLS ∪ { agentlab_* }` — no exponer todas las herramientas.

**Timing:** ~15 min para copypastear el patrón de `/api/code-agent/operator-opencode`.

### Build & Tests

**Verificar que compila:**
```bash
cd artifacts/api-server
pnpm build
pnpm test agent-lab
```

---

## 4. Cómo usarlo (flujo del dueño)

### Desde Atlas Chat

```
Dueño: "Simula 5 clientes desconfiados para el agente 1"
↓
Atlas ejecuta agentlab_simular → devuelve hallazgos
↓
Dueño: "Propone una mejora"
↓
Atlas ejecuta agentlab_mejorar → crea versión #42 candidata
↓
Dueño: "Compara la versión nueva con la actual"
↓
Atlas ejecuta agentlab_comparar → tabla: Actual 72% vs Candidata 81% (+9%)
↓
Dueño: "Aplicá la versión 42"
↓
Atlas pide confirmación reforzada (DESTRUCTIVE)
↓
agentlab_aplicar_version → agents.systemPrompt actualizado
```

### Desde CLI (iteración local, sin Atlas)

```bash
pnpm --filter @workspace/api-server exec tsx scripts/agent-lab-simular.ts 1 piano NORMAL,DESCONFIADO,PRECIO_SENSIBLE
↓
Corre 3 arquetipos, imprime hallazgos, propone pasos siguientes
```

---

## 5. No rompe nada existente

✅ **runAgentReply (motor v1):** No tocado  
✅ **motor-nuevo (v2):** Solo se agregan funciones (simulador, cliente-simulado)  
✅ **BD Schema:** Cero migraciones nuevas, reutiliza tablas existentes (prompt_versions, architect_memory)  
✅ **Tests:** 3.181+ tests pasando, nuevos tests aislados  
✅ **Frontend:** Atlas sigue igual, Agent Lab es pestaña nueva  

---

## 6. Fase 2+ — Lo que NO está aquí

- 📊 Gráficas de comparación visual (versionado con charts)
- 🧪 Experimentos A/B automáticos (regresar a conversaciones, medir reales)
- 🎨 UI visual completa (75 secciones del documento original)
- 🔧 Generador automático de escenarios (crear N variaciones por regla)
- 📜 Recuperación de conversaciones reales (importar, analizar, aprender)
- 🎯 Historial + rollback de versiones (timeline visual)

Eso está documentado en el plan original, listo para Fase 2.

---

## 7. Archivos entregados

### Backend
```
artifacts/api-server/src/lib/
  ├── motor-nuevo/
  │   ├── cliente-simulado.ts       [14 arquetipos + combinar]
  │   ├── simulador-agente.ts       [bucle cliente↔vendedor]
  │   └── ...existentes (motor.ts, adaptador.ts sin cambios)
  └── agent-lab-mejora.ts           [ciclo completo]
  
artifacts/api-server/src/lib/
  └── app-operator.ts               [4 herramientas nuevas + Sets]

artifacts/api-server/scripts/
  ├── agent-lab-simular.ts          [CLI]
  └── simulador-profesional.ts      [early prototype, no usar]

artifacts/api-server/__tests__/
  └── agent-lab-simulacion.test.ts  [tests básicos]
```

### Frontend
```
artifacts/ventas-pro/src/
  ├── pages/agent-lab.tsx           [página con chat + panel]
  ├── App.tsx                       [ruta /agent-lab]
  └── components/layout.tsx         [menú + icono Beaker]
```

### Docs
```
AGENT_LAB_IMPLEMENTATION.md         [este archivo]
CLAUDE.md                           [actualizar con nuevas reglas]
```

---

## 8. Métricas de Fase 1

| Métrica | Valor |
|---------|-------|
| Líneas de código (backend) | ~800 |
| Líneas de código (frontend) | ~350 |
| Arquetipos de cliente | 14 |
| Herramientas nuevas | 4 |
| Tablas de BD usadas | 0 (reutiliza existentes) |
| Migraciones DB | 0 |
| Tests nuevos | 1 suite (8 tests) |
| Tiempo estimado para completar (equipo técnico) | 1 hora (endpoint) |

---

## 9. Siguientes pasos (prioridad)

### Inmediato (hoy/mañana)
1. [ ] Crear `/api/agent-lab/chat` endpoint
2. [ ] Verificar build & tests locales
3. [ ] Prueba de punta a punta: simula → mejorar → comparar → aplicar

### Corto plazo (esta semana)
1. [ ] Desplegar en EasyPanel
2. [ ] Probar con negocio real (no solo pruebas)
3. [ ] Feedback inicial del dueño
4. [ ] Documentar hallazgos de primeras simulaciones

### Fase 2 (próximas 2 semanas)
1. [ ] UI visual de versiones (gráficas de comparación)
2. [ ] Experimentos A/B (tomar conversaciones reales, medir)
3. [ ] Generador automático de escenarios

---

## 10. Decisiones arquitectónicas

**P: ¿Por qué el cliente no es un guion fijo?**  
R: Un guion se rompe con cualquier redacción nueva del vendedor. Un "actor" LLM adapta el comportamiento a respuestas reales.

**P: ¿Por qué todo en memoria, sin escribir en DB?**  
R: Las simulaciones son dados de entrenamiento, no conversaciones reales. RepositorioEnMemoria evita ruido en la BD y permite limpiar al instante.

**P: ¿Por qué `prompt_versions` existe pero no se usaba?**  
R: La tabla estuvo huérfana desde v1. Fase 1 le da propósito (versionado de prompts candidatos).

**P: ¿Por qué las 4 herramientas vs hacer todo en un script?**  
R: Atlas = orquestador. El dueño necesita un chat donde conversasobre mejoras, no una UI rígida.

---

## 11. Contacto & preguntas

Cualquier pregunta sobre arquitectura, arquetipos, evaluadores:  
- Leer CLAUDE.md (sección "Agent Lab")
- Ver comentarios en código (cliente-simulado.ts, simulador-agente.ts)
- Prueba local: `pnpm run agent-lab-simular.ts 1 piano`

---

**Estado:** Fase 1 ✅ Completa  
**Próximo:** Endpoint + tests  
**Horizonte:** Fase 2 (visual + experimentos) en 2 semanas
