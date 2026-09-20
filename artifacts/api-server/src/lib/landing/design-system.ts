/**
 * ============================================================
 * DESIGN SYSTEM — las familias visuales de Landing AI Studio
 * ============================================================
 *
 * La regla que define este archivo, dicha por el dueño: *"cada familia debe
 * modificar realmente la COMPOSICIÓN, no solamente color = diferente"*.
 *
 * Por eso ninguna familia se distingue solo por su paleta. Lo que cambia de
 * una a otra es lo que un diseñador cambiaría de verdad:
 *
 *   · el ancho del contenido y el aire vertical (densidad)
 *   · la alineación --centrado, a la izquierda, alterno--
 *   · la escala tipográfica y el peso del display
 *   · cómo se tratan las imágenes (enmarcadas, a sangre, recortadas)
 *   · la forma del CTA y cuánto pesa en la página
 *   · QUÉ LAYOUT prefiere cada sección
 *
 * Dos landings de familias distintas tienen que verse como trabajo de dos
 * estudios distintos, no como la misma plantilla repintada.
 *
 * ── Por qué los tokens y no CSS suelto ────────────────────────────────────
 *
 * El renderer consume ESTOS objetos. Un estilo nuevo se agrega acá y funciona
 * en todas las secciones sin tocar el renderer, que es justo lo que pedía el
 * punto 1 del plan: "no hardcodear todos los estilos dentro de los
 * componentes".
 *
 * ── Lo que este archivo NO hace ───────────────────────────────────────────
 *
 * No renderiza, no llama a ningún modelo y no toca la base. Es data pura y
 * determinística: por eso se puede probar entera sin red, y por eso el
 * "Sorpréndeme" (elegirFamilia) da un resultado explicable en vez de una
 * tirada de dados.
 */

/** Las familias visuales disponibles. Agregar una acá la habilita en todo el sistema. */
export type FamiliaVisual =
  | "premium"
  | "respuesta-directa"
  | "minimal"
  | "editorial"
  | "ecommerce"
  | "belleza"
  | "fitness"
  | "educacion"
  | "tecnologia"
  | "familiar"
  | "creativa"
  | "oscura"
  | "launch"
  | "electronica"
  | "suplemento"
  | "gourmet"
  | "dropshipping";

export const FAMILIAS: readonly FamiliaVisual[] = [
  "premium", "respuesta-directa", "minimal", "editorial", "ecommerce", "belleza",
  "fitness", "educacion", "tecnologia", "familiar", "creativa", "oscura", "launch",
  "electronica", "suplemento", "gourmet", "dropshipping",
] as const;

/** Cómo se integran las fotos. Cambia la composición, no un filtro. */
export type TratamientoDeImagen =
  | "enmarcada"        // con borde/radio, separada del fondo
  | "a-sangre"         // ocupa todo el ancho, sin margen
  | "recorte-alto"     // vertical, tipo editorial de revista
  | "flotante"         // producto recortado sobre color, con sombra
  | "en-contexto";     // escena de uso, la foto manda sobre el texto

/** La forma del llamado a la acción. */
export type EstiloDeCTA =
  | "solido"           // botón lleno, el estándar
  | "contorno"         // borde, sin relleno: discreto
  | "pastilla"         // muy redondeado, suave
  | "bloque"           // ancho completo, imposible de no ver
  | "subrayado";       // casi un enlace, para lo editorial

/** Cómo se alternan los fondos a lo largo de la página. */
export type EstrategiaDeFondo = "plano" | "alterno" | "oscuro" | "degradado-sutil" | "degradado-vivo";

export type Alineacion = "centrado" | "izquierda" | "alterno";

export interface TokensDeDiseno {
  familia: FamiliaVisual;
  /** Nombre para mostrarle al admin, en su idioma. */
  nombre: string;
  /** Cuándo conviene esta familia, en una línea. Se muestra en el selector. */
  cuando: string;

  tipografia: {
    display: string;
    texto: string;
    /** Multiplicador de la escala base. >1 agranda todos los títulos. */
    escala: number;
    pesoDisplay: number;
    /** letter-spacing del título: negativo aprieta, positivo abre. */
    espaciadoTitulo: string;
    /** Altura de línea del cuerpo. Más alto = más aire, se lee más lento. */
    interlineado: number;
  };

  color: {
    fondo: string;
    superficie: string;
    texto: string;
    textoSuave: string;
    acento: string;
    /** Texto que va ENCIMA del acento. Si no contrasta, el CTA no se lee. */
    sobreAcento: string;
    borde: string;
  };

  ritmo: {
    /** Ancho máximo del contenido. Angosto = más editorial, ancho = más comercial. */
    anchoContenido: string;
    /** Aire vertical de cada sección. Es lo que más cambia la sensación de "premium". */
    padSeccionY: string;
    padSeccionX: string;
    /** Separación entre bloques dentro de una sección. */
    separacion: string;
  };

  forma: {
    radio: string;
    sombra: string;
    borde: string;
  };

  alineacion: Alineacion;
  fondos: EstrategiaDeFondo;
  imagen: TratamientoDeImagen;
  cta: EstiloDeCTA;

