import { Router, type IRouter } from "express";
import { GetWhatsAppStatusResponse } from "@workspace/api-zod";
import { getWhatsAppForTenant, listWhatsAppInstances, disposeWhatsAppForTenant } from "../lib/whatsapp-factory";
import { getMetricsForAll, healthSummary, cleanupInactiveInstances } from "../lib/whatsapp-monitor";
import { requireAdmin, tenantManager } from "../lib/tenantManager";
import { runAgentReply } from "../lib/agent";
import { db, conversations, messages } from "@workspace/db";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const router: IRouter = Router();

// Helper: extrae tenantId del request o usa el default (1)
function tenantIdFromReq(req: any): number {
  return req.tenant?.id ?? req.user?.tenantId ?? 1;
}

router.get("/status", (req, res) => {
  const tid = tenantIdFromReq(req);
  const mgr = getWhatsAppForTenant(tid, (req as any).tenant);
  const status = mgr.getStatus();
  return res.json(GetWhatsAppStatusResponse.parse(status));
});

router.post("/connect", async (req, res, next) => {
  try {
    const tid = tenantIdFromReq(req);
    const mgr = getWhatsAppForTenant(tid, (req as any).tenant);
    // Usar pairing-code por defecto (más confiable que QR en redes restringidas)
    await mgr.startWithPairing();
    const status = mgr.getStatus();
    return res.json(GetWhatsAppStatusResponse.parse(status));
  } catch (e) {
    return next(e);
  }
});

router.post("/disconnect", async (req, res, next) => {
  try {
    const tid = tenantIdFromReq(req);
    const mgr = getWhatsAppForTenant(tid, (req as any).tenant);
    await mgr.stop();
    const status = mgr.getStatus();
    return res.json({ ok: true, message: "WhatsApp desconectado", ...GetWhatsAppStatusResponse.parse(status) });
  } catch (e) {
    return next(e);
  }
});

