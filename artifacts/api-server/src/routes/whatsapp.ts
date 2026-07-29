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

router.post("/pair-phone", async (req, res, next) => {
  try {
    const raw = req.body?.phoneNumber || "";
    const phoneNumber = String(raw).replace(/[^\d]/g, "");
    if (!phoneNumber) return res.status(400).json({ error: "phoneNumber requerido (ej: 573001234567, solo dígitos con código de país)" });

    // El socket de Baileys debe existir antes de pedir el código. Si todavía
    // no se inició (usuario entra directo a pedir PIN sin haber tocado
    // "Generar QR"), lo arrancamos aquí mismo en vez de fallar.
    let status = whatsapp.getStatus();
    if (status.state === "disconnected" || status.state === "error") {
      await whatsapp.start();
      // Baileys necesita un instante para levantar el socket antes de poder
      // pedir el pairing code.
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if ((whatsapp as any).sock) break;
      }
    }

    const pairingCode = await whatsapp.requestPairingCode(phoneNumber);
    return res.json({ ok: true, pairingCode, message: `Código: ${pairingCode} — Ingresa en WhatsApp > Dispositivos vinculados > Vincular con número de teléfono` });
  } catch (e) {
    return next(e);
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

// Diagnóstico de red: para saber si el contenedor puede llegar a los
// servidores de WhatsApp cuando el QR nunca aparece. Distingue bloqueo de
// IP/firewall de un problema de DNS o de la librería.
router.get("/network-check", async (_req, res) => {
  const dns = await import("node:dns/promises");
  const net = await import("node:net");
  const tls = await import("node:tls");
  const results: Record<string, any> = {};

  try {
    const addrs = await dns.resolve4("web.whatsapp.com");
    results.dns = { ok: true, addrs };
  } catch (e: any) {
    results.dns = { ok: false, error: e.message };
  }

  const tcpCheck = (host: string, port: number) =>
    new Promise<{ ok: boolean; error?: string; ms?: number }>((resolve) => {
      const start = Date.now();
      const socket = net.connect({ host, port, timeout: 6000 });
      socket.once("connect", () => {
        socket.destroy();
        resolve({ ok: true, ms: Date.now() - start });
      });
      socket.once("timeout", () => {
        socket.destroy();
        resolve({ ok: false, error: "timeout" });
      });
      socket.once("error", (e: any) => resolve({ ok: false, error: e.message }));
    });

  results.tcp443_web_whatsapp = await tcpCheck("web.whatsapp.com", 443);

  const tlsCheck = (host: string, port: number) =>
    new Promise<{ ok: boolean; error?: string; ms?: number }>((resolve) => {
      const start = Date.now();
      const socket = tls.connect({ host, port, timeout: 6000, servername: host }, () => {
        socket.destroy();
        resolve({ ok: true, ms: Date.now() - start });
      });
      socket.once("timeout", () => {
        socket.destroy();
        resolve({ ok: false, error: "timeout" });
      });
      socket.once("error", (e: any) => resolve({ ok: false, error: e.message }));
    });

  results.tls443_web_whatsapp = await tlsCheck("web.whatsapp.com", 443);

  // Referencia: un host que sabemos accesible, para descartar que sea un
  // bloqueo general de salida en vez de algo específico de WhatsApp.
  results.tls443_google_reference = await tlsCheck("www.google.com", 443);

  const diagnosis = !results.dns.ok
    ? "DNS no resuelve web.whatsapp.com — revisar resolver del contenedor."
    : !results.tls443_google_reference.ok
    ? "Bloqueo general de salida HTTPS del contenedor/host — no es específico de WhatsApp."
    : !results.tcp443_web_whatsapp.ok || !results.tls443_web_whatsapp.ok
    ? "La IP del servidor está bloqueada específicamente por WhatsApp (firewall o baneo de datacenter). Requiere IP residencial/proxy o esperar desbaneo."
    : "Conectividad de red OK — si el QR sigue sin aparecer, el problema está en el protocolo de Baileys, no en la red.";

  res.json({ ...results, diagnosis });
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
