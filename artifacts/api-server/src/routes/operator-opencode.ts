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
import { ATLAS_SYSTEM_PROMPT_V2, executeAction, verifyMutation, investigacionRapida, mensajeParaAdmin, type OperatorContext } from "../lib/app-operator";
import {
  loadArchitectHistory, saveArchitectTurn, getPendingPlan, setPendingPlan,
  clearPendingPlan, isApproval, isRejection, loadRecentLessons,
} from "../lib/architect-store";
import { toEmojiStyle } from "../lib/conversation-engine";
import { paraMarkdown } from "./code-agent";
import { describePlannedAction, buildMcpToolRegistry, drainDraftPlan, lecturasDelTurno } from "../lib/opencode-mcp-tools";
import { MODULO_PUBLICIDAD, FORMATO_ANUNCIO } from "../lib/publicidad-persuasiva";
import { mintTurnToken } from "../lib/opencode-turn-token";
import { getAppUrl } from "../lib/app-url";
import { ENV_POR_PROVEEDOR } from "../lib/ai-keys";
import { db, products } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

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
// 4. `deepseek` (activado 2026-08-19, key propia de pago del admin). Va
//    PRIMERO por una razón medida, no por preferencia: el turno de anuncio se
//    cortaba a los 135s sin crear nada, y el desglose por tramos mostró que el
//    tiempo se iba en rotar entre candidatos que no resolvían
//    (`nemotron-3-nano` 48s, `laguna` 31s, `nemotron-3-ultra` 8s, `big-pickle`
//    17s). Con un pago rápido al frente la cadena casi nunca llega a rotar.
//
//    Cuál de los cuatro modelos de DeepSeek, y por qué los otros tres NO:
//    según el catálogo real (models.dev, el mismo que consume OpenCode) los
//    cuatro tienen `tool_call: true`, así que tool-calling no los separa. Lo
//    que los separa es `reasoning`:
//      - `deepseek-chat`     reasoning:NO  ← el único que sirve acá
//      - `deepseek-reasoner` reasoning:sí
//      - `deepseek-v4-flash` reasoning:sí
//      - `deepseek-v4-pro`   reasoning:sí  (y 3x el precio: $0.435/$0.87)
//    Un modelo de razonamiento en este turno es exactamente el bug que este
//    proyecto ya midió dos veces y documentó en agent.ts: "gasta TODO el
//    presupuesto de tokens en reasoning_content y devuelve content vacío"
//    (`deepseek-v4-flash-free`), y `nemotron-3-ultra-free` "se cortaba con
//    finish_reason length incluso para responder OK". Acá el presupuesto es de
//    135s compartidos con la investigación y varias herramientas encadenadas:
//    pensar en voz alta antes de llamar la primera herramienta es justo lo que
//    no entra. Por eso `deepseek-chat` y no los otros tres.
const CANDIDATOS_PAGOS: { providerID: string; modelID: string }[] = [
  { providerID: "deepseek", modelID: "deepseek-chat" },
  { providerID: "mistral", modelID: "mistral-large-latest" },
  // Groq, MEDIDO en vivo el 2026-08-24 contra la instalación real, no elegido
  // por preferencia. El admin objetó "tenemos github, zen, nvidia, imposible
  // que ninguno sirva" y tenía razón: probando uno por uno con /api/ai/test,
  // TODO lo demás estaba caído y Groq era lo único que contestaba.
  //
  //   opencode/claude-haiku-4-5      401 sin método de pago     0.6s
  //   opencode/big-pickle (respaldo) 429 cuota agotada          1.2s
  //   opencode_go/deepseek-v4-flash  403 solo alojado en China  0.4s
  //   deepseek/deepseek-chat         402 sin saldo              0.9s
  //   groq/openai/gpt-oss-120b       OK                         0.8s
  //   groq/openai/gpt-oss-20b        OK                         0.3s
  //
  // Va acá, después de los dos de pago (que fallan en ~1s cada uno cuando no
  // hay saldo, costo despreciable) y ANTES de los gratis de OpenRouter, que
  // son los que se comen 55s cada uno.
  //
  // ⚠️ La medición fue contra el proveedor a través de ESTA app. Atlas habla
  // con el contenedor de OpenCode, que resuelve los modelos por su cuenta: si
  // allá el id no existiera, este candidato falla rápido y la rotación sigue
  // -- mucho más barato que los 55s de un gratis que sí existe pero no llega.
  { providerID: "groq", modelID: "openai/gpt-oss-120b" },
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
    // El catálogo de modelos venía en la MISMA respuesta y se tiraba. Por eso
    // GitHub, Groq y compañía nunca entraban a la cadena aunque su clave
    // estuviera cargada: no había de dónde sacar un modelo suyo sin inventarle
    // el id. Se guarda acá y lo usa `pickOpencodeModelChain`.
    catalogoPorProveedor.clear();
    const provs = data?.providers ?? data?.all ?? [];
    if (Array.isArray(provs)) {
      for (const p of provs) {
        const id = String(p?.id ?? p?.providerID ?? "");
        if (id && p?.models) catalogoPorProveedor.set(id, p.models);
      }
    } else if (provs && typeof provs === "object") {
      for (const [id, p] of Object.entries(provs as Record<string, any>)) {
        if (p?.models) catalogoPorProveedor.set(id, p.models);
      }
    }
    return new Set<string>(data?.connected || []);
  } catch {
    return new Set();
  }
}

/**
 * Catálogo de modelos por proveedor, como lo devolvió OpenCode en la última
 * consulta a `/provider`. Vive fuera de la función porque se llena ahí y se
 * lee al armar la cadena, en el mismo turno.
 *
 * Si OpenCode cambia el shape de esa respuesta, esto queda vacío y la cadena
 * vuelve sola al comportamiento anterior (solo los curados + respaldo): se
 * pierde el descubrimiento, no el servicio.
 */
const catalogoPorProveedor = new Map<string, unknown>();

// Lista de candidatos a intentar EN ORDEN para este turno: los pagos que
// estén realmente conectados ahora mismo (en el orden de preferencia de
// CANDIDATOS_PAGOS), y siempre el respaldo gratis al final.
// El motivo de descarte va al desglose que ve el ADMIN, así que tiene que
// entrar en una línea y no arrastrar el stack ni el JSON crudo del proveedor.
// Los casos frecuentes se nombran en castellano llano -- "sin crédito" le dice
// al admin qué hacer, "429 {\"error\":{\"type\":...}}" no.
function resumirMotivo(error: string): string {
  const e = String(error || "").trim();
  if (/timeout|abort|timed? ?out/i.test(e)) return "se quedó sin tiempo";
  if (/429|rate.?limit|quota|cuota/i.test(e)) return "sin cupo (rate limit)";
  if (/401|403|unauthor|forbidden|api.?key|authentication/i.test(e)) return "clave rechazada";
  if (/credit|balance|payment|insufficient/i.test(e)) return "sin crédito";
  if (/context|too large|overflow|length/i.test(e)) return "pedido demasiado grande";
  if (/tool-call no ejecutado/i.test(e)) return "no ejecutó la herramienta";
  if (/5\d\d/.test(e)) return "error del proveedor";
  return e.replace(/\s+/g, " ").slice(0, 60);
}

