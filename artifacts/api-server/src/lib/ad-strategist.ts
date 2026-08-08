import { logger } from "./logger";
import { getAppUrl } from "./app-url";
import { db, products, productCategories, facebookDrafts } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { tenantManager, type TenantContext } from "./tenantManager";
import { resolveInterestIds } from "./facebook";
import { generateProductImage } from "./ai-product-image";

const FB_GRAPH_URL = "https://graph.facebook.com/v21.0";

// Corta en el último espacio dentro del límite en vez de a lo bruto -- un
// substring ciego partía nombres de producto a mitad de palabra (ej: "Curso
// de Piano Completo: De Cero a" con "Nivel Avanzado" perdido sin ni un "…"
// que avise que se cortó). Si no hay un espacio razonablemente cerca del
// límite (título de una sola palabra larga), corta igual pero al menos
// avisa con "…".
function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  const clean = lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut;
  return clean.trimEnd() + "…";
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
}

export interface DraftAd {
  productId: number;
  productName: string;
  strategy: AdStrategy;
  primaryText: string;
  headline: string;
  description: string;
  imageUrl: string;
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  status: "draft" | "created";
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

export class AdStrategist {
  private tenant: TenantContext;

  constructor(tenant?: TenantContext) {
    this.tenant = tenant || tenantManager.getDefaultTenant();
  }

  getStrategyForProduct(product: any): AdStrategy {
    const name = (product.name || "").toLowerCase();
    const category = (product.category || "").toLowerCase();

    if (category.includes("diseño") || category.includes("diseño gráfico") || name.includes("photoshop") || name.includes("ilustrator") || name.includes("indesign") || name.includes("lettering") || name.includes("logotipo") || name.includes("canva") || name.includes("after effects") || name.includes("premiere") || name.includes("animación") || name.includes("filmora") || name.includes("portadas") || name.includes("cuadros") || name.includes("sublimados") || name.includes("infografías") || name.includes("dibujo") || name.includes("ilustración") || name.includes("premiere")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.diseno_grafico };
    }

    if (category.includes("programación") || category.includes("programacion") || name.includes("programación") || name.includes("programacion") || name.includes("desarrollo web") || name.includes("ciberseguridad") || name.includes("hacking") || name.includes("wordpress") || name.includes("linux") || name.includes("excel") || name.includes("videojuego") || name.includes("unity") || name.includes("python") || name.includes("javascript")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.programacion };
    }

