/**
 * Landing pública: la URL que va en el anuncio.
 *
 * GET  /l/:slug
 * POST /api/landing-publica/:slug/pedido
 *
 * La página pública usa el renderer V3. El cierre físico sigue el camino
 * real de pedidos del negocio: pedido -> validación -> WooCommerce.
 */
import { Router, type Request, type Response } from "express";
import { fotosDelProducto, fotosUnicasDelProducto, guardadorDeMetadata } from "../lib/fotos-de-producto";
import { and, eq } from "drizzle-orm";
import { db, landingPages, products, coupons } from "@workspace/db";
import { logger } from "../lib/logger";
import { tenantManager } from "../lib/tenantManager";
import { getBusinessContext } from "../lib/business-context";
import { CONDICIONES_DE_RESPALDO, modeloDelProducto } from "../lib/modelo-de-negocio";
import { getAppUrl } from "../lib/app-url";

export const landingPublicaRouter = Router();

async function landingPorSlug(slug: string) {
  const [row] = await db.select().from(landingPages).where(eq(landingPages.slug, slug)).limit(1);
  if (!row || row.status !== "published") return null;
  const [producto] = row.productId
    ? await db.select().from(products).where(and(eq(products.id, row.productId), eq(products.tenantId, row.tenantId))).limit(1)
    : [null];
  return { row, producto: producto || null };
}

export function urlPublicaDe(slug: string): string {
  return `${getAppUrl().replace(/\/+$/, "")}/l/${encodeURIComponent(slug)}`;
}

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
    // Medición: píxel de Meta + visitas/pedidos propios (ver lib/landing/monitor.ts).
    const { snippetDeMedicion, conMedicion } = await import("../lib/landing/monitor");
    let pixelId: string | null = null;
    try {
      const { FacebookService } = await import("../lib/facebook");
      const t = await tenantManager.getTenantById(tenantId);
      pixelId = new FacebookService(t || undefined).pixelId || null;
    } catch { pixelId = null; }
    const medir = (html: string) => conMedicion(html, snippetDeMedicion({ slug: row.slug, pixelId, producto: producto as any }));

    // Si la landing tiene HTML dinámico generado por OpenCode, servirlo directo.
    if ((row as any).html) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60");
      // La misma foto bajo varias URLs (local, WordPress, CloudFront) no sale dos veces.
      const { htmlConFotosUnicas, guardadorDeMetadata } = await import("../lib/fotos-de-producto");
      const { conFormularioQueResponde } = await import("../lib/landing/sanear-html");
      const { formularioConOpciones } = await import("../lib/landing/renderer");
      const base = producto ? await htmlConFotosUnicas((row as any).html, producto, { guardar: guardadorDeMetadata(producto.id) }) : (row as any).html;
      return res.send(medir(conFormularioQueResponde(formularioConOpciones(base, producto as any))));
    }

    const { htmlDeCopia } = await import("../lib/landing/clonar-html");
    const copia = htmlDeCopia(row);
    if (copia) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.send(medir(copia));
    }

    const { renderizarLanding } = await import("../lib/landing/renderer-v3");
    const { negocioParaRender } = await import("../lib/landing/negocio-para-render");
    const negocio = await negocioParaRender(tenantId, producto);
    const modelo = producto ? modeloDelProducto(producto as any) : "digital";
    const ctx = await getBusinessContext(tenantId).catch(() => null);
    const c = ctx?.condiciones ?? CONDICIONES_DE_RESPALDO;

    const cierre = modelo === "fisico"
      ? { tipo: "contraentrega" as const, accion: `/api/landing-publica/${encodeURIComponent(row.slug)}/pedido`, pais: c.pais, pago: c.envio.pago }
      : modelo === "digital"
        ? { tipo: "pago" as const, accion: `/api/landing-publica/${encodeURIComponent(row.slug)}/cupon`, ...(producto ? await enlacesDePago(tenantId, producto) : {}) }
        : { tipo: "whatsapp" as const };

    const html = renderizarLanding({
      nombre: row.name,
      secciones: (row.sections as any[]) || [],
      familia: (row.design as any)?.familia ?? null,
      producto: producto && {
        name: producto.name,
        description: producto.description,
        imageUrl: producto.imageUrl,
        images: await fotosUnicasDelProducto(producto, { guardar: guardadorDeMetadata(producto.id) }),
        price: producto.price,
        currency: producto.currency,
        paymentLink: producto.paymentLink,
        whatsapp: negocio.whatsapp,
        opciones: Array.isArray((producto as any).opciones) ? (producto as any).opciones : null,
      },
      negocio,
      cierre,
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.send(medir(html));
  } catch (e: any) {
    logger.error({ err: e?.message }, "[LandingPublica] error renderizando");
    return res.status(500).send("Error");
  }
});

