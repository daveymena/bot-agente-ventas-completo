/**
 * La landing PÚBLICA: la URL que va en el anuncio.
 *
 * Hasta hoy la única forma de ver una landing era `/api/landing-pages/:id/render`
 * con sesión de admin: no existía una URL que un cliente pudiera abrir ni que
 * Facebook pudiera tomar como destino (12-09-2026). Acá vive:
 *
 *   GET  /l/:slug                      la página, sin login, con el dominio de la app
 *   POST /api/landing-publica/:slug/pedido   el formulario contraentrega (físico)
 *
 * Y el cierre según el modelo del producto (ver modelo-de-negocio.ts):
 *   · físico  → formulario contraentrega (datos de envío → pedido → WooCommerce
 *               → Dropi, igual que el bot) o WhatsApp
 *   · digital → MercadoPago / PayPal (los mismos enlaces que la tienda) o WhatsApp
 *
 * El pedido del formulario se crea CONFIRMADO: mandar el formulario ES el "sí"
 * explícito. Y se le avisa al dueño por WhatsApp, como con los comprobantes.
 */
import { Router, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, landingPages, products } from "@workspace/db";
import { logger } from "../lib/logger";
import { tenantManager } from "../lib/tenantManager";
import { getBusinessContext } from "../lib/business-context";
import { CONDICIONES_DE_RESPALDO, modeloDelProducto } from "../lib/modelo-de-negocio";
import { getAppUrl } from "../lib/app-url";

export const landingPublicaRouter = Router();

/** La landing publicada con ese slug, y su producto y negocio. */
async function landingPorSlug(slug: string) {
  const [row] = await db.select().from(landingPages).where(eq(landingPages.slug, slug)).limit(1);
  if (!row || row.status !== "published") return null;
  const [producto] = row.productId
    ? await db.select().from(products).where(and(eq(products.id, row.productId), eq(products.tenantId, row.tenantId))).limit(1)
    : [null];
  return { row, producto: producto || null };
}

/** URL pública de una landing, con el dominio de la app. */
export function urlPublicaDe(slug: string): string {
  return `${getAppUrl().replace(/\/+$/, "")}/l/${encodeURIComponent(slug)}`;
}

/**
 * Los enlaces de cobro de un DIGITAL, los mismos que usa la tienda y el bot.
 * Sin teléfono: el comprador todavía no escribió a nadie.
 */
async function enlacesDePago(tenantId: number, producto: any): Promise<{ mercadopago?: string; paypal?: string }> {
  try {
    const { PaymentGateway } = await import("../lib/payments");
    const tenant = await tenantManager.getTenantById(tenantId);
    const pg = new PaymentGateway(tenant || undefined);
    const links: any = await pg.getAllLinks(producto, { phone: "", name: "Landing" });
    return {
      mercadopago: links?.mercadopago?.shortUrl || links?.mercadopago?.url || undefined,
      paypal: links?.paypal?.shortUrl || links?.paypal?.url || undefined,
    };
  } catch (e: any) {
    logger.warn({ tenantId, err: e?.message }, "[LandingPublica] no se pudieron generar los enlaces de pago");
    return {};
  }
}

