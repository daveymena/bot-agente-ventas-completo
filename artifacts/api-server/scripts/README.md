# 🛠️ Scripts de Mantenimiento

Scripts útiles para administrar la base de datos y configuración.

## 📋 Scripts Disponibles

### 1. Reset de Conversaciones

**Comando:**
```bash
pnpm --filter "@workspace/api-server" run reset:conversations
```

**Qué hace:**
- ❌ Elimina todas las conversaciones
- ❌ Elimina todos los mensajes

**Qué mantiene:**
- ✅ Tenants y usuarios
- ✅ Agentes
- ✅ Productos
- ✅ Configuraciones
- ✅ Leads (contactos)

**Cuándo usar:**
- Cuando quieres empezar de cero con las conversaciones
- Para limpiar datos de prueba
- Antes de un demo o presentación

---

### 2. Setup de Usuario

**Comando:**
```bash
pnpm --filter "@workspace/api-server" run setup
```

**Qué hace:**
- Crea o actualiza el usuario principal
- Crea los 10 agentes desde templates
- Configura el tenant por defecto

**Credenciales por defecto:**
- Email: `daveymena16@gmail.com`
- Password: `6715320D`

---

### 3. Diagnóstico de Frontend

**Comando:**
```bash
pnpm --filter "@workspace/api-server" run diagnose
```

**Qué hace:**
- Verifica que el frontend esté construido
- Muestra la estructura de directorios
- Identifica problemas de configuración

**Cuándo usar:**
- Cuando el frontend no se renderiza en producción
- Para verificar que el build fue exitoso

---

### 4. Reset de Contraseña

**Archivo:** `scripts/reset-password.ts`

**Cómo usar:**
1. Edita el archivo y cambia el email y password
2. Ejecuta: `tsx scripts/reset-password.ts`

---

## 🚀 Uso en Producción (EasyPanel)

### Reset de Conversaciones en EasyPanel

1. Abre la **Terminal** del contenedor en EasyPanel
2. Ejecuta:
```bash
cd /app/artifacts/api-server
pnpm run reset:conversations
```

### Setup en EasyPanel

```bash
cd /app/artifacts/api-server
pnpm run setup
```

---

## ⚠️ Advertencias

- **Reset de Conversaciones**: Esta acción es **irreversible**. Asegúrate de hacer backup si necesitas los datos.
- **Setup**: Sobrescribe el agente Sofía si ya existe. Los demás agentes se crean solo si no existen.
- **Producción**: Ten cuidado al ejecutar scripts en producción. Siempre verifica el entorno primero.

---

## 💡 Tips

- Usa `reset:conversations` regularmente en desarrollo para mantener la base de datos limpia
- Ejecuta `setup` después de clonar el repositorio para configurar todo automáticamente
- Usa `diagnose` si tienes problemas con el frontend en producción
