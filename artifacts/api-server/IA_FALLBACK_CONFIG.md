# Configuración de Fallback IA — DeepSeek → Ollama → Nvidia

**Saldo actual**: $1.50 USD  
**Cadena óptima**: DeepSeek → Ollama (gratis) → Nvidia (fallback)  
**Status**: ✅ AUTOMÁTICO (no requiere cambios de código)

---

## Cómo funciona hoy

Ver `lib/cadena-modelos.ts` → `armarCadena()`:

1. **CURADOS primero**: Lista fija (DeepSeek, OpenCode Zen, etc.)
2. **Descubiertos rápidos**: Cerebras, GitHub Copilot, etc.
3. **Respaldo**: OpenCode Zen (gratis)

Cuando DeepSeek devuelve error de saldo (402/429):
- `anotarFallo()` lo aparta automáticamente 6h
- El turno salta al siguiente candidato sin intervención

---

## Variables de entorno (si deseas override)

### Para vendedor (tarea rápida)
```bash
# Si Ollama se corta, vuelve a DeepSeek
IA_VENDEDOR=gemma4:31b-cloud

# O apaga Ollama y vuelve a DeepSeek directo
IA_VENDEDOR=off
```

### Para visión (SOLO gemma lee fotos)
```bash
IA_VISION=gemma4:31b-cloud
```

### Para redacción (ambos sirven, gpt-oss es más detallado)
```bash
IA_REDACCION=gpt-oss:120b-cloud,gemma4:31b-cloud
```

---

## Lo que está configurado AHORA en `modelos-por-tarea.ts`

| Tarea | Primario | Fallback 1 | Fallback 2 | Fallback 3 |
|-------|----------|-----------|-----------|-----------|
| **vendedor** | gemma4:31b (Ollama) | DeepSeek | OpenCode Zen | — |
| **intencion** | gemma4:31b (Ollama) | DeepSeek | OpenCode Zen | — |
| **redaccion** | gpt-oss:120b (Ollama) | gemma4:31b (Ollama) | DeepSeek | OpenCode Zen |
| **vision** | gemma4:31b (Ollama) | DeepSeek | OpenCode Zen | — |
| **fondo** | gpt-oss:20b (Ollama) | gemma4:31b (Ollama) | DeepSeek | OpenCode Zen |

---

## Cadena GLOBAL cuando alguno falla (orden de intento)

```
1. DeepSeek (curado, tiene saldo)
2. OpenCode Zen (curado, respalde si DeepSeek se queda sin saldo)
3. Cerebras (descubierto rápido, si tiene clave NVIDIA_API_KEY)
4. GitHub Copilot (descubierto rápido, si tiene token)
5. OpenCode Zen free (respaldo final, siempre disponible)
```

⚠️ **Groq está FUERA adrede** (se cuelga 45s via OpenCode, 2026-09-03)

---

## Si quieres que Nvidia sea más alto en la cadena

Hoy Nvidia NO está en CURADOS ni en PROVEEDORES_RAPIDOS. Para subirlo, edita `cadena-modelos.ts`:

### Opción 1: Meterlo en CURADOS (línea ~50 de operator-opencode.ts)
```ts
curados: [
  { providerID: "deepseek", modelID: "deepseek-chat" },
  { providerID: "nvidia", modelID: "meta/llama-3.1-70b-instruct" },  // ← NUEVO
  { providerID: "opencode", modelID: "gpt-5.6-luna" },
  ...
]
```

### Opción 2: Agregarlo a PROVEEDORES_RAPIDOS (cadena-modelos.ts:37)
```ts
export const PROVEEDORES_RAPIDOS = [
  "nvidia",  // ← NUEVO (70b es rápido, sin overhead de OpenCode)
  "cerebras",
  "github-copilot", "github_copilot", "copilot",
];
```

**Recomendación**: Opción 2. Nvidia responde rápido (medido 0,8-1,2s) sin el overhead de OpenCode (que añade 45s).

---

## Test rápido de la cadena

```bash
# Terminal: simular un turno de Atlas y ver qué candidatos intenta
npx tsx scripts/probar-cadena.ts

# O manualmente: verifica que estos variables de entorno existen
echo $DEEPSEEK_API_KEY
echo $OLLAMA_LOCAL_URL
echo $NVIDIA_API_KEY
echo $OPENCODE_API_KEY
```

---

## Monitoreo (saldo de DeepSeek)

Cuando saldo < $0.50:
- Atlas sigue respondiendo (Ollama gratis sale primero)
- Si Ollama se corta (tope 5s de `ollama_local`), salta a DeepSeek
- Si DeepSeek falla (402), salta a OpenCode Zen
- **Nunca se cuelga esperando un solo proveedor**

---

## Próximos pasos

1. ✅ Verificar que `NVIDIA_API_KEY` está cargada en EasyPanel (si no, ignorarla)
2. ⚠️ Si `OLLAMA_LOCAL_URL` está muerto (puerto 5432 cerrado), Ollama falla en 5s y salta a DeepSeek
3. ✅ El fallback a OpenCode Zen es automático y siempre está disponible (clave global)

**Costo medido** (100% uso):
- Ollama: $0
- DeepSeek: $0.003/msg (cuando se usa)
- Nvidia: $0
- OpenCode Zen: $0

**Con $1.50**: ~500 mensajes @ $0.003/msg antes de caer a gratis.

---

**Última update**: 2026-09-25 23:50 UTC  
**Config**: Automática, sin cambios necesarios
