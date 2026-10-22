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
import { db, landingPages, products, coupons, tenants, pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { tenantManager } from "../lib/tenantManager";
import { getBusinessContext } from "../lib/business-context";
import { CONDICIONES_DE_RESPALDO, modeloDelProducto, sellosDelNegocio } from "../lib/modelo-de-negocio";
import { getAppUrl } from "../lib/app-url";
import { dbNow } from "../lib/date-utils";

export const landingPublicaRouter = Router();

async function landingPorSlug(slug: string) {
  const [row] = await db.select().from(landingPages).where(eq(landingPages.slug, slug)).limit(1);
  if (!row || row.status !== "published") return null;
  const [producto] = row.productId
    ? await db.select().from(products).where(and(eq(products.id, row.productId), eq(products.tenantId, row.tenantId))).limit(1)
    : [null];
  return { row, producto: producto || null };
}

/** Reglas antifraude del negocio (`tenants.metadata.antifraude`), sin normalizar. */
async function antifraudeDelNegocio(tenantId: number): Promise<unknown> {
  try {
    const [t] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const meta: any = typeof t?.metadata === "string" ? JSON.parse(t.metadata) : t?.metadata;
    return meta?.antifraude ?? null;
  } catch {
    return null;
  }
}

/** El WhatsApp del negocio al que el cliente escribe su código (solo dígitos). */
async function whatsappDelNegocio(tenantId: number, producto: any): Promise<string> {
  try {
    const { negocioParaRender } = await import("../lib/landing/negocio-para-render");
    const r: any = await negocioParaRender(tenantId, producto);
    return String(r?.whatsapp || "").replace(/\D/g, "");
  } catch {
    return "";
  }
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
    // Formulario seguro (lib/landing/formulario-extras.ts): trampa antirrobot,
    // upsell/downsell y el paso de verificación, en cualquier motor.
    const { extrasDelFormulario } = await import("../lib/landing/formulario-extras");
    const { configPedido } = await import("../lib/landing/pedido-seguro");
    const cfgPedido = configPedido(row.design);
    const medir = (html: string) => conMedicion(extrasDelFormulario(html, cfgPedido), snippetDeMedicion({ slug: row.slug, pixelId, producto: producto as any }));

    // Vía ESTILO (lib/landing/renderer-estilo.ts): se recalcula de secciones +
    // design en CADA visita, antes del html guardado (que es solo snapshot) y
    // de la copia clonada. La variante (cod/premium/bold/dark) vive en
    // design.style; el píxel lo pone solo `medir` para no contarlo dos veces.
    const porSecciones = await import("../lib/landing/html-por-secciones");
    if (porSecciones.esPremium(row as any)) {
      const html = await porSecciones.htmlPremium(row as any, producto);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.send(medir(html));
    }
    if (porSecciones.esEstilo(row as any)) {
      const html = await porSecciones.htmlEstilo(row as any, producto);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.send(medir(html));
    }

    // Si la landing tiene HTML dinámico generado por OpenCode, servirlo directo.
    if ((row as any).html) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60");
      // La misma foto bajo varias URLs (local, WordPress, CloudFront) no sale dos veces.
      const { htmlConFotosUnicas, guardadorDeMetadata } = await import("../lib/fotos-de-producto");
      const { conFormularioQueResponde, sinRotulosInternos, conIconosSeguros } = await import("../lib/landing/sanear-html");
      const { formularioConOpciones } = await import("../lib/landing/renderer");
      const base = producto ? await htmlConFotosUnicas((row as any).html, producto, { guardar: guardadorDeMetadata(producto.id) }) : (row as any).html;
      return res.send(medir(conFormularioQueResponde(formularioConOpciones(sinRotulosInternos(conIconosSeguros(base)).html, producto as any))));
    }

    const { htmlDeCopia } = await import("../lib/landing/clonar-html");
    const copia = htmlDeCopia(row);
    if (copia) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=60");
      const { conIconosSeguros } = await import("../lib/landing/sanear-html");
      return res.send(medir(conIconosSeguros(copia)));
    }

    // Misma función que la vista previa del editor (lib/landing/html-por-secciones):
    // composición guardada (modelo + semilla), precio anterior real y tema del dueño.
    const html = await porSecciones.htmlV3(row as any, producto);
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

