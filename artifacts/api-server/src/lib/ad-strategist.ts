import { logger } from "./logger";
import { db, products, productCategories } from "@workspace/db";
import { eq } from "drizzle-orm";
import { tenantManager, type TenantContext } from "./tenantManager";

const FB_GRAPH_URL = "https://graph.facebook.com/v21.0";

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
  laptops_portatiles: {
    niche: "Laptops y Portátiles",
    hook: "¿Tu PC ya no da más? ⚡",
    angle: "Potencia y portabilidad al mejor precio del mercado colombiano",
    emotionalTrigger: "Productividad y estatus profesional",
    ctaType: "SHOP_NOW",
    imageStyle: "Producto en fondo blanco con iluminación profesional, mostrando el diseño delgado",
    imagePrompt: "Professional product photography of a modern laptop on white background, sleek design, studio lighting, 4K",
    ageMin: 18,
    ageMax: 50,
    interests: ["Tecnología", "Computadores portátiles", "Trabajo remoto", "Productividad"],
    budget: 8000,
  },
  monitores: {
    niche: "Monitores",
    hook: "Trabaja y juega con la mejor calidad de imagen 🎮",
    angle: "Monitores LG originales con la mejor relación calidad-precio",
    emotionalTrigger: "Experiencia visual inmersiva",
    ctaType: "SHOP_NOW",
    imageStyle: "Monitor en setup gaming/oficina con RGB",
    imagePrompt: "Gaming setup with LG monitor, RGB lighting, desk setup, dark ambiance, professional photography",
    ageMin: 16,
    ageMax: 45,
    interests: ["Videojuegos", "Tecnología", "PC Gaming", "Trabajo remoto"],
    budget: 6000,
  },
  perifericos: {
    niche: "Teclados y Mouse",
    hook: "Escribe y navega con estilo ✨",
    angle: "Combos inalámbricos que transforman tu escritorio",
    emotionalTrigger: "Orden y estética moderna",
    ctaType: "SHOP_NOW",
    imageStyle: "Flat lay de escritorio con periféricos",
    imagePrompt: "Flat lay photography of wireless keyboard and mouse on desk, pastel colors, modern office aesthetic, top view",
    ageMin: 15,
    ageMax: 40,
    interests: ["Tecnología", "Diseño", "Trabajo remoto", "Productividad"],
    budget: 5000,
  },
  audifonos_diademas: {
    niche: "Audífonos y Diademas",
    hook: "Sumérgete en tu música favorita 🎵",
    angle: "Audio premium para gaming, música y trabajo con envío a toda Colombia",
    emotionalTrigger: "Experiencia sensorial y entretenimiento",
    ctaType: "SHOP_NOW",
    imageStyle: "Audífonos en uso con ambiente lifestyle",
    imagePrompt: "Person wearing gaming headphones, neon lights, RGB, immersive atmosphere, lifestyle photography",
    ageMin: 14,
    ageMax: 40,
    interests: ["Música", "Videojuegos", "Tecnología", "Audio"],
    budget: 6000,
  },
  impresoras_scanner: {
    niche: "Impresoras y Escáneres",
    hook: "Imprime sin límites, trabaja sin estrés 🖨️",
    angle: "Equipos Brother y Epson originales para hogar y oficina",
    emotionalTrigger: "Eficiencia y ahorro de tiempo",
    ctaType: "LEARN_MORE",
    imageStyle: "Impresora en oficina moderna",
    imagePrompt: "Printer in modern home office setup, clean white desk, natural lighting, professional photography",
    ageMin: 25,
    ageMax: 60,
    interests: ["Oficina", "Trabajo", "Emprendimiento", "Tecnología"],
    budget: 5000,
  },
  macbooks_apple: {
    niche: "MacBooks",
    hook: "El poder de Apple al alcance de tu mano 🍎",
    angle: "MacBook Pro M4 original con garantía, envío a todo Colombia",
    emotionalTrigger: "Estatus y rendimiento profesional",
    ctaType: "SHOP_NOW",
    imageStyle: "MacBook en café o espacio moderno",
    imagePrompt: "MacBook Pro on wooden table in coffee shop, warm lighting, lifestyle photography, professional atmosphere",
    ageMin: 18,
    ageMax: 45,
    interests: ["Apple", "Diseño", "Desarrollo de software", "Tecnología"],
    budget: 10000,
  },
  tecnologia_general: {
    niche: "Tecnología General",
    hook: "Lo último en tecnología está aquí 🚀",
    angle: "Productos originales con garantía y el mejor precio del mercado",
    emotionalTrigger: "Innovación y calidad",
    ctaType: "SHOP_NOW",
    imageStyle: "Producto tecnológico con iluminación dramática",
    imagePrompt: "Tech product with dramatic lighting, dark background, product photography, high contrast",
    ageMin: 15,
    ageMax: 55,
    interests: ["Tecnología", "Innovación", "Electrónica", "Compras online"],
    budget: 7000,
  },
};

export class AdStrategist {
  private tenant: TenantContext;

  constructor(tenant?: TenantContext) {
    this.tenant = tenant || tenantManager.getDefaultTenant();
  }