  /**
   * Qué layout prefiere cada sección en esta familia.
   *
   * El primero es el favorito; los demás son alternativas válidas para que el
   * Design Agent pueda variar sin salirse de la identidad. Los nombres los
   * consume el catálogo de layouts (FASE C); acá viven las PREFERENCIAS, que
   * es lo que hace que la familia cambie la composición y no solo el color.
   */
  layoutsPreferidos: Record<string, string[]>;
}

/**
 * Las 13 familias.
 *
 * Cada una se escribió mirando qué la distingue COMPOSITIVAMENTE de las otras.
 * Si dos familias terminaran con el mismo ritmo, alineación y layouts, una de
 * las dos sobra -- y hay una prueba que lo verifica.
 */
export const TOKENS: Record<FamiliaVisual, TokensDeDiseno> = {
  premium: {
    familia: "premium",
    nombre: "Premium",
    cuando: "Productos caros donde la calma comunica valor. Mucho aire, poco ruido.",
    tipografia: { display: "'Playfair Display', Georgia, serif", texto: "'Inter', system-ui, sans-serif", escala: 1.15, pesoDisplay: 500, espaciadoTitulo: "-0.02em", interlineado: 1.75 },
    color: { fondo: "#FBFAF8", superficie: "#FFFFFF", texto: "#1A1815", textoSuave: "#6B6560", acento: "#8C7A5B", sobreAcento: "#FFFFFF", borde: "#E8E3DC" },
    ritmo: { anchoContenido: "1080px", padSeccionY: "120px", padSeccionX: "32px", separacion: "28px" },
    forma: { radio: "4px", sombra: "0 1px 2px rgba(26,24,21,.04)", borde: "1px solid #E8E3DC" },
    alineacion: "centrado",
    fondos: "alterno",
    imagen: "enmarcada",
    cta: "contorno",
    layoutsPreferidos: {
      hero: ["hero_editorial", "hero_center", "hero_split"],
      benefits: ["benefits_editorial", "benefits_split"],
      offer: ["offer_minimal", "offer_card"],
      testimonials: ["testimonial_quote", "testimonial_large"],
      faq: ["faq_minimal", "faq_accordion"],
    },
  },

  "respuesta-directa": {
    familia: "respuesta-directa",
    nombre: "Respuesta directa",
    cuando: "Cuando la landing recibe tráfico pago y cada scroll cuesta plata.",
    tipografia: { display: "'Archivo', Impact, sans-serif", texto: "'Inter', system-ui, sans-serif", escala: 1.3, pesoDisplay: 800, espaciadoTitulo: "-0.03em", interlineado: 1.6 },
    color: { fondo: "#FFFFFF", superficie: "#FFF8E7", texto: "#0B0B0C", textoSuave: "#4A4A50", acento: "#E5342A", sobreAcento: "#FFFFFF", borde: "#E3E3E6" },
    ritmo: { anchoContenido: "820px", padSeccionY: "56px", padSeccionX: "20px", separacion: "18px" },
    forma: { radio: "8px", sombra: "0 4px 14px rgba(229,52,42,.16)", borde: "2px solid #0B0B0C" },
    alineacion: "centrado",
    fondos: "alterno",
    imagen: "flotante",
    cta: "bloque",
    layoutsPreferidos: {
      hero: ["hero_offer", "hero_center", "hero_product_focus"],
      benefits: ["benefits_numbered", "benefits_cards"],
      offer: ["offer_urgency", "offer_card"],
      testimonials: ["testimonial_cards", "testimonial_slider"],
      faq: ["faq_accordion", "faq_cards"],
    },
  },

  // ── Dropshipping 2026 ──────────────────────────────────────────────────
  // Pedido del dueño (20-09-2026): "las familias están pasadas de moda; ahora
  // están en moda los degradados y lo profesional; las landings de producto
  // físico son muy directas y emocionantes". Esta es la familia por defecto
  // de todo producto físico. El ACENTO real lo pone el color del producto
  // (lib/landing/color-del-producto.ts); lo de acá es la composición: hero con
  // degradado profundo→vivo del acento, foto del producto con halo, CTA
  // pastilla con degradado, tarjetas con vidrio suave, franjas alternas
  // claras, y un ritmo rápido (secciones cortas, mucho contraste).
  dropshipping: {
    familia: "dropshipping",
    nombre: "Dropshipping directo",
    cuando: "Producto físico con pago contraentrega: la página tiene que emocionar y cerrar en el primer scroll.",
    tipografia: { display: "'Poppins', 'Inter', system-ui, sans-serif", texto: "'Inter', system-ui, sans-serif", escala: 1.28, pesoDisplay: 800, espaciadoTitulo: "-0.03em", interlineado: 1.55 },
    color: { fondo: "#FFFFFF", superficie: "#F6F7FB", texto: "#0F1222", textoSuave: "#4B5063", acento: "#4F46E5", sobreAcento: "#FFFFFF", borde: "#E6E8F0" },
    ritmo: { anchoContenido: "1040px", padSeccionY: "64px", padSeccionX: "20px", separacion: "20px" },
    forma: { radio: "22px", sombra: "0 24px 60px rgba(15,18,34,.14)", borde: "1px solid rgba(255,255,255,.35)" },
    alineacion: "centrado",
    fondos: "degradado-vivo",
    imagen: "flotante",
    cta: "pastilla",
    layoutsPreferidos: {
      hero: ["hero_gradient_product", "hero_split", "hero_product_focus"],
      benefits: ["benefits_cards", "benefits_icon_grid"],
      offer: ["offer_card", "offer_urgency"],
      testimonials: ["testimonial_cards"],
      faq: ["faq_accordion"],
    },
  },

  minimal: {
    familia: "minimal",
    nombre: "Minimal",
    cuando: "Cuando el producto se explica solo y todo lo demás estorba.",
    tipografia: { display: "'Inter', system-ui, sans-serif", texto: "'Inter', system-ui, sans-serif", escala: 1.0, pesoDisplay: 600, espaciadoTitulo: "-0.025em", interlineado: 1.7 },
    color: { fondo: "#FFFFFF", superficie: "#FAFAFA", texto: "#111111", textoSuave: "#767676", acento: "#111111", sobreAcento: "#FFFFFF", borde: "#EDEDED" },
    ritmo: { anchoContenido: "720px", padSeccionY: "104px", padSeccionX: "24px", separacion: "24px" },
    forma: { radio: "0px", sombra: "none", borde: "1px solid #EDEDED" },
    alineacion: "izquierda",
    fondos: "plano",
    imagen: "a-sangre",
    cta: "subrayado",
    layoutsPreferidos: {
      hero: ["hero_left", "hero_full_visual"],
      benefits: ["benefits_split", "benefits_icon_grid"],
      offer: ["offer_minimal"],
      testimonials: ["testimonial_quote"],
      faq: ["faq_minimal"],
    },
  },

  editorial: {
    familia: "editorial",
    nombre: "Editorial",
    cuando: "Marcas con historia que contar: se lee como una revista.",
    tipografia: { display: "'Fraunces', Georgia, serif", texto: "'Source Serif 4', Georgia, serif", escala: 1.2, pesoDisplay: 600, espaciadoTitulo: "-0.015em", interlineado: 1.8 },
    color: { fondo: "#F7F5F0", superficie: "#FFFFFF", texto: "#221F1A", textoSuave: "#5F594F", acento: "#1F4E42", sobreAcento: "#FFFFFF", borde: "#DED8CC" },
    ritmo: { anchoContenido: "960px", padSeccionY: "112px", padSeccionX: "28px", separacion: "32px" },
    forma: { radio: "2px", sombra: "none", borde: "1px solid #DED8CC" },
    alineacion: "alterno",
    fondos: "alterno",
    imagen: "recorte-alto",
    cta: "subrayado",
    layoutsPreferidos: {
      hero: ["hero_editorial", "hero_split"],
      benefits: ["benefits_editorial", "benefits_numbered"],
      offer: ["offer_split", "offer_minimal"],
      testimonials: ["testimonial_editorial", "testimonial_quote"],
      faq: ["faq_split", "faq_minimal"],
    },
  },

  // ── Medido en tiendas reales de contraentrega en Colombia (19-09-2026) ──
  // hitcolombia.co (corrector de postura): fondo blanco, texto negro, foto
  // grande a la izquierda, precio grande, botón AMARILLO-DORADO ancho
  // "COMPRAR YA Y PAGA CONTRA ENTREGA", secundario negro, fuente Assistant.
  // distrihome.co (mismo producto): blanco/negro + azul #0071CE, Poppins.
  // Antes esto era azul #1B6EF3 sobre gris azulado, más "SaaS" que tienda.
  // El dueño lo dijo claro: "busca lo que de verdad se usa, no cosas
  // ficticias". Esto es lo que se usa.
  ecommerce: {
    familia: "ecommerce",
    nombre: "Ecommerce",
    cuando: "Producto físico de contraentrega: foto grande, precio claro, botón imposible de no ver, sellos de confianza.",
    tipografia: { display: "'Poppins', system-ui, sans-serif", texto: "'Inter', system-ui, sans-serif", escala: 1.1, pesoDisplay: 700, espaciadoTitulo: "-0.02em", interlineado: 1.65 },
    color: { fondo: "#FFFFFF", superficie: "#F7F7F7", texto: "#111111", textoSuave: "#555B63", acento: "#F2B71B", sobreAcento: "#111111", borde: "#E5E7EB" },
    ritmo: { anchoContenido: "1140px", padSeccionY: "72px", padSeccionX: "24px", separacion: "20px" },
    forma: { radio: "10px", sombra: "0 2px 10px rgba(17,17,17,.08)", borde: "1px solid #E5E7EB" },
    alineacion: "izquierda",
    fondos: "alterno",
    imagen: "flotante",
    cta: "bloque",
    layoutsPreferidos: {
      hero: ["hero_product_focus", "hero_split"],
      benefits: ["benefits_icon_grid", "benefits_cards"],
      offer: ["offer_product", "offer_card"],
      testimonials: ["testimonial_cards", "testimonial_slider"],
      faq: ["faq_accordion", "faq_cards"],
    },
  },

  belleza: {
    familia: "belleza",
    nombre: "Belleza",
    cuando: "Aspiracional: la foto manda y el texto acompaña.",
    tipografia: { display: "'Cormorant Garamond', Georgia, serif", texto: "'Inter', system-ui, sans-serif", escala: 1.25, pesoDisplay: 400, espaciadoTitulo: "0.01em", interlineado: 1.8 },
    color: { fondo: "#FDF8F5", superficie: "#FFFFFF", texto: "#2B2320", textoSuave: "#8A7A72", acento: "#C08573", sobreAcento: "#FFFFFF", borde: "#EFE2DA" },
    ritmo: { anchoContenido: "1020px", padSeccionY: "116px", padSeccionX: "28px", separacion: "26px" },
    forma: { radio: "20px", sombra: "0 6px 24px rgba(192,133,115,.12)", borde: "none" },
    alineacion: "centrado",
    fondos: "degradado-sutil",
    imagen: "en-contexto",
    cta: "pastilla",
    layoutsPreferidos: {
      hero: ["hero_full_visual", "hero_editorial"],
      benefits: ["benefits_visual", "benefits_editorial"],
      offer: ["offer_split", "offer_minimal"],
      testimonials: ["testimonial_large", "testimonial_editorial"],
      faq: ["faq_minimal", "faq_accordion"],
    },
  },

  // ── Medido en gymshark.com (19-09-2026): blanco y negro, un solo acento
  // rojo #BF2E35, fotos a sangre. Antes esto era negro con lima #C8FF3D, un
  // "gamer" que el dueño describió como colores feos y ficticios.
  fitness: {
    familia: "fitness",
    nombre: "Fitness",
    cuando: "Deporte y transformación: blanco y negro, fotos a sangre y un solo acento fuerte.",
    tipografia: { display: "'Archivo', Impact, sans-serif", texto: "'Inter', system-ui, sans-serif", escala: 1.3, pesoDisplay: 800, espaciadoTitulo: "-0.035em", interlineado: 1.55 },
    color: { fondo: "#FFFFFF", superficie: "#F4F4F5", texto: "#0A0A0A", textoSuave: "#52525B", acento: "#BF2E35", sobreAcento: "#FFFFFF", borde: "#E4E4E7" },
    ritmo: { anchoContenido: "1080px", padSeccionY: "88px", padSeccionX: "22px", separacion: "22px" },
    forma: { radio: "4px", sombra: "0 2px 12px rgba(10,10,10,.10)", borde: "1px solid #E4E4E7" },
    alineacion: "izquierda",
    fondos: "alterno",
    imagen: "a-sangre",
    cta: "bloque",
    layoutsPreferidos: {
      hero: ["hero_full_visual", "hero_split"],
      benefits: ["benefits_numbered", "benefits_split"],
      offer: ["offer_dark", "offer_urgency"],
      testimonials: ["testimonial_cards", "testimonial_large"],
      faq: ["faq_accordion"],
    },
  },

  educacion: {
    familia: "educacion",
    nombre: "Educación",
    cuando: "Cursos y formación: confianza, claridad y estructura.",
    tipografia: { display: "'Inter', system-ui, sans-serif", texto: "'Inter', system-ui, sans-serif", escala: 1.1, pesoDisplay: 700, espaciadoTitulo: "-0.02em", interlineado: 1.75 },
    color: { fondo: "#FFFFFF", superficie: "#F4F7FB", texto: "#101828", textoSuave: "#5B667A", acento: "#2A5BD7", sobreAcento: "#FFFFFF", borde: "#DFE6F0" },
    ritmo: { anchoContenido: "980px", padSeccionY: "80px", padSeccionX: "24px", separacion: "22px" },
    forma: { radio: "10px", sombra: "0 2px 8px rgba(16,24,40,.06)", borde: "1px solid #DFE6F0" },
    alineacion: "izquierda",
    fondos: "alterno",
    imagen: "enmarcada",
    cta: "solido",
    layoutsPreferidos: {
      hero: ["hero_split", "hero_left"],
      benefits: ["benefits_numbered", "benefits_icon_grid"],
      offer: ["offer_card", "offer_split"],
      testimonials: ["testimonial_cards", "testimonial_quote"],
      faq: ["faq_accordion", "faq_split"],
    },
  },

  tecnologia: {
    familia: "tecnologia",
    nombre: "Tecnología",
    cuando: "Software y herramientas: moderno, limpio, preciso.",
    tipografia: { display: "'Space Grotesk', system-ui, sans-serif", texto: "'Inter', system-ui, sans-serif", escala: 1.1, pesoDisplay: 600, espaciadoTitulo: "-0.03em", interlineado: 1.7 },
    color: { fondo: "#FCFCFD", superficie: "#F2F4F7", texto: "#0C111D", textoSuave: "#667085", acento: "#5B4BE8", sobreAcento: "#FFFFFF", borde: "#E4E7EC" },
    ritmo: { anchoContenido: "1120px", padSeccionY: "92px", padSeccionX: "24px", separacion: "24px" },
    forma: { radio: "14px", sombra: "0 4px 16px rgba(12,17,29,.06)", borde: "1px solid #E4E7EC" },
    alineacion: "centrado",
    fondos: "plano",
    imagen: "enmarcada",
    cta: "solido",
    layoutsPreferidos: {
      hero: ["hero_center", "hero_product_focus"],
      benefits: ["benefits_icon_grid", "benefits_cards"],
      offer: ["offer_card", "offer_minimal"],
      testimonials: ["testimonial_slider", "testimonial_cards"],
      faq: ["faq_accordion", "faq_minimal"],
    },
  },

  /**
   * Las tres siguientes salen de las plantillas de producto de Envato
   * Elements (elements.envato.com/web-templates/product), que el dueño dio
   * como referencia el 19-09-2026: Promix / Ex Watch / Targus (electrónica),
   * Suppke / VIGO / Hisupp (suplementos) y Delicio / Broccoli / Krishok
   * (comida y orgánico). Se toma el criterio visual, no los archivos.
   */
  electronica: {
    familia: "electronica",
    nombre: "Electrónica",
    cuando: "Gadgets y aparatos: fondo azul noche, producto flotando con brillo, ficha técnica en grilla.",
    tipografia: { display: "'Space Grotesk', system-ui, sans-serif", texto: "'Inter', system-ui, sans-serif", escala: 1.2, pesoDisplay: 700, espaciadoTitulo: "-0.03em", interlineado: 1.65 },
    color: { fondo: "#0B1220", superficie: "#111B2E", texto: "#F8FAFC", textoSuave: "#94A3B8", acento: "#22D3EE", sobreAcento: "#0B1220", borde: "#1E2A44" },
    ritmo: { anchoContenido: "1120px", padSeccionY: "100px", padSeccionX: "24px", separacion: "26px" },
    forma: { radio: "18px", sombra: "0 16px 48px rgba(34,211,238,.12)", borde: "1px solid #1E2A44" },
    alineacion: "centrado",
    fondos: "oscuro",
    imagen: "flotante",
    cta: "solido",
    layoutsPreferidos: {
      hero: ["hero_product_focus", "hero_dark"],
      benefits: ["benefits_icon_grid", "benefits_split"],
      offer: ["offer_dark", "offer_card"],
      testimonials: ["testimonial_cards", "testimonial_slider"],
      faq: ["faq_accordion", "faq_minimal"],
    },
  },

  suplemento: {
    familia: "suplemento",
    nombre: "Salud y suplementos",
    cuando: "Vitaminas, colágeno, proteínas, productos naturales: blanco limpio, verde de confianza, beneficios e ingredientes claros.",
    tipografia: { display: "'Poppins', system-ui, sans-serif", texto: "'Inter', system-ui, sans-serif", escala: 1.15, pesoDisplay: 700, espaciadoTitulo: "-0.02em", interlineado: 1.7 },
    color: { fondo: "#FFFFFF", superficie: "#F1F8F2", texto: "#14291A", textoSuave: "#5B6B60", acento: "#16A34A", sobreAcento: "#FFFFFF", borde: "#DCEBDF" },
    ritmo: { anchoContenido: "1100px", padSeccionY: "88px", padSeccionX: "24px", separacion: "24px" },
    forma: { radio: "20px", sombra: "0 8px 28px rgba(22,163,74,.10)", borde: "1px solid #DCEBDF" },
    alineacion: "izquierda",
    fondos: "plano",
    imagen: "flotante",
    cta: "pastilla",
    layoutsPreferidos: {
      hero: ["hero_split", "hero_product_focus"],
      benefits: ["benefits_icon_grid", "benefits_cards"],
      offer: ["offer_card", "offer_minimal"],
      testimonials: ["testimonial_cards", "testimonial_quote"],
      faq: ["faq_accordion", "faq_minimal"],
    },
  },

  gourmet: {
    familia: "gourmet",
    nombre: "Gourmet",
    cuando: "Comida, café, chocolate, orgánico: tonos cálidos de cacao y crema, foto grande que dé apetito.",
    tipografia: { display: "'Playfair Display', Georgia, serif", texto: "'Inter', system-ui, sans-serif", escala: 1.25, pesoDisplay: 700, espaciadoTitulo: "-0.01em", interlineado: 1.7 },
    color: { fondo: "#FFF9F2", superficie: "#FFFFFF", texto: "#2B1B12", textoSuave: "#7A6558", acento: "#7C3F1D", sobreAcento: "#FFFFFF", borde: "#EFE0D2" },
    ritmo: { anchoContenido: "1080px", padSeccionY: "96px", padSeccionX: "24px", separacion: "26px" },
    forma: { radio: "22px", sombra: "0 10px 32px rgba(124,63,29,.10)", borde: "1px solid #EFE0D2" },
    alineacion: "centrado",
    fondos: "plano",
    imagen: "a-sangre",
    cta: "pastilla",
    layoutsPreferidos: {
      hero: ["hero_split", "hero_center"],
      benefits: ["benefits_cards", "benefits_split"],
      offer: ["offer_card", "offer_minimal"],
      testimonials: ["testimonial_quote", "testimonial_cards"],
      faq: ["faq_minimal", "faq_accordion"],
    },
  },

  familiar: {
    familia: "familiar",
    nombre: "Familiar",
    cuando: "Productos del día a día: cálido, cercano, sin solemnidad.",
    tipografia: { display: "'Nunito', system-ui, sans-serif", texto: "'Nunito', system-ui, sans-serif", escala: 1.05, pesoDisplay: 700, espaciadoTitulo: "-0.01em", interlineado: 1.75 },
    color: { fondo: "#FFFDF9", superficie: "#FFF4E8", texto: "#2E2A26", textoSuave: "#7A716A", acento: "#E8792B", sobreAcento: "#FFFFFF", borde: "#F2E3D2" },
    ritmo: { anchoContenido: "1000px", padSeccionY: "76px", padSeccionX: "24px", separacion: "22px" },
    forma: { radio: "18px", sombra: "0 4px 16px rgba(232,121,43,.10)", borde: "none" },
    alineacion: "centrado",
    fondos: "alterno",
    imagen: "en-contexto",
    cta: "pastilla",
    layoutsPreferidos: {
      hero: ["hero_center", "hero_split"],
      benefits: ["benefits_cards", "benefits_visual"],
      offer: ["offer_card", "offer_product"],
      testimonials: ["testimonial_cards", "testimonial_large"],
      faq: ["faq_cards", "faq_accordion"],
    },
  },

  creativa: {
    familia: "creativa",
    nombre: "Creativa",
    cuando: "Cuando destacar importa más que encajar. Composición experimental.",
    tipografia: { display: "'Bricolage Grotesque', system-ui, sans-serif", texto: "'Inter', system-ui, sans-serif", escala: 1.4, pesoDisplay: 800, espaciadoTitulo: "-0.04em", interlineado: 1.6 },
    color: { fondo: "#FFFCF2", superficie: "#FFE94A", texto: "#141414", textoSuave: "#5A5648", acento: "#3B1FD9", sobreAcento: "#FFFFFF", borde: "#141414" },
    ritmo: { anchoContenido: "1200px", padSeccionY: "96px", padSeccionX: "20px", separacion: "30px" },
    forma: { radio: "24px", sombra: "6px 6px 0 #141414", borde: "2px solid #141414" },
    alineacion: "alterno",
    fondos: "alterno",
    imagen: "recorte-alto",
    cta: "solido",
    layoutsPreferidos: {
      hero: ["hero_split", "hero_editorial", "hero_full_visual"],
      benefits: ["benefits_visual", "benefits_numbered"],
      offer: ["offer_split", "offer_product"],
      testimonials: ["testimonial_editorial", "testimonial_large"],
      faq: ["faq_cards", "faq_split"],
    },
  },

  oscura: {
    familia: "oscura",
    nombre: "Oscura",
    cuando: "Fondo oscuro con el producto iluminado. Lujo, gaming, tecnología cara.",
    tipografia: { display: "'Space Grotesk', system-ui, sans-serif", texto: "'Inter', system-ui, sans-serif", escala: 1.2, pesoDisplay: 700, espaciadoTitulo: "-0.03em", interlineado: 1.7 },
    color: { fondo: "#08090B", superficie: "#121418", texto: "#F2F4F7", textoSuave: "#98A2B3", acento: "#00D3A7", sobreAcento: "#08090B", borde: "#1E2229" },
    ritmo: { anchoContenido: "1080px", padSeccionY: "104px", padSeccionX: "24px", separacion: "26px" },
    forma: { radio: "16px", sombra: "0 10px 40px rgba(0,211,167,.10)", borde: "1px solid #1E2229" },
    alineacion: "centrado",
    fondos: "oscuro",
    imagen: "flotante",
    cta: "solido",
    layoutsPreferidos: {
      hero: ["hero_dark", "hero_product_focus"],
      benefits: ["benefits_icon_grid", "benefits_split"],
      offer: ["offer_dark", "offer_card"],
      testimonials: ["testimonial_slider", "testimonial_quote"],
      faq: ["faq_minimal", "faq_accordion"],
    },
  },

  /**
   * Port del lenguaje visual de Launch UI (launchuicomponents.com, MIT): la
   * estética "lanzamiento de producto" de las landings de SaaS y apps. Fondo
   * casi negro con un halo radial del color de marca detrás del hero, título
   * con degradado, tarjetas de cristal, marco tipo mockup en la foto y
   * entradas animadas. La composición (halo, cristal, marco) vive en el CSS
   * propio de esta familia en renderer-v3; acá solo van los tokens.
   */
  launch: {
    familia: "launch",
    nombre: "Launch",
    cuando: "Apps, software y productos digitales que quieren verse como un lanzamiento: oscuro, con brillo de marca y cristal.",
    tipografia: { display: "'Inter', system-ui, sans-serif", texto: "'Inter', system-ui, sans-serif", escala: 1.25, pesoDisplay: 600, espaciadoTitulo: "-0.035em", interlineado: 1.65 },
    color: { fondo: "#131316", superficie: "#1B1B1F", texto: "#FAFAFA", textoSuave: "#A1A1AA", acento: "#F59E4B", sobreAcento: "#131316", borde: "#2A2A30" },
    ritmo: { anchoContenido: "1280px", padSeccionY: "128px", padSeccionX: "16px", separacion: "24px" },
    forma: { radio: "12px", sombra: "0 25px 50px -12px rgba(0,0,0,.55)", borde: "1px solid #2A2A30" },
    alineacion: "centrado",
    fondos: "oscuro",
    imagen: "enmarcada",
    cta: "solido",
    layoutsPreferidos: {
      hero: ["hero_center", "hero_product_focus", "hero_dark"],
      benefits: ["benefits_icon_grid", "benefits_cards"],
      offer: ["offer_card", "offer_dark"],
      testimonials: ["testimonial_cards", "testimonial_slider"],
      faq: ["faq_accordion", "faq_cards"],
    },
  },
};

