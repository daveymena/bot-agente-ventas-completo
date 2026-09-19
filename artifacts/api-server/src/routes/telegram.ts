/** /api/telegram — configurar el canal de avisos por Telegram. Ver lib/telegram.ts. */
import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();
const tenantDe = (req: any): number | null => Number(req.tenant?.id) || null;

router.get("/config", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const { configTelegramDelTenant, probarBotTelegram } = await import("../lib/telegram");
    const cfg = await configTelegramDelTenant(tenantId);
    if (!cfg) return res.json({ conectado: false });
    const bot = await probarBotTelegram(cfg.botToken).catch(() => ({ ok: false } as any));
    const { atlasEscuchaEnTelegram } = await import("../lib/telegram-atlas");
    res.json({ conectado: true, bot: bot.ok ? bot.nombre : null, chatId: cfg.chatId, atlasEscucha: atlasEscuchaEnTelegram(tenantId) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** Chats que le escribieron al bot (para elegir el chat id). */
router.post("/descubrir", async (req: any, res: any) => {
  try {
    if (!tenantDe(req)) return res.status(401).json({ error: "No autenticado" });
    const { probarBotTelegram, chatsRecientes } = await import("../lib/telegram");
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ error: "Falta el token del bot" });
    const bot = await probarBotTelegram(token);
    if (!bot.ok) return res.status(400).json({ error: `Telegram no reconoce ese token: ${bot.error}` });
    res.json({ ok: true, bot: bot.nombre, chats: await chatsRecientes(token) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/config", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const { probarBotTelegram, enviarTelegram, guardarConfigTelegram } = await import("../lib/telegram");
    const token = String(req.body?.token || "").trim();
    const chatId = String(req.body?.chatId || "").trim();
    if (!token || !chatId) return res.status(400).json({ error: "Faltan el token del bot y el chat id" });
    const bot = await probarBotTelegram(token);
    if (!bot.ok) return res.status(400).json({ error: `Telegram no reconoce ese token: ${bot.error}` });
    const envio = await enviarTelegram({ botToken: token, chatId }, "✅ VentasPro conectado: por acá te van a llegar pedidos, lanzamientos, auditorías e informes.");
    if (!envio.ok) return res.status(400).json({ error: `El bot ${bot.nombre} no pudo escribir a ese chat: ${envio.error}. Escribile "hola" al bot primero.` });
    await guardarConfigTelegram(tenantId, token, chatId);
    logger.info({ tenantId, bot: bot.nombre }, "[Telegram] canal de avisos conectado");
    const { iniciarAtlasEnTelegram } = await import("../lib/telegram-atlas");
    await iniciarAtlasEnTelegram(tenantId);
    res.json({ ok: true, detalle: `Conectado con ${bot.nombre}. Te mandé un mensaje de prueba. Escribile al bot y Atlas te contesta.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/probar", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const { avisarAlDueno } = await import("../lib/avisos");
    const r = await avisarAlDueno(tenantId, "🔔 Prueba de avisos de VentasPro: si leés esto, el canal funciona.");
    res.json({ ok: r.telegram || r.whatsapp, detalle: `WhatsApp: ${r.whatsapp ? "enviado" : "no"} · Telegram: ${r.telegram ? "enviado" : "no"}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/config", async (req: any, res: any) => {
  try {
    const tenantId = tenantDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const { detenerAtlasEnTelegram } = await import("../lib/telegram-atlas");
    detenerAtlasEnTelegram(tenantId);
    const { guardarClaveDeTenant } = await import("../lib/ai-keys-tenant");
    await guardarClaveDeTenant(tenantId, "telegram", { apiKey: "" });
    // `model` (chat id) se borra al quedar la clave vacía: guardarClaveDeTenant elimina el proveedor sin apiKey y sin model… lo forzamos:
    const { db, tenants } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [fila] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const keys = { ...(((fila as any)?.apiKeys) || {}) } as Record<string, any>;
    delete keys.telegram;
    await db.update(tenants).set({ apiKeys: keys as any }).where(eq(tenants.id, tenantId));
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