// ¿Tiene ESTA app la clave de ese proveedor cargada ahora mismo? Guardar una
// clave en Configuración → "Modelos de pago" la vuelca a `process.env` en el
// acto (`cargarClavesEnEntorno()` en ai-catalog.ts) y además la sincroniza a
// OpenCode con `PUT /auth/{id}`. O sea: si esto es true, la clave existe y ya
// viajó al contenedor.
function hayClavePropia(providerID: string): boolean {
  const envKey = ENV_POR_PROVEEDOR[providerID];
  return !!(envKey && process.env[envKey]);
}

async function pickOpencodeModelChain(host: string, authHeader: string): Promise<{ providerID: string; modelID: string }[]> {
  const conectados = await proveedoresConectados(host, authHeader);
  // `connected` NO alcanza como único criterio, y esto costó un turno entero
  // de anuncio perdido (2026-08-19). Está documentado arriba que ese campo solo
  // se enciende si la env var estándar del proveedor estaba seteada en el
  // PROCESO de OpenCode al arrancar: una clave sincronizada en caliente con
  // `PUT /auth/{id}` queda guardada y usable, pero `connected` sigue en false
  // hasta el próximo reinicio del contenedor. Filtrando solo por `connected`,
  // un proveedor de pago recién configurado por el admin quedaba invisible
  // -- y Atlas seguía rotando entre gratis lentos con la clave paga ya puesta.
  //
  // También lo cubre al revés: si el contenedor de OpenCode se reinicia y
  // pierde sus env vars, `connected` se vacía y la cadena entera se caía al
  // respaldo gratis sin que nadie se enterara.
  //
  // Se intenta, entonces, todo candidato que esté conectado O cuya clave
  // tengamos nosotros. Si la llamada real falla igual, la rotación la absorbe:
  // ese es justamente su trabajo, y un intento fallido cuesta mucho menos que
  // no intentar el único modelo de pago disponible.
  //
  // Y además de los curados se DESCUBREN los proveedores rápidos que el admin
  // tenga configurados y que no estén en la lista (GitHub, Groq, Cerebras...).
  // Reportado el 2026-08-24: el turno se cortó a los 135s y el admin objetó
  // "tenemos github, tenemos opencode zen, tenemos nvidia, imposible que
  // ninguno sirva". Tenía razón: la lista era fija y GitHub no estaba, así que
  // con la clave cargada Atlas igual no lo intentaba nunca.
  //
  // El modelo sale del catálogo que OpenCode ya devuelve, no de un id
  // hardcodeado: un id inventado es un candidato más que quemar.
  const { armarCadena } = await import("../lib/cadena-modelos");
  return armarCadena({
    curados: CANDIDATOS_PAGOS,
    conectados,
    tenemosClave: hayClavePropia,
    modelosPorProveedor: catalogoPorProveedor,
    respaldo: MODELO_RESPALDO,
  });
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
        // ── Encadenado: el paso 2 usa el id que produjo el paso 1 ──────────
        // "Creá el anuncio y subilo a Meta" no entra en un turno del modelo
        // (medido: se pasa de los 135s y corta sin hacer nada). La salida es
        // que proponga los dos pasos juntos -- proponer es rápido -- y que la
        // ejecución, que pasa acá afuera del turno, encadene los ids.
        //
        // Cuando se propuso el plan, el borrador todavía no existía, así que
        // el draftId viaja como "auto" y se resuelve recién ahora.
        let ultimoDraftId: number | null = null;
        for (const a of pending.actions) {
          // Resolver el "auto" con el borrador que acaba de crearse.
          const argsReales: any = { ...(a.args || {}) };
          if (argsReales.draftId === "auto") {
            if (!ultimoDraftId) {
              executed.push({ tool: a.tool, args: a.args, ok: false, summary: "No se pudo subir a Meta: el paso anterior no dejó ningún borrador que subir.", verification: "" });
              lines.push("❌ No se pudo subir a Meta: el paso anterior no dejó ningún borrador que subir.");
              continue;
            }
            argsReales.draftId = ultimoDraftId;
          }
          const r = await executeAction(a.tool, argsReales, ctx);
          if (a.tool === "fb_ad_draft" && r.ok) {
            const nuevo = Number((r as any)?.data?.id);
            if (Number.isInteger(nuevo) && nuevo > 0) ultimoDraftId = nuevo;
          }
          const verification = r.ok ? await verifyMutation(a.tool, argsReales, ctx) : "";
          executed.push({ tool: a.tool, args: argsReales, ok: r.ok, summary: r.summary, verification });
          // En el fallo, el summary está escrito para el modelo -- se limpia
          // antes de mostrárselo al admin (ver mensajeParaAdmin).
          const paraElAdmin = r.ok ? r.summary : mensajeParaAdmin(r.summary);
          lines.push(`${r.ok ? "✅" : "❌"} ${paraElAdmin}${verification ? `\n   ${verification}` : ""}`);
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

      // ── Cronometro por tramos ────────────────────────────────────────────
      // Tres cortes por tiempo seguidos y tres diagnosticos distintos, todos
      // por deduccion: primero culpe a la subida a Meta, despues al encadenado
      // del plan, despues al presupuesto de investigacion. Cada arreglo servia
      // para otra cosa, pero ninguno se apoyaba en una medicion.
      //
      // Con esto el propio mensaje de corte dice donde se fue el tiempo, asi
      // el proximo diagnostico sale en un intento y no en tres. Y le sirve al
      // admin: "se fue en investigar" es accionable, "tardo mucho" no.
      const t0 = Date.now();
      const tramos: Array<{ etapa: string; ms: number }> = [];
      const marcar = (etapa: string, desde: number) => {
        tramos.push({ etapa, ms: Date.now() - desde });
      };
      const tramosTexto = () =>
        tramos.length
          ? tramos.map((t) => `${t.etapa} ${(t.ms / 1000).toFixed(1)}s`).join(" · ") + ` · total ${((Date.now() - t0) / 1000).toFixed(1)}s`
          : `total ${((Date.now() - t0) / 1000).toFixed(1)}s`;

      /**
       * Por qué se cayó el turno, dicho en una línea y arriba de todo.
       *
       * El desglose de tramos ya traía el motivo, pero enterrado: el admin veía
       * "⏱️ modelo:deepseek-chat(descartado: sin crédito) 1.2s · ..." y leía un
       * problema de lentitud. La causa real era que sus DOS modelos de pago
       * estaban sin saldo, y por eso la cadena caía a los gratis --que no
       * alcanzan a resolver un pedido de anuncio-- y se comía los 135s.
       *
       * Reportado el 2026-08-24 con ese trace exacto. Recargar el saldo es algo
       * que el admin puede hacer YA; "está tardando" no le dice qué hacer.
       *
       * Se distingue sin saldo de clave mala a propósito: son dos arreglos
       * distintos (pagar vs. volver a pegar la clave) y `resumirMotivo` ya los
       * separa.
       */
      const causaDeFondo = (): string | null => {
        const dePago = tramos.filter((t) => /sin crédito|clave rechazada/i.test(t.etapa));
        if (dePago.length === 0) return null;
        const nombres = dePago
          .map((t) => (t.etapa.match(/^modelo:([^(]+)/) || [])[1]?.trim())
          .filter(Boolean)
          .join(", ");
        const sinSaldo = dePago.some((t) => /sin crédito/i.test(t.etapa));
        return sinSaldo
          ? `\n\n⚠️ **La causa es el saldo, no la lentitud.** Tus modelos de pago (${nombres}) están sin crédito, `
            + `así que el pedido cayó a los modelos gratis, que no alcanzan a resolver algo de este tamaño a tiempo. `
            + `Recargá el saldo de ese proveedor y esto vuelve a andar en segundos.`
          : `\n\n⚠️ **La causa es la clave, no la lentitud.** El proveedor rechazó la clave de ${nombres}. `
            + `Volvé a cargarla en Configuración → Modelos de pago.`;
      };

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
      const historyText = convo
        .map((m: any) => `${m.role === "user" ? "Admin" : "Atlas"}: ${m.content}`)
        .join("\n\n");
      let text = historyText ? `${historyText}\n\nAdmin: ${prompt}` : `Admin: ${prompt}`;

      // ── El módulo de publicidad, SOLO cuando se está hablando de anuncios ─
      //
      // Estaba escrito desde el 18-08-2026 y no lo leía nadie: se usaba únicamente
      // como validador (revisarCopy), nunca como instrucción. Atlas escribía los
      // anuncios con la doctrina VIEJA del prompt -- que hasta hace un rato le
      // pedía literalmente "beneficio + prueba social + CTA" -- y después el
      // validador le rechazaba la prueba social que el propio prompt le había
      // mandado poner. De ahí salió el "+800 dueños ya lo lograron" del PACK
      // EDUCA A TU PERRO: el modelo estaba obedeciendo.
      //
      // Va condicionado y no fijo porque el prompt del operador ya roza el tope
      // de caracteres, y pasarse no degrada la respuesta: la anula. Se mira toda
      // la conversación, no solo el último mensaje: cuando el admin contesta "sí"
      // o el nombre del producto, el pedido de anuncio quedó tres mensajes atrás.
      const contextoDelTurno = `${historyText}\n${prompt}`;
      const HABLA_DE_ANUNCIOS = /anuncio|publicidad|campa[nñ]a|copy|pauta|creativ|publicit|\bads?\b/i;
      const moduloBlock = HABLA_DE_ANUNCIOS.test(contextoDelTurno)
        ? `\n\n${MODULO_PUBLICIDAD}\n\n${FORMATO_ANUNCIO}`
        : "";
      const system = ATLAS_SYSTEM_PROMPT_V2 + lessonsBlock + moduloBlock;

      // Un pedido de anuncio/campaña/publicación. Se declara acá arriba
      // porque lo usan dos bloques: el que pregunta por el producto faltante
      // (abajo) y el que dispara la investigación previa.
      // "anunciá" faltaba, y es el verbo MÁS natural para pedir un anuncio.
      // Detectado por el dueño preguntando si la búsqueda se hacía: su mensaje
      // era "Anunciá en Facebook mi curso..." y no matcheaba ningún verbo de
      // la lista, así que el turno corrió SIN investigar -- y el aviso
      // automático se lo dijo ("en este mensaje NO se hizo ninguna búsqueda
      // web real").
      //
      // Tercera vez que una lista cerrada de palabras deja afuera un caso
      // obvio. Por eso ahora "anunciá"/"publicitá" valen SOLOS, sin exigir un
      // sustantivo detrás: quien dice "anunciá mi curso" está pidiendo un
      // anuncio, no hace falta que además diga la palabra "anuncio".
      const PEDIDO_DE_ANUNCIO = /\b(anunci[aá]|publicit[aá])\w*|\b(cre[aá]|prepar[aá]|arm[aá]|gener[aá]|hac[eé]|dise[ñn]|lanz[aá])\w*\s+(un\s+|el\s+|la\s+|una\s+)?(anuncio|campa|publicaci|post|ad\b)/i;

      // ── Anuncio sin producto: preguntar ANTES de gastar un turno ─────────
      // Pedido del admin: "antes de ponerse a inventar debería pedir la
      // información si no se la dan". La regla del prompt no alcanzó --
      // probado en vivo con "crea un anuncio": el modelo NO preguntó, eligió
      // productos por su cuenta ("elegidos por relevancia y demanda actual")
      // y tardó 125s en hacerlo.
      //
      // Acá no hace falta un modelo para saber que falta el dato: si el
      // pedido es de anuncio y no nombra ningún producto ni id, se pregunta
      // DIRECTO, sin llamar al modelo. Sale en ~2s, es imposible que invente
      // y el admin elige él.
      if (PEDIDO_DE_ANUNCIO.test(String(prompt))) {
        const contexto = `${historyText}\n${prompt}`.toLowerCase();
        const suyos = await db
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(eq(products.tenantId, tenantId))
          .orderBy(desc(products.id))
          .limit(200);
        const mencionaProducto = suyos.some((p: { id: number; name: string }) => {
          if (new RegExp(`\\b${p.id}\\b`).test(contexto)) return true;
          const palabras = String(p.name).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 5);
          return palabras.length > 0 && palabras.some((w) => contexto.includes(w));
        });

        if (!mencionaProducto && suyos.length > 0) {
          const muestra = suyos.slice(0, 8).map((p: { id: number; name: string }) => `• ${p.name} (id ${p.id})`).join("\n");
          const reply = paraMarkdown(toEmojiStyle(
            `¿Para cuál producto querés el anuncio? Decime el nombre o el número y lo preparo.\n\n${muestra}` +
            (suyos.length > 8 ? `\n\n…y ${suyos.length - 8} más. Si querés, decime el nombre y lo busco.` : ""),
          ));
          await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
          logger.info({ tenantId }, "[AtlasOpenCode] Pidieron un anuncio sin decir de qué producto -- se pregunta sin gastar un turno de modelo");
          return finish({ reply, status: "info", needsContinuation: false });
        }
      }

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
        // Solo se divide si cada parte pide algo ENTREGABLE distinto. Sin
        // esto se rompía un pedido normal: "creá el anuncio con ángulo de fe,
        // destino WhatsApp, presupuesto 10000" son PARÁMETROS de una sola
        // tarea, no tres tareas -- y al partirlo, Atlas contestaba solo el
        // ángulo y dejaba "destino WhatsApp" y "presupuesto" como pendientes,
        // que es absurdo (visto en vivo, 2026-08-12).
        const ENTREGABLE = /\b(copy|texto|estrategia|segmentaci|seguimiento|presupuesto|an[aá]lisis|informe|reporte|plan\b|campa|anuncio|publicaci|imagen|p[uú]blico|audiencia|m[eé]tricas?)\b/i;
        // Además del entregable, cada parte tiene que ser una ORDEN entera y
        // por sí sola: empezar con un verbo de acción y estar bien formada.
        //
        // Sin esto, partir por comas producía pedazos de frase que después se
        // le mostraban al admin como tareas pendientes. Caso real (reporte del
        // 16-08-2026): apareció como pendiente el texto
        //   "descripcion y CTA) y crealo como BORRADOR ... NO lo publiques"
        // -- un fragmento cortado dentro de un paréntesis, con la instrucción
        // "NO lo publiques" convertida en un ítem de trabajo. Contar palabras
        // de entregable no alcanzaba porque los PARÁMETROS de una sola tarea
        // (presupuesto, texto, imagen) las traen igual.
        const ACCION = /^(?:y\s+)?(?:me\s+)?(?:por\s+favor\s+)?(cre[aá]|arm[aá]|gener[aá]|analiz[aá]|investig[aá]|busc[aá]|revis[aá]|public[aá]|activ[aá]|paus[aá]|escrib[ií]|redact[aá]|list[aá]|mostr[aá]|actualiz[aá]|corrig|cambi[aá]|elimin[aá]|borr[aá]|program[aá]|calcul[aá])/i;
        const balanceada = (p: string) =>
          (p.match(/\(/g) || []).length === (p.match(/\)/g) || []).length;
        const partesUtiles = partes.filter((p) => ENTREGABLE.test(p) && ACCION.test(p) && balanceada(p));
        // Se parte SOLO si todas las partes con entregable son órdenes bien
        // formadas: si aunque sea una es un fragmento, se trata el pedido como
        // una sola tarea. Es preferible tardar más en un pedido que mostrarle
        // al admin basura como si fuera trabajo pendiente.
        const conEntregable = partes.filter((p) => ENTREGABLE.test(p));
        if (partes.length >= 3 && partesUtiles.length >= 3 && partesUtiles.length === conEntregable.length) {
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
      if (PEDIDO_DE_INVESTIGACION.test(String(prompt)) || PEDIDO_DE_ANUNCIO.test(String(prompt))) {
        progreso("Investigando en internet...");
        // Sincrónica y corta a propósito (ver investigacionRapida): el
        // resultado real llega en ESTA respuesta, sin trabajos en segundo
        // plano que se puedan perder ni promesas que cumplir después. Se le
        // reserva algo menos de la mitad del turno; lo que sobra le queda al
        // modelo para redactar, que tarda 10-20s.
        // El presupuesto de investigación se ADAPTA a cuánto trabajo le queda
        // al modelo después.
        //
        // 70s fijos era más de la mitad del turno, y el comentario de arriba
        // asume que "redactar tarda 10-20s". Eso vale cuando el pedido es solo
        // escribir. Pero cuando además hay que buscar el producto, pedir el
        // brief y proponer dos acciones encadenadas, cada paso es una vuelta
        // más contra el modelo y los ~65s restantes no alcanzan: medido dos
        // veces seguidas con "anunciá mi curso de IA: escribí, guardá y
        // subilo", el turno cortó sin crear nada.
        //
        // Si el pedido incluye EJECUTAR (guardar/subir/publicar), la
        // investigación se recorta a la mitad. Sigue siendo tiempo real de
        // búsqueda -- suficiente para traer ángulos de la competencia -- pero
        // le deja al modelo el margen que necesita para llegar a proponer.
        // Vale más un anuncio creado con investigación más corta que una
        // investigación completa que muere sin anuncio.
        // Un pedido de anuncio SIEMPRE ejecuta: `crear_anuncio` termina
        // guardando un borrador, lo pida el admin con esa palabra o no. Esta
        // condición era una lista de verbos y volvía a fallar por el mismo
        // motivo de siempre -- medido el 2026-08-19 con "Creá un anuncio ...
        // no lo subas todavía": ni "creá" (el patrón exige "creá ... y") ni
        // "subas" (el patrón exige "sub" + i/í) enganchaban, así que el turno
        // se tomaba los 70s largos de investigación para un pedido que sí iba
        // a ejecutar. Es la cuarta vez que enumerar palabras deja afuera un
        // caso obvio; acá directamente no hace falta adivinar el verbo.
        const PIDE_EJECUTAR =
          PEDIDO_DE_ANUNCIO.test(String(prompt))
          || /\b(guard[aá]|sub[ií]|public[aá]|cre[aá]\w*\s+(y|,)|deja\w*\s+list)/i.test(String(prompt));
        const PRESUPUESTO_INVESTIGACION_MS = PIDE_EJECUTAR ? 35_000 : 70_000;
        try {
          const tInv = Date.now();
          const r = await investigacionRapida(ctx, String(prompt), Math.min(PRESUPUESTO_INVESTIGACION_MS, Math.max(turnDeadline - Date.now() - 45_000, 20_000)));
          marcar("investigacion", tInv);
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
          const tModelo = Date.now();
          try {
            modeloUsado = model;
            ultimo = await sendOpencodeMessage(cfg.host, cfg.authHeader, opencodeSessionId, {
              system,
              model,
              tools,
              text,
              timeoutMs: timeoutCandidato,
            });
            // Cada intento se mide por separado: con varios candidatos en
            // cadena, saber CUÁL se comió el tiempo es la diferencia entre
            // arreglar el modelo lento y seguir tocando presupuestos al azar.
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
            }
            // El tramo se mide DESPUÉS de saber si el candidato sirvió, y se
            // anota con el motivo del descarte. Antes se marcaba apenas volvía
            // la llamada, así que un candidato que devolvía 200 con un error
            // adentro aparecía en el desglose idéntico a uno exitoso: en el
            // corte del 2026-08-19 se leía "modelo:mistral-large-latest 4.0s"
            // como si hubiera respondido bien, cuando en realidad se descartó
            // y por eso la cadena siguió rotando hasta comerse los 135s. El
            // motivo solo estaba en el log del servidor, que es justo lo que no
            // se puede mirar desde el chat. "Falló porque X" es accionable;
            // un número de segundos a secas manda a diagnosticar de nuevo.
            marcar(`modelo:${model.modelID}${ultimo.error ? `(descartado: ${resumirMotivo(ultimo.error)})` : ""}`, tModelo);
            if (!ultimo.error) break; // Respuesta real -- no seguir rotando.
            logger.warn({ tenantId, model, error: ultimo.error }, "[AtlasOpenCode] Candidato falló, rotando al siguiente");
          } catch (err: any) {
            // El intento que FALLA es el que más importa medir: es el que se
            // comió el tiempo sin devolver nada.
            marcar(`modelo:${model.modelID}(falló: ${resumirMotivo(err?.message || "error desconocido")})`, tModelo);
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
        logger.warn({ tenantId, tramos, totalMs: Date.now() - t0, opencodeError }, "[AtlasOpenCode] Turno cortado -- reparto real del tiempo");

        // Si igual alcanzó a redactar algo útil, se muestra ESO.
        //
        // El modelo puede devolver texto Y error a la vez (se quedó sin tiempo
        // en el último tramo, pero ya tenía la respuesta armada). Acá se
        // descartaba el texto y se ponía el aviso en su lugar, así que al
        // admin le llegaba "corté acá, no hice nada" pegado a un trabajo que
        // SÍ estaba hecho -- visto en vivo pidiendo activar el anuncio del
        // piano: primero el aviso de que cortó, y debajo el diagnóstico
        // completo de la campaña. Dos mensajes que se contradicen.
        const parcial = String(finalReply || "").trim();
        if (seAcaboElTiempo && parcial.length > 80) {
          const reply = paraMarkdown(toEmojiStyle(
            `${parcial}\n\n⏳ (Me quedé sin tiempo para seguir: lo de arriba es lo que alcancé. Si falta algo, pedime que continúe.)`,
          ));
          await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
          return finish({ reply, status: "partial", needsContinuation: true });
        }

        if (seAcaboElTiempo) {
          const reply = paraMarkdown(toEmojiStyle(
            // Antes decía "Lo que alcancé a averiguar quedó guardado", y se
            // leía como que el trabajo pedido había quedado guardado. No hay
            // nada guardado: se cortó el turno. Con lo sensible que resultó
            // este punto -- Atlas diciendo "guardado" sin guardar --, este
            // mensaje tiene que ser inequívoco.
            "⏳ Esto está tardando más de lo que aguanta una sola respuesta, así que corté acá. **No se creó ni se guardó nada.** "
            + "Pedime que continúe y sigo desde ahí, o dividí el pedido en pasos más chicos."
            + (causaDeFondo() || "")
            + `\n\n⏱️ En qué se fue el tiempo: ${tramosTexto()}`,
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


      // ── Seguir solo con las partes que falten, mientras quede tiempo ─────
      // Antes, un pedido de varias partes resolvía la primera y le pedía al
      // admin que escribiera "seguí" por cada una. Pedido explícito del admin
      // (2026-08-15): "necesito que todo lo haga Atlas, no yo". Y tenía
      // razón: encargarle el ciclo completo de un producto y que devuelva
      // solo la investigación, pidiendo permiso para continuar, no es un
      // asistente autónomo.
      //
      // El corte original no era un capricho: el turno vive dentro de una
      // petición HTTP y el proxy corta cerca de los 150s. Por eso acá se
      // sigue SOLO mientras el reloj del turno lo permita -- mismo criterio
      // que la "insistencia dirigida" de más abajo. Si el tiempo se acaba con
      // partes sin hacer, ahí sí se le dice al admin cuáles quedaron, en vez
      // de fingir que se hizo todo.
      const MARGEN_POR_PARTE_MS = 45_000;
      while (
        partesPendientes.length > 0 &&
        sesionOpencode &&
        modeloUsado &&
        !opencodeError &&
        turnDeadline - Date.now() > MARGEN_POR_PARTE_MS
      ) {
        const siguiente = partesPendientes.shift()!;
        logger.info({ tenantId, parte: siguiente.slice(0, 60) }, "[AtlasOpenCode] Sigo solo con la parte siguiente");
        progreso(`Sigo con: ${siguiente.slice(0, 40)}...`);
        try {
          const r = await sendOpencodeMessage(cfg.host, cfg.authHeader, sesionOpencode, {
            system,
            model: modeloUsado,
            tools,
            text:
              `[SISTEMA] Seguí vos solo con la parte siguiente del mismo pedido: "${siguiente}". ` +
              `Usá lo que ya averiguaste recién, no vuelvas a investigar lo mismo. ` +
              `No le pidas permiso al admin para continuar: resolvela y, si hay que crear o cambiar algo, ` +
              `proponelo con propose_action.`,
            timeoutMs: Math.max(turnDeadline - Date.now() - 10_000, 20_000),
          });
          if (r.error) {
            logger.warn({ tenantId, err: r.error }, "[AtlasOpenCode] La parte siguiente falló, corto acá");
            partesPendientes.unshift(siguiente);
            break;
          }
          if (r.text) finalReplyVerificado = `${finalReplyVerificado}\n\n${r.text}`.trim();
        } catch (e: any) {
          logger.warn({ tenantId, err: e?.message }, "[AtlasOpenCode] Excepción en la parte siguiente, corto acá");
          partesPendientes.unshift(siguiente);
          break;
        }
      }

      // Lo que NO alcanzó a entrar en el turno se dice tal cual. Sin esto
      // parecería que Atlas ignoró la mitad de lo que pidió.
      if (partesPendientes.length && finalReplyVerificado) {
        finalReplyVerificado +=
          `\n\n📋 No me alcanzó el tiempo del turno para todo. Falta:\n` +
          partesPendientes.map((p, i) => `${i + 1}. ${p}`).join("\n") +
          `\n\nDecime "seguí" y lo termino.`;
      }
      const AFIRMA_HABER_INVESTIGADO = /\b(busqu[ée]|investigu[ée]|seg[uú]n (?:mi|la) (?:b[uú]squeda|investigaci[oó]n)|us[ée] (?:la herramienta )?(?:websearch|web_search)|resultados reales|encontr[ée] en internet|fuentes? (?:reales?|encontradas?))/i;
      if (!huboInvestigacionReal && AFIRMA_HABER_INVESTIGADO.test(finalReplyVerificado || "")) {
        logger.warn({ tenantId, sessionId }, "[AtlasOpenCode] El modelo afirmó haber investigado sin que hubiera búsqueda real -- se corrige la respuesta");
        finalReplyVerificado =
          `${finalReplyVerificado}\n\n⚠️ Aviso automático: en este mensaje NO se hizo ninguna búsqueda web real, ` +
          `así que lo de arriba sale del conocimiento general del modelo y no de fuentes verificadas hoy. ` +
          `No lo tomes como dato comprobado. Pedime que lo verifique y busco de verdad antes de que decidas nada con esto.`;
      }

      // ── Números del negocio que NO se leyeron ────────────────────────────
      // Se lo vio informarle al admin "1 lead · 4 conversaciones activas"
      // cuando el panel mostraba 5 y 23. No es que Atlas lea de otra fuente:
      // dashboard_summary y el endpoint del panel corren la MISMA consulta,
      // con el mismo filtro de tenant y el mismo conteo. O sea que esos
      // números no salieron de ninguna consulta: los recordó de un turno
      // viejo o los inventó. Y el admin toma decisiones con eso.
      const AFIRMA_NUMEROS = /\b\d+\s*(leads?|prospectos?|conversaciones?|ventas?\s+cerradas?|tratos?)\b|\bconversi[oó]n\b[^.\n]{0,20}?\d+\s*%|\bingresos?\s+(?:de|del mes)?\s*\$?\s*[\d.,]+/i;
      const lecturas = await lecturasDelTurno(tenantId, turnId);
      const leyoMetricas = lecturas.some((t) =>
        ["dashboard_summary", "list_recent_conversations", "list_leads", "sales_report"].includes(t));
      if (!leyoMetricas && AFIRMA_NUMEROS.test(finalReplyVerificado || "")) {
        logger.warn({ tenantId, sessionId, lecturas }, "[AtlasOpenCode] Dio números del negocio sin consultarlos -- se corrige la respuesta");
        finalReplyVerificado =
          `${finalReplyVerificado}\n\n⚠️ Aviso automático: los números de arriba NO se consultaron en este mensaje, ` +
          `así que pueden estar viejos o equivocados. Miralos en el panel, o pedime que los consulte y te los traigo del dato real.`;
      }

      // ── Afirmar que revisó Facebook sin haberlo consultado ───────────────
      // Caso real (16-08-2026): el admin preguntó si su campaña de piano
      // seguía pausada y Atlas contestó "revisión en ambas cuentas de Facebook
      // Ads: la campaña no existe en ninguna de las dos". Hay UNA sola cuenta
      // publicitaria configurada, y no llamó ninguna herramienta de Facebook.
      // Inventó el alcance de una revisión que no hizo, sobre una campaña que
      // el admin había pausado con su propia mano.
      const AFIRMA_REVISO_META =
        /\b(revis|verifi|consult|busqu|chequ)\w*[^.\n]{0,60}\b(facebook|meta|ads?\b|campa[ñn]a)/i;
      const NIEGA_EXISTENCIA = /\bno (existe|hay|tiene|aparece|encontr)\w*/i;
      const TOOLS_META = ["fb_list_campaigns", "fb_campaign_metrics", "fb_status", "fb_list_adsets", "fb_list_drafts"];
      const consultoMeta = lecturas.some((t) => TOOLS_META.includes(t));
      const textoFinal = String(finalReplyVerificado || "");
      if (!consultoMeta && AFIRMA_REVISO_META.test(textoFinal) && NIEGA_EXISTENCIA.test(textoFinal)) {
        logger.warn({ tenantId, sessionId, lecturas }, "[AtlasOpenCode] Afirmó haber revisado Meta sin consultarlo -- se corrige");
        finalReplyVerificado =
          `⚠️ **No consulté Meta en este mensaje**, así que no puedo afirmar que algo no exista allá. `
          + `Pedime que lo revise y consulto la cuenta publicitaria de verdad.\n\n---\n\n${textoFinal}`;
      }

      let plannedActions = await drainDraftPlan(tenantId, turnId);

      // ¿El modelo dio por hecho un trabajo que no ejecutó? Se decide acá
      // abajo, pero la aclaración se REDACTA al final del turno: depende de si
      // al cierre quedó o no un plan esperando confirmación, y eso todavía
      // puede cambiar (la insistencia corre después).
      let avisarQueNoEjecuto = false;

      // ── "Ya lo hice" cuando NO hizo nada ─────────────────────────────────
      // El problema más grave de todos, reportado por el admin con la
      // conversación entera en la mano (2026-08-12): Atlas escribía
      // "✅ 3 anuncios creados en pausa" con presupuesto y segmentación
      // detallados... y justo debajo aparecía el plan pidiendo confirmación
      // para crearlos. O sea: NO había creado nada y lo daba por hecho. Lo
      // mismo con "✅ Listos los 3 borradores, guardados localmente".
      //
      // En este punto del código sabemos la verdad: si estamos acá, NO se
      // ejecutó ninguna acción (la ejecución real ocurre en la rama de
      // aprobación, que retorna mucho antes). Así que cualquier "ya está
      // hecho" es falso por definición y se corrige antes de mostrarlo.
      // El candado NO puede depender de que haya un plan propuesto.
      //
      // Antes exigía `plannedActions.length > 0`, y el peor caso es justo el
      // contrario: auditoría del 16-08-2026, 2 de 2 intentos de crear un
      // anuncio. Atlas contestó "✅ Campos guardados y valores: … Presupuesto
      // diario: $10.000 … Estado: PAUSED" SIN proponer ningún plan y sin
      // llamar ninguna herramienta -- no hubo un solo POST a la API en toda la
      // traza de red. En la base de datos no quedó nada. Como no había plan,
      // el candado no se activaba y el admin se quedaba creyendo que su
      // anuncio existía.
      //
      // Acá sabemos la verdad sin preguntarle al texto: si la ejecución llegó
      // a este punto, NO se ejecutó ninguna acción de escritura -- la
      // ejecución real ocurre en la rama de aprobación, que retorna mucho
      // antes. Así que cualquier "ya está hecho" es falso POR CONSTRUCCIÓN,
      // haya plan o no.
      // La lista CERRADA de verbos era el agujero. Medido en vivo
      // (2026-08-19): Atlas contestó "✅ Borrador 89 subido a Meta en pausa.
      // 📂 La campaña quedó pausada" y Meta devolvía {"campaigns":[]} -- no
      // existía nada. "subido" y "pausada" no estaban en la lista, así que el
      // candado no se activó y el admin quedó creyendo que tenía un anuncio
      // en su cuenta.
      //
      // Perseguir verbos uno por uno es perder siempre: cada palabra que no
      // anticipamos es una mentira que pasa. En castellano los participios
      // terminan en -ado/-ido (con sus femeninos y plurales), así que se
      // reconoce la FORMA en vez de enumerar significados: subido, pausada,
      // creado, guardada, publicados, cargado, lo que venga.
      //
      // Un falso positivo acá no hace daño: en este punto del código NO se
      // ejecutó ninguna acción de escritura (la ejecución real vive en la
      // rama de aprobación, que retorna mucho antes), así que la aclaración
      // "todavía no se guardó nada" es cierta SIEMPRE que llegue hasta acá.
      // Entre avisar de más y dejar pasar un "ya está hecho" falso, este
      // proyecto ya sabe cuál duele.
      // Las tres van como literales y NO armadas con `new RegExp` + plantilla:
      // construyéndolas así los escapes se pierden (`\b\w` terminaba siendo
      // `w`) y el candado quedaba mudo sin que nada avisara. Verificado con
      // pruebas antes de dar esto por bueno.
      const texto = String(finalReplyVerificado || "");
      const AFIRMA_HABERLO_HECHO =
        // "✅ ... subido", "Listo, ... publicado"
        /(?:✅|✔️|\blistos?\b)[^\n]{0,100}?\b\w{3,}(?:ad[oa]s?|id[oa]s?)\b/i.test(texto)
        // "quedó pausada", "fue publicado", "ya está actualizado"
        || /\b(?:qued(?:ó|o|aron)|fue(?:ron)?|est(?:á|án|a|an))\s+(?:ya\s+)?\w{3,}(?:ad[oa]s?|id[oa]s?)\b/i.test(texto)
        // "Borrador guardado", "campaña creada", "campos guardados"
        // "producto" queda FUERA a propósito: "encontré estos productos
        // relacionados" es una pregunta legítima y "relacionados" termina en
        // -ados. Un producto realmente guardado lo cazan los dos patrones de
        // arriba ("✅ ... guardado", "el producto ya está actualizado").
        || /\b(?:campos?|borrador(?:es)?|anuncios?|campa[nñ]as?|cambios?|copy)\b[^\n]{0,20}?\b\w{3,}(?:ad[oa]s?|id[oa]s?)\b/i.test(texto);

      if (AFIRMA_HABERLO_HECHO) {
        logger.warn(
          { tenantId, sessionId, teniaPlan: plannedActions.length > 0 },
          "[AtlasOpenCode] El modelo dijo que ya había hecho el trabajo sin ejecutar NADA -- se corrige",
        );
        // Solo se ANOTA que hay que aclararlo; el texto se arma al final.
        //
        // Acá se redactaba la aclaración en el acto, y eso producía un mensaje
        // que se contradecía con su propio `status` (visto en vivo el
        // 2026-08-19): el admin leía "no quedó ninguna acción pendiente de
        // confirmar, pedímelo de nuevo" en un turno que respondía
        // `status: "awaiting_confirmation"` y que SÍ tenía plan esperando su
        // sí. El motivo es de orden: en este punto `plannedActions` todavía
        // puede estar vacío porque la insistencia -- que es la que consigue
        // que el modelo llame a la herramienta -- corre MÁS ABAJO. La frase
        // se escribía sobre un dato que aún no estaba decidido.
        //
        // Y no es cosmético: si el admin hace lo que le dice ese texto y lo
        // pide de nuevo, termina con el anuncio duplicado.
        avisarQueNoEjecuto = true;
      }

      // ── Preguntar y proponer a la vez es contradictorio ──────────────────
      // Visto en vivo (2026-08-12): Atlas preguntó "¿para cuál curso querés
      // el copy?" y en el MISMO mensaje propuso un plan para el producto 123.
      // El admin no sabe si le están preguntando o pidiéndole confirmar, y si
      // confirma sin querer se ejecuta sobre un producto que él nunca eligió.
      // Pedido explícito del admin: "antes de ponerse a inventar debería
      // pedir la información si no se la dan".
      //
      // Si la respuesta termina preguntando por un dato que falta, se
      // descarta el plan: primero se responde la pregunta, después se
      // propone. La pregunta queda; lo que se cae es la acción a medias.
      // Se mira solo el CIERRE de la respuesta (últimos 250 caracteres): una
      // pregunta por un dato faltante va al final. Así no se confunde con una
      // pregunta retórica en el medio del texto. "¿Confirmas?" no entra
      // porque no pide un dato, pide una decisión sobre algo ya armado.
      const PIDE_UN_DATO = /¿\s*(para |de |con |a )?(cu[aá]l|qu[eé]|cu[aá]nto|qui[eé]n|d[oó]nde)\b[^?]{0,140}\?/i;
      const cierre = String(finalReply || "").trim().slice(-250);
      const terminaPreguntando = PIDE_UN_DATO.test(cierre);
      if (terminaPreguntando && plannedActions.length > 0) {
        logger.info(
          { tenantId, acciones: plannedActions.length },
          "[AtlasOpenCode] El modelo preguntó y propuso a la vez -- se descarta el plan y queda la pregunta",
        );
        await clearPendingPlan(tenantId, sessionId).catch(() => undefined);
        plannedActions = [];
      }

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
      // "subí" faltaba, y era justo el verbo del paso que más importa.
      // Medido en vivo (2026-08-19): a "Subí el borrador 89 a Meta EN PAUSA"
      // Atlas contestó "✅ subido" sin llamar nada, y como el pedido no
      // matcheaba ningún verbo de acción, la insistencia ni se intentó.
      const PEDIDO_DE_ACCION = /\b(cre[aá]|prepar[aá]|arm[aá]|gener[aá]|hac[eé]|publi[cq]|guard[aá]|sub[ií]|carg[aá]|activ[aá]|paus[aá]|segu[ií]|contin[uú])/i;
      const MENCIONA_ANUNCIO = /\b(anuncio|campa|ad\b|publicaci[oó]n|post)\b/i;

      // Que el modelo YA HAYA REDACTADO el anuncio vale como pedido, aunque el
      // último mensaje del admin no lo diga.
      //
      // Medido en vivo (2026-08-18): el admin pidió el anuncio, Atlas preguntó
      // cuál producto, el admin contestó "El correcto es PACK EDUCA A TU PERRO,
      // seguí vos con todo" y Atlas redactó el anuncio ENTERO sin guardarlo.
      // Mirando solo ese mensaje, el pedido de crear quedaba dos turnos atrás.
      // Peor todavía con un "si, confirmo" a secas.
      //
      // Mirar lo que el modelo ESCRIBIÓ es más confiable que adivinar la
      // intención del admin: si en la respuesta hay un anuncio redactado y no
      // se guardó nada, hay que insistir, sin importar cómo se pidió.
      const REDACTO_UN_ANUNCIO =
        /(🔥\s*GANCHO|TEXTO PRINCIPAL|📝\s*Borrador de anuncio|borrador de anuncio (listo|preparado)|📌\s*TITULAR)/i
          .test(String(finalReplyVerificado || ""));
      const pidioCrearAlgo =
        (PEDIDO_DE_ACCION.test(String(prompt)) && MENCIONA_ANUNCIO.test(String(prompt)))
        || REDACTO_UN_ANUNCIO;
      const quedaTiempo = turnDeadline - Date.now() > 25_000;

      // Si Atlas está PREGUNTANDO algo, no guardar es lo correcto.
      //
      // Antes esto se disparaba con cualquier pedido que mencionara crear un
      // anuncio, sin mirar qué había contestado. Resultado (re-auditoría del
      // 16-08-2026): a un mensaje donde Atlas solo preguntaba "¿Continúo?
      // Decime sí o el nombre del producto" se le pegaba "⚠️ esto quedó solo
      // como texto en el chat, NO se guardó como borrador". No había nada que
      // guardar: estaba pidiendo el dato que le faltaba, que es justo lo que
      // le pedimos que haga antes de inventar.
      //
      // PERO tiene que ser una pregunta por un DATO QUE FALTA, no un "¿te
      // gusta?" sobre algo que ya escribió. El patrón viejo se activaba con
      // cualquier "?" o cualquier "decime", y el modelo cierra CASI SIEMPRE
      // pidiendo confirmación -- así que la insistencia no se disparaba nunca.
      //
      // Medido en vivo (2026-08-18): Atlas redactó el anuncio completo y
      // cerró con "¿Confirmás este borrador? ... Si preferís otra foto,
      // decime y la buscamos". Eso hacía `estaPreguntando = true`, se saltaba
      // la insistencia, y el turno terminaba con CERO borradores guardados
      // pese a que el admin ya había confirmado dos veces. En toda esa
      // conversación no se guardó ni un anuncio.
      //
      // Terminar preguntando es, en los hechos, una salida de emergencia
      // infinita: mientras cierre con una pregunta, nunca tiene que ejecutar.
      // Ahora solo cuenta como pregunta legítima la que pide un dato que el
      // modelo NO puede sacar solo (cuál producto, qué nombre, cuánto
      // presupuesto). Pedir aprobación no lo exime de guardar: para eso está
      // el plan propuesto, que ya le pide confirmación al admin igual.
      const PIDE_DATO_FALTANTE =
        /¿\s*(para |de |con |a |en )?(cu[aá]l|qu[eé]|cu[aá]nto|qui[eé]n|d[oó]nde|c[oó]mo se llama)\b[^?]{0,140}\?/i;
      // "Confirmame cuál es el correcto" es una pregunta legítima aunque no
      // lleve signo de interrogación -- le falta un dato que solo el admin
      // tiene. Se reconoce por el "cuál", que es lo que separa "elegí entre
      // estos" de "¿te gusta lo que escribí?".
      const PIDE_QUE_ELIJA =
        /\b(decime (el|la|cu[aá]l|qu[eé]|c[oó]mo)|(confirmame|decidme|indicame|pasame) cu[aá]l|cu[aá]l (es el|de (los|las|ellos))|necesito que me (digas|pases)|me falta saber|para cu[aá]l|respond[eé] con el n[uú]mero)\b/i;
      const cierreRespuesta = String(finalReplyVerificado || "").slice(-400);
      const estaPreguntando =
        PIDE_DATO_FALTANTE.test(cierreRespuesta) || PIDE_QUE_ELIJA.test(cierreRespuesta);

      if (pidioCrearAlgo && !estaPreguntando && plannedActions.length === 0 && sesionOpencode && modeloUsado && quedaTiempo && !opencodeError) {
        logger.info({ tenantId, sessionId }, "[AtlasOpenCode] Pidió crear algo y no llamó ninguna herramienta -- se insiste una vez");
        progreso("Guardando lo que preparé...");
        try {
          await sendOpencodeMessage(cfg.host, cfg.authHeader, sesionOpencode, {
            system,
            model: modeloUsado,
            tools,
            // El texto viejo le decía "llamá fb_ad_draft" a secas, y por acá
            // eso NO existe: fb_ad_draft es de mutación, así que la única vía
            // es propose_action con tool="fb_ad_draft". Verificado en vivo el
            // 18-08-2026: el modelo terminó proponiendo fb_upload_draft_to_meta
            // con draftId null -- intentando subir a Meta un borrador que
            // nunca había creado, porque nadie le dijo cuál era el paso 1.
            // El camino correcto ahora es `crear_anuncio`, no la cadena vieja.
            //
            // Este texto seguía dictando fb_ad_draft, que obliga al modelo a
            // haber leído el productId y a copiar el copy entero en los
            // argumentos: justo las idas y vueltas que `crear_anuncio` viene a
            // eliminar haciendo el trabajo en el backend. Visto en vivo el
            // 19-08-2026: el turno YA no se corta por tiempo, pero el modelo
            // seguía escribiendo en el chat sin llamar nada porque la
            // insistencia lo mandaba por la ruta larga.
            text:
              "[SISTEMA] Escribiste el anuncio pero NO lo guardaste: no llamaste ninguna herramienta, " +
              "así que del lado del admin no existe nada.\n\n" +
              "Llamá AHORA `propose_action` con:\n" +
              '  tool: "crear_anuncio"\n' +
              '  args: { "producto": "<el nombre del producto tal como lo dijo el admin>", ' +
              '"dailyBudget": <el presupuesto diario que dijo el admin>, ' +
              '"subirAMeta": <true solo si pidió subirlo o publicarlo, si no false> }\n\n' +
              "Reglas de este paso:\n" +
              "- NO necesitás el id del producto ni copiar el copy: `crear_anuncio` busca el producto, arma el brief, " +
              "escribe el texto con los datos reales, lo valida y guarda el borrador. Todo eso lo hace el servidor.\n" +
              "- Si el admin NO dijo un presupuesto, no lo inventes: preguntáselo, es su plata.\n" +
              "- No vuelvas a escribir el copy en el chat ni pidas confirmación otra vez: el sistema ya le muestra " +
              "la propuesta al admin y le pide el sí. Solo hacé la llamada.",
            timeoutMs: Math.max(turnDeadline - Date.now() - 5_000, 15_000),
          });
          plannedActions = await drainDraftPlan(tenantId, turnId);
        } catch (e: any) {
          logger.warn({ tenantId, err: e?.message }, "[AtlasOpenCode] La insistencia falló");
        }

        // Si el candado de arriba ya se activó, la aclaración del cierre dice
        // exactamente esto y con más precisión -- repetirlo son dos avisos
        // seguidos diciendo lo mismo.
        if (plannedActions.length === 0 && !avisarQueNoEjecuto) {
          // Que el admin NO se quede pensando que tiene algo guardado.
          finalReplyVerificado =
            `${finalReplyVerificado}\n\n⚠️ Aviso automático: esto quedó solo como texto en el chat, ` +
            `NO se guardó como borrador en el sistema. Pedímelo de nuevo (por ejemplo "guardá ese anuncio") ` +
            `y lo registro de verdad.`;
        }
      }

      // ── Recién ahora se sabe si quedó algo pendiente ─────────────────────
      // `plannedActions` ya es definitivo: pasó el drenaje inicial, el reseteo
      // por "termina preguntando" y la insistencia. La corrección va ARRIBA y
      // no al final porque puesta abajo el mensaje se contradecía solo -- decía
      // "Borrador guardado:" y dos líneas después "NO se guardó", y el admin
      // lee de arriba hacia abajo y se queda con lo primero.
      if (avisarQueNoEjecuto) {
        finalReplyVerificado = (plannedActions.length > 0
          ? `⚠️ **Todavía no se guardó nada.** Lo de abajo es una PROPUESTA: se ejecuta recién cuando la confirmes.`
          : `⚠️ **Todavía no se guardó nada, y no quedó ninguna acción pendiente de confirmar.** `
            + `Lo de abajo es solo texto: no se creó ni se modificó nada en el sistema. `
            + `Pedímelo de nuevo para que lo registre de verdad.`)
          + `\n\n---\n\n${finalReplyVerificado}`;
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
