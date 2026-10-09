/**
 * Conector de Alegra (https://developer.alegra.com, consultado el 09-10-2026).
 *
 *  · Base `https://api.alegra.com/api/v1`, Basic auth `correo:token`.
 *  · `POST /invoices` exige `date`, `dueDate`, `client` (id) e `items` con
 *    `id`, `price`, `quantity`: el ítem y el cliente tienen que EXISTIR en
 *    Alegra. Por eso:
 *      - el producto se busca por referencia `vp-<productId>` y, si no está,
 *        se crea (así la segunda venta del mismo producto ya lo encuentra);
 *      - el cliente se busca por cédula si la tenemos; si no, va al contacto
 *        "Consumidor final" que el negocio configuró (no inventamos datos
 *        tributarios de una persona: régimen, tipo de persona, DV).
 *  · Colombia: `paymentForm: "CASH"` + `paymentMethod` son obligatorios con
 *    facturación electrónica 2.1; `stamp.generateStamp` la emite ante la DIAN.
 *    Si el timbrado falla, Alegra responde 400 y deja la factura en BORRADOR.
 *
 * ⚠️ Escrito contra la documentación pública, sin una cuenta de Alegra real
 * para probarlo de punta a punta. `probarConexion` existe para eso: el negocio
 * lo corre al conectar y el error de Alegra se muestra tal cual.
 */
import type { ConfigAlegra, FacturaEmitida, Pedir, VentaAFacturar } from "./tipos";

const BASE = "https://api.alegra.com/api/v1";

function cabeceras(c: ConfigAlegra): Record<string, string> {
  const basic = Buffer.from(`${c.correo}:${c.token}`).toString("base64");
  return { Authorization: `Basic ${basic}`, "Content-Type": "application/json", Accept: "application/json" };
}

/** El mensaje de error de Alegra, legible para el admin. */
async function errorDe(r: Response): Promise<string> {
  const raw = await r.text().catch(() => "");
  try {
    const j = JSON.parse(raw);
    const msg = j?.message || j?.error?.message || j?.error || raw;
    return `Alegra respondió ${r.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`.slice(0, 300);
  } catch {
    return `Alegra respondió ${r.status}: ${raw.slice(0, 200)}`;
  }
}

async function llamar(pedir: Pedir, c: ConfigAlegra, ruta: string, init: RequestInit = {}): Promise<any> {
  const r = await pedir(`${BASE}${ruta}`, { ...init, headers: { ...cabeceras(c), ...(init.headers as any) } });
  if (!r.ok) throw new Error(await errorDe(r));
  return r.json().catch(() => ({}));
}

export function validarConfig(c: Partial<ConfigAlegra> | undefined): string | null {
  if (!c?.correo) return "Falta el correo de la cuenta de Alegra.";
  if (!c.token) return "Falta el token de la API de Alegra (Alegra → Configuración → Integraciones → API).";
  if (!c.contactoPorDefecto) return "Falta el id del contacto \"Consumidor final\" en Alegra.";
  return null;
}

/** Verifica que las credenciales entran y que el contacto por defecto existe. */
export async function probarConexion(c: ConfigAlegra, pedir: Pedir = fetch): Promise<{ contacto: string }> {
  const falta = validarConfig(c);
  if (falta) throw new Error(falta);
  const contacto = await llamar(pedir, c, `/contacts/${encodeURIComponent(c.contactoPorDefecto)}`);
  return { contacto: String(contacto?.name || c.contactoPorDefecto) };
}

export const referenciaDe = (productId: number | null, nombre: string) =>
  productId ? `vp-${productId}` : `vp-${nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;

async function idDelItem(pedir: Pedir, c: ConfigAlegra, it: VentaAFacturar["items"][number]): Promise<string> {
  const ref = referenciaDe(it.productId, it.nombre);
  const encontrados = await llamar(pedir, c, `/items?query=${encodeURIComponent(ref)}`);
  const lista: any[] = Array.isArray(encontrados) ? encontrados : (encontrados?.data || []);
  // `query` busca por coincidencia parcial en nombre Y referencia: se exige la
  // referencia exacta para no facturar "vp-12" con el ítem "vp-123".
  const exacto = lista.find((x) => String(x?.reference?.reference ?? x?.reference ?? "") === ref);
  if (exacto?.id) return String(exacto.id);
  const creado = await llamar(pedir, c, "/items", {
    method: "POST",
    body: JSON.stringify({
      name: it.nombre.slice(0, 150),
      price: it.precio,
      reference: ref,
      // Un curso o un acceso es un servicio; lo físico va como producto SIN
      // inventario (el inventario lo lleva Dropi/la tienda, no Alegra).
      type: it.digital ? "service" : "product",
      ...(c.impuesto ? { tax: [{ id: c.impuesto }] } : {}),
    }),
  });
  if (!creado?.id) throw new Error(`Alegra no devolvió el id del ítem creado (${ref}).`);
  return String(creado.id);
}

async function idDelCliente(pedir: Pedir, c: ConfigAlegra, venta: VentaAFacturar): Promise<string> {
  const doc = String(venta.cliente.documento || "").replace(/\D/g, "");
  if (doc.length >= 5) {
    const r = await llamar(pedir, c, `/contacts?identification=${encodeURIComponent(doc)}`).catch(() => []);
    const lista: any[] = Array.isArray(r) ? r : (r?.data || []);
    const exacto = lista.find((x) => String(x?.identificationObject?.number ?? x?.identification ?? "").replace(/\D/g, "") === doc);
    if (exacto?.id) return String(exacto.id);
  }
  return c.contactoPorDefecto;
}

/** Método de pago de Alegra a partir del que quedó en el pago. */
export function metodoAlegra(metodo: string): string {
  const m = metodo.toLowerCase();
  if (/efectivo|contraentrega|cash/.test(m)) return "CASH";
  if (/tarjeta|card|credito|crédito|debito|débito/.test(m)) return "CREDIT_CARD";
  return "TRANSFER";
}

export async function emitir(c: ConfigAlegra, venta: VentaAFacturar, pedir: Pedir = fetch): Promise<FacturaEmitida> {
  const falta = validarConfig(c);
  if (falta) throw new Error(falta);
  if (venta.items.length === 0) throw new Error("La venta no tiene ítems para facturar.");

  const items = [];
  for (const it of venta.items) {
    items.push({
      id: await idDelItem(pedir, c, it),
      price: it.precio,
      quantity: it.cantidad,
      ...(c.impuesto ? { tax: [{ id: c.impuesto }] } : {}),
    });
  }
  const cliente = await idDelCliente(pedir, c, venta);

  const factura = await llamar(pedir, c, "/invoices", {
    method: "POST",
    body: JSON.stringify({
      date: venta.fecha,
      dueDate: venta.fecha,
      client: { id: cliente },
      items,
      status: "open",
      paymentForm: "CASH",
      paymentMethod: metodoAlegra(venta.metodoPago),
      observations: `Venta VentasPro · pago #${venta.pagoId}`,
      ...(c.numeracion ? { numberTemplate: { id: c.numeracion } } : {}),
      ...(c.electronica ? { stamp: { generateStamp: true } } : {}),
    }),
  });

  const nt = factura?.numberTemplate || {};
  const numero = nt.fullNumber || [nt.prefix, nt.number].filter(Boolean).join("") || (factura?.id ? String(factura.id) : null);
  return {
    proveedor: "alegra",
    idExterno: factura?.id ? String(factura.id) : null,
    numero: numero || null,
    electronica: c.electronica,
    emitidaEn: new Date().toISOString(),
  };
}
