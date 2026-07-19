import { logger } from "./logger";
import { db, products } from "@workspace/db";
import { eq } from "drizzle-orm";
import { tenantManager, type TenantContext } from "./tenantManager";

const FB_GRAPH_URL = "https://graph.facebook.com/v21.0";

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
  imageHash: string;
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
      const res = await fetch(`${FB_GRAPH_URL}/me?access_token=${this.config.accessToken}`);
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
      return aiAudience || {
        description: profile.description,
        targeting,
        rationale: `Perfil por defecto para categoría "${product.category || "General"}": ${profile.description}`,
      };
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

      let imageHash = "";
      if (product.image_url) {
        imageHash = await this.uploadImage(adAccount, product.image_url, product.name);
      } else {
        imageHash = await this.generateImagePlaceholder(adAccount, product.name);
      }

      // Campaña
      const campaign = await this.fbPost(`${adAccount}/campaigns`, {
        name: campaignName,
        objective: "OUTCOME_SALES",
        status: "PAUSED",
        special_ad_categories: [],
      });

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

      // Conjunto de anuncios
      const adSet = await this.fbPost(`${adAccount}/adsets`, {
        name: `${campaignName} - Conjunto`,
        campaign_id: campaign.id,
        daily_budget: Math.round(dailyBudget * 100),
        billing_event: "IMPRESSIONS",
        optimization_goal: "CONVERSIONS",
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        targeting: fbTargeting,
        status: "PAUSED",
        start_time: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
      });

      // Creativo
      const creative = await this.fbPost(`${adAccount}/adcreatives`, {
        name: `${product.name} - Creativo`,
        object_story_spec: {
          page_id: this.config.pageId,
          link_data: {
            link: `${process.env.APP_URL || "https://tecnovariedades.easypanel.host"}/productos/${product.id}`,
            message: adCopy.primaryText,
            name: adCopy.headline,
            description: adCopy.description,
            call_to_action: { type: "SHOP_NOW" },
            image_hash: imageHash,
          },
        },
      });

      // Anuncio
      const ad = await this.fbPost(`${adAccount}/ads`, {
        name: campaignName,
        adset_id: adSet.id,
        creative: { creative_id: creative.id },
        status: "PAUSED",
      });

      const previewUrl = `https://www.facebook.com/adsmanager/manage/ads?act=${this.config.adAccountId}&ad_id=${ad.id}`;

      logger.info({ campaignId: campaign.id, adId: ad.id, product: product.name, targeting: fbTargeting }, "[Facebook] Anuncio creado");

      return {
        campaignId: campaign.id,
        adSetId: adSet.id,
        adId: ad.id,
        imageHash,
        adCopy,
        status: "PAUSED",
        previewUrl,
      };
    } catch (err: any) {
      logger.error({ err, productId }, "[Facebook] Error creando anuncio");
      return null;
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
    const priceFormatted = Number(product.price).toLocaleString("es-CO");
    const productName = product.name || "";
    const strategy = this.getCategoryStrategy(productName);
    const desc = (product.description || "").substring(0, 200);

    try {
      const prompt = `Eres un copywriter experto en Facebook Ads para Colombia. Vendes cursos digitales a $20,000 COP.

Producto: ${productName}
Precio: $${priceFormatted} COP
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
      primaryText: `${strategy.hook} ${strategy.emoji} Aprende ${productName} desde casa. Acceso de por vida + garantía 7 días. Solo $${priceFormatted} COP.`,
      headline: `${strategy.emoji} ${productName}`,
      description: `Solo $${priceFormatted}`,
    };
  }

  // ── Subida de imagen a Facebook ────────────────────────────────────────────

  private async uploadImage(adAccount: string, imageUrl: string, productName: string): Promise<string> {
    try {
      const res = await this.fbPost(`${adAccount}/adimages`, { url: imageUrl, name: productName });
      if (res?.images) {
        const key = Object.keys(res.images)[0];
        return res.images[key]?.hash || "";
      }
    } catch (err: any) {
      logger.warn({ err }, "[Facebook] Error uploading image, usando placeholder");
    }
    return await this.generateImagePlaceholder(adAccount, productName);
  }

  private async generateImagePlaceholder(adAccount: string, productName: string): Promise<string> {
    const color = encodeURIComponent("1A365D");
    const text = encodeURIComponent(productName.substring(0, 30));
    const placeholderUrl = `https://placehold.co/1200x628/1A365D/FFFFFF?text=${text}`;
    try {
      const res = await this.fbPost(`${adAccount}/adimages`, { url: placeholderUrl, name: productName });
      if (res?.images) {
        const key = Object.keys(res.images)[0];
        return res.images[key]?.hash || "";
      }
    } catch (_) {}
    return "";
  }

  // ── Utilidad: llamada a Graph API ──────────────────────────────────────────

  private async fbPost(endpoint: string, body: Record<string, any>): Promise<any> {
    const url = `${FB_GRAPH_URL}/${endpoint}`;
    const params = new URLSearchParams({ access_token: this.config.accessToken });
    const res = await fetch(`${url}?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) throw new Error(`${data.error.message} (código ${data.error.code})`);
    return data;
  }

  private async fbGet(endpoint: string, query: Record<string, string> = {}): Promise<any> {
    const params = new URLSearchParams({ access_token: this.config.accessToken, ...query });
    const res = await fetch(`${FB_GRAPH_URL}/${endpoint}?${params}`);
    const data = await res.json();
    if (data.error) throw new Error(`${data.error.message} (código ${data.error.code})`);
    return data;
  }

  // ── Sincronizar catálogo ───────────────────────────────────────────────────

  async syncCatalog(): Promise<{ synced: number; failed: number; errors: string[] }> {
    const result = { synced: 0, failed: 0, errors: [] as string[] };
    if (!this.config.catalogId) return result;

    const activeProducts = await db.select().from(products).where(eq(products.isActive, true));

    for (const p of activeProducts) {
      try {
        const existing = await this.findInCatalog(p.id);
        const data = {
          title: p.name,
          description: (p.description || "").substring(0, 5000),
          price: `${Number(p.price).toFixed(0)}_COP`,
          currency: "COP",
          image_url: p.image_url || "",
          product_type: p.category || "Digital",
          sku: `PROD-${p.id}`,
          url: `${process.env.APP_URL || ""}/productos/${p.id}`,
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
}

export const facebookService = new FacebookService();
