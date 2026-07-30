import { logger } from "./logger";
import { db, products } from "@workspace/db";
import { eq } from "drizzle-orm";
import { tenantManager, type TenantContext } from "./tenantManager";

const FB_GRAPH_URL = "https://graph.facebook.com/v21.0";

/**
 * Convierte una ruta relativa del catálogo (/uploads/products/42.jpg) en URL
 * pública absoluta -- Facebook descarga la imagen desde sus servidores, una
 * ruta relativa no le sirve. Mismo helper que facebook-marketplace.ts.
 */
function absoluteImageUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const appUrl = process.env.APP_URL || "https://tecnovariedades.easypanel.host";
  if (!/^https:\/\//i.test(appUrl)) return null;
  return `${appUrl.replace(/\/+$/, "")}/${pathOrUrl.replace(/^\/+/, "")}`;
}

/** Busca cada nombre de interés en la taxonomía real de intereses de
 * Facebook (Graph API /search?type=adinterest) y devuelve solo los que
 * existen, con su ID verdadero. Un interés mandado sin ID (o con uno
 * inventado) no segmenta nada -- Graph API lo ignora en silencio y el
 * anuncio sale con audiencia amplia aunque el panel muestre nombres de
 * "intereses aplicados". Compartido entre FacebookService (Anuncios) y
 * AdStrategist (Borradores), que tenían el mismo bug cada uno por su lado. */
export async function resolveInterestIds(accessToken: string, names: string[]): Promise<Array<{ id: string; name: string }>> {
  const resolved: Array<{ id: string; name: string }> = [];
  for (const name of names) {
    try {
      const params = new URLSearchParams({ type: "adinterest", q: name, limit: "1", access_token: accessToken });
      const res = await fetch(`${FB_GRAPH_URL}/search?${params}`, { signal: AbortSignal.timeout(10000) });
      const data: any = await res.json();
      const match = data?.data?.[0];
      if (match?.id) resolved.push({ id: match.id, name: match.name || name });
    } catch (err: any) {
      logger.warn({ err, name }, "[Facebook] No se pudo resolver el interés en la taxonomía de Facebook");
    }
  }
  return resolved;
}

export interface FacebookConfig {
  accessToken: string;
  pixelId: string;
  catalogId: string;
  pageId: string;
  adAccountId: string;
}

export interface FbTargeting {
  geoLocations?: { countries?: string[]; cities?: string[]; radius?: number };
  ageMin?: number;
  ageMax?: number;
  genders?: number[];
  interests?: Array<{ id: string; name: string }>;
  customAudiences?: string[];
  placements?: {
    facebook?: string[];
    instagram?: string[];
    messenger?: string[];
  };
}

export interface FbAudienceSuggestion {
  description: string;
  targeting: FbTargeting;
  rationale: string;
}

export interface FbCampaignResult {
  campaignId: string;
  adSetId: string;
  adId: string;
  imageUrl: string;
  adCopy: { primaryText: string; headline: string; description: string };
  status: string;
  previewUrl: string;
}

export class FacebookService {
  private config: FacebookConfig;
  private tenant: TenantContext;

  constructor(tenant?: TenantContext) {
    this.tenant = tenant || tenantManager.getDefaultTenant();
    const fb = this.tenant.facebook || {};
    this.config = {
      accessToken: fb.accessToken || process.env.FB_ACCESS_TOKEN || process.env.FB_MESSENGER_PAGE_TOKEN || "",
      pixelId: fb.pixelId || process.env.FB_PIXEL_ID || "",
      catalogId: fb.catalogId || process.env.FB_CATALOG_ID || "",
      pageId: fb.pageId || process.env.FB_PAGE_ID || "",
      adAccountId: fb.adAccountId || process.env.FB_AD_ACCOUNT_ID || "",
    };
  }

  isConfigured(): boolean {
    return !!this.config.accessToken;
  }

