import crypto from "crypto";
import type { Request } from "express";
import { logger } from "./logger";

/**
 * Verificación de firma de webhooks de pago.
 *
 * Sin esto, cualquiera puede POSTear un webhook falso y activar una
 * suscripción sin pagar (crítico en PayPal, que confía en el cuerpo del
 * evento tal cual). Ver AUDIT_REPORT.md §1.3.
 *
 * Diseño "opt-in enforcement": si el secreto/config del proveedor NO está
 * puesto, se AVISA fuerte y se deja pasar (skipped) — así activar la
 * verificación no tumba webhooks en una producción que aún no configuró el
 * secreto. En cuanto se configura, se EXIGE de verdad (invalid => rechazo).
 */

export type WebhookVerifyResult =
  | { ok: true; skipped: boolean }
  | { ok: false; skipped: false; reason: string };

function timingSafeEqualHex(a: string, b: string): boolean {
  // timingSafeEqual exige buffers del mismo largo; si difieren, no es válido.
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * MercadoPago: cabecera `x-signature: ts=<ts>,v1=<hmac>` + `x-request-id`.
 * Manifest oficial: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * HMAC-SHA256(manifest, MERCADO_PAGO_WEBHOOK_SECRET) === v1
 */
export function verifyMercadoPagoSignature(req: Request): WebhookVerifyResult {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn(
      "[Webhook][MercadoPago] MERCADO_PAGO_WEBHOOK_SECRET no configurado — " +
        "la firma NO se está verificando. Configúralo para bloquear webhooks falsos.",
    );
    return { ok: true, skipped: true };
  }

  const xSignature = req.get("x-signature");
  const xRequestId = req.get("x-request-id");
  if (!xSignature) {
    return { ok: false, skipped: false, reason: "missing x-signature header" };
  }

  // Parsear "ts=...,v1=..."
  let ts = "";
  let v1 = "";
  for (const part of xSignature.split(",")) {
    const [k, v] = part.split("=").map((s) => s?.trim());
    if (k === "ts") ts = v ?? "";
    else if (k === "v1") v1 = v ?? "";
  }
  if (!ts || !v1) {
    return { ok: false, skipped: false, reason: "malformed x-signature header" };
  }

  // data.id viene en el query (?data.id=) o en el body. MP lo pasa a
  // minúsculas cuando es alfanumérico; los ids numéricos quedan igual.
  const rawId =
    (req.query["data.id"] as string | undefined) ??
    (req.body?.data?.id != null ? String(req.body.data.id) : undefined);
  const dataId = rawId && /[a-zA-Z]/.test(rawId) ? rawId.toLowerCase() : rawId;

  const manifestParts: string[] = [];
  if (dataId) manifestParts.push(`id:${dataId};`);
  if (xRequestId) manifestParts.push(`request-id:${xRequestId};`);
  manifestParts.push(`ts:${ts};`);
  const manifest = manifestParts.join("");

  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  if (!timingSafeEqualHex(expected, v1)) {
    return { ok: false, skipped: false, reason: "signature mismatch" };
  }
  return { ok: true, skipped: false };
}

const PAYPAL_API_BASE = process.env.PAYPAL_API_BASE || "https://api-m.paypal.com";

async function getPayPalAccessToken(): Promise<string | null> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const resp = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch (err) {
    logger.error({ err }, "[Webhook][PayPal] Error obteniendo token para verificar firma");
    return null;
  }
}

/**
 * PayPal: se verifica llamando a la API oficial
 * /v1/notifications/verify-webhook-signature con los headers de transmisión
 * y el PAYPAL_WEBHOOK_ID. Requiere las credenciales de cliente ya usadas para
 * capturar pagos.
 */
export async function verifyPayPalWebhook(req: Request): Promise<WebhookVerifyResult> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    logger.warn(
      "[Webhook][PayPal] PAYPAL_WEBHOOK_ID no configurado — la firma NO se está " +
        "verificando. Un webhook falso puede activar una suscripción sin pago. " +
        "Configúralo para bloquearlo.",
    );
    return { ok: true, skipped: true };
  }

  const transmissionId = req.get("paypal-transmission-id");
  const transmissionTime = req.get("paypal-transmission-time");
  const transmissionSig = req.get("paypal-transmission-sig");
  const certUrl = req.get("paypal-cert-url");
  const authAlgo = req.get("paypal-auth-algo");
  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
    return { ok: false, skipped: false, reason: "missing paypal transmission headers" };
  }

  const token = await getPayPalAccessToken();
  if (!token) {
    // No podemos verificar sin token. Fallar cerrado: con webhookId puesto la
    // intención es exigir verificación.
    return { ok: false, skipped: false, reason: "could not obtain PayPal token to verify" };
  }

  try {
    const resp = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: req.body,
      }),
    });
    if (!resp.ok) {
      return { ok: false, skipped: false, reason: `verify API HTTP ${resp.status}` };
    }
    const json = (await resp.json()) as { verification_status?: string };
    if (json.verification_status !== "SUCCESS") {
      return { ok: false, skipped: false, reason: `verification_status=${json.verification_status}` };
    }
    return { ok: true, skipped: false };
  } catch (err) {
    logger.error({ err }, "[Webhook][PayPal] Error verificando firma");
    return { ok: false, skipped: false, reason: "verify request failed" };
  }
}
