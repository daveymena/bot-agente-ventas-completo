import { Router, type IRouter } from "express";
import { GetWhatsAppStatusResponse } from "@workspace/api-zod";
import { whatsapp } from "../lib/whatsapp";
import { runAgentReply } from "../lib/agent";
import { db, conversations, messages } from "@workspace/db";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";

const router: IRouter = Router();

router.get("/status", (_req, res) => {
  const status = whatsapp.getStatus();
  if (!status) {
    return res.json({ state: "disconnected", qrCode: null, phone: null, connectedAt: null });
  }
  return res.json(GetWhatsAppStatusResponse.parse(status));
});

router.post("/connect", async (_req, res, next) => {
  try {
    const status = await whatsapp.start();
    return res.json(GetWhatsAppStatusResponse.parse(status));
  } catch (e) {
    return next(e);
  }
});

router.post("/disconnect", async (_req, res, next) => {
  try {
    await whatsapp.stop();
    const status = whatsapp.getStatus();
    return res.json({ ok: true, message: "WhatsApp desconectado", ...GetWhatsAppStatusResponse.parse(status) });
  } catch (e) {
    return next(e);
  }
});

// Test IA - crear conversación y obtener respuesta
router.post("/test-ia", async (req, res, next) => {
  try {
    const msg = req.body?.message || "Hola, qué productos tienen?";
    const tenantId = 1; // Tenant por defecto para testing
    const { addTenantToInsert } = await import("../lib/tenantManager");

    // Crear conversación test
    const [convo] = await db.insert(conversations).values(addTenantToInsert({
      contactName: "Test",
      contactPhone: req.body.phone || "test-ia",
      status: "ai",
      currentStage: "greeting"
    }, tenantId)).returning();
    
    // Guardar mensaje
    await db.insert(messages).values({
      conversationId: convo.id,
      role: "customer",
      content: msg
    });
    
    // Obtener respuesta
    const reply = await runAgentReply(convo.id);
    
    res.json({
      ok: true,
      message: msg,
      stage: reply?.stage,
      response: reply?.content?.substring(0, 500),
      parts: reply?.parts?.map(p => p.kind === "card" ? { card: p.productId } : { text: (p as any).content?.substring(0, 100) })
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Session Management ─────────────────────────────────────────────────────────
// Clears the saved Baileys auth files so the next /connect triggers a fresh QR.
// Designed for multi-tenant: in the future each tenant will have its own authDir.
router.post("/reset-session", async (_req, res, next) => {
  try {
    // stop(false) desconecta Y borra la carpeta de auth dentro del volumen
    await whatsapp.stop(false);
    // Inmediatamente iniciar conexión fresca → nuevo QR
    await whatsapp.start();
    const status = whatsapp.getStatus();
    return res.json({ ok: true, message: "Sesión reiniciada — escanea el nuevo QR", ...GetWhatsAppStatusResponse.parse(status) });
  } catch (e) {
    return next(e);
  }
});

// Returns session health: whether auth files exist and current state
router.get("/session-info", (_req, res) => {
  const authDir = process.env.WA_AUTH_DIR
    ? path.resolve(process.env.WA_AUTH_DIR)
    : path.resolve(process.cwd(), "data", ".baileys-auth");
  const hasFiles = existsSync(authDir);
  const status = whatsapp.getStatus();
  return res.json({
    state: status.state,
    authFilesExist: hasFiles,
    authDir,
    ...GetWhatsAppStatusResponse.parse(status),
  });
});

export default router;
