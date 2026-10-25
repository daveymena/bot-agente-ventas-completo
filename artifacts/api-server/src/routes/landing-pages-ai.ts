import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, landingPages, products } from "@workspace/db";
import { sendError } from "../lib/error-handler";
import { ERROR_CODES } from "../lib/error-codes";
import type { TenantRequest } from "../lib/tenantManager";
import { callMarketingAI } from "../lib/marketing-team/ai";
import { fotosDelProducto } from "../lib/fotos-de-producto";
import { CONDICIONES_DE_RESPALDO, fraseCostoEnvio, frasePagoEnvio, type CondicionesDelNegocio } from "../lib/modelo-de-negocio";
import { getBusinessContext } from "../lib/business-context";
import { aTextoPlano } from "../lib/texto-plano";
import {
  bloqueDePlantilla,
  casillasQueAplican,
  elegirPlantilla,
  PLANTILLAS,
  tipoDeProducto,
  type Casilla,
  type Plantilla,
} from "../lib/landing/plantillas";
import { elegirFamilia, esFamilia } from "../lib/landing/design-system";
import {
  getOrCreateLanding,
} from "../lib/landingforge-client";

const router = Router();

type LandingSection = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  body?: string;
  cta?: string;
  image?: string;
  /** Galería: las fotos REALES del producto (las del proveedor). */
  images?: string[];
};

/**
 * Lo mínimo aceptable para una casilla que el modelo no escribió.
 *
 * No es una landing de respaldo: es el relleno de UN hueco. Sale solo de datos
 * del producto, sin adjetivos ni promesas, porque una sección obligatoria
 * vacía deja un agujero en la página publicada del dueño.
 */
function rellenoDe(casilla: Casilla, product: any): LandingSection {
  const nombre = product?.name || "el producto";
  const rasgos = Array.isArray(product?.features) && product.features.length
    ? product.features.join(" · ")
    : "";

  const tipo = tipoDeProducto(product?.kind);
  // El verbo del botón no puede ser "comprar" en un servicio ni "acceder" en
  // un físico: es lo que distingue los tres mundos.
  const cta = tipo === "servicio" ? "Agendar" : tipo === "fisico" || tipo === "dropshipping" ? "Pedir ahora" : "Quiero acceso";
  const dudar = tipo === "servicio" ? "Pedir una consulta" : "Quiero saber más";

  const base: Record<string, Partial<LandingSection>> = {
    hero: { title: String(nombre), subtitle: product?.description || "", cta: dudar },
    benefits: { title: "Para qué sirve", body: rasgos || product?.description || "" },
    "how-it-works": { title: tipo === "servicio" ? "Cómo se trabaja" : "Qué incluye", body: rasgos },
    offer: {
      title: "La oferta",
      subtitle: product?.price ? `${product.price} ${product.currency || ""}`.trim() : "",
      cta,
    },
    logistics: { title: "Envío y pago", body: "" },
    faq: { title: "Preguntas frecuentes", body: "" },
    cta: { title: "Da el siguiente paso", cta },
  };

  return { id: casilla.type, type: casilla.type, title: "", ...base[casilla.type] } as LandingSection;
}

/**
 * Encaja lo que devolvió el modelo en la plantilla.
 *
 * ── Por qué no se toma la lista del modelo tal cual ───────────────────────
 *
 * Antes se filtraban las secciones por `type` válido y se devolvían en el orden
 * en que el modelo las hubiera escrito. Eso dejaba pasar los tres fallos que
 * arruinaban la página: faltaba una sección obligatoria, sobraba una que el
 * producto no puede sostener, o el precio aparecía antes que los beneficios.
 *
 * Acá se recorre la PLANTILLA, no la respuesta. Cada casilla busca su sección
 * por `type`; si el modelo la escribió, se usa su texto; si no, se rellena con
 * datos del producto. El orden y el conjunto salen de la plantilla siempre, así
 * que la página no puede quedar coja ni desordenada por más raro que conteste
 * el modelo.
 *
 * Lo que el modelo trajo de más se descarta: si no está en la plantilla, es una
 * sección que este producto no tiene con qué llenar.
 */
