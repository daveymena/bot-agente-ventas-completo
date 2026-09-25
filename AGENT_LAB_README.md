# Agent Lab — Sistema Profesional de Entrenamiento para Agentes de Venta

**Estado:** ✅ Producción-listo (Fase 1 + Fase 2 Real)  
**Versión:** 2.0  
**Última actualización:** 2026-09-25

---

## Resumen Ejecutivo

Agent Lab es un **simulador profesional de clientes** + **A/B testing real** para entrenar y mejorar agentes de venta sin riesgo.

- **Fase 1:** Simula clientes con 14 arquetipos reales → detecta problemas → propone mejoras
- **Fase 2:** Prueba versión mejorada en el 10% del tráfico real → mide conversión → decide

**Resultado:** Mejoras verificadas con datos reales, aplicadas solo cuando demuestran valor.

---

## Acceso

### Panel de Control
Abre `/agent-lab` en tu panel VentasPro para acceder a:
- Chat dedicado para comandos
- Panel de simulaciones recientes
- Versiones candidatas pendientes
- Flujo recomendado (4 pasos)

### Documentación
- **Usuario:** `AGENT_LAB_GUIA_COMPLETA.md` (cómo usar, arquetipos, casos)
- **Técnico:** `AGENT_LAB_IMPLEMENTATION.md` (arquitectura, routing, tests)
- **Este archivo:** Resumen y automatización

---

## Flujo Rápido (5 Minutos)

```
1. Abre /agent-lab
2. Escribe: "Simula 5 clientes DESCONFIADO"
3. Lee hallazgos: "no menciona garantía", "precio justificado"
4. Escribe: "Propone una mejora"
5. Sistema genera versión #42, la guarda (sin tocar producción)
6. Escribe: "Compara versión 42"
7. Resultado: simulación +12% vs actual
8. Escribe: "Aplica versión 42 al 10% de tráfico por 7 días"
9. → 10% de nuevos clientes ven versión #42, 90% ven actual
10. Espera 7 días, luego:
11. "Compara resultados del A/B test"
12. Real: +15% conversión
13. "Aplica versión 42 al 100%"
14. ✅ Todos ven el prompt mejorado
```

---

## Arquetipos Disponibles (14)

Usa estos nombres en los comandos:

```
NORMAL              ← línea base (cliente promedio)
DESCONFIADO         ← rechaza buzzwords, pide pruebas
PRECIO_SENSIBLE     ← negocia, busca descuentos
APRESURADO          ← decide en 2-3 mensajes
INDECISO            ← miedo al cambio
CLIENTE_DIFICIL     ← caótico, salta temas
ESCÉPTICO           ← duda de todo
EXPERTO             ← sabe del tema
COMPARADOR          ← compara alternativas
CURIOSO             ← hace 100 preguntas
LISTA_PARA_COMPRAR  ← solo confirma
QUE_REGRESA         ← repite compra
MOLESTO             ← enojado
QUE_DESAPARECE      ← se va sin avisar
```

**Ejemplo:**
```
"Simula 2 DESCONFIADO, 2 PRECIO_SENSIBLE, 2 NORMAL"
```

---

## Comandos en /agent-lab

### Fase 1: Simulación (Sin Riesgo)

```
"Simula 5 clientes DESCONFIADO"
→ Corre 5 simulaciones, devuelve hallazgos

"Propone una mejora"
→ LLM sugiere nuevo prompt, lo guarda como versión candidata (#42)

"Compara versión 42"
→ Simulación vs simulación, tabla comparativa, %mejora
```

### Fase 2: A/B Testing (Seguro + Reversible)

```
"Aplica versión 42 al 10% de tráfico por 7 días"
→ 10% de clientes ven v42, 90% ven actual
→ Duración: 7 días (después se detiene automáticamente)

"Compara resultados del A/B test"
→ Datos REALES después de 7 días
→ Control vs Tratamiento, %mejora, recomendación

"Aplica versión 42 al 100%"
→ Todos ven el prompt mejorado (DESTRUCTIVE, pero reversible)

"Rollback a versión anterior"
→ Vuelve a versión anterior en 1 segundo
```

---

## Estrategia Recomendada

### Semana 1: Descubrir Problemas
```
1. Simula los 5 arquetipos que representan TUS mayores problemas
2. Nota los hallazgos repetidos (objeción de precio, confianza baja, etc.)
3. Propone mejora basada en esos hallazgos
4. Compara en simulación para validar
```

