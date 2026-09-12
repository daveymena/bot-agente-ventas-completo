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

export interface EstadoWooCommerce {
  configurada: boolean;
  conexion: { ok: boolean; detalle: string; productosVisibles?: number };
  ultimosPedidosEnWoo: Array<{ id: number; estado: string; total: string; fecha: string; nombre: string; ciudad: string }>;
  pedidosDelBot: PedidoDelBot[];
  resumen: string;
}

const ESTADO_LEGIBLE: Record<string, string> = {
  borrador: "tomando datos",
  completo: "datos completos, sin confirmar",
  por_confirmar: "esperando el sí del cliente",
  confirmado: "confirmado, sin registrar en Woo",
  enviado: "registrado en WooCommerce",
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
      ultimosPedidosEnWoo = orders.map((o: any) => ({
        id: Number(o.id), estado: String(o.status), total: String(o.total),
        fecha: String(o.date_created || ""),
        nombre: `${o.shipping?.first_name || o.billing?.first_name || ""} ${o.shipping?.last_name || o.billing?.last_name || ""}`.trim(),
        ciudad: String(o.shipping?.city || o.billing?.city || ""),
      }));
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
      ? `Últimos pedidos en WooCommerce: ${ultimosPedidosEnWoo.map((o) => `#${o.id} ${o.estado} $${o.total} (${o.ciudad || "sin ciudad"})`).join(" · ")}.`
      : conexion.ok ? "WooCommerce no tiene pedidos todavía." : "",
    pedidosDelBot.length
      ? `Pedidos que tomó el bot por WhatsApp: ${pedidosDelBot.length} (${llegaron.length} registrados en Woo, ${fallaron.length} fallaron, ${sinConfirmar.length} sin confirmar por el cliente).`
        + (fallaron.length ? ` Fallos: ${fallaron.map((p) => `#${p.id} ${p.wooError}`).join(" · ")}.` : "")
      : "El bot todavía no tomó ningún pedido físico por WhatsApp: no hay nada que haya intentado mandar a WooCommerce.",
  ].filter(Boolean).join(" ");

  return { configurada: true, conexion, ultimosPedidosEnWoo, pedidosDelBot: pedidosDelBot.map((p) => ({ ...p, estado: ESTADO_LEGIBLE[p.estado] || p.estado })), resumen };
}
