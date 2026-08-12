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

// Respaldo fijo confirmado funcionando en vivo (2026-08-12, contenedor
// opencode-clean) -- gratis y rápido (~1-2s por turno simple). SIEMPRE es el
// último candidato de la rotación: nunca falla por falta de crédito/quota.
const MODELO_RESPALDO = { providerID: "opencode", modelID: "big-pickle" };

// Diagnóstico completo (2026-08-12) de por qué el sync de keys no alcanzaba
// para usar un proveedor pago:
// 1. `PUT /auth/{id}` sí guarda la key en el auth.json del contenedor (server
//    lo confirma con `true`), pero el endpoint `/provider`'s `connected` --
//    lo único que refleja qué proveedores están realmente utilizables -- NO
//    se recalcula a partir de auth.json en caliente. Solo lista un proveedor
//    como "connected" si su variable de entorno estándar (`GROQ_API_KEY`,
//    `MISTRAL_API_KEY`, etc.) estaba seteada en el PROCESO al arrancar.
//    Confirmado agregando `MISTRAL_API_KEY` como env var real del servicio
//    `opencode-clean` en EasyPanel + reinicio: "mistral" pasó a aparecer en
//    `connected` y una llamada real funcionó (200, respuesta correcta, costo
//    real cobrado). Es decir: el sync dinámico de `opencode-provider-sync.ts`
//    (`PUT /auth/*`) deja la key lista para cuando el proceso reinicie con
//    esa env var seteada, pero no la activa en caliente por sí solo -- para
//    activar un proveedor pago nuevo hace falta agregar su env var real al
//    contenedor `opencode-clean` en EasyPanel + reiniciarlo una vez.
// 2. `groq` con `llama-3.3-70b-versatile`, aun ya "connected" del mismo modo,
//    falla con `ContextOverflowError` ("Session too large to compact...")
//    incluso en una sesión nueva vacía sin herramientas -- probablemente un
//    bug de esta versión de opencode-ai con ese modelo puntual, no algo
//    resoluble desde acá. Se lo excluye de la lista de candidatos.
//
// 3. `openrouter` activado el mismo día (env var real `OPENROUTER_API_KEY`
//    + reinicio): a diferencia de `mistral`/`groq`, poner solo un valor de
//    prueba en la env var SÍ marcó "connected" en `/provider`, pero la
//    llamada real falló con 401 "Missing Authentication header" -- el
//    campo `connected` y la autenticación real de cada request son cosas
//    separadas, hace falta el valor REAL de la key en la env var para que
//    la llamada funcione, no alcanza con que exista. Con la key real
//    confirmado en vivo. Se probaron los 16 modelos gratis del catálogo de
//    OpenRouter de este contenedor (turno simple, sin herramientas): 3
//    fallaron por timeout >40s (`google/gemma-4-26b-a4b-it:free`,
//    `google/gemma-4-31b-it:free`, `nvidia/nemotron-3-super-120b-a12b:free`),
//    1 no soporta tool-calling en absoluto (`nvidia/nemotron-3.5-content-
//    safety:free`, es un clasificador de moderación, no un chat), 1 ignoró
//    la instrucción de forma rara (`cohere/north-mini-code:free`). Los 3
//    elegidos abajo respondieron limpio en 1,3-4,4s y tienen
//    `capabilities.toolcall:true` confirmado en el catálogo.
//
// Rotación real: lista ORDENADA de candidatos (pagos o gratis-con-key-
// propia, lo que los distingue del respaldo de Zen es que dependen de una
// activación explícita). Para cada turno se consulta `/provider` una vez
// (qué está `connected` hoy, ya sea porque alguien activó su env var, o
// porque el usuario pidió que se dejen varios activos a la vez para no
// depender de uno solo) y se arma la sub-lista de los que están realmente
// conectados, en este orden de preferencia. Si el elegido falla EN LA
// LLAMADA REAL (rate limit, 500, lo que sea) se prueba el siguiente
// conectado antes de rendirse al respaldo gratis -- así un proveedor caído
// (o sin activar tras un reinicio del contenedor) nunca deja a Atlas sin
// responder, y agregar un proveedor nuevo a esta lista es lo único que hace
// falta en código una vez que su env var quede seteada con la key real.
const CANDIDATOS_PAGOS: { providerID: string; modelID: string }[] = [
  { providerID: "mistral", modelID: "mistral-large-latest" },
  { providerID: "openrouter", modelID: "nvidia/nemotron-3-nano-30b-a3b:free" },
  { providerID: "openrouter", modelID: "poolside/laguna-xs-2.1:free" },
  { providerID: "openrouter", modelID: "nvidia/nemotron-3-ultra-550b-a55b:free" },
];

