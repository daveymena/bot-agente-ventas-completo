# Código que se lee como función y no lo es

Auditado el 2026-08-29 sobre los 219 archivos de `artifacts/api-server/src`.

**4.139 líneas que nadie importa.** No son archivos vacíos ni experimentos a
medio escribir: son módulos completos, con exports, comentarios y lógica, que
se leen exactamente igual que el código vivo.

Es el hallazgo que más caro sale en una revisión técnica: quien lo encuentra
asume que hay más, y descuenta todo lo demás.

## La ilustración del problema

`lib/analytics.ts:336` dice, en un comentario:

> *"No real uptime/error-rate monitoring infrastructure exists yet (no persisted
> connection-state history, no error event log)."*

Y a dos carpetas de distancia está **`lib/monitoring.ts`: 345 líneas, 7
exports, sin un solo import**.

El proyecto no sabe lo que tiene.

---

## TERMINAR — valen la pena, y una cierra un hueco de venta

| Archivo | Líneas | Por qué |
|---|---|---|
| `lib/monitoring.ts` | 345 | **La más valiosa de la lista.** "Falla en silencio" es uno de los cinco huecos ante un comprador, y todo el día de hoy lo confirmó: modelos dados de baja, un filtro anulado, Advantage+ apagado — ninguno daba error, daban lentitud. Este módulo ya existe; conectarlo cierra la objeción sin construir nada nuevo. |
| `lib/copilot-auth.ts` | 107 | No está muerto: está **dormido**. Es el intercambio de token de Copilot, y no lo llama nadie porque no hay token cargado (ver `PENDIENTE_ADMIN.md` §5). El día que exista la credencial, esto es lo que la usa. **No borrar.** |

## BORRAR — reemplazados por algo mejor que sí corre

| Archivo | Líneas | Qué lo reemplazó |
|---|---|---|
| `lib/response-validator.ts` | 301 | `precio-verificado.ts`, y su propio comentario lo dice: *"response-validator.ts ya tenía un verificador de precios, pero solo miraba..."* |
| `lib/card-memory-manager.ts` | 481 | `conversation-engine.ts` lleva las fichas enviadas en `memory.sentProductIds` |
| `lib/hermes-reasoning-engine.ts` | 473 | `response-brain.ts` |
| `lib/hermes-prediction-engine.ts` | 265 | idem |
| `lib/hermes-model-router.ts` | 193 | `cadena-modelos.ts` + `optimized-rotation.ts` |
| `lib/reasoning-logger.ts` | 37 | el logger normal |

**La familia `hermes-*` son 931 líneas**: un motor de razonamiento paralelo
entero, con router de modelos propio, que quedó sustituido y nunca se borró.

## VERIFICAR ANTES DE BORRAR — pueden ser funciones que nunca se cablearon

| Archivo | Líneas | La duda |
|---|---|---|
| `lib/product-disambiguator.ts` | 511 | Desambiguar productos es **justo** el problema que rompió el bot en agosto (ofrecía INGLÉS a quien pedía cocina). ¿Se resolvió en `conversation-engine.ts` y esto sobró, o esto es la solución buena que nunca se conectó? Vale mirarlo antes de tirarlo. |
| `lib/admin-commands.ts` | 334 | `verificacion-pago.ts:293` menciona su `isAdminPhone`. ¿Se movió esa lógica o se duplicó? |
| `lib/facebook-marketplace.ts` | 248 | Publicar en Marketplace. ¿Función abandonada o nunca terminada? |
| `lib/semantic-analyzer.ts` | 221 | |
| `lib/niche-adapter.ts` | 98 | Adaptar el bot a distintos nichos — suena a algo que un comprador querría. |
| `lib/context-memory.ts` | 71 | |

## DECIDIR — el equipo de marketing, a medias

| Archivo | Líneas |
|---|---|
| `marketing-team/agents/experiment-manager.ts` | 152 |
| `marketing-team/agents/budget-manager.ts` | 101 |
| `marketing-team/agents/optimization-agent.ts` | 89 |
| `marketing-team/agents/scaling-agent.ts` | 81 |
| `marketing-team/index.ts` (el barrel que nadie importa) | 31 |

De los 14 agentes de marketing, **9 corren y estos 4 no los llama nadie**. El
encabezado del orquestador dice que "se integran en las fases 4-7" — fases que
nunca se hicieron. Y documenta un pipeline de ocho pasos del que **existen
cuatro funciones**: `selectAgents`, `resolveDependencies`, `collectResults` y
`synthesize` no están escritas.

⚠️ **No son un atajo.** `experiment-manager` no tiene una sola referencia a la
Graph API: registra experimentos en la base, no arma tests en Meta. Conectarlo
no crearía ni un conjunto de anuncios.

**La decisión es binaria:** o se terminan las fases 4-7, o se borran los cuatro
y se corrige el encabezado del orquestador para que deje de prometer un
pipeline que no existe. Lo que no puede quedar es como está.

---

## Por dónde empezar

1. **Conectar `monitoring.ts`** — cierra un hueco de venta con código que ya
   existe.
2. **Borrar los seis reemplazados** (1.750 líneas) — sin riesgo: hay algo mejor
   corriendo en su lugar.
3. **Mirar `product-disambiguator.ts`** antes que el resto: 511 líneas sobre el
   problema que más caro salió este mes.
4. **Decidir el equipo de marketing**, y si se borra, arreglar el comentario del
   orquestador.

## Cómo se detectan de nuevo

```bash
# desde artifacts/api-server/src
# lista los módulos que nadie importa
python - <<'PY'
import os, re, io, collections
archivos = [os.path.join(d,f).replace("\\","/")[2:]
            for d,_,fs in os.walk(".") if "node_modules" not in d and "__tests__" not in d
            for f in fs if f.endswith(".ts")]
imp = collections.Counter()
for a in archivos:
    t = io.open(a, encoding="utf-8").read()
    for m in re.finditer(r'from\s+"([^"]+)"|import\("([^"]+)"\)', t):
        r = m.group(1) or m.group(2)
        if r.startswith("."): imp[os.path.basename(r)] += 1
for a in archivos:
    b = os.path.basename(a)[:-3]
    if b not in ("index","app","server") and imp[b] == 0:
        print(a)
PY
```

⚠️ Detecta por nombre de archivo, así que un módulo cargado dinámicamente por
string no aparecería. Antes de borrar, confirmar con
`grep -rn "<nombre>" --include=*.ts .` — y **leer si las coincidencias son
imports o solo comentarios**: los cuatro de esta lista que parecían usados
(`monitoring`, `admin-commands`, `response-validator`, `facebook-marketplace`)
solo se mencionaban en comentarios.