  async validate(): Promise<{ ok: boolean; message: string }> {
    if (!this.isConfigured()) return { ok: false, message: "Token no configurado" };
    try {
      const res = await fetch(`${FB_GRAPH_URL}/me?access_token=${this.config.accessToken}`, { signal: AbortSignal.timeout(10000) });
      const d = await res.json();
      return d.id
        ? { ok: true, message: `Conectado como ${d.name || d.id}` }
        : { ok: false, message: d.error?.message || "Token inválido" };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  }

  /**
   * Sugiere una audiencia objetivo para un producto usando IA + categorías por defecto.
   */
  async suggestAudience(productId: number): Promise<FbAudienceSuggestion | null> {
    try {
      const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      if (!product) throw new Error("Producto no encontrado");

      const cat = (product.category || "").toLowerCase();
      const name = product.name || "";

      // Audiencias por defecto según categoría
      const defaults: Record<string, { ages: number[]; genders: number[]; description: string; interests: string[] }> = {
        "programación": {
          ages: [18, 45], genders: [1, 2],
          description: "Jóvenes y adultos interesados en tecnología, desarrollo web y programación.",
          interests: ["Programación informática", "Desarrollo web", "Tecnología", "Informática", "Ciberseguridad"]
        },
        "diseño": {
          ages: [18, 45], genders: [1, 2],
          description: "Creativos, diseñadores gráficos y profesionales del diseño digital.",
          interests: ["Adobe Photoshop", "Diseño gráfico", "Adobe Illustrator", "Canva", "Arte digital"]
        },
        "marketing": {
          ages: [20, 55], genders: [1, 2],
          description: "Emprendedores, dueños de negocio y profesionales del marketing digital.",
          interests: ["Marketing digital", "Facebook Ads", "Instagram", "Emprendimiento", "Redes sociales"]
        },
        "idiomas": {
          ages: [15, 60], genders: [1, 2],
          description: "Estudiantes y profesionales que quieren aprender nuevos idiomas.",
          interests: ["Aprender inglés", "Idiomas", "Viajes", "Intercambio cultural", "Educación"]
        },
        "fitness": {
          ages: [18, 50], genders: [1, 2],
          description: "Personas interesadas en salud, ejercicio y bienestar físico.",
          interests: ["Fitness", "Ejercicio", "Yoga", "Pérdida de peso", "Salud y bienestar"]
        },
        "música": {
          ages: [15, 45], genders: [1, 2],
          description: "Músicos, productores y aficionados a la producción musical.",
          interests: ["Guitarra", "Producción musical", "Música", "DJ", "Instrumentos musicales"]
        },
        "tecnología": {
          ages: [18, 50], genders: [1, 2],
          description: "Entusiastas de la tecnología, reparación y mantenimiento de dispositivos.",
          interests: ["Tecnología", "Reparación de celulares", "PlayStation", "PC", "Electrónica"]
        },
        "fotografía": {
          ages: [18, 50], genders: [1, 2],
          description: "Fotógrafos aficionados y profesionales buscando mejorar sus habilidades.",
          interests: ["Fotografía", "Edición de fotos", "Cámaras", "Instagram", "Arte visual"]
        },
      };

      const matched = Object.entries(defaults).find(([k]) => cat.includes(k));
      const fallback = { ages: [18, 55], genders: [1, 2], description: "Público general colombiano interesado en cursos digitales.", interests: [] as string[] };
      const profile = matched ? matched[1] : fallback;

      const targeting: FbTargeting = {
        ageMin: profile.ages[0],
        ageMax: profile.ages[1],
        genders: profile.genders,
        geoLocations: { countries: ["CO"] },
        placements: {
          facebook: ["feed", "story", "marketplace"],
          instagram: ["stream", "story", "reels"],
        },
      };

      if (profile.interests && profile.interests.length > 0) {
        targeting.interests = profile.interests.map(name => ({ id: "", name }));
      }

      // Intentar generar audiencia con IA
      const aiAudience = await this.generateAudienceWithAI(product, profile);
      const result = aiAudience || {
        description: profile.description,
        targeting,
        rationale: `Perfil por defecto para categoría "${product.category || "General"}": ${profile.description}`,
      };

      // Bug real: tanto los intereses por categoría como los que genera la
      // IA salían con id: "" -- Facebook exige el ID numérico de su propia
      // taxonomía de intereses para segmentar, un nombre suelto no sirve y
      // lo ignora en silencio. El anuncio se creaba igual pero SIN
      // segmentar por interés (audiencia amplia), aunque el panel mostrara
      // nombres de intereses "aplicados". Se resuelven acá contra la Graph
      // API de búsqueda de intereses antes de devolver la sugerencia.
      if (result.targeting.interests?.length) {
        result.targeting.interests = await resolveInterestIds(this.config.accessToken, result.targeting.interests.map(i => i.name));
      }

      return result;
    } catch (err: any) {
      logger.error({ err, productId }, "[Facebook] Error sugiriendo audiencia");
      return null;
    }
  }

  private async generateAudienceWithAI(product: any, profile: { ages: number[]; description: string }): Promise<FbAudienceSuggestion | null> {
    const priceFormatted = Number(product.price).toLocaleString("es-CO");
    try {
      const prompt = `Eres un experto en Facebook Ads para Colombia.
Basado en el siguiente producto digital, sugiere la audiencia objetivo ideal para un anuncio.

Producto: ${product.name}
Precio: $${priceFormatted} COP
Categoría: ${product.category || "General"}
Descripción: ${(product.description || "").substring(0, 200)}

Perfil base sugerido: ${profile.description}

Responde SOLO con este JSON exacto:
{
  "description": "Descripción del perfil de audiencia (máx 200 caracteres)",
  "targeting": {
    "ageMin": EDAD_MINIMA,
    "ageMax": EDAD_MAXIMA,
    "genders": [1, 2],
    "interests": ["INTERES_1", "INTERES_2", "INTERES_3"]
  },
  "rationale": "Por qué esta audiencia es ideal para este producto"
}`;

      const res = await fetch(`${process.env.OPENCODE_API_URL || "https://api.freemodel.dev/v1"}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENCODE_API_KEY || ""}`,
        },
        body: JSON.stringify({
          model: process.env.OPENCODE_MODEL || "gpt-5.5",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 400,
        }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          description: parsed.description || profile.description,
          targeting: {
            ageMin: parsed.targeting?.ageMin || profile.ages[0],
            ageMax: parsed.targeting?.ageMax || profile.ages[1],
            genders: parsed.targeting?.genders || [1, 2],
            interests: (parsed.targeting?.interests || []).map((name: string) => ({ id: "", name })),
            geoLocations: { countries: ["CO"] },
            placements: {
              facebook: ["feed", "story", "marketplace"],
              instagram: ["stream", "story", "reels"],
            },
          },
          rationale: parsed.rationale || profile.description,
        };
      }
    } catch (_) {}
    return null;
  }