/** Beacon de la página: visita e inicio del pedido. Público, sin datos personales. */
const ultimoEventoPorIp = new Map<string, number>();
landingPublicaRouter.post("/api/landing-publica/:slug/evento", async (req: Request, res: Response) => {
  try {
    const tipo = String(req.body?.tipo || "");
    if (tipo !== "visita" && tipo !== "inicio_pedido") return res.status(204).end();
    // Freno barato contra recargas en bucle: un evento del mismo tipo por IP cada 20 s.
    const clave = `${req.ip}|${req.params.slug}|${tipo}`;
    const ahora = Date.now();
    if ((ultimoEventoPorIp.get(clave) || 0) > ahora - 20_000) return res.status(204).end();
    ultimoEventoPorIp.set(clave, ahora);
    if (ultimoEventoPorIp.size > 5000) ultimoEventoPorIp.clear();
    const encontrada = await landingPorSlug(String(req.params.slug || ""));
    if (!encontrada) return res.status(204).end();
    const { registrarEventoLanding } = await import("../lib/landing/monitor");
    await registrarEventoLanding(encontrada.row.tenantId, encontrada.row.slug, tipo, String(req.body?.detalle || "").slice(0, 120));
    return res.status(204).end();
  } catch {
    return res.status(204).end();
  }
});

