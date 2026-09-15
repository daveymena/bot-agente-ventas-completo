/**
 * Landing Studio v2 — Chat con OpenCode para generar landing pages dinámicas.
 *
 * En vez de plantillas estáticas, OpenCode genera HTML+CSS completos (inline,
 * responsive) usando imágenes reales del producto + Unsplash. El admin puede
 * iterar el diseño con mensajes de chat normales.
 *
 * POST /api/landing-studio/chat
 *   Genera o edita una landing. Acepta landingId para editar existente.
 *   Devuelve { html, landingId }.
 *
 * POST /api/landing-studio/generate
 *   Genera múltiples landings de una sola vez (un producto = una landing).
 *   Acepta { productIds: number[], instruction?: string }.
 *   Devuelve { results: Array<{ productId, html, landingId }> }.
 */
import { Router } from "express";
import { requireAdmin, type TenantRequest } from "../lib/tenantManager";
import { logger } from "../lib/logger";
import { db, landingPages, products } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

// ── Configuración OpenCode (misma que operator-opencode.ts) ────────────────
function opencodeConfig(): { host: string; authHeader: string } | null {
  const host = process.env.ATLAS_OPENCODE_HOST;
  const user = process.env.ATLAS_OPENCODE_USER;
  const pass = process.env.ATLAS_OPENCODE_PASS;
  if (!host || !user || !pass) return null;
  return {
    host: host.replace(/\/+$/, ""),
    authHeader: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
  };
}

// Serialización simple para evitar carreras entre landings concurrentes.
let queue: Promise<any> = Promise.resolve();
function conCandado<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(() => undefined, () => undefined);
  return run;
}

