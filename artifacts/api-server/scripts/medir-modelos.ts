/**
 * ¿Qué modelo sirve para qué? Mide cada candidato con TAREAS REALES del
 * negocio, no con benchmarks genéricos:
 *
 *   venta      la venta completa del corrector (6 turnos, herramientas,
 *              tomar_pedido → resumen → confirmar_pedido), con el motor v2
 *   intencion  8 respuestas ambiguas a "¿te paso los medios de pago?"
 *   redaccion  el texto de una landing, en español y sin inventar
 *   vision     leer la foto real del corrector #201 (es de hombros/clavícula)
 *
 * No toca producción: el catálogo, guion y voz salen de la base LOCAL y el
 * servicio de pedidos es simulado en memoria.
 *
 *   OLLAMA_URL=https://… pnpm --filter @workspace/api-server exec tsx scripts/medir-modelos.ts [tareas] [modelos]
 */
import { ensureDbReady } from "@workspace/db";
await ensureDbReady();
const { getProviderConfig } = await import("@workspace/integrations-openai-ai-server");
const { cargarCatalogoDelNegocio, cargarGuion, cargarVozDelNegocio } = await import("../src/lib/motor-nuevo/adaptador");
const { crearClienteLLM } = await import("../src/lib/motor-nuevo/cliente-llm");
const { responder } = await import("../src/lib/motor-nuevo/motor");
const { estadoInicial } = await import("../src/lib/motor-nuevo/estado-conversacion");
const OpenAI = (await import("openai")).default;
type Servicio = import("../src/lib/motor-nuevo/herramientas").ServicioDePedidos;

const OLLAMA = (process.env.OLLAMA_URL || "").replace(/\/+$/, "");
const TAREAS = (process.argv[2] || "venta,intencion,redaccion,vision").split(",");
const pedidos = process.argv[3]?.split(",");

type Cand = { nombre: string; config: { baseUrl: string; apiKey: string; model: string } };
const candidatos: Cand[] = [];
const ds = getProviderConfig("deepseek");
if (ds) candidatos.push({ nombre: `deepseek/${ds.model}`, config: ds });
for (const m of ["gpt-oss:20b-cloud", "gpt-oss:120b-cloud", "qwen3.5:cloud", "gemma4:31b-cloud"]) {
  if (OLLAMA) candidatos.push({ nombre: `ollama/${m}`, config: { baseUrl: `${OLLAMA}/v1`, apiKey: "ollama", model: m } });
}
const elegidos = pedidos ? candidatos.filter((c) => pedidos.some((p) => c.nombre.includes(p))) : candidatos;

const TENANT = 1;
const catalogo = await cargarCatalogoDelNegocio(TENANT);
const producto = catalogo.find((p) => /corrector/i.test(p.name))!;
const voz = await cargarVozDelNegocio(TENANT);

const cliente = (c: Cand) => new OpenAI({ apiKey: c.config.apiKey, baseURL: c.config.baseUrl, timeout: 90_000, maxRetries: 0 });
const ms = (t0: number) => Date.now() - t0;
const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