// Test IA - crear conversación y obtener respuesta (no afectado por multi-tenant)
router.post("/test-ia", async (req, res, next) => {
  try {
    const msg = req.body?.message || "Hola, qué productos tienen?";
    const tenantId = tenantIdFromReq(req);
    const { addTenantToInsert } = await import("../lib/tenantManager");

    const [convo] = await db.insert(conversations).values(addTenantToInsert({
      contactName: "Test",
      contactPhone: req.body.phone || "test-ia",
      status: "ai",
      currentStage: "greeting"
    }, tenantId)).returning();

    await db.insert(messages).values({
      conversationId: convo.id,
      role: "customer",
      content: msg,
    });

    const reply = await runAgentReply(convo.id);

    res.json({
      ok: true,
      message: msg,
      stage: reply?.stage,
      response: reply?.content?.substring(0, 500),
      parts: reply?.parts?.map(p => p.kind === "card" ? { card: p.productId } : { text: (p as any).content?.substring(0, 100) }),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/pair-phone", async (req, res, next) => {
  try {
    const raw = req.body?.phoneNumber || "";
    const phoneNumber = String(raw).replace(/[^\d]/g, "");
    if (!phoneNumber) {
      return res.status(400).json({ error: "phoneNumber requerido (ej: 573001234567, solo dígitos con código de país)" });
    }

    const tid = tenantIdFromReq(req);
    const mgr = getWhatsAppForTenant(tid, (req as any).tenant);

    // Paramos la sesión actual SIN borrar auth (keepAuth=true) y arrancamos
    // un socket nuevo con usePairingCode:true. Sin esa flag, Baileys negocia
    // en modo QR y requestPairingCode() lanza "Connection Failure" del
    // noise-handler porque el protocolo ya fue iniciado en otro modo.
    await mgr.stop(true);
    await mgr.startWithPairing();

    // El retry y la espera de la conexión WebSocket ahora están manejados
    // internamente dentro de requestPairingCode() para mayor robustez.

    const pairingCode = await mgr.requestPairingCode(phoneNumber);
    return res.json({ ok: true, pairingCode, message: `Código: ${pairingCode} — Ingresa en WhatsApp > Dispositivos vinculados > Vincular con número de teléfono` });
  } catch (e) {
    return next(e);
  }
});

// ── Session Management ─────────────────────────────────────────────────────────
// Borra SOLO la carpeta de auth del tenant actual (no la global).
router.post("/reset-session", async (req, res, next) => {
  try {
    const tid = tenantIdFromReq(req);
    const mgr = getWhatsAppForTenant(tid, (req as any).tenant);
    await mgr.stop(false);
    await mgr.start();
    const status = mgr.getStatus();
    return res.json({ ok: true, message: "Sesión reiniciada — escanea el nuevo QR", ...GetWhatsAppStatusResponse.parse(status) });
  } catch (e) {
    return next(e);
  }
});

// Diagnóstico de red
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
      socket.once("connect", () => { socket.destroy(); resolve({ ok: true, ms: Date.now() - start }); });
      socket.once("timeout", () => { socket.destroy(); resolve({ ok: false, error: "timeout" }); });
      socket.once("error", (e: any) => resolve({ ok: false, error: e.message }));
    });

  results.tcp443_web_whatsapp = await tcpCheck("web.whatsapp.com", 443);

  const tlsCheck = (host: string, port: number) =>
    new Promise<{ ok: boolean; error?: string; ms?: number }>((resolve) => {
      const start = Date.now();
      const socket = tls.connect({ host, port, timeout: 6000, servername: host }, () => {
        socket.destroy(); resolve({ ok: true, ms: Date.now() - start });
      });
      socket.once("timeout", () => { socket.destroy(); resolve({ ok: false, error: "timeout" }); });
      socket.once("error", (e: any) => resolve({ ok: false, error: e.message }));
    });

  results.tls443_web_whatsapp = await tlsCheck("web.whatsapp.com", 443);
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

// Info de la sesión del tenant actual
router.get("/session-info", (req, res) => {
  const tid = tenantIdFromReq(req);
  const mgr = getWhatsAppForTenant(tid, (req as any).tenant);
  const dir = path.join(
    process.env.WA_AUTH_DIR
      ? path.resolve(process.env.WA_AUTH_DIR, "tenants")
      : path.resolve(process.cwd(), "data", "whatsapp-tenants"),
    `tenant-${tid}`
  );
  const hasFiles = existsSync(dir);
  const status = mgr.getStatus();
  return res.json({
    state: status.state,
    authFilesExist: hasFiles,
    authDir: dir,
    tenantId: tid,
    ...GetWhatsAppStatusResponse.parse(status),
  });
});

// Lista todos los tenants que tienen instancia activa -- expone datos de
// TODOS los tenants (no solo el propio), así que antes cualquier cuenta
// autenticada (el comentario decía "solo superadmin" pero no había ningún
// chequeo real) podía ver y controlar las sesiones de WhatsApp de otros
// negocios con solo llamar a la API directamente, sin pasar por la UI.
router.get("/instances", requireAdmin(), (_req, res) => {
  const list = listWhatsAppInstances();
  return res.json({ ok: true, instances: list });
});

// ── Endpoints de administración y monitoreo (solo admin de la plataforma) ──
// Útiles para diagnóstico en producción: muestran el estado de TODAS las
// sesiones multi-tenant y permiten limpiar instancias inactivas.

// GET /api/whatsapp/health — resumen agregado (recomendado para uptime checks)
router.get("/health", requireAdmin(), (_req, res) => {
  return res.json({ ok: true, ...healthSummary() });
});

// GET /api/whatsapp/metrics — métricas detalladas por tenant
router.get("/metrics", requireAdmin(), (_req, res) => {
  const metrics = getMetricsForAll();
  return res.json({ ok: true, count: metrics.length, metrics });
});

// POST /api/whatsapp/cleanup — detiene y elimina instancias inactivas/error
router.post("/cleanup", requireAdmin(), async (_req, res, next) => {
  try {
    const result = await cleanupInactiveInstances();
    return res.json({
      ok: true,
      message: `Limpieza completada: ${result.removed.length} eliminadas, ${result.kept.length} mantenidas`,
      removed: result.removed,
      kept: result.kept,
    });
  } catch (e) {
    return next(e);
  }
});

// POST /api/whatsapp/instances/:tenantId/dispose — cierra una instancia específica
router.post("/instances/:tenantId/dispose", requireAdmin(), async (req, res, next) => {
  try {
    const tid = Number(req.params.tenantId);
    if (!Number.isFinite(tid)) {
      return res.status(400).json({ error: "tenantId inválido" });
    }
    await disposeWhatsAppForTenant(tid);
    return res.json({ ok: true, message: `Instancia ${tid} eliminada` });
  } catch (e) {
    return next(e);
  }
});

// POST /api/whatsapp/instances/:tenantId/start — fuerza el inicio de una instancia
router.post("/instances/:tenantId/start", requireAdmin(), async (req, res, next) => {
  try {
    const tid = Number(req.params.tenantId);
    if (!Number.isFinite(tid)) {
      return res.status(400).json({ error: "tenantId inválido" });
    }
    // Este id viene de la URL, no de la sesión -- puede ser CUALQUIER tenant
    // (es la acción de admin para forzar el arranque de otro negocio), así
    // que se resuelve su TenantContext real en vez de asumir el del admin.
    const targetTenant = await tenantManager.getTenantById(tid);
    const mgr = getWhatsAppForTenant(tid, targetTenant ?? undefined);
    const status = await mgr.start();
    return res.json({ ok: true, tenantId: tid, status: GetWhatsAppStatusResponse.parse(status) });
  } catch (e) {
    return next(e);
  }
});

export default router;