/**
 * Las fotos REALES del producto, en orden: la principal y las del proveedor.
 *
 * Hasta hoy cada sección mandaba un "imagePrompt" a Pollinations con estilo
 * "neon dark mode SaaS 3D render": una faja salía como una mujer en bikini
 * generada, el antes/después era la misma imagen duplicada con marca de agua,
 * y las cinco fotos reales que Dropi trae de cada producto no se usaban
 * (medido el 12-09-2026 en la landing 4). Una landing de un producto físico
 * se hace con las fotos del producto. La IA queda solo como respaldo cuando
 * no hay ninguna foto real.
 */
export function imagenesRealesDe(product: any): string[] {
  // Galería del dueño + Dropi/Woo + principal, en una sola lista (lib/fotos-de-producto).
  return fotosDelProducto(product, process.env.APP_URL || "https://ventasproia.com", 8);
}

export function normalizeSections(input: unknown, product: any, casillas: Casilla[], condiciones?: CondicionesDelNegocio | null): LandingSection[] {
  const reales = imagenesRealesDe(product);
  const esFisico = ["fisico", "dropshipping"].includes(tipoDeProducto(product?.kind));
  // Un "antes/después" sin fotos reales de antes y después es una imagen
  // inventada con una persona inventada: en un físico no va. (En digital la
  // plantilla lo usa solo como texto.)
  const casillasUtiles = esFisico ? casillas.filter((c) => c.type !== "before-after") : casillas;
  // La foto que le toca a cada sección, rotando las reales: hero la principal.
  const realPara: Record<string, string | undefined> = {
    hero: reales[0], benefits: reales[1] ?? reales[0], "how-it-works": reales[2] ?? reales[1], offer: reales[0],
    comparison: reales[1], authority: undefined, testimonials: undefined, logistics: undefined, faq: undefined, cta: reales[0],
  };
  const delModelo = Array.isArray(input)
    ? input.filter((s: any) => s && typeof s === "object" && typeof s.type === "string")
    : [];
  const usadas = new Set<number>();

  const salida: LandingSection[] = casillasUtiles.map((casilla, i) => {
    const idx = delModelo.findIndex((s: any, j: number) => !usadas.has(j) && String(s.type) === casilla.type);
    const relleno = rellenoDe(casilla, product);
    const s: any = idx === -1 ? {} : delModelo[idx];
    if (idx !== -1) usadas.add(idx);

    // Foto real primero. Una URL que trajo el modelo solo vale si es una
    // imagen real (http y no un generador). Pollinations queda como último
    // respaldo, con estilo de FOTO DE PRODUCTO, no de render 3D neón.
    let image: string | undefined = realPara[casilla.type];
    const delModeloUrl = typeof s.image === "string" && /^https?:\/\//.test(s.image) && !/pollinations/i.test(s.image) ? s.image : undefined;
    if (!image && delModeloUrl) image = delModeloUrl;
    if (!image && reales.length === 0 && s.imagePrompt && ["hero", "benefits", "offer"].includes(casilla.type)) {
      const enc = encodeURIComponent(`${String(s.imagePrompt)}, clean product photography, studio light, white background, no people, no text`);
      image = `https://image.pollinations.ai/prompt/${enc}?width=1080&height=720&nologo=true`;
    }
    // La logística NO la escribe el modelo: no conoce las condiciones y
    // deja huecos ("[El negocio debe completar aquí los detalles de envío]",
    // 12-09-2026). Sale del perfil del negocio, que sí las tiene.
    let body = s.body ? aTextoPlano(s.body) : relleno.body;
    if (casilla.type === "logistics" && esFisico) {
      const c = condiciones ?? CONDICIONES_DE_RESPALDO;
      // Lo que el negocio no configuró no se escribe (ver CONDICIONES_DE_RESPALDO).
      const llega = [c.envio.plazo && `Llega en ${c.envio.plazo}`, c.envio.cobertura].filter(Boolean).join(", ");
      body = [
        `${fraseCostoEnvio(c)}.`,
        `${frasePagoEnvio(c)}.`,
        llega ? `${llega}.` : "",
        "Antes de despachar te confirmamos los datos de envío por WhatsApp.",
      ].filter(Boolean).join("\n");
    }
    return {
      // El id sale de la casilla, no del modelo: el editor los usa como clave y
      // dos secciones con el mismo id se pisan al guardar.
      id: `${casilla.type}-${i + 1}`,
      type: casilla.type,
      title: aTextoPlano(s.title || relleno.title || ""),
      subtitle: s.subtitle ? aTextoPlano(s.subtitle) : relleno.subtitle,
      body,
      cta: s.cta ? String(s.cta) : relleno.cta,
      image,
    };
  });

  // Galería con las fotos reales, después de los beneficios: en un físico es
  // lo que más se mira, y hasta hoy esas fotos no aparecían en ningún lado.
  if (esFisico && reales.length >= 2) {
    const pos = salida.findIndex((x) => x.type === "benefits");
    salida.splice(pos === -1 ? 1 : pos + 1, 0, {
      id: "gallery-1", type: "gallery", title: "Así es", subtitle: "Fotos reales del producto", images: reales.slice(0, 6),
    });
  }
  return salida;
}