/** ¿Es una familia conocida? Sirve para no confiar en lo que mande el modelo. */
export function esFamilia(valor: unknown): valor is FamiliaVisual {
  return typeof valor === "string" && (FAMILIAS as readonly string[]).includes(valor);
}

/**
 * Devuelve los tokens de una familia, cayendo a una segura si no se reconoce.
 *
 * Nunca lanza: esto lo alimenta un modelo, y un nombre inventado no puede
 * dejar sin landing al admin. `ecommerce` es el respaldo porque es la familia
 * más neutra -- funciona para casi cualquier producto sin verse fuera de lugar.
 */
export function tokensDe(familia: unknown): TokensDeDiseno {
  return esFamilia(familia) ? TOKENS[familia] : TOKENS.ecommerce;
}

/** Lo que se sabe del producto a la hora de elegir un estilo. */
export interface PistasDelProducto {
  categoria?: string | null;
  nombre?: string | null;
  descripcion?: string | null;
  /** "digital" | "physical" | ... tal como lo guarda la tabla de productos. */
  tipo?: string | null;
  precio?: number | null;
  /** El ángulo/estrategia si ya se definió. */
  angulo?: string | null;
}

/**
 * Palabras que delatan un rubro. En español y en inglés porque los catálogos
 * reales tienen de las dos, y sin acentos porque se compara normalizado.
 */
