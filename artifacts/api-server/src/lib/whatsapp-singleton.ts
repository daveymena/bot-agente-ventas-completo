// ────────────────────────────────────────────────────────────────────────────
// whatsapp-singleton.ts — Proxy de compatibilidad
//
// Este archivo reemplaza al singleton global `whatsapp` (definido originalmente
// en lib/whatsapp.ts) por un objeto proxy que enruta todas las llamadas al
// manager del tenant correspondiente.
//
// Razón: varios archivos del proyecto (conversations, dashboard, facebook,
// public, webhooks) aún hacen `import { whatsapp } from "../lib/whatsapp"` y
// llaman `whatsapp.sendText(...)`, `whatsapp.isConnected()`, etc.
//
// Con este proxy, el código existente sigue funcionando SIN cambios, pero cada
// llamada se redirige a la instancia multi-tenant correcta.
// ────────────────────────────────────────────────────────────────────────────

import { getWhatsAppForTenant } from "./whatsapp-factory";
import { tenantManager } from "./tenantManager";

function getCurrentTenantId(): number {
  return tenantManager.getDefaultTenant().id;
}

export const whatsapp = {
  // Estado
  getStatus() {
    return getWhatsAppForTenant(getCurrentTenantId()).getStatus();
  },
  isConnected() {
    return getWhatsAppForTenant(getCurrentTenantId()).isConnected();
  },

  // Conexión
  start() {
    return getWhatsAppForTenant(getCurrentTenantId()).start();
  },
  stop(keepAuth: boolean = true) {
    return getWhatsAppForTenant(getCurrentTenantId()).stop(keepAuth);
  },
  requestPairingCode(phoneNumber: string) {
    return getWhatsAppForTenant(getCurrentTenantId()).requestPairingCode(phoneNumber);
  },

  // Envío de mensajes (compatibilidad)
  async sendText(phone: string, text: string, opts?: any) {
    const mgr = getWhatsAppForTenant(getCurrentTenantId());
    const sock = (mgr as any).sock;
    if (!sock) {
      throw new Error("WhatsApp no está conectado. Conéctalo primero con el QR.");
    }
    return await sock.sendMessage(`${phone}@s.whatsapp.net`, { text }, opts);
  },

  async sendImage(phone: string, buffer: Buffer, caption?: string, opts?: any) {
    const mgr = getWhatsAppForTenant(getCurrentTenantId());
    const sock = (mgr as any).sock;
    if (!sock) {
      throw new Error("WhatsApp no está conectado. Conéctalo primero con el QR.");
    }
    return await sock.sendMessage(`${phone}@s.whatsapp.net`, {
      image: buffer,
      caption: caption || "",
    }, opts);
  },

  async sendDocument(phone: string, buffer: Buffer, filename: string, opts?: any) {
    const mgr = getWhatsAppForTenant(getCurrentTenantId());
    const sock = (mgr as any).sock;
    if (!sock) {
      throw new Error("WhatsApp no está conectado. Conéctalo primero con el QR.");
    }
    return await sock.sendMessage(`${phone}@s.whatsapp.net`, {
      document: buffer,
      fileName: filename,
    }, opts);
  },

  // Utilidades
  getSocket() {
    return (getWhatsAppForTenant(getCurrentTenantId()) as any).sock;
  },
  getPhoneNumber() {
    return getWhatsAppForTenant(getCurrentTenantId()).getStatus().phoneNumber;
  },
};

export type AgentReplyPart = {
  kind: "text" | "card";
  content?: string;
  productId?: number;
  paymentOnly?: boolean;
};

export default whatsapp;