  getStrategyForProduct(product: any): AdStrategy {
    const name = (product.name || "").toLowerCase();
    const category = (product.category || "").toLowerCase();
    const desc = (product.description || "").toLowerCase();

    if (name.includes("macbook") || name.includes("macbook pro") || name.includes("mac") || category.includes("apple")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.macbooks_apple };
    }
    if (name.includes("monitor") || category.includes("monitor") || category.includes("pantalla") || desc.includes("monitor")) {
      if (name.includes("ultrawide") || name.includes("ultra wide") || name.includes("4k")) {
        const s = { ...WINNING_STRATEGIES_BY_NICHE.monitores };
        s.hook = "Experimenta la ultrawide, no hay vuelta atrás 🖥️";
        s.angle = "Monitores ultrawide y 4K para profesionales que exigen lo mejor";
        return s;
      }
      return { ...WINNING_STRATEGIES_BY_NICHE.monitores };
    }
    if (name.includes("teclado") || name.includes("mouse") || name.includes("combo") || name.includes("pop icon") || name.includes("receptor") || category.includes("teclado") || category.includes("mouse")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.perifericos };
    }
    if (name.includes("diadema") || name.includes("audífono") || name.includes("audifono") || name.includes("astro") || name.includes("g435") || name.includes("g733") || name.includes("g335") || name.includes("g522") || name.includes("gaming") || category.includes("audifono") || category.includes("diadema")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.audifonos_diademas };
    }
    if (name.includes("impresora") || name.includes("escaner") || name.includes("scanner") || name.includes("brother") || name.includes("epson")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.impresoras_scanner };
    }
    if (name.includes("laptop") || name.includes("portatil") || name.includes("notebook") || name.includes("acer") || name.includes("asus") || name.includes("vivobook")) {
      return { ...WINNING_STRATEGIES_BY_NICHE.laptops_portatiles };
    }

    return { ...WINNING_STRATEGIES_BY_NICHE.tecnologia_general };
  }

  async generateAdCopy(strategy: AdStrategy, product: any): Promise<{ primaryText: string; headline: string; description: string }> {
    const price = Number(product.price).toLocaleString("es-CO");
    const name = product.name || "";
    const desc = (product.description || "").substring(0, 150);

    const primaryText = `${strategy.hook}\n\n${name} por solo $${price} COP 🔥\n${desc}\n\n✅ Producto original con garantía\n✅ Envío a toda Colombia\n✅ ${strategy.angle}\n\n💳 Aceptamos Nequi, Daviplata, Mercado Pago y PayPal`;
    const headline = `${strategy.emojiTrigger || "🔥"} ${name.substring(0, 35)}`;
    const description = `Solo $${price} COP | Envío gratis`;

    return { primaryText, headline, description };
  }

  async createDraftAd(adAccount: string, accessToken: string, productId: number): Promise<DraftAd> {
    const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product) throw new Error("Producto no encontrado");

    const strategy = this.getStrategyForProduct(product);
    const adCopy = await this.generateAdCopy(strategy, product);

    let imageUrl = product.image_url || "";
    if (!imageUrl) {
      imageUrl = `https://placehold.co/1200x628/1A365D/FFFFFF?text=${encodeURIComponent((product.name || "").substring(0, 30))}`;
    }

    try {
      const act = `act_${adAccount}`;

      const campaign = await this.fbPost(act, "campaigns", accessToken, {
        name: `[BORRADOR] ${product.name} - ${new Date().toLocaleDateString("es-CO")}`,
        objective: "OUTCOME_SALES",
        status: "PAUSED",
        special_ad_categories: [],
      });

      const adSet = await this.fbPost(act, "adsets", accessToken, {
        name: `[BORRADOR] ${product.name} - Conjunto`,
        campaign_id: campaign.id,
        daily_budget: Math.round(strategy.budget * 100),
        billing_event: "IMPRESSIONS",
        optimization_goal: "CONVERSIONS",
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        targeting: {
          geo_locations: { countries: ["CO"] },
          age_min: strategy.ageMin,
          age_max: strategy.ageMax,
          interests: strategy.interests.map(name => ({ name })),
          publisher_platforms: ["facebook", "instagram"],
          facebook_positions: ["feed", "story", "marketplace", "reels"],
          instagram_positions: ["stream", "story", "reels"],
        },
        status: "PAUSED",
        start_time: new Date().toISOString(),
      });

      let imageHash = "";
      try {
        const imgRes = await this.fbPost(act, "adimages", accessToken, { url: imageUrl, name: product.name });
        if (imgRes?.images) {
          const key = Object.keys(imgRes.images)[0];
          imageHash = imgRes.images[key]?.hash || "";
        }
      } catch (err: any) {
        logger.warn({ err }, "[AdStrategist] Error uploading image");
      }

      const creative = await this.fbPost(act, "adcreatives", accessToken, {
        name: `[BORRADOR] ${product.name} - Creativo`,
        object_story_spec: {
          page_id: this.tenant.facebook?.pageId || process.env.FB_PAGE_ID || "",
          link_data: {
            link: `${process.env.APP_URL || "https://tecnovariedades.easypanel.host"}/productos/${product.id}`,
            message: adCopy.primaryText,
            name: adCopy.headline,
            description: adCopy.description,
            call_to_action: { type: strategy.ctaType },
            image_hash: imageHash,
          },
        },
      });

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

      return {
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
    } catch (err: any) {
      logger.error({ err, productId }, "[AdStrategist] Error creating draft ad");
      return {
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
    }
  }

  async createDraftsForAllProducts(): Promise<{ created: number; failed: number; drafts: DraftAd[] }> {
    const result = { created: 0, failed: 0, drafts: [] as DraftAd[] };

    const accessToken = this.tenant.facebook?.accessToken || process.env.FB_ACCESS_TOKEN || "";
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
    const data = await res.json();
    if (data.error) throw new Error(`${data.error.message} (código ${data.error.code})`);
    return data;
  }
}

export const adStrategist = new AdStrategist();