const SENALES: Array<{ familia: FamiliaVisual; palabras: string[] }> = [
  // Las más específicas primero: "proteína" es suplemento antes que fitness,
  // "audífonos" es electrónica antes que "oscura".
  { familia: "electronica", palabras: ["audifono", "auricular", "parlante", "smartwatch", "reloj inteligente", "drone", "dron", "camara", "celular", "smartphone", "laptop", "tablet", "cargador", "gadget", "led", "bluetooth", "consola", "gaming", "gamer", "proyector", "power bank"] },
  { familia: "gourmet", palabras: ["chocolate", "cafe", "comida", "gourmet", "organico", "panaderia", "torta", "postre", "vino", "cerveza", "miel", "te ", "reposteria", "snack", "granola"] },
  { familia: "belleza", palabras: ["belleza", "beauty", "piel", "skin", "cabello", "pelo", "maquillaje", "cosmetic", "crema", "serum", "facial", "perfume", "unas"] },
  { familia: "suplemento", palabras: ["suplemento", "vitamina", "colageno", "proteina", "omega", "magnesio", "creatina", "quemador", "adelgazante", "herbal", "capsula", "gomitas"] },
  // Salud/ortopedia (corrector de postura, faja, rodillera) NO es fitness:
  // en las tiendas reales va como cualquier producto de contraentrega.
  { familia: "dropshipping", palabras: ["corrector de postura", "postura", "ortoped", "faja", "rodillera", "lumbar", "cervical", "masajeador", "terapia", "alivio"] },
  { familia: "fitness", palabras: ["fitness", "gym", "gimnasio", "entrenamiento", "workout", "musculo", "adelgazar", "proteina", "deporte", "yoga", "rutina"] },
  // Tecnología va ANTES que educación a propósito: "curso de inteligencia
  // artificial" es un curso, pero el rubro que manda en la estética es la
  // tecnología (el dueño lo dijo el 18-09: la landing del curso de IA "se ve
  // muy femenina"; le correspondía la línea tecnológica, no la de formación).
  { familia: "tecnologia", palabras: ["software", "app", "saas", "plataforma", "automatizacion", "inteligencia artificial", "ia ", " ia", "chatgpt", "claude", "agentes", "bot", "api", "digital tool", "sistema", "programacion", "excel", "power bi", "python", "n8n", "web"] },
  { familia: "educacion", palabras: ["curso", "clase", "taller", "masterclass", "capacitacion", "diplomado", "aprende", "aprender", "ensena", "tutorial", "academia", "leccion", "idioma", "ingles", "piano", "guitarra", "musica"] },
  { familia: "launch", palabras: ["lanzamiento", "launch", "startup", "preventa", "early access", "beta", "waitlist", "lista de espera"] },
  { familia: "familiar", palabras: ["hogar", "cocina", "familia", "bebe", "nino", "mascota", "casa", "limpieza", "organizador"] },
  { familia: "minimal", palabras: ["ropa", "camisa", "vestido", "zapato", "tenis", "moda", "bolso", "chaqueta", "jean"] },
  // Rubros de la taxonomía cerrada de físicos (lib/taxonomia.ts, 20-09-2026).
  { familia: "oscura", palabras: ["herramienta", "automotor", "moto ", "carro", "compresor", "taladro"] },
  { familia: "fitness", palabras: ["camping", "aire libre", "senderismo"] },
  { familia: "familiar", palabras: ["juguete", "entretenimiento", "papeler", "oficina"] },
  { familia: "editorial", palabras: ["libro", "espiritual", "devocional"] },
  { familia: "oscura", palabras: ["premium tech", "audio", "lujo"] },
];

