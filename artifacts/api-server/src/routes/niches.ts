import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, nicheSearches, products } from "@workspace/db";
import { getProviderConfig, createAIClient } from "@workspace/integrations-openai-ai-server";
import type { TenantRequest } from "../lib/tenantManager";

const router = Router();

const searchSchema = z.object({
  query: z.string().min(2),
  category: z.string().optional(),
  region: z.string().optional().default("CO"),
});

const REGION_NAMES: Record<string, string> = {
  CO: "Colombia", MX: "México", AR: "Argentina", PE: "Perú", CL: "Chile", EC: "Ecuador", VE: "Venezuela",
};

router.post("/search", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

    const { query, category, region } = searchSchema.parse(req.body);
    const regionName = REGION_NAMES[region] ?? "Latinoamérica";

    const providerConfig = getProviderConfig("github");
    if (!providerConfig) return res.status(500).json({ message: "Proveedor de IA no disponible. Verifica el token de GitHub." });

    const client = createAIClient(providerConfig);

    const prompt = `Eres un experto en dropshipping y comercio electrónico en ${regionName}.
Analiza este nicho para dropshipping: "${query}"${category ? ` (categoría: ${category})` : ""}.

Responde SOLO con JSON válido (sin markdown, sin texto extra):
{
  "nicheName": "Nombre del nicho",
  "summary": "Descripción breve del potencial del nicho (2-3 oraciones)",
  "demandScore": 82,
  "competitionLevel": "medium",
  "estimatedMargin": 45,
  "monthlySearchVolume": "8.000-15.000",
  "trendDirection": "up",
  "targetAudience": "Descripción del público objetivo",
  "recommendedPrice": { "min": 50000, "max": 180000 },
  "currency": "COP",
  "trendingProducts": [
    {
      "name": "Nombre del producto",
      "estimatedCost": 25000,
      "estimatedSellPrice": 85000,
      "margin": 70,
      "demandLevel": "high",
      "description": "Descripción vendedora del producto (2 oraciones)",
      "keywords": ["keyword1", "keyword2", "keyword3"],
      "imageSearch": "término de búsqueda de imagen en inglés"
    }
  ],
  "marketInsights": ["Insight de mercado 1", "Insight 2", "Insight 3"],
  "topChannels": ["WhatsApp", "Instagram", "Facebook Ads"],
  "seasonality": "Descripción de temporadas altas",
  "warnings": ["Aviso relevante si aplica"]
}
Incluye 5-8 productos trending. Precios en COP. Sé específico para ${regionName}.`;

    const completion = await client.chat.completions.create({
      model: providerConfig.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 2500,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    let results: object;
    try {
      results = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: "No se pudo parsear el resultado", raw };
    } catch {
      results = { error: "JSON inválido en respuesta de IA", raw };
    }

    const [saved] = await db.insert(nicheSearches).values({
      tenantId,
      query,
      category: category ?? null,
      region,
      results: JSON.stringify(results),
    }).returning();

    return res.json({ id: saved.id, results });
  } catch (e) { return next(e); }
});

router.get("/saved", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const searches = await db.select().from(nicheSearches)
      .where(eq(nicheSearches.tenantId, tenantId))
      .orderBy(desc(nicheSearches.createdAt))
      .limit(20);
    return res.json(searches.map((s) => ({ ...s, results: (() => { try { return JSON.parse(s.results); } catch { return {}; } })() })));
  } catch (e) { return next(e); }
});

const importSchema = z.object({
  products: z.array(z.object({
    name: z.string(),
    description: z.string(),
    price: z.number(),
    cost: z.number().optional(),
    keywords: z.array(z.string()).optional(),
    imageUrl: z.string().optional(),
  })),
  category: z.string().optional(),
});

router.post("/import", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const { products: prods, category } = importSchema.parse(req.body);

    const inserted = [];
    for (const p of prods) {
      const [product] = await db.insert(products).values({
        tenantId,
        name: p.name,
        description: p.description,
        price: p.price.toString(),
        currency: "COP",
        kind: "physical",
        category: category ?? "dropshipping",
        isActive: true,
        imageUrl: p.imageUrl ?? null,
        metadata: JSON.stringify({ source: "niche_research", keywords: p.keywords ?? [], cost: p.cost }),
      }).returning();
      inserted.push(product);
    }

    return res.json({ ok: true, inserted: inserted.length, products: inserted });
  } catch (e) { return next(e); }
});

export default router;
