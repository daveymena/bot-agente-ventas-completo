/**
 * Dispatcher de transporte de WhatsApp: elige entre Baileys (default) y
 * Cloud API (segunda opción) para ENVIAR y para saber si está "conectado".
 *
 * El orquestador ya no debería hablar con Baileys directamente: usa estas
 * funciones. Mientras WHATSAPP_CLOUD_ENABLED esté apagado, el comportamiento
 * es idéntico al de siempre (Baileys).
 */
import { randomUUID } from "node:crypto";
import { getWhatsAppForTenant, peekWhatsAppForTenant } from "./whatsapp-factory";
import {
  cloudApiHabilitada,
  cloudApiTenantId,
  sendAgentPartsCloud,
} from "./whatsapp-cloud-api";
import { type AgentReplyPart } from "./whatsapp-singleton";

/** "cloud" si ese tenant va por Cloud API; si no, "baileys". */
export function transporteEnUso(tenantId: number): "cloud" | "baileys" {
  if (cloudApiHabilitada() && cloudApiTenantId() === tenantId) return "cloud";
  return "baileys";
}

/** ¿El transporte de ese tenant está listo para mandar mensajes? */
export function transporteConectado(tenantId: number): boolean {
  if (process.env.VENTASPRO_PROCESS_ROLE === "worker") {
    return !!(process.env.WHATSAPP_GATEWAY_URL && process.env.WHATSAPP_GATEWAY_TOKEN);
  }
  if (transporteEnUso(tenantId) === "cloud") return cloudApiHabilitada();
  return peekWhatsAppForTenant(tenantId)?.isConnected() ?? false;
}

/** Envía las partes del agente por el transporte correcto del tenant. */
export async function enviarPartsAlCliente(
  tenantId: number,
  phone: string,
  pushName: string,
  parts: AgentReplyPart[],
  originalJid?: string,
  deliveryId?: string,
): Promise<void> {
  if (process.env.VENTASPRO_PROCESS_ROLE === "worker") {
    const gateway = process.env.WHATSAPP_GATEWAY_URL?.replace(/\/+$/, "");
    const token = process.env.WHATSAPP_GATEWAY_TOKEN;
    if (!gateway || !token) throw new Error("El worker requiere WHATSAPP_GATEWAY_URL y WHATSAPP_GATEWAY_TOKEN.");
    const delivery = deliveryId || randomUUID();
    let response: Response;
    try {
      response = await fetch(`${gateway}/api/internal/whatsapp/send`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenantId, phone, pushName, parts, originalJid, deliveryId: delivery }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      throw new Error(`WHATSAPP_GATEWAY_RETRYABLE: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) {
      if ([408, 409, 429].includes(response.status) || response.status >= 500) {
        throw new Error(`WHATSAPP_GATEWAY_RETRYABLE: HTTP ${response.status}`);
      }
      throw new Error(`WhatsApp Gateway rechazó el envío (HTTP ${response.status}).`);
    }
    return;
  }

  await enviarPartsLocal(tenantId, phone, pushName, parts, originalJid);
}

/** Envío local usado por el propio gateway; nunca hace relay HTTP. */
export async function enviarPartsLocal(
  tenantId: number,
  phone: string,
  pushName: string,
  parts: AgentReplyPart[],
  originalJid?: string,
): Promise<void> {
  if (transporteEnUso(tenantId) === "cloud") {
    await sendAgentPartsCloud(phone, pushName, parts);
    return;
  }
  await getWhatsAppForTenant(tenantId).sendAgentParts(phone, pushName, parts, originalJid);
}
