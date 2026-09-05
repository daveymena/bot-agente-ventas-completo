# AUDITORÍA Y REDISEÑO FRONTEND / UX-UI 2026

## 0. Alcance

Este documento audita el frontend de **VentasPro** y define una renovación visual y de experiencia para escritorio y móvil.

No confundir con el agente vendedor de WhatsApp ni con Atlas Operator: este documento corresponde a la **interfaz web/app de VentasPro** usada por administradores y operadores.

Objetivo: que el producto se sienta como un SaaS moderno, profesional, rápido y confiable en 2026, sin caer en una interfaz recargada de efectos.

---

# 1. Evidencia del frontend actual

## 1.1 Estructura real detectada

Frontend principal:

- `artifacts/ventas-pro/src/`
- React + TypeScript + Vite
- Tailwind CSS
- shadcn/ui
- Lucide icons
- Recharts
- Framer Motion
- Wouter

El propio repositorio documenta una guía visual anterior con tokens: Inter, índigo `#4F46E5`, slate `#0F172B`, superficie clara `#F8FAFC`. `design/README.md` también indica diseños separados para desktop, móvil y tienda pública.

## 1.2 Navegación desktop actual

`components/layout.tsx` mantiene un sidebar persistente con una cantidad alta de entradas:

- Panel
- Conversaciones
- Agentes IA
- Prospectos
- Productos
- WhatsApp
- Monitor WA / Administrador para admin
- WooCommerce
- Atlas VentasPro
- Personalización
- Facebook
- Marketing
- Landing Studio
- Configuración
- Ayuda
- Planes
- Ver Tienda

La estructura actual es funcional, pero demasiadas entradas compiten entre sí y mezclan trabajo diario, configuración, administración y producto.

## 1.3 Navegación móvil actual

`components/mobile-nav.tsx` usa:

- Inicio
- Chats
- Leads
- Productos
- Más

El resto aparece en un panel inferior tipo sheet con una cuadrícula de opciones.

Esto ya es mejor que intentar trasladar el sidebar completo al móvil, pero el menú `Más` todavía concentra demasiadas funciones.

## 1.4 Dashboard actual

`pages/dashboard.tsx` contiene:

- banner SaaS
- hero de bienvenida
- estado de WhatsApp
- acciones rápidas
- dashboard móvil específico
- 4 KPIs principales
- 3 KPIs secundarios
- gráfico de mensajes
- embudo de ventas
- actividad y otras secciones
- animaciones de entrada con stagger

El dashboard ya tiene una base visual sólida, pero actualmente presenta varias capas de tarjetas, glassmorphism y métricas antes de llegar a la acción principal.

## 1.5 Sistema visual actual

`index.css` confirma:

- tipografía Inter
- fondo claro slate muy suave
- tarjetas blancas
- sidebar oscuro
- índigo como color primario
- violeta como accent
- sistema de sombras progresivo
- modo oscuro
- radios moderados

Hay además múltiples usos de `glass-panel`, `glass-card`, blur, gradientes y animaciones en las páginas.

## 1.6 Conversaciones

`pages/conversations.tsx` ya tiene una buena base de inbox/CRM:

- lista de conversaciones
- búsqueda
- conversación activa
- mensajes
- composer
- handoff IA/humano
- cierre
- cards de producto
- estado y metadatos

La página necesita evolución especialmente en densidad, jerarquía, modo móvil y diferenciación entre actividad humana, IA y sistema.

## 1.7 Diseño separado de referencia

El repo ya tiene:

- `design/VentasPro.dc.html`
- `design/VentasPro-Movil.dc.html`
- `design/Tienda.dc.html`

Existe, por tanto, una intención previa de diseño desktop/móvil/public store. Esta nueva fase debe actualizar esos principios en lugar de inventar un lenguaje visual distinto para cada pantalla.

---

# 2. Qué está pasando en SaaS moderno en 2026

La investigación reciente de diseño SaaS converge en una dirección clara:

## 2.1 Calm design

Productos como Linear y Notion están reduciendo chrome y ruido visual: menos elementos visibles por defecto, más jerarquía tipográfica y progressive disclosure.

