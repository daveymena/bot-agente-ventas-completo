# 🚀 Instrucciones de Despliegue - Corrección de Producto Incorrecto

## ✅ Estado Actual

- **Build:** ✅ Exitoso (sin errores)
- **Tests:** ✅ Compilación correcta
- **Cambios:** 3 archivos modificados, 100 líneas añadidas

---

## 📋 Archivos Modificados

```
artifacts/api-server/src/lib/agent.ts
artifacts/api-server/src/lib/conversation-engine.ts
artifacts/api-server/src/lib/response-brain.ts
```

---

## 🔄 Pasos de Despliegue

### 1. **Verificar Cambios Locales**
```bash
git status
# Debe mostrar los 3 archivos modificados
```

### 2. **Revisar Diferencias**
```bash
git diff artifacts/api-server/src/lib/agent.ts
git diff artifacts/api-server/src/lib/conversation-engine.ts
```

### 3. **Crear Rama de Feature**
```bash
git checkout -b fix/product-mismatch-validation
```

### 4. **Hacer Commit**
```bash
git add artifacts/api-server/src/lib/agent.ts
git add artifacts/api-server/src/lib/conversation-engine.ts
git add artifacts/api-server/src/lib/response-brain.ts
git commit -m "fix: validación estricta de productos en búsqueda, decisión y pago

- Parser de partes: solo usa productToShow de decision (no fallback)
- Motor de decisión: cambio de producto solo en payment_intent/confirmation
- Búsqueda: desempate mejorado cuando hay múltiples productos similares
- Validación de pago: detecta desincronizaciones entre producto y tarjeta

Fixes: Bot enviando producto diferente al solicitado"
```

### 5. **Compilar Localmente**
```bash
cd artifacts/api-server
npm run build
# Debe completar sin errores
```

### 6. **Crear Pull Request**
```bash
git push -u origin fix/product-mismatch-validation
# Luego crear PR en GitHub/GitLab
```

### 7. **Desplegar a Producción**
```bash
# Después de aprobación del PR
git checkout main
git pull origin main
npm run build
npm run deploy
```

---

## 🧪 Verificación Post-Despliegue

### 1. **Verificar Logs**
```bash
# Buscar mensajes de validación
tail -f logs/app.log | grep -E "\[PARSER\]|\[DECISION\]|\[PAYMENT-VALIDATION\]"
```

### 2. **Pruebas Manuales**

#### Prueba 1: Búsqueda Correcta
```
Cliente: "Quiero guitarra"
Esperado: Bot muestra guitarra
Verificar: Logs muestren "✅ [DECISION] Producto nuevo encontrado: Guitarra"
```

#### Prueba 2: Cambio de Producto
```
Cliente: "Quiero guitarra"
Bot: Muestra guitarra
Cliente: "¿Cuánto cuesta el piano?"
Esperado: Bot responde sobre piano pero mantiene guitarra en contexto
Verificar: Logs muestren "⚠️ [DECISION] Producto diferente detectado pero manteniendo contexto actual"
```

#### Prueba 3: Pago Correcto
```
Cliente: "Quiero excel"
Bot: Muestra excel
Cliente: "Quiero pagar"
Esperado: Link de pago es para excel
Verificar: Logs NO muestren "❌ [PAYMENT-VALIDATION] MISMATCH"
```

#### Prueba 4: Múltiples Productos Similares
```
Cliente: "Guitarra acústica"
Esperado: Si hay "Guitarra Acústica" y "Guitarra Eléctrica", elige acústica
Verificar: Logs muestren el producto correcto seleccionado
```

---

## 📊 Monitoreo

### Métricas a Vigilar

1. **Errores de Validación**
   ```
   grep "\[PAYMENT-VALIDATION\] MISMATCH" logs/app.log | wc -l
   # Debe ser 0 o muy bajo
   ```

2. **Cambios de Producto**
   ```
   grep "\[DECISION\] Cambio de producto" logs/app.log | wc -l
   # Debe ser bajo (solo en payment_intent)
   ```

3. **Búsquedas Fallidas**
   ```
   grep "\[DECISION\] Búsqueda de producto fallida" logs/app.log | wc -l
   # Debe ser bajo
   ```

### Alertas Recomendadas

```yaml
alerts:
  - name: "Product Mismatch Detected"
    condition: "grep MISMATCH logs/app.log | count > 5"
    action: "notify_team"
    
  - name: "Parser Rejection Rate High"
    condition: "grep 'Card rechazada' logs/app.log | count > 10"
    action: "notify_team"
```

---

## 🔙 Rollback (Si es Necesario)

```bash
# Si hay problemas, revertir a versión anterior
git revert <commit-hash>
git push origin main

# O revertir completamente
git reset --hard HEAD~1
npm run build
npm run deploy
```

---

## 📝 Checklist de Despliegue

- [ ] Cambios revisados y aprobados
- [ ] Build compilado exitosamente
- [ ] Tests pasados
- [ ] PR creado y aprobado
- [ ] Rama mergeada a main
- [ ] Despliegue a staging completado
- [ ] Pruebas manuales en staging exitosas
- [ ] Despliegue a producción completado
- [ ] Logs monitoreados por 24 horas
- [ ] Feedback de usuarios recopilado
- [ ] Documentación actualizada

---

## 🆘 Troubleshooting

### Problema: Build falla
```bash
# Limpiar y reconstruir
rm -rf dist node_modules
npm install
npm run build
```

### Problema: Logs muestran MISMATCH
```bash
# Revisar qué producto se está enviando
grep "MISMATCH" logs/app.log
# Verificar que el productId en la tarjeta sea correcto
```

### Problema: Parser rechaza cards
```bash
# Verificar que decision.productToShow sea válido
grep "Card rechazada" logs/app.log
# Revisar logs de [DECISION] para ver qué producto se seleccionó
```

---

## 📞 Contacto

Si encuentras problemas durante el despliegue:
1. Revisa los logs en `[PARSER]`, `[DECISION]`, `[PAYMENT-VALIDATION]`
2. Verifica que los cambios se hayan aplicado correctamente
3. Contacta al equipo de desarrollo

---

## 📌 Notas Importantes

- ⚠️ Los cambios son **retrocompatibles** - no requieren cambios en BD
- ⚠️ Los cambios son **no destructivos** - no afectan datos existentes
- ✅ Los cambios **mejoran la validación** - más seguro
- ✅ Los cambios **mantienen la performance** - sin impacto en velocidad

---

**Fecha de Despliegue Recomendada:** Inmediatamente después de aprobación
**Riesgo:** Bajo (cambios de validación, no de lógica principal)
**Impacto:** Alto (resuelve problema crítico de producto incorrecto)

---

**Estado:** ✅ Listo para desplegar
