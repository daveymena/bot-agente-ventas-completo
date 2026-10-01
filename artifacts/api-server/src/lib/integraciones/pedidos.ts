/**
 * Pedidos EXTERNOS → pedidos internos (dropshipping_orders).
 *
 * El MISMO flujo que POST /api/landing-publica/:slug/pedido, menos el
 * despacho: abrirPedido + guardarDatos + marcarEstado + avisarAlDueno.
 * NO se despacha a Dropi ni se escribe por WhatsApp automáticamente (decisión
 * del dueño 01-10-2026: riesgo de baneo / doble pedido si la tienda ya usa
 * Dropify). El dueño despacha desde el panel como cualquier pedido manual.
 */
import { pool } from "@workspace/db";
import { logger } from "../logger";
import { abrirPedido, guardarDatos, marcarEstado } from "../dropshipping";
import { avisarAlDueno } from "../avisos";
import { skuDe, type PedidoExterno, type Plataforma, type ResultadoPedidos } from "./tipos";

async function esRepetido(tenantId: number, telefono: string | null, productId: number | null, idExterno: string, plataforma: Plataforma): Promise<number | null> {
  try {
    // 1) Mismo id externo ya registrado (las notas llevan "[origen:id]").
    const { rows: porId } = await pool.query(
      `SELECT id FROM dropshipping_orders
        WHERE tenant_id = $1 AND notas LIKE $2 AND estado <> 'cancelado'
        ORDER BY id DESC LIMIT 1`,
      [tenantId, `%[${plataforma}:${idExterno}]%`],
    ).catch(() => ({ rows: [] as any[] }));
    if (porId[0]) return porId[0].id;
    // 2) Mismo cliente + producto hace 10 min (igual que la landing pública).
    if (telefono && productId) {
      const { rows: previos } = await pool.query(
        `SELECT id FROM dropshipping_orders
          WHERE tenant_id = $1 AND product_id = $2 AND telefono = $3
            AND created_at > now() - interval '10 minutes'
            AND estado <> 'cancelado'
          ORDER BY id DESC LIMIT 1`,
        [tenantId, productId, telefono],
      ).catch(() => ({ rows: [] as any[] }));
      if (previos[0]) return previos[0].id;
    }
    return null;
  } catch {
    return null;
  }
}

export async function importarPedidos(
  tenantId: number,
  plataforma: Plataforma,
  externos: PedidoExterno[],
  resolverProducto: (item: PedidoExterno["items"][number]) => Promise<{ id: number | null; nombre: string; precio: number }>,
): Promise<ResultadoPedidos> {
  const res: ResultadoPedidos = { creados: 0, repetidos: 0, errores: 0, detalles: [] };
  for (const ext of externos) {
    try {
      const primero = ext.items[0];
      if (!primero) { res.errores++; res.detalles.push(`${ext.idExterno}: sin items`); continue; }
      const prod = await resolverProducto(primero);
      if (!prod.id) {
        // El pedido no puede vivir sin producto interno: primero se importan
        // los productos (así el SKU queda estable) y después los pedidos.
        res.errores++;
        res.detalles.push(`${ext.idExterno}: "${primero.nombre}" no está importado (importá productos primero)`);
        continue;
      }
      const repetido = await esRepetido(tenantId, ext.telefono || null, prod.id, ext.idExterno, plataforma);
      if (repetido) { res.repetidos++; continue; }

      const cantidad = Math.max(1, Number(primero.cantidad) || 1);
      const unitPrice = Number(primero.precio) || Number(prod.precio) || 0;
      let pedido = await abrirPedido({
        tenantId,
        conversationId: null,
        leadId: undefined,
        productId: prod.id as number,
        productName: prod.nombre,
        unitPrice,
        quantity: cantidad,
        telefono: ext.telefono || undefined,
        metodoPago: ext.metodoPago || plataforma,
      });
      const notas = [`[${plataforma}:${ext.idExterno}]`, ext.notas].filter(Boolean).join(" · ");
      pedido = (await guardarDatos(pedido.id, {
        nombre: ext.nombre || undefined,
        telefono: ext.telefono || undefined,
        documento: ext.documento || undefined,
        departamento: ext.departamento || undefined,
        ciudad: ext.ciudad || undefined,
        direccion: ext.direccion || undefined,
        barrio: ext.barrio || undefined,
        notas,
      })) || pedido;
      const estado = ext.pagado ? "confirmado" : "por_confirmar";
      await marcarEstado(pedido.id, estado as "confirmado");

      await avisarAlDueno(
        tenantId,
        `🛒 *Pedido nuevo desde ${plataforma}* (#${pedido.id})\n` +
        `• ${prod.nombre} × ${cantidad}\n` +
        `• Cliente: ${ext.nombre || "?"} ${ext.telefono || ""}\n` +
        `• ${ext.ciudad || ""} ${ext.direccion || ""}\n` +
        `• Estado: ${estado} (${ext.pagado ? "pagado afuera" : "pago pendiente"})`.trim(),
      );
      res.creados++;
      res.detalles.push(`#${pedido.id} ← ${plataforma}:${ext.idExterno} (${estado})`);
    } catch (e: any) {
      res.errores++;
      res.detalles.push(`${ext.idExterno}: ${e?.message || e}`.slice(0, 200));
      logger.warn({ tenantId, plataforma, err: e?.message }, "[Integraciones] no se pudo crear el pedido");
    }
  }
  return res;
}

/** Resuelve un item externo al producto interno por SKU estable (y por SKU propio como respaldo). */
export function resolvedorPorSku(tenantId: number, plataforma: Plataforma) {
  return async (item: PedidoExterno["items"][number]) => {
    const { db, products } = await import("@workspace/db");
    const { eq, and } = await import("drizzle-orm");
    // Primero el SKU estable (shopify-<id>/ali-<id>/meli-<id>), que es lo que
    // deja el importador; después el SKU propio de la tienda, por si el dueño
    // lo cargó a mano igual en ambos lados.
    const candidatos = [skuDe(plataforma, item.idExterno), item.sku].filter(Boolean) as string[];
    for (const sku of candidatos) {
      const [p] = await db.select({ id: products.id, name: products.name, price: products.price })
        .from(products)
        .where(and(eq(products.tenantId, tenantId), eq(products.sku, sku)))
        .limit(1);
      if (p) return { id: p.id, nombre: p.name, precio: Number(p.price) || 0 };
    }
    return { id: null, nombre: item.nombre, precio: Number(item.precio) || 0 };
  };
}
