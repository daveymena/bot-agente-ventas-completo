#!/usr/bin/env node

/**
 * Smoke test for the EasyPanel MCP Bridge.
 *
 * Usage:
 *   MCP_URL=https://your-domain.example/mcp MCP_SECRET=... node scripts/test-easypanel-mcp.mjs
 */

const MCP_URL = (process.env.MCP_URL || "").replace(/\/$/, "");
const MCP_SECRET = process.env.MCP_SECRET || "";

if (!MCP_URL) throw new Error("MCP_URL is required");
if (!MCP_SECRET) throw new Error("MCP_SECRET is required");

let id = 0;

async function rpc(method, params = undefined, expectEmpty = false) {
  const body = { jsonrpc: "2.0", id: ++id, method };
  if (params !== undefined) body.params = params;

  const response = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MCP_SECRET}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  
  // Notifications return 202 with empty body
  if (expectEmpty || response.status === 202 || text.trim() === "") {
    return null;
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON response, received: ${text.slice(0, 500)}`);
  }

  if (data.error) {
    throw new Error(`JSON-RPC ${data.error.code}: ${data.error.message}`);
  }
  return data.result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log(`Testing MCP endpoint: ${MCP_URL}`);

const init = await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "easypanel-mcp-smoke-test", version: "1.0.0" },
});
assert(init?.serverInfo?.name === "easypanel-mcp-bridge", "Unexpected MCP serverInfo");
console.log(`✓ initialize (${init.protocolVersion})`);

await rpc("notifications/initialized", {}, true);
console.log("✓ notifications/initialized");

const listed = await rpc("tools/list");
const names = (listed?.tools || []).map(tool => tool.name);
const required = [
  "ep_list_projects",
  "ep_get_service_logs",
  "ep_get_service_env",
  "ep_get_service_status",
  "ep_list_domains",
  "ep_get_bot_health",
  "ep_get_bot_conversations",
  "ep_restart_service",
  "ep_send_message",
];

for (const name of required) assert(names.includes(name), `Missing tool: ${name}`);
console.log(`✓ tools/list (${names.length} tools)`);

const call = await rpc("tools/call", {
  name: "ep_list_projects",
  arguments: {},
});
assert(Array.isArray(call?.projects), "ep_list_projects did not return projects[]");
console.log(`✓ tools/call ep_list_projects (${call.projects.length} projects)`);

console.log("\nMCP smoke test PASSED");