Fuente de referencia: SaaSUI Design, "7 SaaS UI Design Trends in 2026".

https://www.saasui.design/blog/7-saas-ui-design-trends-2026

## 2.2 La interfaz debe llevar a una acción

Los dashboards modernos están pasando de mostrar información a mostrar **qué hacer después**: tareas, alertas, recomendaciones y quick actions.

Fuente de referencia: SaaSFrame, "The Anatomy of High-Performance SaaS Dashboard Design 2026".

https://www.saasframe.io/blog/the-anatomy-of-high-performance-saas-dashboard-design-2026-trends-patterns

## 2.3 Sidebar en desktop; adaptación real en móvil

La navegación lateral continúa siendo apropiada para SaaS con jerarquía profunda. En móvil no debe comprimirse literalmente: debe transformarse.

Fuente de referencia: SaaSUI, "SaaS Navigation UX Patterns".

https://www.saasui.design/blog/saas-navigation-ux-patterns

## 2.4 Mobile es una experiencia de primera clase

En móvil se recomiendan layouts de una columna, targets táctiles grandes, acciones primarias cercanas al pulgar y tablas transformadas a cards/listas.

Fuente: Devian, "SaaS Dashboard Design Trends 2026".

https://www.devian.in/blogs/saas-dashboard-design-trends

## 2.5 Accesibilidad como estándar de producto

La navegación, contraste, foco, labels, tamaños táctiles y reduced motion deben entrar en el sistema de diseño, no como corrección al final.

Referencias:

- W3C WCAG 2.2
- SaaSUI navigation patterns
- Material / Apple platform conventions

---

# 3. Diagnóstico visual

## Estado actual

La interfaz actual está **por encima de un panel administrativo genérico**, pero necesita una segunda generación visual.

No recomiendo reemplazarla completamente por glassmorphism, gradientes intensos o un dashboard oscuro tipo Dribbble. Eso sería una regresión de usabilidad.

### Los principales problemas

1. **Exceso de superficie visible**
   - demasiadas tarjetas para explicar cada métrica
   - demasiadas capas con borde + sombra + blur

2. **Jerarquía insuficiente**
   - el usuario ve muchas cosas antes de saber qué necesita hacer hoy

3. **Sidebar sobrecargado**
   - mezcla navegación operativa, configuración, administración y funciones secundarias

4. **Mobile todavía depende de un "Más" demasiado grande**
   - correcto como fallback, pero puede mejorar mediante agrupación semántica

5. **Animación demasiado generalizada**
   - `staggerChildren` y entradas animadas en páginas completas deben reservarse para momentos donde aportan orientación

6. **Glassmorphism como textura, no como sistema de jerarquía**
   - debe quedar como acento puntual, no como lenguaje para todo

7. **Poca personalización contextual del dashboard**
   - el mismo panel no prioriza la misma información para un usuario enfocado en WhatsApp, ventas o marketing

---

# 4. NUEVA DIRECCIÓN VISUAL

## Concepto

### "Calm Sales OS"

VentasPro debe verse como una plataforma profesional de operación comercial, no como una colección de páginas administrativas.

Inspiración de estructura:

- Linear → limpieza y foco
- Stripe → densidad útil y confianza
- Vercel → tipografía y espacios
- Notion → jerarquía y modularidad
- Intercom → inbox y operación
- Shopify → orientación a negocio

No copiar ningún producto literalmente.

---

# 5. SISTEMA VISUAL NUEVO

## 5.1 Colores

Conservar la identidad índigo porque ya existe en el producto.

Primario:

- Indigo 600/700
- uso en CTA, active states y links relevantes

Neutros:

- slate muy oscuro para headings
- slate medio para texto secundario
- gris muy claro para superficies
- blanco para tarjetas principales

Estados:

- success = verde
- warning = ámbar
- danger = rojo
- info = azul

Regla:

**No más de un accent fuerte por bloque visual.**

El violeta debe dejar de competir con el índigo salvo donde represente IA.

## 5.2 Fondos

Desktop claro:

- background general casi plano
- tarjetas blancas
- bordes muy suaves
- sombras pequeñas

Dark mode:

- conservar deep slate
- reducir glow
- evitar paneles con exceso de brillo

## 5.3 Border radius

Usar una escala consistente:

- inputs: 10–12px
- buttons: 10–12px
- cards: 14–16px
- modals/sheets: 18–24px

Evitar mezclar muchos radios diferentes.

## 5.4 Sombras

Preferir sombras ligeras.

Una card estándar no necesita una sombra visible si el contraste de fondo ya la separa.

Elevación profunda solo para:

- popover
- modal
- command palette
- bottom sheet

## 5.5 Tipografía

Inter se puede mantener.

Escala:

- page title: 28–32px desktop / 23–26px mobile
- section title: 18–20px
- body: 14–15px
- supporting text: 12–13px
- KPI number: 28–36px

No utilizar mayúsculas espaciadas para demasiados labels.

---

# 6. DESKTOP SHELL NUEVO

## Sidebar

Separar navegación en cuatro bloques:

### Operación

- Inicio
- Conversaciones
- Prospectos
- Productos
- Pedidos

### Automatización

- Agentes IA
- WhatsApp
- Automatizaciones

### Crecimiento

- Marketing
- Facebook
- Landing Studio
- Analítica

### Sistema

- Configuración
- Personalización
- Plan
- Ayuda

Atlas debe seguir visible, pero como **herramienta estratégica**, no necesariamente como una entrada más dentro de una lista larga.

Puede aparecer como acción destacada en el encabezado o como sección "Inteligencia".

## Sidebar compacto

Añadir modo:

- expanded
- icon rail

El estado colapsado debe conservar tooltips y active state claros.

## Topbar

El header actual tiene demasiado espacio vacío.

Usar el topbar para:

- búsqueda / command palette
- estado WhatsApp
- notificaciones
- selector de negocio si aplica
- avatar/menu

No poner banners permanentes en el header.

---

# 7. DASHBOARD NUEVO

La pregunta del dashboard debe ser:

> **"¿Qué está pasando y qué debo hacer ahora?"**

Orden recomendado:

### Zona 1 — North Star

Una tarjeta o bloque principal:

**Ventas generadas este mes**

con:

- valor
- variación
- número de pedidos
- mini contexto

### Zona 2 — Atención inmediata

Un bloque "Requiere atención" con 3–5 acciones:

- 7 conversaciones esperando respuesta
- 2 checkout abandonados
- WhatsApp desconectado
- 3 leads calientes
- producto con stock bajo

Cada item debe tener CTA directo.

### Zona 3 — KPIs

Máximo 4 métricas principales.

### Zona 4 — tendencia

Una visualización principal, no muchas.

### Zona 5 — operación

- actividad reciente
- conversaciones calientes
- últimas ventas

### Zona 6 — recomendaciones IA

Pequeño bloque:

> "Atlas detectó una caída del 18% en conversión desde WhatsApp."

Pero solo cuando exista evidencia real.

---

# 8. MOBILE APP EXPERIENCE

## Regla principal

**No hacer desktop pequeño.**

Mobile necesita flujo propio.

## Bottom navigation

Mantener 4–5 destinos máximos.

Recomendación:

- Inicio
- Chats
- Leads
- Productos
- Más

Es correcta como base.

Pero `Más` debe estar organizado por categorías, no como una matriz plana de 12+ iconos.

## Bottom sheet

Agrupar:

### Automatización

Agentes IA · WhatsApp

### Crecimiento

Marketing · Facebook · Landing Studio

### Tienda

WooCommerce · Ver tienda

### Sistema

Personalización · Configuración · Ayuda · Plan

Esto reduce la carga cognitiva sin esconder funciones.

## Mobile actions

Las acciones críticas deben quedar cerca de la zona inferior:

- responder
- enviar
- crear producto
- cambiar estado
- asignar conversación
- cerrar venta

No obligar a desplazar hasta arriba para ejecutar la acción primaria.

---

# 9. CONVERSACIONES / INBOX

Esta debe convertirse en una de las mejores pantallas del producto.

## Desktop

Layout de tres zonas cuando el ancho lo permita:

```text
┌────────────┬──────────────────────┬────────────────────┐
│ Inbox      │ Conversación         │ Contexto comercial │
│            │                      │                    │
│ búsqueda   │ mensajes             │ lead               │
│ filtros    │                      │ producto           │
│ lista      │ composer             │ etapa              │
│            │                      │ acciones           │
└────────────┴──────────────────────┴────────────────────┘
```

## Mobile

No mantener tres columnas.

Usar navegación por stack:

Inbox → conversación → contexto

## Visual del chat

Diferenciar con claridad:

- cliente
- agente IA
- humano
- sistema

No abusar de colores.

El estado se expresa mediante iconografía, pequeñas etiquetas y posición.

## Composer

Debe sentirse como una herramienta de operación:

- textarea auto-grow
- adjuntos
- enviar
- IA/humano
- sugerencias rápidas solo cuando ayudan

---

# 10. PRODUCTOS

El catálogo necesita una jerarquía comercial más fuerte.

Cada card debe priorizar:

1. imagen
2. nombre
3. precio
4. estado
5. ventas / rendimiento si corresponde
6. acción

No saturar las cards con cuatro o cinco líneas de descripción.

En mobile:

- una columna
- cards completas
- filtros en sheet
- ordenar en bottom sheet

---

# 11. PROSPECTOS / CRM

No mostrar una tabla gigante como primera experiencia.

Desktop:

- tabla
- filtros
- búsqueda
- scoring

Mobile:

- cards
- nombre
- etapa
- valor
- próxima acción

La tabla debe transformarse, no comprimirse horizontalmente.

---

# 12. AGENTES IA

La página debe explicar al administrador:

**qué hace el agente y qué está haciendo ahora**.

En lugar de un formulario largo al inicio:

### Hero del agente

- nombre
- estado
- canal
- modelo
- nivel de actividad

### Capacidades

cards compactas:

- ventas
- soporte
- seguimiento
- pagos

### Comportamiento

mostrar settings esenciales primero.

### Avanzado

progressive disclosure.

---

# 13. WHATSAPP

No convertir la pantalla de WhatsApp en una consola técnica.

El usuario quiere ver:

- conectado / desconectado
- número
- última sincronización
- mensajes procesados
- velocidad de respuesta
- problemas
- acciones de conexión

Detalles técnicos debajo de "Diagnóstico".

---

# 14. ATLAS

Atlas debe verse como una interfaz de conversación con capacidad operativa.

No darle una UI que parezca otro CRUD.

Diseño recomendado:

- chat central
- contexto lateral desktop
- acciones sugeridas
- confirmación clara antes de mutaciones
- historial de tareas
- resultados legibles

Para móvil:

- conversación full-screen
- composer sticky
- confirmación de acciones desde bottom sheet

---

# 15. ANIMACIÓN

Reducir animaciones globales.

Mantener motion en:

- cambios de estado
- apertura de panel
- feedback de acción
- skeleton / loading
- transiciones pequeñas

Eliminar o reducir:

- entrada animada de todos los componentes a la vez
- hover con demasiada transformación
- glow permanente
- pulse decorativo

Respeto obligatorio a:

`prefers-reduced-motion`

---

# 16. ACCESIBILIDAD

Objetivo mínimo: WCAG 2.2 AA.

Verificar:

- contraste
- focus visible
- navegación de teclado
- labels
- aria
- targets táctiles >= 44px
- no usar color como único indicador
- reduced motion
- textos alternativos

---

# 17. RESPONSIVE BREAKPOINTS

Diseñar por comportamiento, no por dispositivo.

### < 640px

- una columna
- bottom nav
- cards
- sheets
- acciones sticky

### 640–1023px

- sidebar overlay/collapsible
- 2 columnas cuando tenga sentido
- tablas simplificadas

### >= 1024px

- sidebar
- multi-column
- tablas completas
- contexto lateral

### >= 1440px

No estirar infinitamente el contenido.

Máximo razonable de lectura/operación y columnas laterales controladas.

---

# 18. DESIGN SYSTEM: COMPONENTES A ESTANDARIZAR

Crear/normalizar:

- PageHeader
- PageSection
- KPI
- StatCard
- EmptyState
- ErrorState
- StatusBadge
- CommandPalette
- ResponsiveTable
- MobileCardList
- FilterBar
- BottomSheet
- ActionMenu
- ConversationPanel
- LeadSummary
- ProductCard
- AISuggestion
- ConfirmActionDialog

El objetivo es que una nueva pantalla utilice estos primitives en lugar de inventar estilos.

---

# 19. COMMAND PALETTE

Agregar búsqueda global / acciones rápidas en desktop.

Atajo sugerido:

`Ctrl/Cmd + K`

Debe permitir:

- ir a Conversaciones
- buscar producto
- abrir lead
- crear producto
- conectar WhatsApp
- abrir agente
- abrir Atlas

No reemplaza la navegación visible.

---

# 20. REGLA DE ORO PARA CLAUDE

No hacer un "redesign Dribbble".

No cambiar todo por glassmorphism.

No llenar la pantalla de gradientes.

No hacer cada card colorida.

No agregar animaciones para demostrar que existe IA.

El criterio de éxito es:

**más claridad + menos fricción + más acción + misma identidad.**

---

# 21. MATRIZ DE PRIORIDAD

## P0 — primero

- shell desktop
- navegación
- mobile nav
- dashboard
- conversación inbox
- responsive behavior
- typography / spacing / tokens

## P1

- productos
- leads
- agentes IA
- WhatsApp
- settings

## P2

- marketing
- Facebook
- landing studio
- admin
- pricing/help

---

# 22. VALIDACIÓN VISUAL OBLIGATORIA

Antes de aprobar cambios:

1. revisar 1440px desktop
2. revisar 1280px laptop
3. revisar 1024px tablet
4. revisar 390px mobile
5. revisar 430px mobile grande
6. revisar dark mode
7. revisar loading
8. revisar empty states
9. revisar error states
10. revisar contenido largo

No aceptar una pantalla únicamente porque "se ve bien" en desktop.

---

# 23. REFERENCIAS VISUALES 2026

Utilizar como inspiración estructural y comparativa:

- Linear
- Stripe Dashboard
- Notion
- Vercel
- Intercom
- Shopify
- Material 3
- Apple Human Interface Guidelines

Referencias externas consultadas:

- https://www.saasui.design/blog/7-saas-ui-design-trends-2026
- https://www.saasui.design/blog/saas-navigation-ux-patterns
- https://www.saasui.design/blog/saas-sidebar-navigation-ux-patterns
- https://www.saasframe.io/blog/the-anatomy-of-high-performance-saas-dashboard-design-2026-trends-patterns
- https://www.devian.in/blogs/saas-dashboard-design-trends
- https://www.peterdraw.studio/blog/dashboard-ui-for-saas

Estas referencias deben tratarse como fuentes de patrones de diseño, no como instrucciones para copiar interfaces propietarias.

---

# 24. INSTRUCCIÓN PARA CLAUDE CODE

Antes de modificar componentes:

1. inspecciona el componente actual y sus rutas;
2. identifica si ya existe un primitive reusable;
3. respeta la arquitectura API existente;
4. no rompas las rutas ni contratos;
5. no dupliques componentes responsive si puede compartirse la semántica;
6. implementa mobile como variante real, no como desktop encogido;
7. prueba estados de loading/error/empty;
8. ejecuta lint/typecheck/build/tests disponibles;
9. captura screenshots de desktop y mobile si el entorno de trabajo lo permite;
10. compara contra este documento antes de marcar la tarea como terminada.

---

# 25. DEFINICIÓN DE "TERMINADO"

El rediseño se considera terminado cuando:

- el usuario entiende dónde está en menos de un segundo;
- las 3–5 acciones principales de cada pantalla son evidentes;
- ninguna página parece un formulario amontonado;
- mobile no requiere zoom ni scroll horizontal;
- el dashboard prioriza decisiones y no solo métricas;
- la interfaz mantiene identidad índigo/slate/Inter;
- el glassmorphism queda como detalle, no como estructura;
- las animaciones son útiles y discretas;
- los estados vacío/carga/error parecen parte del producto;
- desktop y mobile forman una misma familia visual;
- el producto se percibe como un SaaS comercial moderno de 2026.