landingPublicaRouter.post("/api/landing-publica/:slug/pedido", async (req: Request, res: Response) => {
  try {
    const encontrada = await landingPorSlug(String(req.params.slug || ""));
    if (!encontrada || !encontrada.producto) return res.status(404).json({ ok: false, error: "Landing no encontrada" });
    const { row, producto } = encontrada;
    {
      // Todo lo que responde este endpoint queda medido: un pedido o un
      // rechazo con su motivo (antes los rechazos solo iban al logger).
      const { registrarEventoLanding } = await import("../lib/landing/monitor");
      const json = res.json.bind(res);
      (res as any).json = (body: any) => {
        if (body && typeof body === "object") {
          if (body.ok && !body.repetido) void registrarEventoLanding(row.tenantId, row.slug, "pedido", body.registrado ? "registrado" : "sin registrar en Dropi/Woo");
          else if (body.ok === false) void registrarEventoLanding(row.tenantId, row.slug, "rechazo", String(body.error || res.statusCode));
        }
        return json(body);
      };
    }
    if (modeloDelProducto(producto as any) !== "fisico") return res.status(400).json({ ok: false, error: "Este producto no se pide por formulario" });

    const b = req.body || {};
    const limpio = (v: unknown, max = 120) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    const datos = {
      nombre: limpio(b.nombre),
      telefono: limpio(b.telefono, 20).replace(/\D/g, ""),
      documento: limpio(b.documento, 20).replace(/\D/g, ""),
      direccion: limpio(b.direccion, 160),
      barrio: limpio(b.barrio, 60),
      ciudad: limpio(b.ciudad, 60),
      departamento: limpio(b.departamento, 60),
      notas: limpio(b.referencia, 120),
    };
    const faltan = (["nombre", "telefono", "direccion", "ciudad", "departamento"] as const).filter((k) => !datos[k]);
    if (faltan.length) return res.status(400).json({ ok: false, error: `Faltan: ${faltan.join(", ")}` });
    if (datos.telefono.length < 10) return res.status(400).json({ ok: false, error: "El celular no parece válido" });

    const opcionesDefinidas = Array.isArray((producto as any).opciones) ? (producto as any).opciones : [];
    const opciones: Record<string, string> = {};
    for (const o of opcionesDefinidas) {
      const nombre = limpio(o?.nombre, 60);
      if (!nombre) continue;
      const raw = limpio(b[`opcion_${nombre}`], 80);
      if (o?.obligatoria && !raw) return res.status(400).json({ ok: false, error: `Selecciona ${nombre}` });
      if (raw) {
        const permitidos = Array.isArray(o?.valores) ? o.valores.map((x: unknown) => limpio(x, 80)) : [];
        if (permitidos.length && !permitidos.includes(raw)) return res.status(400).json({ ok: false, error: `Valor no válido para ${nombre}` });
        opciones[nombre] = raw;
      }
    }

    const ds = await import("../lib/dropshipping");
    const ctx = await getBusinessContext(row.tenantId).catch(() => null);
    const c = ctx?.condiciones ?? CONDICIONES_DE_RESPALDO;
    const zona = ds.verificarZona(datos, c.pais);
    if (!zona.ok) return res.status(400).json({ ok: false, error: `Revisá la ciudad y el departamento: ${zona.motivo}` });

    const cantidad = Math.max(1, Math.min(10, Number(b.cantidad) || 1));
    const detalleOpciones = Object.entries(opciones).map(([k, v]) => `${k}: ${v}`).join(" · ");

    // Cupón: dato real del negocio. Si viene un código, se valida, se descuenta
    // del precio y se consume un uso. Si no aplica, el pedido sigue al precio
    // normal y el motivo queda en las notas.
    let unitPrice = Number(producto.price) || 0;
    let cuponNota = "";
    const codigoCupon = String(b.cupon || "").trim().toUpperCase().replace(/\s+/g, "");
    if (codigoCupon) {
      try {
        const [cupon] = await db.select().from(coupons)
          .where(and(eq(coupons.tenantId, row.tenantId), eq(coupons.code, codigoCupon))).limit(1);
        const { aplicarCupon } = await import("../lib/cupones");
        const r = aplicarCupon(cupon, { total: unitPrice * cantidad, productId: producto.id });
        if (r.ok && cupon) {
          unitPrice = r.precioFinal / cantidad;
          cuponNota = `Cupón ${codigoCupon} (−$${Math.round(r.descuento).toLocaleString("es-CO")})`;
          await db.update(coupons).set({ usos: Number(cupon.usos || 0) + 1, updatedAt: new Date() } as any).where(eq(coupons.id, cupon.id));
        } else {
          cuponNota = `Cupón ${codigoCupon} no aplicó: ${r.motivo || "inválido"}`;
        }
      } catch (e: any) {
        logger.warn({ err: e?.message }, "[LandingPublica] no se pudo validar el cupón");
      }
    }

    // ── El mismo cliente, el mismo producto, hace un momento: es el MISMO pedido ──
    // 19-09-2026: el dueño llenó el formulario una vez y le dio "Pedir" cinco
    // veces porque la página no contestaba nada; salieron los pedidos Woo
    // #324-#328, todos iguales. Un clic repetido no puede ser otro pedido.
    {
      const { pool } = await import("@workspace/db");
      const { rows: previos } = await pool.query(
        `SELECT * FROM dropshipping_orders
          WHERE tenant_id = $1 AND product_id = $2 AND telefono = $3
            AND created_at > now() - interval '10 minutes'
            AND estado <> 'cancelado'
          ORDER BY id DESC LIMIT 1`,
        [row.tenantId, producto.id, datos.telefono],
      ).catch(() => ({ rows: [] as any[] }));
      if (previos[0]) {
        const prev = previos[0];
        logger.info({ pedidoId: prev.id, wooOrderId: prev.woo_order_id }, "[LandingPublica] Pedido repetido en 10 min: se devuelve el existente");
        return responderPedido(req, res, { ok: true, pedidoId: prev.id, registrado: !!prev.woo_order_id, wooOrderId: prev.woo_order_id ?? null, plazo: c.envio.plazo, repetido: true }, producto.name);
      }
    }

    let pedido = await ds.abrirPedido({
      tenantId: row.tenantId,
      conversationId: null,
      productId: producto.id,
      productName: producto.name,
      unitPrice,
      quantity: cantidad,
      telefono: datos.telefono,
      metodoPago: c.envio.pago === "anticipado" ? "transferencia" : "contraentrega",
    });
    const notas = [detalleOpciones, cuponNota, datos.notas, `Pedido desde la landing ${row.slug}`].filter(Boolean).join(" · ");
    pedido = (await ds.guardarDatos(pedido.id, { ...datos, notas })) || pedido;
    await ds.marcarEstado(pedido.id, "confirmado");
    pedido.estado = "confirmado";
    const r = await ds.despacharPedido(pedido);

    try {
      const { avisarAlDueno } = await import("../lib/avisos");
      {
        const texto = [
          `🛒 *Pedido nuevo desde la landing* (${row.name})`,
          `📦 ${producto.name} × ${cantidad} · $${Number(producto.price || 0).toLocaleString("es-CO")}`,
          detalleOpciones ? `🎨 ${detalleOpciones}` : "",
          `👤 ${datos.nombre} · 📱 ${datos.telefono}${datos.documento ? ` · 🪪 ${datos.documento}` : ""}`,
          `🏠 ${datos.direccion}${datos.barrio ? `, ${datos.barrio}` : ""} — ${datos.ciudad}, ${datos.departamento}`,
          datos.notas ? `📍 ${datos.notas}` : "",
          r.ok
            ? `✅ Registrado en WooCommerce como #${r.wooOrderId}${r.dropi?.estado === "sincronizada" ? ` y en Dropi #${r.dropi.dropiOrderId || "?"}` : r.dropi ? ` (Dropi: ${r.dropi.detalle})` : ""}`
            : r.wooOrderId
              ? `⚠️ Quedó en WooCommerce como #${r.wooOrderId} pero Dropi lo RECHAZÓ: ${r.dropi?.detalle || r.error}`
              : String(r.error || "").startsWith("Dropi rechazó el pedido directo")
                ? `⚠️ Dropi-directo lo rechazó y WooCommerce ni se intentó (rechazo por producto, no por cobertura): ${r.error}`
                : `⚠️ No se pudo registrar: ${r.error}${(r.cobertura || ds.esErrorDeCobertura(r.dropi?.detalle || r.error || "")) ? ` Sugerencia al cliente: ${r.cobertura?.mensajeAlCliente || ds.mensajeCoberturaAlCliente(producto.name, datos.ciudad)}` : ""}`,
        ].filter(Boolean).join("\n");
        await avisarAlDueno(row.tenantId, texto);
      }
    } catch (e: any) {
      logger.warn({ err: e?.message }, "[LandingPublica] no se pudo avisar al admin del pedido");
    }

    return responderPedido(req, res, { ok: true, pedidoId: pedido.id, registrado: r.ok, wooOrderId: r.wooOrderId ?? null, plazo: c.envio.plazo }, producto.name);
  } catch (e: any) {
    logger.error({ err: e?.message }, "[LandingPublica] error creando el pedido");
    return res.status(500).json({ ok: false, error: "No se pudo registrar el pedido" });
  }
});

