import {
  LayoutDashboard,
  Phone,
  Bot,
  Package,
  MessageSquare,
  Users,
  Facebook,
  ShoppingCart,
  Wand2,
  Palette,
  Settings,
  Badge as BadgeIcon,
  Eye,
  type LucideIcon,
} from "lucide-react";

export interface HelpGuideStep {
  title: string;
  description: string;
  /** Ruta bajo /images/help/<guideId>/, se completa en una etapa posterior. */
  screenshot?: string;
  /** Captura en vista móvil: /images/help/<guideId>/2.png. */
  screenshotMobile?: string;
  /** Coincide con un atributo data-tour="..." real en la página de destino. */
  tourTarget?: string;
}

export interface HelpGuide {
  id: string;
  category: string;
  title: string;
  icon: LucideIcon;
  /** Página a la que hay que ir para ver esto en vivo. Vacío si no aplica (ej. tienda pública). */
  route?: string;
  summary: string;
  steps: HelpGuideStep[];
}

export interface HelpCategory {
  id: string;
  label: string;
}

export const HELP_CATEGORIES: HelpCategory[] = [
  { id: "primeros-pasos", label: "Primeros pasos" },
  { id: "ventas-clientes", label: "Ventas y clientes" },
  { id: "canales", label: "Canales" },
  { id: "automatizacion", label: "Automatización con IA" },
  { id: "personalizacion", label: "Personalización y configuración" },
  { id: "cuenta", label: "Cuenta" },
];

