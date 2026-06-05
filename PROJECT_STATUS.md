# 📊 Estado del Proyecto - VentasPro

**Última actualización:** Mayo 5, 2026

## ✅ Tareas Completadas

### 1. ✅ 10 Agentes Especializados Implementados

**Archivo:** `artifacts/api-server/src/lib/agent-templates.ts`

Los 10 agentes están creados y funcionando:

1. **Sofía** 👑 - General/Director de Ventas Élite
2. **Max** 📦 - Dropshipping/Productos Físicos
3. **Luna** 💎 - Productos Digitales/Megapacks
4. **Carlos** 🎯 - Servicios Digitales
5. **Diana** 📡 - Telecomunicaciones
6. **Andrés** 📱 - Marketing Digital
7. **Valentina** 📚 - Cursos y Formación
8. **Roberto** 💼 - B2B Empresarial
9. **Isabella** 🔄 - Suscripciones
10. **Nicolás** 🎣 - Follow-up/Recuperación

**Endpoints disponibles:**
- `GET /api/agents/templates` - Lista todos los templates
- `GET /api/agents/templates/:type` - Obtiene un template específico
- `POST /api/agents` - Crea agente desde template

---

### 2. ✅ Auto-Creación de Agentes

**Archivos modificados:**
- `artifacts/api-server/src/app.ts` - Auto-crea agentes al iniciar servidor
- `artifacts/api-server/src/setup-user.ts` - Crea agentes durante setup

**Comando:**
```bash
pnpm --filter "@workspace/api-server" run setup
```

**Resultado:** Los 10 agentes se crean automáticamente si no existen.

---

### 3. ✅ Router Inteligente de Agentes

**Archivo:** `artifacts/api-server/src/lib/agent-router.ts`

**Funcionalidad:**
- Analiza el mensaje del cliente
- Asigna scores a cada agente activo basado en:
  - Keywords matching (10 puntos por keyword)
  - Continuidad de conversación (20 puntos bonus)
  - Agente general fallback (15 puntos para Sofía)
- Selecciona el agente con mayor score
- Logs detallados de la selección

**Keywords por tipo de agente:**
- `dropshipping`: producto, envío, entrega, físico, gadget, precio, stock
- `digital_products`: curso, megapack, digital, descarga, pdf, tutorial
- `services`: servicio, diseño, desarrollo, web, logo, branding
- `telecom`: internet, wifi, fibra, plan, cobertura, velocidad
- `marketing`: publicidad, ads, facebook, instagram, campaña, seo
- `courses`: aprender, estudiar, formación, clase, certificado
- `b2b`: empresa, negocio, corporativo, licencia, contrato
- `subscriptions`: suscripción, membresía, mensual, renovar, premium
- `followup`: pensándolo, después, luego, dudas
- `general`: hola, ayuda, información, catálogo

---

### 4. ✅ Hot Reload con Nodemon

**Archivo:** `artifacts/api-server/nodemon.json`

**Configuración:**
```json
{
  "watch": ["src"],
  "ext": "ts,js,json",
  "ignore": ["src/**/*.test.ts", "node_modules"],
  "exec": "pnpm run build && pnpm run start",
  "delay": 1000
}
```

**Comando:**
```bash
pnpm run dev
```

**Resultado:** El servidor se reinicia automáticamente al detectar cambios en `src/`.

---

### 5. ✅ Frontend Renderizando en EasyPanel

**Problema resuelto:** Frontend usaba rutas relativas (`./assets/`) en lugar de absolutas (`/assets/`)

**Solución aplicada:**
- Modificado `artifacts/ventas-pro/vite.config.ts` para usar `base: "/"` en producción
- Creado script de diagnóstico: `check-frontend.js`
- Creado guía de troubleshooting: `EASYPANEL-DEBUG.md`

**Verificación:**
```bash
pnpm --filter "@workspace/api-server" run diagnose
```

---

### 6. ✅ Login Redirigiendo Correctamente

**Problema resuelto:** Login exitoso pero no redirigía al dashboard

**Solución aplicada:**
- Modificado `artifacts/ventas-pro/src/pages/auth.tsx`
- Agregado `await refreshSession()` después del login
- Actualiza el contexto de autenticación antes de redirigir

**Credenciales:**
- Email: `daveymena16@gmail.com`
- Password: `6715320D`

---

### 7. ✅ Script de Reset de Conversaciones

**Archivo:** `artifacts/api-server/scripts/reset-conversations.ts`

**Comando:**
```bash
pnpm --filter "@workspace/api-server" run reset:conversations
```

**Qué elimina:**
- ❌ Conversaciones
- ❌ Mensajes

**Qué mantiene:**
- ✅ Tenants y usuarios
- ✅ Agentes
- ✅ Productos
- ✅ Configuraciones
- ✅ Leads (contactos)

---

## 🚀 Comandos Principales

### Desarrollo Local