/**
 * Un formulario HTML plano (sin fetch) navega al POST y muestra lo que el
 * servidor devuelva. Devolver JSON ahí es mostrarle al cliente `{"ok":true}`
 * o nada: el 19-09 el dueño no vio confirmación y le dio "Pedir" cinco veces.
 * Si el navegador pide HTML, se le da una página de confirmación de verdad;
 * si es fetch (Accept: application/json), el JSON de siempre.
 */
function responderPedido(req: Request, res: Response, datos: Record<string, any>, _nombreProducto: string) {
  const slug = String(req.params.slug || "");
  const gracias = `/l/${encodeURIComponent(slug)}/gracias?pedido=${encodeURIComponent(String(datos.pedidoId ?? ""))}${datos.repetido ? "&repetido=1" : ""}`;
  const quiereHtml = !req.is("application/json") && /text\/html/i.test(String(req.headers.accept || ""));
  if (quiereHtml) return res.redirect(303, gracias);
  return res.json({ ...datos, gracias });
}

/**
 * GET /l/:slug/gracias — la pantalla de felicitación después del pedido.
 *
 * Pedido del dueño (19-09-2026): "al darle enviar debería haber una pantalla
 * de felicidades, tu pedido ha sido registrado y pronto estaremos en contacto,
 * así no se queda en la misma página". Antes el formulario mostraba JSON
 * crudo o nada, y el cliente volvía a dar clic.
 */
