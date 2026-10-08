import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { requirePlatformOwner } from "../middleware/requirePlatformOwner";
import { enlaceDeEntradaForge } from "../lib/landingforge-client";
import { logger } from "../lib/logger";

/**
 * GET /api/landing-forge/entrar → redirige al panel de Landing Forge con la
 * sesión ya abierta (enlace firmado de 2 minutos). Solo el dueño de la
 * plataforma: las landings de Forge son las suyas, no las de los clientes del
 * SaaS. Es lo que abre el botón "Landing Studio" del menú.
 *
 * POST /api/landing-forge/pedido → el formulario de una landing de Forge.
 * Auditoría 07-10: esas landings decían "Dropi" pero Forge no tenía token ni
 * el id del producto en Dropi, así que el pedido quedaba solo en un archivo
 * de Forge sin avisar a nadie. Ahora Forge lo pasa acá (con la clave
 * compartida) y sigue el MISMO camino que el formulario de las landings de
 * VentasPro: pedido del negocio, Dropi con SU token, pantalla Pedidos,
 * reintento automático y aviso al dueño. Es pública (va en publicRoutes):
 * la autentica la x-api-key, no una sesión.
 */
const router = Router();

router.get("/entrar", requirePlatformOwner(), (req, res) => {
  const siguiente = String(req.query.next || "/");
  res.redirect(302, enlaceDeEntradaForge(siguiente.startsWith("/") && !siguiente.startsWith("//") ? siguiente : "/"));
});

/** El producto del catálogo que corresponde a un nombre de landing: el de
 *  mayor coincidencia de palabras clave, solo si es >= 0,75 y le saca al
 *  segundo al menos 0,2 (si dos se parecen igual, no se adivina). */
export function productoPorNombre<T extends { name?: string | null }>(nombre: string, catalogo: T[]): T | null {
  const puntaje = (a: string, b: string) => {
    const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
    const A = new Set(norm(a)), B = new Set(norm(b));
    if (!A.size || !B.size) return 0;
    let hits = 0;
    for (const w of A) if (B.has(w)) hits++;
    return hits / Math.max(A.size, B.size);
  };
  const orden = catalogo
    .map((p) => ({ p, s: puntaje(nombre, String(p.name || "")) }))
    .sort((x, y) => y.s - x.s);
  const [primero, segundo] = orden;
  if (!primero || primero.s < 0.75) return null;
  if (segundo && primero.s - segundo.s < 0.2) return null;
  return primero.p;
}

function claveValida(dada: unknown): boolean {
  const esperada = String(process.env.LANDINGFORGE_API_KEY || process.env.LANDING_API_KEY || "");
  const d = String(dada || "");
  if (esperada.length < 16 || d.length !== esperada.length) return false;
  return timingSafeEqual(Buffer.from(d), Buffer.from(esperada));
}

