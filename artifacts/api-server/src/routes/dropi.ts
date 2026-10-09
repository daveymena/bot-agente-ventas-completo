/**
 * /api/dropi — Dropi DIRECTO desde el panel (sin WooCommerce).
 * Ver lib/dropi-directo.ts. Todo va con el token del negocio.
 */
import { Router } from "express";
import { logger } from "../lib/logger";
import { enmascararSecreto, secretoNuevo } from "../lib/secretos";

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
      tokenHuella: token ? enmascararSecreto(token) : null,
      integracion: token ? integracionDelToken(token) : null,
      sugerencia: sugerido ? { tokenHuella: enmascararSecreto(sugerido), integracion: integracionDelToken(sugerido) } : null,
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
    // Vacío o enmascarado no es un token nuevo.
    let token = secretoNuevo(req.body?.token) || "";
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
    const porPagina = Math.min(50, Number(req.query.porPagina) || 24);
    const r = await buscarProductosDropi(token, { q: String(req.query.q || ""), conStock: String(req.query.conStock || "") === "1", categoria: Number(req.query.categoria) || undefined, pagina: Number(req.query.pagina) || 1, porPagina });
    if (!r.ok) return res.status(200).json({ ok: false, error: /exceeded/i.test(String(r.error)) ? "Dropi limitó las peticiones por un momento: esperá un minuto y volvé a buscar." : `Dropi no respondió: ${r.error}` });
    const { db, products } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const propios = await db.select({ id: products.id, metadata: products.metadata }).from(products).where(eq(products.tenantId, tenantId));
    const importados = new Map<number, number>();
    for (const p of propios as any[]) { try { const m = typeof p.metadata === "string" ? JSON.parse(p.metadata) : p.metadata; if (m?.dropiProductId) importados.set(Number(m.dropiProductId), p.id); } catch { /* nada */ } }
    const { fotosDe, stockDe, proveedorDe, bodegaDe } = await import("../lib/dropi-directo");
    res.json({
      ok: true,
      // Página llena = puede haber más (Dropi no manda el total con no_count).
      hayMas: (r.data || []).length >= porPagina,
      ...(String(req.query.raw || "") === "1" ? { crudo: (r.data || []).slice(0, 2) } : {}),
      productos: (r.data || []).map((p) => ({
        id: p.id, nombre: p.name, precioSugerido: p.suggested_price ?? null, costo: p.sale_price ?? null, stock: stockDe(p),
        proveedor: proveedorDe(p).nombre, categoria: p.categories?.[0]?.name || null, foto: fotosDe(p)[0] || null, tipo: p.type || null,
        bodega: bodegaDe(p),
        importadoComo: importados.get(Number(p.id)) || null,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/** Importar uno o varios productos. */
/**
 * Sonda para MEDIR la API de Dropi (solo administrador de la plataforma):
 * `?path=orders/myorders&method=GET`. Sirve para descubrir qué devuelve un
 * endpoint antes de escribir código que lo suponga.
 */
router.get("/sonda", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId || !req.tenant?.isAdmin) return res.status(403).json({ ok: false, error: "Solo administrador" });
    const { tokenDropiDelTenant, dropiIntegracion } = await import("../lib/dropi-directo");
    const token = await tokenDropiDelTenant(tenantId);
    if (!token) return res.status(400).json({ ok: false, error: "Sin token de Dropi" });
    const path = String(req.query.path || "").replace(/^\/+/, "");
    if (!path || /orders\/myorders$/.test(path) && String(req.query.method || "GET").toUpperCase() === "POST") return res.status(400).json({ ok: false, error: "Ruta inválida o no permitida (no se crean pedidos desde acá)" });
    let body: any = undefined;
    if (req.query.body) { try { body = JSON.parse(String(req.query.body)); } catch { return res.status(400).json({ ok: false, error: "body no es JSON" }); } }
    const r = await dropiIntegracion<any>(token, path, body, String(req.query.method || "GET").toUpperCase() as any, 20000);
    res.json(r);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/** Detalle de un producto de Dropi: fotos (todas, sin repetir por contenido), stock, variaciones. `?raw=1` agrega lo crudo. */
router.get("/producto/:id", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ ok: false, error: "No autenticado" });
    const { tokenDropiDelTenant, detalleProductoDropi, fotosDe, stockDe, proveedorDe, bodegaDe } = await import("../lib/dropi-directo");
    const token = await tokenDropiDelTenant(tenantId);
    if (!token) return res.status(400).json({ ok: false, error: "Sin token de Dropi" });
    const r = await detalleProductoDropi(token, Number(req.params.id));
    if (!r.ok || !r.data) return res.status(200).json({ ok: false, error: r.error });
    const p = r.data;
    const todas = fotosDe(p);
    let unicas = todas;
    try {
      const { fotosUnicasDelProducto } = await import("../lib/fotos-de-producto");
      unicas = await fotosUnicasDelProducto({ imageUrl: todas[0] || null, metadata: { imagenes: todas } }, { max: 20, timeoutMs: 6000 });
    } catch { /* se muestran tal cual */ }
    res.json({
      ok: true,
      producto: { id: p.id, nombre: p.name, tipo: p.type || null, precioSugerido: p.suggested_price ?? null, costo: p.sale_price ?? null, stock: stockDe(p), proveedor: proveedorDe(p).nombre, bodega: bodegaDe(p), categoria: p.categories?.[0]?.name || null, variaciones: (p.variations || []).length },
      fotos: { encontradas: todas.length, unicas: unicas.length, urls: unicas, repetidas: todas.filter((u) => !unicas.includes(u)) },
      ...(String(req.query.raw || "") === "1" ? { crudo: p } : {}),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/** Transportadoras que llegan a una ciudad (`?ciudad=CALI&departamento=VALLE`). Lo mismo que ve el bot. `?raw=1` agrega la respuesta cruda para diagnosticar la forma de Dropi. */
/**
 * Cotizar el envío de un producto del catálogo a una ciudad: transportadoras
 * disponibles con flete, comisión, lo del proveedor y la ganancia. Es el mismo
 * cotizador del panel de Dropi (ver lib/dropi-cotizador.ts). Solo para el
 * negocio: el flete no se le muestra al cliente.
 */
router.get("/cotizar", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ ok: false, error: "No autenticado" });
    const productId = Number(req.query.productId);
    const ciudad = String(req.query.ciudad || "").trim();
    if (!productId || !ciudad) return res.status(400).json({ ok: false, error: "Faltan productId y ciudad" });
    const { cotizarProductoDelCatalogo } = await import("../lib/dropi-cotizador");
    const r = await cotizarProductoDelCatalogo(tenantId, productId, {
      ciudad, departamento: String(req.query.departamento || "") || null,
      cantidad: Number(req.query.cantidad) || 1, precioUnitario: Number(req.query.precio) || null,
      conRecaudo: String(req.query.recaudo ?? "1") !== "0",
    });
    res.json(r);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/transportadoras", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ ok: false, error: "No autenticado" });
    const ciudad = String(req.query.ciudad || "").trim();
    if (!ciudad) return res.status(400).json({ ok: false, error: "Falta ?ciudad=" });
    const { tokenDropiDelTenant, transportadorasQueLlegan } = await import("../lib/dropi-directo");
    const token = await tokenDropiDelTenant(tenantId);
    if (!token) return res.status(400).json({ ok: false, error: "Sin token de Dropi" });
    const r = await transportadorasQueLlegan(token, { ciudad, departamento: String(req.query.departamento || "") });
    if (!r.ok) return res.status(200).json({ ok: false, error: r.error });
    res.json({
      ok: true, fuente: r.data?.fuente, nota: r.data?.nota, ciudad: r.data?.ciudad ?? null,
      transportadoras: (r.data?.transportadoras || []).map((t) => ({ id: t.id, nombre: t.nombre })),
      ...(String(req.query.raw || "") === "1" ? { crudo: r.data?.transportadoras } : {}),
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/** Video de anuncio con el motor propio (ver lib/video-anuncio.ts). */
router.post("/video/:productId", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ ok: false, error: "No autenticado" });
    const { generarVideoEnSegundoPlano, hayFfmpeg } = await import("../lib/video-anuncio");
    if (!(await hayFfmpeg())) return res.status(503).json({ ok: false, error: "El servidor no tiene ffmpeg." });
    const id = Number(req.params.productId);
    const estado = generarVideoEnSegundoPlano(tenantId, id, async (r) => {
      try { const { avisarAlDueno } = await import("../lib/avisos"); await avisarAlDueno(tenantId, r.ok && r.video ? `🎬 *Video de anuncio listo* (${r.video.duracion}s)\n${r.video.url}` : `⚠️ No pude generar el video del producto ${id}: ${r.error}`); } catch { /* sin aviso */ }
    });
    res.json({ ok: true, estado });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});
router.get("/video/:productId", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ ok: false, error: "No autenticado" });
    const { leerVideoDeProducto, videoEnCurso } = await import("../lib/video-anuncio");
    const id = Number(req.params.productId);
    res.json({ ok: true, enCurso: videoEnCurso(id), video: await leerVideoDeProducto(tenantId, id) });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

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
      const r = await importarProductoDropi(tenantId, token, id, { precio: Number(it?.precio) || null, curar: req.body?.curar !== false });
      resultados.push({ dropiProductId: id, ...r });
      // Lanzamiento manual: solo si el admin lo pide explícitamente
      // (lanzar:true). Antes era automático por defecto y cada producto
      // nuevo subía borrador a Meta sin aprobación.
      if (r.ok && r.productId && !r.yaExistia && req.body?.lanzar === true) {
        const pid = r.productId;
        import("../lib/lanzamiento").then(({ lanzarProducto }) => lanzarProducto(tenantId, pid, { conAnuncio: false })).catch((e) => logger.warn({ productId: pid, err: e?.message }, "[Lanzamiento] manual falló"));
      }
    }
    res.json({ ok: resultados.every((r) => r.ok), resultados, lanzamientoAutomatico: req.body?.lanzar === true });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/** Categorías de Dropi (para el filtro del catálogo). Cambian poco: caché de 1 h. */
let cacheCategorias: { en: number; data: Array<{ id: number; name: string }> } | null = null;
router.get("/categorias", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    if (cacheCategorias && Date.now() - cacheCategorias.en < 3_600_000) return res.json({ ok: true, categorias: cacheCategorias.data });
    const { tokenDropiDelTenant, categoriasDropi } = await import("../lib/dropi-directo");
    const token = await tokenDropiDelTenant(tenantId);
    if (!token) return res.status(400).json({ ok: false, error: "Sin token de Dropi" });
    const r = await categoriasDropi(token);
    if (!r.ok) return res.json({ ok: false, categorias: [], error: r.error });
    const data = (r.data || []).filter((c) => c.id && c.name).sort((a, b) => a.name.localeCompare(b.name, "es"));
    cacheCategorias = { en: Date.now(), data };
    res.json({ ok: true, categorias: data });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * Importar EN LOTE, en segundo plano (ver lib/dropi-importacion-lote.ts).
 * Body: { items?: [{dropiProductId, precio?}], busqueda?: {q, conStock, max}, curar?, factorSobreCosto? }
 */
router.post("/importar-lote", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const { tokenDropiDelTenant } = await import("../lib/dropi-directo");
    const token = await tokenDropiDelTenant(tenantId);
    if (!token) return res.status(400).json({ ok: false, error: "Sin token de Dropi" });
    const { iniciarLote, idsDesdeBusqueda } = await import("../lib/dropi-importacion-lote");
    let items: Array<{ dropiProductId: number; precio?: number | null }> = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length && req.body?.busqueda?.q) {
      const b = await idsDesdeBusqueda(tenantId, token, String(req.body.busqueda.q), { conStock: req.body.busqueda.conStock !== false, max: Number(req.body.busqueda.max) || 20 });
      if (!b.ids.length) return res.status(400).json({ ok: false, error: b.error ? `Dropi no respondió: ${b.error}` : `No hay productos nuevos para "${req.body.busqueda.q}"${b.yaEstaban ? ` (${b.yaEstaban} ya estaban en tu catálogo)` : ""}.` });
      items = b.ids.map((id) => ({ dropiProductId: id }));
    }
    const r = iniciarLote(tenantId, token, items, { curar: req.body?.curar !== false, factorSobreCosto: Number(req.body?.factorSobreCosto) || null, origen: "panel" });
    if (!r.ok) return res.status(409).json(r);
    res.json({ ok: true, lote: r.lote });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/importar-lote", async (req: any, res: any) => {
  const tenantId = tenantDe(req);
  if (!tenantId) return res.status(401).json({ error: "No autenticado" });
  const { loteDelNegocio } = await import("../lib/dropi-importacion-lote");
  res.json({ ok: true, lote: loteDelNegocio(tenantId) });
});

router.post("/importar-lote/detener", async (req: any, res: any) => {
  const tenantId = tenantDe(req);
  if (!tenantId) return res.status(401).json({ error: "No autenticado" });
  const { detenerLote } = await import("../lib/dropi-importacion-lote");
  res.json({ ok: detenerLote(tenantId) });
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

/** POST /api/dropi/lanzar/:productId — paquete de lanzamiento (corre en segundo plano). */
router.post("/lanzar/:productId", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const productId = Number(req.params.productId);
    if (!productId) return res.status(400).json({ ok: false, error: "productId inválido" });
    const { lanzarProducto } = await import("../lib/lanzamiento");
    void lanzarProducto(tenantId, productId, { presupuestoDiario: Number(req.body?.presupuestoDiario) || null, conAnuncio: req.body?.conAnuncio === true, forzar: !!req.body?.forzar })
      .catch((e) => logger.error({ productId, err: e?.message }, "[Lanzamiento] falló"));
    res.json({ ok: true, enMarcha: true, mensaje: "Lanzamiento en marcha (2-5 min). El resumen llega por WhatsApp; también se ve en GET /api/dropi/lanzamiento/:productId." });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/lanzamiento/:productId", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const { db, products } = await import("@workspace/db");
    const { and, eq } = await import("drizzle-orm");
    const [p] = await db.select().from(products).where(and(eq(products.id, Number(req.params.productId)), eq(products.tenantId, tenantId))).limit(1);
    if (!p) return res.status(404).json({ ok: false, error: "Producto no encontrado" });
    let m: any = {}; try { m = typeof (p as any).metadata === "string" ? JSON.parse((p as any).metadata) : ((p as any).metadata || {}); } catch { /* nada */ }
    res.json({ ok: true, lanzamiento: m?.lanzamiento || null, curado: m?.curado || null });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