  /**
   * Crea un anuncio completo en Facebook para un producto:
   * genera copy con IA, sube imagen, crea campaña + conjunto + anuncio.
   * Acepta targeting personalizado (ciudad, edad, intereses, etc.).
   */
  async createAdForProduct(
    productId: number,
    dailyBudget: number = 5000,
    startDate?: string,
    targeting?: FbTargeting,
  ): Promise<FbCampaignResult | null> {
    if (!this.config.adAccountId || !this.config.accessToken) return null;

    try {
      const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      if (!product) throw new Error("Producto no encontrado");

      const adAccount = `act_${this.config.adAccountId}`;
      const campaignName = `${product.name} - ${new Date().toLocaleDateString("es-CO")}`;

      const adCopy = await this.generateAdCopy(product);

      // Bug de capacidad: /{adAccount}/adimages requiere la capacidad
      // "adimages" que esta aplicación no tiene (Graph API error #3:
      // "Application does not have the capability to make this API call").
      // En vez de subir la imagen primero para obtener un hash, se pasa la
      // URL absoluta de la imagen directamente en el campo `picture` del
      // link_data de abajo. Facebook descarga, cachea y muestra la imagen
      // desde ahí sin necesidad del endpoint de adimages.
      //
      // La columna es imageUrl (camelCase, Drizzle) -- leerla como
      // product.image_url daba siempre undefined y el anuncio SIEMPRE salía
      // con imagen placeholder genérica, nunca la foto real del producto.
      // Además Facebook descarga la imagen desde SUS servidores, así que una
      // ruta relativa (/images/products/41.jpg) no le sirve -- hay que
      // convertirla a URL absoluta con APP_URL, igual que en Marketplace.
      let creativeImageUrl = absoluteImageUrl(product.imageUrl) || "";
      let hasRealProductImage = !!creativeImageUrl;

      // Sin foto real: se intenta generar una con IA (nombre + descripción
      // reales del producto, no un estilo genérico) antes de caer al cartel
      // de texto placeholder -- mismo mecanismo que ad-strategist.ts, ver
      // lib/ai-product-image.ts. Se persiste en el producto para no
      // regenerarla en cada anuncio.
      if (!creativeImageUrl) {
        const { generateProductImage } = await import("./ai-product-image");
        const generatedPath = await generateProductImage({ id: product.id, name: product.name, description: product.description });
        if (generatedPath) {
          const absolute = absoluteImageUrl(generatedPath);
          if (absolute) {
            creativeImageUrl = absolute;
            hasRealProductImage = true;
            await db.update(products).set({ imageUrl: generatedPath }).where(eq(products.id, product.id));
            logger.info({ productId: product.id }, "[Facebook] Foto generada con IA para el anuncio (el producto no tenía ninguna)");
          }
        }
      }
      if (!creativeImageUrl) {
        creativeImageUrl = this.generatePlaceholderUrl(product.name);
      }
      // Igual que en ad-strategist.ts: las mejoras de Meta que ALTERAN la
      // imagen (recorte/expansión, brillo y contraste) solo tienen sentido
      // si hay una foto real del producto. Aplicarlas sobre el cartel de
      // texto placeholder no mejora nada -- puede terminar generando un
      // fondo que se parece todavía menos al curso real.

      // Campaña.
      // special_ad_categories: [] daba error 100 / subcódigo 4834011 --
      // Meta viene exigiendo que TODA campaña declare explícitamente "NONE"
      // en vez de un array vacío quiere decir "no aplica ninguna categoría
      // especial" (vivienda, empleo, crédito, temas sociales/elecciones).
      const campaign = await this.fbPost(`${adAccount}/campaigns`, {
        name: campaignName,
        objective: "OUTCOME_SALES",
        status: "PAUSED",
        special_ad_categories: ["NONE"],
        // El presupuesto se maneja a nivel de conjunto de anuncios (no CBO),
        // así que Facebook exige declarar explícitamente que los conjuntos
        // NO comparten presupuesto entre sí -- sin esto rechaza la campaña
        // entera con error 100/subcódigo 4834011.
        is_adset_budget_sharing_enabled: false,
      }, "campaña");

      // Construir targeting desde parámetros o usar defaults
      const fbTargeting: Record<string, any> = {
        geo_locations: targeting?.geoLocations?.countries
          ? { countries: targeting.geoLocations.countries }
          : { countries: ["CO"] },
        age_min: targeting?.ageMin || 18,
        age_max: targeting?.ageMax || 65,
      };

      // Ciudades específicas
      if (targeting?.geoLocations?.cities && targeting.geoLocations.cities.length > 0) {
        fbTargeting.geo_locations = {
          ...fbTargeting.geo_locations,
          cities: targeting.geoLocations.cities.map(name => ({ key: name })),
        };
      }

      // Radio alrededor de ubicación
      if (targeting?.geoLocations?.radius) {
        fbTargeting.geo_locations = {
          ...fbTargeting.geo_locations,
          location_types: ["home", "recent"],
          radius: targeting.geoLocations.radius,
        };
      }

      // Géneros
      if (targeting?.genders && targeting.genders.length > 0) {
        fbTargeting.genders = targeting.genders;
      }

      // Intereses
      if (targeting?.interests && targeting.interests.length > 0) {
        fbTargeting.flexible_spec = [{
          interests: targeting.interests.map(i => ({ id: i.id, name: i.name })),
        }];
      }

      // Placements
      const placements = targeting?.placements;
      if (placements?.facebook || placements?.instagram || placements?.messenger) {
        fbTargeting.publisher_platforms = [];
        fbTargeting.facebook_positions = [];
        fbTargeting.instagram_positions = [];
        fbTargeting.messenger_positions = [];

        if (placements.facebook) {
          fbTargeting.publisher_platforms.push("facebook");
          fbTargeting.facebook_positions = placements.facebook;
        }
        if (placements.instagram) {
          fbTargeting.publisher_platforms.push("instagram");
          fbTargeting.instagram_positions = placements.instagram;
        }
        if (placements.messenger) {
          fbTargeting.publisher_platforms.push("messenger");
          fbTargeting.messenger_positions = placements.messenger;
        }
      } else {
        fbTargeting.publisher_platforms = ["facebook", "instagram"];
        fbTargeting.facebook_positions = ["feed", "story", "marketplace"];
        fbTargeting.instagram_positions = ["stream", "story", "reels"];
      }

      // Conjunto de anuncios.
      // optimization_goal=CONVERSIONS SIN promoted_object es rechazado por
      // Graph API con error 100 "Invalid parameter" -- Facebook exige que el
      // conjunto apunte a un pixel/evento cuando optimiza por conversión. Si
      // hay pixelId configurado se lo mandamos (evento PURCHASE); si no hay
      // pixel, se cae a LINK_CLICKS, que no requiere promoted_object.
      //
      // El pixelId guardado puede pertenecer a OTRA cuenta publicitaria
      // (pasó justo eso: se corrigió el adAccountId pero el pixel se quedó
      // apuntando al de la cuenta vieja) -- Facebook rechaza el anuncio con
      // "Píxel no asociado" sin decirlo hasta el paso final, después de
      // crear campaña y conjunto. Para no desperdiciar esas llamadas, se
      // verifica ANTES que el pixel realmente esté en la lista de pixeles de
      // ESTA cuenta.
      const hasUsablePixel = this.config.pixelId
        ? await this.pixelBelongsToAccount(adAccount, this.config.pixelId)
        : false;

      const adSetBody: Record<string, any> = {
        name: `${campaignName} - Conjunto`,
        campaign_id: campaign.id,
        daily_budget: Math.round(dailyBudget * 100),
        targeting: fbTargeting,
        status: "PAUSED",
        start_time: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
      };
      if (hasUsablePixel) {
        adSetBody.billing_event = "IMPRESSIONS";
        // "CONVERSIONS" no es un valor válido de optimization_goal en la API
        // actual (Graph API lo rechaza con error 100 listando los válidos) --
        // el equivalente moderno para optimizar por conversiones de pixel es
        // OFFSITE_CONVERSIONS.
        adSetBody.optimization_goal = "OFFSITE_CONVERSIONS";
        adSetBody.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
        // LEAD no es compatible con el objetivo OUTCOME_SALES (Graph API lo
        // rechaza: "Este evento de conversión no está disponible para el
        // objetivo que has seleccionado"). PURCHASE es el evento que
        // corresponde a una campaña de venta.
        adSetBody.promoted_object = { pixel_id: this.config.pixelId, custom_event_type: "PURCHASE" };
      } else {
        // billing_event=LINK_CLICKS lo rechaza Facebook en cuentas nuevas
        // ("cuando hayan cumplido nuestras políticas durante varias
        // semanas") -- IMPRESSIONS sí está disponible desde el día uno y es
        // compatible con optimization_goal=LINK_CLICKS (se paga por
        // impresión, se optimiza para maximizar clics).
        adSetBody.billing_event = "IMPRESSIONS";
        adSetBody.optimization_goal = "LINK_CLICKS";
        adSetBody.bid_strategy = "LOWEST_COST_WITHOUT_CAP";
      }
      const adSet = await this.fbPost(`${adAccount}/adsets`, adSetBody, "conjunto de anuncios");

      // Creativo — se usa `picture` (URL) en vez de `image_hash` porque el
      // endpoint /adimages no está disponible para esta aplicación (error #3);
      // pasando la URL directamente Facebook la descarga y cachea él mismo.
      //
      // Advantage+ Creative vía creative_features_spec -- verificado en vivo
      // contra la cuenta real (act_1545022093928422, generatepreviews) que
      // estos 5 flags son válidos. Meta NO devuelve fotos alternativas para
      // elegir por API: retoca/expande la MISMA imagen que se le manda al
      // momento de entregar el anuncio. image_touchups/brightness/uncrop
      // (los que alteran la imagen) solo se activan con foto real del
      // producto -- ver hasRealProductImage arriba.
      const creativeFeaturesSpec: Record<string, any> = {
        standard_enhancements: { enroll_status: "OPT_IN" },
        text_optimizations: { enroll_status: "OPT_IN" },
        enhance_cta: { enroll_status: "OPT_IN" },
      };
      if (hasRealProductImage) {
        creativeFeaturesSpec.image_touchups = { enroll_status: "OPT_IN" };
        creativeFeaturesSpec.image_brightness_and_contrast = { enroll_status: "OPT_IN" };
        creativeFeaturesSpec.image_uncrop = { enroll_status: "OPT_IN" };
        // Meta genera fondos alternativos con su IA (Emu) sobre la imagen
        // del producto -- equivale a la función "Generar variaciones" del
        // Ads Manager pero activada automáticamente por API.
        creativeFeaturesSpec.image_background_gen = { enroll_status: "OPT_IN" };
      }
      const creativePayload: Record<string, any> = {
        name: `${product.name} - Creativo`,
        object_story_spec: {
          page_id: this.config.pageId,
          link_data: {
            // Bug: /productos/:id no existe en ningún router (ni el SPA del
            // dashboard ni la tienda pública) -- todo anuncio creado desde
            // esta pestaña llevaba a un 404. /p/:id es el short-link real
            // (app.ts) que resuelve el tenant y redirige a
            // /tienda/:slug/producto/:id -- el mismo que ya usa
            // ad-strategist.ts para los borradores.
            link: `${process.env.APP_URL || "https://tecnovariedades.easypanel.host"}/p/${product.id}`,
            message: adCopy.primaryText,
            name: adCopy.headline,
            description: adCopy.description,
            call_to_action: { type: "SHOP_NOW" },
          },
        },
        creative_features_spec: creativeFeaturesSpec,
      };
      if (creativeImageUrl) {
        creativePayload.object_story_spec.link_data.picture = creativeImageUrl;
      }
      const creative = await this.fbPost(`${adAccount}/adcreatives`, creativePayload, "creativo");

      // Anuncio
      const ad = await this.fbPost(`${adAccount}/ads`, {
        name: campaignName,
        adset_id: adSet.id,
        creative: { creative_id: creative.id },
        status: "PAUSED",
      }, "anuncio final");

      const previewUrl = `https://www.facebook.com/adsmanager/manage/ads?act=${this.config.adAccountId}&ad_id=${ad.id}`;

      logger.info({ campaignId: campaign.id, adId: ad.id, product: product.name, targeting: fbTargeting }, "[Facebook] Anuncio creado");

      return {
        campaignId: campaign.id,
        adSetId: adSet.id,
        adId: ad.id,
        imageUrl: creativeImageUrl,
        adCopy,
        status: "PAUSED",
        previewUrl,
      };
    } catch (err: any) {
      logger.error({ err, productId }, "[Facebook] Error creando anuncio");
      this.lastAdError = err?.message || "Error desconocido";
      return null;
    }
  }

