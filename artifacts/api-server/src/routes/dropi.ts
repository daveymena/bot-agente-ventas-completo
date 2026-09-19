/**
 * /api/dropi — Dropi DIRECTO desde el panel (sin WooCommerce).
 * Ver lib/dropi-directo.ts. Todo va con el token del negocio.
 */
import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

const tenantDe = (req: any): number | null => Number(req.tenant?.id) || null;

/** Estado de la conexión: hay token, es válido, integración, sugerencia desde Woo. */
router.get("/config", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const { tokenDropiDelTenant, integracionDelToken, tokenSugeridoDesdeWoo } = await import("../lib/dropi-directo");
    const token = await tokenDropiDelTenant(tenantId);
    const sugerido = token ? null : await tokenSugeridoDesdeWoo(tenantId);
    res.json({
      conectado: !!token,
      tokenHuella: token ? `${token.slice(0, 6)}…${token.slice(-6)}` : null,
      integracion: token ? integracionDelToken(token) : null,
      sugerencia: sugerido ? { tokenHuella: `${sugerido.slice(0, 6)}…${sugerido.slice(-6)}`, integracion: integracionDelToken(sugerido) } : null,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** Probar un token sin guardarlo. */
router.post("/probar", async (req: any, res: any) => {
  try {
    if (!tenantDe(req)) return res.status(401).json({ error: "No autenticado" });
    const { probarTokenDropi } = await import("../lib/dropi-directo");
    res.json(await probarTokenDropi(String(req.body?.token || "")));
  } catch (error: any) {
    res.status(500).json({ ok: false, detalle: error.message });
  }
});

/** Guardar el token (se prueba antes). `desdeWoo: true` toma el que Dropify dejó en WooCommerce. */
router.put("/config", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const { probarTokenDropi, guardarTokenDropi, tokenSugeridoDesdeWoo, integracionDelToken } = await import("../lib/dropi-directo");
    let token = String(req.body?.token || "").trim();
    if (!token && req.body?.desdeWoo) token = (await tokenSugeridoDesdeWoo(tenantId)) || "";
    if (!token) return res.status(400).json({ ok: false, detalle: "Falta el token." });
    const p = await probarTokenDropi(token);
    if (!p.ok) return res.status(400).json(p);
    await guardarTokenDropi(tenantId, token);
    logger.info({ tenantId }, "[Dropi] token de integración guardado desde el panel");
    res.json({ ok: true, detalle: p.detalle, integracion: integracionDelToken(token) });
  } catch (error: any) {
    res.status(500).json({ ok: false, detalle: error.message });
  }
});

router.delete("/config", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const { guardarClaveDeTenant } = await import("../lib/ai-keys-tenant");
    await guardarClaveDeTenant(tenantId, "dropi", { apiKey: "" });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/** Buscar en el catálogo de Dropi. */
router.get("/buscar", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const { tokenDropiDelTenant, buscarProductosDropi } = await import("../lib/dropi-directo");
    const token = await tokenDropiDelTenant(tenantId);
    if (!token) return res.status(400).json({ ok: false, error: "Sin token de Dropi" });
    const r = await buscarProductosDropi(token, { q: String(req.query.q || ""), conStock: String(req.query.conStock || "") === "1", pagina: Number(req.query.pagina) || 1, porPagina: Math.min(50, Number(req.query.porPagina) || 24) });
    if (!r.ok) return res.status(502).json({ ok: false, error: r.error });
    const { db, products } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const propios = await db.select({ id: products.id, metadata: products.metadata }).from(products).where(eq(products.tenantId, tenantId));
    const importados = new Map<number, number>();
    for (const p of propios as any[]) { try { const m = typeof p.metadata === "string" ? JSON.parse(p.metadata) : p.metadata; if (m?.dropiProductId) importados.set(Number(m.dropiProductId), p.id); } catch { /* nada */ } }
    const fotos = (p: any): string | null => {
      const cands = [p.image, ...(p.gallery || []), ...(p.photos || []), ...(p.images || [])].flat();
      for (const c of cands) { const u = typeof c === "string" ? c : (c?.urlS3 || c?.url || c?.src); if (u && /^https?:/i.test(u)) return u; }
      return null;
    };
    res.json({
      ok: true,
      productos: (r.data || []).map((p) => ({
        id: p.id, nombre: p.name, precioSugerido: p.suggested_price ?? null, costo: p.sale_price ?? null, stock: p.stock ?? null,
        proveedor: p.user_id ?? null, categoria: p.categories?.[0]?.name || null, foto: fotos(p), tipo: p.type || null,
        importadoComo: importados.get(Number(p.id)) || null,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/** Importar uno o varios productos. */
router.post("/importar", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const { tokenDropiDelTenant, importarProductoDropi } = await import("../lib/dropi-directo");
    const token = await tokenDropiDelTenant(tenantId);
    if (!token) return res.status(400).json({ ok: false, error: "Sin token de Dropi" });
    const items: Array<{ dropiProductId: number; precio?: number | null }> = Array.isArray(req.body?.items) ? req.body.items : [{ dropiProductId: Number(req.body?.dropiProductId), precio: req.body?.precio }];
    const resultados = [];
    for (const it of items.slice(0, 50)) {
      const id = Number(it?.dropiProductId);
      if (!id) continue;
      resultados.push({ dropiProductId: id, ...(await importarProductoDropi(tenantId, token, id, { precio: Number(it?.precio) || null })) });
    }
    res.json({ ok: resultados.every((r) => r.ok), resultados });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/** Verificar disponibilidad (y vincular lo que vino de Woo). */
router.post("/verificar", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const { tokenDropiDelTenant, verificarDisponibilidadDropi, vincularCatalogoDeWoo } = await import("../lib/dropi-directo");
    const token = await tokenDropiDelTenant(tenantId);
    if (!token) return res.status(400).json({ ok: false, error: "Sin token de Dropi" });
    const vinculo = await vincularCatalogoDeWoo(tenantId).catch(() => ({ vinculados: 0, sinDato: 0 }));
    const r = await verificarDisponibilidadDropi(tenantId, token);
    res.json({ ok: true, vinculo, ...r });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
