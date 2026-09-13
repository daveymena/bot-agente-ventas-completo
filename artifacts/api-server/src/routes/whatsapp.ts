import { Router, type IRouter } from "express";
import { GetWhatsAppStatusResponse } from "@workspace/api-zod";
import { getWhatsAppForTenant, listWhatsAppInstances, disposeWhatsAppForTenant } from "../lib/whatsapp-factory";
import { getMetricsForAll, healthSummary, cleanupInactiveInstances } from "../lib/whatsapp-monitor";
import { requireAdmin, tenantManager, type TenantRequest } from "../lib/tenantManager";
import { runAgentReply } from "../lib/agent";
import { db, conversations, messages } from "@workspace/db";
import { and, eq, desc, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
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

    // Se REUSA la conversación de ese teléfono si ya existe, igual que hace
    // WhatsApp real. Antes hacía un insert incondicional: cada llamada creaba
    // una conversación nueva, así que el agente contestaba siempre sin
    // historia. Probando con esta ruta parecía que el bot "perdía el hilo"
    // (mostraba un producto y al mensaje siguiente ya no sabía cuál era),
    // cuando en realidad era la ruta la que le borraba la memoria en cada
    // mensaje. Una herramienta de diagnóstico que miente sobre el sistema es
    // peor que no tenerla.
    const telefono = req.body.phone || "test-ia";
    const { variantesDeTelefono } = await import("../lib/customer-profile");
    const [existente] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), inArray(conversations.contactPhone, variantesDeTelefono(telefono))))
      .orderBy(desc(conversations.id))
      .limit(1);

    const convo = existente ?? (await db.insert(conversations).values(addTenantToInsert({
      contactName: "Test",
      contactPhone: telefono,
      status: "ai",
      currentStage: "greeting"
    }, tenantId)).returning())[0];

    await db.insert(messages).values({
      conversationId: convo.id,
      role: "customer",
      content: msg,
    });

    // Se captura el razonamiento del servidor ([DECISION], [PARSER],
    // [SERVIDOR]...) mientras corre este turno: sin los logs del contenedor a
    // mano, era imposible saber POR QUÉ salió una ficha en vez del texto
    // (12-09-2026: cuatro turnos del chat real explicados solo por la base).
    const log: string[] = [];
    const logOriginal = console.log;
    const ETIQUETAS = /\[[A-Z][A-Z-]{1,14}\]/;
    console.log = (...a: any[]) => {
      try { const t = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "); if (ETIQUETAS.test(t) && log.length < 80) log.push(t.slice(0, 700)); } catch { /* nada */ }
      logOriginal(...a);
    };
    let reply: Awaited<ReturnType<typeof runAgentReply>>;
    try { reply = await runAgentReply(convo.id); } finally { console.log = logOriginal; }

    res.json({
      ok: true,
      message: msg,
      stage: reply?.stage,
      proveedor: (reply as any)?.aiProvider ?? null,
      response: reply?.content?.substring(0, 1500),
      parts: reply?.parts?.map(p => p.kind === "card" ? { card: p.productId, seccion: (p as any).seccion ?? null } : { text: (p as any).content?.substring(0, 600) }),
      log,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/whatsapp/evaluar-chat
 *
 * Reproduce un chat real (solo los turnos del CLIENTE) sobre una conversación
 * nueva y califica cada respuesta con reglas de hechos (lib/evaluador-de-chats).
 * Body: { turnos: string[], phone?: string, conversationId?: number }.
 * Con `conversationId` toma los turnos del cliente de esa conversación real.
 *
 * Existe porque los nueve fallos corregidos el 12/13-09-2026 solo se vieron
 * leyendo chats a mano. Esto los lee por nosotros, antes de cada deploy.
 */
router.post("/evaluar-chat", async (req, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    const { addTenantToInsert } = await import("../lib/tenantManager");
    const { evaluarChat } = await import("../lib/evaluador-de-chats");
    const { products } = await import("@workspace/db");

    let turnos: string[] = Array.isArray(req.body?.turnos) ? req.body.turnos.map((t: any) => String(t || "")).filter(Boolean) : [];
    const origen = Number(req.body?.conversationId);
    if (turnos.length === 0 && Number.isFinite(origen)) {
      const [c] = await db.select().from(conversations).where(and(eq(conversations.id, origen), eq(conversations.tenantId, tenantId))).limit(1);
      if (!c) return res.status(404).json({ error: "Conversación no encontrada" });
      const filas = await db.select().from(messages).where(eq(messages.conversationId, origen)).orderBy(messages.createdAt);
      turnos = filas.filter((m: any) => m.role === "customer").map((m: any) => String(m.content || "")).filter(Boolean).slice(0, 25);
    }
    if (turnos.length === 0) return res.status(400).json({ error: "turnos vacío" });

    // Un teléfono con pinta colombiana: "eval-123" no tiene país y el motor
    // trataba al cliente como extranjero ("como estás en Estados Unidos…").
    const telefono = String(req.body?.phone || `573009${String(Date.now()).slice(-6)}`);
    const [convo] = await db.insert(conversations).values(addTenantToInsert({
      contactName: "Evaluación", contactPhone: telefono, status: "ai", currentStage: "greeting",
    }, tenantId)).returning();

    const catalogo = await db.select({ id: products.id, name: products.name, price: products.price, kind: products.kind })
      .from(products).where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)));

    const evaluados: any[] = [];
    for (const mensaje of turnos) {
      await db.insert(messages).values({ conversationId: convo.id, role: "customer", content: mensaje });
      const log: string[] = [];
      const logOriginal = console.log;
      console.log = (...a: any[]) => {
        try { const t = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "); if (/\[[A-Z][A-Z-]{1,20}\]/.test(t) && log.length < 120) log.push(t.slice(0, 500)); } catch { /* nada */ }
        logOriginal(...a);
      };
      let reply: any = null;
      try { reply = await runAgentReply(convo.id); } catch (e: any) { log.push(`[ERROR] ${e?.message}`); } finally { console.log = logOriginal; }
      const partes: any[] = reply?.parts || [];
      const agente = log.find((l) => l.includes("[AGENT-INFO] Agente activo:"))?.split("Agente activo:")[1]?.split(" - ")[0]?.trim() || null;
      const nombraOtro = log.some((l) => l.includes("[DECISION] El mensaje nombra algo que NO es"));
      const idDelMensaje = (() => {
        const l = log.find((x) => /\[DECISION\] Producto identificado para la IA: .* \(ID (\d+)/.test(x));
        const m = l?.match(/\(ID (\d+)/); return m ? Number(m[1]) : null;
      })();
      evaluados.push({
        mensaje,
        texto: partes.filter((p) => p.kind === "text").map((p) => String(p.content || "")).join("\n\n"),
        tarjetas: partes.filter((p) => p.kind === "card").map((p) => ({ productId: p.productId, seccion: p.seccion ?? null })),
        agente,
        productoDelMensajeId: idDelMensaje,
        nombraOtroProducto: nombraOtro,
        crudo: log.find((l) => l.includes("[AI-CRUDO]"))?.replace(/^.*\[AI-CRUDO\] /, "") || null,
      });
    }
    const hallazgos = evaluarChat(evaluados, catalogo as any);
    return res.json({ ok: true, conversationId: convo.id, turnos: evaluados.length, hallazgos, limpio: hallazgos.length === 0, detalle: evaluados });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/whatsapp/sombra
 *
 * Corre los MISMOS turnos del cliente por el motor actual (runAgentReply, en
 * una conversación nueva) y por el motor nuevo (lib/motor-nuevo, en sombra,
 * estado en memoria) y devuelve las dos salidas lado a lado, con latencia y
 * con los hallazgos del evaluador para cada una. Nada de esto llega a ningún
 * cliente. Body: { turnos: string[] } o { conversationId } (toma los turnos
 * del cliente de esa conversación real).
 */
router.post("/sombra", async (req, res) => {
  try {
    const tenantId = tenantIdFromReq(req);
    const { addTenantToInsert } = await import("../lib/tenantManager");
    const { evaluarChat } = await import("../lib/evaluador-de-chats");
    const { responder } = await import("../lib/motor-nuevo/motor");
    const { clienteDeepSeek, cargarCatalogoDelNegocio, cargarVozDelNegocio, RepositorioEnMemoria } = await import("../lib/motor-nuevo/adaptador");
    const { estadoInicial } = await import("../lib/motor-nuevo/estado-conversacion");
    const { products } = await import("@workspace/db");

    let turnos: string[] = Array.isArray(req.body?.turnos) ? req.body.turnos.map((t: any) => String(t || "")).filter(Boolean) : [];
    const origen = Number(req.body?.conversationId);
    if (turnos.length === 0 && Number.isFinite(origen)) {
      const filas = await db.select().from(messages).where(eq(messages.conversationId, origen)).orderBy(messages.createdAt);
      turnos = filas.filter((m: any) => m.role === "customer").map((m: any) => String(m.content || "")).filter(Boolean).slice(0, 20);
    }
    if (turnos.length === 0) return res.status(400).json({ error: "turnos vacío" });

    // ── Motor actual: conversación nueva, como en evaluar-chat ──────────────
    const [convo] = await db.insert(conversations).values(addTenantToInsert({
      contactName: "Sombra", contactPhone: `573008${String(Date.now()).slice(-6)}`, status: "ai", currentStage: "greeting",
    }, tenantId)).returning();
    const catalogoEval = await db.select({ id: products.id, name: products.name, price: products.price, kind: products.kind })
      .from(products).where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)));

    // ── Motor nuevo: estado en memoria + su propio historial ────────────────
    const llm = clienteDeepSeek();
    const repo = new RepositorioEnMemoria();
    const catalogoNuevo = await cargarCatalogoDelNegocio(tenantId, "digital");
    const voz = await cargarVozDelNegocio(tenantId, { especialidad: "digital" });
    let estado = estadoInicial(convo.id);
    const historialNuevo: { role: "customer" | "agent"; content: string; createdAt: Date }[] = [];

    const actual: any[] = [];
    const nuevo: any[] = [];
    for (const mensaje of turnos) {
      // Actual
      await db.insert(messages).values({ conversationId: convo.id, role: "customer", content: mensaje });
      const t0 = Date.now();
      let reply: any = null;
      try { reply = await runAgentReply(convo.id); } catch (e: any) { reply = { parts: [{ kind: "text", content: `[ERROR] ${e?.message}` }] }; }
      const partesA: any[] = reply?.parts || [];
      actual.push({
        mensaje,
        ms: Date.now() - t0,
        texto: partesA.filter((p) => p.kind === "text").map((p) => String(p.content || "")).join("\n\n"),
        tarjetas: partesA.filter((p) => p.kind === "card").map((p) => ({ productId: p.productId, seccion: p.seccion ?? null })),
      });

      // Nuevo
      historialNuevo.push({ role: "customer", content: mensaje, createdAt: new Date() });
      const t1 = Date.now();
      let partesN: any[] = []; let traza: any[] = []; let error: string | null = null;
      try {
        // El historial va entero: el último mensaje es el del cliente que se contesta.
        const r = await responder({ llm, estado, historial: historialNuevo, catalogo: catalogoNuevo, voz });
        partesN = r.partes; traza = r.traza; estado = r.estado;
      } catch (e: any) { error = String(e?.message || e); }
      const textoN = partesN.filter((p) => p.kind === "text").map((p) => String(p.content || "")).join("\n\n");
      historialNuevo.push({ role: "agent", content: textoN || "[ficha/video/pago]", createdAt: new Date() });
      await repo.guardar(estado);
      nuevo.push({
        mensaje,
        ms: Date.now() - t1,
        texto: textoN,
        tarjetas: partesN.filter((p) => p.kind === "card").map((p) => ({ productId: p.productId, seccion: p.seccion ?? null })),
        otras: partesN.filter((p) => p.kind !== "text" && p.kind !== "card"),
        herramientas: traza.map((t: any) => `${t.herramienta}(${JSON.stringify(t.args)}) → ${String(t.resultado).slice(0, 80)}`),
        error,
      });
    }

    const hallazgosActual = evaluarChat(actual.map((t) => ({ mensaje: t.mensaje, texto: t.texto, tarjetas: t.tarjetas })), catalogoEval as any);
    const hallazgosNuevo = evaluarChat(nuevo.map((t) => ({ mensaje: t.mensaje, texto: t.texto, tarjetas: t.tarjetas })), catalogoEval as any);
    const msProm = (xs: any[]) => Math.round(xs.reduce((a, b) => a + (b.ms || 0), 0) / Math.max(1, xs.length));
    return res.json({
      ok: true,
      turnos: turnos.length,
      actual: { msPromedio: msProm(actual), hallazgos: hallazgosActual, turnos: actual },
      nuevo: { msPromedio: msProm(nuevo), hallazgos: hallazgosNuevo, turnos: nuevo, estadoFinal: estado },
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/whatsapp/comparar-modelos
 *
 * Le hace las MISMAS preguntas de venta a todos los modelos disponibles y
 * devuelve las respuestas con sus señales medidas. Existe porque la elección
 * del modelo se venía haciendo a ojo, y medirla explicó de una cuatro rondas
 * de QA: el que contestaba era `laguna-s-2.1-free`, no el que decía el panel.
 *
 * Body opcional: { modelos?: string[], pregunta?: string }
 */
router.post("/comparar-modelos", async (req: TenantRequest, res, next) => {
  try {
    const {
      ESTILO_DE_PRUEBA, FICHA_DE_PRUEBA, PREGUNTAS_DE_PRUEBA, medirSenales,
    } = await import("../lib/comparar-modelos-venta");
    const {
      getProviderConfig, getProviderRotation, getOpenCodeRotation, createAIClient,
    } = await import("@workspace/integrations-openai-ai-server");

    const preguntas: string[] = Array.isArray(req.body?.preguntas) && req.body.preguntas.length
      ? req.body.preguntas.slice(0, 4)
      : PREGUNTAS_DE_PRUEBA;

    // Los candidatos: la rotación de OpenCode (que es la que hoy atiende) más
    // un modelo por cada proveedor que tenga clave. Sin repetir.
    const vistos = new Set<string>();
    const candidatos: Array<{ etiqueta: string; cfg: any }> = [];
    const sumar = (etiqueta: string, cfg: any) => {
      if (!cfg?.model) return;
      const k = cfg.baseUrl + "|" + cfg.model;
      if (vistos.has(k)) return;
      vistos.add(k);
      candidatos.push({ etiqueta, cfg });
    };
    for (const cfg of getOpenCodeRotation()) sumar(`opencode/${cfg.model}`, cfg);
    for (const prov of ["groq", "openrouter", "nvidia", "nvidia_nim", "github", "mimo", "cerebras", "google_ai_studio"]) {
      for (const cfg of getProviderRotation(prov).slice(0, 2)) sumar(`${prov}/${cfg.model}`, cfg);
      sumar(prov, getProviderConfig(prov));
    }
    // Los de pago van solo si se piden por nombre: cuestan plata real.
    for (const prov of (req.body?.dePago || [])) sumar(prov, getProviderConfig(String(prov)));

    const tope = Math.min(Number(req.body?.limite) || 12, candidatos.length);
    const elegidos = candidatos.slice(0, tope);

    const resultados = await Promise.all(elegidos.map(async ({ etiqueta, cfg }) => {
      const respuestas: any[] = [];
      for (const pregunta of preguntas) {
        const t0 = Date.now();
        try {
          const client = createAIClient({ ...cfg, timeout: 25_000, maxRetries: 0 } as any);
          const r = await client.chat.completions.create({
            model: cfg.model,
            max_tokens: 400,
            temperature: 0.6,
            messages: [
              { role: "system", content: `${ESTILO_DE_PRUEBA}\n\n${FICHA_DE_PRUEBA}` },
              { role: "user", content: pregunta },
            ],
          } as any);
          const texto = String((r as any)?.choices?.[0]?.message?.content || "").trim();
          respuestas.push({
            pregunta, ms: Date.now() - t0, texto,
            senales: medirSenales(texto, FICHA_DE_PRUEBA),
          });
        } catch (e: any) {
          respuestas.push({ pregunta, ms: Date.now() - t0, texto: "", error: String(e?.message || e).slice(0, 90) });
        }
      }
      const ok = respuestas.filter((x) => x.texto);
      return {
        modelo: etiqueta,
        respondio: `${ok.length}/${preguntas.length}`,
        // El resumen que permite ordenar sin leer los 40 textos.
        voseo: ok.reduce((a, x) => a + (x.senales?.voseo?.length || 0), 0),
        invento: ok.reduce((a, x) => a + (x.senales?.invento?.length || 0), 0),
        largoPromedio: ok.length ? Math.round(ok.reduce((a, x) => a + x.texto.length, 0) / ok.length) : 0,
        msPromedio: ok.length ? Math.round(ok.reduce((a, x) => a + x.ms, 0) / ok.length) : 0,
        respuestas,
      };
    }));

    // Primero los que respondieron todo, sin voseo y sin inventar.
    resultados.sort((a, b) =>
      (b.respondio.localeCompare(a.respondio)) ||
      (a.invento - b.invento) || (a.voseo - b.voseo) || (a.msPromedio - b.msPromedio));

    res.json({ ok: true, probados: resultados.length, resultados });
  } catch (e: any) {
    next(e);
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

// ────────────────────────────────────────────────────────────────────────────
// 🤖 ENDPOINTS PARA APP ANDROID + ARQUITECTO IA
// ────────────────────────────────────────────────────────────────────────────

// POST /api/whatsapp/capture
// Recibe notificación de app Android, el Arquitecto IA analiza si responder
router.post("/capture", async (req, res, next) => {
  try {
    const { phone, message, timestamp } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: "phone y message requeridos" });
    }

    const tid = tenantIdFromReq(req);
    const { analyzeWhatsAppMessage } = await import("../lib/whatsapp-brain");

    // Buscar o crear conversación.
    // Por acá el número entra como lo escribió una persona ("+57 304 274
    // 8687"); por Baileys entra en dígitos. Comparando exacto, el mismo
    // cliente quedaba con dos conversaciones y el bot le arrancaba de cero.
    const { variantesDeTelefono, normalizarTelefono } = await import("../lib/customer-profile");
    const convos = await db.select().from(conversations)
      .where(and(
        inArray(conversations.contactPhone, variantesDeTelefono(phone)),
        eq(conversations.tenantId, tid)
      ));
    let convo = convos[0];

    if (!convo) {
      [convo] = await db.insert(conversations).values({
        tenantId: tid,
        contactName: `Cliente ${phone}`,
        contactPhone: normalizarTelefono(phone) || phone,
        channel: "whatsapp",
        status: "ai"
      }).returning();
    }

    // Guardar mensaje del cliente
    await db.insert(messages).values({
      conversationId: convo.id,
      role: "customer",
      content: message,
    });

    // Analizar con WhatsApp Brain (Arquitecto IA)
    const analysis = await analyzeWhatsAppMessage(convo.id, tid);

    // Respuesta al app Android
    res.json({
      ok: true,
      conversationId: convo.id,
      debe_responder: analysis.debe_responder,
      respuesta: analysis.respuesta,
      confianza: analysis.confianza,
      tipo_mensaje: analysis.tipo_mensaje,
      razonamiento: analysis.razonamiento,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    return next(e);
  }
});

// POST /api/whatsapp/execute
// App Android confirma y envía la respuesta automática
router.post("/execute", async (req, res, next) => {
  try {
    const { conversationId, mensaje, phone } = req.body;
    if (!conversationId || !mensaje) {
      return res.status(400).json({ error: "conversationId y mensaje requeridos" });
    }

    const tid = tenantIdFromReq(req);

    // Guardar respuesta en BD
    await db.insert(messages).values({
      conversationId,
      role: "assistant",
      content: mensaje,
      metadata: {
        es_automatico: true,
        enviado_via: "app_android",
        timestamp: new Date().toISOString()
      }
    });

    // Envío REAL por WhatsApp.
    //
    // Antes esto era un TODO comentado y la respuesta devolvía
    // `mensaje_enviado: true` igual, SIEMPRE: el mensaje quedaba guardado en
    // la base y quien llamara (la app Android) recibía "enviado" aunque no
    // hubiera salido nada. Un "listo" que no es cierto es peor que un error:
    // el negocio cree que le contestó al cliente y en realidad lo dejó
    // esperando. Ahora se intenta enviar de verdad y se informa exactamente
    // lo que pasó.
    let enviado = false;
    let detalle = "";
    if (!phone) {
      detalle = "No se indicó a qué número enviar el mensaje.";
    } else {
      try {
        const mgr = getWhatsAppForTenant(tid, (req as any).tenant);
        if (!mgr.isConnected()) {
          detalle = "WhatsApp no está conectado en este momento. El mensaje quedó guardado, pero no salió.";
        } else {
          await mgr.sendText(String(phone), String(mensaje));
          enviado = true;
        }
      } catch (err: any) {
        logger.error({ err, conversationId }, "[WhatsApp] Falló el envío desde /execute");
        detalle = "No se pudo entregar el mensaje por WhatsApp.";
      }
    }

    res.json({
      ok: enviado,
      conversationId,
      mensaje_enviado: enviado,
      ...(enviado ? {} : { motivo: detalle }),
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    return next(e);
  }
});

// GET /api/whatsapp/context
// App Android obtiene contexto del negocio
router.get("/context", async (req, res, next) => {
  try {
    const tid = tenantIdFromReq(req);
    const { products: productsTable } = await import("@workspace/db");

    // Obtener productos del negocio
    const prods = await db.select().from(productsTable)
      .where(eq(productsTable.tenantId, tid))
      .limit(10);

    res.json({
      ok: true,
      tenantId: tid,
      productos: prods.map((p: any) => ({
        id: p.id,
        nombre: p.name,
        precio: p.price,
        descripcion: p.description?.substring(0, 200)
      })),
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    return next(e);
  }
});

export default router;