    if (category.includes("marketing") || name.includes("marketing") || name.includes("seo") || name.includes("ecommerce") || name.includes("ventas") || name.includes("negocio") || name.includes("publicidad") || name.includes("facebook ads") || name.includes("google ads")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.marketing_digital };
    }

    if (category.includes("salud") || category.includes("deporte") || name.includes("fitness") || name.includes("pilates") || name.includes("fuerza") || name.includes("guerrero") || name.includes("perro") || name.includes("gastronomía") || name.includes("gastronomia") || name.includes("cocina") || name.includes("receta") || name.includes("perro")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.salud_deporte };
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

  async generateAdCopy(strategy: AdStrategy, product: any, grounded?: ResearchGroundedCopy): Promise<{ primaryText: string; headline: string; description: string }> {
    // Si el agente investigó y aportó su propio hook/ángulo, se usa ESE en
    // vez del texto fijo del nicho -- el hook es literalmente lo que separa
    // un anuncio "genérico por categoría" de uno anclado en lo que se
    // encontró que funciona hoy para este producto puntual.
    if (grounded?.hook) strategy = { ...strategy, hook: grounded.hook };
    if (grounded?.angle) strategy = { ...strategy, angle: grounded.angle };

    const currency = (product.currency || "COP").toUpperCase();
    // Validar y formatear precio correctamente (sin multiplicar por tipo de cambio ficticio)
    const price = Number(product.price) || 0;
    const priceFormatted = price > 0
      ? price.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      : "Consulta";
    const name = product.name || "";
    const rawDesc = (product.description || "").replace(/Acceso completo a /i, "").trim();
    const shortDesc = rawDesc.length > 100 ? rawDesc.substring(0, 100) + "..." : rawDesc;

    const cat = (product.category || "").toLowerCase();
    const features = product.features
      ? (Array.isArray(product.features) ? product.features : [])
      : [];

    const descLine = shortDesc !== name ? shortDesc : `Contenido digital descargable de ${strategy.niche.toLowerCase()}. Material práctico, listo para usar.`;

    const featuresLine = features.length >= 2
      ? features.slice(0, 3).join(" • ")
      : "📥 Descarga directa • 💾 Acceso permanente • 🔄 Actualizaciones incluidas";

    const priceDisplay = priceFormatted === "Consulta" ? "Consulta disponible" : `$${priceFormatted} ${currency}`;

    // Formato PAS (Problem - Agitate - Solve) de alta conversión (2025)
    const primaryText = `${strategy.hook}

Si no tomas acción hoy, seguirás perdiendo tiempo y dinero con métodos que no funcionan.
Este contenido digital es tu atajo directo a resultados profesionales.

✅ ${featuresLine}
✅ Pago único de ${priceDisplay} (Cero mensualidades)
✅ Acceso inmediato y permanente

👇 Haz clic abajo para descargar todo el contenido ahora.`;

    const getEmoji = () => {
      const n = name.toLowerCase();
      if (n.includes("diseño") || n.includes("photoshop") || n.includes("ilustra") || n.includes("lettering") || n.includes("logotipo") || n.includes("canva") || n.includes("after") || n.includes("premiere") || n.includes("animación") || n.includes("infografía") || n.includes("portada") || n.includes("cuadro")) return "🎨";
      if (n.includes("programación") || n.includes("programacion") || n.includes("desarrollo web") || n.includes("python") || n.includes("hacking") || n.includes("ciberseguridad") || n.includes("wordpress") || n.includes("linux") || n.includes("excel") || n.includes("videojuego")) return "💻";
      if (n.includes("marketing") || n.includes("ventas") || n.includes("seo") || n.includes("ecommerce") || n.includes("publicidad") || n.includes("facebook ads")) return "📈";
      if (n.includes("idioma") || n.includes("inglés") || n.includes("ingles") || n.includes("oxford")) return "🌎";
      if (n.includes("foto") || n.includes("lightroom") || n.includes("presets") || n.includes("cámara") || n.includes("camara")) return "📸";
      if (n.includes("música") || n.includes("musica") || n.includes("guitarra") || n.includes("dj") || n.includes("audio") || n.includes("car audio")) return "🎵";
      if (n.includes("fitness") || n.includes("pilates") || n.includes("fuerza") || n.includes("guerrero") || n.includes("perro") || n.includes("gastronomía") || n.includes("gastronomia") || n.includes("cocina")) return "💪";
      if (n.includes("reparación") || n.includes("reparacion") || n.includes("celular") || n.includes("play") || n.includes("consola") || n.includes("armado") || n.includes("ensamblaje") || n.includes("computador") || n.includes("instaladores")) return "🔧";
      if (n.includes("construcción") || n.includes("construccion") || n.includes("drywall") || n.includes("plano") || n.includes("revit") || n.includes("arquitectura") || n.includes("obra") || n.includes("carpintería") || n.includes("carpinteria") || n.includes("metrados") || n.includes("expediente") || n.includes("vivienda")) return "🏗️";
      if (n.includes("libros") || n.includes("contabilidad") || n.includes("psicología") || n.includes("psicologia") || n.includes("autismo") || n.includes("lenguaje") || n.includes("preuniversitario") || n.includes("ingeniería") || n.includes("ingenieria") || n.includes("aula") || n.includes("memoria") || n.includes("educación") || n.includes("educacion")) return "📚";
      return "🔥";
    };

    // Headline corto (< 40 chars): emoji de categoría + nombre real del
    // producto. (Antes decía "+15.000 Alumnos" fijo en TODOS los anuncios --
    // una cifra sin respaldo real, se sacó.)
    const headline = `${getEmoji()} ${truncateAtWord(name.replace(/^📂\s*/, ""), 35)}`;
    const description = priceFormatted === "Consulta"
      ? "Consulta disponible • Acceso permanente"
      : `$${priceFormatted} ${currency} • Pago único • Acceso permanente`;

    // Override final: si el agente investigó y redactó su propio texto
    // completo (no solo hook/ángulo), se respeta tal cual -- el precio y los
    // datos reales del producto ya quedaron incorporados en su versión
    // porque el agente los ve en el mismo turno via list_products.
    return {
      primaryText: grounded?.primaryText || primaryText,
      headline: grounded?.headline || headline,
      description: grounded?.description || description,
    };
  }

  async saveDraftToDb(draft: DraftAd): Promise<any> {
    try {
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

  async publishDraft(draftId: number): Promise<boolean> {
    try {
      const [draft] = await db.select().from(facebookDrafts).where(eq(facebookDrafts.id, draftId)).limit(1);
      if (!draft) return false;

      if (draft.campaignId && draft.adId) {
        const accessToken = this.tenant.facebook?.accessToken || process.env.FB_ACCESS_TOKEN || process.env.FB_MESSENGER_PAGE_TOKEN || "";
        const adAccountId = this.tenant.facebook?.adAccountId || process.env.FB_AD_ACCOUNT_ID || "";
        if (!accessToken || !adAccountId) return false;

        const act = `act_${adAccountId}`;
        await this.fbPost(act, "ads", accessToken, {
          adset_id: draft.adSetId,
          name: draft.productName,
          status: "ACTIVE",
          creative: { creative_id: draft.adId },
        });

        await db.update(facebookDrafts)
          .set({ status: "published", fbStatus: "ACTIVE" })
          .where(eq(facebookDrafts.id, draftId));
        return true;
      }
      return false;
    } catch (err: any) {
      logger.error({ err, draftId }, "[AdStrategist] Error publishing draft");
      return false;
    }
  }

  async createDraftAd(adAccount: string, accessToken: string, productId: number, grounded?: ResearchGroundedCopy): Promise<DraftAd> {
    const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product) throw new Error("Producto no encontrado");

    const strategy = this.getStrategyForProduct(product);
    if (grounded?.researchNote) strategy.researchNote = grounded.researchNote;
    const adCopy = await this.generateAdCopy(strategy, product, grounded);

    // El campo del esquema es imageUrl (column image_url). Leerlo como
    // product.image_url daba siempre undefined, así que TODOS los anuncios
    // salían con el placeholder gris en vez de la foto del producto.
    // Facebook además exige URL absoluta: las del catálogo son relativas.
    let imageUrl = "";
    const raw = product.imageUrl || "";
    if (/^https?:\/\//i.test(raw)) {
      imageUrl = raw;
    } else if (raw) {
      const appUrl = getAppUrl();
      if (/^https:\/\//i.test(appUrl)) {
        imageUrl = `${appUrl.replace(/\/+$/, "")}/${raw.replace(/^\/+/, "")}`;
      }
    }
    // Este flag decide más abajo qué mejoras de Meta se activan: recortar/
    // expandir o generar fondo sobre un cartel de texto genérico no tiene
    // sentido y puede terminar pareciendo todavía menos al producto.
    let hasRealProductImage = !!imageUrl;

    // Sin foto real del producto: antes de caer al cartel de texto gris, se
    // intenta generar una con IA a partir del nombre y la descripción REALES
    // del producto (no un estilo genérico por nicho) -- así corresponde al
    // curso, no a una foto de stock cualquiera. generateProductImage ya
    // genera 2 candidatas y elige la mejor con un juez de visión -- no hace
    // falta guardar variantes extra (generateProductImageVariants) porque
    // asset_feed_spec no se usa (ver más abajo, no funciona sin /adimages).
    // Se guarda como archivo real (no data: URI) y se persiste en el
    // producto para no regenerarla cada vez, y para que se vea en la tienda.
    if (!imageUrl) {
      const appUrl = getAppUrl();
      if (/^https:\/\//i.test(appUrl)) {
        const generatedPath = await generateProductImage({ id: product.id, name: product.name, description: product.description });
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
    if (process.env.FB_CREATE_REAL_CAMPAIGNS !== "true") {
      const localDraft: DraftAd = {
        productId: product.id,
        productName: product.name || "",
        strategy,
        primaryText: adCopy.primaryText,
        headline: adCopy.headline,
        description: adCopy.description,
        imageUrl,
        campaignId: null,
        adSetId: null,
        adId: null,
        status: "draft",
      };
      await this.saveDraftToDb(localDraft);
      logger.info(
        { productId: product.id, strategy: strategy.niche },
        "[AdStrategist] Borrador local creado (sin tocar la cuenta publicitaria)"
      );
      return localDraft;
    }

    try {
      const act = `act_${adAccount}`;

      const campaign = await this.fbPost(act, "campaigns", accessToken, {
        name: `[BORRADOR] ${product.name} - ${new Date().toLocaleDateString("es-CO")}`,
        objective: "OUTCOME_SALES",
        status: "PAUSED",
        // [] tira error 100/subcódigo 4834011 -- Meta exige declarar "NONE"
        // explícito cuando la campaña no aplica a ninguna categoría especial
        // (vivienda, empleo, crédito, temas sociales/elecciones).
        special_ad_categories: ["NONE"],
        // Presupuesto a nivel de conjunto (no CBO): Facebook exige declarar
        // explícitamente que los conjuntos no comparten presupuesto entre sí.
        is_adset_budget_sharing_enabled: false,
      });

      // optimization_goal=CONVERSIONS sin promoted_object es rechazado por
      // Graph API (exige que el conjunto apunte a un pixel/evento). Mismo
      // fix que en facebook.ts: si hay pixel se manda promoted_object con
      // evento LEAD, si no, se cae a LINK_CLICKS.
      const pixelId = this.tenant.facebook?.pixelId || process.env.FB_PIXEL_ID || "";
      const hasUsablePixel = pixelId ? await this.pixelBelongsToAccount(act, accessToken, pixelId) : false;
      // Mismo bug que en facebook.ts: mandar intereses sin ID real de la
      // taxonomía de Facebook hace que Graph API los ignore en silencio --
      // el borrador salía con audiencia amplia aunque mostrara "intereses
      // aplicados". Se resuelven contra la búsqueda real antes de armar el
      // targeting.
      const resolvedInterests = await resolveInterestIds(accessToken, strategy.interests);
      const adSetBody: Record<string, any> = {
        name: `[BORRADOR] ${product.name} - Conjunto`,
        campaign_id: campaign.id,
        daily_budget: Math.round(strategy.budget * 100),
        targeting: {
          geo_locations: { countries: ["CO"] },
          age_min: strategy.ageMin,
          age_max: strategy.ageMax,
          ...(resolvedInterests.length > 0 ? { flexible_spec: [{ interests: resolvedInterests }] } : {}),
          publisher_platforms: ["facebook", "instagram"],
          // "reels" no es una ubicación válida para facebook_positions (probado
          // en vivo contra la cuenta real: error #100/1815433 "Posición en
          // Facebook no válida"). El equivalente correcto en Facebook es
          // "facebook_reels" -- "reels" a secas sí es válido, pero solo dentro
          // de instagram_positions (línea de abajo).
          facebook_positions: ["feed", "story", "marketplace", "facebook_reels"],
          instagram_positions: ["stream", "story", "reels"],
          // Meta exige declarar explícitamente esta bandera desde que introdujo
          // Advantage+ Audience -- sin ella, /adsets rechaza la creación entera
          // con error #100/1870227 ("Se requiere la marca de audiencia de
          // Advantage"), probado en vivo. En 0 para respetar el targeting
          // explícito (edad/intereses) en vez de dejar que Meta lo expanda
          // automáticamente sin avisar.
          targeting_automation: { advantage_audience: 0 },
        },
        status: "PAUSED",
        start_time: new Date().toISOString(),
        // is_dynamic_creative quedó sacado: era para asset_feed_spec, que no
        // se usa (ver comentario en el creativo más abajo) -- dejarlo activo
        // sin un creativo asset_feed_spec real habría hecho que Meta rechace
        // el anuncio por incompatibilidad entre el adset y el creativo.
      };
      if (hasUsablePixel) {
        adSetBody.billing_event = "IMPRESSIONS";
        // "CONVERSIONS" no es un valor válido de optimization_goal -- el
        // equivalente moderno para optimizar por conversiones de pixel es
        // OFFSITE_CONVERSIONS.
        adSetBody.optimization_goal = "OFFSITE_CONVERSIONS";
        adSetBody.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
        // LEAD no es compatible con el objetivo OUTCOME_SALES -- PURCHASE es
        // el evento que corresponde a una campaña de venta.
        adSetBody.promoted_object = { pixel_id: pixelId, custom_event_type: "PURCHASE" };
      } else {
        // billing_event=LINK_CLICKS lo rechaza Facebook en cuentas nuevas --
        // IMPRESSIONS sí está disponible desde el día uno.
        adSetBody.billing_event = "IMPRESSIONS";
        adSetBody.optimization_goal = "LINK_CLICKS";
        adSetBody.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
      }
      const adSet = await this.fbPost(act, "adsets", accessToken, adSetBody);

      // Imagen: se pasa como URL en `picture` en vez de subir por /adimages
      // (la aplicación no tiene la capacidad adimages - error #3 de Graph API).
      // Facebook descarga y cachea la imagen desde la URL directamente.
      //
      // Advantage+ Creative: mejoras automáticas de imagen vía
      // creative_features_spec. Verificado en vivo contra la cuenta real
      // (act_1545022093928422, generatepreviews) que estos 5 flags son
      // válidos y los acepta la cuenta -- Facebook NO devuelve fotos
      // alternativas para elegir por API, retoca/expande la MISMA foto que
      // se le manda al momento de entregar el anuncio.
      //
      // image_uncrop (expandir/generar fondo) y image_brightness_and_contrast
      // solo se activan si hay una foto REAL del producto (hasRealProductImage):
      // aplicarlas sobre el placeholder gris de texto no tiene nada que
      // "realzar" y puede terminar generando un fondo que se parece todavía
      // menos al curso real -- exactamente el problema de "la foto no
      // corresponde al producto" que se reportó. standard_enhancements,
      // text_optimizations y enhance_cta son retoques seguros (no alteran
      // qué se ve en la imagen) y quedan activos siempre.
      const creativeFeaturesSpec: Record<string, any> = {
        standard_enhancements: { enroll_status: "OPT_IN" },
        text_optimizations: { enroll_status: "OPT_IN" },
        enhance_cta: { enroll_status: "OPT_IN" },
      };
      if (hasRealProductImage) {
        creativeFeaturesSpec.image_touchups = { enroll_status: "OPT_IN" };
        creativeFeaturesSpec.image_brightness_and_contrast = { enroll_status: "OPT_IN" };
        creativeFeaturesSpec.image_uncrop = { enroll_status: "OPT_IN" };
        // Meta genera fondos alternativos con su IA (modelo Emu) sobre la
        // imagen del producto y elige el que mejor convierte -- exactamente
        // la función "Generar variaciones" del Ads Manager, pero automática
        // y sin intervención manual. Solo aplica sobre fotos reales (no
        // placeholders de texto) para que el fondo generado tenga sentido.
        creativeFeaturesSpec.image_background_gen = { enroll_status: "OPT_IN" };
      }
      // asset_feed_spec (Dynamic Creative con varias imágenes) NO se usa acá.
      // Se probó en vivo contra la cuenta real: generatepreviews lo acepta
      // sintácticamente, pero la creación real (/adcreatives) rechaza CUALQUIER
      // URL en asset_feed_spec.images -- probado con placehold.co Y con una
      // imagen de Wikimedia (100% accesible), mismo error los dos:
      // "No se ha podido descargar tu imagen" (subcode 3858258). Confirma que
      // asset_feed_spec.images necesita sí o sí un image_hash real (subido por
      // /adimages), no una URL -- y esa capacidad sigue bloqueada (error #3,
      // igual que el picture normal). Meta A/B-testeando imágenes solo queda
      // bloqueado hasta que se habilite /adimages vía revisión de Meta.
      //
      // Path único: una imagen fija en object_story_spec (funciona, verificado
      // en las pruebas de imágenes reales de esta sesión).
      const creativePayload: Record<string, any> = {
        name: `[BORRADOR] ${product.name} - Creativo`,
        object_story_spec: {
          page_id: this.tenant.facebook?.pageId || process.env.FB_PAGE_ID || "",
          link_data: {
            link: `${getAppUrl()}/p/${product.id}`,
            message: adCopy.primaryText,
            name: adCopy.headline,
            description: adCopy.description,
            call_to_action: { type: strategy.ctaType },
            ...(imageUrl ? { picture: imageUrl } : {}),
          },
        },
        creative_features_spec: creativeFeaturesSpec,
      };
      const creative = await this.fbPost(act, "adcreatives", accessToken, creativePayload);

      const ad = await this.fbPost(act, "ads", accessToken, {
        name: `[BORRADOR] ${product.name}`,
        adset_id: adSet.id,
        creative: { creative_id: creative.id },
        status: "PAUSED",
      });

      logger.info(
        { campaignId: campaign.id, adId: ad.id, product: product.name, strategy: strategy.niche },
        "[AdStrategist] Draft ad created"
      );

      const draftResult: DraftAd = {
        productId: product.id,
        productName: product.name || "",
        strategy,
        primaryText: adCopy.primaryText,
        headline: adCopy.headline,
        description: adCopy.description,
        imageUrl,
        campaignId: campaign.id,
        adSetId: adSet.id,
        adId: ad.id,
        status: "created",
      };

      await this.saveDraftToDb(draftResult);

      return draftResult;
    } catch (err: any) {
      logger.error({ err, productId }, "[AdStrategist] Error creating draft ad");
      const draftResult: DraftAd = {
        productId: product.id,
        productName: product.name || "",
        strategy,
        primaryText: adCopy.primaryText,
        headline: adCopy.headline,
        description: adCopy.description,
        imageUrl,
        campaignId: null,
        adSetId: null,
        adId: null,
        status: "draft",
      };
      await this.saveDraftToDb(draftResult);
      return draftResult;
    }
  }

  async createDraftsForAllProducts(): Promise<{ created: number; failed: number; withoutRealImage: number; drafts: DraftAd[] }> {
    const result = { created: 0, failed: 0, withoutRealImage: 0, drafts: [] as DraftAd[] };

    const accessToken = this.tenant.facebook?.accessToken || process.env.FB_ACCESS_TOKEN || process.env.FB_MESSENGER_PAGE_TOKEN || "";
    const adAccountId = this.tenant.facebook?.adAccountId || process.env.FB_AD_ACCOUNT_ID || "";

    if (!accessToken || !adAccountId) {
      logger.error("[AdStrategist] Facebook not configured");
      return result;
    }

    const activeProducts = await db.select().from(products).where(eq(products.isActive, true));

    for (const p of activeProducts) {
      try {
        const draft = await this.createDraftAd(adAccountId, accessToken, p.id);
        result.drafts.push(draft);
        if (draft.status === "created") result.created++;
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

    return result;
  }

  private async fbPost(adAccount: string, endpoint: string, accessToken: string, body: Record<string, any>): Promise<any> {
    const url = `${FB_GRAPH_URL}/${adAccount}/${endpoint}`;
    const params = new URLSearchParams({ access_token: accessToken });
    const res = await fetch(`${url}?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: any = await res.json();
    if (data.error) throw new Error(`${data.error.message} (código ${data.error.code})`);
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