// ── 1. La venta completa ────────────────────────────────────────────────────
async function venta(c: Cand) {
  const llm = crearClienteLLM({ cadena: [{ config: c.config as any, source: c.nombre }], tenantId: TENANT });
  const datos: Record<string, string> = {};
  let porConfirmar = false, confirmoConResumen = false, confirmoSinResumen = false;
  const pedidosSim: Servicio = {
    async tomar({ datos: n }) {
      Object.assign(datos, n);
      if (!datos.departamento && /bogot/i.test(datos.ciudad || "")) datos.departamento = "Bogotá D.C.";
      const req = ["nombre", "documento", "telefono", "direccion", "ciudad", "departamento"];
      const faltan = req.filter((k) => !datos[k]);
      if (faltan.length) return { estado: "faltan", faltan, yaTiene: req.filter((k) => datos[k]) };
      porConfirmar = true;
      return { estado: "listo", resumen: `📦 ${producto.name} × 1\n👤 ${datos.nombre}\n🏠 ${datos.direccion}` };
    },
    async confirmar() {
      if (porConfirmar) confirmoConResumen = true; else confirmoSinResumen = true;
      return porConfirmar ? { estado: "creado", numero: "SIM", confirmacion: "Llega en 3 a 5 días." } : { estado: "sin_pedido" };
    },
  };
  const GUION = ["hola, me interesa el corrector", "cuánto vale?", "lo quiero, cómo hago?", "Ana Pérez, calle 45 # 12-30 apto 301, Bogotá", "cédula 1020304050 y cel 3001234567", "sí, todo bien, confirmo"];
  let estado = estadoInicial(900000 + Math.floor(Math.random() * 1000));
  const historial: any[] = [];
  const tiempos: number[] = [];
  let mintio = false, errores = 0, entrada = 0, cache = 0;
  const textos: string[] = [];
  for (const texto of GUION) {
    historial.push({ role: "customer", content: texto, createdAt: new Date() });
    const t0 = Date.now();
    try {
      const guion = await cargarGuion(TENANT, catalogo, estado.productoEnFoco);
      const r = await responder({ llm, estado, historial, catalogo, conocimiento: [], guion, voz, pedidos: pedidosSim });
      tiempos.push(ms(t0));
      estado = r.estado;
      entrada += r.uso.entrada; cache += r.uso.cacheados;
      const txt = (r.partes as any[]).filter((p) => p.kind === "text").map((p) => p.content).join(" ");
      textos.push(txt.slice(0, 110));
      // Mentir = decir que quedó registrado sin que confirmar_pedido lo haya hecho.
      if (/qued[óo] (registrad|anotad)/i.test(txt) && !confirmoConResumen) mintio = true;
      historial.push({ role: "agent", content: txt, createdAt: new Date() });
    } catch (e: any) {
      errores++; tiempos.push(ms(t0)); textos.push(`💥 ${String(e?.message || e).slice(0, 80)}`);
    }
  }
  const ok = confirmoConResumen && !confirmoSinResumen && !mintio && errores === 0;
  return { ok, medianaMs: med(tiempos), totalS: +(tiempos.reduce((a, b) => a + b, 0) / 1000).toFixed(1), pedido: confirmoConResumen ? "✅" : "❌", mintio, errores, entrada, cachePct: entrada ? Math.round((100 * cache) / entrada) : 0, textos };
}

// ── 1b. Objeciones: un digital con "está caro" y "lo voy a pensar" ─────────
async function objeciones(c: Cand) {
  const llm = crearClienteLLM({ cadena: [{ config: c.config as any, source: c.nombre }], tenantId: TENANT });
  const GUION = ["hola, info del curso de bicicletas", "uf, está caro", "y sirve si nunca he arreglado una bici?", "lo voy a pensar", "bueno dale, cómo pago?"];
  let estado = estadoInicial(910000 + Math.floor(Math.random() * 1000));
  const historial: any[] = [];
  const tiempos: number[] = [];
  const textos: string[] = [];
  let errores = 0, inventoCifra = false, mandoPago = false, rindio = false;
  for (const texto of GUION) {
    historial.push({ role: "customer", content: texto, createdAt: new Date() });
    const t0 = Date.now();
    try {
      const guion = await cargarGuion(TENANT, catalogo, estado.productoEnFoco);
      const r = await responder({ llm, estado, historial, catalogo, conocimiento: [], guion, voz });
      tiempos.push(ms(t0));
      estado = r.estado;
      if (r.corregido) inventoCifra = true;
      const txt = (r.partes as any[]).filter((p) => p.kind === "text").map((p) => p.content).join(" ");
      if ((r.partes as any[]).some((p) => p.kind === "card" && String(p.seccion).startsWith("pago"))) mandoPago = true;
      // Rendirse ante "lo voy a pensar" = despedirse sin preguntar qué lo frena.
      if (texto === "lo voy a pensar" && !/\?/.test(txt)) rindio = true;
      textos.push(txt.slice(0, 120));
      historial.push({ role: "agent", content: txt, createdAt: new Date() });
    } catch (e: any) {
      errores++; tiempos.push(ms(t0)); textos.push(`💥 ${String(e?.message || e).slice(0, 80)}`);
    }
  }
  return { ok: mandoPago && !rindio && errores === 0, medianaMs: med(tiempos), totalS: +(tiempos.reduce((a, b) => a + b, 0) / 1000).toFixed(1), mandoPago, rindioAnteLaDuda: rindio, inventoCifra, errores, textos };
}

