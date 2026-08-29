/**
 * Conversions API de Meta -- reporta el evento "Purchase" desde el SERVIDOR,
 * no desde el navegador. Es el hueco real que faltaba: el píxel del cliente
 * (packages/tienda/src/lib/pixel.ts) ya manda ViewContent/AddToCart/
 * InitiateCheckout, pero el evento de compra confirmada -- el único que
 * realmente le sirve a Meta para optimizar hacia gente que COMPRA, no solo
 * que hace clic -- nunca se mandaba desde ningún lado. Sin esto, aunque el
 * pixel esté conectado, Meta no tiene ninguna señal real de conversión para
 * aprender, sin importar qué tan bien segmentada esté la campaña.
 *
 * La compra acá se confirma DENTRO de una conversación de WhatsApp (no en
 * el checkout del navegador), así que se manda directo por este canal
 * server-to-server en vez de depender de fbq() del lado del cliente.
 */
import crypto from "crypto";
import { logger } from "./logger";
import { FB_GRAPH_BASE } from "./meta-api-version";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export interface PurchaseEventInput {
  pixelId: string;
  accessToken: string;
  value: number;
  currency: string;
  contentIds: (string | number)[];
  customerEmail?: string | null;
  customerPhone?: string | null;
}

/**
 * Manda el evento Purchase a Meta. Nunca lanza -- un fallo acá no debe
 * romper el flujo real de venta (notificación a la empresa, marcar la
 * conversación como pagada), solo se pierde la señal de analítica.
 */
export async function sendPurchaseEvent(input: PurchaseEventInput): Promise<boolean> {
  if (!input.pixelId || !input.accessToken) {
    logger.debug("[MetaCAPI] Sin pixelId o accessToken -- tenant sin Facebook conectado, se omite");
    return false;
  }
  try {
    const userData: Record<string, string[]> = {};
    const email = (input.customerEmail || "").trim();
    if (email && email !== "sin_email" && email.includes("@")) {
      userData.em = [sha256(email)];
    }
    // Meta pide el teléfono en dígitos solamente (sin +, espacios ni guiones)
    // antes de hashearlo -- se limpia acá, no se manda el número crudo nunca.
    const digits = (input.customerPhone || "").replace(/\D/g, "");
    if (digits && input.customerPhone !== "sin_telefono" && input.customerPhone !== "desconocido") {
      userData.ph = [sha256(digits)];
    }
    if (Object.keys(userData).length === 0) {
      logger.warn({ pixelId: input.pixelId }, "[MetaCAPI] Compra sin email ni teléfono del cliente -- Meta no va a poder emparejar este evento con nadie, se manda igual pero sin valor real");
    }

    const res = await fetch(`${FB_GRAPH_BASE}/${input.pixelId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: input.accessToken,
        data: [
          {
            event_name: "Purchase",
            event_time: Math.floor(Date.now() / 1000),
            // La compra se confirma dentro de la conversación de WhatsApp,
            // no en un navegador -- "chat" es el action_source correcto de
            // los que define Meta para este canal.
            action_source: "chat",
            user_data: userData,
            custom_data: {
              currency: input.currency || "COP",
              value: input.value,
              content_ids: input.contentIds.map(String),
              content_type: "product",
            },
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data: any = await res.json();
    if (!res.ok || data.error) {
      logger.warn({ err: data.error, pixelId: input.pixelId }, "[MetaCAPI] Meta rechazó el evento de compra");
      return false;
    }
    logger.info({ pixelId: input.pixelId, eventsReceived: data.events_received }, "[MetaCAPI] Evento de compra confirmado enviado a Meta");
    return true;
  } catch (err) {
    logger.warn({ err, pixelId: input.pixelId }, "[MetaCAPI] Error de red enviando el evento de compra");
    return false;
  }
}