```bash
# Iniciar servidor API + Frontend con hot reload
pnpm run dev

# Solo API (puerto 3002)
pnpm --filter "@workspace/api-server" run dev

# Solo Frontend (puerto 5173)
pnpm --filter "@workspace/ventas-pro" run dev
```

### Setup y Mantenimiento

```bash
# Crear usuario y agentes
pnpm --filter "@workspace/api-server" run setup

# Reset conversaciones
pnpm --filter "@workspace/api-server" run reset:conversations

# Diagnóstico de frontend
pnpm --filter "@workspace/api-server" run diagnose
```

### Producción (EasyPanel)

```bash
# Dentro del contenedor
cd /app/artifacts/api-server

# Setup inicial
pnpm run setup

# Reset conversaciones
pnpm run reset:conversations

# Verificar frontend
pnpm run diagnose
```

---

## 🏗️ Arquitectura

### Monorepo con pnpm workspaces

```
/
├── artifacts/
│   ├── api-server/          # Express + PostgreSQL
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── agent-templates.ts    # 10 agentes
│   │   │   │   ├── agent-router.ts       # Router inteligente
│   │   │   │   └── agent.ts              # Lógica de agentes
│   │   │   ├── routes/
│   │   │   │   └── agents.ts             # Endpoints de agentes
│   │   │   └── app.ts                    # Configuración principal
│   │   ├── scripts/
│   │   │   ├── reset-conversations.ts    # Reset script
│   │   │   └── README.md                 # Documentación
│   │   └── package.json
│   └── ventas-pro/          # React + Vite
│       ├── src/
│       │   ├── pages/
│       │   │   └── auth.tsx              # Login/Register
│       │   └── App.tsx                   # Router principal
│       └── vite.config.ts                # Config con base: "/"
└── package.json
```

### Stack Tecnológico

- **Backend:** Express.js + TypeScript
- **Base de datos:** PostgreSQL (Drizzle ORM)
- **Frontend:** React + Vite + Wouter
- **WhatsApp:** Baileys
- **IA:** OpenAI GPT-4o-mini
- **Hot Reload:** Nodemon

---

## 🔐 Credenciales

### Base de Datos (PostgreSQL)
- Host: `79.143.187.160`
- Port: `5432`
- Database: `tecnovariedades-db`
- User: (ver `.env`)
- Password: (ver `.env`)

### Usuario Principal
- Email: `daveymena16@gmail.com`
- Password: `6715320D`

---

## 🌐 URLs

### Desarrollo
- Frontend: `http://localhost:5173`
- API: `http://localhost:3002`
- API Health: `http://localhost:3002/api/health`

### Producción (EasyPanel)
- Todo en: `http://[tu-dominio]:3002`
- Frontend: `http://[tu-dominio]:3002/`
- API: `http://[tu-dominio]:3002/api/`

---

## 📝 Notas Importantes

1. **Rutas absolutas en producción:** El frontend usa `base: "/"` para que los assets se carguen correctamente en EasyPanel.

2. **Hot reload solo en desarrollo:** Nodemon está configurado para desarrollo. En producción se usa `pnpm start`.

3. **Agentes activos:** Solo Sofía está activa por defecto. Puedes activar más agentes desde el panel de administración.

4. **Router inteligente:** Si hay múltiples agentes activos, el router selecciona automáticamente el más apropiado según el mensaje.

5. **Reset de conversaciones:** Útil para empezar de cero sin perder configuraciones, productos o leads.

---

## 🐛 Troubleshooting

### Frontend no se renderiza en EasyPanel

```bash
cd /app/artifacts/api-server
pnpm run diagnose
```

Verifica que:
- `index.html` existe en `/app/artifacts/ventas-pro/dist/public/`
- Los assets usan rutas absolutas (`/assets/`) no relativas (`./assets/`)

### Login no redirige

Verifica que:
- Las cookies están habilitadas
- CORS está configurado con `credentials: true`
- `refreshSession()` se llama después del login

### Agentes no aparecen

```bash
pnpm --filter "@workspace/api-server" run setup
```

Esto creará los 10 agentes si no existen.

---

## 📚 Documentación Adicional

- `artifacts/api-server/scripts/README.md` - Documentación de scripts
- `EASYPANEL-DEBUG.md` - Guía de troubleshooting para EasyPanel
- `artifacts/api-server/src/lib/agent-templates.ts` - Definición de agentes

---

## ✨ Próximos Pasos Sugeridos

1. **Activar más agentes:** Desde el panel, activa los agentes que necesites según tu catálogo
2. **Agregar productos:** Configura productos para cada tipo de agente
3. **Probar el router:** Envía mensajes con diferentes keywords para ver cómo el router selecciona agentes
4. **Personalizar prompts:** Ajusta los `systemPrompt` de cada agente según tu marca
5. **Configurar WhatsApp:** Conecta tu número de WhatsApp para recibir mensajes reales

---

**Estado:** ✅ Todos los sistemas operativos y funcionando correctamente