function normalizeStrategy(strategy: any, product: any, sourceAd: any) {
  return {
    objective: strategy?.objective || "sales",
    language: strategy?.language || "es",
    country: strategy?.country || "CO",
    currency: strategy?.currency || product?.currency || "COP",
    avatar: strategy?.avatar || "Cliente ideal definido a partir de los datos disponibles del producto.",
    awareness: strategy?.awareness || "problem-aware",
    pain: strategy?.pain || "",
    desire: strategy?.desire || "",
    mechanism: strategy?.mechanism || "",
    promise: strategy?.promise || "",
    objections: Array.isArray(strategy?.objections) ? strategy.objections : [],
    angle: strategy?.angle || "beneficio principal",
    sourceAd: sourceAd || null,
  };
}

/**
 * Genera la landing con el generador local (sin LandingForge). Es lo que usa
 * la ruta /generate y también Atlas (`landing_crear`): antes la lógica vivía
 * adentro del handler y Atlas no podía crear landings.
 */
export async function generarLandingLocal(opts: {
  tenantId: number; product: any; brandName?: string | null; plantillaId?: string | null;
  sourceAd?: any; language?: string; country?: string; objective?: string; contexto?: string;
  /** Familia elegida por el admin: manda sobre la sugerida. */
  familia?: string | null;
  /** Modelo de composición puesto a mano (los ejemplos por estilo, el estudio). */
  modelo?: string | null;
  /** true = pedir además el bloque `estilo` (copy extra de la plantilla COD). */
  estiloExtras?: boolean;
}) {
  const { tenantId, product } = opts;
  const productId = Number(product.id);
  const sourceAd = opts.sourceAd || null;
  const language = String(opts.language || "es");
  const country = String(opts.country || "CO");
  const objective = String(opts.objective || "sales");
    const promptProduct = {
      id: product.id, name: product.name, description: product.description, price: product.price,
      currency: product.currency, kind: product.kind, imageUrl: product.imageUrl, highlight: product.highlight,
      features: product.features, paymentLink: product.paymentLink, deliveryLink: product.deliveryLink,
    };

    const negocio = { brandName: opts.brandName };
    const plantilla = elegirPlantilla(product as any, opts.plantillaId, negocio);
    const casillas = casillasQueAplican(plantilla, product as any, negocio);

    // ── Para quién es el producto: manda sobre el COPY y el COLOR ──────────
    // Se calcula UNA vez acá, antes del modelo, para que el copy se escriba
    // para el público correcto (mujer → femenino, hombre → sobrio, unisex →
    // neutro, niños → seguro/alegre). Mismo criterio que el Landing Studio.
    const { publicoDelProducto, paletaDelPublico } = await import("../lib/landing/publico-del-producto");
    const lecturaPublico = publicoDelProducto({ nombre: product.name, categoria: (product as any)?.category, descripcion: product.description, caracteristicas: (product as any)?.features, tipo: product.kind });
    const paletaPublico = paletaDelPublico(lecturaPublico.publico);
    const bloquePublico = paletaPublico
      ? `\n\nPÚBLICO DEL PRODUCTO (manda sobre el tono y el lenguaje del copy): ${lecturaPublico.porque}\n- Tono visual y verbal: ${paletaPublico.tono}\n- Cómo hablarle: ${paletaPublico.lenguaje}\n- NO uses: ${paletaPublico.evitar}`
      : "";

    // 2.200 tokens no alcanzaban para 7 secciones con ítems y una FAQ con
    // respuestas: el JSON llegaba cortado, `tryParseJson` rescataba un objeto
    // parcial sin `sections`, y la landing salía entera de relleno con
    // generatedBy="ai" (12-09-2026, faja). Más tope, y abajo se verifica que
    // de verdad haya secciones antes de llamarlo "ai".
    const llamar = () => callMarketingAI<any>({
      tenantId,
      json: true,
      maxTokens: 4000,
      systemPrompt: `${bloqueDePlantilla(plantilla, product as any, negocio)}\nEres el Lead Copywriter de VentasPro, experto en Respuesta Directa y Psicología de Ventas. Tu objetivo es crear landings que conviertan visitantes en clientes usando ganchos emocionales y beneficios tangibles, sin inventar datos. Devuelve SOLO JSON válido.

REGLAS DE COPYWRITING PROFESIONAL:
1. TITULARES DE IMPACTO: No describas el producto. Ataca el DOLOR real o la PROMESA máxima. Ejemplo: No pongas "Curso de IA", pon "¿Cansado de perder 4 horas al día en tareas repetitivas?".
2. BENEFICIOS > CARACTERÍSTICAS: No digas "Tiene 10 módulos", di "Aprende a automatizar tu flujo de trabajo en 3 días".
3. PRUEBA Y AUTORIDAD: Usa los hechos del producto para generar confianza. Si hay datos reales, ponlos al frente.
4. LLAMADO A LA ACCIÓN (CTA) CLARO: El botón debe ser una promesa de valor, no una orden. Ejemplo: "Quiero mi acceso ahora" en vez de "Comprar".
5. TONO: Profesional, persuasivo, humano y directo. Evita adjetivos vacíos ("increíble", "único", "premium").

ESTRUCTURA AIDA:
- ATENCIÓN: Hero con el problema/deseo central.
- INTERÉS: Beneficios que transforman la vida del cliente.
- DESEO: El producto como el único vehículo para lograr el resultado.
- ACCIÓN: Cierre fuerte con urgencia basada en el valor.

Escribe en ${language} para ${country}.${bloquePublico}${opts.contexto ? `\n\n${opts.contexto}` : ""}${
        opts.estiloExtras
          ? `\n\nBLOQUE "estilo" (copy extra de la plantilla COD; NO inventes cifras, garantías, descuentos ni plazos que no estén en los datos del producto): announce = franja superior de 6 a 9 palabras con la oferta; heroBadge = sello corto sobre la foto (ej. "Llega en 48h"), vacío si no hay dato real; painPoints = 3 a 5 problemas del cliente que este producto resuelve, UNA LÍNEA por problema; useCasesTitle = título de la galería de fotos; useCases = un pie de foto corto por foto, en orden; comparison = solo si aporta, { titulo, sinProducto: [3 ítems], conProducto: [3 ítems] } cualitativo sin cifras.`
          : ""
      }`,
      userPrompt: JSON.stringify({
        tarea: "crear_landing",
        objetivo: objective,
        producto: promptProduct,
        anuncio_fuente: sourceAd,
        formato: {
          name: "string",
          strategy: { avatar: "string", awareness: "string", pain: "string", desire: "string", mechanism: "string", promise: "string", objections: ["string"], angle: "string", objective, language, country, currency: product.currency },
          sections: [{ id: "string", type: "hero|benefits|offer|before-after|comparison|authority|testimonials|how-it-works|logistics|faq|cta", title: "string", subtitle: "string", body: "string: en benefits, how-it-works, comparison y offer va UNA LÍNEA POR ÍTEM (3 a 6 ítems cortos y concretos, sin adjetivos de relleno); en faq va UNA LÍNEA POR PREGUNTA con la respuesta después de ' | ' (ej: '¿Cuánto tarda en llegar? | Entre 3 y 5 días hábiles'); en hero y cta, un párrafo corto", cta: "string: el mismo verbo en hero, offer y cta", imagePrompt: "SOLO si el producto no tiene foto: descripción en inglés (max 15 palabras) de una FOTO DE PRODUCTO limpia, sin personas ni texto" }],
          design: { tone: "string", primary: "string", background: "string", radius: "string" },
          ...(opts.estiloExtras
            ? {
                estilo: {
                  announce: "string",
                  heroBadge: "string",
                  painPoints: ["string"],
                  useCasesTitle: "string",
                  useCases: ["string"],
                  comparison: { titulo: "string", sinProducto: ["string"], conProducto: ["string"] },
                },
              }
            : {}),
          source: { type: sourceAd ? "facebook-ad" : "product", reference: sourceAd || null }
        }
      }),
    });

    let crudo = await llamar();
    // El modelo a veces envuelve la respuesta: { landing: {...} }, { data: {...} }
    // o devuelve el MISMO sobre que recibió. Se busca `sections` en cualquier
    // nivel para no caer a la landing de relleno por un envoltorio distinto.
    const desenvolver = (r: any, nivel = 0): any => {
      if (!r || typeof r !== "object" || Array.isArray(r) || nivel > 4) return null;
      if (Array.isArray(r.sections) && r.sections.length) return r;
      for (const v of Object.values(r)) {
        const hallado = desenvolver(v, nivel + 1);
        if (hallado) return hallado;
      }
      return null;
    };
    let result = desenvolver(crudo);
    if (!result) {
      console.log(`[Landing] el modelo no devolvió secciones para el producto ${productId}. Saliendo con fallback.`);
    }
    const conSecciones = !!result && Array.isArray(result.sections) && result.sections.length > 0;

    const strategy = normalizeStrategy(result?.strategy, product, sourceAd);
    const sections = normalizeSections(result?.sections, product, casillas, (await getBusinessContext(tenantId).catch(() => null))?.condiciones);
    // Familia visual sugerida por las señales del producto (rubro → precio → tipo).
    // El admin puede pisarla después en el Landing Studio; acá sale profesional
    // por defecto en vez de caer siempre a ecommerce.
    const sugerida = elegirFamilia({
      categoria: (product as any)?.category, nombre: product.name, descripcion: product.description,
      tipo: product.kind, precio: Number(product.price),
    });
    const design: any = { ...(result?.design || { tone: "direct-response premium", primary: "#111827", background: "#ffffff", radius: "14px" }), familia: (opts.familia && esFamilia(opts.familia) ? opts.familia : null) || (result?.design as any)?.familia || sugerida.familia };
    // ── La COMPOSICIÓN: qué MODELO de página es esta landing ───────────────
    // Cada generación NUEVA lleva su modelo + semilla: dropshipping →
    // tienda-directa/advertorial (según la evidencia del tipo), digital →
    // digital-rapida si es barata, servicio → servicio-local... Y "otra
    // composición" en el editor = otra semilla. Ya publicadas se quedan las
    // suyas (el render sin modelo sale clasica).
    try {
      const { elegirComposicion, semillaNueva, tipoDeNegocio, esModelo } = await import("../lib/landing/composicion");
      const tipoNeg = tipoDeNegocio(product.kind, ["fisico", "dropshipping", "physical"].includes(String(product.kind)));
      const semillaNuevaValor = semillaNueva();
      // El modelo PUESTO por el admin (los ejemplos por estilo del panel, el
      // estudio) manda sobre el sorteo con evidencia; sin él, la evidencia
      // elige según el tipo de negocio.
      const modeloPedido = opts.modelo && esModelo(opts.modelo) ? opts.modelo : undefined;
      const comp = elegirComposicion({ modelo: modeloPedido, semilla: semillaNuevaValor, familia: design.familia, tipo: tipoNeg, precio: product.price });
      design.modelo = comp.modelo;
      design.semilla = semillaNuevaValor;
      design.composicionPorque = comp.porque;
    } catch {
      // Sin composición disponible: la landing sale clásica, como siempre.
    }
    // Para quién es el producto manda sobre el color (unisex → neutros,
    // mujer → femeninos, hombre → masculinos, niños → infantiles). Ya se
    // calculó arriba (paletaPublico) para el copy; acá solo se aplica.
    if (paletaPublico) Object.assign(design, { primary: paletaPublico.acento, accent: paletaPublico.secundario, tinte: paletaPublico.tinte, publico: lecturaPublico.publico });
    const name = String(result?.name || `Landing · ${product.name}`);

    return { ok: true as const, generatedBy: conSecciones ? "ai" : "fallback", name, productId, strategy, sections, design,
      estilo: opts.estiloExtras ? (result?.estilo && typeof result.estilo === "object" ? result.estilo : null) : null,
      plantilla: { id: plantilla.id, nombre: plantilla.nombre, para: plantilla.para, cuando: plantilla.cuando }, source: sourceAd ? { type: "facebook-ad", data: sourceAd } : { type: "product", productId } };
}

