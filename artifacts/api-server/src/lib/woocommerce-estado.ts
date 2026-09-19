/**
 * Estado REAL de la integración con WooCommerce, en un solo lugar.
 *
 * Lo que pasó (12-09-2026): el dueño le preguntó a Atlas "verificá si al
 * mandar los datos a WooCommerce los recibe", y Atlas contestó "No hay
 * ninguna conexión con WooCommerce. No existe en tu sistema" — con la
 * integración habilitada, credenciales cargadas, 90 productos importados de
 * ahí y el flujo de pedidos escribiendo en esa tienda. No tenía herramienta
 * para mirarlo, y en vez de decir "no puedo verlo" afirmó que no existía.
 *
 * Esto lo lee la ruta del panel y la herramienta `woocommerce_estado` de
 * Atlas, así que los dos cuentan lo mismo: si la conexión responde, cuántos
 * productos hay, los últimos pedidos que WooCommerce tiene, y los pedidos que
 * el bot registró con su resultado (llegó / falló y por qué / sin confirmar).
 */
import { pool } from "@workspace/db";
import { getWooCommerceService } from "./woocommerce";

export interface PedidoDelBot {
  id: number;
  producto: string | null;
  total: string | null;
  estado: string;
  wooOrderId: number | null;
  wooError: string | null;
  ciudad: string | null;
  creado: string;
}

/**
 * Qué hizo el plugin Dropify con un pedido de WooCommerce.
 *
 * Leído del código fuente del plugin (wc-dropi-integration, sep-2026): al
 * pasar a "processing" escribe en la orden la meta `_is_dropi_order` con
 * "Yes" (+ `_dropi_order_id`), "Dropi sync error: …" o "This order do not
 * have dropi products". Si NO escribe nada es que el gancho no corrió: la
 * opción "sincronizar órdenes automáticamente" del plugin está apagada.
 * Es la única forma de saber, desde acá, si el pedido llegó a Dropi.
 */
export interface RastroDropi {
  estado: "sincronizada" | "error" | "sin_productos_dropi" | "sin_rastro";
  dropiOrderId: string | null;
  detalle: string;
  /** Por línea: si el producto de Woo tiene la meta `_dropi_product` que Dropify exige, y con qué integración. */
  productos: Array<{ wooProductId: number; nombre: string; esDeDropi: boolean | null; integracion?: IntegracionDropi | null }>;
}

export interface EstadoWooCommerce {
  configurada: boolean;
  conexion: { ok: boolean; detalle: string; productosVisibles?: number };
  ultimosPedidosEnWoo: Array<{ id: number; estado: string; total: string; fecha: string; nombre: string; ciudad: string; dropi: RastroDropi }>;
  pedidosDelBot: PedidoDelBot[];
  resumen: string;
}

/**
 * Lo que dice el token de integración que Dropify guardó en el producto
 * (`_dropi_token`). Es un JWT: el payload se lee sin secreto. Trae
 * `integration_url` (la tienda a la que Dropi le dio el token) e `ip_url`
 * (la IP que Dropi acepta). "Access denied" (pedidos #324-#328, 19-09) es
 * exactamente esto: la IP del servidor no coincide con la del token del
 * producto — y como el token es POR PRODUCTO, dos productos de la misma
 * tienda pueden tener integraciones distintas (el #323 pasó, el corrector no).
 */
export interface IntegracionDropi {
  tienda: string | null;
  ipAutorizada: string | null;
  usuario: string | number | null;
  vence: string | null;
  tokenHuella: string;
}

export function leerIntegracionDropi(token: string | null | undefined): IntegracionDropi | null {
  const t = String(token || "").trim();
  if (!t || t.split(".").length < 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return {
      tienda: payload.integration_url || payload.store || payload.url || null,
      ipAutorizada: payload.ip_url || payload.ip || null,
      usuario: payload.user_id || payload.sub || payload.id || null,
      vence: payload.exp ? new Date(Number(payload.exp) * 1000).toISOString().slice(0, 10) : null,
      tokenHuella: t.slice(0, 6) + "…" + t.slice(-6),
    };
  } catch {
    return null;
  }
}

