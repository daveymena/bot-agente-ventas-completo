import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { tenantManager } from "../lib/tenantManager";
import { enviarPartsLocal } from "../lib/transporte-whatsapp";
import { logger } from "../lib/logger";

const router = Router();

function tokenValido(header: unknown): boolean {
  const esperado = process.env.WHATSAPP_GATEWAY_TOKEN;
  const recibido = typeof header === "string" && header.startsWith("Bearer ")
    ? header.slice(7)
    : "";
  if (!esperado || !recibido) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recibido);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Private worker-to-gateway relay. Never logs message content or credentials. */
router.post("/send", async (req, res) => {
  const role = process.env.VENTASPRO_PROCESS_ROLE || "combined";
  if (role !== "combined" && role !== "gateway") {
    return res.status(404).json({ error: "not_found" });
  }
  if (!tokenValido(req.headers.authorization)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const body = req.body || {};
  const tenantId = Number(body.tenantId);
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0 ||
      typeof body.deliveryId !== "string" || body.deliveryId.length < 1 || body.deliveryId.length > 200 ||
      typeof body.phone !== "string" || body.phone.length > 80 ||
      typeof body.pushName !== "string" || body.pushName.length > 200 ||
      !Array.isArray(body.parts) || body.parts.length < 1 || body.parts.length > 30 ||
      (body.originalJid != null && (typeof body.originalJid !== "string" || body.originalJid.length > 200))) {
    return res.status(400).json({ error: "invalid_payload" });
  }

  try {
    const { pool } = await import("@workspace/db");
    if (!pool) return res.status(503).json({ error: "database_unavailable" });
    const tenant = await tenantManager.getTenantById(tenantId);
    if (!tenant) return res.status(404).json({ error: "tenant_not_found" });

    let claim = await pool.query(`INSERT INTO whatsapp_delivery_receipts
      (delivery_id, status, lease_until) VALUES ($1, 'sending', now() + interval '5 minutes')
      ON CONFLICT (delivery_id) DO NOTHING RETURNING delivery_id`, [body.deliveryId]);
    if (claim.rowCount !== 1) {
      claim = await pool.query(`UPDATE whatsapp_delivery_receipts
        SET status = 'sending', lease_until = now() + interval '5 minutes', updated_at = now()
        WHERE delivery_id = $1 AND status <> 'sent'
          AND (status = 'failed' OR lease_until IS NULL OR lease_until < now())
        RETURNING delivery_id`, [body.deliveryId]);
      if (claim.rowCount !== 1) {
        const { rows } = await pool.query(`SELECT status FROM whatsapp_delivery_receipts WHERE delivery_id = $1`, [body.deliveryId]);
        if (rows[0]?.status === "sent") return res.json({ ok: true, duplicate: true });
        return res.status(409).json({ error: "delivery_in_progress" });
      }
    }

    try {
      await enviarPartsLocal(tenantId, body.phone, body.pushName, body.parts, body.originalJid);
      await pool.query(`UPDATE whatsapp_delivery_receipts
        SET status = 'sent', lease_until = NULL, sent_at = now(), updated_at = now()
        WHERE delivery_id = $1`, [body.deliveryId]);
    } catch (error) {
      await pool.query(`UPDATE whatsapp_delivery_receipts
        SET status = 'failed', lease_until = NULL, updated_at = now()
        WHERE delivery_id = $1 AND status = 'sending'`, [body.deliveryId]).catch(() => {});
      throw error;
    }
    return res.json({ ok: true });
  } catch (error) {
    logger.error({ error, tenantId }, "[WhatsAppGateway] Falló el envío recibido del worker");
    return res.status(503).json({ error: "delivery_failed" });
  }
});

export default router;
