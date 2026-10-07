import { Router } from "express";
import { sendError } from "../lib/error-handler";
import { ERROR_CODES } from "../lib/error-codes";
import type { TenantRequest } from "../lib/tenantManager";
import { guardarSuscripcion, quitarSuscripcion, enviarPushAlDueno, pushConfigurado } from "../lib/push";

const router = Router();

/** Clave pública VAPID para que el navegador se suscriba. */
router.get("/vapid-key", async (_req, res, next) => {
  try {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null, configurado: pushConfigurado() });
  } catch (e) { next(e); }
});

/** Guarda la suscripción del dispositivo actual (requiere sesión del dueño). */
router.post("/suscribir", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) { sendError(res, ERROR_CODES.UNAUTHORIZED); return; }
    const s = req.body?.suscripcion;
    if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth) {
      sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA, undefined, "Suscripción incompleta.");
      return;
    }
    await guardarSuscripcion(tenantId, s, String(req.body?.dispositivo || "").slice(0, 200));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** Apaga la suscripción de un endpoint. */
router.delete("/suscribir", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) { sendError(res, ERROR_CODES.UNAUTHORIZED); return; }
    const endpoint = String(req.body?.endpoint || "");
    if (!endpoint) { sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA, undefined, "Falta endpoint."); return; }
    await quitarSuscripcion(endpoint);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** Aviso de prueba al propio dispositivo. */
router.post("/probar", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) { sendError(res, ERROR_CODES.UNAUTHORIZED); return; }
    const r = await enviarPushAlDueno(tenantId, {
      titulo: "VentasPro ✅",
      cuerpo: "Notificaciones activadas. Te avisaremos de mensajes, pedidos y pagos.",
      url: "/conversations",
      tag: "prueba",
      accion: "Abrir panel",
    });
    if (r.enviadas === 0) {
      sendError(res, ERROR_CODES.NOT_FOUND, undefined, "No hay suscripciones activas.");
      return;
    }
    res.json({ ok: true, ...r });
  } catch (e) { next(e); }
});

export default router;
