/**
 * Pedidos que Dropi rechazó (últimas 24 h): se reintentan SOLOS y, si entran, se le avisa
 * al cliente.
 *
 * Venta real (conversación 2, 06-10): el cliente confirmó, Dropi rechazó por
 * el nombre del departamento (arreglado en destinoParaDropi), el bot le dijo
 * "te confirmo por acá apenas quede resuelto"… y nadie volvió a intentarlo
 * ni le escribió: en el panel no hay pantalla de pedidos y el aviso al dueño
 * se perdió entre otros. Un rechazo por un dato nuestro (formato, una caída
 * momentánea de Dropi) se arregla reintentando; uno por el PRODUCTO (archivado,
 * sin stock) o por datos que faltan no, y esos se dejan para una persona.
 */
import { pool } from "@workspace/db";
import { logger } from "./logger";

/** ¿Tiene sentido volver a mandarlo tal cual? */
export function esReintentable(detalle: string | null | undefined): boolean {
  const d = String(detalle || "").toLowerCase();
  if (!d) return true;
  // El producto o los datos del cliente: reintentar no cambia nada.
  if (/archivad|sin stock|agotad|no (est[aá] )?disponible|stock insuficiente|faltan datos|producto no existe|no vinculado|token/.test(d)) return false;
  return true;
}

const INTENTOS_MAX = 3;
const intentos = new Map<number, number>();

/** Estados en los que el pedido ya no espera nada de nosotros. */
const CERRADOS = ["despachado", "cancelado", "entregado", "devuelto"];

export async function reintentarPedidosCaidos(): Promise<{ revisados: number; despachados: number[]; siguenFallando: number[] }> {
  const out = { revisados: 0, despachados: [] as number[], siguenFallando: [] as number[] };
  const { rows } = await pool.query(
    `SELECT * FROM dropshipping_orders
      WHERE dropi_estado = 'error'
        AND dropi_order_id IS NULL
        AND woo_order_id IS NULL
        AND NOT (estado = ANY($1::text[]))
        AND updated_at < now() - interval '10 minutes'
        -- Ultimas 72 h (antes 24): el pedido de Elkin (06-10) quedo fuera de
        -- la ventana el dia que se desplego el reintento y se perdio la venta.
        -- Uno mas viejo pudo haberse despachado a mano y reintentarlo lo
        -- duplicaria: esos quedan para el boton Reintentar del panel o para
        -- cuando el cliente pregunte (estado_de_mi_pedido lo reintenta).
        AND created_at > now() - interval '72 hours'
      ORDER BY created_at ASC
      LIMIT 20`,
    [CERRADOS],
  );
  const ds = await import("./dropshipping");
  for (const fila of rows as any[]) {
    const id = Number(fila.id);
    if (String(fila.telefono || "").startsWith("sim-") || String(fila.nombre || "").startsWith("sim-")) continue;
    if (!esReintentable(fila.dropi_error)) continue;
    const n = intentos.get(id) ?? 0;
    if (n >= INTENTOS_MAX) continue;
    intentos.set(id, n + 1);
    out.revisados++;

    const pedido = ds.aPedido(fila);
    let r: Awaited<ReturnType<typeof ds.despacharPedido>>;
    try {
      r = await ds.despacharPedido(pedido);
    } catch (e: any) {
      logger.warn({ pedidoId: id, err: e?.message }, "[ReintentoPedidos] el reintento tiró error");
      out.siguenFallando.push(id);
      continue;
    }
    if (!r.ok) {
      logger.warn({ pedidoId: id, intento: n + 1, error: r.error }, "[ReintentoPedidos] Dropi lo volvió a rechazar");
      out.siguenFallando.push(id);
      if (n + 1 >= INTENTOS_MAX) await avisarDueno(pedido.tenantId, `⚠️ *Pedido #${id} sin despachar* — ${pedido.nombre}, ${pedido.productName}: Dropi lo rechazó ${INTENTOS_MAX} veces (${String(r.error || "").slice(0, 160)}). Hay que revisarlo a mano.`);
      continue;
    }
    out.despachados.push(id);
    intentos.delete(id);
    logger.info({ pedidoId: id, dropi: r.dropi?.dropiOrderId }, "[ReintentoPedidos] pedido caído quedó registrado en Dropi");
    await avisarCliente(pedido).catch((e) => logger.warn({ pedidoId: id, err: String(e) }, "[ReintentoPedidos] no se pudo avisar al cliente"));
    await avisarDueno(pedido.tenantId, `✅ *Pedido #${id} recuperado* — ${pedido.nombre}, ${pedido.productName}: entró a Dropi${r.dropi?.dropiOrderId ? ` (orden #${r.dropi.dropiOrderId})` : ""} en el reintento automático. Ya se le avisó al cliente.`);
  }
  return out;
}

async function avisarDueno(tenantId: number, texto: string): Promise<void> {
  try {
    const { avisarAlDueno } = await import("./avisos");
    await avisarAlDueno(tenantId, texto);
  } catch { /* avisar no frena nada */ }
}

/** El mensaje que el bot le prometió: "te confirmo por acá apenas quede resuelto". */
async function avisarCliente(pedido: import("./dropshipping").PedidoDropshipping): Promise<void> {
  if (!pedido.conversationId) return;
  const { rows } = await pool.query(`SELECT contact_phone, contact_name FROM conversations WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [pedido.conversationId, pedido.tenantId]);
  const conv: any = rows[0];
  if (!conv?.contact_phone) return;
  const { getBusinessContext } = await import("./business-context");
  const ctx = await getBusinessContext(pedido.tenantId);
  const ds = await import("./dropshipping");
  const nombre = String(pedido.nombre || "").split(/\s+/)[0] || "";
  const texto =
    `¡Listo${nombre ? `, ${nombre}` : ""}! ✅ Tu pedido ya quedó registrado y sale para tu dirección.\n\n` +
    ds.confirmacionDelPedido(pedido, ctx.condiciones);
  const { enviarPartsAlCliente, transporteConectado } = await import("./transporte-whatsapp");
  if (!transporteConectado(pedido.tenantId)) throw new Error("WhatsApp del negocio desconectado");
  const tel = String(conv.contact_phone);
  // Un LID (14+ dígitos) se manda a su JID @lid; un teléfono, al de siempre.
  const jid = tel.replace(/\D/g, "").length > 13 ? `${tel.replace(/\D/g, "")}@lid` : undefined;
  await enviarPartsAlCliente(pedido.tenantId, tel, String(conv.contact_name || ""), [{ kind: "text", content: texto }], jid);
  await pool.query(
    `INSERT INTO messages (conversation_id, role, content, stage, created_at) VALUES ($1, 'agent', $2, 'closing', now())`,
    [pedido.conversationId, texto],
  ).catch(() => undefined);
}

let timer: ReturnType<typeof setInterval> | null = null;

export function iniciarReintentoDePedidos(): void {
  if (timer || process.env.REINTENTO_PEDIDOS === "off") return;
  const correr = async () => {
    try {
      const { ensureDbReady } = await import("@workspace/db");
      await ensureDbReady();
      const r = await reintentarPedidosCaidos();
      if (r.revisados) logger.info(r, "[ReintentoPedidos] corrida");
    } catch (e: any) {
      logger.warn({ err: e?.message }, "[ReintentoPedidos] corrida falló");
    }
  };
  setTimeout(() => { void correr(); }, 2 * 60_000).unref?.();
  timer = setInterval(() => { void correr(); }, 20 * 60_000);
  timer.unref?.();
  logger.info("[ReintentoPedidos] programado cada 20 min");
}
