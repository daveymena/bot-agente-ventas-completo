#!/usr/bin/env node

/**
 * EasyPanel MCP Server for ChatGPT
 * 
 * Servidor MCP que se conecta a EasyPanel y expone herramientas
 * que ChatGPT puede usar via SSE. La API key NUNCA sale del servidor.
 * 
 * Variables de entorno:
 *   EASYPANEL_URL     — URL de EasyPanel (default: https://144.91.112.79)
 *   EASYPANEL_TOKEN   — Token de API de EasyPanel (requerido)
 *   BOT_URL           — URL del bot (default: http://144.91.112.79:8080)
 *   BOT_EMAIL         — Email del bot (requerido)
 *   BOT_PASSWORD      — Password del bot (requerido)
 *   MCP_PORT          — Puerto del servidor (default: 4001)
 *   MCP_SECRET        — Secret para autenticar conexiones (opcional)
 */

import http from "node:http";
import { URL } from "node:url";

const EASYPANEL_URL = process.env.EASYPANEL_URL || "https://144.91.112.79";
const EASYPANEL_TOKEN = process.env.EASYPANEL_TOKEN;
const BOT_URL = process.env.BOT_URL || "http://144.91.112.79:8080";
const BOT_EMAIL = process.env.BOT_EMAIL || "daveymena16@gmail.com";
const BOT_PASSWORD = process.env.BOT_PASSWORD || "6715320D.";
const MCP_PORT = parseInt(process.env.MCP_PORT || "4001", 10);
const MCP_SECRET = process.env.MCP_SECRET || "";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

if (!EASYPANEL_TOKEN) {
  console.error("EASYPANEL_TOKEN is required");
  process.exit(1);
}

console.log(`EasyPanel MCP Server starting on port ${MCP_PORT}`);
console.log(`  EasyPanel: ${EASYPANEL_URL}`);
console.log(`  Bot: ${BOT_URL}`);

// EasyPanel API
async function epRequest(path, opts = {}) {
  const res = await fetch(`${EASYPANEL_URL}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${EASYPANEL_TOKEN}`, "Content-Type": "application/json", ...opts.headers },
  });
  if (!res.ok) throw new Error(`EP API ${res.status}: ${await res.text()}`);
  return res.json();
}

// Bot login helper
async function botLogin() {
  const res = await fetch(`${BOT_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: BOT_EMAIL, password: BOT_PASSWORD }),
  });
  return res.headers.get("set-cookie")?.split(";")[0] || "";
}

// Tools
const TOOLS = [
  { name: "ep_list_projects", description: "Lista todos los proyectos y servicios en EasyPanel", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "ep_get_service_logs", description: "Obtiene los logs recientes de un servicio", inputSchema: { type: "object", properties: { projectName: { type: "string" }, serviceName: { type: "string" }, limit: { type: "number", default: 50 } }, required: ["projectName", "serviceName"] } },
  { name: "ep_restart_service", description: "Reinicia un servicio en EasyPanel", inputSchema: { type: "object", properties: { projectName: { type: "string" }, serviceName: { type: "string" } }, required: ["projectName", "serviceName"] } },
  { name: "ep_get_service_env", description: "Obtiene las variables de entorno de un servicio (valores sensibles redactados)", inputSchema: { type: "object", properties: { projectName: { type: "string" }, serviceName: { type: "string" } }, required: ["projectName", "serviceName"] } },
  { name: "ep_get_service_status", description: "Obtiene el estado de un servicio", inputSchema: { type: "object", properties: { projectName: { type: "string" }, serviceName: { type: "string" } }, required: ["projectName", "serviceName"] } },
  { name: "ep_list_domains", description: "Lista dominios configurados en EasyPanel", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "ep_get_bot_health", description: "Estado de salud del bot de WhatsApp", inputSchema: { type: "object", properties: {}, required: [] } },
  { name: "ep_get_bot_conversations", description: "Conversaciones activas del bot de WhatsApp", inputSchema: { type: "object", properties: { limit: { type: "number", default: 20 } }, required: [] } },
  { name: "ep_send_message", description: "Envia un mensaje manual a una conversacion del bot", inputSchema: { type: "object", properties: { conversationId: { type: "number" }, message: { type: "string" } }, required: ["conversationId", "message"] } },
];

async function executeTool(name, args) {
  switch (name) {
    case "ep_list_projects": {
      const d = await epRequest("/api/listProjectsAndServices");
      const svcs = d.services || [];
      const projects = new Map();
      for (const s of svcs) { const l = projects.get(s.projectName) || []; l.push({ name: s.name, type: s.type, enabled: s.enabled }); projects.set(s.projectName, l); }
      return { projects: Array.from(projects.entries()).map(([n, s]) => ({ name: n, services: s })) };
    }
    case "ep_get_service_logs": {
      const { projectName, serviceName, limit = 50 } = args;
      return await epRequest(`/api/queryServiceLogs?projectName=${projectName}&serviceName=${serviceName}&limit=${limit}`);
    }
    case "ep_restart_service": {
      const { projectName, serviceName } = args;
      return await epRequest("/api/restartAppService", { method: "POST", body: JSON.stringify({ projectName, serviceName }) });
    }
    case "ep_get_service_env": {
      const { projectName, serviceName } = args;
      const d = await epRequest("/api/listProjectsAndServices");
      const svc = d.services?.find(s => s.projectName === projectName && s.name === serviceName);
      if (!svc) return { error: "Service not found" };
      const env = (svc.env || "").split("\n").filter(Boolean).map(l => { const [k, ...v] = l.split("="); const val = v.join("="); return { key: k, value: /key|token|secret|password/i.test(k) ? "***REDACTED***" : val }; });
      return { projectName, serviceName, env };
    }
    case "ep_get_service_status": {
      const { projectName, serviceName } = args;
      const d = await epRequest("/api/listProjectsAndServices");
      const svc = d.services?.find(s => s.projectName === projectName && s.name === serviceName);
      if (!svc) return { error: "Service not found" };
      return { name: svc.name, project: svc.projectName, enabled: svc.enabled, type: svc.type, ports: svc.ports, domain: svc.primaryDomainId };
    }
    case "ep_list_domains": {
      const d = await epRequest("/api/listProjectsAndServices");
      return { domains: (d.services || []).filter(s => s.primaryDomainId).map(s => ({ service: s.name, project: s.projectName, domainId: s.primaryDomainId })) };
    }
    case "ep_get_bot_health": {
      return (await fetch(`${BOT_URL}/api/health`)).json();
    }
    case "ep_get_bot_conversations": {
      const { limit = 20 } = args;
      const cookie = await botLogin();
      const d = await (await fetch(`${BOT_URL}/api/conversations?limit=${limit}`, { headers: { Cookie: cookie } })).json();
      return { total: d.length, conversations: d.map(c => ({ id: c.id, phone: c.contactPhone, name: c.contactName, lastMessage: c.lastMessage?.substring(0, 100), status: c.status, stage: c.currentStage })) };
    }
    case "ep_send_message": {
      const { conversationId, message } = args;
      const cookie = await botLogin();
      const r = await fetch(`${BOT_URL}/api/conversations/${conversationId}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ content: message }) });
      return { success: r.ok, status: r.status };
    }
    default: return { error: `Unknown tool: ${name}` };
  }
}

