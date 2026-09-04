#!/usr/bin/env node
/**
 * Claude Desktop → OpenCode-Clean Bridge (MCP stdio)
 * Expone las herramientas de ventaspro-mcp via HTTP al opencode-clean.
 * En Claude Desktop, agregar como:
 *   "command": ["node", "/root/.local/share/opencode/claude-bridge.mjs"]
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';
import {spawn} from 'node:child_process';
import fs from 'node:fs';

const OC_HOST = process.env.OPENCODE_HOST || 'https://opencode1-opencode-clean.2xs2bu.easypanel.host';
const OC_USER = process.env.OPENCODE_USER || 'opencode';
const OC_PASS = process.env.OPENCODE_PASS || '6715320Dvd';
const MCP_PATH = process.env.MCP_PATH || '/root/.local/share/opencode/ventaspro-mcp.mjs';

// Start ventaspro-mcp as child process
const mcp = spawn('node', [MCP_PATH], {
  env: {...process.env},
  stdio: ['pipe','pipe','pipe']
});

let buf = '';
mcp.stdout.on('data', d => {
  process.stdout.write(d);
});
mcp.stderr.on('data', d => {});

// Forward stdin to child
process.stdin.on('data', d => {
  mcp.stdin.write(d);
});
process.stdin.on('end', () => {
  mcp.stdin.end();
});
mcp.on('close', () => process.exit(0));

// Also expose an HTTP endpoint for external access
import http from 'node:http';

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({status:'ok',service:'claude-bridge',mcp:MCP_PATH}));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      // Forward to opencode-clean
      const auth = Buffer.from(`${OC_USER}:${OC_PASS}`).toString('base64');
      fetch(`${OC_HOST}/api/session`, {
        headers: {'Authorization': `Basic ${auth}`}
      }).then(r => r.json()).then(data => {
        res.writeHead(200, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
        res.end(JSON.stringify({status:'connected',sessions:data.data?.length||0,host:OC_HOST}));
      }).catch(e => {
        res.writeHead(500, {'Content-Type':'application/json'});
        res.end(JSON.stringify({error:e.message}));
      });
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const PORT = process.env.BRIDGE_PORT || 21294;
server.listen(PORT, '0.0.0.0', () => {
  process.stderr.write(`Bridge listening on port ${PORT}\n`);
});