export const HELP_GUIDES: HelpGuide[] = [
  {
    id: "panel",
    category: "primeros-pasos",
    title: "Panel principal",
    icon: LayoutDashboard,
    route: "/",
    summary: "Tu resumen de negocio: ingresos, leads, conversaciones y accesos rápidos.",
    steps: [
      {
        title: "Qué ves acá",
        description:
          "El Panel muestra tus KPIs principales (ingresos, leads, conversaciones, negocios ganados), un gráfico de mensajes y tu embudo de ventas, todo actualizado en tiempo real.",
        screenshot: "/images/help/panel/1.png",
        screenshotMobile: "/images/help/panel/2.png",
      },
      {
        title: "Accesos rápidos",
        description:
          "Los tres botones destacados arriba te llevan directo a crear un Agente IA, crear un Producto o conectar WhatsApp — los tres pasos esenciales para arrancar.",
        tourTarget: "dashboard-quick-actions",
      },
      {
        title: "Estado de WhatsApp",
        description: "La pastilla de estado te dice al instante si tu línea de WhatsApp está conectada o no.",
        tourTarget: "dashboard-whatsapp-status",
      },
      {
        title: "Actividad reciente",
        description: "Desde 'Ver todas' saltás directo a la bandeja de Conversaciones.",
        tourTarget: "dashboard-recent-activity",
      },
    ],
  },
  {
    id: "whatsapp-connect",
    category: "primeros-pasos",
    title: "Conectar WhatsApp",
    icon: Phone,
    route: "/whatsapp",
    summary: "Vinculá el número de WhatsApp que va a usar tu Agente IA para vender.",
    steps: [
      {
        title: "Generar el código QR",
        description:
          "Tocá 'Generar código QR'. Es la forma más simple: abrís WhatsApp en tu celular, vas a Dispositivos vinculados y escaneás el código que aparece en pantalla.",
        tourTarget: "whatsapp-qr-button",
      },
      {
        title: "¿No carga el QR?",
        description:
          "Tocá '¿El QR no carga? Usar código PIN', ingresá tu número con código de país y tocá 'Obtener código'. Vas a ver un código para ingresar manualmente en WhatsApp > Dispositivos vinculados > Vincular con número de teléfono.",
        tourTarget: "whatsapp-pin-toggle",
      },
      {
        title: "Conexión activa",
        description:
          "Una vez vinculado vas a ver 'Conexión Activa' con tu número y la hora de inicio de sesión. A partir de acá tu Agente IA ya puede responder mensajes reales.",
        tourTarget: "whatsapp-connected-card",
        screenshot: "/images/help/whatsapp-connect/1.png",
        screenshotMobile: "/images/help/whatsapp-connect/2.png",
      },
      {
        title: "Desconectar o reiniciar",
        description:
          "Si necesitás cambiar de número o algo falla, usá 'Desconectar línea' o 'Borrar sesión y reconectar con QR nuevo'. Desconectar corta las respuestas automáticas al instante.",
        tourTarget: "whatsapp-disconnect-button",
      },
    ],
  },
  {
    id: "agents",
    category: "primeros-pasos",
    title: "Agentes IA",
    icon: Bot,
    route: "/agents",
    summary: "Configurá el vendedor con inteligencia artificial que atiende por WhatsApp.",
    steps: [
      {
        title: "Crear un agente",
        description:
          "Tocá 'Nuevo Agente' y completá Nombre, Rol, Tono y el Prompt del sistema (las instrucciones maestras de cómo debe comportarse).",
        tourTarget: "agents-new-button",
        screenshot: "/images/help/agents/1.png",
        screenshotMobile: "/images/help/agents/2.png",
      },
      {
        title: "El flujo de conversación",
        description:
          "Armá el 'Flujo de Conversación' agregando Etapas en orden (ej: Saludo, Calificación, Presentación, Cierre) — cada etapa tiene sus propias instrucciones. Podés reordenarlas con las flechas.",
      },
      {
        title: "Activar el agente",
        description: "Solo un agente puede estar 'Operando' a la vez — tocá 'Activar' en la tarjeta del que querés usar.",
        tourTarget: "agents-activate-button",
      },
      {
        title: "Editar o eliminar",
        description: "Desde el menú '⋮' de cada tarjeta podés Editar o Eliminar un agente existente.",
      },
    ],
  },
  {
    id: "products",
    category: "primeros-pasos",
    title: "Productos",
    icon: Package,
    route: "/products",
    summary: "Tu catálogo — de acá el Agente IA saca lo que ofrece y vende.",
    steps: [
      {
        title: "Crear un producto",
        description:
          "Tocá 'Nuevo Producto' y completá nombre, descripción, precio, categoría y si es Digital o Físico. También podés usar una de las plantillas rápidas (Servicio Digital, Producto Físico, Suscripción) desde el estado vacío.",
        tourTarget: "products-new-button",
        screenshot: "/images/help/products/1.png",
        screenshotMobile: "/images/help/products/2.png",
      },
      {
        title: "Importar por Excel con IA",
        description: "Si ya tenés un catálogo en Excel/CSV, tocá 'Importar Excel (IA) ✨' y subilo — la IA carga los productos por vos.",
        tourTarget: "products-import-button",
      },
      {
        title: "Links de pago y entrega",
        description:
          "En el formulario del producto configurá el 'Link de Pago Dinámico' y el 'Link de Entrega' — son los que el Agente IA le manda al cliente para cobrar y entregar automáticamente.",
      },
      {
        title: "Activar o pausar",
        description: "El interruptor en cada tarjeta lo saca o lo vuelve a poner disponible para la venta sin borrarlo.",
        tourTarget: "products-active-toggle",
      },
    ],
  },
  {
    id: "conversations",
    category: "ventas-clientes",
    title: "Conversaciones",
    icon: MessageSquare,
    route: "/conversations",
    summary: "La bandeja de entrada en vivo — mirá lo que habla tu Agente IA y tomá el control cuando haga falta.",
    steps: [
      {
        title: "Ver una conversación",
        description: "Elegí un chat de la lista de la izquierda (podés buscar por nombre) para ver todo el historial con ese cliente.",
        tourTarget: "conversations-search",
      },
      {
        title: "Tomar el control",
        description:
          "Tocá 'Tomar Control' para pausar al Agente IA y responder vos mismo — útil si el cliente pide hablar con una persona o algo se complica.",
        tourTarget: "conversations-take-control",
      },
      {
        title: "Devolver a la IA",
        description: "Cuando termines, tocá 'Devolver a IA' para que el agente siga la conversación de nuevo.",
      },
      {
        title: "Etapas del embudo",
        description: "Cada conversación muestra una etiqueta de etapa (Saludo, Calificación, etc.) que te dice en qué punto del proceso de venta está ese cliente.",
      },
    ],
  },
  {
    id: "leads",
    category: "ventas-clientes",
    title: "Prospectos",
    icon: Users,
    route: "/leads",
    summary: "Tu CRM — seguimiento de cada contacto a través del embudo de ventas.",
    steps: [
      {
        title: "Agregar un prospecto",
        description:
          "Tocá 'Nuevo Prospecto' y cargá nombre, teléfono, email, origen y en qué Etapa del Embudo está (Nuevo, Contactado, Calificado, Propuesta, Ganado, Perdido).",
        tourTarget: "leads-new-button",
      },
      {
        title: "Filtrar por etapa",
        description: "Usá los filtros de arriba para ver solo los prospectos de una etapa puntual.",
        tourTarget: "leads-stage-filter",
      },
      {
        title: "Editar valor y notas",
        description: "Desde el menú '⋮' de cada prospecto podés editar su valor estimado y sus notas, para llevar registro de cada seguimiento.",
      },
    ],
  },
  {
    id: "facebook",
    category: "canales",
    title: "Facebook y Meta Ads",
    icon: Facebook,
    route: "/facebook",
    summary: "Conectá tu página de Facebook para anunciar, vender por Messenger y responder comentarios automáticamente.",
    steps: [
      {
        title: "Qué necesitás (y qué NO necesitás)",
        description:
          "Solo necesitás dos cosas, las mismas que ya tenés si manejás tu negocio en Facebook: tu cuenta personal de Facebook, y ser administrador de la página de Facebook de tu negocio. NO necesitás crear ninguna aplicación, clave de API ni token — eso ya está resuelto del lado de VentasPro. Si tu negocio todavía no tiene una página de Facebook, creála primero en facebook.com/pages/create (2 minutos) y después volvé acá.",
      },
      {
        title: "Conectar tu cuenta",
        description:
          "En la pestaña 'Configuración' tocá 'Conectar con Facebook'. Se abre la pantalla de login de Facebook (con tu sesión, no la nuestra) — iniciá sesión si hace falta y tocá 'Continuar' para aprobar los permisos. Al volver, tu página ya queda conectada, sin que hayas visto ni copiado ningún token. La opción manual con tokens es solo para casos avanzados/soporte técnico.",
        tourTarget: "facebook-connect-button",
        screenshot: "/images/help/facebook/1.png",
        screenshotMobile: "/images/help/facebook/2.png",
      },
      {
        title: "Crear anuncios",
        description:
          "En 'Anuncios' elegí un producto, la IA te sugiere audiencia, y definís presupuesto diario y ciudad — el anuncio se crea pausado, listo para revisar antes de activarlo.",
      },
      {
        title: "Borradores masivos",
        description:
          "En 'Borradores' podés generar copies de anuncio para TODOS tus productos de una sola vez con 'Crear borradores para TODOS los productos (Megapacks)', y después publicarlos uno por uno.",
        tourTarget: "facebook-megapack-button",
      },
      {
        title: "Agente IA de anuncios",
        description:
          "En 'Agente IA' el sistema vigila el rendimiento de tus campañas y sugiere pausar o ajustar presupuesto — pero nunca actúa solo, siempre te pide aprobación por WhatsApp.",
      },
      {
        title: "Messenger y Comentarios",
        description: "Las pestañas 'Messenger' y 'Comentarios' activan respuestas automáticas a mensajes de Messenger y comentarios en tus publicaciones.",
      },
    ],
  },
  {
    id: "woocommerce",
    category: "canales",
    title: "WooCommerce",
    icon: ShoppingCart,
    route: "/woocommerce",
    summary: "Sincronizá tu tienda de WordPress/WooCommerce para vender el mismo catálogo por WhatsApp.",
    steps: [
      {
        title: "Generar tus claves",
        description:
          "En tu WordPress: WooCommerce > Ajustes > Avanzado > REST API > 'Añadir clave', ponele descripción 'VentasPro AI' y permisos de Lectura/Escritura. Copiá el Consumer Key y Consumer Secret que te da.",
      },
      {
        title: "Conectar acá",
        description:
          "Pegá la URL de tu tienda, el Consumer Key y el Consumer Secret, activá el interruptor 'Habilitar Integración' y tocá 'Verificar Estado de Conexión'.",
        tourTarget: "woocommerce-enable-toggle",
        screenshot: "/images/help/woocommerce/1.png",
        screenshotMobile: "/images/help/woocommerce/2.png",
      },
      {
        title: "Sincronizar catálogo",
        description: "Con la conexión verificada, tocá 'Sincronizar Catálogo' para traer tus productos de WooCommerce a VentasPro.",
        tourTarget: "woocommerce-sync-button",
      },
      {
        title: "Órdenes automáticas",
        description: "Activá 'Crear órdenes automáticamente' para que cada venta cerrada por WhatsApp genere un pedido pendiente de pago directo en tu WooCommerce.",
      },
    ],
  },
  {
    id: "code-agent",
    category: "automatizacion",
    title: "Atlas VentasPro",
    icon: Wand2,
    route: "/code-agent",
    summary: "Tu asistente de IA operador — le pedís cosas en lenguaje natural y las hace por vos dentro de la app.",
    steps: [
      {
        title: "Modo Operador vs Agente",
        description:
          "En 'Operador' Atlas ejecuta acciones reales (crear productos, cambiar configuración). En 'Agente' solo diseña la configuración de tus Agentes IA, sin tocar nada todavía.",
        tourTarget: "code-agent-mode-toggle",
        screenshot: "/images/help/code-agent/1.png",
        screenshotMobile: "/images/help/code-agent/2.png",
      },
      {
        title: "Pedile algo",
        description: "Escribí lo que necesitás en español normal, por ejemplo 'creá un producto de curso de piano a $49' — Atlas te va a mostrar qué acciones ejecutó y si salieron bien.",
        tourTarget: "code-agent-input",
      },
      {
        title: "Nueva conversación",
        description: "Tocá 'Nueva' si querés arrancar de cero — te va a pedir confirmación porque borra el historial de ese chat.",
      },
    ],
  },
  {
    id: "branding",
    category: "personalizacion",
    title: "Personalización",
    icon: Palette,
    route: "/branding",
    summary: "La identidad visual de tu marca: logo, colores, tipografía y datos de contacto públicos.",
    steps: [
      {
        title: "Logo y nombre",
        description: "Cargá el nombre de tu marca y subí o pegá la URL de tu logo.",
        screenshot: "/images/help/branding/1.png",
        screenshotMobile: "/images/help/branding/2.png",
      },
      {
        title: "Colores y tema",
        description: "Elegí los 6 colores de tu marca (primario, secundario, acento, fondo, texto, desactivado) y el modo (Claro/Oscuro/Automático).",
        tourTarget: "branding-colors",
      },
      {
        title: "Vista previa",
        description: "Tocá 'Vista Previa' para ver cómo queda tu tienda con los cambios antes de guardarlos.",
        tourTarget: "branding-preview-toggle",
      },
      {
        title: "Guardar",
        description: "No te olvides de tocar 'Guardar Cambios' — los cambios no se aplican solos.",
        tourTarget: "branding-save-button",
      },
    ],
  },
  {
    id: "settings",
    category: "personalizacion",
    title: "Configuración",
    icon: Settings,
    route: "/settings",
    summary: "El motor detrás de todo: comportamiento de la IA, horarios, credenciales de pago/email/Facebook y seguridad.",
    steps: [
      {
        title: "Perfil e IA",
        description: "Cargá los datos de tu negocio y elegí el Proveedor de IA principal que va a usar tu Agente (con un indicador en vivo de si está bien conectado).",
        tourTarget: "settings-ai-provider",
        screenshot: "/images/help/settings/1.png",
        screenshotMobile: "/images/help/settings/2.png",
      },
      {
        title: "Horarios y respuestas automáticas",
        description: "Definí tu horario de atención y un mensaje automático para fuera de horario.",
      },
      {
        title: "Palabras de escalamiento",
        description: "Agregá palabras clave (ej. 'hablar con humano') que, cuando el cliente las escriba, transfieren la conversación a una persona automáticamente.",
        tourTarget: "settings-escalation-keywords",
      },
      {
        title: "Credenciales",
        description: "Más abajo están los bloques de Pagos, Email, Facebook y Seguridad de la cuenta (verificación en dos pasos) — cada uno con sus propias credenciales.",
      },
      {
        title: "Guardar todo",
        description: "El botón flotante 'Guardar Todos los Cambios' abajo guarda TODO el formulario de una sola vez — es fácil pasarlo por alto porque queda fijo en la pantalla.",
        tourTarget: "settings-save-button",
      },
    ],
  },
  {
    id: "pricing",
    category: "cuenta",
    title: "Planes y facturación",
    icon: BadgeIcon,
    route: "/pricing",
    summary: "Elegí o cambiá tu plan, y mirá cuánto estás pagando.",
    steps: [
      {
        title: "Ciclo de facturación",
        description: "Elegí Mensual, Trimestral (10% de descuento) o Anual (20% de descuento).",
        tourTarget: "pricing-billing-cycle",
        screenshot: "/images/help/pricing/1.png",
        screenshotMobile: "/images/help/pricing/2.png",
      },
      {
        title: "Método de pago",
        description: "Pagás con MercadoPago o PayPal — elegí el que prefieras antes de confirmar el plan.",
      },
      {
        title: "Cambiar de plan",
        description: "Tocá el botón del plan que querés — te lleva directo al checkout. Tu plan actual queda marcado con 'Tu Plan Actual'.",
        tourTarget: "pricing-current-plan",
      },
    ],
  },
  {
    id: "tienda",
    category: "canales",
    title: "Tu tienda pública",
    icon: Eye,
    summary: "La tienda online que ven tus clientes, con tu catálogo y tu marca — se abre en una pestaña nueva.",
    steps: [
      {
        title: "Cómo se ve",
        description: "Tocá 'Ver Tienda' en el menú lateral para abrir, en una pestaña nueva, la tienda pública tal como la ve cualquier cliente: tu catálogo, tu logo y tus colores.",
        screenshot: "/images/help/tienda/1.png",
        screenshotMobile: "/images/help/tienda/2.png",
      },
      {
        title: "Se actualiza sola",
        description: "No hay nada que sincronizar a mano: cualquier producto o cambio de marca que guardes en el panel aparece ahí automáticamente.",
      },
    ],
  },
];

export function getHelpGuide(id: string | null | undefined): HelpGuide | undefined {
  return id ? HELP_GUIDES.find(g => g.id === id) : undefined;
}
