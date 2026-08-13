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
import { ATLAS_SYSTEM_PROMPT_V2, executeAction, verifyMutation, investigacionRapida, type OperatorContext } from "../lib/app-operator";
import {
  loadArchitectHistory, saveArchitectTurn, getPendingPlan, setPendingPlan,
  clearPendingPlan, isApproval, isRejection, loadRecentLessons,
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
    // Al admin NUNCA se le nombra la infraestructura interna (OpenCode,
    // proveedores, contenedores): para él esto es Atlas y punto. El detalle
    // técnico va al log, que es donde sirve para diagnosticar.
    if (!cfg) {
      logger.error("[AtlasOpenCode] Faltan ATLAS_OPENCODE_HOST/USER/PASS -- el motor no puede arrancar");
      return finish({ error: "Atlas no está disponible en este momento. Avisale al soporte técnico si sigue así." }, 500);
    }

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
      // ── Respuesta ambigua: PREGUNTAR, no descartar ──────────────────────
      // Antes, cualquier cosa que no fuera una aprobación exacta borraba el
      // plan en silencio y se volvía a planificar desde cero. Con la
      // conversación real en la mano (2026-08-12) se vio el resultado: el
      // admin respondía algo corto, el plan desaparecía, Atlas proponía otra
      // vez LO MISMO, y así en loop -- confirmó tres veces sin que se
      // ejecutara nada, sin ninguna pista de por qué.
      //
      // Ahora: si la respuesta es corta y no arranca un pedido nuevo, se
      // asume que INTENTÓ confirmar (un "oka", "sale", "hazlo pues", un dedo
      // que erró la tecla) y se le pregunta, MANTENIENDO el plan vivo. Si es
      // un rechazo claro o un pedido nuevo de verdad, ahí sí se descarta.
      const respuesta = String(prompt).trim();
      const arrancaPedidoNuevo = /\b(cre[aá]|prepar[aá]|arm[aá]|gener[aá]|hac[eé]|mostr|mu[eé]stra|dame|list[aá]|busc|investig|cambi|edit|borr|elimin|public|analiz|configur|cu[aá]nt|qu[eé]|c[oó]mo|por\s+qu[eé])/i.test(respuesta);
      const pareceIntentoDeConfirmar = respuesta.length <= 30 && !arrancaPedidoNuevo && !isRejection(respuesta);

      if (pareceIntentoDeConfirmar) {
        const planTexto = pending.actions.map((a, i) => `${i + 1}. ${describePlannedAction(a)}`).join("\n");
        const reply = paraMarkdown(toEmojiStyle(
          `🤔 No me quedó claro si querés que lo haga. Sigue pendiente esto:\n\n${planTexto}\n\n` +
          `Respondé *sí* para que lo ejecute, o decime qué cambio.`,
        ));
        await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
        logger.info({ tenantId, respuesta: respuesta.slice(0, 40) }, "[AtlasOpenCode] Respuesta ambigua con plan pendiente -- se pregunta en vez de descartar");
        return finish({ reply, plan: pending.actions, status: "awaiting_confirmation" });
      }

      // Rechazo explícito o pedido nuevo de verdad: recién ahí se descarta el
      // plan viejo y se planifica con el mensaje nuevo.
      await clearPendingPlan(tenantId, sessionId);
    }

    progreso("Pensando...");
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
      const toolRegistry = buildMcpToolRegistry(String(prompt));
      // El subconjunto viaja en la URL del puente: es lo que hace que el
      // modelo reciba solo los esquemas que puede llegar a usar en ESTE
      // pedido, en vez de los 34 completos. Ver el comentario en
      // opencode-mcp-tools.ts sobre por qué esto importa tanto (69s → objetivo
      // de segundos para un pedido simple).
      const nombresPermitidos = toolRegistry.map((t) => t.name).join(",");
      const mcpUrl = `${getAppUrl()}/api/internal/mcp/atlas?token=${token}&tools=${encodeURIComponent(nombresPermitidos)}`;
      const tools: Record<string, boolean> = {};
      for (const t of toolRegistry) tools[t.name] = true;

      // Apagar las herramientas NATIVAS de OpenCode. Diagnosticado en vivo
      // (2026-08-12) consultando la BD: ante un pedido de investigación, el
      // modelo gastaba los 135s del turno y NO quedaba ni una fila --
      // ninguna de nuestras herramientas se había llamado. La razón: OpenCode
      // trae su propio `websearch`/`webfetch` y el modelo los prefería,
      // quedándose colgado en ellos en vez de usar la investigación en
      // segundo plano. Mientras estas existan, ninguna instrucción del prompt
      // alcanza. Además `bash`/`write`/`edit` le darían acceso al sistema de
      // archivos del contenedor, que un turno de Atlas no necesita para nada.
      for (const nativa of ["bash", "edit", "write", "read", "glob", "grep", "webfetch", "websearch", "task", "todowrite", "skill", "question", "patch", "list"]) {
        tools[nativa] = false;
      }

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
      let text = historyText ? `${historyText}\n\nAdmin: ${prompt}` : `Admin: ${prompt}`;

      // ── Pedidos de varias partes: se atiende UNA por vez ─────────────────
      // Idea del admin, y es la solución correcta al problema de fondo en vez
      // de un parche de tiempos: "¿por qué no dividimos el pedido para que no
      // haga todo de golpe?". Reproducido en vivo, "mostrame el copy, la
      // estrategia, la segmentación, el seguimiento y el presupuesto" tardaba
      // 130-135s -- contra el techo del proxy (~150s) -- porque el modelo
      // intentaba resolver las cinco cosas en un solo turno.
      //
      // Ahora el servidor detecta que son varias y le pide SOLO la primera,
      // avisándole al admin qué queda pendiente. Cada parte entra holgada en
      // el tiempo disponible y el admin ve avance real en vez de una
      // disculpa. No depende de que el modelo se autolimite.
      let partesPendientes: string[] = [];
      const CONECTORES = /,| y (?=el |la |los |las |un |una )/i;
      const crudo = String(prompt).trim();
      if (crudo.length > 60) {
        const partes = crudo
          .split(CONECTORES)
          .map((p) => p.trim())
          .filter((p) => p.length > 3);
        if (partes.length >= 3) {
          const primera = partes[0];
          partesPendientes = partes.slice(1);
          text +=
            `\n\n[SISTEMA] El admin pidió VARIAS cosas en un solo mensaje. Resolvé SOLO esta primera: "${primera}". ` +
            `NO abordes las demás todavía (${partesPendientes.join(", ")}) -- el sistema se las va a ofrecer después. ` +
            `Hacer todo junto no entra en una sola respuesta y termina fallando. Concentrate en esa primera parte y hacela bien.`;
          progreso(`Resolviendo lo primero: ${primera.slice(0, 40)}...`);
        }
      }

      // ── Investigación garantizada por el SERVIDOR, no por el modelo ──────
      // Verificado en vivo (2026-08-12), y es el problema más grave que
      // apareció: ante "investigá X", el modelo contesta "estoy investigando,
      // te aviso en un minuto" y NO llama ninguna herramienta -- confirmado
      // pidiendo research_check un segundo después ("no hay investigación
      // activa") y con cero filas en `architect_memory`. O sea: le decía al
      // admin que estaba trabajando cuando no había arrancado nada. Eso es
      // exactamente la fabricación que este producto no puede permitirse.
      // Ni el prompt ni exponer mejor la herramienta lo resolvieron.
      // Solución: si el pedido es de investigación, el servidor la arranca
      // ÉL MISMO antes de hablarle al modelo, y se lo informa. Así la
      // promesa que Atlas le hace al admin siempre es cierta.
      // ¿Se consiguió información REAL de internet en este turno? Es la
      // única fuente de verdad para desmentir al modelo más abajo si dice
      // que investigó cuando no lo hizo.
      let huboInvestigacionReal = false;
      const PEDIDO_DE_INVESTIGACION = /\b(investig|averigu|indag|research|analiz[aá] el mercado|qu[eé] funciona|tendencia|competencia|benchmark)/i;
      // Crear un anuncio TAMBIÉN dispara la investigación, aunque el admin no
      // use la palabra "investigá". Motivo real (reportado en vivo por el
      // admin, 2026-08-12): `fb_ad_draft` exige investigación reciente -- un
      // candado correcto, evita copy inventado -- pero si el servidor solo
      // investigaba ante palabras como "investigá", un pedido normal como
      // "creá el anuncio del curso" quedaba bloqueado con
      // "Todavía no investigaste nada en esta sesión". El candado hacía bien
      // su trabajo y aun así el admin quedaba trabado. Si el anuncio necesita
      // investigación, se investiga y punto.
      const PEDIDO_DE_ANUNCIO = /\b(cre[aá]|prepar[aá]|arm[aá]|gener[aá]|hac[eé]|dise[ñn])\w*\s+(un\s+|el\s+|la\s+|una\s+)?(anuncio|campa|publicaci|post|ad\b)/i;
      if (PEDIDO_DE_INVESTIGACION.test(String(prompt)) || PEDIDO_DE_ANUNCIO.test(String(prompt))) {
        progreso("Investigando en internet...");
        // Sincrónica y corta a propósito (ver investigacionRapida): el
        // resultado real llega en ESTA respuesta, sin trabajos en segundo
        // plano que se puedan perder ni promesas que cumplir después. Se le
        // reserva algo menos de la mitad del turno; lo que sobra le queda al
        // modelo para redactar, que tarda 10-20s.
        const PRESUPUESTO_INVESTIGACION_MS = 70_000;
        try {
          const r = await investigacionRapida(ctx, String(prompt), Math.min(PRESUPUESTO_INVESTIGACION_MS, Math.max(turnDeadline - Date.now() - 45_000, 20_000)));
          if (r.ok) {
            huboInvestigacionReal = true;
            text += `\n\n[SISTEMA] Investigación REAL ya hecha para este pedido (hallazgos con sus fuentes). Respondé al admin USANDO ESTO, no prometas investigar después ni digas que vas a averiguar -- ya está hecho:\n${r.texto.slice(0, 6000)}`;
          } else {
            // Que el modelo sepa que NO hay datos, para que lo diga en vez de
            // inventar o de prometer una investigación que no va a llegar.
            text += `\n\n[SISTEMA] La investigación NO se pudo completar (${r.motivo.slice(0, 300)}). Decíselo al admin con honestidad y ofrecele reintentar; NO inventes hallazgos ni cites fuentes que no tenés.`;
          }
        } catch (e: any) {
          logger.warn({ tenantId, err: e?.message }, "[AtlasOpenCode] La investigación sincrónica falló");
          text += `\n\n[SISTEMA] La investigación falló por un error técnico. Decíselo al admin con honestidad; NO inventes hallazgos.`;
        }
      }

      // Se guardan afuera para poder mandarle un segundo pedido dirigido al
      // modelo si hizo falta (ver "insistencia" más abajo), sin volver a
      // crear sesión ni perder el contexto de lo que ya escribió.
      let sesionOpencode = "";
      let modeloUsado: { providerID: string; modelID: string } | null = null;

      const { text: finalReply, error: opencodeError } = await conCandado(async () => {
        await registerMcpBridge(cfg.host, cfg.authHeader, mcpUrl);
        const opencodeSessionId = await createOpencodeSession(cfg.host, cfg.authHeader);
        sesionOpencode = opencodeSessionId;
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
        // TECHO por candidato no-último. Reproducido en vivo (2026-08-12) con
        // un pedido grande ("mostrame el copy, la estrategia, la
        // segmentación, el seguimiento y el presupuesto"): el primer
        // candidato se comía ~100s, fallaba, y a los tres siguientes les
        // quedaban 8s cada uno -- ninguno alcanzaba a responder y el admin
        // terminaba viendo "esto está tardando". Acotando el primero a 55s,
        // la cadena entera tiene margen real: si el preferido no puede, el
        // respaldo gratis (rápido) SÍ llega a contestar algo útil.
        const TECHO_POR_CANDIDATO_MS = 55_000;
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
            esUltimo
              ? restante
              : Math.min(Math.max(restante - RESERVA_RESPALDO_MS, PISO_UTIL_MS), TECHO_POR_CANDIDATO_MS),
          );
          try {
            modeloUsado = model;
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
        return finish({ error: "No pude terminar de responder. ¿Podés intentarlo de nuevo?" }, 502);
      }

      // ── Desmentido automático de investigación inventada ────────────────
      // Verificado en vivo (2026-08-12) y es el comportamiento más peligroso
      // que apareció en todo el día: se le pidió al modelo "USA
      // OBLIGATORIAMENTE tu herramienta websearch" y respondió "Usé la
      // herramienta websearch (búsqueda web real, 8 resultados)" con
      // hallazgos detallados... sin UNA SOLA llamada a herramienta en la
      // respuesta (solo `reasoning` y `text`, costo 0, 13s). Los sitios que
      // nombró existen de verdad -- los recuerda del entrenamiento -- pero
      // los datos que les atribuye (precios, "4.8/5 con +1200 reseñas",
      // "edición 2026") no los verificó nadie. No es que falle: falla
      // AFIRMANDO que funcionó, que es justo lo que este producto no puede
      // permitirse (el admin tomaría decisiones de plata con eso).
      // Como el prompt no alcanza, el sistema lo desmiente: solo hay
      // investigación real si LA HIZO EL SERVIDOR en este turno.
      let finalReplyVerificado = finalReply;

      // Si el pedido se dividió, cerrar diciéndole al admin qué falta. Sin
      // esto parecería que Atlas ignoró la mitad de lo que pidió.
      if (partesPendientes.length && finalReplyVerificado) {
        finalReplyVerificado +=
          `\n\n📋 Tu pedido tenía varias partes. Resolví la primera; falta:\n` +
          partesPendientes.map((p, i) => `${i + 1}. ${p}`).join("\n") +
          `\n\nDecime "seguí" y voy con la próxima (de a una salen mejor y más rápido).`;
      }
      const AFIRMA_HABER_INVESTIGADO = /\b(busqu[ée]|investigu[ée]|seg[uú]n (?:mi|la) (?:b[uú]squeda|investigaci[oó]n)|us[ée] (?:la herramienta )?(?:websearch|web_search)|resultados reales|encontr[ée] en internet|fuentes? (?:reales?|encontradas?))/i;
      if (!huboInvestigacionReal && AFIRMA_HABER_INVESTIGADO.test(finalReplyVerificado || "")) {
        logger.warn({ tenantId, sessionId }, "[AtlasOpenCode] El modelo afirmó haber investigado sin que hubiera búsqueda real -- se corrige la respuesta");
        finalReplyVerificado =
          `${finalReplyVerificado}\n\n⚠️ Aviso automático: en este mensaje NO se hizo ninguna búsqueda web real, ` +
          `así que lo de arriba sale del conocimiento general del modelo y no de fuentes verificadas hoy. ` +
          `No lo tomes como dato comprobado. Pedime que lo verifique y busco de verdad antes de que decidas nada con esto.`;
      }

      let plannedActions = await drainDraftPlan(tenantId, turnId);

      // ── Insistencia dirigida cuando pidió una acción y no la ejecutó ─────
      // Verificado en vivo (2026-08-12): ante "creá el anuncio", el modelo
      // redacta un copy excelente, pregunta "¿te gusta?" y NO llama
      // fb_ad_draft. El admin se queda creyendo que tiene un anuncio guardado
      // cuando no existe nada. Las "5 reglas" del prompt arreglaron inventar
      // ofertas y dejar huecos, pero NO esto -- que es exactamente lo que ya
      // sabíamos: lo que hay que EJECUTAR no se garantiza por prompt.
      //
      // En vez de adivinar el copy desde el texto (frágil) o de rendirse, se
      // le manda un segundo pedido corto EN LA MISMA SESIÓN: ya tiene el
      // copy que escribió, solo le falta guardarlo. Si igual no lo hace, se
      // le avisa al admin con honestidad en vez de dejarlo creyendo que sí.
      const PEDIDO_DE_ACCION = /\b(cre[aá]|prepar[aá]|arm[aá]|gener[aá]|hac[eé]|publi[cq])/i;
      const MENCIONA_ANUNCIO = /\b(anuncio|campa|ad\b|publicaci[oó]n|post)\b/i;
      const pidioCrearAlgo = PEDIDO_DE_ACCION.test(String(prompt)) && MENCIONA_ANUNCIO.test(String(prompt));
      const quedaTiempo = turnDeadline - Date.now() > 25_000;

      if (pidioCrearAlgo && plannedActions.length === 0 && sesionOpencode && modeloUsado && quedaTiempo && !opencodeError) {
        logger.info({ tenantId, sessionId }, "[AtlasOpenCode] Pidió crear algo y no llamó ninguna herramienta -- se insiste una vez");
        progreso("Guardando lo que preparé...");
        try {
          await sendOpencodeMessage(cfg.host, cfg.authHeader, sesionOpencode, {
            system,
            model: modeloUsado,
            tools,
            text:
              "[SISTEMA] Escribiste el contenido pero NO lo guardaste: no llamaste ninguna herramienta, " +
              "así que del lado del admin no existe nada. Llamá AHORA la herramienta que corresponde " +
              "(fb_ad_draft para un anuncio, propose_action para publicar) usando EXACTAMENTE el texto que " +
              "acabás de redactar, completo y sin huecos. No vuelvas a escribir el copy en el chat ni pidas " +
              "confirmación: solo hacé la llamada.",
            timeoutMs: Math.max(turnDeadline - Date.now() - 5_000, 15_000),
          });
          plannedActions = await drainDraftPlan(tenantId, turnId);
        } catch (e: any) {
          logger.warn({ tenantId, err: e?.message }, "[AtlasOpenCode] La insistencia falló");
        }

        if (plannedActions.length === 0) {
          // Que el admin NO se quede pensando que tiene algo guardado.
          finalReplyVerificado =
            `${finalReplyVerificado}\n\n⚠️ Aviso automático: esto quedó solo como texto en el chat, ` +
            `NO se guardó como borrador en el sistema. Pedímelo de nuevo (por ejemplo "guardá ese anuncio") ` +
            `y lo registro de verdad.`;
        }
      }

      if (plannedActions.length > 0) {
        const planText = plannedActions.map((a, i) => `${i + 1}. ${describePlannedAction(a)}`).join("\n");
        const reply = paraMarkdown(toEmojiStyle(
          `${finalReplyVerificado ? finalReplyVerificado + "\n\n" : ""}📋 Plan propuesto (requiere tu confirmación):\n${planText}\n\n❓ ¿Confirmas? Responde sí para ejecutar, o dime qué ajusto.`,
        ));
        await setPendingPlan(tenantId, sessionId, plannedActions, reply);
        await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
        logger.info({ tenantId, planned: plannedActions.length }, "[AtlasOpenCode] Plan propuesto, esperando confirmación");
        return finish({ reply, plan: plannedActions, status: "awaiting_confirmation" });
      }

      const reply = paraMarkdown(toEmojiStyle(finalReplyVerificado || "No tengo una respuesta para eso todavía."));
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
