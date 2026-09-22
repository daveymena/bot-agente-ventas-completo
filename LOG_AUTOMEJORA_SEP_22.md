# LOG DE DESPLIEGUE: Automejora de Agentes (22-09-2026)

## 🚀 Cambios Implementados

### 1. Sofía $\rightarrow$ Recepcionista
- **Antes**: "Directora de Ventas Élite" que intentaba cerrar ventas y dar precios.
- **Ahora**: "Recepcionista de Ventas". Su misión es saludar, calificar y derivar.
- **Impacto**: Elimina alucinaciones de precios y evita que Sofía bloquee la venta del especialista.

### 2. Rails de Seguridad $\rightarrow$ Arquitecto/Atlas
- **Cambio**: Se añadió la sección `🛡️ LÍMITES DUROS` al prompt del Arquitecto.
- **Impacto**: Prohibición de borrar datos, tocar credenciales o cambiar precios sin aprobación explícita del dueño.

### 3. Router de Traspaso (Handoff)
- **Lógica**: Si el agente actual es `general` y el cliente nombra un producto concreto ($\text{score} \ge 50$), se ignora la continuidad y se asigna el especialista.
- **Impacto**: El cliente ya no se queda "atrapado" con la recepcionista si pide algo específico.

### 4. Motor de Auto-Reflexión Curada
- **Nuevo Módulo**: `artifacts/api-server/src/lib/auto-reflexion.ts`.
- **Funcionamiento**: Detecta errores $\rightarrow$ Reflexiona vía LLM $\rightarrow$ Cura (filtra mentiras/promesas falsas) $\rightarrow$ Aplica ajuste aditivo al prompt.
- **Seguridad**: Cada ajuste guarda una versión en `promptVersions` para rollback.

---

## 🧪 Cómo Probar en Producción

1. **Probar Traspaso**:
   - Iniciar chat con el negocio.
   - Escribir: *"Hola, quiero el curso de piano"* (o cualquier producto real).
   - **Éxito**: El agente que responde debe ser el especialista (ej. Luna), no Sofía.

2. **Probar Recepcionista**:
   - Preguntar a Sofía: *"¿Cuánto cuesta el curso?"*
   - **Éxito**: Debe responder que no maneja precios y derivarte al especialista.

3. **Probar Auto-Reflexión**:
   - Monitorear los logs de `api-server` buscando el tag `[AutoReflexion]`.
   - Verificar que se registren lecciones en `architect-memory`.

---

## 🚨 Emergencia: Cómo Revertir

Si el sistema presenta comportamiento inestable:
1. Ejecutar el script de emergencia:
   `npx ts-node artifacts/api-server/scripts/rollback-automejora.ts`
2. Reiniciar el servicio en EasyPanel.