  /** Motivo real del último createAdForProduct fallido -- fbPost/fbGet
   * tiran el mensaje de error de Graph API tal cual, pero createAdForProduct
   * devuelve null en error (no puede tirar sin romper a otros que la llaman
   * asumiendo `| null`), así que sin esto el llamador solo sabe "falló", no
   * por qué. */
  lastAdError: string | null = null;

  // ── Agente de crecimiento: lectura de métricas y control de campañas ───────

  /** Campañas activas (no borradas/archivadas) de la cuenta publicitaria,
   * con su conjunto de anuncios principal -- base para que el agente sepa
   * qué revisar. */
  async listActiveCampaigns(): Promise<Array<{ id: string; name: string; status: string; effectiveStatus: string }>> {
    if (!this.config.adAccountId || !this.config.accessToken) return [];
    const adAccount = `act_${this.config.adAccountId}`;
    try {
      const res = await this.fbGet(`${adAccount}/campaigns`, {
        fields: "id,name,status,effective_status",
        // ACTIVE y PAUSED: el agente tambien debe poder proponer reactivar
        // una pausada si en el pasado le fue bien.
        limit: "100",
      });
      return (res.data || []).filter((c: any) => c.effective_status !== "DELETED" && c.effective_status !== "ARCHIVED");
    } catch (err: any) {
      logger.warn({ err }, "[Facebook] Error listando campañas");
      return [];
    }
  }

