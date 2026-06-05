# Implementación del Modelo SaaS - VentasPro

## Resumen

Se ha implementado un modelo SaaS completo con 4 planes de suscripción, validación de planes, límites de características y un sistema de período de prueba.

## Planes Disponibles

### 1. **Plan Gratis** (Free)
- **Precio**: $0/mes
- **Mensajes/mes**: 100
- **Conversaciones**: 10
- **Productos**: 5
- **Agentes IA**: 1
- **Período de prueba**: 7 días
- **Características**: AI Básico, Integración WhatsApp

### 2. **Plan Iniciador** (Starter)
- **Precio**: $29/mes
- **Mensajes/mes**: 1,000
- **Conversaciones**: 100
- **Productos**: 50
- **Agentes IA**: 1
- **Características**: AI Avanzado, Integración WhatsApp, Analytics, Soporte por Email

### 3. **Plan Profesional** (Professional)
- **Precio**: $99/mes
- **Mensajes/mes**: 10,000
- **Conversaciones**: 1,000
- **Productos**: 500
- **Agentes IA**: 3
- **Características**: AI Avanzado, Integración WhatsApp, Analytics, Soporte Prioritario, Branding Personalizado, Acceso API

### 4. **Plan Empresarial** (Enterprise)
- **Precio**: $299/mes
- **Mensajes/mes**: 100,000
- **Conversaciones**: 10,000
- **Productos**: 5,000
- **Agentes IA**: 10
- **Características**: AI Avanzado, Integración WhatsApp, Analytics, Soporte 24/7, Branding Personalizado, Acceso API, Gestor de Cuenta Dedicado, Integraciones Personalizadas

## Componentes Implementados

### Backend (API Server)

#### 1. **Middleware de Validación SaaS** (`middleware/saasValidation.ts`)
- Valida que el tenant tenga un plan activo
- Verifica que el plan no esté expirado
- Valida período de prueba (7 días para plan Starter)
- Adjunta información del plan al request

#### 2. **Middleware de Límites de Características** (`middleware/featureLimits.ts`)
- Valida límites de productos, agentes y conversaciones
- Valida límites de mensajes mensuales
- Adjunta información de límites al request

#### 3. **Rutas de Precios** (`routes/pricing.ts`)
- `GET /api/pricing` - Obtener todos los planes
- `GET /api/pricing/:plan` - Obtener detalles de un plan específico
- `POST /api/pricing/upgrade` - Cambiar de plan (requiere autenticación)
- `GET /api/pricing/current/info` - Obtener plan actual del tenant

#### 4. **Rutas de Autenticación Actualizada** (`routes/auth.ts`)
- `POST /api/auth/register` - Registrar nuevo usuario con plan "Starter" en estado "trial"
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Obtener sesión actual con información del plan y días restantes de prueba

#### 5. **Configuración de App** (`app.ts`)
- Middleware de validación SaaS aplicado a todas las rutas excepto:
  - `/api/health`
  - `/api/ready`
  - `/api/pricing`
  - `/api/auth/register`
  - `/api/auth/login`
  - `/api/auth/logout`
- Middleware de límites de características aplicado a:
  - `/api/products`
  - `/api/agents`
  - `/api/conversations`
  - `/api/messages`

### Frontend (VentasPro)

#### 1. **Hook de Estado SaaS** (`hooks/useSaasStatus.ts`)
- Obtiene información del plan actual del tenant
- Calcula días restantes de prueba
- Maneja errores de carga

#### 2. **Banner de Estado SaaS** (`components/saas-status-banner.tsx`)
- Muestra advertencia si quedan ≤3 días de prueba
- Muestra información de prueba activa
- Muestra alerta si la cuenta está suspendida
- Enlace directo a página de precios

#### 3. **Página de Precios** (`pages/pricing.tsx`)
- Muestra todos los planes disponibles
- Información de características por plan
- Botón para actualizar plan
- Preguntas frecuentes sobre planes

#### 4. **Actualización del Dashboard** (`pages/dashboard.tsx`)
- Integración del banner de estado SaaS
- Muestra advertencia de prueba próxima a expirar