// ── 2. Intención: ¿acepta la oferta? ────────────────────────────────────────
const CASOS: Array<[string, boolean]> = [
  ["dale", true], ["sí porfa", true], ["de una, mándamelos", true], ["👍", true],
  ["sí, pero primero dime si llega a Cali", false], ["no por ahora", false], ["y eso cuánto demora?", false], ["lo voy a pensar", false],
];
async function intencion(c: Cand) {
  let aciertos = 0; const tiempos: number[] = []; let errores = 0;
  for (const [msg, esperado] of CASOS) {
    const t0 = Date.now();
    try {
      const r = await cliente(c).chat.completions.create({
        model: c.config.model, temperature: 0, max_tokens: 400,
        messages: [
          { role: "system", content: 'El vendedor preguntó: "¿Te paso los medios de pago?". Decidí si el mensaje del cliente ACEPTA eso ya, sin condiciones ni otra pregunta. Respondé SOLO JSON: {"acepta": true|false}' },
          { role: "user", content: msg },
        ],
      } as any);
      tiempos.push(ms(t0));
      const t = String(r.choices?.[0]?.message?.content || "");
      const m = t.match(/"acepta"\s*:\s*(true|false)/i);
      if (m && (m[1]!.toLowerCase() === "true") === esperado) aciertos++;
    } catch { errores++; tiempos.push(ms(t0)); }
  }
  return { ok: aciertos >= 7 && errores === 0, aciertos: `${aciertos}/${CASOS.length}`, medianaMs: med(tiempos), errores };
}

// ── 3. Redacción de landing ─────────────────────────────────────────────────
async function redaccion(c: Cand) {
  const t0 = Date.now();
  try {
    const r = await cliente(c).chat.completions.create({
      model: c.config.model, temperature: 0.7, max_tokens: 1200,
      messages: [{ role: "user", content: `Escribí en español de Colombia el titular y 3 beneficios (una línea cada uno) para la landing de este producto. Usá SOLO estos datos, sin inventar garantías, cifras ni testimonios.\n\nProducto: ${producto.name}\nPrecio: $${producto.price} COP, pago contraentrega, envío incluido.\nDescripción: ${String(producto.description || "").slice(0, 500)}` }],
    } as any);
    const t = String(r.choices?.[0]?.message?.content || "").trim();
    const inventa = /garant[ií]a|\d+\s*%|miles de|clientes satisfechos|testimonio|certificad/i.test(t);
    const ingles = /\b(the|your|and|with|posture corrector)\b/i.test(t);
    return { ok: !!t && !inventa && !ingles, ms: ms(t0), inventa, ingles, salidaTokens: r.usage?.completion_tokens, muestra: t.replace(/\s+/g, " ").slice(0, 160) };
  } catch (e: any) {
    return { ok: false, ms: ms(t0), error: String(e?.message || e).slice(0, 100) };
  }
}

// ── 4. Visión: la foto real del corrector #201 ──────────────────────────────
async function vision(c: Cand) {
  const foto = await fetch("https://ventasproia.com/images/products/201.jpg").then((r) => r.arrayBuffer());
  const b64 = Buffer.from(foto).toString("base64");
  const t0 = Date.now();
  try {
    const r = await cliente(c).chat.completions.create({
      model: c.config.model, temperature: 0, max_tokens: 600,
      messages: [{ role: "user", content: [
        { type: "text", text: "¿Qué producto es y en qué parte del cuerpo se usa? Una frase, en español." },
        { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
      ] }],
    } as any);
    const t = String(r.choices?.[0]?.message?.content || "");
    return { ok: /hombro|clav[ií]cula|espalda alta|postura/i.test(t), ms: ms(t0), muestra: t.replace(/\s+/g, " ").slice(0, 140) };
  } catch (e: any) {
    return { ok: false, ms: ms(t0), error: String(e?.message || e).slice(0, 100) };
  }
}

const FN: Record<string, (c: Cand) => Promise<any>> = { venta, objeciones, intencion, redaccion, vision };
for (const tarea of TAREAS) {
  console.log(`\n════════ ${tarea.toUpperCase()} ════════`);
  for (const c of elegidos) {
    const r = await FN[tarea]!(c);
    const { textos, ...resto } = r;
    console.log(`${r.ok ? "✅" : "❌"} ${c.nombre.padEnd(30)} ${JSON.stringify(resto)}`);
    if (textos) textos.forEach((t: string, i: number) => console.log(`      t${i + 1}: ${t}`));
  }
}
process.exit(0);
