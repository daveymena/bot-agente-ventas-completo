# Agent Lab — Guía Completa de Uso (Fase 1 + Fase 2)

**Última actualización:** 2026-09-25  
**Versión:** 2.0 (Fase 2 Real con A/B Testing)  
**Estado:** ✅ Producción-listo

---

## Resumen Ejecutivo

Agent Lab es la plataforma profesional de VentasPro para entrenar y mejorar agentes de venta **con seguridad y medición real**.

**Diferencia clave:**
- **Fase 1:** Simulación (sin riesgo) → propuesta de mejora
- **Fase 2:** A/B testing real → decisión basada en datos → aplicación a producción

---

## Flujo Completo (7 Pasos)

```
┌─────────────────────────────────────────────────────────────────┐
│ PASO 1: SIMULAR (Fase 1 - Teoría, 0 riesgo)                    │
├─────────────────────────────────────────────────────────────────┤
│ En /agent-lab, escribe:                                         │
│ "Simula 5 clientes desconfiados"                               │
│                                                                  │
│ ✅ Resultado: Servidor detecta problemas en simulación         │
│    - 3 de 5 compraron                                           │
│    - 2 hallazgos: "objeción de precio", "confianza baja"      │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ PASO 2: PROPONER MEJORA (Fase 1)                               │
├─────────────────────────────────────────────────────────────────┤
│ "Propone una mejora"                                            │
│                                                                  │
│ ✅ Resultado: LLM sugiere nuevo prompt, genera versión #42    │
│    - Cambios: "manejo de objeción" + "generar confianza"     │
│    - Guardada como candidata (sin tocar producción)            │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ PASO 3: COMPARAR EN SIMULACIÓN (Fase 1)                       │
├─────────────────────────────────────────────────────────────────┤
│ "Compara versión 42"                                           │
│                                                                  │
│ ✅ Resultado: Simulador vs Simulador                           │
│    - Actual: 72% éxito (3.6 de 5 clientes compran)           │
│    - Versión #42: 81% éxito (4.05 de 5)                      │
│    - Mejora teórica: +9%                                       │
│    - ⚠️ Aún es simulación, no real                             │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ PASO 4: LANZAR A/B TEST (Fase 2 - Producción segura)          │
├─────────────────────────────────────────────────────────────────┤
│ "Aplica versión 42 al 10% de tráfico por 7 días"             │
│                                                                  │
│ ✅ Resultado: A/B test lanzado                                │
│    - 10% de clientes nuevos: ven versión #42                 │
│    - 90% de clientes nuevos: ven versión actual              │
│    - Duración: 7 días                                          │
│    - Riesgo: BAJO (solo 10% afectado)                         │
│    - Reversible: sí (rollback en 1 comando)                   │
└─────────────────────────────────────────────────────────────────┘
                           ↓ (después de 7 días)
┌─────────────────────────────────────────────────────────────────┐
│ PASO 5: COMPARAR RESULTADOS REALES (Fase 2)                   │
├─────────────────────────────────────────────────────────────────┤
│ "Compara resultados del A/B test"                             │
│                                                                  │
│ ✅ Resultado: Datos REALES de producción                      │
│    - Control (90%): 65 compras de 100 contactos → 65%       │
│    - Tratamiento (10%): 8 compras de 10 contactos → 80%    │
│    - Mejora REAL: +15% (vs +9% predicho)                     │
│    - Recomendación: ✅ APLICA                                │
│    - Confianza: ALTA (mejora consistente)                    │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ PASO 6: APLICAR A PRODUCCIÓN (Fase 2)                         │
├─────────────────────────────────────────────────────────────────┤
│ "Aplica versión 42 al 100%"                                   │
│                                                                  │
│ ✅ Resultado: Producción actualizada                          │
│    - Todos los clientes nuevos ven versión #42               │
│    - Cambio es REVERSIBLE (rollback disponible)              │
│    - Historial completo guardado                              │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ PASO 7 (OPCIONAL): ROLLBACK SI ALGO SALE MAL                  │
├─────────────────────────────────────────────────────────────────┤
│ "Rollback a versión anterior"                                 │
│                                                                  │
│ ✅ Resultado: Volvemos a versión anterior en 1 segundo       │
│    - Todos ven el prompt viejo                                │
│    - Historial intacto                                        │
│    - Cero pérdida de datos                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Comandos por Etapa

### Fase 1: Simulación y Mejora (0 RIESGO)

```
# Simular clientes con arquitectipo específico
"Simula 5 desconfiados para el agente 1"

# Simular múltiples arquetipos
"Simula 3 NORMAL, 3 DESCONFIADO, 3 PRECIO_SENSIBLE"

# Ver qué arquetipos están disponibles
"¿Cuáles son los 14 arquetipos disponibles?"

# Proponer mejora basada en hallazgos
"Propone una mejora basada en los hallazgos"

# Comparar en simulación
"Compara versión 42 con la actual"
```

### Fase 2: A/B Testing Real (SEGURO + REVERSIBLE)

```
# Lanzar A/B test al 10% de tráfico
"Aplica versión 42 al 10% de tráfico por 7 días"

# Lanzar A/B test al 50% (más arriesgado, pero mide mejor)
"Aplica versión 42 al 50% de tráfico por 7 días"

# Ver resultados reales después de 7 días
"Compara resultados del A/B test de versión 42"

# Aplicar a 100% si los resultados son buenos
"Aplica versión 42 al 100%"