export function leerRastroDropi(o: any): Omit<RastroDropi, "productos"> {
  const meta = (o?.meta_data || []) as Array<{ key: string; value: any }>;
  const marca = String(meta.find((m) => m.key === "_is_dropi_order")?.value ?? "").trim();
  const dropiOrderId = meta.find((m) => m.key === "_dropi_order_id")?.value;
  if (marca === "Yes") {
    return { estado: "sincronizada", dropiOrderId: dropiOrderId != null ? String(dropiOrderId) : null, detalle: `Dropify la envió a Dropi${dropiOrderId != null ? ` (orden Dropi #${dropiOrderId})` : ""}.` };
  }
  if (/sync error/i.test(marca)) {
    return { estado: "error", dropiOrderId: null, detalle: `Dropify intentó y Dropi la rechazó: ${marca.replace(/^Dropi sync error:\s*/i, "")}` };
  }
  if (/do not have dropi products/i.test(marca)) {
    return { estado: "sin_productos_dropi", dropiOrderId: null, detalle: "Dropify corrió pero ningún producto de la orden tiene la meta `_dropi_product` (no fue importado por Dropify)." };
  }
  if (marca) return { estado: "error", dropiOrderId: null, detalle: marca };
  return {
    estado: "sin_rastro",
    dropiOrderId: null,
    detalle: o?.status === "processing"
      ? "Dropify no dejó rastro: el gancho no corrió. Casi seguro la opción 'sincronizar órdenes automáticamente' del plugin está apagada (WP-admin → Dropify → ajustes)."
      : `La orden está en '${o?.status}': Dropify solo envía a Dropi cuando pasa a 'processing'.`,
  };
}

const ESTADO_LEGIBLE: Record<string, string> = {
  borrador: "tomando datos",
  completo: "datos completos, sin confirmar",
  por_confirmar: "esperando el sí del cliente",
  confirmado: "confirmado, sin registrar en Woo",
  enviado: "registrado en WooCommerce",
  despachado: "en Dropi, el proveedor despacha",
  rechazado_dropi: "en WooCommerce pero Dropi lo RECHAZÓ",
  cancelado: "cancelado",
};

export async function estadoWooCommerce(tenantId: number): Promise<EstadoWooCommerce> {
  const woo = await getWooCommerceService(tenantId).catch(() => null);

  // Los pedidos que el bot registró, con o sin Woo: es lo que responde "¿y
  // qué ha pasado con ellos?".
  const { rows } = await pool.query(
    `SELECT id, product_name, total, estado, woo_order_id, woo_error, ciudad, created_at
       FROM dropshipping_orders WHERE tenant_id = $1 ORDER BY id DESC LIMIT 10`,
    [tenantId],
  ).catch(() => ({ rows: [] as any[] }));
  const pedidosDelBot: PedidoDelBot[] = rows.map((r: any) => ({
    id: r.id, producto: r.product_name, total: r.total, estado: r.estado,
    wooOrderId: r.woo_order_id, wooError: r.woo_error, ciudad: r.ciudad,
    creado: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  if (!woo) {
    return {
      configurada: false,
      conexion: { ok: false, detalle: "WooCommerce no está configurado o está deshabilitado para este negocio." },
      ultimosPedidosEnWoo: [],
      pedidosDelBot,
      resumen: "WooCommerce NO está configurado para este negocio (sin URL o sin claves, o la integración está apagada).",
    };
  }

  let conexion: EstadoWooCommerce["conexion"];
  try {
    const productos = await woo.getProducts({ per_page: 1 });
    conexion = { ok: true, detalle: "responde", productosVisibles: productos.length };
  } catch (e: any) {
    conexion = { ok: false, detalle: String(e?.message || e) };
  }

  let ultimosPedidosEnWoo: EstadoWooCommerce["ultimosPedidosEnWoo"] = [];
  if (conexion.ok) {
    try {
      const orders = await woo.getOrders({ per_page: 5 });
      // ¿Los productos de cada orden son de Dropify? Sin `_dropi_product` el
      // plugin la descarta aunque el auto-sync esté encendido.
      const cacheProductos = new Map<number, { esDeDropi: boolean | null; integracion: IntegracionDropi | null }>();
      const infoDropi = async (id: number) => {
        if (!id) return { esDeDropi: null, integracion: null };
        if (cacheProductos.has(id)) return cacheProductos.get(id)!;
        let r: { esDeDropi: boolean | null; integracion: IntegracionDropi | null } = { esDeDropi: null, integracion: null };
        try {
          const p = await woo.getProduct(id);
          const meta = (p.meta_data || []) as Array<{ key: string; value: any }>;
          r = {
            esDeDropi: !!meta.find((m) => m.key === "_dropi_product" && m.value),
            integracion: leerIntegracionDropi(meta.find((m) => m.key === "_dropi_token")?.value),
          };
        } catch { /* sin acceso al producto */ }
        cacheProductos.set(id, r);
        return r;
      };
      ultimosPedidosEnWoo = [];
      for (const o of orders) {
        const productos = [] as RastroDropi["productos"];
        for (const li of (o.line_items || []) as any[]) {
          const info = await infoDropi(Number(li.product_id));
          productos.push({ wooProductId: Number(li.product_id), nombre: String(li.name || ""), esDeDropi: info.esDeDropi, integracion: info.integracion });
        }
        ultimosPedidosEnWoo.push({
          id: Number(o.id), estado: String(o.status), total: String(o.total),
          fecha: String(o.date_created || ""),
          nombre: `${o.shipping?.first_name || o.billing?.first_name || ""} ${o.shipping?.last_name || o.billing?.last_name || ""}`.trim(),
          ciudad: String(o.shipping?.city || o.billing?.city || ""),
          dropi: { ...leerRastroDropi(o), productos },
        });
      }
    } catch (e: any) {
      conexion = { ...conexion, detalle: `responde, pero no deja leer pedidos: ${e?.message || e}` };
    }
  }

  const llegaron = pedidosDelBot.filter((p) => p.wooOrderId);
  const fallaron = pedidosDelBot.filter((p) => p.wooError && !p.wooOrderId);
  const sinConfirmar = pedidosDelBot.filter((p) => !p.wooOrderId && !p.wooError);
  const resumen = [
    conexion.ok ? "WooCommerce conectado y responde." : `WooCommerce configurado pero NO responde: ${conexion.detalle}.`,
    ultimosPedidosEnWoo.length
      ? `Últimos pedidos en WooCommerce: ${ultimosPedidosEnWoo.map((o) => {
          const integ = o.dropi.productos.map((p) => p.integracion).find(Boolean);
          const conInteg = integ ? ` [token de Dropify del producto: tienda ${integ.tienda || "?"}, IP autorizada ${integ.ipAutorizada || "?"}]` : "";
          return `#${o.id} ${o.estado} $${o.total} (${o.ciudad || "sin ciudad"}) → Dropi: ${o.dropi.detalle}${/access denied/i.test(o.dropi.detalle) ? conInteg : ""}`;
        }).join(" · ")}.`
      : conexion.ok ? "WooCommerce no tiene pedidos todavía." : "",
    pedidosDelBot.length
      ? `Pedidos que tomó el bot por WhatsApp: ${pedidosDelBot.length} (${llegaron.length} registrados en Woo, ${fallaron.length} fallaron, ${sinConfirmar.length} sin confirmar por el cliente).`
        + (fallaron.length ? ` Fallos: ${fallaron.map((p) => `#${p.id} ${p.wooError}`).join(" · ")}.` : "")
      : "El bot todavía no tomó ningún pedido físico por WhatsApp: no hay nada que haya intentado mandar a WooCommerce.",
  ].filter(Boolean).join(" ");

  return { configurada: true, conexion, ultimosPedidosEnWoo, pedidosDelBot: pedidosDelBot.map((p) => ({ ...p, estado: ESTADO_LEGIBLE[p.estado] || p.estado })), resumen };
}