  /** Métricas de una campaña en una ventana de tiempo. datePreset acepta los
   * valores estándar de Graph API ("today", "yesterday", "last_3d",
   * "last_7d", "last_14d", etc.) -- se usan ventanas cortas para proteger
   * gasto y largas para decidir si escalar por tendencia. */
  async getCampaignInsights(campaignId: string, datePreset: string): Promise<{
    spend: number; impressions: number; clicks: number; ctr: number;
    results: number; costPerResult: number; reach: number;
  } | null> {
    try {
      const res = await this.fbGet(`${campaignId}/insights`, {
        fields: "spend,impressions,clicks,ctr,reach,actions,cost_per_action_type",
        date_preset: datePreset,
      });
      const row = res.data?.[0];
      if (!row) {
        // Sin filas = sin gasto/actividad todavia en esa ventana, no es error.
        return { spend: 0, impressions: 0, clicks: 0, ctr: 0, results: 0, costPerResult: 0, reach: 0 };
      }
      // "Resultados" en Ads Manager es la acción principal segun el objetivo
      // de la campaña (compra, lead, mensaje). Se suman todas las acciones
      // de conversión relevantes como aproximación simple y auditable.
      const actions: Array<{ action_type: string; value: string }> = row.actions || [];
      const relevantTypes = ["purchase", "offsite_conversion.fb_pixel_purchase", "lead", "onsite_conversion.messaging_conversation_started_7d", "link_click"];
      const results = actions
        .filter(a => relevantTypes.includes(a.action_type))
        .reduce((sum, a) => sum + (Number(a.value) || 0), 0);
      const spend = Number(row.spend) || 0;
      return {
        spend,
        impressions: Number(row.impressions) || 0,
        clicks: Number(row.clicks) || 0,
        ctr: Number(row.ctr) || 0,
        reach: Number(row.reach) || 0,
        results,
        costPerResult: results > 0 ? spend / results : 0,
      };
    } catch (err: any) {
      logger.warn({ err, campaignId }, "[Facebook] Error leyendo insights");
      return null;
    }
  }

