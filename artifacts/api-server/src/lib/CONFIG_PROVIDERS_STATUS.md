# ⚙️ ESTADO: Configuración de API y Modelos

## ✅ LO QUE FUNCIONA HOY

### 1. **Sistema de Providers Flexible**
- ✅ Soporta múltiples proveedores de IA:
  - OpenAI (GPT-4, GPT-4o-mini, GPT-3.5)
  - Claude (via `@workspace/integrations-openai-ai-server`)
  - G4F (fallback local)
  - Azure OpenAI
- ✅ Fallback automático: si un provider falla, intenta otro
- ✅ Rate limiting y retry con backoff

### 2. **Configuración de Modelos por Agente**
- ✅ Cada agente puede tener su propio modelo:
  ```sql
  SELECT name, model FROM agents;
  -- Ejemplo: Sofía → gpt-4o-mini
  ```
- ✅ Se puede cambiar el modelo por agente en `/api/architect-tools/execute`
- ✅ Query: `action: "update-agent-prompt"` permite editar systemPrompt

### 3. **Configuración Global en Settings**
- ✅ Tabla `settings` con campo `aiProvider`
  - Valores actuales: `"opencode"` (por defecto)
- ✅ Soporta: timezone, language, currency, business metadata
- ✅ Editable via `PATCH /api/settings`

### 4. **Health Monitoring**
- ✅ Monitorea salud de providers de IA
- ✅ Monitorea salud de servicios de pago
- ✅ Métricas en tiempo real

---

## ❌ LO QUE FALTA PARA SER "REAL"

### 1. **Panel UI para Seleccionar API/Modelo**
**Falta:** Frontend en `/admin/settings` para:
- [ ] Dropdown para elegir provider (OpenAI, Claude, G4F, Azure, etc)
- [ ] Dropdown para elegir modelo (GPT-4, GPT-4o-mini, Claude 3 Sonnet, etc)
- [ ] API Key input fields para cada provider
- [ ] Testing button: "Probar conexión"
- [ ] Visor de modelos disponibles según provider seleccionado

**Impacto:** Sin UI, los clientes no pueden cambiar providers/modelos fácilmente

### 2. **Validación y Storage de API Keys**
**Falta:** 
- [ ] Almacenar API keys de forma segura (encrypted en DB)
- [ ] Validar formato de keys antes de guardar
- [ ] Rotación automática de keys
- [ ] Auditoría de cambios (quién cambió qué y cuándo)

**Impacto:** Actualmente los API keys vienen de `.env`

### 3. **Selección Dinámica de Modelo por Caso de Uso**
**Falta:**
- [ ] Permitir elegir modelo diferente para:
  - Conversations (más rápido: GPT-4o-mini)
  - Architect IA (más potente: GPT-4)
  - Lead Scoring (especializado)
  - Imagen generation (Dall-E, Midjourney)
  
**Impacto:** Hoy todos los agentes usan el mismo modelo

### 4. **Testing y Validación de Providers**
**Falta:**
- [ ] Endpoint `POST /api/settings/test-provider`
- [ ] Validar que provider esté funcionando
- [ ] Mostrar latencia, costos estimados
- [ ] Fallback automático si falla

**Impacto:** Clientes no saben si su API key es válida hasta que truena

### 5. **Dashboard de Costos y Uso**
**Falta:**
- [ ] Tracking de llamadas a cada provider
- [ ] Costo estimado por conversación/mes
- [ ] Alertas de overspending
- [ ] Reporte de uso por modelo

**Impacto:** Clientes ciegos a cuánto gastan

### 6. **Modelo de Facturación Flexible**
**Falta:**
- [ ] Opción: "Usa TU propia API key" (BYOK)
- [ ] Opción: "Usa mi key compartida" (pay-as-you-go)
- [ ] Switching sin downtime
- [ ] Facturación según tokens usados

---

## 🎯 PLAN PARA "HACERLO REAL"

### **FASE 1: Backend (2-3 horas)**
```
1. Crear tabla `provider_configs`:
   - provider_id (openai, claude, g4f, azure)
   - api_key (encrypted)
   - model_name
   - is_active
   - tenant_id
   
2. Endpoints:
   POST /api/settings/providers - crear/actualizar
   GET /api/settings/providers - listar
   POST /api/settings/test-provider - validar
   DELETE /api/settings/providers/:id - eliminar
   
3. Validación:
   - Encriptar/desencriptar API keys
   - Validar formato según provider
   - Test de conexión
```

### **FASE 2: Frontend (2-3 horas)**
```
1. Crear <ProviderConfig /> component:
   - Dropdown provider
   - API key input (masked)
   - Model selector (dinámico según provider)
   - Test button
   - Status indicator
   
2. Integrar en /admin/settings
3. Mostrar uso actual y fallback
```

### **FASE 3: Auditoría y Seguridad (1-2 horas)**
```
1. Logging de cambios de provider/keys
2. Permisos: solo admin puede cambiar
3. Secrets management (CI/CD)
4. Auditoría: quién cambió qué y cuándo
```

---

## 📊 ESTADO ACTUAL

| Capacidad | Hoy | Necesita |
|-----------|-----|----------|
| Multi-provider backend | ✅ | - |
| Selección dinámica | ✅ | UI Frontend |
| Almacenamiento seguro de keys | ⚠️ | Encryption DB |
| Panel de configuración UI | ❌ | **Prioritario** |
| Testing de providers | ⚠️ | Endpoint `/test-provider` |
| Dashboard de costos | ❌ | Backend + Frontend |
| Validación de keys | ⚠️ | Mejor validación |
| Auditoría | ❌ | Logging table |

---

## 💡 RECOMENDACIÓN

**El sistema backend de providers YA FUNCIONA.** Lo que falta es la **interfaz de usuario** para que:
1. Clientes puedan elegir provider sin editar código
2. Clientes puedan cambiar API keys sin acceso a .env
3. Clientes vean costos y uso en tiempo real

**Siguiente paso:** Implementar `ProviderConfig` UI en EasyPanel antes de subir a producción.