/**
 * GET /api/landing-publica/:slug/envio?ciudad=&departamento=
 * Transportadoras de Dropi que pueden llevar el producto de la landing a esa
 * ciudad, de la más económica a la más cara. Solo NOMBRES: el flete no se le
 * muestra al cliente (regla del dueño). Caché de 10 min por ciudad para que un
 * formulario público no martille la API de Dropi.
 */
/**
 * GET /api/landing-publica/:slug/geo — departamentos y TODAS sus ciudades
 * según Dropi, para que el cliente elija de una lista (sin errores de
 * escritura) y el nombre coincida con el que Dropi valida. Sin Dropi:
 * { ok: false } y el formulario se queda con la lista de respaldo.
 */
const cacheGeo = new Map<number, { t: number; body: any }>();
landingPublicaRouter.get("/api/landing-publica/:slug/geo", async (req: Request, res: Response) => {
  try {
    const encontrada = await landingPorSlug(String(req.params.slug || ""));
    if (!encontrada) return res.status(404).json({ ok: false });
    const tenantId = encontrada.row.tenantId;
    const hit = cacheGeo.get(tenantId);
    if (hit && Date.now() - hit.t < 12 * 3600_000) return res.json(hit.body);
    const { geografiaDeDropi } = await import("../lib/dropi-cotizador");
    const departamentos = await geografiaDeDropi(tenantId);
    const body = departamentos ? { ok: true, departamentos } : { ok: false };
    // Un fallo de Dropi se reintenta en 10 minutos, no en 12 horas.
    cacheGeo.set(tenantId, { t: departamentos ? Date.now() : Date.now() - 12 * 3600_000 + 10 * 60_000, body });
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.json(body);
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[LandingPublica] no se pudo armar la geografía");
    return res.json({ ok: false });
  }
});