# Rollback si algo sale mal
"Rollback a versión anterior"
```

---

## Qué Son Los 14 Arquetipos

Cada uno simula un cliente REAL con comportamiento específico:

| Arquetipo | Características | Objeción típica | Mejor estrategia |
|-----------|-----------------|-----------------|------------------|
| **NORMAL** | Línea base | Estándar | Responder directo |
| **DESCONFIADO** | Rechaza buzzwords | "¿Cómo sé que funciona?" | Evidencia + casos reales |
| **PRECIO_SENSIBLE** | Negocia siempre | "Es caro" | Valor vs precio |
| **APRESURADO** | Decide en 2 turnos | "Mándame link ya" | Directo al punto |
| **INDECISO** | Miedo al cambio | "Lo voy a pensar" | Seguridad + garantía |
| **CLIENTE_DIFICIL** | Caótico | Salta entre temas | Paciencia + estructura |
| **ESCÉPTICO** | Duda de todo | "No funciona nunca" | Prueba gratuita |
| **EXPERTO** | Sabe del tema | "Pero el producto X..." | Reconocer expertise |
| **COMPARADOR** | Busca alternativas | "¿Por qué ustedes?" | Diferenciadores claros |
| **CURIOSO** | Hace 100 preguntas | "¿Cómo funciona X?" | Paciencia educativa |
| **LISTA_PARA_COMPRAR** | Solo confirma | "Perfecto, mándame" | Cierre rápido |
| **QUE_REGRESA** | Repite la compra | "Necesito lo mismo" | Upsell/cross-sell |
| **MOLESTO** | Enojado de entrada | "Perdi dinero antes" | Empatía + solución |
| **QUE_DESAPARECE** | Se va sin avisar | "Mañana te contesto" | Seguimiento agresivo |

**Estrategia:** Simula los que son MÁS problemáticos para tu negocio.

---

## Métricas Clave

### En Simulación
- **Compra:** ¿Cerró el cliente?
- **Tasa de éxito:** % de compras en N simulaciones
- **Hallazgos:** Qué salió mal específicamente

### En A/B Test
- **Grupo control:** El 90% (versión antigua)
- **Grupo tratamiento:** El 10-50% (versión nueva)
- **Conversión:** Compras reales / contactos
- **Mejora %:** ((Tratamiento - Control) / Control) * 100
- **Significancia:** >5% mejora = aplica; <-5% degradación = rollback

---

## Casos de Uso

### Caso 1: Problema de Objeción de Precio
```
1. Simula 5 PRECIO_SENSIBLE
   → Descubre: "no menciona descuentos", "precio no justificado"

2. Propone mejora
   → Nuevo prompt: "destacar ROI", "ofrecer planes"

3. Compara versión 42
   → Simulación: +12% éxito

4. Aplica al 10% (A/B test)
   → Espera 7 días

5. Compara resultados reales
   → Real: +8% éxito (casi como se predijo)

6. Aplica 100%
   → ✅ Todos ven nuevo prompt
```

### Caso 2: Cliente Desconfiado
```
1. Simula 5 DESCONFIADO
   → Problema: "no cree testimonios", "pide pruebas"

2. Propone mejora
   → Nuevo: "explicar funcionamiento", "casos de éxito"

3. Compara
   → Simulación: +7%

4. A/B test 20% (más conservador)
   → ¿Por qué 20%? Porque es menos riesgoso que 10%

5. Compara resultados
   → Si +5%: aplica. Si -3%: rollback

6. Rollback si falla (reversible en 1 segundo)
```

---

## Advertencias Críticas

⚠️ **No confundas simulación con realidad:**
- Simulación: LLM jugando cliente → útil para detectar problemas
- Real: clientes verdaderos → el único número que importa

⚠️ **A/B test siempre antes de 100%:**
- Nunca apliques un cambio directo a 100%
- Usa A/B: 10% → observa → decide

⚠️ **Rollback es reversible pero no es "deshacer":**
- Rollback revierte el prompt, NO los conversaciones pasadas
- Los clientes que compraron con v42 quedaron en la base

⚠️ **El 10-50% del tráfico es TU decisión:**
- 10%: conservador, datos ruidosos
- 50%: más confianza, mayor riesgo
- 25%: punto medio

---

## Cuándo Usar Cada Arquetipo

**Si tienes problemas de:**
- **Confianza:** DESCONFIADO, ESCÉPTICO
- **Precio:** PRECIO_SENSIBLE, COMPARADOR
- **Velocidad:** APRESURADO, LISTA_PARA_COMPRAR
- **Objeciones:** INDECISO, CLIENTE_DIFICIL
- **Educación:** CURIOSO, EXPERTO
- **Retención:** QUE_REGRESA
- **Seguimiento:** QUE_DESAPARECE

**Regla:** Simula los arquetipos que representan el 80% de TUS problemas.

---

## Próximos Pasos

1. **Hoy:** Abre `/agent-lab`, prueba "Simula 5 NORMAL"
2. **Mañana:** Haz A/B test real (10% tráfico, 7 días)
3. **En una semana:** Compara resultados reales
4. **Semana 2+:** Itera: simula → propone → test → aplica

---

## Soporte

- **Documentación técnica:** Ver `AGENT_LAB_IMPLEMENTATION.md`
- **Tests:** `__tests__/agent-lab-*.test.ts`
- **Backend:** `src/lib/app-operator.ts` (6 herramientas)
- **Frontend:** `/agent-lab` en el panel

---

**Versión:** 2.0 (Fase 1 + Fase 2 Real)  
**Commits:** 8 (simulación, UI, A/B testing, tests, rollback)  
**Estado:** ✅ Producción-listo