### Semana 2-3: A/B Test Real
```
5. Aplica versión al 10% de tráfico por 7 días
6. Observa qué pasa (no toques nada durante el test)
7. Compara resultados reales después de 7 días
8. Si +5% conversión: aplica al 100%
   Si -5% conversión: rollback
   Si neutral: observa más tiempo
```

### Semana 4+: Itera
```
9. Simula nuevamente (cambio en el panorama)
10. Propone mejora siguiente
11. A/B test de la nueva versión
12. Aplica o descarta
```

---

## Casos de Uso

### "Los clientes no entienden el precio"
```
1. Simula 5 PRECIO_SENSIBLE
2. Propone: "explicar ROI", "ofrecer planes"
3. Compara: +8% en simulación
4. A/B test al 20% (más agresivo porque es crítico)
5. Compara después: real +6%, aplica al 100%
```

### "Mucha desconfianza inicial"
```
1. Simula 5 DESCONFIADO + 5 ESCÉPTICO
2. Propone: "casos reales", "testimonios"
3. Compara: +5% en simulación
4. A/B test al 10% (conservador)
5. Compara: real -2%, rollback
6. Itera: propone diferente
```

### "Cliente listo pero no cierra"
```
1. Simula 5 LISTA_PARA_COMPRAR
2. Propone: "cierre más directo", "menos explicación"
3. Compara: +15% en simulación
4. A/B test al 15%
5. Compara: real +12%, aplica 100%
```

---

## Métricas Clave

| Métrica | Significado | Acción |
|---------|-------------|--------|
| Simulación +12% | Promete mejora teórica | A/B test si es >5% |
| Real +8% | Mejora verificada | Aplica si es >5% |
| Real -3% | Degrada | Rollback inmediato |
| Real +1% | Neutral | Observa más días |

---

## Seguridad y Límites

✅ **Seguro:**
- Simulaciones NUNCA escriben conversaciones reales
- A/B test segmentación por hash (determinístico)
- Versiones candidatas no tocan producción hasta aplicar
- Rollback reversible en 1 segundo

⚠️ **Límites:**
- A/B test dura máximo 30 días
- Una sola versión en test simultáneamente (próxima: multi-version)
- Simulación es 80-90% precisa (no es realidad)
- Requiere >5% mejora para considerarse significativo

❌ **Prohibido:**
- No aplicar cambios directamente a 100% sin A/B test
- No modificar el prompt a mano durante A/B test
- No meter cambios de código; solo prompts aquí

---

## Automatización (Fase 3+)

Próximas mejoras (ya planificadas):

```
✓ Nightly simulation: cron que simula arquetipos cada noche
✓ Auto-alert: Slack cuando se detecta degradación
✓ Dashboard: gráficos de conversión en tiempo real
✓ Multi-version: 3-5 versiones en A/B test simultáneamente
✓ Auto-apply: aplicación automática si mejora > 10% por 7 días
```

**Sin confirmación manual del usuario, todo se ejecuta vía API.**

---

## Troubleshooting

| Problema | Causa | Solución |
|----------|-------|----------|
| "Versión candidata no se guarda" | Hallazgos vacíos | Simula primero, espera hallazgos |
| "A/B test no segmenta tráfico" | conversationId no pasa | Verificar en adaptador.ts |
| "Conversión mide 0%" | conversationId aún sin completar | Esperar 7 días, conversa más |
| "Rollback no recupera" | Versión anterior sin estado | Verificar isActive en DB |

---

## Commits Principales

```
8558ced - feat: Simulación core + arquetipos
ae5e5b1 - ui: Panel dedicado + chat scoped
c14146c - feat: Fase 1 completa
7c1e333 - feat: A/B testing + rollback
784ac74 - feat: Comparador de A/B resultados
111a6e8 - test: Fase 2 A/B testing suite
7ea760e - docs: Guía usuario + implementación
0e65b11 - feat: Routing A/B en motor-nuevo
```

---

## Contacto y Soporte

- **Documentación técnica:** `AGENT_LAB_IMPLEMENTATION.md`
- **Tests:** `__tests__/agent-lab-*.test.ts`
- **Backend:** `src/lib/motor-nuevo/` + `app-operator.ts`
- **Frontend:** `/agent-lab` en panel

---

**Agent Lab está listo. Empieza hoy con: "Simula 5 clientes NORMAL"**