async function proveedoresConectados(host: string, authHeader: string): Promise<Set<string>> {
  try {
    const res = await fetch(`${host}/provider`, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return new Set();
    const data = (await res.json()) as any;
    return new Set<string>(data?.connected || []);
  } catch {
    return new Set();
  }
}

// Lista de candidatos a intentar EN ORDEN para este turno: los pagos que
// estén realmente conectados ahora mismo (en el orden de preferencia de
// CANDIDATOS_PAGOS), y siempre el respaldo gratis al final.
async function pickOpencodeModelChain(host: string, authHeader: string): Promise<{ providerID: string; modelID: string }[]> {
  const conectados = await proveedoresConectados(host, authHeader);
  const pagosDisponibles = CANDIDATOS_PAGOS.filter((c) => conectados.has(c.providerID));
  return [...pagosDisponibles, MODELO_RESPALDO];
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
      // Un ÚNICO reloj para todo el turno, arrancado acá y no más adelante:
      // antes el presupuesto de la rotación se medía recién al llegar al
      // bucle de candidatos, así que la preparación previa (registrar el
      // puente MCP hasta 15s + crear la sesión hasta 20s + consultar
      // proveedores hasta 10s) quedaba FUERA de la cuenta y el turno real
      // podía pasarse del corte del proxy (~150-160s) aunque el presupuesto
      // interno dijera 130s. Reproducido en vivo: 502 a los 154s.
      const TURNO_TOTAL_MS = 135_000;
      const turnDeadline = Date.now() + TURNO_TOTAL_MS;

      const turnId = randomUUID();
      // La TTL del token = lo que dura el turno. Además de acotar el token,
      // su `exp` es lo que el puente MCP usa como turnDeadline para que una
      // herramienta lenta (deep_research) sepa cuánto tiempo le queda real.
      const token = mintTurnToken({ tenantId, sessionId, turnId }, TURNO_TOTAL_MS);
      const mcpUrl = `${getAppUrl()}/api/internal/mcp/atlas?token=${token}`;
      const toolRegistry = buildMcpToolRegistry();
      const tools: Record<string, boolean> = {};
      for (const t of toolRegistry) tools[t.name] = true;

      // Detecta respuestas donde el modelo ESCRIBIÓ la llamada a la
      // herramienta como texto en vez de invocarla por el canal real de
      // tool-calling. Visto en vivo dos veces, en formatos distintos:
      // "<function=webfetch>{...}</function>" y "atlas_research_startegraphics{"}".
      // En ambos casos ninguna herramienta se ejecutó y esa basura le llega
      // al admin como si fuera la respuesta. Se apoya en los nombres reales
      // del registro (no en una lista fija) y en que el prompt ya prohíbe
      // mostrarle nombres técnicos de herramientas al admin: si aparece uno
      // en la respuesta, algo salió mal sí o sí.
      const nombresHerramientas = toolRegistry.map((t) => t.name).filter(Boolean);
      const pareceHerramientaFiltrada = (txt: string): boolean => {
        if (!txt) return false;
        if (/<function\s*=|<\|python_tag\|>|\[TOOL_CALLS\]|<tool_call>/i.test(txt)) return true;
        // OpenCode expone las herramientas MCP con prefijo (ej. atlas_list_products).
        if (/\batlas_[a-z_]+/i.test(txt) && /[{}"]/.test(txt)) return true;
        return nombresHerramientas.some((n) => new RegExp(`\\b${n}\\s*[{(]`, "i").test(txt));
      };

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
        const cadena = await pickOpencodeModelChain(cfg.host, cfg.authHeader);

        // Bug real encontrado probando en vivo (2026-08-12): con 145s FIJOS
        // por candidato, una tarea con varias herramientas encadenadas (ej.
        // armar un borrador de anuncio) se colgó sin respuesta -- si el
        // primer candidato tarda cerca de 145s, para cuando se prueba el
        // segundo la conexión con el cliente YA fue cortada por el proxy
        // delante de la app (~150-160s, mismo límite documentado para
        // /operator). El servidor seguía trabajando de fondo, pero nadie
        // veía la respuesta. Fix: presupuesto de tiempo TOTAL para todo el
        // turno (no por candidato) -- cada intento se queda con el tiempo
        // que sobra, nunca con 145s fijos de nuevo. El último candidato
        // (siempre el respaldo gratis de Zen, confirmado ~1-5s en vivo) se
        // queda con lo que quede, para que llegue a intentarse igual aunque
        // los anteriores hayan consumido casi todo el presupuesto.
        // Se reserva una cola fija para el respaldo gratis de Zen (~1-5s
        // confirmado en vivo, pero se le deja margen): así, por lento que
        // haya sido un candidato anterior, SIEMPRE queda tiempo real para
        // que el último de la cadena conteste algo en vez de morir en el
        // corte del proxy sin respuesta.
        const RESERVA_RESPALDO_MS = 25_000;
        // Menos que esto no alcanza ni para el intento más rápido: seguir
        // intentando desde acá solo garantiza pasarse del corte del proxy.
        const PISO_UTIL_MS = 8_000;
        let ultimo: { text: string; error?: string } = { text: "", error: "sin candidatos" };
        for (let i = 0; i < cadena.length; i++) {
          const model = cadena[i];
          const esUltimo = i === cadena.length - 1;
          const restante = turnDeadline - Date.now();
          // Bug real encontrado probando en vivo (2026-08-12): antes acá había
          // pisos fijos (Math.max(..., 15_000) / Math.max(restante, 20_000))
          // que IGNORABAN el reloj -- con 4 candidatos, un primer intento
          // largo que fallaba dejaba a los 3 siguientes corriendo 15+15+20s
          // por encima del deadline. La suma daba ~161s, exactamente el 502
          // del proxy que se estaba reproduciendo. Ningún intento puede durar
          // más de lo que realmente queda.
          if (restante <= PISO_UTIL_MS) {
            logger.warn({ tenantId, model: model.modelID, restante }, "[AtlasOpenCode] Sin tiempo útil restante, se corta la rotación y se responde con lo que haya");
            break;
          }
          // Un candidato NO-último puede quedarse con casi todo el turno (menos
          // la reserva): un pedido con investigación real necesita ~60-90s de
          // corrido, y trocearlo en ventanas cortas hacía que el primer
          // candidato -- el preferido -- fallara SIEMPRE en esos casos.
          const timeoutCandidato = Math.min(
            restante,
            esUltimo ? restante : Math.max(restante - RESERVA_RESPALDO_MS, PISO_UTIL_MS),
          );
          try {
            ultimo = await sendOpencodeMessage(cfg.host, cfg.authHeader, opencodeSessionId, {
              system,
              model,
              tools,
              text,
              timeoutMs: timeoutCandidato,
            });
            // Bug real encontrado probando en vivo (2026-08-12): un candidato
            // respondio 200 "sin error" pero el texto traia sintaxis de
            // tool-call sin ejecutar de verdad (literal "<function=nombre>...
            // </function>" en el texto final) -- el modelo "alucino" que
            // llamaba una herramienta en vez de invocarla por el canal real
            // de tool-calling de OpenCode. Eso casi le llega directo al
            // admin como si fuera la respuesta. Tratarlo como fallo (no como
            // exito) para que rote al siguiente candidato en vez de
            // aceptarlo.
            if (pareceHerramientaFiltrada(ultimo.text)) {
              logger.warn({ tenantId, model }, "[AtlasOpenCode] Candidato filtro sintaxis de tool-call sin ejecutar, rotando al siguiente");
              ultimo = { text: "", error: "tool-call no ejecutado (sintaxis filtrada en el texto)" };
              continue;
            }
            if (!ultimo.error) break; // Respuesta real -- no seguir rotando.
            logger.warn({ tenantId, model, error: ultimo.error }, "[AtlasOpenCode] Candidato falló, rotando al siguiente");
          } catch (err: any) {
            ultimo = { text: "", error: err?.message || "error desconocido" };
            logger.warn({ tenantId, model, error: ultimo.error }, "[AtlasOpenCode] Candidato falló (excepción), rotando al siguiente");
          }
        }
        return ultimo;
      });

      if (opencodeError) {
        logger.error({ tenantId, opencodeError }, "[AtlasOpenCode] Error del motor OpenCode");
        // Quedarse sin tiempo NO es lo mismo que romperse: el pedido puede
        // haber avanzado de verdad (una investigación real llega a quedar
        // registrada aunque la respuesta no alcance a volver). Devolver un
        // 502 genérico ahí le miente al admin -- suena a que no pasó nada.
        // Se responde 200 con un mensaje honesto y accionable, mismo criterio
        // que la salida "esto está tardando" de /operator.
        const seAcaboElTiempo = /timeout|abort|sin tiempo|sin candidatos/i.test(String(opencodeError));
        if (seAcaboElTiempo) {
          const reply = paraMarkdown(toEmojiStyle(
            "⏳ Esto está tardando más de lo que aguanta una sola respuesta. Lo que alcancé a averiguar quedó guardado. Pedime que continúe y sigo desde ahí, o dividí el pedido en pasos más chicos.",
          ));
          await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
          return finish({ reply, status: "partial", needsContinuation: true });
        }
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