  /** Presupuesto diario configurado y gastado hoy -- necesario para
   * "protección de gasto" (¿ya se comió el presupuesto sin resultados?). */
  async getAdSetBudgetStatus(adSetId: string): Promise<{ dailyBudget: number; status: string } | null> {
    try {
      const res = await this.fbGet(`${adSetId}`, { fields: "daily_budget,effective_status" });
      return {
        dailyBudget: res.daily_budget ? Number(res.daily_budget) / 100 : 0,
        status: res.effective_status,
      };
    } catch (err: any) {
      logger.warn({ err, adSetId }, "[Facebook] Error leyendo presupuesto del conjunto");
      return null;
    }
  }

  async pauseCampaign(campaignId: string): Promise<boolean> {
    try {
      await this.fbPost(campaignId, { status: "PAUSED" }, "pausar campaña");
      return true;
    } catch (err: any) {
      logger.warn({ err, campaignId }, "[Facebook] Error pausando campaña");
      return false;
    }
  }

  async resumeCampaign(campaignId: string): Promise<boolean> {
    try {
      await this.fbPost(campaignId, { status: "ACTIVE" }, "reactivar campaña");
      return true;
    } catch (err: any) {
      logger.warn({ err, campaignId }, "[Facebook] Error reactivando campaña");
      return false;
    }
  }

  /** Ajusta el presupuesto diario de un conjunto de anuncios por un
   * porcentaje (ej. 0.2 = +20%, -0.2 = -20%). Graph API espera el
   * presupuesto en centavos. */
  async adjustAdSetBudget(adSetId: string, percentChange: number): Promise<{ ok: boolean; newBudget?: number }> {
    try {
      const current = await this.getAdSetBudgetStatus(adSetId);
      if (!current || !current.dailyBudget) return { ok: false };
      const newBudget = Math.max(1000, Math.round(current.dailyBudget * (1 + percentChange)));
      await this.fbPost(adSetId, { daily_budget: Math.round(newBudget * 100) }, "ajustar presupuesto");
      return { ok: true, newBudget };
    } catch (err: any) {
      logger.warn({ err, adSetId }, "[Facebook] Error ajustando presupuesto");
      return { ok: false };
    }
  }

  // ── Estrategias de copy por categoría ──────────────────────────────────────

  private getCategoryStrategy(productName: string): { hook: string; angle: string; emoji: string } {
    const n = productName.toLowerCase();
    if (n.includes("photoshop") || n.includes("diseño") || n.includes("ilustrator") || n.includes("canva") || n.includes("lettering") || n.includes("logotipo") || n.includes("indesign") || n.includes("premiere") || n.includes("after effects") || n.includes("animacion") || n.includes("3d"))
      return { hook: "¿Sin tiempo para diseñar?", angle: "consigue trabajo como diseñador freelance", emoji: "🎨" };
    if (n.includes("programacion") || n.includes("desarrollo web") || n.includes("hacking") || n.includes("ciberseguridad") || n.includes("wordpress") || n.includes("linux"))
      return { hook: "¿Quieres trabajar en tecnología?", angle: "consigue empleo sin título universitario", emoji: "💻" };
    if (n.includes("excel") || n.includes("office"))
      return { hook: "Excel te abre puertas laborales", angle: "el 80% de los trabajos piden Excel", emoji: "📊" };
    if (n.includes("ingles") || n.includes("idioma") || n.includes("oxford") || n.includes("frances") || n.includes("aleman") || n.includes("portugues") || n.includes("japones"))
      return { hook: "¿Inglés = más oportunidades?", angle: "duplica tu salario aprendiendo inglés", emoji: "🌎" };
    if (n.includes("guitarra") || n.includes("dj") || n.includes("produccion musical") || n.includes("musica") || n.includes("piano"))
      return { hook: "¿Siempre has querido tocar?", angle: "aprende música desde casa, a tu ritmo", emoji: "🎵" };
    if (n.includes("fotografia") || n.includes("fotomontaje") || n.includes("camara") || n.includes("video"))
      return { hook: "Fotos de profesional con tu celu", angle: "vende tus fotos o mejora tu marca", emoji: "📸" };
    if (n.includes("marketing") || n.includes("seo") || n.includes("ecommerce") || n.includes("ventas"))
      return { hook: "¿Tu negocio necesita más clientes?", angle: "aprende marketing digital y escala", emoji: "📈" };
    if (n.includes("fitness") || n.includes("pilates") || n.includes("fuerza") || n.includes("guerrero") || n.includes("perro"))
      return { hook: "¿Sin tiempo para el gym?", angle: "transforma tu cuerpo en casa, 20 min al día", emoji: "💪" };
    if (n.includes("reparacion") || n.includes("celular") || n.includes("play station") || n.includes("consola") || n.includes("armado") || n.includes("ensamblaje") || n.includes("computador"))
      return { hook: "¿Ganas $20K en tu trabajo?", angle: "una reparación te paga todo el curso", emoji: "🔧" };
    if (n.includes("drywall") || n.includes("plano") || n.includes("revit") || n.includes("arquitectura") || n.includes("obra") || n.includes("construccion") || n.includes("carpinteria"))
      return { hook: "Especialízate en construcción", angle: "gana 3x más en cada proyecto", emoji: "🏗️" };
    if (n.includes("gastronomia"))
      return { hook: "Cocina como un chef profesional", angle: "aprende nuevas recetas y técnicas desde casa", emoji: "🍳" };
    if (n.includes("contabilidad") || n.includes("autismo") || n.includes("lenguaje") || n.includes("memoria") || n.includes("psicologia"))
      return { hook: "Desarrolla habilidades que transforman vidas", angle: "fórmate en un área con alta demanda", emoji: "📚" };
    return { hook: "Aprende algo nuevo hoy", angle: "invierte en ti mismo por solo $20,000", emoji: "🚀" };
  }