router.post("/generate", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const productId = Number(req.body?.productId);
    if (!Number.isFinite(productId)) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);

    const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
    if (!product) return sendError(res, ERROR_CODES.PRODUCT_NOT_FOUND);

    const sourceAd = req.body?.sourceAd || null;
    const language = String(req.body?.language || "es");
    const country = String(req.body?.country || "CO");
    const objective = String(req.body?.objective || "sales");

    // ── Intentar LandingForge primero (generación profesional estilo Magic) ──
    const LF_ENABLED = !!process.env.LANDINGFORGE_URL;
    if (LF_ENABLED) {
      try {
        const lfResult = await generateLandingViaForge(product, { language, country, objective });
        if (lfResult.ok) {
          // Mapear section types de LandingForge a tipos del bot para el editor
          const lfToBotType: Record<string, string> = {
            hero_hook: "hero", hero: "hero", trust_bar: "benefits",
            problem_agitation: "benefits", before_after: "before-after",
            benefits_grid: "benefits", unique_mechanism: "benefits",
            how_to_use: "how-it-works", specs_included: "how-it-works",
            comparison_table: "benefits", testimonials: "testimonials",
            offer_cod: "offer", shipping_guarantee: "logistics",
            faq: "faq", final_cta: "cta",
          };
          const mappedSections = lfResult.sections.map((s: any) => ({
            ...s,
            type: lfToBotType[s.type] || s.type,
          }));
          // Normalizar con la plantilla local para que el editor pueda usarlo
          const plantilla = elegirPlantilla(product as any, null, { brandName: req.tenant?.brandName });
          const casillas = casillasQueAplican(plantilla, product as any, { brandName: req.tenant?.brandName });
          const normalizedSections = normalizeSections(mappedSections, product, casillas, (await getBusinessContext(tenantId).catch(() => null))?.condiciones);

          return res.json({
            ok: true,
            generatedBy: "landingforge",
            name: lfResult.name,
            productId,
            landingforgeUrl: lfResult.url,
            landingforgeLandingId: lfResult.landingId,
            strategy: lfResult.strategy,
            sections: normalizedSections,
            design: lfResult.design,
            plantilla: { id: plantilla.id, nombre: plantilla.nombre, para: plantilla.para, cuando: plantilla.cuando },
            source: sourceAd ? { type: "facebook-ad", data: sourceAd } : { type: "product", productId },
          });
        }
        // Si LandingForge falló, continuar con el generador local
        console.log(`[LandingForge] Falló para producto ${productId}, usando generador local: ${lfResult.error}`);
      } catch (lfErr) {
        console.log(`[LandingForge] Error para producto ${productId}, usando generador local: ${(lfErr as Error).message}`);
      }
    }

    // ── Fallback: generador local existente ──────────────────────────────────
    return res.json(await generarLandingLocal({
      tenantId, product, brandName: req.tenant?.brandName, plantillaId: req.body?.plantilla, sourceAd, language, country, objective,
      familia: req.body?.familia || null,
      // El modelo de composición puesto a mano: el panel pide un estilo
      // concreto (advertorial, tienda-directa...) y este respeto ese pedido.
      modelo: req.body?.modelo || null,
    }));
  } catch (e) {
    return next(e);
  }
});

