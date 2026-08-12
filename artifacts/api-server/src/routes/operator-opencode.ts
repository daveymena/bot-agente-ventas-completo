/**
 * FASE A del plan aprobado "Reemplazar el cerebro de Atlas por OpenCode":
 * ruta nueva y separada, `POST /api/code-agent/operator-opencode`, mismo
 * contrato exacto que `/operator` (routes/code-agent.ts) pero SIEMPRE usa el
 * cerebro nuevo. No toca `/operator` en absoluto -- cero riesgo para
 * tenants reales mientras esto se prueba. Ver el plan para el resto de las
 * fases (B: flag por tenant, C: default).
 *
 * Lo que SÍ se reusa tal cual de /operator (mismo comportamiento, misma
 * seguridad): la máquina de estados de confirmación de architect-store.ts
 * (getPendingPlan/setPendingPlan/isApproval/isRejection), executeAction() y
 * verifyMutation() de app-operator.ts, describePlannedAction() de
 * opencode-mcp-tools.ts, y paraMarkdown()/toEmojiStyle() para el formato de
 * salida. La ÚNICA pieza nueva es cómo se genera la respuesta: en vez del
 * loop local callAI()+JSON.parse, se delega el turno a una sesión real de
 * OpenCode (contenedor `operato`) con las herramientas de lectura + la tool
 * `propose_action` vía MCP.
 *
 * Simplificaciones deliberadas de esta Fase A (no son huecos de seguridad,
 * son features que faltan pulir antes de la Fase C):
 * - Sin auto-reparación (attemptSelfRepair): si una acción confirmada
 *   falla, se reporta el error tal cual, sin reintentar solo.
 * - Sin relay de progreso fino vía GET /event de OpenCode: se manda un
 *   heartbeat genérico mientras se espera la respuesta.
 * - El modelo/proveedor de OpenCode es fijo por ahora (ver pickOpencodeModel) --
 *   la tarea de sincronizar las API keys guardadas del admin lo hace dinámico.
 */
import { Router } from "express";
import { randomUUID } from "node:crypto";
import type { TenantRequest } from "../lib/tenantManager";
import { logger } from "../lib/logger";
import { ATLAS_SYSTEM_PROMPT_V2, executeAction, verifyMutation, type OperatorContext } from "../lib/app-operator";
import {
  loadArchitectHistory, saveArchitectTurn, getPendingPlan, setPendingPlan,
  clearPendingPlan, isApproval, loadRecentLessons,
} from "../lib/architect-store";
import { toEmojiStyle } from "../lib/conversation-engine";
import { paraMarkdown } from "./code-agent";
import { describePlannedAction, buildMcpToolRegistry, drainDraftPlan } from "../lib/opencode-mcp-tools";
import { mintTurnToken } from "../lib/opencode-turn-token";
import { getAppUrl } from "../lib/app-url";

const router = Router();

