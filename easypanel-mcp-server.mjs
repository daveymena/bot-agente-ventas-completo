#!/usr/bin/env node

/**
 * EasyPanel MCP Bridge
 *
 * Remote MCP server for ChatGPT. EasyPanel credentials stay inside this
 * container and are never exposed as tool output.
 *
 * Required:
 *   EASYPANEL_TOKEN
 *
 * Recommended:
 *   EASYPANEL_URL=https://your-easypanel-host
 *   MCP_SECRET=<long-random-secret>
 *
 * Optional bot access:
 *   BOT_URL
 *   BOT_SESSION_COOKIE
 *   BOT_EMAIL
 *   BOT_PASSWORD
 *
 * Server:
 *   MCP_PORT=4001
 *   POST /mcp  - Streamable HTTP / JSON-RPC MCP endpoint
 *   GET  /sse  - legacy SSE transport
 *   GET  /health
 */

import http from "node:http";
import { URL } from "node:url";

const EASYPANEL_URL = (process.env.EASYPANEL_URL || "").replace(/\/$/, "");
const EASYPANEL_TOKEN = process.env.EASYPANEL_TOKEN;
const BOT_URL = (process.env.BOT_URL || "").replace(/\/$/, "");
const BOT_SESSION_COOKIE = process.env.BOT_SESSION_COOKIE || "";
const BOT_EMAIL = process.env.BOT_EMAIL || "";
const BOT_PASSWORD = process.env.BOT_PASSWORD || "";
const MCP_PORT = Number.parseInt(process.env.MCP_PORT || "4001", 10);
const MCP_SECRET = process.env.MCP_SECRET || "";
const MAX_BODY_BYTES = 256 * 1024;

if (!EASYPANEL_URL) {
  console.error("EASYPANEL_URL is required");
  process.exit(1);
}
if (!EASYPANEL_TOKEN) {
  console.error("EASYPANEL_TOKEN is required");
  process.exit(1);
}
if (!MCP_SECRET) {
  console.error("MCP_SECRET is required. Generate a long random secret in EasyPanel.");
  process.exit(1);
}

console.log(`EasyPanel MCP Bridge starting on port ${MCP_PORT}`);
console.log(`  EasyPanel: ${EASYPANEL_URL}`);
console.log(`  Bot access: ${BOT_URL ? "configured" : "disabled"}`);

function unauthorized(res) {
  res.writeHead(401, { "Content-Type": "application/json", "WWW-Authenticate": "Bearer" });
  return res.end(JSON.stringify({ error: "Unauthorized" }));
}

function isAuthorized(req) {
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const supplied = bearer || String(req.headers["x-mcp-secret"] || "");
  return supplied.length > 0 && supplied === MCP_SECRET;
}

function safeLimit(value, fallback = 50, max = 200) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.floor(n), max));
}

async function epRequest(path, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${EASYPANEL_URL}${path}`, {
      ...opts,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${EASYPANEL_TOKEN}`,
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`EasyPanel API ${res.status}`);
    try { return JSON.parse(text); } catch { return { raw: text }; }
  } finally {
    clearTimeout(timer);
  }
}