/** Quita acentos y baja a minúsculas, para comparar sin sorpresas. */
function normalizar(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[áàä]/g, "a").replace(/[éèë]/g, "e").replace(/[íìï]/g, "i")
    .replace(/[óòö]/g, "o").replace(/[úùü]/g, "u").replace(/ñ/g, "n");
}

export interface EleccionDeEstilo {
  familia: FamiliaVisual;
  /** Por qué se eligió, en una línea. Se le muestra al admin: elegir sin explicar es una caja negra. */
  porque: string;
}

/**
 * "✨ Sorpréndeme": elegir la dirección visual a partir del producto.
 *
 * No es azar. Se decide en este orden, y el primero que resuelve gana:
 *
 *   1. El rubro, por las palabras del nombre/categoría/descripción.
 *   2. El precio: lo caro pide calma (premium), lo barato pide claridad.
 *   3. El tipo: un digital sin más señales es formación; un físico, ecommerce.
 *
 * Devuelve también el POR QUÉ. Un selector automático que no puede explicar su
 * elección es imposible de corregir cuando se equivoca -- y se va a equivocar.
 */
/**
 * ¿La palabra clave aparece como PALABRA (o prefijo de palabra) en el texto?
 *
 * Medido el 20-09-2026: con `includes` suelto, "te " (té) calzaba en
 * "sopor(te )" y "corrector de postura" salía con familia GOURMET. Ahora la
 * clave tiene que empezar en borde de palabra; y si termina en espacio
 * (clave corta como "te ", "ia "), también tiene que terminar en borde.
 */