#### 5. **Actualización del Layout** (`components/layout.tsx`)
- Agregado enlace a "Planes" en el sidebar
- Acceso rápido a la página de precios

#### 6. **Actualización de App.tsx** (`App.tsx`)
- Agregada ruta `/pricing` para la página de precios

## Flujo de Validación SaaS

### 1. Registro de Usuario
```
Usuario registra → Se crea tenant con:
  - status: "trial"
  - plan: "starter"
  - createdAt: fecha actual
```

### 2. Acceso a Endpoints Protegidos
```
Request a /api/products → 
  1. Verificar sesión (cookie tenant_id)
  2. Resolver tenant
  3. Validar SaaS plan:
     - ¿Plan válido?
     - ¿Cuenta activa?
     - ¿Período de prueba expirado?
  4. Validar límites de características
  5. Procesar request
```

### 3. Período de Prueba
```
Día 1-7: Acceso completo al plan Starter
Día 8+: Acceso denegado, redirigir a página de precios
```

## Endpoints Protegidos por SaaS

Todos los endpoints bajo `/api` están protegidos EXCEPTO:
- `/api/health` - Health check
- `/api/ready` - Readiness check
- `/api/pricing/*` - Información de precios
- `/api/auth/register` - Registro
- `/api/auth/login` - Login
- `/api/auth/logout` - Logout

## Próximos Pasos

1. **Integración de Pagos**
   - Integrar Stripe o MercadoPago
   - Procesar pagos de upgrades
   - Gestionar renovaciones automáticas

2. **Tracking de Uso**
   - Contar mensajes enviados por mes
   - Contar conversaciones activas
   - Contar productos creados
   - Contar agentes creados

3. **Enforcement de Límites**
   - Bloquear creación de productos si se alcanza límite
   - Bloquear creación de agentes si se alcanza límite
   - Bloquear envío de mensajes si se alcanza límite mensual

4. **Gestión de Planes**
   - Downgrade automático si se cancela suscripción
   - Upgrade automático al procesar pago
   - Notificaciones de renovación próxima

5. **Reportes y Analytics**
   - Dashboard de uso por plan
   - Reportes de ingresos
   - Análisis de churn

## Pruebas

### Prueba de Período de Prueba
1. Registrar nuevo usuario
2. Verificar que `status` es "trial" y `plan` es "starter"
3. Acceder a `/api/auth/me` y verificar `trialDaysRemaining`
4. Esperar 7 días o modificar `createdAt` en BD
5. Verificar que acceso es denegado con error "Trial expired"

### Prueba de Validación de Plan
1. Registrar usuario
2. Acceder a `/api/products` - debe funcionar
3. Cambiar plan a "invalid" en BD
4. Acceder a `/api/products` - debe retornar error "Invalid subscription plan"

### Prueba de Límites de Características
1. Registrar usuario con plan "free"
2. Intentar crear 6 productos - debe fallar en el 6to
3. Cambiar a plan "starter"
4. Intentar crear 51 productos - debe fallar en el 51

## Archivos Modificados

- `artifacts/api-server/src/app.ts` - Integración de middlewares SaaS
- `artifacts/api-server/src/routes/auth.ts` - Asignación de plan en registro
- `artifacts/ventas-pro/src/App.tsx` - Agregada ruta de precios
- `artifacts/ventas-pro/src/pages/dashboard.tsx` - Integración de banner SaaS
- `artifacts/ventas-pro/src/components/layout.tsx` - Enlace a precios en sidebar

## Archivos Nuevos

- `artifacts/api-server/src/middleware/saasValidation.ts` - Validación de planes
- `artifacts/api-server/src/middleware/featureLimits.ts` - Validación de límites
- `artifacts/api-server/src/routes/pricing.ts` - Endpoints de precios
- `artifacts/ventas-pro/src/hooks/useSaasStatus.ts` - Hook de estado SaaS
- `artifacts/ventas-pro/src/components/saas-status-banner.tsx` - Banner de estado
- `artifacts/ventas-pro/src/pages/pricing.tsx` - Página de precios