async function botFetch(path, opts = {}) {
  if (!BOT_URL) throw new Error("BOT_URL is not configured");
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (BOT_SESSION_COOKIE) {
    headers.Cookie = BOT_SESSION_COOKIE;
  } else if (BOT_EMAIL && BOT_PASSWORD) {
    const login = await fetch(`${BOT_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: BOT_EMAIL, password: BOT_PASSWORD }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0] || "";
    if (!login.ok || !cookie) throw new Error("Bot authentication failed");
    headers.Cookie = cookie;
  } else {
    throw new Error("Configure BOT_SESSION_COOKIE or BOT_EMAIL/BOT_PASSWORD for bot tools");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(`${BOT_URL}${path}`, { ...opts, headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const TOOLS = [
  {
    name: "ep_list_projects",
    description: "Lista proyectos y servicios visibles en EasyPanel.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "ep_get_service_logs",
    description: "Obtiene logs recientes de un servicio de EasyPanel.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: { type: "object", properties: { projectName: { type: "string" }, serviceName: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 200 } }, required: ["projectName", "serviceName"], additionalProperties: false },
  },
  {
    name: "ep_get_service_env",
    description: "Consulta las variables de un servicio; valores sensibles siempre se redactan.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: { type: "object", properties: { projectName: { type: "string" }, serviceName: { type: "string" } }, required: ["projectName", "serviceName"], additionalProperties: false },
  },
  {
    name: "ep_get_service_status",
    description: "Consulta estado, tipo, puertos y dominio de un servicio.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: { type: "object", properties: { projectName: { type: "string" }, serviceName: { type: "string" } }, required: ["projectName", "serviceName"], additionalProperties: false },
  },
  {
    name: "ep_list_domains",
    description: "Lista dominios asociados a servicios de EasyPanel.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "ep_get_bot_health",
    description: "Consulta la salud del bot de WhatsApp.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "ep_get_bot_conversations",
    description: "Consulta conversaciones del bot sin exponer credenciales.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false },
  },
  {
    name: "ep_restart_service",
    description: "Reinicia un servicio de EasyPanel. Requiere aprobación del usuario en clientes MCP compatibles.",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    inputSchema: { type: "object", properties: { projectName: { type: "string" }, serviceName: { type: "string" } }, required: ["projectName", "serviceName"], additionalProperties: false },
  },
  {
    name: "ep_send_message",
    description: "Envía manualmente un mensaje al bot. Requiere aprobación del usuario.",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    inputSchema: { type: "object", properties: { conversationId: { type: "integer" }, message: { type: "string", minLength: 1, maxLength: 4000 } }, required: ["conversationId", "message"], additionalProperties: false },
  },
];

async function executeTool(name, args = {}) {
  switch (name) {
    case "ep_list_projects": {
      const d = await epRequest("/api/listProjectsAndServices");
      const projects = new Map();
      for (const s of d.services || []) {
        const list = projects.get(s.projectName) || [];
        list.push({ name: s.name, type: s.type, enabled: s.enabled });
        projects.set(s.projectName, list);
      }
      return { projects: Array.from(projects.entries()).map(([name, services]) => ({ name, services })) };
    }
    case "ep_get_service_logs": {
      const p = encodeURIComponent(args.projectName);
      const s = encodeURIComponent(args.serviceName);
      const limit = safeLimit(args.limit);
      return await epRequest(`/api/queryServiceLogs?projectName=${p}&serviceName=${s}&limit=${limit}`);
    }
    case "ep_restart_service": {
      return await epRequest("/api/restartAppService", { method: "POST", body: JSON.stringify({ projectName: args.projectName, serviceName: args.serviceName }) });
    }
    case "ep_get_service_env": {
      const d = await epRequest("/api/listProjectsAndServices");
      const svc = d.services?.find(s => s.projectName === args.projectName && s.name === args.serviceName);
      if (!svc) return { error: "Service not found" };
      const env = String(svc.env || "").split("\n").filter(Boolean).map(line => {
        const [key, ...rest] = line.split("=");
        const value = rest.join("=");
        return { key, value: /key|token|secret|password|cookie|authorization|credential/i.test(key) ? "***REDACTED***" : value };
      });
      return { projectName: args.projectName, serviceName: args.serviceName, env };
    }
    case "ep_get_service_status": {
      const d = await epRequest("/api/listProjectsAndServices");
      const svc = d.services?.find(s => s.projectName === args.projectName && s.name === args.serviceName);
      if (!svc) return { error: "Service not found" };
      return { name: svc.name, project: svc.projectName, enabled: svc.enabled, type: svc.type, ports: svc.ports, domain: svc.primaryDomainId };
    }
    case "ep_list_domains": {
      const d = await epRequest("/api/listProjectsAndServices");
      return { domains: (d.services || []).filter(s => s.primaryDomainId).map(s => ({ service: s.name, project: s.projectName, domainId: s.primaryDomainId })) };
    }
    case "ep_get_bot_health": {
      if (!BOT_URL) throw new Error("BOT_URL is not configured");
      const r = await fetch(`${BOT_URL}/api/health`);
      return await r.json();
    }
    case "ep_get_bot_conversations": {
      const r = await botFetch(`/api/conversations?limit=${safeLimit(args.limit, 20, 100)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(`Bot API ${r.status}`);
      return { total: Array.isArray(d) ? d.length : 0, conversations: (Array.isArray(d) ? d : []).map(c => ({ id: c.id, phone: c.contactPhone, name: c.contactName, lastMessage: c.lastMessage?.substring(0, 100), status: c.status, stage: c.currentStage })) };
    }
    case "ep_send_message": {
      const r = await botFetch(`/api/conversations/${encodeURIComponent(args.conversationId)}/messages`, { method: "POST", body: JSON.stringify({ content: args.message }) });
      return { success: r.ok, status: r.status };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function mcpResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function mcpError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleMcpMessage(body) {
  const id = body.id ?? null;
  switch (body.method) {
    case "initialize":
      return mcpResult(id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "easypanel-mcp-bridge", version: "2.0.0" },
      });
    case "notifications/initialized":
      return null;
    case "ping":
      return mcpResult(id, {});
    case "tools/list":
      return mcpResult(id, { tools: TOOLS });
    case "tools/call": {
      const { name, arguments: args } = body.params || {};
      try {
        const result = await executeTool(name, args || {});
        return mcpResult(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      } catch (error) {
        return mcpResult(id, { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] });
      }
    }
    default:
      return mcpError(id, -32601, `Method not found: ${body.method}`);
  }
}

const sessions = new Map();
function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id, X-MCP-Secret");
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  const url = new URL(req.url || "/", `http://localhost:${MCP_PORT}`);

  if (url.pathname === "/health" && req.method === "GET") {
    return json(res, 200, { status: "ok", service: "easypanel-mcp-bridge", version: "2.0.0", sessions: sessions.size, tools: TOOLS.length });
  }

  if ((url.pathname === "/mcp" || url.pathname === "/sse") && !isAuthorized(req)) {
    return unauthorized(res);
  }

  // Streamable HTTP MCP endpoint. Supports JSON-RPC POST requests and returns
  // application/json for single request/response interactions used by clients.
  if (url.pathname === "/mcp" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const response = await handleMcpMessage(body);
      if (!response) return res.writeHead(202).end();
      return json(res, 200, response, { "MCP-Protocol-Version": "2025-06-18" });
    } catch (error) {
      return json(res, 400, mcpError(null, -32700, error instanceof Error ? error.message : String(error)));
    }
  }

  // Legacy SSE transport retained for clients that explicitly require it.
  if (url.pathname === "/sse" && req.method === "GET") {
    const sid = cryptoRandomId();
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
    sessions.set(sid, { res });
    sendSSE(res, "endpoint", { url: `/messages?sessionId=${encodeURIComponent(sid)}` });
    req.on("close", () => sessions.delete(sid));
    return;
  }

  if (url.pathname === "/messages" && req.method === "POST") {
    if (!isAuthorized(req)) return unauthorized(res);
    const sid = url.searchParams.get("sessionId");
    const session = sid ? sessions.get(sid) : null;
    if (!session) return json(res, 404, { error: "Session not found" });
    try {
      const body = await readBody(req);
      const response = await handleMcpMessage(body);
      if (response) sendSSE(session.res, "message", response);
      return res.writeHead(202).end();
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  return res.writeHead(404).end("Not found");
});

function cryptoRandomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

server.listen(MCP_PORT, "0.0.0.0", () => {
  console.log(`EasyPanel MCP Bridge listening on 0.0.0.0:${MCP_PORT}`);
  console.log(`  MCP:  /mcp`);
  console.log(`  SSE:  /sse`);
  console.log(`  Health: /health`);
});