landingPublicaRouter.get("/l/:slug", async (req: Request, res: Response) => {
  try {
    const encontrada = await landingPorSlug(String(req.params.slug || ""));
    if (!encontrada) return res.status(404).send("<!doctype html><meta charset=utf-8><title>No encontrada</title><p style=\"font-family:system-ui;padding:40px\">Esta página no existe o todavía no está publicada.</p>");
    const { row, producto } = encontrada;
    const tenantId = row.tenantId;

    // Copia HTML de una URL: se sirve tal cual.
    const { htmlDeCopia } = await import("../lib/landing/clonar-html");
    const copia = htmlDeCopia(row);
    if (copia) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.send(copia);
    }

    const { renderizarLanding } = await import("../lib/landing/renderer");
    const { negocioParaRender } = await import("../lib/landing/negocio-para-render");
    const negocio = await negocioParaRender(tenantId, producto);
    const modelo = producto ? modeloDelProducto(producto as any) : "digital";
    const ctx = await getBusinessContext(tenantId).catch(() => null);
    const c = ctx?.condiciones ?? CONDICIONES_DE_RESPALDO;

    const cierre = modelo === "fisico"
      ? { tipo: "contraentrega" as const, accion: `/api/landing-publica/${encodeURIComponent(row.slug)}/pedido`, pais: c.pais, pago: c.envio.pago }
      : modelo === "digital"
        ? { tipo: "pago" as const, ...(producto ? await enlacesDePago(tenantId, producto) : {}) }
        : { tipo: "whatsapp" as const };

    const html = renderizarLanding({
      nombre: row.name,
      secciones: (row.sections as any[]) || [],
      familia: (row.design as any)?.familia ?? null,
      producto: producto && {
        name: producto.name, description: producto.description, imageUrl: producto.imageUrl,
        price: producto.price, currency: producto.currency, paymentLink: producto.paymentLink,
        whatsapp: negocio.whatsapp,
      },
      negocio,
      cierre,
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.send(html);
  } catch (e: any) {
    logger.error({ err: e?.message }, "[LandingPublica] error renderizando");
    return res.status(500).send("Error");
  }
});

/**
 * El formulario contraentrega. Mismo camino que el pedido por WhatsApp:
 * abrirPedido → guardarDatos → confirmado → despacharPedido (WooCommerce).
 */
landingPublicaRouter.post("/api/landing-publica/:slug/pedido", async (req: Request, res: Response) => {
  try {
    const encontrada = await landingPorSlug(String(req.params.slug || ""));
    if (!encontrada || !encontrada.producto) return res.status(404).json({ ok: false, error: "Landing no encontrada" });
    const { row, producto } = encontrada;
    if (modeloDelProducto(producto as any) !== "fisico") return res.status(400).json({ ok: false, error: "Este producto no se pide por formulario" });

    const b = req.body || {};
    const limpio = (v: unknown, max = 120) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    const datos = {
      nombre: limpio(b.nombre), telefono: limpio(b.telefono, 20).replace(/\D/g, ""), documento: limpio(b.documento, 20).replace(/\D/g, ""),
      direccion: limpio(b.direccion, 160), barrio: limpio(b.barrio, 60), ciudad: limpio(b.ciudad, 60), departamento: limpio(b.departamento, 60),
      notas: limpio(b.referencia, 120),
    };
    const faltan = (["nombre", "telefono", "documento", "direccion", "ciudad", "departamento"] as const).filter((k) => !datos[k]);
    if (faltan.length) return res.status(400).json({ ok: false, error: `Faltan: ${faltan.join(", ")}` });
    if (datos.telefono.length < 10) return res.status(400).json({ ok: false, error: "El celular no parece válido" });
    if (datos.documento.length < 6) return res.status(400).json({ ok: false, error: "El documento no parece válido" });

    const ds = await import("../lib/dropshipping");
    const ctx = await getBusinessContext(row.tenantId).catch(() => null);
    const c = ctx?.condiciones ?? CONDICIONES_DE_RESPALDO;
    const zona = ds.verificarZona(datos, c.pais);
    if (!zona.ok) return res.status(400).json({ ok: false, error: `Revisá la ciudad y el departamento: ${zona.motivo}` });

    const cantidad = Math.max(1, Math.min(10, Number(b.cantidad) || 1));
    let pedido = await ds.abrirPedido({
      tenantId: row.tenantId, conversationId: null, productId: producto.id, productName: producto.name,
      unitPrice: Number(producto.price) || 0, quantity: cantidad, telefono: datos.telefono,
      metodoPago: c.envio.pago === "anticipado" ? "transferencia" : "contraentrega",
    });
    pedido = (await ds.guardarDatos(pedido.id, { ...datos, notas: `${datos.notas ? datos.notas + " · " : ""}Pedido desde la landing ${row.slug}` })) || pedido;
    // Mandar el formulario ES la confirmación explícita.
    await ds.marcarEstado(pedido.id, "confirmado");
    pedido.estado = "confirmado";
    const r = await ds.despacharPedido(pedido);

    // Aviso al dueño por WhatsApp, como con los comprobantes: un pedido que
    // entra y nadie ve es un envío que sale tarde.
    try {
      const { telefonoDelAdmin } = await import("../lib/verificacion-pago");
      const { getWhatsAppForTenant } = await import("../lib/whatsapp-factory");
      const admin = await telefonoDelAdmin(row.tenantId);
      if (admin) {
        const mgr: any = getWhatsAppForTenant(row.tenantId);
        const texto = [
          `🛒 *Pedido nuevo desde la landing* (${row.name})`,
          `📦 ${producto.name} × ${cantidad} · $${Number(producto.price || 0).toLocaleString("es-CO")}`,
          `👤 ${datos.nombre} · 📱 ${datos.telefono} · 🪪 ${datos.documento}`,
          `🏠 ${datos.direccion}${datos.barrio ? `, ${datos.barrio}` : ""} — ${datos.ciudad}, ${datos.departamento}`,
          datos.notas ? `📍 ${datos.notas}` : "",
          r.ok ? `✅ Registrado en WooCommerce como #${r.wooOrderId}` : `⚠️ NO se pudo registrar en WooCommerce: ${r.error}`,
        ].filter(Boolean).join("\n");
        await mgr?.sendText?.(admin, texto);
      }
    } catch (e: any) {
      logger.warn({ err: e?.message }, "[LandingPublica] no se pudo avisar al admin del pedido");
    }

    return res.json({ ok: true, pedidoId: pedido.id, registrado: r.ok, wooOrderId: r.wooOrderId ?? null, plazo: c.envio.plazo });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[LandingPublica] error creando el pedido");
    return res.status(500).json({ ok: false, error: "No se pudo registrar el pedido" });
  }
});