landingPublicaRouter.get("/l/:slug/gracias", async (req: Request, res: Response) => {
  const encontrada = await landingPorSlug(String(req.params.slug || "")).catch(() => null);
  const producto: any = encontrada?.producto || null;
  const negocio = encontrada ? await getBusinessContext(encontrada.row.tenantId).catch(() => null) : null;
  const { negocioParaRender } = await import("../lib/landing/negocio-para-render");
  const render: any = encontrada ? await negocioParaRender(encontrada.row.tenantId, producto).catch(() => null) : null;
  const esc = (v: any) => String(v ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] as string));
  const pedido = String(req.query.pedido || "").replace(/[^0-9]/g, "");
  const repetido = String(req.query.repetido || "") === "1";
  const wa = String(render?.whatsapp || producto?.whatsapp || "").replace(/[^0-9]/g, "");
  const nombreNegocio = render?.nombre || (negocio as any)?.businessName || "";
  const plazo = (negocio as any)?.condiciones?.envio?.plazo || (negocio as any)?.entrega?.plazo || "";
  const volver = encontrada ? `/l/${encodeURIComponent(encontrada.row.slug)}` : "/";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>¡Pedido registrado!</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Poppins:wght@700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Inter,system-ui,sans-serif;background:#F7F7F7;color:#111;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;border:1px solid #E5E7EB;border-radius:20px;padding:44px 32px;max-width:560px;width:100%;text-align:center;box-shadow:0 20px 50px rgba(17,17,17,.10)}
  .check{width:84px;height:84px;border-radius:50%;background:#F2B71B;color:#111;display:flex;align-items:center;justify-content:center;font-size:44px;margin:0 auto 18px;box-shadow:0 8px 24px rgba(242,183,27,.35)}
  h1{font-family:Poppins,sans-serif;font-size:30px;line-height:1.15;margin-bottom:10px}
  p{color:#555B63;line-height:1.65;font-size:16px}
  .prod{margin:18px 0 6px;font-weight:700;color:#111}
  .num{display:inline-block;background:#F7F7F7;border:1px solid #E5E7EB;border-radius:10px;padding:8px 16px;font-weight:700;margin-top:8px}
  .pasos{text-align:left;margin:26px auto 0;max-width:420px;list-style:none}
  .pasos li{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #E5E7EB;font-size:15px;color:#111}
  .pasos li:last-child{border-bottom:none}
  .pasos .n{flex-shrink:0;width:26px;height:26px;border-radius:50%;background:#F2B71B;color:#111;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;margin-top:1px}
  .acciones{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:28px}
  a.btn{display:inline-flex;align-items:center;justify-content:center;background:#F2B71B;color:#111;font-weight:700;text-decoration:none;padding:14px 26px;border-radius:10px;min-height:50px}
  a.btn.wa{background:#25D366;color:#fff}
  a.ghost{display:inline-flex;align-items:center;justify-content:center;color:#111;text-decoration:none;padding:14px 22px;border-radius:10px;border:1px solid #E5E7EB;font-weight:600;min-height:50px}
  @media (max-width:520px){h1{font-size:24px}.card{padding:32px 20px}}
</style></head>
<body><div class="card">
  <div class="check">✓</div>
  <h1>${repetido ? "Tu pedido ya estaba registrado" : "¡Felicidades! Tu pedido quedó registrado"}</h1>
  <p>${repetido ? "Lo recibimos hace un momento y no se creó otro. " : ""}Pronto estaremos en contacto contigo para confirmar la entrega${plazo ? ` (${esc(plazo)})` : ""}. Pagas al recibir.</p>
  ${producto ? `<p class="prod">${esc(producto.name)}</p>` : ""}
  ${pedido ? `<div class="num">Pedido #${esc(pedido)}</div>` : ""}
  <ul class="pasos">
    <li><span class="n">1</span><span>Te escribimos${wa ? " por WhatsApp" : ""} para confirmar tus datos y la dirección.</span></li>
    <li><span class="n">2</span><span>Despachamos tu pedido y te compartimos la guía de envío.</span></li>
    <li><span class="n">3</span><span>Recibes en tu casa y pagas en ese momento.</span></li>
  </ul>
  <div class="acciones">
    ${wa ? `<a class="btn wa" href="https://wa.me/${wa}?text=${encodeURIComponent(`Hola${nombreNegocio ? ` ${nombreNegocio}` : ""}, acabo de hacer el pedido${pedido ? ` #${pedido}` : ""}${producto ? ` de ${producto.name}` : ""}`)}">Escribir por WhatsApp</a>` : ""}
    <a class="ghost" href="${esc(volver)}">Volver a la página</a>
  </div>
</div></body></html>`);
});

/**
 * Cupón para productos digitales (MercadoPago / PayPal): valida el código y
 * regenera los enlaces de pago con el precio ya descontado. No consume un uso
 * (el pago todavía no ocurrió); el uso se consumiría al confirmarse el cobro.
 */
landingPublicaRouter.post("/api/landing-publica/:slug/cupon", async (req: Request, res: Response) => {
  try {
    const encontrada = await landingPorSlug(String(req.params.slug || ""));
    if (!encontrada || !encontrada.producto) return res.status(404).json({ ok: false, error: "Landing no encontrada" });
    const { row, producto } = encontrada;
    if (modeloDelProducto(producto as any) !== "digital") {
      return res.status(400).json({ ok: false, error: "Este producto no acepta cupón por pago en línea." });
    }

    const code = String(req.body?.code || "").trim().toUpperCase().replace(/\s+/g, "");
    if (!code) return res.status(400).json({ ok: false, error: "Falta el código del cupón." });

    const [cupon] = await db.select().from(coupons)
      .where(and(eq(coupons.tenantId, row.tenantId), eq(coupons.code, code))).limit(1);
    const { aplicarCupon } = await import("../lib/cupones");
    const precio = Number(producto.price) || 0;
    const r = aplicarCupon(cupon, { total: precio, productId: producto.id });

    if (!r.ok || !cupon) return res.json({ ok: false, motivo: r.motivo || "Cupón no válido." });

    const conDescuento = { ...producto, price: r.precioFinal };
    const links = await enlacesDePago(row.tenantId, conDescuento);

    return res.json({
      ok: true,
      code,
      descuento: r.descuento,
      precioFinal: r.precioFinal,
      links,
      mensaje: `Cupón aplicado: −$${Math.round(r.descuento).toLocaleString("es-CO")}`,
    });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[LandingPublica] error aplicando cupón digital");
    return res.status(500).json({ ok: false, error: "No se pudo aplicar el cupón." });
  }
});
