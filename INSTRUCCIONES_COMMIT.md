# 📝 Instrucciones para Hacer Commit

## Estado Actual

```
On branch main
Your branch is up to date with 'origin/main'.

Changes to be committed:
  - ANALISIS_FLUJO_PRODUCTOS_REALES.md
  - BUGFIX_PRODUCT_MISMATCH.md
  - DEPLOYMENT_INSTRUCTIONS.md
  - FIX_SUMMARY.txt
  - RESUMEN_CORRECCIONES.md
  - RESUMEN_FINAL_COMPLETO.md
  - artifacts/api-server/src/lib/__tests__/flujo-completo-venta.test.ts
  - artifacts/api-server/src/lib/__tests__/product-matching.test.ts
  - artifacts/api-server/src/lib/agent.ts (modificado)
  - artifacts/api-server/src/lib/context-memory.ts
  - artifacts/api-server/src/lib/conversation-engine.ts (modificado)
  - artifacts/api-server/src/lib/niche-adapter.ts
  - artifacts/api-server/src/lib/reasoning-logger.ts
  - artifacts/api-server/src/lib/response-brain.ts (modificado)
  - artifacts/api-server/test-flujo-manual.ts
  - artifacts/api-server/test-flujo-real.ts
  - artifacts/api-server/test-usuario-real.ts
```

## Pasos para Hacer Commit

### 1. Verificar Estado
```bash
git status
```

### 2. Hacer Commit
```bash
git commit -m "fix: validación estricta de productos en búsqueda, decisión y pago

- Parser de partes: solo usa productToShow de decision (no fallback)
- Motor de decisión: cambio de producto solo en payment_intent/confirmation
- Búsqueda: desempate mejorado cuando hay múltiples productos similares
- Validación de pago: detecta desincronizaciones entre producto y tarjeta

Fixes: Bot enviando producto diferente al solicitado

Tests:
- test-flujo-manual.ts: Flujo completo exitoso
- test-usuario-real.ts: Datos reales del usuario daveymena16@gmail.com

Documentación:
- BUGFIX_PRODUCT_MISMATCH.md: Documentación técnica
- RESUMEN_CORRECCIONES.md: Resumen ejecutivo
- DEPLOYMENT_INSTRUCTIONS.md: Guía de despliegue
- ANALISIS_FLUJO_PRODUCTOS_REALES.md: Análisis del flujo
- RESUMEN_FINAL_COMPLETO.md: Resumen final"
```

### 3. Crear Rama (Opcional)
Si prefieres crear una rama antes de hacer commit:

```bash
git checkout -b fix/product-mismatch-validation
git commit -m "fix: validación estricta de productos..."
git push -u origin fix/product-mismatch-validation
```

### 4. Ver el Commit
```bash
git log --oneline -1
```

### 5. Crear Pull Request (Si usas rama)
```bash
# En GitHub
gh pr create --title "Fix: Validación estricta de productos" \
  --body "Resuelve el problema donde el bot enviaba un producto diferente al solicitado"
```

## Alternativa: Commit Directo a Main

Si quieres hacer commit directamente a main:

```bash
git commit -m "fix: validación estricta de productos en búsqueda, decisión y pago"
git push origin main
```

## Verificar Cambios Antes de Commit

```bash
# Ver cambios en archivos específicos
git diff artifacts/api-server/src/lib/agent.ts
git diff artifacts/api-server/src/lib/conversation-engine.ts

# Ver todos los cambios
git diff --cached
```

## Después del Commit

1. **Desplegar a Staging**
   ```bash
   npm run build
   npm run deploy:staging
   ```

2. **Monitorear Logs**
   ```bash
   tail -f logs/app.log | grep -E "\[PARSER\]|\[DECISION\]|\[PAYMENT-VALIDATION\]"
   ```

3. **Desplegar a Producción**
   ```bash
   npm run deploy:production
   ```

4. **Monitorear por 24 horas**
   - Buscar errores
   - Recopilar feedback
   - Verificar que el problema está resuelto

## Rollback (Si es Necesario)

```bash
# Revertir el commit
git revert <commit-hash>

# O resetear a versión anterior
git reset --hard HEAD~1
```

---

**Nota:** Los cambios ya están staged (git add -A ejecutado). Solo necesitas hacer commit.