async function createSession(host: string, authHeader: string): Promise<string> {
  const res = await fetch(`${host}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: "{}",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`No se pudo crear sesión OpenCode (${res.status})`);
  const data = (await res.json()) as any;
  if (!data?.id) throw new Error("OpenCode no devolvió id de sesión");
  return data.id;
}

interface OpencodePart { type: string; text?: string; [k: string]: any }

async function sendMessage(
  host: string, authHeader: string, sessionId: string,
  opts: { system: string; text: string; timeoutMs: number },
): Promise<{ text: string; error?: string }> {
  const res = await fetch(`${host}/session/${sessionId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({
      agent: "general",
      model: { providerID: "opencode", modelID: "big-pickle" },
      system: opts.system,
      tools: {},
      parts: [{ type: "text", text: opts.text }],
    }),
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
  if (!res.ok) throw new Error(`OpenCode respondió ${res.status}`);
  const data = (await res.json()) as any;
  if (data?.info?.error) {
    return { text: "", error: data.info.error.data?.message || data.info.error.name || "Error de OpenCode" };
  }
  const parts: OpencodePart[] = Array.isArray(data?.parts) ? data.parts : [];
  const text = parts.filter(p => p.type === "text" && p.text).map(p => p.text!.trim()).join("\n\n").trim();
  return { text };
}

// ── Prompt del sistema para generación de landings ─────────────────────────
function systemPrompt(): string {
  return `Eres el generador de Landing Pages de VentasPro. Creas landing pages HTML+CSS completas, profesionales y dinámicas.

REGLAS ESTRICTAS:
1. Devuelves SOLO HTML válido. Sin markdown, sin \`\`\`html, sin explicaciones.
2. TODO el CSS va INLINE en cada elemento (style="..."). Sin <style> ni clases externas.
3. Responsive: usa media queries inline o flex/grid que se adapten a móvil y desktop.
4. Imágenes: usa URLs reales del producto que te doy. Si no hay imagen, usa picsum.photos o placehold.co.
5. Google Fonts: puedes usar <link> para tipografías de Google (Inter, Playfair Display, etc.).
6. Colores: usa la paleta que te indico o elige colores profesionales acordes al producto.
7. El HTML debe ser una landing page COMPLETA: hero, beneficios, oferta, CTA, FAQ si aplica.
8. Copy persuasivo: AIDA (Atención, Interés, Deseo, Acción). Sin relleno, sin adjetivos vacíos.
9. Un solo botón de acción principal visible (CTA).
10. NO uses <script>除非 sea para algo trivial como smooth scroll.
11. Responsive design: que se vea bien en celular (375px) y desktop (1200px+).
12. El HTML debe ser AUTÓNOMO: que funcione solo, sin dependencias externas除了 Google Fonts.

FORMATO DE SALIDA:
Solo el HTML completo empezando con <!DOCTYPE html> y terminando con </html>.
Sin nada más alrededor.`;
}

function buildUserPrompt(product: any, existingHtml: string | null, instruction: string): string {
  let prompt = `PRODUCTO:
- Nombre: ${product.name}
- Descripción: ${product.description || "N/A"}
- Precio: ${product.price} ${product.currency || "USD"}
- Tipo: ${product.kind || "digital"}
- Imagen: ${product.imageUrl || "Ninguna"}
- Highlight: ${product.highlight || "N/A"}
- Features: ${(product.features || []).join(", ") || "N/A"}
- Link de pago: ${product.paymentLink || "N/A"}`;

  if (existingHtml) {
    prompt += `\n\nHTML ACTUAL DE LA LANDING (para que edites):\n${existingHtml}`;
    prompt += `\n\nINSTRUCCIÓN DEL ADMIN: ${instruction}`;
  } else {
    prompt += `\n\nINSTRUCCIÓN: ${instruction || "Genera una landing page profesional y dinámica para este producto."}`;
  }

  return prompt;
}

// ── POST /api/landing-studio/test ──────────────────────────────────────────
// Endpoint de prueba SIN auth para verificar conexión OpenCode.
router.post("/test", async (req, res) => {
  try {
    const { message, productId } = req.body as { message?: string; productId?: number };
    if (!message?.trim()) return res.status(400).json({ message: "Falta el mensaje" });

    const config = opencodeConfig();
    if (!config) return res.status(503).json({ message: "OpenCode no configurado (faltan ATLAS_OPENCODE_* env vars)" });

    let product: any = null;
    if (productId) {
      const rows = await db.select().from(products).where(eq(products.id, productId));
      product = rows[0] || null;
    }

    const userPrompt = product
      ? `PRODUCTO: ${product.name} - ${product.description || "N/A"} - Precio: ${product.price} ${product.currency || "USD"} - Tipo: ${product.kind || "digital"} - Imagen: ${product.imageUrl || "Ninguna"}\n\nINSTRUCCIÓN: ${message}`
      : `INSTRUCCIÓN: ${message}`;

    const startTime = Date.now();
    const result = await conCandado(async () => {
      const sessionId = await createSession(config.host, config.authHeader);
      return await sendMessage(config.host, config.authHeader, sessionId, {
        system: systemPrompt(),
        text: userPrompt,
        timeoutMs: 120_000,
      });
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.error) {
      return res.status(500).json({ error: result.error, elapsed: `${elapsed}s` });
    }

    let html = result.text.trim();
    const codeBlockMatch = html.match(/```(?:html)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) html = codeBlockMatch[1].trim();

    return res.json({ html, elapsed: `${elapsed}s`, length: html.length });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[LandingStudio/test] error");
    return res.status(500).json({ error: e?.message || "Error interno" });
  }
});

// ── POST /api/landing-studio/chat ──────────────────────────────────────────
router.post("/chat", async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "No autenticado" });

    const { message, landingId, productId } = req.body as {
      message?: string; landingId?: number; productId?: number;
    };
    if (!message?.trim()) return res.status(400).json({ message: "Falta el mensaje" });

    const config = opencodeConfig();
    if (!config) return res.status(503).json({ message: "OpenCode no configurado (faltan ATLAS_OPENCODE_* env vars)" });

    // Buscar producto si se dio uno
    let product: any = null;
    if (productId) {
      const rows = await db.select().from(products).where(eq(products.id, productId));
      product = rows[0] || null;
    }

    // Buscar landing existente si se dio una
    let existingHtml: string | null = null;
    let existingLanding: any = null;
    if (landingId) {
      const rows = await db.select().from(landingPages).where(and(eq(landingPages.id, landingId), eq(landingPages.tenantId, tenantId)));
      existingLanding = rows[0] || null;
      existingHtml = existingLanding?.html || null;
    }

    if (!product && !existingHtml) {
      return res.status(400).json({ message: "Selecciona un producto para generar la landing." });
    }

    const userPrompt = buildUserPrompt(product, existingHtml, message);

    // Llamar a OpenCode
    const result = await conCandado(async () => {
      const sessionId = await createSession(config.host, config.authHeader);
      return await sendMessage(config.host, config.authHeader, sessionId, {
        system: systemPrompt(),
        text: userPrompt,
        timeoutMs: 120_000, // 2 min para generar HTML completo
      });
    });

    if (result.error) {
      logger.error({ error: result.error }, "[LandingStudio] OpenCode error");
      return res.status(500).json({ message: `Error de OpenCode: ${result.error}` });
    }

    // Extraer solo el HTML (el modelo a veces envuelve en markdown)
    let html = result.text.trim();
    const codeBlockMatch = html.match(/```(?:html)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) html = codeBlockMatch[1].trim();
    if (!html.includes("<!DOCTYPE") && !html.includes("<html")) {
      // Si no es HTML válido, envolver
      html = result.text;
    }

    // Guardar en la DB
    let savedLandingId = landingId;
    if (landingId && existingLanding) {
      // Actualizar existente
      await db.update(landingPages)
        .set({ html, updatedAt: new Date() })
        .where(eq(landingPages.id, landingId));
      savedLandingId = landingId;
    } else {
      // Crear nueva
      const slug = (product?.name || "landing")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        .slice(0, 60) + "-" + Date.now().toString(36);
      const inserted = await db.insert(landingPages).values({
        tenantId,
        productId: productId || null,
        name: `Landing · ${product?.name || "Sin nombre"}`,
        slug,
        status: "draft",
        strategy: {},
        sections: [],
        design: {},
        source: productId ? { type: "product", productId } : {},
        html,
      }).returning({ id: landingPages.id });
      savedLandingId = inserted[0]?.id;
    }

    return res.json({ html, landingId: savedLandingId });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[LandingStudio] error general");
    return res.status(500).json({ message: e?.message || "Error interno" });
  }
});

// ── POST /api/landing-studio/generate ──────────────────────────────────────
// Genera múltiples landings de una sola vez.
router.post("/generate", requireAdmin, async (req: TenantRequest, res) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

    const { productIds, instruction } = req.body as { productIds?: number[]; instruction?: string };
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: "Envía al menos un productId" });
    }
    if (productIds.length > 10) {
      return res.status(400).json({ message: "Máximo 10 productos por lote" });
    }

    const config = opencodeConfig();
    if (!config) return res.status(503).json({ message: "OpenCode no configurado" });

    // Buscar todos los productos
    const allProducts = await db.select().from(products).where(
      and(eq(products.tenantId, tenantId))
    );
    const productMap = new Map(allProducts.map(p => [p.id, p]));

    const results: Array<{ productId: number; html: string; landingId: number }> = [];
    const errors: Array<{ productId: number; error: string }> = [];

    for (const pid of productIds) {
      const product = productMap.get(pid);
      if (!product) {
        errors.push({ productId: pid, error: "Producto no encontrado" });
        continue;
      }

      try {
        const userPrompt = buildUserPrompt(product, null, instruction || "Genera una landing page profesional y dinámica.");

        const result = await conCandado(async () => {
          const sessionId = await createSession(config.host, config.authHeader);
          return await sendMessage(config.host, config.authHeader, sessionId, {
            system: systemPrompt(),
            text: userPrompt,
            timeoutMs: 120_000,
          });
        });

        if (result.error) {
          errors.push({ productId: pid, error: result.error });
          continue;
        }

        let html = result.text.trim();
        const codeBlockMatch = html.match(/```(?:html)?\s*\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch) html = codeBlockMatch[1].trim();

        const slug = (product.name || "landing")
          .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
          .slice(0, 60) + "-" + Date.now().toString(36);

        const inserted = await db.insert(landingPages).values({
          tenantId,
          productId: pid,
          name: `Landing · ${product.name}`,
          slug,
          status: "draft",
          strategy: {},
          sections: [],
          design: {},
          source: { type: "product", productId: pid },
          html,
        }).returning({ id: landingPages.id });

        results.push({ productId: pid, html, landingId: inserted[0]?.id || 0 });
      } catch (e: any) {
        errors.push({ productId: pid, error: e?.message || "Error desconocido" });
      }
    }

    return res.json({ results, errors: errors.length ? errors : undefined });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[LandingStudio] error en batch");
    return res.status(500).json({ message: e?.message || "Error interno" });
  }
});

export default router;
