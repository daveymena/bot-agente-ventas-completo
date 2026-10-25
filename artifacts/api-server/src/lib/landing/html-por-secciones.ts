/**
 * El HTML de una landing armada desde secciones (renderer-estilo o v3), UNO
 * solo para la vista previa del editor y para la URL pública /l/<slug>.
 *
 * Hasta el 14-10-2026 cada ruta armaba su propia llamada al renderer y no
 * eran iguales: la pública pasaba `modelo`, `semilla` y `precioAntes` (la
 * composición elegida y el precio tachado real) y la vista previa del editor
 * no. Resultado: el dueño editaba una página y el cliente veía otra —otro
 * orden de bloques, sin precio anterior—. Es el mismo tipo de fallo que el
 * panel de "Diseño" que se quitó en septiembre: una preview que miente.
 *
 * Acá también se hornea el TEMA del dueño (design.retoque: color, letras,
 * redondeo), así que llega igual a las dos.
 */
import { and, eq } from "drizzle-orm";
import { db, products } from "@workspace/db";
import { fotosUnicasDelProducto, guardadorDeMetadata } from "../fotos-de-producto";
import { aplicarRetoque } from "../estudio/retoque";
import { logger } from "../logger";

type Fila = { id: number; tenantId: number; slug: string; name: string; productId?: number | null; sections?: unknown; design?: unknown; html?: unknown; source?: unknown };

export async function productoDeLanding(row: Fila): Promise<any | null> {
  if (!row.productId) return null;
  const [p] = await db.select().from(products).where(and(eq(products.id, row.productId), eq(products.tenantId, row.tenantId))).limit(1);
  return p || null;
}

export async function enlacesDePago(tenantId: number, producto: any): Promise<{ mercadopago?: string; paypal?: string }> {
  try {
    const { PaymentGateway } = await import("../payments");
    const { tenantManager } = await import("../tenantManager");
    const tenant = await tenantManager.getTenantById(tenantId);
    const pg = new PaymentGateway(tenant || undefined);
    const links: any = await pg.getAllLinks(producto, { phone: "", name: "Landing" });
    return {
      mercadopago: links?.mercadopago?.shortUrl || links?.mercadopago?.url || undefined,
      paypal: links?.paypal?.shortUrl || links?.paypal?.url || undefined,
    };
  } catch (e: any) {
    logger.warn({ tenantId, err: e?.message }, "[Landing] no se pudieron generar los enlaces de pago");
    return {};
  }
}

/** El precio ANTERIOR real (metadata.precioAntes). Sin él no hay tachado. */
async function precioAntesDe(tenantId: number, producto: any): Promise<number | null> {
  if (!producto) return null;
  try {
    const { metadataDelProducto } = await import("../activos-fabricante");
    return Number((await metadataDelProducto(tenantId, producto.id))?.precioAntes ?? 0) || null;
  } catch { return null; }
}

/** ¿Esta landing se arma con renderer-estilo? */
export const esEstilo = (row: Fila) => (row.design as any)?.renderer === "estilo";

/** ¿Esta landing usa el diseño premium (lib/landing/renderer-premium.ts)? */
export const esPremium = (row: Fila) => (row.design as any)?.renderer === "premium";

const lista = (v: unknown): any[] => {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { const j = JSON.parse(v); return Array.isArray(j) ? j : []; } catch { return []; } }
  return [];
};

/**
 * El diseño premium con los datos REALES del producto y del negocio. Solo
 * llega al renderer lo que el negocio configuró: el envío pasa por
 * costoConfirmado/plazoConfirmado, y la garantía y los testimonios salen de
 * la ficha (nunca de la IA).
 */
