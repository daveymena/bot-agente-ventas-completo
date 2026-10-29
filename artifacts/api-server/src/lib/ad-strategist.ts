import { logger } from "./logger";
import { getAppUrl } from "./app-url";
import { destinoWebDelProducto } from "./landing/destino-del-producto";
import { db, products, productCategories, facebookDrafts } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { tenantManager, type TenantContext } from "./tenantManager";
import { resolveInterestIds, usarAdvantagePlus } from "./facebook";
import { generateProductImage } from "./ai-product-image";
import { getOrCreateBudget, getBudgetStatus, canSpendToday } from "./marketing-team/budget-guard";

import { FB_GRAPH_BASE } from "./meta-api-version";
import { modeloDelProducto } from "./modelo-de-negocio";
import { planDeAnuncio, copyDeOtroModelo, destinoDeObjetivo, ajustarCopyAMeta } from "./anuncio-por-modelo";
const FB_GRAPH_URL = FB_GRAPH_BASE;

/**
 * Saca el markdown del texto de un anuncio.
 *
 * Facebook NO interpreta markdown: publica los asteriscos tal cual. Visto en
 * un borrador real (2026-08-14, id 196): el modelo escribió
 * "Con el **PACK EDUCA A TU PERRO**, tendrás acceso **permanente**…" y así
 * se iba a publicar, con los asteriscos a la vista. Se ve amateur en un
 * anuncio pago, y no hay forma de que el modelo se acuerde siempre de no
 * usarlo -- por eso se limpia acá, en el único punto por el que pasa TODO el
 * texto antes de guardarse, en vez de pedírselo por prompt.
 *
 * Solo se saca el marcado de énfasis y los encabezados. Los emojis, los
 * saltos de línea y las viñetas con "✅"/"-" se dejan intactos: eso sí se ve
 * bien en Facebook y es parte del formato que el admin quiere.
 */
