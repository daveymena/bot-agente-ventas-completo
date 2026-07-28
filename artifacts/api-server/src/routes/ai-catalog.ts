/**
 * Catálogo de proveedores y modelos de IA para la pantalla de Configuración.
 *
 * Objetivo: que el admin ELIJA modelos de una lista real, en vez de escribir
 * a mano nombres que quizá no existan (era el caso: la pantalla ofrecía
 * "qwen3.6-plus-free" y compañía, que no están en el catálogo de OpenCode).
 *
 * Las claves de los proveedores nuevos se guardan dentro de settings.businessConfig
 * (columna JSON que ya existe), bajo la clave "aiProviders", para no tener que
 * migrar el esquema de la base.
 */
import { Router } from "express";
import { db, settings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { MODELOS_LIBRES, type ModeloLibre } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";
import { cifrar, descifrar, cargarClavesEnEntorno, leerBusinessConfig } from "../lib/ai-keys";
import type { TenantRequest } from "../lib/tenantManager";

const router = Router();

/** Proveedores que la app sabe usar, con dónde se saca la clave. */
const PROVEEDORES = [
  { id: "opencode", nombre: "OpenCode Zen", gratis: true, envKey: "OPENCODE_API_KEY", alta: "https://opencode.ai", nota: "Gratis con rotación automática entre modelos" },
  { id: "groq", nombre: "Groq", gratis: true, envKey: "GROQ_API_KEY", alta: "https://console.groq.com/keys", nota: "Muy rápido · 14.400 peticiones/día" },
  { id: "openrouter", nombre: "OpenRouter", gratis: true, envKey: "OPENROUTER_API_KEY", alta: "https://openrouter.ai/keys", nota: "18 modelos gratis, incluidos los de visión" },
  { id: "google_ai_studio", nombre: "Google AI Studio", gratis: true, envKey: "GOOGLE_API_KEY", alta: "https://aistudio.google.com/apikey", nota: "250k tokens/min · multimodal" },
  { id: "cerebras", nombre: "Cerebras", gratis: true, envKey: "CEREBRAS_API_KEY", alta: "https://cloud.cerebras.ai", nota: "5 req/min · 1M tokens/hora" },
  { id: "cohere", nombre: "Cohere", gratis: true, envKey: "COHERE_API_KEY", alta: "https://dashboard.cohere.com/api-keys", nota: "20 req/min · 1.000 req/mes" },
  { id: "nvidia_nim", nombre: "NVIDIA NIM", gratis: true, envKey: "NVIDIA_API_KEY", alta: "https://build.nvidia.com", nota: "40 req/min · pide verificar teléfono" },
  { id: "github", nombre: "GitHub Models", gratis: true, envKey: "GITHUB_TOKEN", alta: "https://github.com/settings/tokens", nota: "Modelos de Azure con token de GitHub" },
  { id: "mimo", nombre: "Xiaomi MiMo", gratis: false, envKey: "MIMO_API_KEY", alta: "https://platform.xiaomimimo.com/#/console/api-keys", nota: "De pago · 1M de contexto · fuerte en código" },
  { id: "openai", nombre: "OpenAI (ChatGPT)", gratis: false, envKey: "OPENAI_API_KEY", alta: "https://platform.openai.com/api-keys", nota: "GPT · también genera imágenes con DALL·E" },
  { id: "anthropic", nombre: "Anthropic (Claude)", gratis: false, envKey: "ANTHROPIC_API_KEY", alta: "https://console.anthropic.com/settings/keys", nota: "Claude · fuerte razonando y en código" },
  { id: "deepseek", nombre: "DeepSeek", gratis: false, envKey: "DEEPSEEK_API_KEY", alta: "https://platform.deepseek.com/api_keys", nota: "Muy barato · bueno en código y matemáticas" },
  { id: "mistral", nombre: "Mistral", gratis: false, envKey: "MISTRAL_API_KEY", alta: "https://console.mistral.ai/api-keys", nota: "Tiene capa gratuita · pide verificar teléfono" },
  { id: "xai", nombre: "xAI (Grok)", gratis: false, envKey: "XAI_API_KEY", alta: "https://console.x.ai", nota: "Grok · contexto amplio" },
  { id: "together", nombre: "Together AI", gratis: false, envKey: "TOGETHER_API_KEY", alta: "https://api.together.ai/settings/api-keys", nota: "Créditos gratis al registrarse · modelos abiertos" },
  { id: "perplexity", nombre: "Perplexity", gratis: false, envKey: "PERPLEXITY_API_KEY", alta: "https://www.perplexity.ai/settings/api", nota: "Responde buscando en la web, con fuentes" },
  { id: "fireworks", nombre: "Fireworks AI", gratis: false, envKey: "FIREWORKS_API_KEY", alta: "https://fireworks.ai/account/api-keys", nota: "Modelos abiertos, rápido" },
  { id: "deepinfra", nombre: "DeepInfra", gratis: false, envKey: "DEEPINFRA_API_KEY", alta: "https://deepinfra.com/dash/api_keys", nota: "De los más baratos por token" },
  { id: "moonshot", nombre: "Moonshot (Kimi)", gratis: false, envKey: "MOONSHOT_API_KEY", alta: "https://platform.moonshot.ai/console/api-keys", nota: "Contexto muy amplio" },
  { id: "zhipu", nombre: "Zhipu (GLM)", gratis: false, envKey: "ZHIPU_API_KEY", alta: "https://open.bigmodel.cn", nota: "GLM · buena relación precio/calidad" },
  { id: "qwen", nombre: "Alibaba Qwen", gratis: false, envKey: "QWEN_API_KEY", alta: "https://dashscope.console.aliyun.com", nota: "Qwen · multilingüe y multimodal" },
  { id: "nebius", nombre: "Nebius", gratis: false, envKey: "NEBIUS_API_KEY", alta: "https://studio.nebius.com", nota: "Créditos de prueba al registrarse" },
  { id: "sambanova", nombre: "SambaNova", gratis: false, envKey: "SAMBANOVA_API_KEY", alta: "https://cloud.sambanova.ai/apis", nota: "Inferencia muy rápida" },
];

/** Claves guardadas por el admin desde la pantalla (dentro de businessConfig). */
async function leerClavesGuardadas(): Promise<Record<string, { apiKey?: string; model?: string }>> {
  try {
    const [row] = await db.select().from(settings).limit(1);
    return leerBusinessConfig(row?.businessConfig).aiProviders || {};
  } catch {
    return {};
  }
}

/**
 * GET /api/ai/catalog
 * Devuelve cada proveedor con: si tiene clave (del entorno o guardada), sus
 * modelos y el estado real de verificación de cada uno.
 */
router.get("/catalog", async (req: TenantRequest, res, next) => {
  try {
    const guardadas = await leerClavesGuardadas();

    const porProveedor = new Map<string, ModeloLibre[]>();
    for (const m of MODELOS_LIBRES) {
      if (!porProveedor.has(m.proveedor)) porProveedor.set(m.proveedor, []);
      porProveedor.get(m.proveedor)!.push(m);
    }

    const catalogo = PROVEEDORES.map((p) => {
      const enEntorno = !!process.env[p.envKey];
      const guardada = guardadas[p.id];
      return {
        ...p,
        // Nunca se devuelve la clave, solo si existe y de dónde sale.
        tieneClave: enEntorno || !!guardada?.apiKey,
        origenClave: enEntorno ? "entorno" : guardada?.apiKey ? "guardada" : null,
        modeloElegido: guardada?.model || null,
        modelos: (porProveedor.get(p.id) || []).map((m) => ({
          id: m.modelo,
          especialidad: m.especialidad,
          estado: m.estado,
          contexto: m.contexto ?? null,
          nota: m.nota ?? null,
          // Los "vacio" no se pueden elegir: responden 200 sin contenido.
          seleccionable: m.estado !== "vacio",
        })),
      };
    });

    return res.json({ proveedores: catalogo });
  } catch (e) {
    return next(e);
  }
});

/**
 * GET /api/ai/models/:proveedor — pregunta al proveedor QUÉ modelos ofrece.
 *
 * Se consulta en vivo su endpoint /models en vez de fijar aquí una lista: los
 * catálogos cambian y una lista escrita a mano envejece mal (la pantalla
 * llegó a ofrecer modelos que ya no existían).
 */
router.get("/models/:proveedor", async (req: TenantRequest, res, next) => {
  try {
    const proveedor = req.params.proveedor;
    if (!PROVEEDORES.some((p) => p.id === proveedor)) {
      return res.status(400).json({ error: "Proveedor desconocido" });
    }

    const { getProviderConfig } = await import("@workspace/integrations-openai-ai-server");
    const guardadas = await leerClavesGuardadas();
    const base = getProviderConfig(proveedor);
    const guardada = guardadas[proveedor];
    const apiKey = (guardada?.apiKey ? descifrar(guardada.apiKey) : null) || base?.apiKey;
    if (!base?.baseUrl || !apiKey) {
      return res.json({ modelos: [], error: "Configura primero la clave de este proveedor" });
    }

    const url = base.baseUrl.replace(/\/$/, "") + "/models";
    const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!r.ok) {
      return res.json({ modelos: [], error: `El proveedor respondió ${r.status}` });
    }
    const j: any = await r.json();
    // Formato OpenAI: { data: [{ id }] }. Algunos devuelven {models:[...]}.
    const lista: string[] = (j?.data || j?.models || [])
      .map((m: any) => (typeof m === "string" ? m : m?.id || m?.name))
      .filter(Boolean)
      .sort();

    // Se devuelve también la URL consultada: variables de entorno como
    // OPENAI_BASE_URL pueden redirigir un proveedor a otro distinto, y sin
    // esto el admin vería modelos ajenos sin entender por qué.
    return res.json({ modelos: lista, total: lista.length, consultado: base.baseUrl });
  } catch (e: any) {
    return res.json({ modelos: [], error: String(e?.message || e).slice(0, 140) });
  }
});