router.post("/pedido", async (req: any, res: any) => {
  if (!claveValida(req.headers["x-api-key"])) return res.status(401).json({ ok: false, error: "No autorizado" });
  try {
    const b = req.body || {};
    // Forge es del dueño de la plataforma: una landing sin vínculo es suya.
    const tenantId = Number(b.tenantId) || Number(process.env.PLATFORM_TENANT_ID || 1);
    let productId = Number(b.productId);
    const { db, products, pool } = await import("@workspace/db");
    const { and, eq } = await import("drizzle-orm");
    let porNombre = false;
    if (!Number.isInteger(productId) || productId <= 0) {
      // Landing creada antes del vínculo: se busca el producto por su nombre
      // en el catálogo del negocio. Solo con una coincidencia CLARA y única;
      // ante la duda se rechaza (mejor un aviso que despachar otro producto).
      const nombre = String(b.productName || "").trim();
      if (!nombre) return res.status(400).json({ ok: false, error: "Falta el producto" });
      const candidatos: any[] = await db.select().from(products).where(eq(products.tenantId, tenantId));
      const elegido = productoPorNombre(nombre, candidatos);
      if (!elegido) {
        try {
          const { avisarAlDueno } = await import("../lib/avisos");
          await avisarAlDueno(tenantId, `⚠️ *Pedido de una landing sin producto* — llegó un pedido de "${nombre}" (${String(b.nombre || "").slice(0, 40)}, ${String(b.telefono || "").slice(0, 15)}) y no supe a qué producto del catálogo corresponde. Créalo a mano o vincula la landing.`);
        } catch { /* nada */ }
        return res.status(404).json({ ok: false, error: `No encontré "${nombre}" en el catálogo` });
      }
      productId = Number(elegido.id);
      porNombre = true;
    }
    const [producto]: any[] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
    if (!producto) return res.status(404).json({ ok: false, error: "Ese producto no es de ese negocio" });

    const limpio = (v: unknown, max = 120) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    const datos = {
      nombre: limpio(b.nombre, 80),
      telefono: limpio(b.telefono, 20).replace(/\D/g, ""),
      documento: limpio(b.documento, 20).replace(/\D/g, ""),
      direccion: limpio(b.direccion, 200),
      barrio: "",
      ciudad: limpio(b.ciudad, 60),
      departamento: limpio(b.departamento, 60),
      notas: limpio(b.notas, 160),
    };
    const ds = await import("../lib/dropshipping");
    if (!datos.departamento) datos.departamento = ds.departamentoDeCiudad(datos.ciudad) || "";
    const faltan = (["nombre", "telefono", "direccion", "ciudad", "departamento"] as const).filter((k) => !datos[k]);
    if (faltan.length) return res.status(400).json({ ok: false, error: `Faltan: ${faltan.join(", ")}` });
    if (datos.telefono.length < 10) return res.status(400).json({ ok: false, error: "El celular no parece válido" });

    const { getBusinessContext } = await import("../lib/business-context");
    const { CONDICIONES_DE_RESPALDO } = await import("../lib/modelo-de-negocio");
    const c = (await getBusinessContext(tenantId).catch(() => null))?.condiciones ?? CONDICIONES_DE_RESPALDO;

    const cantidad = Math.max(1, Math.min(10, Number(b.cantidad) || 1));
    // El precio es el del CATÁLOGO. Solo se acepta el total de la landing si
    // es un paquete con descuento creíble (entre 60 % y 100 % del precio
    // normal): un total de la página nunca puede regalar el producto.
    const lista = Number(producto.price) || 0;
    const totalLanding = Number(b.total) || 0;
    const unitPrice = totalLanding > 0 && totalLanding <= lista * cantidad && totalLanding >= lista * cantidad * 0.6
      ? totalLanding / cantidad
      : lista;

    // Mismo cliente, mismo producto, hace un momento = el mismo pedido.
    if (pool) {
      const { rows } = await pool.query(
        `SELECT id FROM dropshipping_orders WHERE tenant_id = $1 AND product_id = $2 AND telefono = $3
           AND created_at > now() - interval '10 minutes' AND estado <> 'cancelado' ORDER BY id DESC LIMIT 1`,
        [tenantId, productId, datos.telefono],
      ).catch(() => ({ rows: [] as any[] }));
      if (rows[0]) return res.json({ ok: true, pedidoId: rows[0].id, repetido: true });
    }

    let pedido: any = await ds.abrirPedido({
      tenantId, conversationId: null, productId, productName: producto.name,
      unitPrice, quantity: cantidad, telefono: datos.telefono,
      metodoPago: c.envio.pago === "anticipado" ? "transferencia" : "contraentrega",
    });
    const notas = [limpio(b.oferta, 60) && `Oferta: ${limpio(b.oferta, 60)}`, datos.notas, `Pedido desde la landing ${limpio(b.landing, 80)} (Landing Forge)`].filter(Boolean).join(" · ");
    pedido = (await ds.guardarDatos(pedido.id, { ...datos, notas })) || pedido;
    const variante = limpio(b.variante, 80);
    if (variante) {
      await ds.guardarVarianteDelPedido(pedido.id, variante);
      pedido.variante = variante;
    }
    await ds.marcarEstado(pedido.id, "confirmado");
    pedido.estado = "confirmado";
    const r = await ds.despacharPedido(pedido);

    try {
      const { avisarAlDueno } = await import("../lib/avisos");
      await avisarAlDueno(tenantId, [
        `🛒 *Pedido nuevo desde una landing de Landing Forge*`,
        `📦 ${producto.name} × ${cantidad} · total $${Math.round(unitPrice * cantidad).toLocaleString("es-CO")}`,
        variante ? `🎨 ${variante}` : "",
        `👤 ${datos.nombre} · 📱 ${datos.telefono}`,
        `🏠 ${datos.direccion} — ${datos.ciudad}, ${datos.departamento}`,
        r.ok
          ? `✅ Registrado en el proveedor${r.dropi?.dropiOrderId ? ` (Dropi #${r.dropi.dropiOrderId})` : ""}`
          : `⚠️ No entró al proveedor: ${String(r.error || r.dropi?.detalle || "").slice(0, 200)}. Queda en Pedidos y se reintenta solo.`,
      ].filter(Boolean).join("\n"));
    } catch (e: any) {
      logger.warn({ err: e?.message }, "[ForgePedido] no se pudo avisar al dueño");
    }
    // Con el vínculo resuelto por nombre, Forge lo guarda en la landing.
    return res.json({ ok: true, pedidoId: pedido.id, registrado: !!r.ok, plazo: c.envio.plazo, ...(porNombre ? { vinculo: { tenantId, productId } } : {}) });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[ForgePedido] falló");
    return res.status(500).json({ ok: false, error: "No se pudo registrar el pedido" });
  }
});

export default router;
