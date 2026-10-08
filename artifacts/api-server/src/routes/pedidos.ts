import { Router } from "express";
import { pool } from "@workspace/db";

/**
 * Pedidos del bot en el panel.
 *
 * Hasta el 07-10 no había ninguna pantalla de pedidos: un pedido que Dropi
 * rechazaba solo se veía preguntándole a Atlas, y la venta de Bogotá quedó
 * un día en el aire sin que nadie se enterara. Lista por negocio (cada
 * negocio ve SOLO los suyos) + reintentar a mano.
 */
const router = Router();

const tenantDe = (req: any): number | null => {
  const t = Number(req.tenant?.id);
  return Number.isInteger(t) && t > 0 ? t : null;
};

router.get("/", async (req: any, res: any) => {
  const tenantId = tenantDe(req);
  if (!tenantId) return res.status(401).json({ error: "No autenticado" });
  const { rows } = await pool.query(
    `SELECT id, conversation_id, product_name, quantity, total, nombre, telefono, ciudad, departamento, direccion,
            metodo_pago, estado, dropi_estado, dropi_order_id, dropi_error, woo_order_id, woo_error, transportadora,
            created_at, updated_at
       FROM dropshipping_orders
      WHERE tenant_id = $1 AND created_at > now() - interval '60 days'
      ORDER BY created_at DESC
      LIMIT 200`,
    [tenantId],
  );
  res.json({
    pedidos: rows.map((r: any) => ({
      id: r.id,
      conversacionId: r.conversation_id,
      producto: r.product_name,
      cantidad: r.quantity,
      total: Number(r.total) || 0,
      cliente: r.nombre,
      telefono: r.telefono,
      destino: [r.ciudad, r.departamento].filter(Boolean).join(", "),
      direccion: r.direccion,
      pago: r.metodo_pago,
      estado: r.estado,
      // Lo que importa de un vistazo: ¿llegó al proveedor o no?
      enProveedor: r.dropi_estado === "sincronizada" || !!r.dropi_order_id,
      ordenProveedor: r.dropi_order_id,
      error: r.dropi_error || r.woo_error || null,
      transportadora: r.transportadora,
      creado: r.created_at,
      actualizado: r.updated_at,
    })),
  });
});

router.post("/:id/reintentar", async (req: any, res: any) => {
  const tenantId = tenantDe(req);
  if (!tenantId) return res.status(401).json({ error: "No autenticado" });
  const id = Number(req.params.id);
  const { rows } = await pool.query(`SELECT * FROM dropshipping_orders WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [id, tenantId]);
  if (!rows[0]) return res.status(404).json({ ok: false, error: "No existe ese pedido en tu negocio." });
  const ds = await import("../lib/dropshipping");
  const pedido = ds.aPedido(rows[0]);
  if (pedido.dropiOrderId || pedido.dropiEstado === "sincronizada") {
    return res.json({ ok: true, mensaje: "Ese pedido ya está en el proveedor." });
  }
  const r = pedido.wooOrderId ? await ds.reintentarEnDropi(tenantId, id) : await ds.despacharPedido(pedido);
  res.json({
    ok: !!r.ok,
    mensaje: r.ok ? `Pedido #${id} registrado en el proveedor${r.dropi?.dropiOrderId ? ` (orden #${r.dropi.dropiOrderId})` : ""}.` : `No entró: ${r.error || r.dropi?.detalle || "sin detalle"}`,
  });
});

export default router;
