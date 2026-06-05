# 🏗️ Arquitectura Completa - VentasPro SaaS

**Fecha:** Mayo 5, 2026  
**Versión:** 1.5 Premium

---

## 📋 Índice

1. [Visión General](#visión-general)
2. [Arquitectura Multi-Tenant](#arquitectura-multi-tenant)
3. [Sistema de Agentes IA](#sistema-de-agentes-ia)
4. [Sistema de Conversaciones](#sistema-de-conversaciones)
5. [Sistema de Autenticación](#sistema-de-autenticación)
6. [Sistema de Personalización](#sistema-de-personalización)
7. [Flujo Completo](#flujo-completo)
8. [Base de Datos](#base-de-datos)
9. [APIs y Endpoints](#apis-y-endpoints)
10. [Frontend](#frontend)

---

## 🎯 Visión General

VentasPro es una plataforma SaaS multi-tenant que permite a empresas automatizar sus ventas mediante agentes de IA especializados que conversan con clientes por WhatsApp.

### Características Principales

- ✅ **Multi-Tenant**: Cada cliente tiene su propia instancia aislada
- ✅ **10 Agentes IA Especializados**: Cada uno experto en un tipo de venta
- ✅ **Router Inteligente**: Selecciona el mejor agente según el contexto
- ✅ **WhatsApp Integration**: Comunicación directa con clientes
- ✅ **Personalización Completa**: Cada tenant tiene su marca
- ✅ **Autenticación Segura**: Verificación de email y recuperación de contraseña
- ✅ **Responsive**: Funciona perfectamente en móvil y desktop

---

## 🏢 Arquitectura Multi-Tenant

### Concepto

Cada **tenant** (cliente de VentasPro) tiene:
- Su propia base de datos lógica (aislamiento por `tenant_id`)
- Sus propios agentes IA
- Sus propias conversaciones
- Sus propios productos
- Su propia configuración de marca
- Sus propios límites según el plan

### Estructura de Tenant

```typescript
interface Tenant {
  // Identificación
  id: number;
  name: string;
  email: string;
  slug: string; // URL única: app.com/mi-tienda
  domain?: string; // Dominio personalizado (opcional)
  
  // Marca
  brandName: string;
  brandLogo?: string;
  brandColors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    foreground: string;
    muted: string;
  };
  brandTheme: {
    mode: "light" | "dark" | "auto";
    font: string;
    borderRadius: "none" | "sm" | "md" | "lg" | "xl";
    customCSS?: string;
  };
  brandSocial: {
    website?: string;
    facebook?: string;
    instagram?: string;
    // ...
  };
  
  // Plan y Límites
  plan: "starter" | "professional" | "enterprise";
  status: "trial" | "active" | "suspended" | "cancelled";
  limits: {
    maxConversations: number;
    maxProducts: number;
    maxAgents: number;
    maxMonthlyMessages: number;
    apiCallsPerMinute: number;
  };
  
  // Seguridad
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  
  // Configuración
  settings: {
    timezone: string;
    language: string;
    currency: string;
    autoRespond: boolean;
    workingHours?: {...};
  };
}
```

### Aislamiento de Datos

Cada query a la base de datos incluye el `tenant_id`:

```typescript
// ❌ MAL - Sin filtro de tenant
const conversations = await db.select().from(conversations);

// ✅ BIEN - Con filtro de tenant
const conversations = await db
  .select()
  .from(conversations)
  .where(eq(conversations.tenantId, tenantId));
```

### Middleware de Tenant

```typescript
// artifacts/api-server/src/lib/tenantManager.ts
export function resolveTenant() {
  return (req, res, next) => {
    const tenantId = req.cookies?.tenant_id;
    
    if (!tenantId) {
      return res.status(401).json({ error: "No autenticado" });
    }
    
    // Cargar tenant y adjuntar al request
    const tenant = await loadTenant(tenantId);
    req.tenant = tenant;
    
    next();
  };
}
```

---

## 🤖 Sistema de Agentes IA

### Los 10 Agentes Especializados

Cada agente tiene su propia personalidad, prompt y expertise:

1. **Sofía** 👑 - General/Director de Ventas Élite
   - Experta en todo tipo de ventas
   - Tono profesional y cálido
   - Maneja casos complejos

2. **Max** 📦 - Dropshipping/Productos Físicos
   - Especialista en productos físicos
   - Enfoque en envíos y garantías
   - Keywords: producto, envío, entrega, físico

3. **Luna** 💎 - Productos Digitales/Megapacks
   - Experta en cursos y contenido digital
   - Enfoque en acceso inmediato
   - Keywords: curso, megapack, digital, descarga

4. **Carlos** 🎯 - Servicios Digitales
   - Especialista en servicios profesionales
   - Enfoque en ROI y resultados
   - Keywords: servicio, diseño, desarrollo

5. **Diana** 📡 - Telecomunicaciones
   - Experta en planes de internet/telefonía
   - Enfoque en cobertura y velocidad
   - Keywords: internet, wifi, fibra, plan

6. **Andrés** 📱 - Marketing Digital
   - Especialista en publicidad y campañas
   - Enfoque en resultados medibles
   - Keywords: publicidad, ads, campaña

7. **Valentina** 📚 - Cursos y Formación
   - Experta en educación online
   - Enfoque en aprendizaje y certificación
   - Keywords: aprender, estudiar, formación

8. **Roberto** 💼 - B2B Empresarial
   - Especialista en ventas corporativas
   - Enfoque en contratos y licencias
   - Keywords: empresa, negocio, corporativo

9. **Isabella** 🔄 - Suscripciones
   - Experta en modelos recurrentes
   - Enfoque en valor a largo plazo
   - Keywords: suscripción, membresía, mensual

10. **Nicolás** 🎣 - Follow-up/Recuperación
    - Especialista en recuperar clientes
    - Enfoque en objeciones y dudas
    - Keywords: pensándolo, después, dudas

### Estructura de un Agente

```typescript
interface Agent {
  id: number;
  tenantId: number;
  name: string; // "Sofía"
  role: string; // "Director de Ventas Élite"
  tone: string; // "professional", "casual", "enthusiastic"
  language: string; // "es", "en"
  model: string; // "gpt-4o-mini"
  systemPrompt: string; // Prompt completo del agente
  stages: string[]; // ["saludo", "calificación", "presentación", "cierre"]
  isActive: boolean; // Si está activo o no
  avatar: string; // Emoji del agente
  keywords: string[]; // Para el router
}
```

### System Prompt de un Agente

Cada agente tiene un prompt estructurado:

```typescript
const systemPrompt = `
Eres **SOFÍA**, Agente de Ventas de TecnoVariedades D&S.

━━━━━━━━━━━━━━━━━━━━━━━━
🧠 PROTOCOLO DE RAZONAMIENTO
━━━━━━━━━━━━━━━━━━━━━━━━

1. **COMPRENSIÓN**: ¿Qué pregunta realmente el cliente?
2. **BÚSQUEDA EN CATÁLOGO**: Busca el producto que mejor coincida
3. **RESPUESTA COMPLETA**: Responde TODAS las preguntas típicas
4. **RESPUESTA**: Presenta el producto con [CARD: ID]

━━━━━━━━━━━━━━━━━━━━━━━━
📦 CATÁLOGO DISPONIBLE
━━━━━━━━━━━━━━━━━━━━━━━━
${productsBlock}

━━━━━━━━━━━━━━━━━━━━━━━━
🚫 REGLAS ABSOLUTAS
━━━━━━━━━━━━━━━━━━━━━━━━
1. COHERENCIA: Si pregunta por PIANO, NO recomiendes GUITARRA
2. TARJETAS OBLIGATORIAS: SIEMPRE incluye [CARD: ID]
3. NO INVENTAR: Usa SOLO datos del catálogo
4. NUNCA escribas texto DESPUÉS de [CARD: ID]
`;
```

### Router Inteligente de Agentes

El router selecciona el mejor agente según:

```typescript
// artifacts/api-server/src/lib/agent-router.ts

function scoreAgents(messageText, conversationId, tenantId) {
  const scores = [];
  
  for (const agent of activeAgents) {
    let score = 0;
    
    // 1. Matching por keywords (10 puntos por keyword)
    const matchedKeywords = keywords.filter(kw => 
      messageText.toLowerCase().includes(kw)
    );
    score += matchedKeywords.length * 10;
    
    // 2. Continuidad de conversación (20 puntos bonus)
    if (agentParticipatedBefore) {
      score += 20;
    }
    
    // 3. Agente general fallback (15 puntos)
    if (agent.name === "Sofía" && score < 10) {
      score += 15;
    }
    
    scores.push({ agentId, agentName, score });
  }
  
  // Retornar el de mayor score
  return scores.sort((a, b) => b.score - a.score)[0];
}
```

### Ejemplo de Selección

```
Cliente: "Me interesa aprender piano"

Análisis:
- Max (Dropshipping): 0 puntos (no match)
- Luna (Digital): 10 puntos (match: "aprender")
- Valentina (Cursos): 20 puntos (match: "aprender" + "piano")
- Sofía (General): 15 puntos (fallback)

✅ Seleccionado: Valentina (20 puntos)
```

---

## 💬 Sistema de Conversaciones

### Estructura de una Conversación

```typescript
interface Conversation {
  id: number;
  tenantId: number;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  
  // Estado
  status: "ai" | "human" | "closed";
  currentStage: "saludo" | "calificación" | "presentación" | "cierre";
  
  // Agente asignado
  assignedAgentId?: number;
  
  // Metadata
  lastMessage?: string;
  lastMessageAt?: Date;
  unreadCount: number;
  
  // Contexto
  currentTopic?: string; // "piano", "guitarra", etc.
  leadScore?: number; // 0-100
  
  // Visual
  avatarColor: string; // Color del avatar del cliente
  
  createdAt: Date;
  updatedAt: Date;
}
```

### Estructura de un Mensaje

```typescript
interface Message {
  id: number;
  conversationId: number;
  
  // Contenido
  content: string; // Texto del mensaje
  role: "customer" | "agent" | "human";
  
  // Metadata
  stage?: string; // Etapa en la que se envió
  sentiment?: "positive" | "neutral" | "negative";
  
  // Productos mencionados
  productIds?: number[]; // IDs de productos en [CARD: ID]
  
  createdAt: Date;
}
```

### Flujo de una Conversación

```
1. Cliente envía mensaje por WhatsApp
   ↓
2. WhatsApp Manager recibe el mensaje
   ↓
3. Message Handler encola el mensaje
   ↓
4. Agent Orchestrator procesa la cola
   ↓
5. Agent Router selecciona el mejor agente
   ↓
6. Agente genera respuesta con IA
   ↓
7. Parser extrae [CARD: ID] y texto
   ↓
8. WhatsApp Manager envía respuesta
   ↓
9. Cliente recibe mensaje + tarjeta de producto
```

### Handoff (Transferencia)

El operador humano puede tomar control:

```typescript
// Cliente → IA
conversation.status = "ai";

// Operador toma control
await handoffConversation(conversationId, "human");
conversation.status = "human";

// Operador devuelve a IA
await handoffConversation(conversationId, "ai");
conversation.status = "ai";
```

### Etapas de Venta

Cada conversación pasa por etapas:

1. **Saludo** - Primer contacto
2. **Calificación** - Entender necesidad
3. **Presentación** - Mostrar producto con [CARD: ID]
4. **Cierre** - Procesar pago
5. **Seguimiento** - Post-venta

```typescript
// El agente detecta automáticamente la etapa
if (messageText.includes("pago") || messageText.includes("comprar")) {
  nextStage = "cierre";
} else if (responseText.includes("[CARD:")) {
  nextStage = "presentación";
}
```

---

## 🔐 Sistema de Autenticación

### Flujo de Registro

```
1. Usuario se registra
   ↓
2. Sistema genera código de 6 dígitos
   ↓
3. Email enviado con código
   ↓
4. Usuario ingresa código
   ↓
5. Email verificado
   ↓
6. Puede iniciar sesión
```

### Flujo de Recuperación

```
1. Usuario olvida contraseña
   ↓
2. Solicita código de recuperación
   ↓
3. Email enviado con código
   ↓
4. Usuario ingresa código
   ↓
5. Código verificado
   ↓
6. Usuario cambia contraseña
   ↓
7. Puede iniciar sesión
```

### Seguridad

- ✅ Códigos de 6 dígitos
- ✅ Válidos por 15 minutos
- ✅ Un código por usuario
- ✅ Hashing de contraseñas (SHA-256)
- ✅ Cookies HTTP-only
- ✅ Sesión de 30 días
- ✅ 2FA opcional (preparado)

---

## 🎨 Sistema de Personalización

### Configuración de Marca

Cada tenant puede personalizar:

```typescript
// Colores
brandColors: {
  primary: "#f97316",    // Color principal
  secondary: "#fb923c",  // Color secundario
  accent: "#a855f7",     // Color de acento
  background: "#ffffff", // Fondo
  foreground: "#1f2937", // Texto
  muted: "#f3f4f6",      // Elementos desactivados
}

// Tema
brandTheme: {
  mode: "light" | "dark" | "auto",
  font: "Inter" | "Roboto" | "Poppins",
  borderRadius: "none" | "sm" | "md" | "lg" | "xl",
  customCSS: "/* CSS personalizado */"
}

// Logo
brandLogo: "https://example.com/logo.png"

// Redes sociales
brandSocial: {
  website: "https://example.com",
  facebook: "https://facebook.com/...",
  instagram: "https://instagram.com/...",
  // ...
}
```

### Aplicación del Tema

El frontend carga el tema del tenant:

```typescript
// 1. Obtener configuración
const branding = await fetch("/api/branding").then(r => r.json());

// 2. Aplicar colores
document.documentElement.style.setProperty("--color-primary", branding.brandColors.primary);

// 3. Aplicar logo
<img src={branding.brandLogo} alt={branding.brandName} />

// 4. Aplicar fuente
document.body.style.fontFamily = branding.brandTheme.font;
```

---

## 🔄 Flujo Completo

### Ejemplo: Cliente Compra un Curso de Piano

```
1. Cliente: "Hola, me interesa aprender piano"
   ↓
2. WhatsApp recibe mensaje
   ↓
3. Sistema crea conversación (tenant_id=1, contact_phone="+57...")
   ↓
4. Message Handler encola mensaje
   ↓
5. Agent Orchestrator procesa
   ↓
6. Agent Router analiza:
   - Keywords: "aprender" (10 pts), "piano" (10 pts)
   - Valentina (Cursos): 20 puntos ✅
   - Luna (Digital): 10 puntos
   - Sofía (General): 15 puntos
   ↓
7. Valentina genera respuesta:
   "¡Perfecto! Tenemos el curso ideal para ti:
   
   [CARD: 311]"
   ↓
8. Parser extrae:
   - Texto: "¡Perfecto! Tenemos el curso ideal para ti:"
   - Tarjeta: ID 311
   ↓
9. Sistema busca producto ID 311:
   - Nombre: "MEGA PACK 80: CURSO DE PIANO"
   - Precio: COP 20,000
   - Features: ["20 secciones", "250 clases", "60h"]
   - Imagen: "https://..."
   ↓
10. WhatsApp envía:
    - Texto: "¡Perfecto! Tenemos el curso ideal para ti:"
    - Imagen con caption:
      *🎹 MEGA PACK 80: CURSO DE PIANO*
      ━━━━━━━━━━━━━━━━━━━━━━━
      
      Aprende piano desde cero hasta nivel profesional
      
      🚀 *LO QUE INCLUYE:*
      ✅ 20 secciones · 250 clases · 60h
      ✅ Acceso permanente · Google Drive
      
      💰 *INVERSIÓN:*
      *COP 20,000.00*
      
      ━━━━━━━━━━━━━━━━━━━━━━━
      
      💳 *MÉTODOS DE PAGO:*
      
      🔹 *MercadoPago / PSE:*
      https://mpago.la/...
      
      ━━━━━━━━━━━━━━━━━━━━━━━
      
      ✨ _¿Deseas activar tu acceso ahora?_
   ↓
11. Cliente: "Sí, quiero comprarlo"
   ↓
12. Agent Router: Valentina (continuidad: 20 pts bonus)
   ↓
13. Valentina detecta intención de pago
   ↓
14. Genera links de pago dinámicos
   ↓
15. Cliente paga
   ↓
16. Webhook confirma pago
   ↓
17. Sistema envía acceso al curso
   ↓
18. Conversación marcada como "won"
```

---

## 🗄️ Base de Datos

### Tablas Principales

#### tenants
```sql
- id (PK)
- name, email, passwordHash
- slug, domain
- brandName, brandLogo, brandColors, brandTheme, brandSocial
- plan, status, limits
- emailVerified, twoFactorEnabled
- settings, metadata
- createdAt, updatedAt
```

#### agents
```sql
- id (PK)
- tenantId (FK → tenants)
- name, role, tone, language, model
- systemPrompt, stages
- isActive, avatar, keywords
- createdAt, updatedAt
```

#### conversations
```sql
- id (PK)
- tenantId (FK → tenants)
- contactName, contactPhone, contactEmail
- status, currentStage
- assignedAgentId (FK → agents)
- lastMessage, lastMessageAt, unreadCount
- currentTopic, leadScore, avatarColor
- createdAt, updatedAt
```

#### messages
```sql
- id (PK)
- conversationId (FK → conversations)
- content, role, stage, sentiment
- productIds
- createdAt
```

#### products
```sql
- id (PK)
- tenantId (FK → tenants)
- name, description, price, currency
- features (JSON array)
- imageUrl, category, kind
- isActive, highlight
- metadata
- createdAt, updatedAt
```

#### leads
```sql
- id (PK)
- tenantId (FK → tenants)
- name, phone, email
- stage, value, score
- source, notes
- createdAt, updatedAt
```

---

## 🔌 APIs y Endpoints

### Autenticación
- `POST /api/auth/register` - Registro
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Sesión actual
- `POST /api/auth/send-verification-code` - Enviar código
- `POST /api/auth/verify-email` - Verificar email
- `POST /api/auth/request-password-reset` - Solicitar recuperación
- `POST /api/auth/reset-password` - Cambiar contraseña

### Agentes
- `GET /api/agents` - Listar agentes
- `GET /api/agents/:id` - Obtener agente
- `POST /api/agents` - Crear agente
- `PUT /api/agents/:id` - Actualizar agente
- `DELETE /api/agents/:id` - Eliminar agente
- `POST /api/agents/:id/activate` - Activar agente
- `GET /api/agents/templates` - Templates de agentes
- `GET /api/agents/templates/:type` - Template específico

### Conversaciones
- `GET /api/conversations` - Listar conversaciones
- `GET /api/conversations/:id` - Obtener conversación
- `PUT /api/conversations/:id` - Actualizar conversación
- `POST /api/conversations/:id/handoff` - Transferir control
- `POST /api/conversations/:id/close` - Cerrar conversación

### Mensajes
- `GET /api/messages/:conversationId` - Listar mensajes
- `POST /api/messages/:conversationId` - Enviar mensaje

### Productos
- `GET /api/products` - Listar productos
- `GET /api/products/:id` - Obtener producto
- `POST /api/products` - Crear producto
- `PUT /api/products/:id` - Actualizar producto
- `DELETE /api/products/:id` - Eliminar producto
- `POST /api/products/import` - Importar desde Excel

### Personalización
- `GET /api/branding` - Obtener configuración
- `PUT /api/branding` - Actualizar configuración
- `POST /api/branding/upload-logo` - Subir logo
- `GET /api/branding/preview-theme` - Vista previa CSS
- `GET /api/branding/public/:slug` - Branding público

### WhatsApp
- `GET /api/whatsapp/status` - Estado de conexión
- `GET /api/whatsapp/qr` - QR code para conectar
- `POST /api/whatsapp/disconnect` - Desconectar

### Dashboard
- `GET /api/dashboard/stats` - Estadísticas generales
- `GET /api/dashboard/recent-conversations` - Conversaciones recientes
- `GET /api/dashboard/top-products` - Productos más vendidos

---

## 💻 Frontend

### Páginas Principales

1. **`/auth`** - Login y Registro
2. **`/`** - Dashboard con métricas
3. **`/conversations`** - Bandeja de entrada
4. **`/agents`** - Gestión de agentes
5. **`/products`** - Catálogo de productos
6. **`/leads`** - Gestión de prospectos
7. **`/settings`** - Configuración general
8. **`/whatsapp`** - Conexión de WhatsApp
9. **`/pricing`** - Planes y precios

### Componentes Clave

- **Layout** - Sidebar + Header responsive
- **ConversationList** - Lista de conversaciones
- **ChatWindow** - Ventana de chat con mensajes
- **ProductCard** - Tarjeta de producto en mensajes
- **AgentCard** - Tarjeta de agente
- **BrandingPanel** - Panel de personalización

### Responsive

- ✅ Móvil: `< 640px`
- ✅ Tablet: `>= 640px`
- ✅ Desktop: `>= 768px`

---

## 📊 Métricas y Analytics

### Métricas por Tenant

- Total de conversaciones
- Conversaciones activas
- Tasa de conversión
- Productos más vendidos
- Agentes más efectivos
- Tiempo promedio de respuesta
- Satisfacción del cliente

### Métricas por Agente

- Conversaciones manejadas
- Tasa de conversión
- Productos vendidos
- Tiempo promedio de cierre
- Objeciones más comunes

---

## 🚀 Próximos Pasos

### Para Implementar

1. **Migración de Base de Datos**
   ```bash
   cd lib/db
   pnpm run db:generate
   pnpm run db:push
   ```

2. **Configurar Email**
   - Obtener App Password de Gmail
   - Agregar a `.env`

3. **Instalar Dependencias**
   ```bash
   cd artifacts/api-server
   pnpm install
   ```

4. **Agregar Ruta de Branding**
   - Importar en `routes/index.ts`
   - Agregar `router.use("/branding", brandingRouter)`

5. **Crear Panel de Personalización**
   - Página en frontend
   - Formulario de colores
   - Upload de logo
   - Vista previa en tiempo real

---

## 📚 Documentos Relacionados

- `AUTHENTICATION_SYSTEM.md` - Sistema de autenticación completo
- `MOBILE_RESPONSIVE_FIX.md` - Correcciones responsive
- `AGENT_DATA_ACCURACY_FIX.md` - Agentes usando datos reales
- `PRODUCT_CARD_FIX.md` - Formato de tarjetas de producto
- `PROJECT_STATUS.md` - Estado general del proyecto

---

**Estado:** ✅ Arquitectura completa y documentada
**Versión:** 1.5 Premium
**Última actualización:** Mayo 5, 2026