// SSE Server
const sessions = new Map();

function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-MCP-Secret");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const url = new URL(req.url || "/", `http://localhost:${MCP_PORT}`);

  // SSE endpoint
  if (url.pathname === "/sse" && req.method === "GET") {
    if (MCP_SECRET) { const s = req.headers["x-mcp-secret"] || url.searchParams.get("secret"); if (s !== MCP_SECRET) { res.writeHead(401); return res.end("Unauthorized"); } }
    const sid = Math.random().toString(36).substring(2, 15);
    console.log(`SSE session: ${sid}`);
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    sessions.set(sid, { res });
    sendSSE(res, "endpoint", { url: `/messages?sessionId=${sid}` });
    sendSSE(res, "tools", { tools: TOOLS });
    req.on("close", () => { sessions.delete(sid); console.log(`Session closed: ${sid}`); });
    return;
  }

  // Messages endpoint
  if (url.pathname === "/messages" && req.method === "POST") {
    const sid = url.searchParams.get("sessionId");
    if (!sid) { res.writeHead(400); return res.end("Missing sessionId"); }
    const session = sessions.get(sid);
    if (!session) { res.writeHead(404); return res.end("Session not found"); }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    console.log(`Message: ${body.method}`);

    if (body.method === "initialize") {
      sendSSE(session.res, "message", { jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "easypanel-mcp", version: "1.0.0" } } });
      res.writeHead(200); return res.end("ok");
    }
    if (body.method === "tools/list") {
      sendSSE(session.res, "message", { jsonrpc: "2.0", id: body.id, result: { tools: TOOLS } });
      res.writeHead(200); return res.end("ok");
    }
    if (body.method === "tools/call") {
      const { name, arguments: a } = body.params;
      try {
        const result = await executeTool(name, a || {});
        sendSSE(session.res, "message", { jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } });
      } catch (e) {
        sendSSE(session.res, "message", { jsonrpc: "2.0", id: body.id, error: { code: -1, message: e.message } });
      }
      res.writeHead(200); return res.end("ok");
    }
    sendSSE(session.res, "message", { jsonrpc: "2.0", id: body.id, error: { code: -32601, message: `Method not found: ${body.method}` } });
    res.writeHead(200); return res.end("ok");
  }

  // Health
  if (url.pathname === "/health") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ status: "ok", service: "easypanel-mcp", sessions: sessions.size, tools: TOOLS.length })); }

  res.writeHead(404); res.end("Not found");
});

server.listen(MCP_PORT, "0.0.0.0", () => {
  console.log(`EasyPanel MCP Server listening on http://0.0.0.0:${MCP_PORT}`);
  console.log(`  SSE: http://0.0.0.0:${MCP_PORT}/sse`);
  console.log(`  Health: http://0.0.0.0:${MCP_PORT}/health`);
});