/**
 * PUT /api/ai/provider — guarda (o borra) la clave y el modelo de un proveedor.
 * Body: { proveedor: string, apiKey?: string, model?: string }
 * Si apiKey viene vacío se elimina la clave guardada.
 */
router.put("/provider", async (req: TenantRequest, res, next) => {
  try {
    const { proveedor, apiKey, model } = req.body || {};
    if (!proveedor || !PROVEEDORES.some((p) => p.id === proveedor)) {
      return res.status(400).json({ error: "Proveedor desconocido" });
    }

    const [row] = await db.select().from(settings).limit(1);
    if (!row) return res.status(404).json({ error: "No hay configuración creada" });

    const cfg = leerBusinessConfig(row.businessConfig);
    cfg.aiProviders = cfg.aiProviders || {};

    const actual = cfg.aiProviders[proveedor] || {};
    if (typeof apiKey === "string") {
      // Se guarda CIFRADA (AES-256-GCM): si alguien lee la base, no la obtiene.
      if (apiKey.trim()) actual.apiKey = cifrar(apiKey.trim());
      else delete actual.apiKey;
    }
    if (typeof model === "string" && model.trim()) actual.model = model.trim();

    if (Object.keys(actual).length === 0) delete cfg.aiProviders[proveedor];
    else cfg.aiProviders[proveedor] = actual;

    // Acotado por id: settings es una fila única, pero sin WHERE un futuro
    // multi-fila haría que esto sobrescribiera todas.
    await db.update(settings).set({ businessConfig: cfg as any }).where(eq(settings.id, row.id));
    // Se vuelca al entorno YA, para que la clave funcione sin reiniciar.
    await cargarClavesEnEntorno();
    logger.info({ proveedor, conClave: !!actual.apiKey, modelo: actual.model }, "[AICatalog] proveedor guardado");

    return res.json({ ok: true, proveedor, tieneClave: !!actual.apiKey, modelo: actual.model || null });
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /api/ai/test — comprueba de verdad que un proveedor responde.
 * Evita el problema de marcar como "funciona" algo que nunca se probó.
 */
router.post("/test", async (req: TenantRequest, res, next) => {
  try {
    const { proveedor, model } = req.body || {};
    const { getProviderConfig, createAIClient } = await import("@workspace/integrations-openai-ai-server");

    const guardadas = await leerClavesGuardadas();
    const base = getProviderConfig(proveedor);
    const guardada = guardadas[proveedor];
    if (!base && !guardada?.apiKey) {
      return res.json({ ok: false, error: "Ese proveedor no tiene clave configurada" });
    }

    const cfg = {
      baseUrl: base?.baseUrl || "",
      // La guardada viene cifrada en la base: hay que descifrarla para usarla.
      apiKey: (guardada?.apiKey ? descifrar(guardada.apiKey) : null) || base?.apiKey || "",
      model: model || guardada?.model || base?.model || "",
    };
    if (!cfg.baseUrl) return res.json({ ok: false, error: "No se pudo resolver la URL del proveedor" });

    const inicio = Date.now();
    try {
      const client = createAIClient(cfg as any);
      const r = await client.chat.completions.create({
        model: cfg.model,
        messages: [{ role: "user", content: "Responde exactamente: OK" }],
        // 2000 y no 20: los modelos de razonamiento gastan el presupuesto
        // "pensando" y devuelven content vacío si se les da poco margen.
        // Con un tope bajo, esta prueba los declaraba rotos sin estarlo.
        max_tokens: 2000,
      });
      const texto = r.choices[0]?.message?.content || "";
      const ms = Date.now() - inicio;
      if (!texto.trim()) {
        return res.json({ ok: false, ms, modelo: cfg.model, error: "Respondió sin contenido (modelo de solo razonamiento)" });
      }
      return res.json({ ok: true, ms, modelo: cfg.model, respuesta: texto.slice(0, 60) });
    } catch (e: any) {
      const msg = String(e?.message || "");
      const agotado = /429|rate.?limit|FreeUsageLimit|quota/i.test(msg);
      return res.json({ ok: false, modelo: cfg.model, agotado, error: agotado ? "Cuota agotada (429) — se restablece más tarde" : msg.slice(0, 140) });
    }
  } catch (e) {
    return next(e);
  }
});

export default router;
