/**
 * Puente MCP para el cerebro nuevo de Atlas (OpenCode, contenedor `operato`).
 *
 * Implementa JSON-RPC 2.0 sobre HTTP (transporte "Streamable HTTP" de MCP en
 * su forma más simple: un POST por request, sin sesión SSE persistente --
 * no hace falta, el límite de seguridad real de este endpoint es el token de
 * turno, no el concepto de sesión propio de MCP). No se usa el SDK oficial
 * de `@modelcontextprotocol` a propósito: el protocolo es JSON-RPC simple
 * (initialize/tools.list/tools.call) y controlar la implementación entera
 * acá permite verificarla con curl línea por línea, en vez de confiar en el
 * comportamiento exacto de una librería que no se puede inspeccionar en
 * este entorno.
 *
 * Autenticación: el token de turno (ver opencode-turn-token.ts) viaje como
 * query param `?token=...` -- no como header, porque `McpRemoteConfig` (la
 * config que se le manda a OpenCode via POST /mcp) solo acepta `{type,
 * url, enabled}`, sin headers custom. Este endpoint está en el allowlist de
 * rutas públicas de app.ts (bypassa resolveTenant/cookies) precisamente
 * porque tiene esta autenticación propia, igual que los webhooks.
 */
import { Router, type Request, type Response } from "express";
import { verifyTurnToken } from "../lib/opencode-turn-token";
import { buildMcpToolRegistry } from "../lib/opencode-mcp-tools";
import { logger } from "../lib/logger";
import type { OperatorContext } from "../lib/app-operator";

const router = Router();

// Se construye una vez al arrancar el proceso -- executeAction() ya resuelve
// el tenant/lo demás en tiempo de llamada, así que el registro de
// definiciones (nombre/schema/handler) es estático.
const TOOL_REGISTRY = buildMcpToolRegistry();
const TOOL_BY_NAME = new Map(TOOL_REGISTRY.map((t) => [t.name, t]));

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: any;
}

function rpcResult(id: string | number | null | undefined, result: any) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

router.post("/atlas", async (req: Request, res: Response) => {
  const body = req.body as JsonRpcRequest;
  const method = body?.method;
  const id = body?.id;

  // Notificaciones (sin "id") no esperan respuesta -- MCP manda
  // "notifications/initialized" después del handshake, por ejemplo.
  const isNotification = id === undefined;

  try {
    if (method === "initialize") {
      const result = {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "ventaspro-atlas", version: "1.0.0" },
      };
      return res.json(rpcResult(id, result));
    }

    if (method === "notifications/initialized" || method === "ping") {
      if (isNotification) return res.status(202).end();
      return res.json(rpcResult(id, {}));
    }

    // Todo lo que sigue necesita el token de turno -- ya pasó el handshake
    // MCP genérico, pero no puede tocar datos reales sin autenticarse.
    const token = String(req.query.token || "");
    const auth = verifyTurnToken(token);
    if (!auth) {
      if (isNotification) return res.status(401).end();
      return res.status(401).json(rpcError(id, -32001, "Token de turno inválido o vencido"));
    }

    if (method === "tools/list") {
      const tools = TOOL_REGISTRY.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
      return res.json(rpcResult(id, { tools }));
    }

    if (method === "tools/call") {
      const toolName = String(body?.params?.name || "");
      const toolArgs = body?.params?.arguments ?? {};
      const def = TOOL_BY_NAME.get(toolName);
      if (!def) {
        return res.json(rpcResult(id, { content: [{ type: "text", text: `Herramienta desconocida: ${toolName}` }], isError: true }));
      }

      // `turnDeadline` es lo que hace que una herramienta lenta (deep_research
      // sobre todo, ~60-70s por intento real) sepa cuánto tiempo le queda de
      // verdad en ESTE turno. Sin esto se armaba su propio presupuesto fresco
      // de 100s, ajeno al turno que la llamó: en /operator-opencode eso hacía
      // que la herramienta siguiera corriendo del lado del servidor mucho
      // después de que la espera del turno la hubiera abandonado, quemando el
      // turno entero y terminando en un 502 del proxy sin ninguna respuesta
      // (reproducido en vivo, 2026-08-12). El `exp` del token de turno ES el
      // límite real del turno -- se acuña con esa TTL justamente para esto.
      const ctx: OperatorContext & { turnId: string } = {
        tenantId: auth.tenantId,
        sessionId: auth.sessionId,
        turnId: auth.turnId,
        turnDeadline: auth.exp,
      };

      logger.info({ tenantId: auth.tenantId, turnId: auth.turnId, tool: toolName }, "[AtlasMCP] tools/call");
      const result = await def.handler(toolArgs, ctx);
      const text = result.ok
        ? (typeof result.data !== "undefined" ? `${result.summary}\n\n${JSON.stringify(result.data)}` : result.summary)
        : `❌ ${result.summary}`;
      return res.json(rpcResult(id, { content: [{ type: "text", text }], isError: !result.ok }));
    }

    if (isNotification) return res.status(202).end();
    return res.json(rpcError(id, -32601, `Método no soportado: ${method}`));
  } catch (err: any) {
    logger.error({ err, method }, "[AtlasMCP] Error en el puente MCP");
    if (isNotification) return res.status(500).end();
    return res.status(500).json(rpcError(id, -32000, err?.message || "Error interno"));
  }
});

// GET simple de salud, útil para probar que el endpoint responde antes de
// registrar nada en OpenCode.
router.get("/atlas", (_req: Request, res: Response) => {
  res.json({ ok: true, tools: TOOL_REGISTRY.length });
});

export default router;
