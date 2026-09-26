# Plan: Integración del Cerebro en /probar-vendedor

**Fecha**: 25-09-2026  
**Status**: 📋 Planificado  
**Prioridad**: 🔴 CRÍTICA

---

## Visión

`/probar-vendedor` es la **única interfaz visible y profesional** donde el dueño prueba el agente con el **cerebro autónomo completamente integrado**.

**Agent Lab**: Escondido (no en menú), su lógica vive dentro de `/probar-vendedor`.

---

## Cambios Necesarios

### 1. Limpiar NavBar
**Archivo**: `artifacts/ventas-pro/src/components/layout.tsx` (o navegación principal)

**Cambio**:
```
❌ Remover: /agent-lab del menú
✅ Mantener: /probar-vendedor visible
```

### 2. Integrar Cerebro en `/probar-vendedor`
**Archivo**: `artifacts/ventas-pro/src/pages/probar-vendedor.tsx`

**Cambios**:

#### a) Importar las 5 fases
```ts
import { razonar } from "@/lib/cerebro/razonador";
import { obtenerContextoMemoria } from "@/lib/cerebro/memoria-multi-capa";
import { mejorarAgentAutonomamente } from "@/lib/cerebro/autonomia-acotada";
import { procesarConPlan } from "@/lib/cerebro/planificador";
import { especularYValidar } from "@/lib/cerebro/especulador";
```

#### b) En función `enviar()` (línea ~91)
```ts
// ANTES: Solo llamar al motor
const respuesta = await api("/api/probar-vendedor/responder", { ... });

// DESPUÉS: Pasar por cerebro
const decision = await razonar(contextoRazonamiento);
if (decision.escalada) {
  // Mostrar: "Necesita revisión humana"
  return;
}

const memoria = await obtenerContextoMemoria(limpio, tenantId);
const plan = procesarConPlan(intent, tags, limpio, respuesta, planExistente);
const especulacion = especularYValidar(historial, tags, pasoActual);

// Llamar al motor CON contexto enriquecido
const respuesta = await api("/api/probar-vendedor/responder", {
  ...payload,
  razonamiento: decision.trazaCompleta,
  memoria: memoria,
  plan: plan,
  especulacion: especulacion,
});
```

#### c) Mostrar en UI
```ts
// Confianza del razonador
<span className="text-xs text-gray-500">Confianza: {decision.confianza}%</span>

// Qué aprendió (autonomía)
{actualizacion && <Alert>Auto-aprendió: {actualizacion.razonCambio}</Alert>}

// Plan actual (planificador)
<span className="text-xs">Paso {plan.pasoActual}/{plan.pasos.length}</span>

// Hipótesis (especulador)
{especulacion.hipotesis && <Hint>Esperando: {especulacion.hipotesis.tema}</Hint>}
```

### 3. Backend: Integración en API
**Archivo**: `artifacts/api-server/src/routes/probar-vendedor.ts`

**Cambios**:
```ts
// Recibir contexto del cerebro
const { razonamiento, memoria, plan, especulacion } = req.body;

// Pasar al motor v2
const respuesta = await motor.responder({
  ...contexto,
  razonamiento,  // Usa 3 opciones evaluadas
  memoria,       // Trae contexto histórico
  plan,          // Sigue árbol de pasos
  especulacion,  // Anticipa próximo turno
});
```

### 4. En Corrección (Auto-mejora)
**Cuando dueño presiona "Corregir"**:

```ts
// Detectar error
const errores = await detectarErrores(tenantId, [mensajeAnterior]);

// Generar mejora
const mejora = await generarMejora(errores[0], promptActual);

// Simular contra 14 arquetipos
const simulaciones = await simularMejora(mejora, agentId, productId);

// Decidir
const decision = decidirAutonomia(mejora, comparacion);

// Si confianza > 85%: auto-aplica
if (decision.decision === "auto_aplicar") {
  await actualizarPrompt(agentId, mejora.promptNuevo);
  toast.success("✅ Auto-aprendió automáticamente");
}
```

---

## Arquitectura Final

```
/probar-vendedor
├─ Input: Cliente escribe
├─ [RAZONADOR] → 3 opciones (Conf: %)
├─ [MEMORIA] → Contexto histórico
├─ [PLANIFICADOR] → Paso actual
├─ [ESPECULADOR] → Anticipa
├─ [Motor v2] → Responde
├─ Output: Respuesta + burbujas
├─ [AUTONOMÍA] → Si corriges: auto-mejora
└─ Feedback: Qué aprendió
```

---

## Testing Checklist

- [ ] Razonador muestra 3 opciones en debug
- [ ] Memoria trae contexto (cliente mencionó algo previo)
- [ ] Autonomía detecta error al corregir
- [ ] Planificador avanza pasos
- [ ] Especulador anticipa próximo turno
- [ ] Auto-mejora aplica sin intervención (conf > 85%)
- [ ] Todo visible en `/probar-vendedor`
- [ ] Agent Lab escondido del menú

---

## Pasos Ejecución

1. **Limpiar NavBar** (30 min)
2. **Integrar Razonador** (1h)
3. **Integrar Memoria** (1h)
4. **Integrar Autonomía** (1h)
5. **Integrar Planificador** (45 min)
6. **Integrar Especulador** (45 min)
7. **Testing profesional** (1h)

**Tiempo total**: ~5-6 horas

---

## Success Criteria

✅ `/probar-vendedor` funciona profesionalmente  
✅ Cerebro integrado y funcional  
✅ Auto-mejora activa (cuando corriges)  
✅ Memoria conectada  
✅ Agent Lab invisible del menú  
✅ Todo sin errores

---

**Estado**: Listo para iniciar en próxima sesión
