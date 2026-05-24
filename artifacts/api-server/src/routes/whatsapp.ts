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
    const status = await whatsapp.stop();
    return res.json(GetWhatsAppStatusResponse.parse(status));
  } catch (e) {
    return next(e);
  }
});

// Test IA - crear conversación y obtener respuesta
router.post("/test-ia", async (req, res, next) => {
  try {
    const msg = req.body?.message || "Hola, qué productos tienen?";
    const tenantId = 1; // Tenant por defecto para testing
    
    // Crear conversación test
    const [convo] = await db.insert(conversations).values({
      tenantId,
      contactName: "Test",
      contactPhone: "test-ia",
      status: "ai",
      currentStage: "greeting"
    }).returning();
    
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
    // 1. Disconnect cleanly if connected
    await whatsapp.stop();

    // 2. Delete the auth folder — always relative to cwd
    const authDir = path.resolve(process.cwd(), ".baileys-auth");
    if (existsSync(authDir)) {
      rmSync(authDir, { recursive: true, force: true });
    }

    // 3. Immediately start a fresh connection → will produce a new QR
    await whatsapp.start();
    const status = whatsapp.getStatus();
    return res.json({ ok: true, message: "Sesión reiniciada — escanea el nuevo QR", ...GetWhatsAppStatusResponse.parse(status) });
  } catch (e) {
    return next(e);
  }
});

// Returns session health: whether auth files exist and current state
router.get("/session-info", (_req, res) => {
  const authDir = path.resolve(process.cwd(), ".baileys-auth");
  const hasFiles = existsSync(authDir);
  const status = whatsapp.getStatus();
  return res.json({
    authFilesExist: hasFiles,
    authDir,
    ...GetWhatsAppStatusResponse.parse(status),
  });
});

export default router;