/**
 * Genera una landing profesional via LandingForge (estilo Magic/eCom Magic).
 *
 * Usa el pipeline completo del cliente: crear producto → brief → landing →
 * generar secciones → publicar. Si LandingForge falla en cualquier paso,
 * devuelve ok:false para que el caller use el generador local.
 *
 * Las secciones se normalizan con normalizeSections() para que coincidan
 * con la plantilla del bot (hero, benefits, offer, etc.).
 */
async function generateLandingViaForge(
  product: any,
  opts: { language: string; country: string; objective: string },
): Promise<{
  ok: boolean; name: string; url: string; landingId: string;
  strategy: any; sections: any[]; design: any; error?: string;
}> {
  // Construir URL del producto para LandingForge
  const productUrl = product.paymentLink || product.checkoutUrl || `https://ventasproia.com/tienda/producto/${product.id}`;

  // Usar el pipeline completo del cliente (incluye dedup de landings existentes)
  // Un servicio va como servicio (página de agenda), no como tienda: ver
  // lineaDeProducto y la vía de Atlas (landing_forge_crear).
  const { lineaDeProducto } = await import("../lib/taxonomia");
  const result = await getOrCreateLanding(
    product.name,
    productUrl,
    lineaDeProducto(product) === "servicio" ? "service" : product.kind === "physical" ? "physical" : "digital",
    {
      description: product.description || "",
      price: product.price ? String(product.price) : undefined,
      currency: product.currency || "COP",
      category: product.category || undefined,
      checkoutUrl: product.paymentLink || undefined,
      tenantId: product.tenantId ?? null,
      producto: product,
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      name: product.name,
      url: "",
      landingId: result.landingId,
      strategy: null,
      sections: [],
      design: null,
      error: result.error,
    };
  }

  // Construir strategy y design genéricos (LandingForge genera su propio contenido)
  const strategy = {
    objective: opts.objective,
    language: opts.language,
    country: opts.country,
    currency: product.currency || "COP",
    avatar: "",
    awareness: "problem-aware",
    pain: "",
    desire: "",
    mechanism: "",
    promise: "",
    objections: [],
    angle: "",
    sourceAd: null,
  };

  const design = {
    tone: "professional",
    primary: "#111827",
    background: "#ffffff",
    radius: "14px",
  };

  // Mapear secciones del formato LandingForge al formato del bot
  const sections = (result as any).sections?.map((s: any, i: number) => ({
    id: s.id || `section-${i + 1}`,
    type: s.sectionType || "hero",
    title: s.copy?.title || "",
    subtitle: s.copy?.subtitle || "",
    body: s.copy?.body || "",
    cta: s.copy?.cta || "",
    image: s.imageUrl || undefined,
  })) || [];

  return {
    ok: true,
    name: product.name,
    url: result.url,
    landingId: result.landingId,
    strategy,
    sections,
    design,
  };
}

