/**
 * Dispatcher de transporte de WhatsApp: elige entre Baileys (default) y
 * Cloud API (segunda opción) para ENVIAR y para saber si está "conectado".
 *
 * El orquestador ya no debería hablar con Baileys directamente: usa estas
 * funciones. Mientras WHATSAPP_CLOUD_ENABLED esté apagado, el comportamiento
 * es idéntico al de siempre (Baileys).
 */
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
  if (transporteEnUso(tenantId) === "cloud") return cloudApiHabilitada();
  return peekWhatsAppForTenant(tenantId)?.isConnected() ?? false;
}

/**
 * Ms que faltan para que el número del tenant pueda escribirle a `jid`; deja
 * el turno apartado. Cloud API no lleva el espaciado de Baileys.
 */
export function reservarTurnoDeEnvio(tenantId: number, jid: string): number {
  if (transporteEnUso(tenantId) === "cloud") return 0;
  return peekWhatsAppForTenant(tenantId)?.reservarTurnoDeEnvio(jid) ?? 0;
}

/** Envía las partes del agente por el transporte correcto del tenant. */
export async function enviarPartsAlCliente(
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
