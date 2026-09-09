#!/usr/bin/env node
import http from 'node:http';

const PORT = 21296;
const VP = 'https://ventasproia.com';
const EP = 'https://144.91.112.79';
let vpCookie = null, epToken = null;

const ATLAS_API_TOKEN = process.env.ATLAS_API_TOKEN || '';
const FB_TOKEN = process.env.FB_ACCESS_TOKEN || '';
const TAVILY = process.env.TAVILY_API_KEY || '';
const VP_EMAIL = process.env.VP_EMAIL || '';
const VP_PASSWORD = process.env.VP_PASSWORD || '';
const EP_EMAIL = process.env.EP_EMAIL || '';
const EP_PASSWORD = process.env.EP_PASSWORD || '';

async function vpLogin() {
  const r = await fetch(VP + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: VP_EMAIL, password: VP_PASSWORD })
  });
  const m = (r.headers.get('set-cookie') || '').match(/tenant_id=[^;]+/);
  if (m) vpCookie = m[0];
}

async function epLogin() {
  const r = await fetch(EP + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EP_EMAIL, password: EP_PASSWORD })
  });
  const d = await r.json();
  if (d.token) epToken = d.token;
}

async function vp(path) {
  if (!vpCookie) await vpLogin();
  let r = await fetch(VP + '/api' + path, { headers: { Cookie: vpCookie } });
  if (r.status === 401 || r.status === 403) { await vpLogin(); r = await fetch(VP + '/api' + path, { headers: { Cookie: vpCookie } }); }
  return r.json();
}

async function ep(path) {
  if (!epToken) await epLogin();
  let r = await fetch(EP + '/api' + path, { headers: { Authorization: 'Bearer ' + epToken } });
  if (r.status === 401) { await epLogin(); r = await fetch(EP + '/api' + path, { headers: { Authorization: 'Bearer ' + epToken } }); }
  return r.json();
}

async function handle(tool, args) {
  switch (tool) {
    case 'vp_list_products': return vp('/products');
    case 'vp_get_product': return vp('/products/' + args.id);
    case 'vp_whatsapp_status': return vp('/whatsapp/status');
    case 'vp_whatsapp_metrics': return vp('/whatsapp/metrics');
    case 'vp_fb_status': return vp('/facebook/credentials');
    case 'vp_fb_drafts': return vp('/facebook/strategist/drafts');
    case 'vp_marketing_summary': return vp('/marketing/summary');
    case 'vp_marketing_budget': return vp('/marketing/budget');
    case 'vp_leads': return vp('/leads');
    case 'vp_dashboard_summary': return vp('/dashboard/summary');
    case 'vp_settings': return vp('/settings');
    case 'ep_list_projects': return ep('/listProjects');
    case 'ep_list_services': {
      const d = await ep('/listProjectsAndServices');
      return (d.services || []).map(s => ({ projectName: s.projectName, name: s.name, type: s.type, enabled: s.enabled }));
    }
    case 'web_search': {
      const r = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: TAVILY, query: String(args.query || '').slice(0, 500), max_results: Math.min(Number(args.max_results) || 5, 10), include_answer: true })
      });
      return r.json();
    }
    case 'fb_graph': {
      const url = 'https://graph.facebook.com/v21.0' + args.path + (args.path.includes('?') ? '&' : '?') + 'access_token=' + FB_TOKEN;
      return fetch(url).then(r => r.json());
    }
    default: throw new Error('Unknown tool: ' + tool);
  }
}

const TOOLS = ['vp_list_products','vp_get_product','vp_whatsapp_status','vp_whatsapp_metrics','vp_fb_status','vp_fb_drafts','vp_marketing_summary','vp_marketing_budget','vp_leads','vp_dashboard_summary','vp_settings','ep_list_projects','ep_list_services','web_search','fb_graph'];

const server = http.createServer(async (req, res) => {
  const origin = process.env.ALLOWED_ORIGIN || '';
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET' && req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'ok', tools: TOOLS.length })); return; }
  if (req.method === 'GET' && req.url === '/tools') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ tools: TOOLS })); return; }
  if (req.method === 'POST' && req.url === '/call') {
    if (!ATLAS_API_TOKEN || req.headers.authorization !== `Bearer ${ATLAS_API_TOKEN}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No autorizado' }));
      return;
    }
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const { tool, args } = JSON.parse(body);
        const result = await handle(tool, args || {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, tool, result }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, process.env.HOST || '127.0.0.1', () => console.log('Atlas API on port ' + (process.env.HOST || '127.0.0.1')));