export async function htmlPremium(row: Fila, producto: any): Promise<string> {
  const { renderizarPremium } = await import("./renderer-premium");
  const { negocioParaRender } = await import("./negocio-para-render");
  const { modeloDelProducto, CONDICIONES_DE_RESPALDO, costoConfirmado, plazoConfirmado, esColombia } = await import("../modelo-de-negocio");
  const { getBusinessContext } = await import("../business-context");
  const { garantiaDelProducto, testimoniosDelProducto } = await import("./plantillas");
  const { acentoDe } = await import("./renderer-moderno");
  const { videosDelProducto } = await import("../fotos-de-producto");
  const negocio = await negocioParaRender(row.tenantId, producto);
  const m = producto ? modeloDelProducto(producto) : "digital";
  // Suscripción se paga como un digital; cotización y captación se cierran
  // hablando, como un servicio.
  const modelo = m === "fisico" ? "fisico" : m === "digital" || m === "suscripcion" ? "digital" : "servicio";
  const ctx = await getBusinessContext(row.tenantId).catch(() => null);
  const c = ctx?.condiciones ?? CONDICIONES_DE_RESPALDO;
  const accion = (que: string) => `/api/landing-publica/${encodeURIComponent(row.slug)}/${que}`;
  const d = (row.design as any) || {};
  let fotos: string[] = [];
  if (producto) {
    fotos = await fotosUnicasDelProducto(producto, { guardar: guardadorDeMetadata(producto.id) }).catch(() => []);
    if (!fotos.length && producto.imageUrl) fotos = [String(producto.imageUrl)];
  }
  const video = producto ? videosDelProducto(producto).principal : null;
  const html = renderizarPremium({
    modelo,
    producto: {
      name: String(producto?.name || row.name || "Producto"),
      description: producto?.description ?? "",
      price: Number(producto?.price) || 0,
      features: lista(producto?.features).map(String),
      opciones: lista(producto?.opciones),
    },
    fotos,
    // Solo un archivo de video que el navegador reproduce; YouTube/Drive no van en <video>.
    video: video && /\.(mp4|webm)(\?|$)/i.test(video) ? video : null,
    precioAntes: await precioAntesDe(row.tenantId, producto),
    negocio: { nombre: negocio.nombre, whatsapp: negocio.whatsapp },
    envio: {
      pago: c.envio.pago,
      costo: costoConfirmado(c),
      plazo: plazoConfirmado(c),
      cobertura: c.fuente !== "respaldo" ? c.envio.cobertura : "",
    },
    ofertas: Array.isArray(d.ofertas) ? d.ofertas : null,
    garantia: producto ? garantiaDelProducto(producto) || null : null,
    testimonios: producto ? testimoniosDelProducto(producto) : [],
    secciones: (row.sections as any[]) || [],
    cierre: modelo === "fisico"
      ? { accion: accion("pedido") }
      : modelo === "digital"
        ? { ...(producto ? await enlacesDePago(row.tenantId, producto) : {}), cupon: accion("cupon") }
        : {},
    acento: acentoDe(producto?.category),
    esColombia: esColombia(c.pais),
  });
  return aplicarRetoque(html, d.retoque);
}

export async function htmlEstilo(row: Fila, producto: any): Promise<string> {
  const { renderizarLandingEstilo } = await import("./renderer-estilo");
  const { modeloDelProducto } = await import("../modelo-de-negocio");
  const { getAppUrl } = await import("../app-url");
  const modelo = producto ? modeloDelProducto(producto) : "digital";
  const html = await renderizarLandingEstilo({
    tenantId: row.tenantId,
    row: row as any,
    producto,
    precioAntes: await precioAntesDe(row.tenantId, producto),
    host: getAppUrl(),
    pago: producto && modelo !== "fisico" ? await enlacesDePago(row.tenantId, producto) : {},
  } as any);
  return aplicarRetoque(html, (row.design as any)?.retoque);
}

export async function htmlV3(row: Fila, producto: any, familiaPedida?: string | null): Promise<string> {
  const { renderizarLanding } = await import("./renderer-v3");
  const { negocioParaRender } = await import("./negocio-para-render");
  const { modeloDelProducto, sellosDelNegocio, CONDICIONES_DE_RESPALDO } = await import("../modelo-de-negocio");
  const { getBusinessContext } = await import("../business-context");
  const negocio = await negocioParaRender(row.tenantId, producto);
  const modelo = producto ? modeloDelProducto(producto) : "digital";
  const ctx = await getBusinessContext(row.tenantId).catch(() => null);
  const c = ctx?.condiciones ?? CONDICIONES_DE_RESPALDO;
  const accion = (que: string) => `/api/landing-publica/${encodeURIComponent(row.slug)}/${que}`;
  const cierre = modelo === "fisico"
    ? { tipo: "contraentrega" as const, accion: accion("pedido"), pais: c.pais, pago: c.envio.pago }
    : modelo === "digital"
      ? { tipo: "pago" as const, accion: accion("cupon"), ...(producto ? await enlacesDePago(row.tenantId, producto) : {}) }
      : { tipo: "whatsapp" as const };
  const d = (row.design as any) || {};
  const html = renderizarLanding({
    nombre: row.name,
    secciones: (row.sections as any[]) || [],
    familia: d.familia ?? familiaPedida ?? null,
    modelo: d.modelo ?? null,
    semilla: d.semilla ?? null,
    producto: producto && {
      name: producto.name,
      description: producto.description,
      imageUrl: producto.imageUrl,
      images: await fotosUnicasDelProducto(producto, { guardar: guardadorDeMetadata(producto.id) }),
      price: producto.price,
      currency: producto.currency,
      precioAntes: await precioAntesDe(row.tenantId, producto),
      paymentLink: producto.paymentLink,
      whatsapp: negocio.whatsapp,
      opciones: Array.isArray(producto.opciones) ? producto.opciones : null,
    },
    negocio,
    cierre,
    modo: d.modo ?? null,
    ofertas: d.ofertas ?? null,
    sellos: sellosDelNegocio(c),
  } as any);
  return aplicarRetoque(html, d.retoque);
}
