/**
 * ¿Puede otro modelo hacer de Atlas por el camino directo?
 *
 * Corre pedidos reales del admin con EL MISMO prompt, las mismas herramientas
 * y el mismo bucle (`correrTurnoDirecto`) que producción, cambiando solo el
 * modelo. Mide tiempo, qué herramientas pidió, y deja el texto para leerlo.
 *
 * No toca producción ni servicios externos: la base es la LOCAL, y solo las
 * lecturas de la propia base se ejecutan de verdad. Todo lo que hablaría con
 * Meta, Dropi, la web o Telegram devuelve un aviso de "simulado", y
 * `propose_action` solo registra la propuesta (en producción tampoco ejecuta:
 * la deja para que el admin confirme).
 *
 *   OLLAMA_URL=https://… pnpm --filter @workspace/api-server exec tsx scripts/medir-atlas.ts [modelos]
 */
import { ensureDbReady } from "@workspace/db";
await ensureDbReady();
const { getProviderConfig } = await import("@workspace/integrations-openai-ai-server");
const { promptDeAtlas } = await import("../src/lib/app-operator");
const { buildMcpToolRegistry, catalogoDeCapacidades } = await import("../src/lib/opencode-mcp-tools");
const { correrTurnoDirecto } = await import("../src/lib/atlas-directo");

const OLLAMA = (process.env.OLLAMA_URL || "").replace(/\/+$/, "");
const filtro = process.argv[2]?.split(",");

const LOCALES = new Set([
  "list_products", "list_categories", "get_agent", "get_settings", "get_store",
  "ad_brief", "propuesta_campana", "plan_de_contenido", "dashboard_summary",
  "analyze_system", "list_recent_conversations", "marketing_attribution",
]);

const PEDIDOS = [
  "armame el anuncio del corrector de hombros",
  "revisá la landing del corrector postural, ¿está bien?",
  "¿qué productos tienen fotos chicas que Meta rechazaría?",
  "cuántos productos tengo y cuáles son los más caros",
];

type Cand = { nombre: string; baseUrl: string; apiKey: string; modelo: string };
const candidatos: Cand[] = [];
const ds = getProviderConfig("deepseek");
if (ds?.apiKey) candidatos.push({ nombre: "deepseek-v4-flash", baseUrl: "https://api.deepseek.com/chat/completions", apiKey: ds.apiKey, modelo: "deepseek-v4-flash" });
if (OLLAMA) for (const m of ["gemma4:31b-cloud", "gpt-oss:120b-cloud"]) {
  candidatos.push({ nombre: m, baseUrl: `${OLLAMA}/v1/chat/completions`, apiKey: "ollama", modelo: m });
}
const elegidos = filtro ? candidatos.filter((c) => filtro.some((f) => c.nombre.includes(f))) : candidatos;

for (const pedido of PEDIDOS) {
  const reales = buildMcpToolRegistry(pedido);
  const system = promptDeAtlas(pedido) + catalogoDeCapacidades(new Set(reales.map((t) => t.name)));
  for (const c of elegidos) {
    const propuestas: string[] = [];
    const simuladas: string[] = [];
    const herramientas = reales.map((t) => ({
      ...t,
      handler: async (args: any, ctx: any) => {
        if (t.name === "propose_action") {
          propuestas.push(JSON.stringify(args).slice(0, 220));
          return "Propuesta registrada. El admin la verá y confirmará; no se ejecutó nada.";
        }
        if (LOCALES.has(t.name)) return t.handler(args, ctx);
        simuladas.push(t.name);
        throw new Error("servicio no disponible (prueba local: no se llama a servicios externos)");
      },
    }));
    const r = await correrTurnoDirecto({
      system, herramientas, mensaje: pedido,
      ctx: { tenantId: 1, sessionId: "medir-atlas", turnId: `m-${Date.now()}` } as any,
      baseUrl: c.baseUrl, apiKey: c.apiKey, modelo: c.modelo, presupuestoMs: 120_000,
    });
    console.log(`\n══ ${c.nombre} · "${pedido}"`);
    console.log(`   ${(r.ms / 1000).toFixed(1)} s · ${r.vueltas} vueltas · herramientas: ${r.herramientasUsadas.join(", ") || "ninguna"}${r.error ? ` · ❌ ${r.error}` : ""}`);
    if (simuladas.length) console.log(`   simuladas: ${simuladas.join(", ")}`);
    if (propuestas.length) console.log(`   propuso: ${propuestas.join(" | ")}`);
    console.log(`   ── texto (${r.texto.length} car) ──\n${r.texto.slice(0, 900).replace(/^/gm, "   ")}`);
  }
}
process.exit(0);