function contienePalabra(texto: string, clave: string): boolean {
  const limpia = clave.trim();
  if (!limpia) return false;
  const esc = limpia.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fin = clave.endsWith(" ") || clave.startsWith(" ") ? "(?![a-z0-9])" : "";
  return new RegExp(`(^|[^a-z0-9])${esc}${fin}`).test(texto);
}

export function elegirFamilia(pistas: PistasDelProducto): EleccionDeEstilo {
  // La categoría y el nombre pesan más que la descripción: primero se busca
  // ahí, y solo si nada calza se mira la descripción (que trae de todo).
  const fuerte = normalizar([pistas.categoria, pistas.nombre, pistas.angulo].filter(Boolean).join(" "));
  const texto = normalizar([pistas.categoria, pistas.nombre, pistas.descripcion, pistas.angulo].filter(Boolean).join(" "));

  for (const { familia, palabras } of SENALES) {
    const encontrada = palabras.find((p) => contienePalabra(fuerte, p));
    if (encontrada) {
      return { familia, porque: `El producto habla de "${encontrada.trim()}", así que va con la línea ${TOKENS[familia].nombre.toLowerCase()}.` };
    }
  }
  for (const { familia, palabras } of SENALES) {
    const encontrada = palabras.find((p) => contienePalabra(texto, p));
    if (encontrada) {
      return { familia, porque: `El producto habla de "${encontrada.trim()}", así que va con la línea ${TOKENS[familia].nombre.toLowerCase()}.` };
    }
  }

  const precio = Number(pistas.precio ?? 0);
  if (precio >= 500_000) {
    return { familia: "premium", porque: "Es un producto de precio alto: la composición con aire comunica valor mejor que la urgencia." };
  }

  const tipo = normalizar(pistas.tipo);
  const esDigital = !["physical", "fisico", "dropshipping"].includes(tipo);
  if (esDigital) {
    return { familia: "educacion", porque: "Es un producto digital sin un rubro más específico: la línea de formación prioriza confianza y estructura." };
  }

  return { familia: "dropshipping", porque: "Producto físico con contraentrega: degradados del color del producto, directa y emocional, cierra en el primer scroll." };
}

/**
 * El layout que corresponde a una sección dentro de una familia.
 *
 * `preferido` es el favorito de la familia; `alternativas` son las otras que
 * respetan su identidad. El Design Agent puede variar entre ellas sin que la
 * landing deje de parecer del mismo estudio.
 */
export function layoutDe(familia: FamiliaVisual, seccion: string): { preferido: string; alternativas: string[] } {
  const lista = TOKENS[familia].layoutsPreferidos[seccion];
  if (!lista || lista.length === 0) return { preferido: `${seccion}_default`, alternativas: [] };
  return { preferido: lista[0], alternativas: lista.slice(1) };
}
