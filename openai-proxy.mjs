#!/usr/bin/env node

/**
 * OpenAI Proxy Bridge para EasyPanel
 * 
 * Ejecuta como servicio independiente en EasyPanel.
 * Expone una API compatible con OpenAI en el puerto configurado.
 * 
 * Servicios que lo usan: bot-agenwhatsapp, opencode-clean, etc.
 * 
 * Variables de entorno:
 *   OPENAI_API_KEY     — Tu API key de OpenAI (requerida)
 *   OPENAI_BASE_URL    — URL base de OpenAI (default: https://api.openai.com/v1)
 *   OPENAI_MODEL       — Modelo por defecto (default: gpt-5.6-luna)
 *   PROXY_PORT         — Puerto del proxy (default: 4000)
 *   PROXY_SECRET       — Secret para autenticar requests (opcional)
 */

import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const PROXY_PORT = parseInt(process.env.PROXY_PORT || "4000", 10);
const PROXY_SECRET = process.env.PROXY_SECRET || "";

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is required");
  process.exit(1);
}

console.log(`🚀 OpenAI Proxy starting on port ${PROXY_PORT}`);
console.log(`   Base URL: ${OPENAI_BASE_URL}`);
console.log(`   Default model: ${OPENAI_MODEL}`);
console.log(`   Auth: ${PROXY_SECRET ? "enabled" : "disabled"}`);

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function proxyRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: any
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, OPENAI_BASE_URL);
    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;

    const reqHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      ...headers,
    };

    // Remove proxy-specific headers
    delete reqHeaders["x-proxy-secret"];

    const options: https.RequestOptions = {
      method,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers: reqHeaders,
      timeout: 120000,
    };

    const req = client.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const data = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode || 500, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 500, data: { raw: data } });
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function sendJSON(res: http.ServerResponse, status: number, data: any) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Proxy-Secret");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const path = req.url || "/";

  // Health check
  if (path === "/health" || path === "/") {
    return sendJSON(res, 200, {
      status: "ok",
      service: "openai-proxy",
      model: OPENAI_MODEL,
      timestamp: new Date().toISOString(),
    });
  }

  // Models list
  if (path === "/v1/models" && req.method === "GET") {
    try {
      const result = await proxyRequest("GET", "/v1/models", {});
      return sendJSON(res, result.status, result.data);
    } catch (e: any) {
      return sendJSON(res, 500, { error: e.message });
    }
  }

  // Chat completions
  if (path === "/v1/chat/completions" && req.method === "POST") {
    try {
      // Auth check
      if (PROXY_SECRET) {
        const secret = req.headers["x-proxy-secret"];
        if (secret !== PROXY_SECRET) {
          return sendJSON(res, 401, { error: "Invalid proxy secret" });
        }
      }

      const body = await parseBody(req);
      
      // Apply default model if not specified
      if (!body.model) {
        body.model = OPENAI_MODEL;
      }

      console.log(`📝 Request: model=${body.model}, messages=${body.messages?.length || 0}`);

      const result = await proxyRequest("POST", "/v1/chat/completions", {}, body);
      
      console.log(`✅ Response: status=${result.status}, tokens=${result.data?.usage?.total_tokens || "?"}`);
      
      return sendJSON(res, result.status, result.data);
    } catch (e: any) {
      console.error(`❌ Error: ${e.message}`);
      return sendJSON(res, 500, { error: e.message });
    }
  }

  // Completions (legacy)
  if (path === "/v1/completions" && req.method === "POST") {
    try {
      if (PROXY_SECRET) {
        const secret = req.headers["x-proxy-secret"];
        if (secret !== PROXY_SECRET) {
          return sendJSON(res, 401, { error: "Invalid proxy secret" });
        }
      }

      const body = await parseBody(req);
      if (!body.model) body.model = OPENAI_MODEL;

      const result = await proxyRequest("POST", "/v1/completions", {}, body);
      return sendJSON(res, result.status, result.data);
    } catch (e: any) {
      return sendJSON(res, 500, { error: e.message });
    }
  }

  // Embeddings
  if (path === "/v1/embeddings" && req.method === "POST") {
    try {
      if (PROXY_SECRET) {
        const secret = req.headers["x-proxy-secret"];
        if (secret !== PROXY_SECRET) {
          return sendJSON(res, 401, { error: "Invalid proxy secret" });
        }
      }

      const body = await parseBody(req);
      if (!body.model) body.model = "text-embedding-3-small";

      const result = await proxyRequest("POST", "/v1/embeddings", {}, body);
      return sendJSON(res, result.status, result.data);
    } catch (e: any) {
      return sendJSON(res, 500, { error: e.message });
    }
  }

  // Proxy stats
  if (path === "/stats") {
    return sendJSON(res, 200, {
      service: "openai-proxy",
      baseUrl: OPENAI_BASE_URL,
      defaultModel: OPENAI_MODEL,
      authEnabled: !!PROXY_SECRET,
      uptime: process.uptime(),
    });
  }

  // 404
  sendJSON(res, 404, { error: "Not found", availableEndpoints: ["/health", "/v1/models", "/v1/chat/completions", "/v1/completions", "/v1/embeddings", "/stats"] });
});

server.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(`✅ OpenAI Proxy listening on http://0.0.0.0:${PROXY_PORT}`);
  console.log(`   Endpoints:`);
  console.log(`     GET  /health              — Health check`);
  console.log(`     GET  /v1/models           — List models`);
  console.log(`     POST /v1/chat/completions — Chat completions`);
  console.log(`     POST /v1/completions      — Completions`);
  console.log(`     POST /v1/embeddings       — Embeddings`);
  console.log(`     GET  /stats               — Proxy stats`);
});
