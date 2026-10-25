/**
 * El cliente nos escribió el código de su pedido de la landing.
 *
 * Corre en el receptor de mensajes (services/message-handler.ts) ANTES de
 * encolar al vendedor: un código válido se atiende acá y el vendedor no lo
 * ve como mensaje suelto. Si el mensaje trae un código que no corresponde a
 * ningún pedido pendiente (vencido, ya verificado, mal copiado), no se toca
 * nada y sigue al vendedor como cualquier mensaje.
 *
 * La regla de por qué la verificación va "al revés" (el cliente nos escribe)
 * está en pedido-seguro.ts.
 */
import { db, messages, conversations } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";
import { dbNow } from "../date-utils";
import { codigoEnMensaje, HORAS_PARA_VERIFICAR } from "./pedido-seguro";

const pesos = (n: unknown) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

type PedidoParaRespuesta = { id: number; nombre?: string | null; productName?: string | null; quantity: number; total?: string | number | null; metodoPago?: string | null };

/** Respuesta al cliente. Formato WhatsApp de CLAUDE.md: bloques cortos, sin ficha. */
export function respuestaDeVerificado(pedidos: PedidoParaRespuesta[]): string {
  const [p] = pedidos;
  if (!p) return "";
  const nombre = String(p.nombre || "").trim().split(/\s+/)[0];
  const pago = p.metodoPago === "transferencia" ? "Te compartimos por aquí cómo pagar." : "Pagas cuando lo recibes.";
  const total = pedidos.reduce((a, x) => a + (Number(x.total) || 0), 0);
  const items = pedidos.map((x) => `${x.productName || "Tu producto"}${x.quantity > 1 ? ` × ${x.quantity}` : ""}`).join(" + ");
  return [
    `${nombre ? `Listo, ${nombre}.` : "Listo."} Tu pedido #${p.id} quedó confirmado ✅`,
    `${items} por ${pesos(total)}. ${pago}`,
    "Si necesitamos algo más para el envío, te escribimos por este chat.",
  ].join("\n\n");
}

export async function atenderCodigoDeVerificacion(p: {
  tenantId: number;
  conversationId: number;
  phone: string;
  pushName?: string;
  remoteJid?: string;
  body: string;
  stage?: string | null;
}): Promise<boolean> {
  const codigo = codigoEnMensaje(p.body);
  if (!codigo) return false;
  try {
    const ds = await import("../dropshipping");
    const pendientes = await ds.pedidosPorVerificar(p.tenantId, codigo, HORAS_PARA_VERIFICAR);
    const verificados: Awaited<ReturnType<typeof ds.marcarVerificado>>[] = [];
    for (const x of pendientes) verificados.push(await ds.marcarVerificado(x.id, p.conversationId, p.phone));
    const pedidos = verificados.filter((x): x is NonNullable<typeof x> => !!x);
    if (!pedidos.length) return false;

    const texto = respuestaDeVerificado(pedidos);
    try {
      const { enviarPartsAlCliente } = await import("../transporte-whatsapp");
      await enviarPartsAlCliente(p.tenantId, p.phone, p.pushName || "", [{ kind: "text", content: texto }], p.remoteJid);
      await db.insert(messages).values({
        conversationId: p.conversationId,
        role: "agent",
        content: texto,
        stage: p.stage || "greeting",
        metadata: { origen: "verificacion-landing", pedidos: pedidos.map((x) => x.id) } as any,
      });
      await db.update(conversations).set({ lastMessage: texto.slice(0, 200), lastMessageAt: dbNow() }).where(eq(conversations.id, p.conversationId));
    } catch (e: any) {
      // Los pedidos ya están verificados: no contestar no los deshace.
      logger.warn({ err: e?.message, codigo }, "[Verificacion] No se pudo responder al cliente");
    }

    const lineas: string[] = [`✅ *Pedido verificado por WhatsApp* (${pedidos.map((x) => `#${x.id}`).join(", ")})`, `👤 ${pedidos[0]!.nombre || ""} · 📱 ${p.phone}`];
    for (const pedido of pedidos) {
      const r = await ds.despacharPedido(pedido);
      lineas.push(`📦 ${pedido.productName} × ${pedido.quantity} · ${pesos(pedido.total)} — ${r.ok
        ? `registrado${r.wooOrderId ? ` en WooCommerce #${r.wooOrderId}` : ""}${r.dropi?.estado === "sincronizada" ? ` y en Dropi #${r.dropi.dropiOrderId || "?"}` : ""}`
        : `⚠️ no se pudo registrar: ${r.error}`}`);
    }
    try {
      const { avisarAlDueno } = await import("../avisos");
      await avisarAlDueno(p.tenantId, lineas.join("\n"));
    } catch (e: any) {
      logger.warn({ err: e?.message }, "[Verificacion] No se pudo avisar al dueño");
    }
    return true;
  } catch (e: any) {
    // Ante cualquier fallo, el mensaje sigue al vendedor: nunca se pierde.
    logger.warn({ err: e?.message, tenantId: p.tenantId }, "[Verificacion] Falló la verificación; el mensaje sigue al vendedor");
    return false;
  }
}