const cacheEnvio = new Map<string, { t: number; body: any }>();
landingPublicaRouter.get("/api/landing-publica/:slug/envio", async (req: Request, res: Response) => {
  try {
    const encontrada = await landingPorSlug(String(req.params.slug || ""));
    if (!encontrada || !encontrada.producto) return res.status(404).json({ ok: false, error: "Landing no encontrada" });
    const ciudad = String(req.query.ciudad || "").replace(/\s+/g, " ").trim().slice(0, 60);
    const departamento = String(req.query.departamento || "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (ciudad.length < 3) return res.status(400).json({ ok: false, error: "Falta la ciudad" });
    const clave = `${encontrada.row.id}|${ciudad.toLowerCase()}|${departamento.toLowerCase()}`;
    const hit = cacheEnvio.get(clave);
    if (hit && Date.now() - hit.t < 10 * 60_000) return res.json(hit.body);
    const { cotizarProductoDelCatalogo } = await import("../lib/dropi-cotizador");
    const r = await cotizarProductoDelCatalogo(encontrada.row.tenantId, encontrada.producto.id, { ciudad, departamento: departamento || null });
    const body = r.ok
      ? {
          ok: true,
          ciudad: r.ciudad?.nombre || ciudad,
          aceptaContraentrega: r.ciudad?.aceptaContraentrega ?? null,
          transportadoras: (r.transportadoras || []).filter((t) => t.disponible).slice(0, 4).map((t) => t.transportadora),
          mensaje: (r.transportadoras || []).some((t) => t.disponible) ? "" : "Coordinamos la transportadora contigo al confirmar.",
        }
      : { ok: false };
    if (cacheEnvio.size > 2000) cacheEnvio.clear();
    cacheEnvio.set(clave, { t: Date.now(), body });
    return res.json(body);
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[LandingPublica] no se pudo cotizar el envío");
    return res.json({ ok: false });
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
          if (body.ok && !body.repetido) void registrarEventoLanding(row.tenantId, row.slug, "pedido", body.verificar ? "esperando verificación por WhatsApp" : body.registrado ? "registrado" : "sin registrar en Dropi/Woo");
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

    // Antifraude (lib/landing/pedido-seguro.ts): reglas del dueño + campo trampa.
    const seguro = await import("../lib/landing/pedido-seguro");
    const ip = String(req.ip || "").replace(/^::ffff:/, "");
    {
      const cfgAf = seguro.configAntifraude(await antifraudeDelNegocio(row.tenantId));
      const recientes = pool && (cfgAf.maxPedidosPorTelefono24h || cfgAf.maxPedidosPorIp24h)
        ? await ds.pedidosRecientes(row.tenantId, datos.telefono, ip).catch(() => ({ telefono: 0, ip: 0 }))
        : { telefono: 0, ip: 0 };
      const v = seguro.evaluarAntifraude(cfgAf, {
        telefono: datos.telefono, ip, ciudad: datos.ciudad,
        pedidosTelefono24h: recientes.telefono, pedidosIp24h: recientes.ip, trampa: b.sitio_web,
      });
      if (!v.ok) {
        logger.warn({ tenantId: row.tenantId, slug: row.slug, regla: v.regla }, "[LandingPublica] Pedido frenado por antifraude");
        return res.status(400).json({ ok: false, error: v.alCliente, antifraude: v.regla });
      }
    }
    const cfgPedido = seguro.configPedido(row.design);

    let cantidad = Math.max(1, Math.min(10, Number(b.cantidad) || 1));
    let detalleOpciones = Object.entries(opciones).map(([k, v]) => `${k}: ${v}`).join(" · ");

    // Cupón: dato real del negocio. Si viene un código, se valida, se descuenta
    // del precio y se consume un uso. Si no aplica, el pedido sigue al precio
    // normal y el motivo queda en las notas.
    let unitPrice = Number(producto.price) || 0;

    // Ofertas de la landing de imágenes ("2 unidades por $49.900"): las define
    // el DUEÑO y viven en la landing; el cliente solo manda cuál eligió. Sin
    // esto la página mostraba un precio y el pedido cobraba precio × cantidad.
    const ofertasLanding = Array.isArray((row.design as any)?.ofertas) ? ((row.design as any).ofertas as Array<{ nombre: string; cantidad: number; precio: number }>) : [];
    if (ofertasLanding.length) {
      const o = ofertasLanding[Math.max(0, Math.min(ofertasLanding.length - 1, Number(b.oferta) || 0))];
      if (o && Number(o.precio) > 0 && Number(o.cantidad) > 0) {
        cantidad = Math.max(1, Math.min(10, Math.round(Number(o.cantidad))));
        unitPrice = Number(o.precio) / cantidad;
        detalleOpciones = [detalleOpciones, `Oferta: ${o.nombre}`].filter(Boolean).join(" · ");
      }
    }
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
          await db.update(coupons).set({ usos: Number(cupon.usos || 0) + 1, updatedAt: dbNow() } as any).where(eq(coupons.id, cupon.id));
        } else {
          cuponNota = `Cupón ${codigoCupon} no aplicó: ${r.motivo || "inválido"}`;
        }
      } catch (e: any) {
        logger.warn({ err: e?.message }, "[LandingPublica] no se pudo validar el cupón");
      }
    }

    // Upsell / downsell que aceptó en el formulario. El precio sale de la
    // landing (lo definió el dueño), nunca de lo que mande el navegador.
    const extra = seguro.extraElegido(cfgPedido, b.extra);
    const conExtra = seguro.sumarExtraMismoProducto({ cantidad, total: unitPrice * cantidad }, extra, producto.id);
    if (conExtra.sumado && extra) {
      cantidad = conExtra.cantidad;
      unitPrice = conExtra.total / cantidad;
      detalleOpciones = [detalleOpciones, `${b.extra === "downsell" ? "Downsell" : "Upsell"}: ${extra.titulo} (+$${extra.precio.toLocaleString("es-CO")})`].filter(Boolean).join(" · ");
    }
    // Otro producto: va en su propio pedido (el despacho es de un producto por pedido).
    let productoExtra: any = null;
    if (extra && !conExtra.sumado && extra.productId) {
      const [px] = await db.select().from(products).where(and(eq(products.id, extra.productId), eq(products.tenantId, row.tenantId))).limit(1);
      if (px && modeloDelProducto(px as any) === "fisico") productoExtra = px;
    }

    // ── El mismo cliente, el mismo producto, hace un momento: es el MISMO pedido ──
    // 19-09-2026: el dueño llenó el formulario una vez y le dio "Pedir" cinco
    // veces porque la página no contestaba nada; salieron los pedidos Woo
    // #324-#328, todos iguales. Un clic repetido no puede ser otro pedido.
    {
      const { pool } = await import("@workspace/db");
      // pool solo existe en Postgres; en SQLite (sql.js) es null y el
      // dedup se omite (abrirPedido igual crea el pedido).
      let previos: any[] = [];
      if (pool) {
        const r = await pool.query(
          `SELECT * FROM dropshipping_orders
          WHERE tenant_id = $1 AND product_id = $2 AND telefono = $3
            AND created_at > now() - interval '10 minutes'
            AND estado <> 'cancelado'
          ORDER BY id DESC LIMIT 1`,
          [row.tenantId, producto.id, datos.telefono],
        ).catch(() => ({ rows: [] as any[] }));
        previos = r.rows || [];
      }
      if (previos[0]) {
        const prev = previos[0];
        logger.info({ pedidoId: prev.id, wooOrderId: prev.woo_order_id }, "[LandingPublica] Pedido repetido en 10 min: se devuelve el existente");
        const verificar = prev.estado === "por_verificar" && prev.codigo_verificacion
          ? { verificar: true, token: seguro.tokenDeVerificacion(prev.id, prev.codigo_verificacion) } : {};
        return responderPedido(req, res, { ok: true, pedidoId: prev.id, registrado: !!prev.woo_order_id, wooOrderId: prev.woo_order_id ?? null, plazo: c.envio.plazo, repetido: true, ...verificar }, producto.name);
      }
    }

    let pedido: any = null;
    // En SQLite (modo local/dev) no hay pool de Postgres ni tampoco la tabla
    // dropshipping_orders. Para no romper la landing pública en entorno de
    // desarrollo, se simula el pedido y se avisa igual al dueño por WhatsApp.
    if (!pool) {
      const mockId = Math.floor(Date.now() / 1000) % 1000000;
      pedido = {
        id: mockId, tenantId: row.tenantId, conversationId: null, productId: producto.id,
        productName: producto.name, quantity: cantidad, unitPrice: String(unitPrice),
        total: String(unitPrice * cantidad), metodoPago: c.envio.pago === "anticipado" ? "transferencia" : "contraentrega",
        estado: "confirmado", wooOrderId: null, wooError: null, dropiEstado: null, dropiOrderId: null,
        variante: Object.values(opciones).join(" ").trim() || null, transportadora: limpio(b.transportadora, 80) || null,
        transportadoraId: null,
      } as any;
      try {
        const { avisarAlDueno } = await import("../lib/avisos");
        const texto = [
          `🛒 *Pedido nuevo desde la landing* (${row.name}) [MODO DEV/SQLITE]`,
          `📦 ${producto.name} × ${cantidad} · total $${Math.round(unitPrice * cantidad).toLocaleString("es-CO")}`,
          Object.values(opciones).join(" ").trim() ? `🎨 ${Object.values(opciones).join(" ").trim()}` : "",
          `👤 ${datos.nombre} · 📱 ${datos.telefono}${datos.documento ? ` · 🪪 ${datos.documento}` : ""}`,
          `🏠 ${datos.direccion}${datos.barrio ? `, ${datos.barrio}` : ""} — ${datos.ciudad}, ${datos.departamento}`,
          datos.notas ? `📍 ${datos.notas}` : "",
          "⚠️ Entorno SQLite: el pedido NO se guardó en base de datos."
        ].filter(Boolean).join("\n");
        await avisarAlDueno(row.tenantId, texto);
      } catch (e: any) { logger.warn({ err: e?.message }, "[LandingPublica] no se pudo avisar al admin del pedido"); }
      return responderPedido(req, res, { ok: true, pedidoId: pedido.id, registrado: false, plazo: c.envio.plazo }, producto.name);
    }

    pedido = await ds.abrirPedido({
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
    // Talla/color elegidos: antes iban SOLO en las notas y el despacho a Dropi
    // mandaba la variación por defecto. Guardados como variante, el despacho
    // los resuelve a la variación exacta (varianteParaDespacho).
    const varianteElegida = Object.values(opciones).join(" ").trim();
    if (varianteElegida) {
      await ds.guardarVarianteDelPedido(pedido.id, varianteElegida);
      pedido.variante = varianteElegida;
    }
    // Transportadora elegida en el formulario: solo si Dropi la conoce (id
    // real); si no, el despacho elige la disponible más económica.
    const transportadoraElegida = limpio(b.transportadora, 80);
    if (transportadoraElegida) {
      try {
        const { transportadoraConId } = await import("../lib/dropi-cotizador");
        const t = await transportadoraConId(row.tenantId, transportadoraElegida);
        if (t) {
          await ds.guardarTransportadoraDelPedido(pedido.id, t);
          pedido.transportadora = t.nombre;
          pedido.transportadoraId = t.id;
        }
      } catch (e: any) {
        logger.warn({ err: e?.message }, "[LandingPublica] no se pudo asociar la transportadora elegida");
      }
    }
    await ds.guardarIpDelPedido(pedido.id, ip).catch(() => {});

    // El complemento de otro producto: mismos datos de envío, su propio pedido.
    let pedidoExtra: any = null;
    if (productoExtra && extra) {
      pedidoExtra = await ds.abrirPedido({
        tenantId: row.tenantId, conversationId: null, productId: productoExtra.id, productName: productoExtra.name,
        unitPrice: extra.precio / extra.cantidad, quantity: extra.cantidad, telefono: datos.telefono,
        metodoPago: c.envio.pago === "anticipado" ? "transferencia" : "contraentrega",
      });
      pedidoExtra = (await ds.guardarDatos(pedidoExtra.id, { ...datos, notas: [`${b.extra === "downsell" ? "Downsell" : "Upsell"} del pedido #${pedido.id}`, datos.notas].filter(Boolean).join(" · ") })) || pedidoExtra;
      await ds.guardarIpDelPedido(pedidoExtra.id, ip).catch(() => {});
    }

    // Verificación por WhatsApp: el pedido espera a que el cliente nos escriba
    // su código; recién ahí se despacha (lib/landing/verificacion-whatsapp.ts).
    // Sin número de WhatsApp del negocio no hay a dónde escribir: se despacha
    // como siempre.
    const waNegocio = cfgPedido.verificarWhatsapp ? await whatsappDelNegocio(row.tenantId, producto) : "";
    if (waNegocio) {
      const codigo = seguro.generarCodigo();
      await ds.ponerEnVerificacion(pedido.id, codigo);
      if (pedidoExtra) await ds.ponerEnVerificacion(pedidoExtra.id, codigo);
      return responderPedido(req, res, { ok: true, pedidoId: pedido.id, registrado: false, plazo: c.envio.plazo, verificar: true, token: seguro.tokenDeVerificacion(pedido.id, codigo) }, producto.name);
    }

    if (pedidoExtra) {
      await ds.marcarEstado(pedidoExtra.id, "confirmado");
      pedidoExtra.estado = "confirmado";
      const rx = await ds.despacharPedido(pedidoExtra);
      if (!rx.ok) logger.warn({ pedidoId: pedidoExtra.id, err: rx.error }, "[LandingPublica] el complemento del upsell no se pudo registrar");
      detalleOpciones = [detalleOpciones, `+ pedido #${pedidoExtra.id}: ${pedidoExtra.productName} × ${pedidoExtra.quantity} (${rx.ok ? "registrado" : `sin registrar: ${rx.error}`})`].filter(Boolean).join(" · ");
    }
    await ds.marcarEstado(pedido.id, "confirmado");
    pedido.estado = "confirmado";
    const r = await ds.despacharPedido(pedido);

    try {
      const { avisarAlDueno } = await import("../lib/avisos");
      {
        const texto = [
          `🛒 *Pedido nuevo desde la landing* (${row.name})`,
          `📦 ${producto.name} × ${cantidad} · total $${Math.round(unitPrice * cantidad).toLocaleString("es-CO")}`,
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
  // Con verificación pendiente, la "siguiente pantalla" es la del código.
  const gracias = datos.verificar
    ? `/l/${encodeURIComponent(slug)}/verificar?pedido=${encodeURIComponent(String(datos.pedidoId ?? ""))}&k=${encodeURIComponent(String(datos.token || ""))}`
    : `/l/${encodeURIComponent(slug)}/gracias?pedido=${encodeURIComponent(String(datos.pedidoId ?? ""))}${datos.repetido ? "&repetido=1" : ""}`;
  delete datos.token;
  const quiereHtml = !req.is("application/json") && /text\/html/i.test(String(req.headers.accept || ""));
  if (quiereHtml) return res.redirect(303, gracias);
  return res.json({ ...datos, gracias });
}

/**
 * El pedido que espera verificación, solo si `k` es el token de ESE pedido
 * (ver tokenDeVerificacion). Sin token válido no se dice ni si existe.
 */
async function pedidoConToken(slug: string, pedidoId: number, k: string) {
  if (!pool || !Number.isInteger(pedidoId) || pedidoId <= 0 || !k) return null;
  const encontrada = await landingPorSlug(slug);
  if (!encontrada) return null;
  const { estadoDeVerificacion } = await import("../lib/dropshipping");
  const { tokenDeVerificacion } = await import("../lib/landing/pedido-seguro");
  const e = await estadoDeVerificacion(pedidoId);
  if (!e || !e.codigo || e.tenantId !== encontrada.row.tenantId || tokenDeVerificacion(pedidoId, e.codigo) !== k) return null;
  return { ...encontrada, estado: e.estado, codigo: e.codigo };
}

/** GET /api/landing-publica/:slug/pedido/:id/verificacion?k= → { estado } (la página pregunta cada pocos segundos). */
landingPublicaRouter.get("/api/landing-publica/:slug/pedido/:id/verificacion", async (req: Request, res: Response) => {
  try {
    const p = await pedidoConToken(String(req.params.slug || ""), Number(req.params.id), String(req.query.k || ""));
    res.setHeader("Cache-Control", "no-store");
    if (!p) return res.status(404).json({ ok: false });
    return res.json({ ok: true, verificado: p.estado !== "por_verificar" && p.estado !== "cancelado", estado: p.estado });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

/**
 * GET /l/:slug/verificar?pedido=&k= — "falta un paso": el cliente toca el
 * botón, se le abre WhatsApp con el código escrito y lo manda. La página
 * pregunta el estado y, cuando el bot recibe el código, pasa sola a /gracias.
 */
landingPublicaRouter.get("/l/:slug/verificar", async (req: Request, res: Response) => {
  const slug = String(req.params.slug || "");
  const pedidoId = Number(req.query.pedido);
  const k = String(req.query.k || "");
  const p = await pedidoConToken(slug, pedidoId, k).catch(() => null);
  const gracias = `/l/${encodeURIComponent(slug)}/gracias?pedido=${encodeURIComponent(String(pedidoId || ""))}`;
  if (!p) return res.redirect(303, `/l/${encodeURIComponent(slug)}`);
  if (p.estado !== "por_verificar") return res.redirect(303, gracias);
  const { textoDeVerificacion, HORAS_PARA_VERIFICAR } = await import("../lib/landing/pedido-seguro");
  const wa = await whatsappDelNegocio(p.row.tenantId, p.producto);
  const enlace = `https://wa.me/${wa}?text=${encodeURIComponent(textoDeVerificacion(pedidoId, p.codigo, p.producto?.name || "mi pedido"))}`;
  const esc = (v: any) => String(v ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] as string));
  const estadoUrl = `/api/landing-publica/${encodeURIComponent(slug)}/pedido/${pedidoId}/verificacion?k=${encodeURIComponent(k)}`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirma tu pedido</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Poppins:wght@700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Inter,system-ui,sans-serif;background:#F7F7F7;color:#111;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;border:1px solid #E5E7EB;border-radius:20px;padding:36px 26px;max-width:480px;width:100%;text-align:center;box-shadow:0 20px 50px rgba(17,17,17,.10)}
  .paso{display:inline-block;background:#FEF3C7;color:#92400E;font-weight:700;font-size:13px;border-radius:999px;padding:5px 12px;margin-bottom:14px}
  h1{font-family:Poppins,sans-serif;font-size:26px;line-height:1.2;margin-bottom:10px}
  p{color:#555B63;line-height:1.6;font-size:15.5px}
  .codigo{font-family:Poppins,sans-serif;font-size:30px;font-weight:800;letter-spacing:.06em;margin:20px 0 6px;font-variant-numeric:tabular-nums}
  .prod{font-weight:600;color:#111;margin-bottom:22px}
  a.wa{display:flex;align-items:center;justify-content:center;gap:10px;background:#25D366;color:#fff;font-weight:700;font-size:17px;text-decoration:none;padding:17px 20px;border-radius:14px;min-height:56px}
  a.wa:focus-visible{outline:3px solid #111;outline-offset:3px}
  a.wa svg{width:24px;height:24px}
  .espera{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:18px;font-size:14px;color:#555B63}
  .punto{width:9px;height:9px;border-radius:50%;background:#25D366;animation:latido 1.4s ease-in-out infinite}
  @keyframes latido{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}
  .ok .punto{animation:none;opacity:1}
  .nota{font-size:13px;margin-top:20px}
  @media (prefers-reduced-motion:reduce){.punto{animation:none;opacity:1}}
</style></head>
<body><main class="card">
  <span class="paso">Falta un paso</span>
  <h1>Confirma tu pedido por WhatsApp</h1>
  <p>Envíanos este código desde tu WhatsApp y despachamos tu pedido.</p>
  <div class="codigo" aria-label="Código ${esc(p.codigo)}">${esc(p.codigo)}</div>
  <p class="prod">Pedido #${esc(pedidoId)}${p.producto ? ` · ${esc(p.producto.name)}` : ""}</p>
  ${wa ? `<a class="wa" href="${esc(enlace)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2.1 1.3 2.4 1.4.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z"/></svg>Enviar código por WhatsApp</a>` : ""}
  <div class="espera" id="espera" role="status" aria-live="polite"><span class="punto"></span><span id="estado">Esperando tu mensaje…</span></div>
  <p class="nota">El mensaje ya va escrito: solo tienes que tocar enviar. Tienes ${HORAS_PARA_VERIFICAR} horas para confirmarlo.</p>
</main>
<script>(function(){var u=${JSON.stringify(estadoUrl)},g=${JSON.stringify(gracias)},n=0,h=0,listo=false;function q(){clearTimeout(h);if(listo)return;n++;fetch(u,{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){if(j&&j.verificado){listo=true;document.getElementById('espera').className='espera ok';document.getElementById('estado').textContent='¡Recibido! Tu pedido quedó confirmado.';setTimeout(function(){location.href=g},1200);return;}t()}).catch(t)}function t(){clearTimeout(h);h=setTimeout(q,n<60?4000:15000)}t();document.addEventListener('visibilitychange',function(){if(!document.hidden)q()});})();</script>
</body></html>`);
});

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