  // ── Generación de copy con IA + estrategia de categoría ────────────────────

  private async generateAdCopy(product: any): Promise<{ primaryText: string; headline: string; description: string }> {
    // product.currency, no "COP" fijo -- ver el mismo fix en ad-strategist.ts
    // (ahí el bug era peor: multiplicaba x4100 asumiendo que el precio
    // siempre venía en USD). Acá el precio en sí estaba bien, pero la
    // etiqueta de moneda quedaba mal si el producto no está en COP.
    const currency = (product.currency || "COP").toUpperCase();
    const priceFormatted = Number(product.price).toLocaleString("es-CO");
    const productName = product.name || "";
    const strategy = this.getCategoryStrategy(productName);
    const desc = (product.description || "").substring(0, 200);

    try {
      const prompt = `Eres un copywriter experto en Facebook Ads para Colombia. Vendes cursos digitales.

Producto: ${productName}
Precio: $${priceFormatted} ${currency}
Categoría: ${product.category || "Digital"}
Descripción: ${desc}

Usa el framework PAS (Problema-Agitación-Solución):
1. PROBLEMA: "${strategy.hook}"
2. AGITACIÓN: Muestra el costo de no tener esta habilidad
3. SOLUCIÓN: ${productName} por solo $${priceFormatted}

El ángulo de venta es: "${strategy.angle}"

Debes responder SOLO con este JSON (sin markdown, sin acentos en las claves):
{
  "primaryText": "Texto principal del anuncio (máx 125 caracteres, USA PAS, tono directo y persuasivo, para Facebook)",
  "headline": "Titular del anuncio (máx 40 caracteres, llamativo, con emoji)",
  "description": "Descripción corta (máx 30 caracteres, ej: 'Solo $${priceFormatted} - Acceso de por vida')"
}`;

      const res = await fetch(`${process.env.OPENCODE_API_URL || "https://api.freemodel.dev/v1"}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENCODE_API_KEY || ""}`,
        },
        body: JSON.stringify({
          model: process.env.OPENCODE_MODEL || "gpt-5.5",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 300,
        }),
        signal: AbortSignal.timeout(20000),
      });

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          primaryText: parsed.primaryText || `${strategy.hook} ${strategy.emoji} ${productName} por solo $${priceFormatted}. ${strategy.angle}. Acceso de por vida + garantía 7 días.`,
          headline: parsed.headline || `${strategy.emoji} ${productName}`,
          description: parsed.description || `Desde $${priceFormatted}`,
        };
      }
    } catch (_) {
      logger.warn({ productId: product.id }, "[Facebook] AI copy fallback a texto genérico");
    }

    return {
      primaryText: `${strategy.hook} ${strategy.emoji} Aprende ${productName} desde casa. Acceso de por vida + garantía 7 días. Solo $${priceFormatted} ${currency}.`,
      headline: `${strategy.emoji} ${productName}`,
      description: `Solo $${priceFormatted} ${currency}`,
    };
  }

  // ── Imagen del anuncio ─────────────────────────────────────────────────────
  // No se usa /adimages (la app no tiene esa capacidad). En vez de subir la
  // imagen para obtener un hash, se pasa la URL absoluta directamente en el
  // campo `picture` del link_data del creativo. Facebook descarga, cachea y
  // muestra la imagen desde la URL sin necesidad del endpoint de subida.

  lastImageError: string | null = null;

  /** Genera URL de placeholder para usar como fallback si el producto no tiene
   * imagen. Se devuelve la URL directamente (no se sube a Facebook). */
  private generatePlaceholderUrl(productName: string): string {
    const color = encodeURIComponent("1A365D");
    const text = encodeURIComponent(productName.substring(0, 30));
    return `https://placehold.co/1200x628/1A365D/FFFFFF?text=${text}`;
  }

  // ── Utilidad: llamada a Graph API ──────────────────────────────────────────

  private async fbPost(endpoint: string, body: Record<string, any>, step?: string): Promise<any> {
    const url = `${FB_GRAPH_URL}/${endpoint}`;
    const params = new URLSearchParams({ access_token: this.config.accessToken });
    const res = await fetch(`${url}?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();
    if (data.error) {
      const prefix = step ? `[${step}] ` : "";
      // error_user_msg / blame_field_specs son el detalle real y accionable
      // que da Graph API ("Invalid parameter" código 100 es genérico y no
      // dice cuál). logger.error para verlo en logs aunque no quepa en el
      // mensaje corto que llega al cliente.
      logger.error({ fbError: data.error, endpoint }, "[Facebook] Graph API error detallado");
      const detail = data.error.error_user_msg
        ? ` -- ${data.error.error_user_msg}`
        : data.error.error_data?.blame_field_specs
        ? ` -- campo(s): ${JSON.stringify(data.error.error_data.blame_field_specs)}`
        : "";
      throw new Error(`${prefix}${data.error.message}${detail} (código ${data.error.code}${data.error.error_subcode ? `, subcódigo ${data.error.error_subcode}` : ""})`);
    }
    return data;
  }

  private async fbGet(endpoint: string, query: Record<string, string> = {}): Promise<any> {
    const params = new URLSearchParams({ access_token: this.config.accessToken, ...query });
    const res = await fetch(`${FB_GRAPH_URL}/${endpoint}?${params}`, { signal: AbortSignal.timeout(15000) });
    const data = await res.json();
    if (data.error) throw new Error(`${data.error.message} (código ${data.error.code})`);
    return data;
  }

  /** Un pixelId guardado puede pertenecer a una cuenta publicitaria distinta
   * a la configurada (adAccountId) -- pasa cuando se cambia de cuenta sin
   * actualizar el pixel. Graph API recién avisa "Píxel no asociado" al
   * crear el anuncio final, después de gastar las llamadas de campaña y
   * conjunto. Se pregunta antes para evitar el error 100 tardío. */
  private async pixelBelongsToAccount(adAccount: string, pixelId: string): Promise<boolean> {
    try {
      const res = await this.fbGet(`${adAccount}/adspixels`, { fields: "id" });
      const ids: string[] = (res.data || []).map((p: any) => p.id);
      return ids.includes(pixelId);
    } catch (err: any) {
      logger.warn({ err }, "[Facebook] No se pudo verificar el pixel de la cuenta, se asume que no aplica");
      return false;
    }
  }

  // ── Sincronizar catálogo ───────────────────────────────────────────────────

  async syncCatalog(): Promise<{ synced: number; failed: number; errors: string[] }> {
    const result = { synced: 0, failed: 0, errors: [] as string[] };
    if (!this.config.catalogId) return result;

    const activeProducts = await db.select().from(products).where(eq(products.isActive, true));

    for (const p of activeProducts) {
      try {
        const existing = await this.findInCatalog(p.id);
        // Mismos dos bugs que en createAdForProduct: p.image_url no existe
        // (la columna es imageUrl) y /productos/:id no es una ruta real --
        // ambos dejaban el catálogo con productos sin imagen y con un link
        // roto en cada anuncio dinámico/shopping generado desde él.
        const absoluteImage = absoluteImageUrl(p.imageUrl);
        const data = {
          title: p.name,
          description: (p.description || "").substring(0, 5000),
          price: `${Number(p.price).toFixed(0)}_COP`,
          currency: "COP",
          image_url: absoluteImage || "",
          product_type: p.category || "Digital",
          sku: `PROD-${p.id}`,
          url: `${process.env.APP_URL || ""}/p/${p.id}`,
        };
        if (existing) {
          await this.fbPost(existing.id, data);
        } else {
          await this.fbPost(`${this.config.catalogId}/products`, data);
        }
        result.synced++;
      } catch (err: any) {
        result.failed++;
        result.errors.push(`${p.name}: ${err.message}`);
      }
    }
    return result;
  }

  private async findInCatalog(productId: number): Promise<{ id: string } | null> {
    try {
      const data = await this.fbGet(`${this.config.catalogId}/products`, {
        fields: "id,sku",
        filtering: JSON.stringify([{ field: "sku", value: `PROD-${productId}` }]),
      });
      return data.data?.[0] || null;
    } catch (_) {
      return null;
    }
  }

  // ── Publicar post orgánico en el muro de la página ──────────────────────────

  async publishPost(message: string, imageUrl?: string, link?: string): Promise<{ postId: string; url: string } | null> {
    if (!this.config.accessToken || !this.config.pageId) {
      logger.warn("[Facebook] No hay token o pageId configurado para publicar post");
      return null;
    }

    try {
      const body: Record<string, any> = { message };

      if (imageUrl) {
        body.image_url = imageUrl;
      }

      if (link) {
        body.link = link;
      }

      const result = await this.fbPost(`${this.config.pageId}/feed`, body);

      if (!result || !result.id) {
        logger.error({ result }, "[Facebook] Error publicando post: respuesta sin ID");
        return null;
      }

      const postId = result.id;
      const postUrl = `https://www.facebook.com/${postId.replace("_", "/posts/")}`;

      logger.info({ postId, postUrl }, "[Facebook] Post publicado exitosamente en el muro de la página");

      return { postId, url: postUrl };
    } catch (err: any) {
      logger.error({ err, message: message.substring(0, 100) }, "[Facebook] Error publicando post orgánico");
      return null;
    }
  }
}

export const facebookService = new FacebookService();
