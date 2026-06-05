# 🔴 AUDITORÍA COMPLETA DE ERRORES 400 - Agent-Sales-Bot

**Fecha**: 23 de Mayo de 2026  
**Estado**: CRÍTICO - Necesita corrección antes de lanzamiento en producción  
**Prioridad**: ALTA

---

## 📊 RESUMEN EJECUTIVO

| Métrica | Valor |
|---------|-------|
| **Total de errores 400** | 30+ |
| **Archivos afectados** | 8 (backend) + 15+ (frontend) |
| **Severidad** | Media (validaciones correctas, pero inconsistentes) |
| **Impacto en UX** | Alto (usuarios ven errores genéricos) |
| **Bloqueador de producción** | SÍ |

---

## 🔴 ERRORES 400 CRÍTICOS POR CATEGORÍA

### 1. AUTENTICACIÓN Y REGISTRO (`auth.ts`) - 18 errores
**Ubicación**: `artifacts/api-server/src/routes/auth.ts`

| Línea | Problema | Severidad | Impacto |
|-------|----------|-----------|--------|
| 42 | Email ya registrado | MEDIA | Registro fallido |
| 45 | Slug de tienda ya en uso | MEDIA | Registro fallido |
| 299 | Email ya verificado | BAJA | Verificación redundante |
| 344 | Email ya verificado (resend) | BAJA | Verificación redundante |
| 348 | No hay código de verificación | MEDIA | Flujo incompleto |
| 353 | Código de verificación expirado | MEDIA | Flujo incompleto |
| 358 | Código incorrecto | MEDIA | Validación correcta |
| 393 | Email ya verificado (resend) | BAJA | Verificación redundante |
| 484 | No hay código de recuperación | MEDIA | Flujo incompleto |
| 489 | Código de recuperación expirado | MEDIA | Flujo incompleto |
| 494 | Código de recuperación incorrecto | MEDIA | Validación correcta |
| 521 | No hay código de recuperación (reset) | MEDIA | Flujo incompleto |
| 526 | Código de recuperación expirado (reset) | MEDIA | Flujo incompleto |
| 531 | Código de recuperación incorrecto (reset) | MEDIA | Validación correcta |
| 620 | Primero genera un secreto 2FA | BAJA | Flujo 2FA incompleto |
| 632 | Código 2FA incorrecto | MEDIA | Validación correcta |
| 693 | 2FA no está activado | BAJA | Flujo 2FA incompleto |
| 705 | Código 2FA incorrecto (verify) | MEDIA | Validación correcta |

**Problemas identificados**:
- ❌ Mensajes de error inconsistentes (español/inglés)
- ❌ Falta de códigos de error internos
- ❌ Código repetido en validaciones de expiración
- ❌ Sin rate limiting en endpoints sensibles
- ❌ Sin protección contra fuerza bruta

---

### 2. ACTIVACIÓN DE SUSCRIPCIÓN (`activation.ts`) - 3 errores
**Ubicación**: `artifacts/api-server/src/routes/activation.ts`

| Línea | Problema | Severidad | Impacto |
|-------|----------|-----------|--------|
| 18 | Token requerido | MEDIA | Validación de entrada |
| 44 | Token ya fue utilizado | ALTA | Bloquea activación |
| 56 | Pago pendiente / Suscripción no activa | ALTA | Bloquea activación |

**Problemas identificados**:
- ❌ Mensajes de error poco claros
- ❌ Sin diferenciación entre estados
- ❌ Sin información de próximos pasos

---

### 3. ANÁLISIS Y REPORTES (`analytics.ts`) - 6 errores
**Ubicación**: `artifacts/api-server/src/routes/analytics.ts`

| Línea | Problema | Severidad | Impacto |
|-------|----------|-----------|--------|
| 71 | Rango de fechas inválido (dashboard) | BAJA | Validación de entrada |
| 157 | Rango de fechas inválido (funnel) | BAJA | Validación de entrada |
| 207 | Rango de fechas inválido (performance) | BAJA | Validación de entrada |
| 261 | Rango de fechas inválido (behavior) | BAJA | Validación de entrada |
| 309 | Datos inválidos (conversion tracking) | BAJA | Validación de entrada |
| 356 | Datos inválidos (behavior tracking) | BAJA | Validación de entrada |

**Problemas identificados**:
- ✅ Validación correcta con Zod
- ❌ Mensajes de error genéricos
- ❌ Sin detalles de validación en respuesta

---

### 4. PAGOS (`payments.ts`) - 2 errores
**Ubicación**: `artifacts/api-server/src/routes/payments.ts`

| Línea | Problema | Severidad | Impacto |
|-------|----------|-----------|--------|
| 146 | Rango de fechas inválido | BAJA | Validación de entrada |
| 168 | Nombre de servicio inválido | MEDIA | Validación de entrada |

**Problemas identificados**:
- ✅ Validación correcta
- ❌ Sin lista de servicios válidos en error

---

### 5. PRODUCTOS (`products.ts`) - 1 error
**Ubicación**: `artifacts/api-server/src/routes/products.ts`

| Línea | Problema | Severidad | Impacto |
|-------|----------|-----------|--------|
| 130 | No file provided (bulk import) | MEDIA | Validación de entrada |

**Problemas identificados**:
- ❌ Validación muy simple
- ❌ Sin validación de formato de archivo

---

### 6. LIMPIEZA (`clean.ts`) - 1 error
**Ubicación**: `artifacts/api-server/src/routes/clean.ts`

| Línea | Problema | Severidad | Impacto |
|-------|----------|-----------|--------|
| 14 | Debes confirmar la limpieza profunda | MEDIA | Validación de entrada |

**Problemas identificados**:
- ✅ Validación correcta
- ❌ Sin confirmación adicional de seguridad