router.post("/:id/command", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);
    const instruction = String(req.body?.instruction || "").trim();
    if (!instruction) return res.status(400).json({ message: "La instrucción está vacía." });

    // Calcula, APLICA y GUARDA (antes solo devolvía operaciones que nadie
    // aplicaba y la pantalla decía "Cambio aplicado").
    const { editarLanding } = await import("../lib/landing/editar");
    const r = await editarLanding(tenantId, id, instruction, req.body?.selectedSectionId || null);
    if (!r.ok) return res.status(422).json({ ok: false, message: r.message, operations: [] });
    return res.json({ ok: true, message: `${r.message} (${r.aplicadas.join(", ")})`, operations: r.aplicadas });
  } catch (e) {
    return next(e);
  }
});

/**
 * Las plantillas que le sirven a un producto.
 *
 * El panel las usa para dejar que el dueño elija otra estructura; se le manda
 * `?productId=` para no ofrecerle una plantilla con logística para un curso.
 * Sin producto, van todas.
 */
router.get("/plantillas", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);

    const productId = Number(req.query?.productId);
    let para: string | null = null;
    let sugerida: string | null = null;

    if (Number.isFinite(productId)) {
      const [product] = await db.select().from(products)
        .where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
      if (product) {
        para = tipoDeProducto(product.kind);
        sugerida = elegirPlantilla(product as any, null, { brandName: req.tenant?.brandName }).id;
      }
    }

    const lista = PLANTILLAS.filter((p) => !para || p.para === para).map((p: Plantilla) => ({
      id: p.id, nombre: p.nombre, para: p.para, cuando: p.cuando,
      secciones: p.casillas.map((c) => c.type),
    }));

    return res.json({ ok: true, sugerida, plantillas: lista });
  } catch (e) {
    return next(e);
  }
});

export default router;