function sinMarkdown(texto: string): string {
  if (!texto) return texto;
  return texto
    .replace(/\*\*\*(.+?)\*\*\*/gs, "$1")      // ***negrita cursiva***
    .replace(/\*\*(.+?)\*\*/gs, "$1")           // **negrita**
    .replace(/(^|[\s(])\*(?!\s)(.+?)(?<!\s)\*/gs, "$1$2") // *cursiva*, sin tocar "2 * 3"
    .replace(/__(.+?)__/gs, "$1")               // __negrita__
    .replace(/\[(.+?)\]\((https?:\/\/[^)]+)\)/g, "$1: $2") // [texto](url) -> texto: url
    .replace(/^#{1,6}\s+/gm, "")                // ## encabezados
    .replace(/^\s*>\s?/gm, "");                 // > citas
}

export interface AdStrategy {
  niche: string;
  hook: string;
  angle: string;
  emotionalTrigger: string;
  ctaType: "SHOP_NOW" | "LEARN_MORE" | "SIGN_UP" | "GET_OFFER" | "CONTACT_US";
  imageStyle: string;
  imagePrompt: string;
  ageMin: number;
  ageMax: number;
  interests: string[];
  budget: number;
  /** Fuente/hallazgo real que respalda el hook/ángulo, cuando el agente lo
   * generó a partir de investigación en esta sesión (ver ResearchGroundedCopy).
   * Ausente cuando el copy viene de la plantilla fija por nicho. */
  researchNote?: string;
  /** Qué creativo producir para este modelo (anuncio-por-modelo.ts). */
  creativo?: { formato: string; estructura: string[] };
  objetivoRecomendado?: "mensajes" | "ventas" | "trafico";
  metricaClave?: string;
  modelo?: string;
}

export interface DraftAd {
  /** Id de la fila en facebook_drafts, una vez guardado. */
  id?: number;
  productId: number;
  productName: string;
  strategy: AdStrategy;
  primaryText: string;
  headline: string;
  description: string;
  imageUrl: string;
  /** Todas las imágenes del borrador (incluye imageUrl). 2+ = anuncio carrusel. */
  images?: string[];
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  status: "draft" | "created";
  /** Si se intentó subir a Meta y no se pudo, el motivo REAL (nunca "listo" en falso). */
  errorDeMeta?: string;
}

const WINNING_STRATEGIES_BY_NICHE: Record<string, AdStrategy> = {
  diseno_grafico: {
    niche: "Diseño Gráfico y Photoshop",
    hook: "Pack completo de diseño gráfico: cursos, plantillas, recursos descargables. Todo lo que necesitas para crear diseños profesionales desde tu casa.",
    angle: "Contenido digital descargable: cursos grabados de Photoshop, Illustrator, After Effects, Canva + plantillas editables + portafolio de recursos. Ideal para quien quiere aprender diseño por su cuenta, a su ritmo.",
    emotionalTrigger: "Creatividad sin explotar + ganas de crear cosas profesionales",
    ctaType: "SHOP_NOW",
    imageStyle: "Collage de trabajos de diseño mostrando variedad de estilos",
    imagePrompt: "Colorful collage of graphic design works: logos, social media posts, flyers, branding. Professional portfolio style, vibrant colors, organized layout",
    ageMin: 18,
    ageMax: 40,
    interests: ["Adobe Photoshop", "Diseño gráfico", "Illustrator", "Canva", "Trabajo remoto", "Emprendimiento digital"],
    budget: 15000,
  },
  programacion: {
    niche: "Programación y Desarrollo Web",
    hook: "Aprende programación desde cero con contenido descargable. Cursos, ejercicios y proyectos para que aprendas a tu ritmo, sin horarios ni presiones.",
    angle: "Material digital de programación: cursos grabados de Python, JavaScript, desarrollo web, ciberseguridad, Linux. Descarga y estudia cuando quieras. Sin clases en vivo, sin fechas límite.",
    emotionalTrigger: "Interés por la tecnología + deseo de aprender una habilidad con demanda",
    ctaType: "SHOP_NOW",
    imageStyle: "Código en pantalla con ambiente de estudio relajado",
    imagePrompt: "VS Code editor on laptop with code visible, cozy study desk setup with coffee, books, natural lighting, authentic learning environment",
    ageMin: 17,
    ageMax: 35,
    interests: ["Programación", "Python", "Desarrollo web", "JavaScript", "Tecnología", "Freelancer", "Trabajo remoto"],
    budget: 20000,
  },
  marketing_digital: {
    niche: "Marketing Digital y Meta Ads",
    hook: "Pack de marketing digital descargable: cursos, guías, plantillas y estrategias. Aprende a tu ritmo sin pagar mensualidades ni suscripciones.",
    angle: "Contenido digital de marketing: cursos grabados de Facebook Ads, Google Ads, SEO, ecommerce, copywriting. Descarga directa, acceso permanente. Lo estudias cuando quieras.",
    emotionalTrigger: "Interés por los negocios digitales + ganas de aprender sin ataduras",
    ctaType: "SHOP_NOW",
    imageStyle: "Dashboard de marketing digital en laptop con ambiente de trabajo",
    imagePrompt: "Marketing analytics dashboard on laptop screen, modern desk setup with notebook and pen, plants, natural lighting, professional home office",
    ageMin: 20,
    ageMax: 45,
    interests: ["Marketing digital", "Facebook Ads", "Google Ads", "SEO", "Emprendimiento digital", "Ventas", "Ecommerce"],
    budget: 18000,
  },
  fitness_salud: {
    niche: "Fitness, Salud y Bienestar",
    hook: "Guías de ejercicio, recetas saludables y planes de entrenamiento descargables. Transforma tu cuerpo desde casa, sin mensualidades ni cuotas.",
    angle: "Contenido digital de fitness: rutinas grabadas, guías de nutrición, recetarios, planes de entrenamiento. Descargas todo y lo usas a tu ritmo. Pago único, acceso de por vida.",
    emotionalTrigger: "Deseo de mejorar la salud + frustración con métodos que requieren pago recurrente",
    ctaType: "SHOP_NOW",
    imageStyle: "Persona haciendo ejercicio en casa o cocinando saludable, ambiente colombiano",
    imagePrompt: "Colombian person exercising at home with simple equipment, natural lighting, authentic home environment, lifestyle photography, real and unposed",
    ageMin: 20,
    ageMax: 50,
    interests: ["Ejercicio", "Pérdida de peso", "Nutrición", "Fitness", "Salud y bienestar", "Entrenamiento en casa", "Recetas saludables"],
    budget: 12000,
  },
  idiomas: {
    niche: "Aprendizaje de Idiomas",
    hook: "Pack de idiomas descargable: cursos completos de inglés, francés, portugués y más. Aprende a tu ritmo, sin suscripciones, sin compromisos mensuales.",
    angle: "Material digital de idiomas: cursos grabados con audios, ejercicios, vocabulario. Descarga todo de una vez y estudia cuando quieras. Sin renovaciones, sin pagos mensuales.",
    emotionalTrigger: "Deseo de aprender idiomas + rechazo a suscripciones caras",
    ctaType: "SHOP_NOW",
    imageStyle: "Persona estudiando en casa con materiales digitales, ambiente tranquilo",
    imagePrompt: "Person studying languages at home with laptop and headphones, world map on wall, books and notes on desk, natural daylight, peaceful learning atmosphere",
    ageMin: 16,
    ageMax: 40,
    interests: ["Aprender inglés", "Inglés", "Idiomas", "Viajes", "Intercambio cultural"],
    budget: 15000,
  },
  fotografia_edicion: {
    niche: "Fotografía y Edición de Video",
    hook: "Cursos de fotografía y edición descargables: Lightroom, Photoshop, Premiere. Aprende a editar como profesional sin pagar cursos caros ni suscripciones.",
    angle: "Contenido digital de fotografía: cursos grabados, presets de Lightroom, plantillas de edición. Descargas ilimitadas, acceso permanente. Ideal para aprender a tu ritmo.",
    emotionalTrigger: "Pasión por la fotografía + deseo de mejorar sin gastar en cursos mensuales",
    ctaType: "SHOP_NOW",
    imageStyle: "Comparación de foto antes/después mostrando resultados de edición",
    imagePrompt: "Split screen comparison of raw vs edited photo, Lightroom interface visible, dramatic improvement, creative workspace with camera gear",
    ageMin: 15,
    ageMax: 35,
    interests: ["Fotografía", "Lightroom", "Photoshop", "Edición de video", "Instagram", "Content creator", "TikTok"],
    budget: 12000,
  },
  musica_audio: {
    niche: "Música y Producción de Audio",
    hook: "Pack de producción musical descargable: cursos, beats, samples y recursos. Crea tu propia música desde tu PC, sin pagar mensualidades.",
    angle: "Material digital de música: cursos grabados de FL Studio, Ableton, mezcla y masterización. Samples, presets y proyectos incluidos. Descarga y produce a tu ritmo.",
    emotionalTrigger: "Pasión musical + deseo de producir sin riesgos ni suscripciones",
    ctaType: "SHOP_NOW",
    imageStyle: "Setup de producción musical casero, ambiente real y auténtico",
    imagePrompt: "Home music production setup with laptop showing FL Studio, budget studio monitors, cozy bedroom vibe, urban decoration, authentic amateur studio",
    ageMin: 15,
    ageMax: 35,
    interests: ["Música", "Producción musical", "FL Studio", "Ableton", "Composición", "Beat making"],
    budget: 10000,
  },
  // Aprender a TOCAR un instrumento no es lo mismo que producir audio: el
  // bucket musica_audio vendía FL Studio y masterización para un curso de
  // piano, prometiendo algo que el producto no entrega.
  instrumentos_musicales: {
    niche: "Instrumentos Musicales y Canto",
    hook: "Aprende a tocar desde cero, a tu ritmo y desde casa. Clases en video paso a paso, sin profesor ni horarios.",
    angle: "Curso grabado de música: lecciones progresivas de cero a avanzado, partituras y ejercicios incluidos. Practica cuando quieras, repite la lección las veces que necesites.",
    emotionalTrigger: "El sueño pendiente de tocar un instrumento + libertad de aprender sin horarios",
    ctaType: "SHOP_NOW",
    imageStyle: "Persona real tocando en casa, luz cálida, ambiente cercano y alcanzable",
    imagePrompt: "Person playing piano at home in warm natural light, sheet music on stand, cozy living room, authentic candid moment, learning at own pace",
    ageMin: 18,
    ageMax: 60,
    interests: ["Música", "Piano", "Guitarra", "Canto", "Instrumentos musicales", "Aprender música"],
    budget: 10000,
  },
  tecnologia_it: {
    niche: "Tecnología y Reparación",
    hook: "Cursos de reparación y tecnología descargables. Aprende a reparar celulares, computadoras y consolas desde cero. Material práctico, sin teoría aburrida.",
    angle: "Contenido digital técnico: guías paso a paso, diagramas, videos tutoriales de reparación. Descarga todo y consulta cuando necesites. Ideal para técnicos y principiantes.",
    emotionalTrigger: "Interés por la tecnología práctica + ganas de aprender un oficio rentable",
    ctaType: "SHOP_NOW",
    imageStyle: "Persona reparando un dispositivo en su banco de trabajo, manos enfocadas",
    imagePrompt: "Hands repairing a smartphone on a home workbench, tools organized, focused work, natural lighting, authentic technician workspace",
    ageMin: 16,
    ageMax: 50,
    interests: ["Tecnología", "Reparación de celulares", "Electrónica", "Informática"],
    budget: 10000,
  },
  construccion_arquitectura: {
    niche: "Construcción y Arquitectura",
    hook: "Planos, expedientes técnicos, presupuestos de obra y cursos de construcción descargables. Material real usado por profesionales del sector.",
    angle: "Biblioteca digital de construcción: planos, expedientes, metrados, cursos de Revit, AutoCAD, Drywall. Descarga directa, úsalo en tus proyectos. Ideal para ingenieros y arquitectos.",
    emotionalTrigger: "Eficiencia profesional + acceso a material de calidad sin pagar cursos caros",
    ctaType: "SHOP_NOW",
    imageStyle: "Planos y herramientas de construcción sobre mesa, ambiente profesional",
    imagePrompt: "Architectural blueprints on drafting table, Revit software on laptop, professional workspace with tools and documents, natural lighting",
    ageMin: 20,
    ageMax: 60,
    interests: ["Arquitectura", "Ingeniería civil", "Construcción", "Revit", "AutoCAD", "Planos"],
    budget: 15000,
  },
  educacion_general: {
    niche: "Cursos y Educación General",
    hook: "¿Quieres aprender algo nuevo pero los cursos online son caros? MegaPack con 81 cursos digitales descargables por menos de $3 USD cada uno.",
    angle: "La biblioteca digital más completa: diseño, programación, marketing, idiomas, música, fitness, tecnología, construcción y más. Contenido descargable, acceso permanente, sin suscripciones.",
    emotionalTrigger: "Deseo de aprendizaje + hartazgo de pagar suscripciones mensuales",
    ctaType: "SHOP_NOW",
    imageStyle: "Collage de categorías de cursos disponibles, estilo marketplace",
    imagePrompt: "Colorful grid of course thumbnails showing different categories: design, tech, music, fitness, languages, photography. Organized collage, vibrant colors",
    ageMin: 16,
    ageMax: 55,
    interests: ["Educación", "Cursos online", "Aprendizaje", "Desarrollo personal", "Emprendimiento"],
    budget: 20000,
  },
  libros_recursos: {
    niche: "Libros y Recursos Digitales",
    hook: "Biblioteca digital descargable: libros, plantillas, presets, infografías y recursos. Todo por menos de lo que cuesta un solo libro físico en librería.",
    angle: "Pack de recursos digitales: libros de negocio y desarrollo personal, plantillas editables, presets de Lightroom, infografías, formatos. Descarga directa, úsalo hoy.",
    emotionalTrigger: "Hambre de conocimiento + deseo de acceder a recursos sin pagar suscripciones",
    ctaType: "SHOP_NOW",
    imageStyle: "Estantería digital mostrando variedad de recursos y portadas de libros",
    imagePrompt: "Digital library display showing book covers and resource thumbnails, organized categories, professional design, warm lighting",
    ageMin: 18,
    ageMax: 55,
    interests: ["Libros", "Lectura", "Desarrollo personal", "Conocimiento", "Educación"],
    budget: 10000,
  },
  // ── Producto FÍSICO (dropshipping/contraentrega) ─────────────────────────
  // Todos los nichos de arriba son cursos digitales. Un producto físico
  // (corrector de postura, licuadora, faja...) caía en "Cursos y Educación
  // General" con un collage de miniaturas de cursos como imagen. Acá tiene su
  // propia estrategia; el hook/angle se rellenan con la descripción real del
  // producto en generateAdCopy.
  producto_fisico: {
    niche: "Producto físico",
    hook: "",
    angle: "",
    emotionalTrigger: "Resolver un problema concreto del día a día",
    ctaType: "SHOP_NOW",
    imageStyle: "Foto real del producto sobre fondo limpio, estilo e-commerce",
    imagePrompt: "Clean ecommerce product photo on neutral background, natural lighting, high quality, professional",
    ageMin: 18,
    ageMax: 55,
    interests: ["Compras online", "Mercado Libre", "Ofertas", "Bienestar", "Hogar"],
    budget: 20000,
  },
  // ── Servicio (asesoría, reparación, cita) ────────────────────────────────
  // Se vende por confianza: resultado + método + conversación. Hook/angle
  // salen del producto real en generateAdCopy (anuncio-por-modelo.ts).
  servicio: {
    niche: "Servicio",
    hook: "",
    angle: "",
    emotionalTrigger: "Confianza: alguien que ya sabe resolverlo",
    ctaType: "CONTACT_US",
    imageStyle: "Persona real prestando el servicio o trabajo terminado, sin montaje",
    imagePrompt: "Real professional providing the service, authentic workplace, natural lighting, trustworthy and approachable",
    ageMin: 22,
    ageMax: 60,
    interests: ["Pequeñas empresas", "Emprendimiento", "Servicios profesionales"],
    budget: 15000,
  },
};

/** Lo que el agente conversacional puede aportar cuando genera un borrador
 * DESPUÉS de investigar (web_search/web_fetch reales en la misma sesión --
 * ver hasRecentResearch en app-operator.ts). Sin esto, el copy sale siempre
 * de la plantilla fija por nicho sin importar qué se investigó; con esto,
 * el hook/ángulo/texto puede reflejar lo que realmente funciona hoy en el
 * nicho, en vez de un texto genérico repetido para todos los productos de
 * esa categoría. Todos los campos son opcionales -- lo que no se pase cae
 * al valor de la plantilla fija (necesaria para createDraftsForAllProducts,
 * que corre sin contexto de chat/investigación).
 */
export interface ResearchGroundedCopy {
  hook?: string;
  angle?: string;
  primaryText?: string;
  headline?: string;
  description?: string;
  /** Breve nota de qué fuente/hallazgo respalda este copy, para trazabilidad. */
  researchNote?: string;
}

/**
 * ¿Este texto salió de la plantilla única de antes del 23-09-2026? Esas frases
 * las escribía SOLO esa plantilla (nunca el dueño ni Atlas), así que sirven
 * para reconocer borradores viejos sin adivinar.
 */
export function esCopyDeLaPlantillaVieja(texto: string): boolean {
  return /Haz clic abajo para descargar todo el contenido ahora|Este contenido digital es tu atajo directo|Si no tomas acción hoy, seguirás perdiendo tiempo y dinero/i.test(String(texto || ""));
}

export class AdStrategist {
  private tenant: TenantContext;

  constructor(tenant?: TenantContext) {
    this.tenant = tenant || tenantManager.getDefaultTenant();
  }

  /**
   * Credenciales de Facebook DE ESTE NEGOCIO, sin heredar las del dueño de la
   * plataforma.
   *
   * Este módulo CREA ANUNCIOS QUE GASTAN DINERO REAL. Antes cada lectura caía
   * directo a `process.env.FB_*` cuando el negocio no tenía Facebook
   * conectado: un cliente nuevo que le pidiera a Atlas crear un anuncio lo
   * habría creado en la CUENTA PUBLICITARIA DEL DUEÑO DE LA PLATAFORMA,
   * gastando SU dinero y publicando en SU página. Con un solo negocio no se
   * nota (esa cuenta ES la correcta); con dos es un desastre.
   *
   * Es la misma protección que ya tenía `facebook.ts` (ver
   * `esDuenoDelServidor` en su constructor) y que se aplicó a los cobros
   * (`tenant-payment-credentials.ts`) -- este módulo se había quedado afuera.
   *
   * Para cualquier negocio que no sea el dueño del servidor, vacío es vacío:
   * la operación falla con un mensaje claro pidiendo conectar Facebook, que
   * es infinitamente mejor que operar sobre la cuenta equivocada.
   */
  private credencialesFb(): { accessToken: string; adAccountId: string; pageId: string; pixelId: string } {
    const fb = this.tenant.facebook || {};
    const esDuenoDelServidor = this.tenant.id === tenantManager.getDefaultTenant().id;
    const env = (valor: string | undefined) => (esDuenoDelServidor ? valor || "" : "");
    return {
      // Token de USUARIO primero: crear/publicar campañas es Marketing API y
      // exige ads_management -- un token de página falla con el error #17.
      accessToken:
        fb.userAccessToken || fb.accessToken || env(process.env.FB_ACCESS_TOKEN || process.env.FB_MESSENGER_PAGE_TOKEN),
      adAccountId: fb.adAccountId || env(process.env.FB_AD_ACCOUNT_ID),
      pageId: fb.pageId || env(process.env.FB_PAGE_ID),
      pixelId: fb.pixelId || env(process.env.FB_PIXEL_ID),
    };
  }

  /**
   * Guardrail de presupuesto antes de crear/activar gasto. Antes publish/upload
   * no consultaban los guardrails del negocio (maxDailySpend), así que el tope
   * diario configurado nunca se aplicaba en estos caminos.
   *
   * ⚠️ Falla CERRADO desde el 2026-10-14. Antes, cualquier error al leer el
   * presupuesto devolvía `allowed: true` con la nota "no se bloquea": un fallo
   * de base de datos se convertía en permiso para gastar, que es exactamente lo
   * contrario de lo que un guardián de gasto debe hacer. Si no se puede
   * comprobar el tope, no se gasta: el dueño puede reintentar, pero una factura
   * sorpresa no se deshace.
   */
  private async guardPresupuesto(monto: number): Promise<{ allowed: boolean; reason: string }> {
    try {
      const guardrails = await getOrCreateBudget(this.tenant.id);
      const estado = await getBudgetStatus(this.tenant.id);
      return canSpendToday(guardrails, estado.todaySpend, Number(monto) || 0);
    } catch (err: any) {
      logger.error(
        { err: err?.message, tenantId: this.tenant.id, monto },
        "[AdStrategist] No se pudo verificar el presupuesto: se BLOQUEA el gasto (fail-closed)",
      );
      return {
        allowed: false,
        reason:
          "No se pudo verificar el tope de gasto del negocio, así que no se activa nada. " +
          "Reintentá en un momento; si sigue fallando, revisá la base de datos.",
      };
    }
  }

  getStrategyForProduct(product: any): AdStrategy {
    const name = (product.name || "").toLowerCase();
    const category = (product.category || "").toLowerCase();

    // Producto físico (dropshipping/contraentrega): NO es un curso. Los nichos
    // de abajo son todos digitales; un corrector de postura o una licuadora
    // caían en "Cursos y Educación" con collage de cursos. Va primero.
    if (product.kind === "physical") {
      return { ...WINNING_STRATEGIES_BY_NICHE.producto_fisico };
    }
    // Servicio / cotización: tampoco es un curso. Sin esto una asesoría o una
    // reparación a domicilio caía en "Cursos y Educación" con collage de cursos.
    const modelo = modeloDelProducto(product);
    if (modelo === "servicio" || modelo === "cotizacion") {
      return { ...WINNING_STRATEGIES_BY_NICHE.servicio };
    }

    if (category.includes("diseño") || category.includes("diseño gráfico") || name.includes("photoshop") || name.includes("ilustrator") || name.includes("indesign") || name.includes("lettering") || name.includes("logotipo") || name.includes("canva") || name.includes("after effects") || name.includes("premiere") || name.includes("animación") || name.includes("filmora") || name.includes("portadas") || name.includes("cuadros") || name.includes("sublimados") || name.includes("infografías") || name.includes("dibujo") || name.includes("ilustración") || name.includes("premiere")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.diseno_grafico };
    }

    if (category.includes("programación") || category.includes("programacion") || name.includes("programación") || name.includes("programacion") || name.includes("desarrollo web") || name.includes("ciberseguridad") || name.includes("hacking") || name.includes("wordpress") || name.includes("linux") || name.includes("excel") || name.includes("videojuego") || name.includes("unity") || name.includes("python") || name.includes("javascript")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.programacion };
    }

    if (category.includes("marketing") || name.includes("marketing") || name.includes("seo") || name.includes("ecommerce") || name.includes("ventas") || name.includes("negocio") || name.includes("publicidad") || name.includes("facebook ads") || name.includes("google ads")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.marketing_digital };
    }

    // Acá decía `salud_deporte`, una clave que NO existe en la tabla: el spread
    // de `undefined` devolvía una estrategia VACÍA (sin presupuesto, sin
    // intereses, sin nicho) para todo lo de fitness, cocina, gastronomía y
    // perros. La clave real es `fitness_salud`.
    if (category.includes("salud") || category.includes("deporte") || name.includes("fitness") || name.includes("pilates") || name.includes("fuerza") || name.includes("guerrero") || name.includes("perro") || name.includes("gastronomía") || name.includes("gastronomia") || name.includes("cocina") || name.includes("receta") || name.includes("perro")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.fitness_salud };
    }

    if (category.includes("idiomas") || name.includes("idiomas") || name.includes("inglés") || name.includes("ingles") || name.includes("oxford") || name.includes("idioma") || name.includes("frances") || name.includes("aleman") || name.includes("portugues") || name.includes("japones")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.idiomas };
    }

    if (name.includes("foto") || name.includes("fotografía") || name.includes("fotografia") || name.includes("lightroom") || name.includes("camara") || name.includes("presets")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.fotografia_edicion };
    }

    // Instrumentos ANTES que producción: si no, "CURSO DE PIANO" caía en el
    // bucket de productores y el anuncio ofrecía FL Studio y masterización.
    if (name.includes("piano") || name.includes("guitarra") || name.includes("canto") || name.includes("violín") || name.includes("violin") || name.includes("bateria") || name.includes("batería") || name.includes("ukulele") || name.includes("saxofon") || name.includes("saxofón") || name.includes("teclado") || name.includes("cantar")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.instrumentos_musicales };
    }

    if (category.includes("música") || category.includes("musica") || name.includes("dj") || name.includes("producción musical") || name.includes("produccion musical") || name.includes("música") || name.includes("musica") || name.includes("audio")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.musica_audio };
    }

    if (category.includes("tecnología") || category.includes("tecnologia") || name.includes("reparación") || name.includes("reparacion") || name.includes("celular") || name.includes("play station") || name.includes("consola") || name.includes("armado") || name.includes("ensamblaje") || name.includes("computador") || name.includes("instaladores")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.tecnologia_it };
    }

    if (category.includes("construcción") || category.includes("construccion") || name.includes("drywall") || name.includes("plano") || name.includes("revit") || name.includes("arquitectura") || name.includes("obra") || name.includes("construcción") || name.includes("construccion") || name.includes("carpintería") || name.includes("carpinteria") || name.includes("metrados") || name.includes("expediente") || name.includes("vivienda")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.construccion_arquitectura };
    }

    if (category.includes("libros") || category.includes("educación") || name.includes("libros") || name.includes("memoria") || name.includes("psicología") || name.includes("psicologia") || name.includes("contabilidad") || name.includes("autismo") || name.includes("lenguaje") || name.includes("preuniversitario") || name.includes("ingeniería") || name.includes("ingenieria") || name.includes("aula virtual")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.libros_recursos };
    }

    return { ...WINNING_STRATEGIES_BY_NICHE.educacion_general };
  }

  // Devuelve TAMBIÉN la estrategia, porque acá adentro se corrige el gancho y
  // esa corrección se perdía: el llamador guardaba en el borrador la
  // estrategia ORIGINAL, con el hook de la plantilla del nicho.
  //
  // Visto en el borrador recién generado del curso de IA (2026-08-29): el copy
  // salía bien ("3 cursos de IA en uno: domina Claude...") y la estrategia
  // guardada al lado decía "MegaPack con 81 cursos digitales por menos de $3
  // USD". Nadie publica ese texto, pero el admin lo ve en el panel y no tiene
  // forma de saber cuál de los dos sale. Lo que se guarda tiene que ser lo que
  // se usa.
  async generateAdCopy(
    strategy: AdStrategy,
    product: any,
    grounded?: ResearchGroundedCopy,
    /** `objetivo`: el que pidió el admin/Atlas. Sin él, la regla de destinoPorDefecto. */
    opts: { objetivo?: string | null } = {},
  ): Promise<{ primaryText: string; headline: string; description: string; strategy: AdStrategy }> {
    // Si el agente investigó y aportó su propio hook/ángulo, se usa ESE en
    // vez del texto fijo del nicho -- el hook es literalmente lo que separa
    // un anuncio "genérico por categoría" de uno anclado en lo que se
    // encontró que funciona hoy para este producto puntual.
    if (grounded?.hook) strategy = { ...strategy, hook: grounded.hook };
    if (grounded?.angle) strategy = { ...strategy, angle: grounded.angle };

    // Sin hook propio, NO se usa el de la plantilla del nicho.
    //
    // El hook es la primera línea del anuncio, y el de la plantilla se
    // escribió para un producto concreto. Auditados los borradores reales
    // (16-08-2026): los 29 del nicho "Cursos y Educación General" comparten
    // el mismo gancho, el del MEGAPACK -- "81 cursos digitales descargables
    // por menos de $3 USD cada uno". O sea que el anuncio del curso de IA de
    // $60.000 abría prometiendo 81 cursos a 3 dólares. Eso es publicidad
    // engañosa pagada: Meta puede rechazarlo y el cliente reclama con razón.
    //
    // El reemplazo sale del producto REAL: su primera línea de descripción,
    // que es lo que el admin escribió sobre él.
    if (!grounded?.hook) {
      const primeraLinea = String(product.description || "")
        .split(/\r?\n/)[0]!
        .replace(/^[^\p{L}\p{N}]+/u, "")
        .trim();
      const propio = primeraLinea.length >= 25
        ? (primeraLinea.length > 120 ? `${primeraLinea.slice(0, 117).trimEnd()}...` : primeraLinea)
        : String(product.name || "").trim();
      if (propio) strategy = { ...strategy, hook: propio };
    }

    const name = product.name || "";

    // ── El texto según QUÉ se vende (anuncio-por-modelo.ts) ─────────────────
    //
    // Acá había UN texto para todo: "Este contenido digital es tu atajo…",
    // "Haz clic para DESCARGAR", "Acceso inmediato y PERMANENTE" y una
    // urgencia fabricada ("Si no tomas acción hoy, seguirás perdiendo…"). El
    // anuncio del corrector de postura le prometía una descarga a quien iba a
    // recibir un paquete. Ahora físico, digital y servicio tienen su propia
    // estructura (AIDA) armada SOLO con datos del producto y del negocio.
    let condiciones: import("./modelo-de-negocio").CondicionesDelNegocio | null = null;
    try {
      const { getBusinessContext } = await import("./business-context");
      condiciones = (await getBusinessContext(this.tenant.id))?.condiciones ?? null;
    } catch { condiciones = null; }

    // ── A DÓNDE va el anuncio, ANTES de escribir la acción ─────────────────
    // Bug (07-10-2026): el texto decía siempre "Escríbenos por WhatsApp" y la
    // subida mandaba a la landing publicada (destinoPorDefecto). Se decide
    // acá con la MISMA regla, y el objetivo queda en la estrategia: la subida
    // lo honra (routes/facebook.ts lee strategy.objetivo), así el texto y el
    // botón no se separan. Quien pide un objetivo explícito, manda.
    let objetivo: string = String(opts.objetivo || "") || "mensajes";
    if (!opts.objetivo) {
      try {
        const { destinoPorDefecto } = await import("./landing/destino-del-producto");
        objetivo = (await destinoPorDefecto(this.tenant.id, Number(product.id), "mensajes")).objetivo;
      } catch { objetivo = "mensajes"; }
    }
    const destino = destinoDeObjetivo(objetivo);

    // El gancho: el que trajo la investigación de Atlas; si no hubo, el plan
    // toma la mejor FRASE real del producto (o el beneficio de la ficha curada).
    const plan = planDeAnuncio(product, condiciones, { gancho: grounded?.hook, destino });
    strategy = {
      ...strategy,
      ctaType: plan.ctaType,
      creativo: plan.creativo,
      objetivoRecomendado: objetivo === "ventas" ? "ventas" : objetivo === "mensajes" ? "mensajes" : "trafico",
      metricaClave: plan.metricaClave,
      modelo: plan.modelo,
    };
    (strategy as any).objetivo = objetivo;
    const primaryText = plan.primaryText;

    // El titular sale del plan: el nombre legible en ≤40 (o la oferta, si el
    // anuncio tuvo que abrir con el nombre). Acá antes se le pegaba un emoji
    // "de categoría" adivinado por palabras del nombre: la cámara de
    // seguridad salía con 📸 (de "fotografía") y "Cámara Seguridad
    // Videollamada…" cortado con puntos suspensivos.
    const headline = plan.headline;
    // La descripción ya no afirma "Acceso permanente" para todo (lo decía
    // también de un corrector de postura): sale del plan del modelo.
    const description = plan.description;
    void name;

    // Override final: si el agente investigó y redactó su propio texto
    // completo (no solo hook/ángulo), se respeta tal cual -- el precio y los
    // datos reales del producto ya quedaron incorporados en su versión
    // porque el agente los ve en el mismo turno via list_products.
    // ...salvo que ese texto le prometa al cliente algo que este producto no
    // entrega (curso "descargable" para un corrector, o "pagás al recibir"
    // para un curso). Ahí manda el plan del modelo: es el caso del 24-09-2026.
    const ajeno = [grounded?.primaryText, grounded?.headline, grounded?.description].filter(Boolean).join(" ");
    const motivoAjeno = ajeno ? copyDeOtroModelo(ajeno, plan.modelo) : null;
    if (motivoAjeno) {
      logger.warn({ productId: product?.id, motivo: motivoAjeno }, "[AdStrategist] El texto recibido no corresponde al tipo de producto: se usa el del plan");
      grounded = { ...grounded, primaryText: undefined, headline: undefined, description: undefined } as any;
    }
    // ── Lo que se GUARDA es lo que se publica ─────────────────────────────
    // El tuteo y los límites de Meta se aplicaban recién al SUBIR
    // (facebook.ts → pulirCopyDeAnuncio): el borrador que el dueño revisaba
    // en el panel decía "Llevá", "Escribinos" y tenía descripciones de 50
    // letras que Meta corta en 30. Se pule acá, una sola vez, para todos los
    // caminos (plan, Atlas, lanzamiento).
    const pulido = ajustarCopyAMeta(
      {
        primaryText: sinMarkdown(grounded?.primaryText || primaryText),
        headline: sinMarkdown(grounded?.headline || headline),
        description: sinMarkdown(grounded?.description || description),
      },
      { esFisico: plan.modelo === "fisico", pais: String((this.tenant as any)?.country || condiciones?.pais || "CO"), respaldo: plan },
    );
    return {
      ...pulido,
      // La estrategia con el gancho YA corregido. Sin esto, el llamador
      // guardaba la original y el borrador quedaba con dos verdades.
      strategy,
    };
  }

  async saveDraftToDb(draft: DraftAd): Promise<any> {
    try {
      // No guardar el MISMO borrador dos veces.
      //
      // Se acumularon 200 borradores con duplicados masivos: el mismo producto
      // con el mismo copy repetido 3 y 5 veces, creados con minutos de
      // diferencia (efecto de los reintentos cuando el turno se corta y de
      // "crear borradores para TODOS los productos"). Eso ensucia la pantalla
      // y hace imposible encontrar el borrador bueno.
      //
      // Solo se considera duplicado si coincide producto Y texto: si el copy
      // es distinto, es una variante legítima y se guarda.
      if (draft.status !== "created") {
        const previos = await db
          .select()
          .from(facebookDrafts)
          .where(and(
            eq(facebookDrafts.tenantId, this.tenant.id),
            eq(facebookDrafts.productId, draft.productId),
          ));
        const igual = previos.find((p: any) =>
          String(p.primaryText || "").trim() === String(draft.primaryText || "").trim() &&
          String(p.headline || "").trim() === String(draft.headline || "").trim());
        if (igual) {
          logger.info({ draftId: igual.id, productId: draft.productId }, "[AdStrategist] Ya existía un borrador idéntico -- se reutiliza en vez de duplicar");
          return igual;
        }
      }

      const [saved] = await db.insert(facebookDrafts).values({
        tenantId: this.tenant.id,
        productId: draft.productId,
        productName: draft.productName,
        campaignId: draft.campaignId,
        adSetId: draft.adSetId,
        adId: draft.adId,
        status: draft.status,
        strategy: draft.strategy as any,
        primaryText: draft.primaryText,
        headline: draft.headline,
        description: draft.description,
        imageUrl: draft.imageUrl,
        images: draft.images && draft.images.length > 0 ? draft.images : (draft.imageUrl ? [draft.imageUrl] : []),
        niche: draft.strategy.niche,
        budget: draft.strategy.budget,
        fbStatus: draft.status === "created" ? "PAUSED" : "draft",
      }).returning();
      return saved;
    } catch (err: any) {
      logger.error({ err }, "[AdStrategist] Error saving draft to DB");
      return null;
    }
  }

  async getDrafts(tenantId?: number): Promise<any[]> {
    try {
      const tid = tenantId || this.tenant.id;
      return await db.select()
        .from(facebookDrafts)
        .where(eq(facebookDrafts.tenantId, tid))
        .orderBy(desc(facebookDrafts.createdAt));
    } catch (err: any) {
      logger.error({ err }, "[AdStrategist] Error fetching drafts");
      return [];
    }
  }

  async deleteDraft(draftId: number): Promise<boolean> {
    try {
      await db.delete(facebookDrafts).where(eq(facebookDrafts.id, draftId));
      return true;
    } catch (err: any) {
      logger.error({ err, draftId }, "[AdStrategist] Error deleting draft");
      return false;
    }
  }

  /**
   * LIMPIAR DUPLICADOS: borra los borradores repetidos de un producto y deja
   * el más reciente (el último que el admin editó). Es el arregla-listas
   * para el flood de "Megapacks": en un clic la lista volvió a ser la de
   * verdad.
   */
  async limpiarBorradoresDuplicados(tenantId: number): Promise<{ borrados: number; conservados: number }> {
    const filas = await db
      .select({ id: facebookDrafts.id, productId: facebookDrafts.productId, campaignId: facebookDrafts.campaignId })
      .from(facebookDrafts)
      .where(eq(facebookDrafts.tenantId, tenantId))
      .orderBy(desc(facebookDrafts.createdAt));
    const conservado = new Set<number>();
    let borrados = 0;
    for (const f of filas) {
      if (!f.productId) continue; // sin producto no se deduplica
      if (!conservado.has(Number(f.productId))) {
        conservado.add(Number(f.productId)); // el MÁS NUEVO queda
        continue;
      }
      try {
        await this.deleteDraftWithMeta(f.id, tenantId);
      } catch {
        await this.deleteDraft(f.id);
      }
      borrados++;
    }
    return { borrados, conservados: conservado.size };
  }

  /** Borra el borrador scoped por tenant y su campaña en Meta (si existe).
   *  Antes deleteDraft borraba sin tenant y dejaba la campaña huérfana ACTIVE. */
  async deleteDraftWithMeta(draftId: number, tenantId: number): Promise<{ ok: boolean; meta?: string }> {
    try {
      const [draft] = await db.select().from(facebookDrafts).where(and(eq(facebookDrafts.id, draftId), eq(facebookDrafts.tenantId, tenantId))).limit(1);
      if (!draft) return { ok: false, meta: "Borrador no encontrado" };
      if ((draft as any).campaignId) {
        try {
          const { accessToken } = this.credencialesFb();
          if (accessToken) {
            await fetch(`${FB_GRAPH_URL}/${(draft as any).campaignId}`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ access_token: accessToken }),
            }).catch(() => null);
          }
        } catch { /* mejor borrar local aunque Meta falle */ }
      }
      await db.delete(facebookDrafts).where(and(eq(facebookDrafts.id, draftId), eq(facebookDrafts.tenantId, tenantId)));
      return { ok: true, meta: (draft as any).campaignId ? "Campaña eliminada en Meta y borrador local" : "Borrador local eliminado" };
    } catch (err: any) {
      logger.error({ err, draftId }, "[AdStrategist] Error deleting draft with Meta");
      return { ok: false, meta: err?.message };
    }
  }

  /** Precio real del producto, o null si no se puede leer. Solo para el
   * candado de publishDraft -- no se usa para armar copy. */
  private async precioDelProducto(productId: number | null): Promise<number | null> {
    if (!productId) return null;
    try {
      const [p] = await db.select({ price: products.price }).from(products).where(eq(products.id, productId)).limit(1);
      const n = Number(p?.price);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch { return null; }
  }

  /** Por qué falló el último publishDraft, para mostrárselo al admin en vez de "Error al publicar". */
  ultimoMotivo: string | null = null;

  async publishDraft(draftId: number): Promise<boolean> {
    this.ultimoMotivo = null;
    const falla = (motivo: string) => { this.ultimoMotivo = motivo; return false; };
    try {
      const [draft] = await db.select().from(facebookDrafts).where(eq(facebookDrafts.id, draftId)).limit(1);
      if (!draft) return falla("No encontré ese borrador.");

      // ── Candado de precio ────────────────────────────────────────────
      // Auditando los borradores reales del admin (2026-08-14): 84 de 195
      // traían el precio disparatado, del tipo "Solo $82.000.000 COP
      // (≈ $20000.00 USD)" -- un generador viejo tomaba los 20.000 PESOS
      // como si fueran 20.000 DÓLARES y los convertía. Ese generador ya no
      // está en el código, pero los 84 borradores siguen guardados y basta
      // un clic en "publicar" para sacar un anuncio pago con un precio de
      // 82 millones. Se corta acá, que es por donde pasan todos los caminos
      // de publicación, en vez de confiar en que nadie le dé al botón.
      const precioReal = await this.precioDelProducto(draft.productId);
      if (precioReal) {
        const textos = [draft.primaryText, draft.headline, draft.description].filter(Boolean).join(" ");
        // Cualquier cifra del texto que supere 10x el precio real del
        // producto es un error de conversión, no una decisión comercial.
        for (const bruto of textos.match(/\$\s?[\d][\d.,]{2,}/g) || []) {
          const n = Number(bruto.replace(/[^\d]/g, ""));
          if (!Number.isFinite(n) || n <= precioReal * 10) continue;
          logger.error(
            { draftId, precioReal, precioEnElTexto: n },
            "[AdStrategist] Publicación BLOQUEADA: el borrador tiene un precio que no es el del producto",
          );
          return falla(`El texto del anuncio dice ${bruto}, más de 10 veces el precio real del producto (${precioReal}). Corregí el texto antes de publicar.`);
        }
      }

      if (draft.campaignId && draft.adId) {
        // Guardrail de presupuesto del negocio: activar es empezar a gastar.
        const guard = await this.guardPresupuesto(Number(draft.budget) || 0);
        if (!guard.allowed) return falla(`Bloqueado por el tope de gasto: ${guard.reason}`);
        // Token de USUARIO primero (ver TenantContext.facebook.userAccessToken)
        // -- crear/activar campañas es una operación de Marketing API, exige
        // permisos de usuario (ads_management). Un token de página (lo que
        // había acá antes) falla con el error #17 de Meta.
        const { accessToken, adAccountId } = this.credencialesFb();
        if (!accessToken || !adAccountId) return falla("Facebook no está conectado: falta el token o la cuenta publicitaria.");

        // ── Candado de cuenta autorizada (P0 §3.2) ───────────────────────
        // Activar es empezar a gastar: la cuenta tiene que ser la COP
        // autorizada del negocio y estar activa en Meta. Un borrador viejo
        // no se puede activar contra cualquier cuenta que haya configurada.
        {
          const { validarCuentaPublicitaria } = await import("./meta-cuenta-autorizada");
          const vc = await validarCuentaPublicitaria({
            tenantId: Number((this.tenant as any)?.id) || 0,
            adAccountId,
            token: accessToken,
            origen: "publishDraft",
          });
          if (!vc.ok) {
            logger.warn({ draftId, motivo: vc.motivo }, "[AdStrategist] Activación bloqueada por cuenta no autorizada");
            return falla(`Publicación bloqueada: ${vc.motivo}`);
          }
        }

        // El anuncio (con su creativo real) ya se creó en createDraftAd,
        // PAUSED -- acá solo hay que activarlo con un POST directo a su
        // propio nodo (Graph API: POST /{ad-id} {status}). Antes esto
        // intentaba crear un anuncio NUEVO pasando el id del anuncio
        // existente como si fuera un creative_id (objeto equivocado: un "ad"
        // no es un "adcreative"), así que Meta lo rechazaba siempre.
        const activateRes = await fetch(`${FB_GRAPH_URL}/${draft.adId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ACTIVE", access_token: accessToken }),
        });
        const activateData: any = await activateRes.json();
        if (activateData.error) {
          logger.error({ err: activateData.error, draftId }, "[AdStrategist] Meta rechazó activar el anuncio");
          const e = activateData.error;
          return falla(
            `Meta rechazó activar el anuncio: ${e.error_user_msg || e.message || "sin detalle"}` +
              (e.error_subcode ? ` (código ${e.code}/${e.error_subcode})` : ""),
          );
        }

        // Activar también la campaña y ad set (estaban pausados)
        const { FacebookService } = await import("./facebook");
        try {
          await FacebookService.resumeCampaign(draft.campaignId);
        } catch (e) {
          logger.warn({ err: e, campaignId: draft.campaignId }, "[AdStrategist] Aviso: no se pudo activar campaña");
        }

        await db.update(facebookDrafts)
          .set({ status: "published", fbStatus: "ACTIVE" })
          .where(eq(facebookDrafts.id, draftId));
        return true;
      }
      return falla("Ese borrador todavía no está en Meta: primero hay que subirlo (queda en pausa) y después activarlo.");
    } catch (err: any) {
      logger.error({ err, draftId }, "[AdStrategist] Error publishing draft");
      return falla(err?.message || "Error publicando el borrador");
    }
  }

  /**
   * Sube un borrador LOCAL a Meta, en PAUSA, con su propio copy.
   *
   * Este paso no existía y era un callejón sin salida: los borradores que crea
   * Atlas quedan solo en la base (sin campaignId), y publishDraft solo sabe
   * ACTIVAR un anuncio que ya exista en Meta -- con un borrador local devolvía
   * false y no pasaba nada. O sea que el copy que el admin revisaba y aprobaba
   * nunca llegaba a Meta, y la única forma de sacarlo era crear una campaña
   * nueva con fb_create_ad, que ignora ese texto y genera otro.
   *
   * Queda separado en dos acciones distintas, que es como tiene que ser:
   *   - subir a Meta (PAUSED): no gasta un peso, se puede revisar en Ads Manager
   *   - activar (ACTIVE): empieza a gastar, y es publishDraft
   */
  /**
   * @param objetivo que tipo de campana crear. Antes TODA campana se subia
   * como de VENTAS apuntando a la web, asi que pedir "una de trafico" o
   * "una de mensajes" daba lo mismo.
   */
  async subirBorradorAMeta(
    draftId: number,
    objetivo: import("./objetivos-campana").ObjetivoCampana = "ventas",
    /**
     * Estructura a replicar. Pedido del dueño (13-09-2026): que lo que se
     * publique sea como las campañas que ya tiene en Meta (dos conjuntos
     * CO + Internacional, Instagram, mejoras completas). Si no viene, se usa
     * la campaña más reciente de la cuenta como plantilla; `null` explícito
     * = sin plantilla (un solo conjunto, como antes).
     */
    plantilla?: import("./facebook").PlantillaDeCampana | null,
    preferenciaWeb?: import("./landing/destino-del-producto").PreferenciaWeb | null,
  ): Promise<{ ok: boolean; message?: string; campaignId?: string; plantilla?: string | null }> {
    try {
      const [draft] = await db.select().from(facebookDrafts).where(eq(facebookDrafts.id, draftId)).limit(1);
      if (!draft) return { ok: false, message: "No encontré ese borrador." };
      if (draft.campaignId) {
        return { ok: false, message: `Ese borrador ya existe en Meta (campaña ${draft.campaignId}), en estado ${draft.fbStatus || "PAUSED"}.` };
      }
      if (!draft.productId) return { ok: false, message: "El borrador no tiene producto asociado." };

      const { FacebookService } = await import("./facebook");
      const fb = new FacebookService(this.tenant);
      if (!fb.isConfigured()) return { ok: false, message: "Facebook no está conectado." };

      // Plantilla: la última campaña real de la cuenta, salvo que se pida otra o ninguna.
      let plantillaUsada: import("./facebook").PlantillaDeCampana | null = plantilla ?? null;
      if (plantilla === undefined) {
        const reciente = await fb.campanaModelo();
        if (reciente) plantillaUsada = await fb.plantillaDesdeCampana(reciente.id);
        // Plantilla IMPLÍCITA (nadie la pidió): se toma su forma (Instagram,
        // mejoras), NO sus conjuntos extra. Antes replicaba en silencio, por
        // ejemplo, un conjunto "Internacional" con su propio presupuesto que
        // el dueño no había pedido (revisión 08-10). Con `comoCampana`
        // explícito sí se replica todo.
        if (plantillaUsada?.conjuntos && plantillaUsada.conjuntos.length > 1) {
          plantillaUsada = { ...plantillaUsada, conjuntos: plantillaUsada.conjuntos.slice(0, 1) };
        }
      }
      // ── Borradores con el texto de la plantilla VIEJA ────────────────────
      // Hasta el 23-09-2026 todo borrador salía con el texto de curso digital
      // ("Haz clic abajo para descargar todo el contenido", "acceso
      // permanente"), también el del corrector de postura. El dueño lo vio en
      // Meta: "la imagen sí subió, pero no con el copy correcto". Un borrador
      // así no se sube tal cual: se regenera con anuncio-por-modelo.ts.
      let copy = {
        primaryText: String(draft.primaryText || ""),
        headline: String(draft.headline || ""),
        description: String(draft.description || ""),
      };
      const [prodDelBorrador] = await db.select().from(products).where(eq(products.id, draft.productId)).limit(1);
      const { modeloDelProducto } = await import("./anuncio-por-modelo");
      const noCorresponde = prodDelBorrador
        ? copyDeOtroModelo(`${copy.primaryText} ${copy.headline} ${copy.description}`, modeloDelProducto(prodDelBorrador as any))
        : null;
      if (esCopyDeLaPlantillaVieja(copy.primaryText) || noCorresponde) {
        if (noCorresponde) logger.warn({ draftId, motivo: noCorresponde }, "[AdStrategist] El copy del borrador no corresponde al producto: se regenera antes de subir");
        const prod = prodDelBorrador;
        if (prod) {
          const nuevo = await this.generateAdCopy(this.getStrategyForProduct(prod), prod, undefined, { objetivo });
          copy = { primaryText: nuevo.primaryText, headline: nuevo.headline, description: nuevo.description };
          await db.update(facebookDrafts).set({ ...copy, updatedAt: new Date() }).where(eq(facebookDrafts.id, draftId));
          logger.warn({ draftId }, "[AdStrategist] Borrador con el texto de la plantilla vieja: se regeneró antes de subirlo");
        }
      }
      // Guardrail de presupuesto del negocio antes de crear el anuncio en Meta.
      const guard = await this.guardPresupuesto(Number(draft.budget) || 5000);
      if (!guard.allowed) return { ok: false, message: `Bloqueado por el tope de gasto: ${guard.reason}` };
      // ── La segmentación que Atlas guardó en el borrador viaja a Meta ──
      // Antes se pasaba `undefined`: el borrador decía "25-45, intereses X"
      // y el anuncio salía con la audiencia por defecto. Los intereses se
      // guardan como nombres; facebook.ts los resuelve contra la taxonomía
      // real de Meta y corta si alguno no existe.
      const estrategiaGuardada: any = draft.strategy && typeof draft.strategy === "object" ? draft.strategy : {};
      const nombresIntereses: string[] = Array.isArray(estrategiaGuardada.interests)
        ? estrategiaGuardada.interests.filter((v: unknown) => typeof v === "string" && v.trim())
        : [];
      // ── Las CIUDADES estudiadas también viajan a Meta ────────────────────
      // El estudio de cobertura/riesgo (segmentacion-inteligente) deja las
      // ciudades recomendadas en `strategy.ciudades`; sin esto el conjunto
      // salía a todo el país, incluidos los pueblos sin cobertura de
      // contraentrega -- exactamente los pedidos que se rechazan.
      const ciudadesEstudiadas: string[] = Array.isArray(estrategiaGuardada.ciudades)
        ? estrategiaGuardada.ciudades.filter((v: unknown) => typeof v === "string" && v.trim())
        : [];
      const targetingDeAtlas: import("./facebook").FbTargeting = {
        ...(Number.isFinite(Number(estrategiaGuardada.ageMin)) && estrategiaGuardada.ageMin != null ? { ageMin: Number(estrategiaGuardada.ageMin) } : {}),
        ...(Number.isFinite(Number(estrategiaGuardada.ageMax)) && estrategiaGuardada.ageMax != null ? { ageMax: Number(estrategiaGuardada.ageMax) } : {}),
        // El género elegido (el estudio o el admin en el modal): vacío = todos.
        ...(Array.isArray(estrategiaGuardada.genders) && estrategiaGuardada.genders.length ? { genders: estrategiaGuardada.genders } : {}),
        ...(nombresIntereses.length ? { interests: nombresIntereses.map((name) => ({ id: "", name })) } : {}),
        // Solo las CIUDADES: el país lo pone el createAdForProduct (el del
        // negocio) y las mezcla con las ciudades -- mandar `countries: []`
        // sería un geo_locations vacío y Meta lo rechaza.
        ...(ciudadesEstudiadas.length ? { geoLocations: { cities: ciudadesEstudiadas } } : {}),
      };
      const creado = await fb.createAdForProduct(
        draft.productId,
        Number(draft.budget) || 5000,
        undefined,
        Object.keys(targetingDeAtlas).length ? targetingDeAtlas : undefined,
        // El copy APROBADO (o el regenerado si era el de la plantilla vieja).
        copy,
        objetivo,
        plantillaUsada,
        preferenciaWeb,
        // El carrusel guardado en el borrador ahora SÍ viaja a Meta (08-10).
        estrategiaGuardada.formato === "carrusel" && Array.isArray((draft as any).images) && (draft as any).images.length >= 2
          ? ((draft as any).images as string[])
          : null,
      );
      // El motivo REAL, no "no aceptó".
      //
      // `createAdForProduct` devuelve null en error y deja el mensaje de Graph
      // en `lastAdError` (existe justamente para esto, y ya se usa en
      // app-operator.ts y en routes/facebook.ts). Acá se ignoraba, así que al
      // admin le llegaba "Meta no aceptó crear la campaña" y nada más: sin
      // saber si es el método de pago, un límite de la cuenta, el píxel, el
      // copy rechazado o un id mal configurado, no hay nada que hacer con esa
      // frase. Reportado en vivo el 2026-08-19 subiendo una campaña nueva.
      if (!creado) {
        const motivo = fb.lastAdError ? ` Motivo que da Meta: ${fb.lastAdError}` : "";
        return { ok: false, message: `Meta no aceptó crear la campaña.${motivo}` };
      }

      await db.update(facebookDrafts)
        .set({
          campaignId: creado.campaignId,
          adSetId: creado.adSetId,
          adId: creado.adId,
          status: "created",
          fbStatus: "PAUSED",
          // A dónde apunta, guardado: sin esto nadie podía decir cuál de seis
          // campañas iguales del corrector iba a la landing y cuál a WhatsApp
          // (24-09-2026), y el dueño las volvía a pedir.
          strategy: { ...(typeof draft.strategy === "object" && draft.strategy ? (draft.strategy as any) : {}), objetivo: creado.objetivo ?? objetivo, destino: creado.destino ?? null } as any,
          updatedAt: new Date(),
        })
        .where(eq(facebookDrafts.id, draftId));

      logger.info({ draftId, campaignId: creado.campaignId, destino: creado.destino }, "[AdStrategist] Borrador subido a Meta en PAUSA");
      return { ok: true, campaignId: creado.campaignId, plantilla: plantillaUsada?.origen?.nombre || null };
    } catch (err: any) {
      logger.error({ err, draftId }, "[AdStrategist] Error subiendo el borrador a Meta");
      return { ok: false, message: err?.message || "Error subiendo el borrador a Meta" };
    }
  }

  /**
   * Reconstruye el creativo real en Meta cuando se editan las fotos y/o el
   * texto de un borrador que YA tiene anuncio creado (campaignId/adId).
   * Los creativos de Facebook son inmutables una vez creados -- no hay forma
   * de "editar" la imagen de uno existente, hay que crear un creativo NUEVO
   * y cambiar el `creative_id` del anuncio para que apunte a él (funciona
   * tanto en PAUSED como en ACTIVE). Sin esto, editar y guardar fotos en el
   * panel actualizaba la base de datos pero el anuncio real seguía mostrando
   * la imagen vieja al publicarse -- una desprolijidad que confundiría al
   * admin (todo "se ve" guardado pero Facebook publica algo distinto).
   */
  async updateDraftCreative(draftId: number): Promise<{ ok: boolean; message?: string }> {
    try {
      const [draft] = await db.select().from(facebookDrafts).where(eq(facebookDrafts.id, draftId)).limit(1);
      if (!draft) return { ok: false, message: "Borrador no encontrado" };
      if (!draft.adId) return { ok: false, message: "Este borrador todavía no tiene anuncio creado en Meta" };

      const { accessToken, adAccountId } = this.credencialesFb();
      if (!accessToken || !adAccountId) return { ok: false, message: "Falta token o cuenta publicitaria" };
      const act = `act_${adAccountId}`;

      const images = (draft.images && draft.images.length > 0 ? draft.images : (draft.imageUrl ? [draft.imageUrl] : [])) as string[];

      // ── El destino y el botón NO se cambian al editar ─────────────────────
      // Antes el creativo nuevo iba SIEMPRE a la web y sin botón. En una
      // campaña de MENSAJES eso es lo que Meta rechaza con "Contenido no
      // válido para el objetivo" (visto el 24-09-2026 tras corregir el texto
      // del corrector). Se leen del creativo ACTUAL del anuncio -- el que armó
      // la subida con el objetivo correcto -- y solo cambian texto e imágenes.
      let destinoActual: string | null = null;
      let botonActual: any = null;
      let instagramActual: string | null = null;
      try {
        const r = await fetch(`${FB_GRAPH_URL}/${draft.adId}?fields=creative{object_story_spec,instagram_user_id}&access_token=${encodeURIComponent(accessToken)}`);
        const j: any = await r.json();
        const ld = j?.creative?.object_story_spec?.link_data;
        destinoActual = ld?.link || null;
        botonActual = ld?.call_to_action || null;
        instagramActual = j?.creative?.object_story_spec?.instagram_user_id || j?.creative?.instagram_user_id || null;
      } catch { /* sin lectura: se usa la web, como antes */ }
      // Landing publicada del producto si la hay; si no, la tienda.
      const destinoWeb = destinoActual || (await destinoWebDelProducto(this.tenant.id, Number(draft.productId))).url;
      const linkData: Record<string, any> = {
        link: destinoWeb,
        message: draft.primaryText || "",
        name: draft.headline || "",
        description: draft.description || "",
        ...(botonActual ? { call_to_action: botonActual } : {}),
      };
      if (images.length > 1) {
        linkData.child_attachments = images.map((url, i) => ({
          link: destinoWeb,
          picture: url,
          name: i === 0 ? (draft.headline || "") : `${draft.headline || ""} (${i + 1})`,
          description: draft.description || "",
        }));
      } else if (images[0]) {
        linkData.picture = images[0];
      }

      // ── Las MEJORAS DE IA de Meta acompañan al creativo nuevo ────────────
      // El creativo ORIGINAL (el de la subida) las trae (createAdForProduct
      // las arma en degrees_of_freedom_spec) — pero esta EDICIÓN creaba el
      // creativo nuevo SIN ellas: al cambiar la imagen, el anuncio perdía
      // los retoques/texto-optimizado. Y con carrusel (2+ fotos reales) va
      // multi_photo_to_video: la IA de Meta arma video con las fotos.
      // Los guardias son los del sistema: solo con foto real (mejorasDel-
      // Creativo) y el lugar correcto es degrees_of_freedom_spec (verificado
      // en vivo el 08-08-2026: el campo en la raíz lo acepta pero Meta no lo lee).
      // Hay foto REAL si ninguna imagen de la lista es el placeholder
      // (placehold.co es la señal del sistema de "este producto no tiene
      // foto": las mejoras que ALTERAN la imagen solo con foto real).
      const hayFotoReal = images.length > 0 && !images.some((u: string) => /placehold\.co/i.test(u));
      let featuresMeta: Record<string, unknown> | null = null;
      try {
        const { mejorasDelCreativo } = await import("./facebook");
        featuresMeta = mejorasDelCreativo({ hayFotoReal, mejorasCompletas: false, conCarrusel: images.length > 1 }) as any;
      } catch (fe: any) {
        logger.warn({ err: fe?.message, draftId }, "[AdStrategist] sin mejoras del creativo en la edición");
      }

      const creative = await this.fbPost(act, "adcreatives", accessToken, {
        name: `[BORRADOR] ${draft.productName} - Creativo (editado)`,
        object_story_spec: {
          page_id: this.credencialesFb().pageId,
          link_data: linkData,
          ...(instagramActual ? { instagram_user_id: instagramActual } : {}),
        },
        ...(featuresMeta ? { degrees_of_freedom_spec: { creative_features_spec: featuresMeta } } : {}),
      });

      const swapRes = await fetch(`${FB_GRAPH_URL}/${draft.adId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creative: JSON.stringify({ creative_id: creative.id }), access_token: accessToken }),
      });
      const swapData: any = await swapRes.json();
      if (swapData.error) {
        logger.error({ err: swapData.error, draftId }, "[AdStrategist] Meta rechazó el cambio de creativo");
        return { ok: false, message: swapData.error.message || "Meta rechazó el cambio de imagen" };
      }
      return { ok: true };
    } catch (err: any) {
      logger.error({ err, draftId }, "[AdStrategist] Error actualizando el creativo");
      return { ok: false, message: err?.message || "Error actualizando el creativo" };
    }
  }

  /** URL relativa (/uploads/...) o ya absoluta -> siempre absoluta, o "" si no se puede resolver. */
  private toAbsoluteUrl(raw: string): string {
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    const appUrl = getAppUrl();
    if (/^https:\/\//i.test(appUrl)) return `${appUrl.replace(/\/+$/, "")}/${raw.replace(/^\/+/, "")}`;
    return "";
  }

  /**
   * Normaliza un número o enlace de WhatsApp a un link wa.me utilizable.
   * Acepta "573001234567", "+57 300 123 4567" o un wa.me/enlace ya armado.
   * Devuelve null si no hay un número reconocible (mejor no crear el anuncio
   * que crear uno cuyo botón no lleva a ningún lado).
   */
  private normalizarWhatsApp(valor: string): string | null {
    const v = String(valor || "").trim();
    if (!v) return null;
    const desdeEnlace = v.match(/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?(\d{7,15})/i);
    const digitos = desdeEnlace ? desdeEnlace[1] : v.replace(/\D/g, "");
    if (!digitos || digitos.length < 7 || digitos.length > 15) return null;
    return `https://wa.me/${digitos}`;
  }

  async createDraftAd(adAccountParam: string, accessTokenParam: string, productId: number, grounded?: ResearchGroundedCopy, manualImages?: string[], destino?: { tipo: "whatsapp"; numero: string }, presupuestoDiario?: number, opts: { subirSolo?: boolean; subirAhora?: boolean; objetivo?: string } = {}): Promise<DraftAd> {
    // Las credenciales se resuelven SIEMPRE acá, no se confía en las que
    // manda quien llama: los tres llamadores (la ruta HTTP, la herramienta
    // fb_ad_draft de Atlas y createDraftsForAllProducts) armaban su propio
    // `tenant?.facebook?.X || process.env.FB_X`, sin la protección de "solo
    // el dueño del servidor hereda el .env". Con eso, un negocio que todavía
    // no conectó su Facebook habría creado anuncios REALES en la cuenta
    // publicitaria del dueño de la plataforma, gastando su dinero. Los
    // parámetros quedan por compatibilidad de firma.
    const { accessToken, adAccountId: adAccount } = this.credencialesFb();
    void adAccountParam; void accessTokenParam;

    const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product) throw new Error("Producto no encontrado");

    let strategy = this.getStrategyForProduct(product);
    // El presupuesto que pidió el admin MANDA sobre el de la estrategia.
    //
    // Antes no había forma de pasarlo: el borrador se guardaba siempre con el
    // valor fijo del nicho (Cursos -> $20.000/día), mientras Atlas le
    // confirmaba al admin por chat el número que él había pedido. O sea, se
    // le confirmaba un número y se guardaba OTRO, sobre un objeto cuya
    // función es gastar dinero: si le daba "Publicar" confiando en el chat,
    // gastaba el doble de lo autorizado. El default del nicho ahora es solo
    // el respaldo para cuando no se pide nada.
    if (Number.isFinite(presupuestoDiario) && (presupuestoDiario as number) > 0) {
      strategy.budget = Math.round(presupuestoDiario as number);
    }
    if (grounded?.researchNote) strategy.researchNote = grounded.researchNote;
    const adCopy = await this.generateAdCopy(strategy, product, grounded, { objetivo: opts.objetivo || (destino?.tipo === "whatsapp" ? "mensajes" : undefined) });
    // El gancho corregido vuelve acá: lo que se guarda es lo que se publica.
    strategy = adCopy.strategy;

    // Fotos propias del admin (ya subidas, ver saveUploadedImage): si las
    // trae, van primero y NO se genera nada con IA -- es el caso "ya diseñé
    // mi imagen, quiero publicar de una vez".
    const manualAbsolute = (manualImages || []).map(u => this.toAbsoluteUrl(u)).filter(Boolean);

    // El campo del esquema es imageUrl (column image_url). Leerlo como
    // product.image_url daba siempre undefined, así que TODOS los anuncios
    // salían con el placeholder gris en vez de la foto del producto.
    // Facebook además exige URL absoluta: las del catálogo son relativas.
    let imageUrl = manualAbsolute[0] || this.toAbsoluteUrl(product.imageUrl || "");
    const raw = product.imageUrl || "";
    // Este flag decide más abajo qué mejoras de Meta se activan: recortar/
    // expandir o generar fondo sobre un cartel de texto genérico no tiene
    // sentido y puede terminar pareciendo todavía menos al producto.
    let hasRealProductImage = !!imageUrl;

    // ── Imágenes del borrador: la GALERÍA completa del producto ──────────
    //
    // Bug del 02-10-2026 (reportado por el dueño): "que escoja en automático
    // las imágenes disponibles". Al crear, el borrador traía SOLO la imageUrl
    // (una foto) aunque el producto tuviera la galería entera en su metadata
    // (Dropi la importa completa) — el admin tenía que subir a mano las demás
    // para que salir carrusel, teniendo las fotos ya ahí.
    //
    // Orden: las propias del admin (si trajo) → galería del producto → la
    // imageUrl. La primera SIEMPRE va como principal, que es la que Meta
    // muestra grande y la que quedó en el producto.
    const { fotosDelProducto } = await import("./fotos-de-producto");
    const galeriaDelProducto = fotosDelProducto(product, getAppUrl(), 6)
      .map((u) => this.toAbsoluteUrl(u))
      .filter(Boolean);
    // Sin imageUrl pero con galería (Dropi la guarda en metadata.imageUrls):
    // la principal es la primera foto REAL de la galería. Antes se saltaba
    // directo a generar una imagen con IA teniendo las fotos del producto.
    if (!imageUrl && galeriaDelProducto[0]) {
      imageUrl = galeriaDelProducto[0];
      hasRealProductImage = true;
    }

    // Sin foto real del producto: antes de caer al cartel de texto gris, se
    // intenta generar una con IA a partir del nombre y la descripción REALES
    // del producto (no un estilo genérico por nicho) -- así corresponde al
    // curso, no a una foto de stock cualquiera. generateProductImage ya
    // genera 2 candidatas y elige la mejor con un juez de visión -- no hace
    // falta guardar variantes extra (generateProductImageVariants) porque
    // asset_feed_spec no se usa (ver más abajo, no funciona sin /adimages).
    // Se guarda como archivo real (no data: URI) y se persiste en el
    // producto para no regenerarla cada vez, y para que se vea en la tienda.
    // Un producto FÍSICO no se anuncia con una foto inventada: el cliente
    // espera recibir lo que vio (y Meta lo cuenta como engañoso). Sin foto,
    // queda el cartel y la rúbrica del panel lo marca para que se suba una.
    if (!imageUrl && String(product.kind || "") !== "physical") {
      const appUrl = getAppUrl();
      if (/^https:\/\//i.test(appUrl)) {
        const generatedPath = await generateProductImage({ id: product.id, name: product.name, description: product.description, kind: product.kind });
        if (generatedPath) {
          imageUrl = `${appUrl.replace(/\/+$/, "")}/${generatedPath.replace(/^\/+/, "")}`;
          hasRealProductImage = true;
          await db.update(products).set({ imageUrl: generatedPath }).where(eq(products.id, product.id));
        }
      }
    }

    if (!imageUrl) {
      imageUrl = `https://placehold.co/1200x628/1A365D/FFFFFF?text=${encodeURIComponent((product.name || "").substring(0, 30))}`;
      logger.warn({ productId: product.id, raw, appUrl: process.env.APP_URL }, "[AdStrategist] Sin imagen absoluta y no se pudo generar una — usando placeholder (el anuncio no representará el producto real hasta que se le cargue una foto)");
    }

    // Por defecto NO se crean campañas en la cuenta publicitaria de Meta: sin
    // presupuesto ni método de pago no tiene sentido, y una campaña real es
    // difícil de deshacer. El borrador se guarda local y queda listo para
    // revisarlo y publicarlo cuando se decida. Para habilitar la creación real
    // hay que poner FB_CREATE_REAL_CAMPAIGNS=true de forma explícita.
    // ── UN SOLO camino a Meta ────────────────────────────────────────────
    //
    // Acá había un SEGUNDO creador de campañas (≈350 líneas) que armaba la
    // campaña a mano: un solo conjunto, sin la plantilla de las campañas
    // reales de la cuenta, sin las reglas del creativo y con su propio texto.
    // Con FB_CREATE_REAL_CAMPAIGNS=true lo usaban el lanzamiento automático,
    // la agencia, el panel y fb_ad_draft -- de ahí las "[BORRADOR] Canguro /
    // Kit bebé / Bañera" del 24-09-2026, alguna sin conjunto de anuncios, y
    // al admin se le decía "se sube a Meta cuando lo apruebes" cuando ya
    // estaba subida. Ahora el borrador SIEMPRE se guarda local y, si la
    // creación real está habilitada, se sube por `subirBorradorAMeta`: el
    // mismo camino que fb_upload_draft_to_meta (plantilla, objetivo, mejoras,
    // chequeo de imagen y de copy). Si Meta lo rechaza se dice el motivo.
    const localDraft: DraftAd = {
      productId: product.id,
      productName: product.name || "",
      strategy,
      primaryText: adCopy.primaryText,
      headline: adCopy.headline,
      description: adCopy.description,
      imageUrl,
      // La galería completa: carrusel automático sin que el admin la suba a
      // mano. Las propias del admin manda; después las del producto; y la
      // imageUrl SIEMPRE va (es la principal y la que se muestra en el panel).
      // Sin duplicados: la misma URL tres veces es un carrusel con tres fotos
      // iguales, que Meta rechaza y el admin no entiende.
      images: [...new Set([...manualAbsolute, ...galeriaDelProducto, imageUrl].filter(Boolean))].slice(0, 6),
      campaignId: null,
      adSetId: null,
      adId: null,
      status: "draft",
    };
    // El id del borrador VIAJA con el resultado: sin él nadie puede subirlo después.
    const guardado = await this.saveDraftToDb(localDraft);
    if (guardado?.id) localDraft.id = Number(guardado.id);
    logger.info(
      { productId: product.id, strategy: strategy.niche, draftId: localDraft.id },
      "[AdStrategist] Borrador local creado (sin tocar la cuenta publicitaria)"
    );
    // `subirSolo: false` = el llamador lo sube después con SU objetivo. Prueba
    // real del 25-09-2026: Atlas pidió formulario, este paso lo subió solo
    // como tráfico a la landing y la subida pedida falló con "ese borrador ya
    // existe en Meta".
    // ── El borrador LOCAL es el default; subir no es un efecto del clic ──
    //
    // Reportado por el dueño (03-10-2026): "cuando le doy crear borrador de
    // una los sube a Facebook, no espera que uno lo publique". El default era
    // el contrario: si FB_CREATE_REAL_CAMPAIGNS=true, `createDraftAd` subía al
    // mismo tiempo, y el botón del panel quedaba como quien YA autorizó la
    // campaña -- sin que nadie la haya revisado. Ahora el que sube es quien
    // lo pida EXPLÍCITO: `opts.subirAhora: true` (Atlas, el lanzamiento
    // automático, el modal con publishNow) -- el panel nunca. La subida del
    // panel vive en POST /strategist/draft/:id/upload, que ES el botón.
    if (!localDraft.id || opts.subirSolo === false || opts.subirAhora !== true) return localDraft;

    if (!accessToken || !adAccount) {
      localDraft.errorDeMeta = "Para subirlo a Meta primero tenés que conectar tu cuenta de Facebook desde la sección Facebook del panel.";
      return localDraft;
    }
    let objetivo: import("./objetivos-campana").ObjetivoCampana = "mensajes";
    let preferenciaWeb: import("./landing/destino-del-producto").PreferenciaWeb | null = null;
    if (destino?.tipo !== "whatsapp") {
      const { destinoPorDefecto } = await import("./landing/destino-del-producto");
      const d = await destinoPorDefecto((this.tenant as any)?.id, product.id, (strategy as any).objetivoRecomendado || "mensajes");
      objetivo = d.objetivo;
      preferenciaWeb = d.preferencia;
    }
    const subida = await this.subirBorradorAMeta(localDraft.id, objetivo, undefined, preferenciaWeb);
    if (subida.ok) {
      const [fila] = await db.select().from(facebookDrafts).where(eq(facebookDrafts.id, localDraft.id)).limit(1);
      localDraft.campaignId = fila?.campaignId ?? subida.campaignId ?? null;
      localDraft.adSetId = fila?.adSetId ?? null;
      localDraft.adId = fila?.adId ?? null;
      localDraft.status = "created";
      localDraft.primaryText = String(fila?.primaryText || localDraft.primaryText);
      localDraft.headline = String(fila?.headline || localDraft.headline);
      localDraft.description = String(fila?.description || localDraft.description);
    } else {
      localDraft.errorDeMeta = subida.message || "Meta no aceptó crear la campaña.";
      logger.warn({ draftId: localDraft.id, motivo: localDraft.errorDeMeta }, "[AdStrategist] El borrador quedó local: Meta no lo aceptó");
    }
    return localDraft;
  }

  async createDraftsForAllProducts(): Promise<{ created: number; failed: number; withoutRealImage: number; omitidos?: number; drafts: DraftAd[] }> {
    const result = { created: 0, failed: 0, withoutRealImage: 0, drafts: [] as DraftAd[] };

    const { accessToken, adAccountId } = this.credencialesFb();

    if (!accessToken || !adAccountId) {
      logger.error("[AdStrategist] Facebook not configured");
      return result;
    }

    const activeProducts = await db.select().from(products).where(eq(products.isActive, true));

    // ── Si ya tiene borrador, no se crea otro ────────────────────────────
    // Reportado por el dueño (03-10): "borradores desbordados" — cada clic en
    // "Megapacks" creaba UN borrador POR PRODUCTO, aunque ya existiera, y la
    // lista creció a 132 filas basura que nadie iba a mirar. El dedup por
    // product: un producto con borrador se OMITE (con su motivo en el resumen).
    const existentes = new Set(
      (await db.select({ productId: facebookDrafts.productId }).from(facebookDrafts))
        .map((r: { productId: number | null | undefined }) => Number(r.productId)),
    );
    let yaTenian = 0;

    for (const p of activeProducts) {
      try {
        if (existentes.has(Number(p.id))) { yaTenian++; continue; }
        // Queda LOCAL (sin subir): "Megapacks" dispara decenas de borradores de
        // una -- subirlos todos a Meta en el mismo paso sería crear campañas
        // REALES sin que nadie las revisó ni aprobó. Se revisan y se suben una
        // por una desde la lista.
        const draft = await this.createDraftAd(adAccountId, accessToken, p.id, undefined, undefined, undefined, undefined, { subirSolo: false });

        // ── LA SEGMENTACIÓN DEL ESTUDIO entra en el borrador ──────────────
        // Reportado por el dueño (04-10): los del Megapack "salen sin
        // investigación, sin segmentación y a medias". La segmentación REAL
        // (público derivado + intereses que Meta conoce + ciudades con
        // cobertura y riesgo medido) es local y barata: se le da a CADA
        // borrador del lote. La investigación de mercado (gancho del
        // mercado) es una llamada de Biblioteca POR PRODUCTO: 151 productos
        // no se pueden investigar en un botón sin quemar horas -- esa sigue
        // siendo la tarea de "Generar campaña" producto por producto, que
        // ya investiga y guarda la evidencia.
        if (draft.id) {
          try {
            const { segmentacionDelProducto } = await import("./segmentacion-inteligente");
            const est = await segmentacionDelProducto(this.tenant?.id ?? 0, p.id, { conInvestigacion: false });
            const [filaAntes] = await db.select().from(facebookDrafts).where(eq(facebookDrafts.id, draft.id)).limit(1);
            const st: any = filaAntes?.strategy && typeof filaAntes.strategy === "object" ? { ...(filaAntes.strategy as any) } : {};
            st.ageMin = est.edadMin;
            st.ageMax = est.edadMax;
            st.genders = est.genero === "todos" ? [] : (est.genero === "hombres" ? [1] : [2]);
            st.interests = est.intereses;
            st.ciudades = est.ciudades.filter((c) => c.recomendada).slice(0, 5).map((c) => c.ciudad);
            st.segmentacionEstudio = { en: new Date().toISOString(), evidencia: est.evidencia };
            await db.update(facebookDrafts).set({ strategy: st } as any).where(eq(facebookDrafts.id, draft.id));
            draft.strategy = st as any;
            (result as any).conSegmentacion = ((result as any).conSegmentacion ?? 0) + 1;
          } catch (segErr: any) {
            logger.warn({ err: segErr?.message, producto: p.id }, "[AdStrategist] la segmentación del estudio no se pudo poner en el borrador");
          }
        }

        result.drafts.push(draft);
        if (draft.status === "created") result.created++;
        // Un borrador LOCAL ES un éxito (está guardado y listo para revisar):
        // antes contaba como "failed" y el panel decía errores que no eran.
        else if (draft.id) result.created++;
        else result.failed++;
        // El placeholder de placehold.co es la señal de "este producto no
        // tiene foto real" -- son los anuncios que van a salir con una
        // imagen que NO corresponde al curso hasta que se les cargue una.
        if (draft.imageUrl.startsWith("https://placehold.co/")) result.withoutRealImage++;
      } catch (err: any) {
        logger.error({ err, product: p.name }, "[AdStrategist] Failed");
        result.failed++;
      }
    }
    (result as any).omitidos = yaTenian;

    return result;
  }

  /** Borra un objeto de Meta por id. Se usa para deshacer una campaña que
   * quedó a medias: Meta borra en cascada (se lleva conjuntos y anuncios).
   * Nunca lanza -- si el borrado falla, se deja constancia en el log y sigue,
   * porque esto corre dentro del manejo de otro error que es el que importa. */
  private async fbDelete(objectId: string, accessToken: string): Promise<boolean> {
    try {
      const res = await fetch(`${FB_GRAPH_URL}/${objectId}?access_token=${encodeURIComponent(accessToken)}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(15000),
      });
      const data: any = await res.json().catch(() => ({}));
      if (data?.error) {
        logger.error({ fbError: data.error, objectId }, "[AdStrategist] No se pudo borrar el objeto a medias en Meta");
        return false;
      }
      return true;
    } catch (err: any) {
      logger.error({ err, objectId }, "[AdStrategist] Falló el borrado del objeto a medias en Meta");
      return false;
    }
  }

  private async fbPost(adAccount: string, endpoint: string, accessToken: string, body: Record<string, any>): Promise<any> {
    const url = `${FB_GRAPH_URL}/${adAccount}/${endpoint}`;
    const params = new URLSearchParams({ access_token: accessToken });
    let res: Response;
    try {
      res = await fetch(`${url}?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
    } catch (err: any) {
      // Antes esto no tenía timeout: una llamada colgada a Meta bloqueaba el
      // flujo indefinidamente en vez de fallar con un error entendible.
      logger.error({ err, endpoint }, "[AdStrategist] fbPost sin respuesta (timeout o red)");
      throw new Error(`Sin respuesta de Facebook en /${endpoint}: ${err?.message || err}`);
    }
    const data: any = await res.json();
    if (data.error) {
      // Antes solo se propagaba message+code -- error_subcode, fbtrace_id y
      // el resto del objeto (clave para diagnosticar rate limits/permisos)
      // se perdían y solo quedaban en la excepción genérica del caller.
      logger.error({ fbError: data.error, endpoint, adAccount }, "[AdStrategist] Meta devolvió un error");
      throw new Error(`${data.error.message} (código ${data.error.code}${data.error.error_subcode ? `, subcódigo ${data.error.error_subcode}` : ""})`);
    }
    return data;
  }

  /** Mismo chequeo que en facebook.ts: el pixelId guardado puede pertenecer
   * a otra cuenta publicitaria -- se verifica antes de usarlo para evitar
   * el error tardío "Píxel no asociado" en el paso final. */
  private async pixelBelongsToAccount(adAccount: string, accessToken: string, pixelId: string): Promise<boolean> {
    try {
      const params = new URLSearchParams({ access_token: accessToken, fields: "id" });
      const res = await fetch(`${FB_GRAPH_URL}/${adAccount}/adspixels?${params}`);
      const data: any = await res.json();
      const ids: string[] = (data.data || []).map((p: any) => p.id);
      return ids.includes(pixelId);
    } catch (err: any) {
      logger.warn({ err }, "[AdStrategist] No se pudo verificar el pixel de la cuenta");
      return false;
    }
  }
}

export const adStrategist = new AdStrategist();