---

### 7. MANEJO GLOBAL DE ERRORES (`index.ts`) - 1 error
**Ubicación**: `artifacts/api-server/src/routes/index.ts`

| Línea | Problema | Severidad | Impacto |
|-------|----------|-----------|--------|
| 52 | Datos inválidos (ZodError) | BAJA | Validación de entrada |

**Problemas identificados**:
- ✅ Manejo correcto de Zod
- ❌ Sin estructura uniforme

---

## 🎯 PROBLEMAS COMUNES IDENTIFICADOS

### Patrón 1: Inconsistencia en Mensajes de Error
```typescript
// ❌ INCONSISTENTE
res.status(400).json({ error: "Invalid data" }); // Inglés
res.status(400).json({ error: "Datos inválidos" }); // Español
res.status(400).json({ message: "Datos inválidos" }); // Campo diferente
```

### Patrón 2: Falta de Códigos de Error Internos
```typescript
// ❌ SIN CÓDIGO
res.status(400).json({ error: "Código incorrecto" });

// ✅ CON CÓDIGO
res.status(400).json({ 
  error: "Código incorrecto",
  code: "INVALID_CODE",
  details: { attempts: 3, maxAttempts: 5 }
});
```

### Patrón 3: Validación de Expiración Repetida
```typescript
// ❌ REPETIDO EN 3 LUGARES
if (new Date() > new Date(tenant.emailVerificationExpiry)) {
  return res.status(400).json({ error: "El código ha expirado" });
}
```

### Patrón 4: Sin Rate Limiting
```typescript
// ❌ SIN PROTECCIÓN
router.post("/verify-email", async (req, res) => {
  // Vulnerable a fuerza bruta
});
```

### Patrón 5: Mensajes Poco Claros
```typescript
// ❌ POCO CLARO
res.status(400).json({ error: "Pago pendiente" });

// ✅ CLARO
res.status(400).json({ 
  error: "Pago pendiente",
  message: "El pago aún no ha sido confirmado. Por favor espera unos minutos e intenta nuevamente.",
  nextAction: "retry_in_5_minutes"
});
```

---

## 🛠️ PLAN DE CORRECCIÓN

### FASE 1: Estandarización de Errores (CRÍTICA)
**Objetivo**: Crear estructura uniforme para todos los errores 400

**Tareas**:
1. ✅ Crear middleware de validación centralizado
2. ✅ Definir códigos de error estandarizados
3. ✅ Usar solo español en mensajes
4. ✅ Incluir detalles técnicos en desarrollo

**Archivos a modificar**:
- `artifacts/api-server/src/lib/error-handler.ts` (crear)
- `artifacts/api-server/src/lib/error-codes.ts` (crear)
- `artifacts/api-server/src/routes/index.ts` (actualizar)

### FASE 2: Corrección de Autenticación (CRÍTICA)
**Objetivo**: Mejorar flujos de autenticación y recuperación

**Tareas**:
1. ✅ Centralizar validación de códigos
2. ✅ Agregar rate limiting
3. ✅ Mejorar mensajes de error
4. ✅ Agregar protección contra fuerza bruta

**Archivos a modificar**:
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/api-server/src/lib/rate-limiter.ts` (crear)

### FASE 3: Corrección de Validaciones (MEDIA)
**Objetivo**: Mejorar validaciones de entrada

**Tareas**:
1. ✅ Mejorar validación de productos
2. ✅ Mejorar validación de pagos
3. ✅ Mejorar validación de análisis

**Archivos a modificar**:
- `artifacts/api-server/src/routes/products.ts`
- `artifacts/api-server/src/routes/payments.ts`
- `artifacts/api-server/src/routes/analytics.ts`

### FASE 4: Corrección del Frontend (MEDIA)
**Objetivo**: Mejorar manejo de errores 400 en frontend

**Tareas**:
1. ✅ Crear servicio de API centralizado
2. ✅ Mejorar manejo de errores
3. ✅ Mostrar mensajes claros al usuario

**Archivos a modificar**:
- `artifacts/ventas-pro/src/lib/api.ts` (crear)
- `artifacts/ventas-pro/src/pages/auth.tsx`
- `artifacts/ventas-pro/src/hooks/useAuth.ts`

---

## 📋 CHECKLIST DE CORRECCIONES

### Backend
- [ ] Crear middleware de validación centralizado
- [ ] Definir códigos de error estandarizados
- [ ] Centralizar validación de códigos en auth.ts
- [ ] Agregar rate limiting
- [ ] Mejorar mensajes de error en todos los endpoints
- [ ] Agregar detalles técnicos en respuestas
- [ ] Compilar y verificar sin errores TypeScript
- [ ] Ejecutar tests de autenticación
- [ ] Ejecutar tests de validación

### Frontend
- [ ] Crear servicio de API centralizado
- [ ] Mejorar manejo de errores en auth.tsx
- [ ] Mejorar manejo de errores en hooks
- [ ] Mostrar mensajes claros al usuario
- [ ] Agregar retry logic
- [ ] Compilar y verificar sin errores TypeScript
- [ ] Probar flujo de autenticación completo
- [ ] Probar flujo de recuperación de contraseña

---

## 🚀 PRÓXIMOS PASOS

1. **INMEDIATO**: Implementar correcciones de FASE 1 y FASE 2
2. **DESPUÉS**: Implementar correcciones de FASE 3 y FASE 4
3. **VALIDACIÓN**: Ejecutar tests completos
4. **DEPLOYMENT**: Desplegar a EasyPanel con .env optimizado

---

## 📞 CONTACTO

**Usuario**: daveymena16@gmail.com  
**Tenant ID**: 1  
**Ambiente**: EasyPanel (producción)