// ── Configuración del contenedor OpenCode (operato) ─────────────────────────
// Nunca hardcodear la credencial acá -- si faltan las env vars, esta ruta
// falla con un mensaje claro en vez de silenciosamente usar un valor
// insertado en el código fuente (que terminaría en git).
function opencodeConfig(): { host: string; authHeader: string } | null {
  const host = process.env.ATLAS_OPENCODE_HOST;
  const user = process.env.ATLAS_OPENCODE_USER;
  const pass = process.env.ATLAS_OPENCODE_PASS;
  if (!host || !user || !pass) return null;
  return { host: host.replace(/\/+$/, ""), authHeader: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64") };
}

// ── Serialización de llamadas a operato ─────────────────────────────────────
// El registro MCP (`POST /mcp`) es GLOBAL en el contenedor -- si dos turnos
// de tenants distintos corrieran en paralelo, el segundo "registro" podría
// pisar el token del primero antes de que termine de usarlo, mezclando el
// contexto de un tenant con el de otro. Mientras el bridge sea un solo
// contenedor compartido, se serializa: registrar+enviar+esperar respuesta es
// una sección crítica. Simplifica la Fase A a costa de rendimiento bajo
// carga concurrente -- aceptable para dogfooding de un solo tenant; revisar
// antes de la Fase C si hay más de un tenant usándolo a la vez.
let opencodeQueue: Promise<any> = Promise.resolve();
function conCandado<T>(fn: () => Promise<T>): Promise<T> {
  const run = opencodeQueue.then(fn, fn);
  opencodeQueue = run.then(() => undefined, () => undefined);
  return run;
}

// Respaldo fijo confirmado funcionando en vivo (2026-08-11) contra operato --
// gratis pero lento (turnos de 2+ herramientas pueden acercarse al límite de
// tiempo). Se usa solo si no hay un proveedor mejor ya sincronizado.
const MODELO_RESPALDO = { providerID: "openrouter", modelID: "nvidia/nemotron-3-nano-30b-a3b:free" };

// Proveedores preferidos, en orden, cuando el admin ya los sincronizó (ver
// lib/opencode-provider-sync.ts) -- groq primero porque es el más rápido
// confirmado en este proyecto (usado también por oc-groq para deep_research).
const PREFERENCIA_PROVEEDORES: { providerID: string; modelID: string }[] = [
  { providerID: "groq", modelID: "llama-3.3-70b-versatile" },
  { providerID: "mistral", modelID: "mistral-large-latest" },
];

/** Elige el mejor modelo disponible en operato: primero un proveedor real
 * que el admin haya sincronizado (más rápido/confiable que el gratis fijo),
 * si no, el respaldo gratis conocido. Nunca lanza -- ante cualquier duda usa
 * el respaldo. */
async function pickOpencodeModel(host: string, authHeader: string): Promise<{ providerID: string; modelID: string }> {
  try {
    const res = await fetch(`${host}/config/providers`, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return MODELO_RESPALDO;
    const data = (await res.json()) as any;
    const disponibles = new Set((data?.providers || []).map((p: any) => p.id));
    for (const cand of PREFERENCIA_PROVEEDORES) {
      if (disponibles.has(cand.providerID)) return cand;
    }
  } catch {
    // Ante cualquier falla al consultar, seguir con el respaldo conocido.
  }
  return MODELO_RESPALDO;
}

async function registerMcpBridge(host: string, authHeader: string, mcpUrl: string): Promise<void> {
  const res = await fetch(`${host}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({ name: "atlas", config: { type: "remote", url: mcpUrl, enabled: true } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`No se pudo registrar el puente MCP en OpenCode (${res.status})`);
}

async function createOpencodeSession(host: string, authHeader: string): Promise<string> {
  const res = await fetch(`${host}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: "{}",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`No se pudo crear la sesión de OpenCode (${res.status})`);
  const data = (await res.json()) as any;
  if (!data?.id) throw new Error("OpenCode no devolvió un id de sesión");
  return data.id;
}

interface OpencodePart { type: string; text?: string; [k: string]: any }

async function sendOpencodeMessage(
  host: string,
  authHeader: string,
  sessionId: string,
  opts: { system: string; model: { providerID: string; modelID: string }; tools: Record<string, boolean>; text: string; timeoutMs: number },
): Promise<{ text: string; error?: string }> {
  const res = await fetch(`${host}/session/${sessionId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({
      agent: "general",
      model: opts.model,
      system: opts.system,
      tools: opts.tools,
      parts: [{ type: "text", text: opts.text }],
    }),
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
  if (!res.ok) throw new Error(`OpenCode respondió ${res.status}`);
  const data = (await res.json()) as any;
  if (data?.info?.error) {
    return { text: "", error: data.info.error.data?.message || data.info.error.name || "Error desconocido de OpenCode" };
  }
  const parts: OpencodePart[] = Array.isArray(data?.parts) ? data.parts : [];
  const text = parts.filter((p) => p.type === "text" && p.text).map((p) => p.text!.trim()).join("\n\n").trim();
  return { text };
}

router.post("/operator-opencode", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

    const { prompt, history: historialCrudo = [] } = req.body;
    if (!prompt) return res.status(400).json({ error: "prompt requerido" });
    const sessionId: string = (req.body?.sessionId as string) || "default";
    const ctx: OperatorContext = { tenantId, sessionId };

    const streaming = req.body?.stream === true;
    if (streaming) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
    }
    const sse = (event: string, data: any) => {
      if (!streaming || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const progreso = (texto: string) => sse("progress", { texto });
    const finish = (payload: any, status = 200) => {
      if (streaming) {
        sse(status === 200 ? "result" : "error", payload);
        res.end();
        return;
      }
      return res.status(status).json(payload);
    };

    const cfg = opencodeConfig();
    if (!cfg) return finish({ error: "El cerebro OpenCode no está configurado (faltan ATLAS_OPENCODE_HOST/USER/PASS)" }, 500);

    const persisted = await loadArchitectHistory(tenantId, sessionId);
    const convo = persisted.length > 0 ? persisted : (Array.isArray(historialCrudo) ? historialCrudo : []);
    await saveArchitectTurn(tenantId, sessionId, "user", String(prompt));

    // ── ¿Hay un plan pendiente esperando confirmación? Mismo mecanismo que
    // /operator, sin cambios -- confirmar/rechazar nunca pasa por OpenCode. ──
    const pending = await getPendingPlan(tenantId, sessionId);
    if (pending && pending.actions.length > 0) {
      if (isApproval(String(prompt))) {
        const executed: any[] = [];
        const lines: string[] = [];
        for (const a of pending.actions) {
          const r = await executeAction(a.tool, a.args || {}, ctx);
          const verification = r.ok ? await verifyMutation(a.tool, a.args || {}, ctx) : "";
          executed.push({ tool: a.tool, args: a.args, ok: r.ok, summary: r.summary, verification });
          lines.push(`${r.ok ? "✅" : "❌"} ${r.summary}${verification ? `\n   ${verification}` : ""}`);
        }
        await clearPendingPlan(tenantId, sessionId);
        const allOk = executed.every((item) => item.ok);
        const reply = paraMarkdown(toEmojiStyle(
          `${allOk ? "✅ Plan ejecutado y verificado" : "⚠️ El plan terminó con errores; no voy a decir que quedó listo"}:\n\n${lines.join("\n\n")}`,
        ));
        await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
        logger.info({ tenantId, executed: executed.length }, "[AtlasOpenCode] Plan aprobado y ejecutado");
        return finish({ reply, executed, actionsCount: executed.length, status: allOk ? "executed" : "partial_failure" });
      }
      // Rechazo explícito o respuesta ambigua: en ambos casos se limpia el
      // plan viejo y se re-planifica con el mensaje nuevo (mismo criterio
      // que /operator -- solo la aprobación tiene un camino distinto).
      await clearPendingPlan(tenantId, sessionId);
    }

    progreso("Pensando con OpenCode...");
    const heartbeat = setInterval(() => progreso("Sigo trabajando en tu pedido..."), 15_000);

    try {
      const turnId = randomUUID();
      const token = mintTurnToken({ tenantId, sessionId, turnId });
      const mcpUrl = `${getAppUrl()}/api/internal/mcp/atlas?token=${token}`;
      const toolRegistry = buildMcpToolRegistry();
      const tools: Record<string, boolean> = {};
      for (const t of toolRegistry) tools[t.name] = true;

      const lessons = await loadRecentLessons(tenantId);
      const lessonsBlock = lessons.length
        ? `\n\nLECCIONES DE ERRORES PASADOS EN ESTE NEGOCIO (evita repetirlos):\n${lessons.map((l) => `- ${l}`).join("\n")}`
        : "";
      const system = ATLAS_SYSTEM_PROMPT_V2 + lessonsBlock;

      const historyText = convo
        .map((m: any) => `${m.role === "user" ? "Admin" : "Atlas"}: ${m.content}`)
        .join("\n\n");
      const text = historyText ? `${historyText}\n\nAdmin: ${prompt}` : `Admin: ${prompt}`;

      const { text: finalReply, error: opencodeError } = await conCandado(async () => {
        await registerMcpBridge(cfg.host, cfg.authHeader, mcpUrl);
        const opencodeSessionId = await createOpencodeSession(cfg.host, cfg.authHeader);
        const model = await pickOpencodeModel(cfg.host, cfg.authHeader);
        return sendOpencodeMessage(cfg.host, cfg.authHeader, opencodeSessionId, {
          system,
          model,
          tools,
          text,
          // 145s: el modelo gratis actual (openrouter/nemotron-3-nano-30b)
          // resultó más lento de lo esperado bajo carga -- 100s y 125s
          // ambos se quedaron cortos en vivo para un turno con 2 llamadas de
          // herramienta encadenadas. 145s es lo más cerca que conviene ir
          // del corte del proxy delante de la app (~150-160s, confirmado
          // empíricamente para /operator) sin garantizar perder la carrera.
          // Es una limitación real del modelo gratis, no del código -- la
          // sincronización de API keys pagas del admin (próxima tarea) es
          // el arreglo de fondo, esto es la mitigación mientras tanto.
          timeoutMs: 145_000,
        });
      });

      if (opencodeError) {
        logger.error({ tenantId, opencodeError }, "[AtlasOpenCode] Error del motor OpenCode");
        return finish({ error: "No pude terminar de responder con el motor nuevo. ¿Podés intentarlo de nuevo?" }, 502);
      }

      const plannedActions = await drainDraftPlan(tenantId, turnId);

      if (plannedActions.length > 0) {
        const planText = plannedActions.map((a, i) => `${i + 1}. ${describePlannedAction(a)}`).join("\n");
        const reply = paraMarkdown(toEmojiStyle(
          `${finalReply ? finalReply + "\n\n" : ""}📋 Plan propuesto (requiere tu confirmación):\n${planText}\n\n❓ ¿Confirmas? Responde sí para ejecutar, o dime qué ajusto.`,
        ));
        await setPendingPlan(tenantId, sessionId, plannedActions, reply);
        await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
        logger.info({ tenantId, planned: plannedActions.length }, "[AtlasOpenCode] Plan propuesto, esperando confirmación");
        return finish({ reply, plan: plannedActions, status: "awaiting_confirmation" });
      }

      const reply = paraMarkdown(toEmojiStyle(finalReply || "No tengo una respuesta para eso todavía."));
      await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
      return finish({ reply, status: "info", needsContinuation: false });
    } finally {
      clearInterval(heartbeat);
    }
  } catch (e) {
    logger.error(e, "[AtlasOpenCode] Error inesperado");
    // Mismo motivo que /operator: con streaming las cabeceras ya salieron,
    // así que el manejador de errores por defecto de Express no puede mandar
    // su propio JSON con otro código de estado -- se cierra con un evento
    // de error SSE en vez de dejar la conexión colgada.
    if (!res.headersSent) return next(e);
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "turno interrumpido" })}\n\n`);
    } catch { /* la conexión ya estaba cerrada */ }
    if (!res.writableEnded) res.end();
    return;
  }
});

export default router;
