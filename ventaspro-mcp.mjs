#!/usr/bin/env node
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import fs from 'node:fs';
const VP = (process.env.VENTASPRO_BASE_URL || 'https://ventasproia.com').replace(/\/+$/, '');
const EP = (process.env.EASYPANEL_URL || 'https://144.91.112.79').replace(/\/+$/, '');
const TAVILY_KEY = process.env.TAVILY_API_KEY || '';
const FB_TOKEN = process.env.FACEBOOK_SYSTEM_TOKEN || '';
const state = { vpCookie: null, vpLoginAt: 0, epToken: null };
let vpLock = null, epLock = null;
const CACHE = '/root/.local/share/opencode/.vp-session.json';
try { const c = JSON.parse(fs.readFileSync(CACHE, 'utf8')); if (c.cookie && Date.now() - c.at < 25*86400000) { state.vpCookie = c.cookie; state.vpLoginAt = c.at; } } catch {}
async function http(url, opts = {}, auth = 'none') {
  const h = { ...(opts.headers || {}) };
  if (auth === 'vp' && state.vpCookie) h.Cookie = state.vpCookie;
  if (auth === 'ep' && state.epToken) h.Authorization = `Bearer ${state.epToken}`;
  if (opts.body && typeof opts.body !== 'string') { h['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.body); }
  const r = await fetch(url, { ...opts, headers: h });
  const t = await r.text();
  let b; try { b = t ? JSON.parse(t) : null; } catch { b = t; }
  if (!r.ok) { const e = new Error(`${r.status} ${r.statusText}${b && (b.error||b.message) ? ' — '+(b.error||b.message) : ''}`); e.status = r.status; throw e; }
  return b;
}
async function vpLogin() {
  const { VENTASPRO_EMAIL: email, VENTASPRO_PASSWORD: password } = process.env;
  if (!email || !password) throw new Error('Falta VENTASPRO_EMAIL/_PASSWORD');
  const r = await fetch(`${VP}/api/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email,password}) });
  const m = (r.headers.get('set-cookie')||'').match(/tenant_id=[^;]+/);
  const b = await r.json().catch(()=>null);
  if (!r.ok||!m) throw new Error(`Login VP fallo: ${r.status} ${b?.error||b?.message||''}`);
  state.vpCookie = m[0]; state.vpLoginAt = Date.now();
  try { fs.writeFileSync(CACHE, JSON.stringify({ cookie: state.vpCookie, at: Date.now() })); } catch {}
}
async function vp(path, opts = {}) {
  if (!state.vpCookie || Date.now()-state.vpLoginAt > 12*3600000) { if (!vpLock) vpLock = vpLogin().finally(()=>{vpLock=null;}); await vpLock; }
  try { return await http(`${VP}/api${path}`, opts, 'vp'); }
  catch (e) { if (e.status===401||e.status===403) { await vpLogin(); return http(`${VP}/api${path}`, opts, 'vp'); } throw e; }
}
async function epLogin() {
  const { EASYPANEL_EMAIL: email, EASYPANEL_PASSWORD: password } = process.env;
  if (!email || !password) throw new Error('Falta EASYPANEL_EMAIL/_PASSWORD');
  const b = await http(`${EP}/api/login`, { method:'POST', body:{email,password} });
  if (!b?.token) throw new Error('Login EP fallo');
  state.epToken = b.token;
}
async function ep(path, opts = {}) {
  if (!state.epToken) { if (!epLock) epLock = epLogin().finally(()=>{epLock=null;}); await epLock; }
  try { return await http(`${EP}/api${path}`, opts, 'ep'); }
  catch (e) { if (e.status===401) { await epLogin(); return http(`${EP}/api${path}`, opts, 'ep'); } throw e; }
}
function htmlToText(h) { return h.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim(); }
const T = (n,d,p={},r=[])=>({name:n,description:d,inputSchema:{type:'object',properties:p,required:r}});
const TOOLS = [
  T('web_search','Busqueda web (Tavily).',{query:{type:'string'},max_results:{type:'number'}},['query']),
  T('web_fetch','Descarga URL como texto.',{url:{type:'string'}},['url']),
  T('web_research','Investiga un tema: busca + resume con fuentes.',{topic:{type:'string'},max_results:{type:'number'}},['topic']),
  T('vp_list_products','Lista productos del catalogo.'),
  T('vp_get_product','Detalle de un producto.',{id:{type:'number'}},['id']),
  T('vp_list_categories','Lista categorias.'),
  T('vp_whatsapp_status','Estado de WhatsApp.'),
  T('vp_whatsapp_metrics','Metricas de WhatsApp.'),
  T('vp_fb_status','Estado de Facebook Ads.'),
  T('vp_fb_validate','Valida conexion con Facebook.'),
  T('vp_fb_campaigns','Lista campanas de Facebook.'),
  T('vp_fb_ad_library','Busca en la biblioteca de anuncios.',{search:{type:'string'}},['search']),
  T('vp_fb_suggest_audience','Sugiere audiencia para un producto.',{productId:{type:'number'}},['productId']),
  T('vp_fb_create_ad','Crea anuncio real (gasta!).',{productId:{type:'number'},budget:{type:'number'},targeting:{type:'object'}},['productId','budget']),
  T('vp_fb_sync_catalog','Sincroniza catalogo con Facebook.'),
  T('vp_fb_drafts','Lista borradores de anuncios.'),
  T('vp_fb_create_draft','Crea borrador (PAUSED).',{productId:{type:'number'}},['productId']),
  T('vp_fb_create_draft_all','Crea borradores para todos los productos.'),
  T('vp_fb_update_draft','Edita un borrador.',{id:{type:'number'},patch:{type:'object'}},['id','patch']),
  T('vp_fb_delete_draft','Elimina un borrador.',{id:{type:'number'}},['id']),
  T('vp_fb_publish_draft','Publica un borrador en FB.',{id:{type:'number'}},['id']),
  T('vp_fb_draft_insights','Metricas de un borrador.',{id:{type:'number'},datePreset:{type:'string'}},['id']),
  T('vp_fb_agent_logs','Historial del agente de anuncios.'),
  T('vp_fb_agent_run_now','Ejecuta revision del agente.'),
  T('vp_marketing_summary','Resumen de marketing (funnel, equipo, presupuesto).'),
  T('vp_marketing_attribution','Atribucion por anuncio.',{days:{type:'number'}}),
  T('vp_marketing_tasks','Tareas de marketing.'),
  T('vp_marketing_experiments','Experimentos A/B.'),
  T('vp_marketing_learnings','Memoria del orquestador.'),
  T('vp_marketing_audit','Auditoria de campanas.',{limit:{type:'number'}}),
  T('vp_marketing_budget','Estado del presupuesto.'),
  T('vp_marketing_chat','Habla con el orquestador.',{message:{type:'string'}},['message']),
  T('vp_leads','Lista de leads.'),
  T('vp_get_lead','Detalle de un lead.',{id:{type:'number'}},['id']),
  T('vp_conversations','Conversaciones de WhatsApp.'),
  T('vp_dashboard_summary','Resumen del dashboard.'),
  T('vp_dashboard_funnel','Embudo de conversion.'),
  T('vp_settings','Configuracion del negocio.'),
  T('ep_list_projects','Lista proyectos de EasyPanel.'),
  T('ep_list_services','Lista servicios con estado.'),
  T('ep_get_service_env','Env de un servicio.',{projectName:{type:'string'},serviceName:{type:'string'}},['projectName','serviceName']),
  T('ep_get_logs','Logs de un servicio.',{projectName:{type:'string'},serviceName:{type:'string'}},['projectName','serviceName']),
  T('ep_restart_service','Reinicia un servicio.',{projectName:{type:'string'},serviceName:{type:'string'}},['projectName','serviceName']),
  T('ep_deploy_service','Despliega un servicio.',{projectName:{type:'string'},serviceName:{type:'string'}},['projectName','serviceName']),
  T('fb_graph','Consulta directa a Facebook Graph API.',{path:{type:'string'}},['path']),
];
async function findSvc(pn,sn) { const r=await ep('/listProjectsAndServices'); return (r?.services||[]).find(s=>s.projectName===pn&&s.name===sn); }
async function execute(name, args={}) {
  let r;
  switch(name) {
    case 'web_search': r=await http('https://api.tavily.com/search',{method:'POST',body:{api_key:TAVILY_KEY,query:args.query,max_results:args.max_results||5,search_depth:'basic',include_answer:true}}); break;
    case 'web_fetch': case 'web_scrape': { const t=await (await fetch(args.url,{headers:{'User-Agent':'Mozilla/5.0'}})).text(); r=htmlToText(t); break; }
    case 'web_research': { const t=await http('https://api.tavily.com/search',{method:'POST',body:{api_key:TAVILY_KEY,query:args.topic,max_results:args.max_results||5,include_answer:true}}); r={answer:t.answer,results:(t.results||[]).map(x=>({title:x.title,url:x.url,snippet:(x.content||'').slice(0,300)}))}; break; }
    case 'vp_list_products': { const p=await vp('/products'); r=(Array.isArray(p)?p:[]).map(x=>({id:x.id,name:x.name,price:x.price,category:x.category,kind:x.kind})); break; }
    case 'vp_get_product': r=await vp(`/products/${args.id}`); break;
    case 'vp_list_categories': r=await vp('/categories'); break;
    case 'vp_whatsapp_status': r=await vp('/whatsapp/status'); break;
    case 'vp_whatsapp_metrics': r=await vp('/whatsapp/metrics'); break;
    case 'vp_fb_status': r=await vp('/facebook/credentials'); break;
    case 'vp_fb_validate': r=await vp('/facebook/validate'); break;
    case 'vp_fb_campaigns': r=await vp('/facebook/campaigns'); break;
    case 'vp_fb_ad_library': r=await vp(`/facebook/ad-library?search=${encodeURIComponent(args.search)}`); break;
    case 'vp_fb_suggest_audience': r=await vp(`/facebook/suggest-audience/${args.productId}`); break;
    case 'vp_fb_create_ad': r=await vp(`/facebook/create-ad/${args.productId}`,{method:'POST',body:{budget:args.budget,targeting:args.targeting||{}}}); break;
    case 'vp_fb_sync_catalog': r=await vp('/facebook/sync-catalog',{method:'POST',body:{}}); break;
    case 'vp_fb_drafts': r=await vp('/facebook/strategist/drafts'); break;
    case 'vp_fb_create_draft': r=await vp(`/facebook/strategist/draft/${args.productId}`,{method:'POST',body:{}}); break;
    case 'vp_fb_create_draft_all': r=await vp('/facebook/strategist/draft-all',{method:'POST',body:{}}); break;
    case 'vp_fb_update_draft': r=await vp(`/facebook/strategist/draft/${args.id}`,{method:'PUT',body:args.patch}); break;
    case 'vp_fb_delete_draft': r=await vp(`/facebook/strategist/draft/${args.id}`,{method:'DELETE'}); break;
    case 'vp_fb_publish_draft': r=await vp(`/facebook/strategist/draft/${args.id}/publish`,{method:'POST',body:{}}); break;
    case 'vp_fb_draft_insights': r=await vp(`/facebook/strategist/draft/${args.id}/insights?datePreset=${args.datePreset||'last_7d'}`); break;
    case 'vp_fb_agent_logs': r=await vp('/facebook/agent/logs'); break;
    case 'vp_fb_agent_run_now': r=await vp('/facebook/agent/run-now',{method:'POST',body:{}}); break;
    case 'vp_marketing_summary': r=await vp('/marketing/summary'); break;
    case 'vp_marketing_attribution': r=await vp(`/marketing/attribution?days=${args.days||30}`); break;
    case 'vp_marketing_tasks': r=await vp('/marketing/tasks'); break;
    case 'vp_marketing_experiments': r=await vp('/marketing/experiments'); break;
    case 'vp_marketing_learnings': r=await vp('/marketing/learnings'); break;
    case 'vp_marketing_audit': r=await vp(`/marketing/audit?limit=${args.limit||30}`); break;
    case 'vp_marketing_budget': r=await vp('/marketing/budget'); break;
    case 'vp_marketing_chat': r=await vp('/marketing/chat',{method:'POST',body:{message:args.message}}); break;
    case 'vp_leads': r=await vp('/leads'); break;
    case 'vp_get_lead': r=await vp(`/leads/${args.id}`); break;
    case 'vp_conversations': r=await vp('/conversations'); break;
    case 'vp_dashboard_summary': r=await vp('/dashboard/summary'); break;
    case 'vp_dashboard_funnel': r=await vp('/dashboard/funnel'); break;
    case 'vp_settings': r=await vp('/settings'); break;
    case 'ep_list_projects': r=await ep('/listProjects'); break;
    case 'ep_list_services': { const s=await ep('/listProjectsAndServices'); r=(s?.services||[]).map(x=>({projectName:x.projectName,name:x.name,type:x.type,enabled:x.enabled})); break; }
    case 'ep_get_service_env': { const s=await findSvc(args.projectName,args.serviceName); r=s?(s.env||'(sin env)'):{error:'no encontrado'}; break; }
    case 'ep_get_logs': r=await ep(`/queryServiceLogs?projectName=${encodeURIComponent(args.projectName)}&serviceName=${encodeURIComponent(args.serviceName)}&limit=100&stream=stdout`); break;
    case 'ep_restart_service': r=await ep('/restartAppService',{method:'POST',body:{projectName:args.projectName,serviceName:args.serviceName}}); break;
    case 'ep_deploy_service': r=await ep('/deployAppService',{method:'POST',body:{projectName:args.projectName,serviceName:args.serviceName}}); break;
    case 'fb_graph': if(!FB_TOKEN) throw new Error('Falta FACEBOOK_SYSTEM_TOKEN'); r=await http(`https://graph.facebook.com/v21.0${args.path}${args.path.includes('?')?'&':'?'}access_token=${FB_TOKEN}`); break;
    default: throw new Error(`Tool desconocida: ${name}`);
  }
  return { content:[{type:'text',text:typeof r==='string'?r:JSON.stringify(r,null,2)}] };
}
let buf='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',c=>{buf+=c;while(true){const i=buf.indexOf('\r\n\r\n');if(i===-1)break;const h=buf.substring(0,i);const m=h.match(/Content-Length:\s*(\d+)/i);if(!m){buf=buf.substring(i+4);continue;}const l=parseInt(m[1]);const s=i+4;if(buf.length<s+l)break;const b=buf.substring(s,s+l);buf=buf.substring(s+l);try{handle(JSON.parse(b));}catch(e){console.error('parse err',e.message);}}});
process.stdin.on('end',()=>process.exit(0));
function send(o){const b=JSON.stringify(o);process.stdout.write(`Content-Length: ${Buffer.byteLength(b)}\r\n\r\n${b}`);}
function handle(msg){
  if(msg.method==='initialize')send({jsonrpc:'2.0',id:msg.id,result:{protocolVersion:'2024-11-05',capabilities:{tools:{listChanged:true}},serverInfo:{name:'ventaspro-mcp',version:'1.0.0'}}});
  else if(msg.method==='notifications/initialized'){}
  else if(msg.method==='tools/list')send({jsonrpc:'2.0',id:msg.id,result:{tools:TOOLS}});
  else if(msg.method==='tools/call'){const n=msg.params?.name;const a=msg.params?.arguments||{};execute(n,a).then(r=>send({jsonrpc:'2.0',id:msg.id,result:r})).catch(e=>send({jsonrpc:'2.0',id:msg.id,error:{code:-32000,message:String(e.message||e)}}));}
  else send({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:`Metodo no encontrado: ${msg.method}`}});
}
