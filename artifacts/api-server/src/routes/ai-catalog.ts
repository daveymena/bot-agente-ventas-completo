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
import { secretoNuevo } from "../lib/secretos";
import { Router } from "express";
import { db, settings } from "@workspace/db";
import { eq } from "drizzle-orm";
import { MODELOS_LIBRES, type ModeloLibre } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";
import { cifrar, descifrar, cargarClavesEnEntorno, leerBusinessConfig } from "../lib/ai-keys";
import { sincronizarProveedorConOpencode, sincronizarTodasLasClavesConOpencode } from "../lib/opencode-provider-sync";
import type { TenantRequest } from "../lib/tenantManager";
import { GITHUB_MODELS_RETIRADO, modelosDeCopilot, modelosCopilotEnAtlas, tokensCopilotGuardados, sesionCopilotGuardada } from '../lib/copilot-modelos';

const router = Router();

/** Proveedores que la app sabe usar, con dónde se saca la clave. */
export const PROVEEDORES = [
  { id: "opencode", nombre: "OpenCode Zen", gratis: true, envKey: "OPENCODE_API_KEY", alta: "https://opencode.ai", nota: "Gratis con rotación automática entre modelos" },
  { id: "opencode_go", nombre: "OpenCode Go", gratis: false, envKey: "OPENCODE_GO_API_KEY", alta: "https://opencode.ai", nota: "De pago · sin cuota diaria · requiere método de pago en el workspace" },
  { id: "groq", nombre: "Groq", gratis: true, envKey: "GROQ_API_KEY", alta: "https://console.groq.com/keys", nota: "Muy rápido · 14.400 peticiones/día" },
  { id: "openrouter", nombre: "OpenRouter", gratis: true, envKey: "OPENROUTER_API_KEY", alta: "https://openrouter.ai/keys", nota: "18 modelos gratis, incluidos los de visión" },
  { id: "google_ai_studio", nombre: "Google AI Studio", gratis: true, envKey: "GOOGLE_API_KEY", alta: "https://aistudio.google.com/apikey", nota: "250k tokens/min · multimodal" },
  { id: "cerebras", nombre: "Cerebras", gratis: true, envKey: "CEREBRAS_API_KEY", alta: "https://cloud.cerebras.ai", nota: "5 req/min · 1M tokens/hora" },
  { id: "cohere", nombre: "Cohere", gratis: true, envKey: "COHERE_API_KEY", alta: "https://dashboard.cohere.com/api-keys", nota: "20 req/min · 1.000 req/mes" },
  { id: "nvidia_nim", nombre: "NVIDIA NIM", gratis: true, envKey: "NVIDIA_API_KEY", alta: "https://build.nvidia.com", nota: "40 req/min · pide verificar teléfono" },
  // Ollama en la NUBE: los modelos corren del lado de ellos, así que no gasta
  // RAM del servidor. La capa gratis va por cuota de uso, no por token: cuando
  // se agota corta hasta que rota la ventana, así que sirve de respaldo y no
  // como proveedor principal.
  { id: "ollama_cloud", nombre: "Ollama Cloud", gratis: true, envKey: "OLLAMA_CLOUD_API_KEY", alta: "https://ollama.com/settings/keys", nota: "Modelos grandes · cuota diaria gratis · el catálogo rota" },
  { id: "github", nombre: "GitHub Models (retirado)", gratis: true, envKey: "GITHUB_TOKEN", alta: "https://docs.github.com/en/github-models", nota: GITHUB_MODELS_RETIRADO },
  { id: "github_copilot_internal", nombre: "GitHub Copilot", gratis: false, envKey: "GITHUB_COPILOT_TOKEN", alta: "https://github.com/settings/copilot", nota: "Conecta tu cuenta por código de dispositivo. Los modelos dependen de tu plan y políticas." },
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
  // Puente del dueño (2026-10-06): la key se crea en la extensión de VS Code,
  // no en el dashboard (el botón "Create key" web está deshabilitado).
  { id: "excelnt", nombre: "Excelnt", gratis: false, envKey: "EXCELNT_API_KEY", alta: "https://excelnt.ai/dashboard/api-keys", nota: "Gateway OpenAI-compatible · key desde la extensión de VS Code" },
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
/**
 * ¿Esta request es la del dueño del sistema?
 *
 * No alcanza con `isAdmin`: en este deploy el tenant del dueño (`sofia-premium`,
 * id 1) lo tiene en false -- verificado en producción -- así que tratarlo como
 * un cliente más le mandaba SUS claves a `tenants.apiKeys` en vez de a la
 * configuración global. Y la global no es un lugar cualquiera: es la que se
 * vuelca a `process.env` y de ahí la leen Atlas y la sincronización con
 * OpenCode. O sea que el dueño guardaba una clave, la pantalla decía que sí, y
 * su propio operador no la veía.
 *
 * Se identifica con PLATFORM_TENANT_ID (por defecto 1, el tenant original del
 * deploy), o con isAdmin para cuando eso quede bien marcado.
 */
function esDuenoDelSistema(req: TenantRequest): boolean {
  if (req.tenant?.isAdmin) return true;
  const dueno = Number(process.env.PLATFORM_TENANT_ID || 1);
  return !!req.tenant?.id && req.tenant.id === dueno;
}

router.get("/catalog", async (req: TenantRequest, res, next) => {
  try {
    const globales = await leerClavesGuardadas();
    const [fila] = await db.select().from(settings).limit(1);

    // Un cliente ve LO SUYO, no lo del sistema. Si no ve lo suyo, la pantalla
    // le miente dos veces: le muestra como propia una clave que no es y le
    // esconde que la que él cargó sí quedó guardada.
    const tenantId = req.tenant?.id;
    const propias = tenantId && !esDuenoDelSistema(req)
      ? await (await import("../lib/ai-keys-tenant")).clavesDelTenant(tenantId)
      : {};
    // Las del cliente ganan; las globales quedan como respaldo visible.
    const guardadas: Record<string, any> = { ...globales };
    for (const [prov, datos] of Object.entries(propias)) {
      if (datos?.apiKey) guardadas[prov] = { apiKey: datos.apiKey, model: datos.model };
    }

    const porProveedor = new Map<string, ModeloLibre[]>();
    for (const m of MODELOS_LIBRES) {
      if (!porProveedor.has(m.proveedor)) porProveedor.set(m.proveedor, []);
      porProveedor.get(m.proveedor)!.push(m);
    }

    const catalogo = PROVEEDORES.map((p) => {
      const enEntorno = !!process.env[p.envKey] || (p.id === 'github_copilot_internal' && tokensCopilotGuardados(fila, process.env).length > 0);
      const guardada = guardadas[p.id];
      return {
        ...p,
        retirado: p.id === 'github',
        // Nunca se devuelve la clave, solo si existe y de dónde sale.
        tieneClave: enEntorno || !!guardada?.apiKey,
        // "guardada" tiene prioridad en el chequeo: cargarClavesEnEntorno()
        // vuelca la clave guardada AL entorno del proceso, así que para el
        // momento en que esto se lee, process.env[envKey] también es true
        // cuando la fuente real fue la base -- sin este orden, el admin vería
        // "entorno" (como si fuera la clave de fábrica del servidor) incluso
        // después de guardar la suya propia, que es justamente la que se está
        // usando de verdad.
        origenClave: guardada?.apiKey ? "guardada" : enEntorno ? "entorno" : null,
        modeloElegido: (p.id === 'github_copilot_internal' ? fila?.githubModel : guardada?.model) || null,
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

    // Qué IA está ACTIVA para Atlas hoy: el admin la cambia con el botón de
    // la tarjeta (PUT /api/ai/active) y el agente la lee en agent.ts.
    const activa = fila?.aiProvider || null;
    const activaModelo = activa
      ? (activa === 'github_copilot_internal' ? fila?.githubModel : leerBusinessConfig(fila!.businessConfig).aiProviders?.[activa]?.model) || null
      : null;

    return res.json({ proveedores: catalogo, activa, activaModelo });
  } catch (e) {
    return next(e);
  }
});

/**
 * Proveedores cuyo /models responde sin clave. Solo la RAÍZ, para no depender
 * de que haya configuración cargada.
 */
const CATALOGO_PUBLICO: Record<string, string> = {
  ollama_cloud: "https://ollama.com/v1",
};

/** Los GPT-5+ / Luna rechazan `max_tokens` (400 unsupported_parameter): hay
 *  que mandar `max_completion_tokens`. Mismo criterio que el agente y el forge. */
function usaCompletionTokens(modelo: string): boolean {
  return /gpt-[5-9]|gpt-6|luna/i.test(modelo || "");
}

/**
 * Prueba REAL si un modelo sirve para chat. Devuelve null si esta bien o si el
 * fallo no tiene que ver con el modelo (429, red): eso no debe bloquear
 * guardarlo. Devuelve el motivo en español SOLO cuando el modelo esta roto,
 * para que la pantalla no deje guardar una opcion que nunca va a responder
 * (le paso al admin con gpt-5.2-pro-2025-12-11: 404 "not a chat model").
 */
async function motivoDeModeloRoto(proveedor: string, apiKey: string | null, model: string): Promise<string | null> {
  if (!apiKey || !model) return null;
  try {
    const { getProviderConfig, createAIClient } = await import("@workspace/integrations-openai-ai-server");
    const base = getProviderConfig(proveedor);
    const url = base?.baseUrl || "";
    if (!url) return null;
    try {
      await createAIClient({ baseUrl: url, apiKey, model, defaultHeaders: base?.defaultHeaders } as any).chat.completions.create({
        model,
        messages: [{ role: "user", content: "ok" }],
        ...(usaCompletionTokens(model) ? { max_completion_tokens: 16 } : { max_tokens: 16 }),
      });
      return null;
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (/not a chat model|model_not_found|does not exist|not found in model|invalid model/i.test(msg)) {
        return `El modelo "${model}" no sirve para chat con la API (${msg.slice(0, 150)}). Elegi otro de la lista: por ejemplo gpt-5.6-luna o gpt-4o-mini.`;
      }
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * GET /api/ai/models/:proveedor — pregunta al proveedor QUÉ modelos ofrece.
 *
 * Se consulta en vivo su endpoint /models en vez de fijar aquí una lista: los
 * catálogos cambian y una lista escrita a mano envejece mal (la pantalla
 * llegó a ofrecer modelos que ya no existían).
 */
router.get("/models/:proveedor", async (req: TenantRequest, res, next) => {
  try {
    const proveedor = String(req.params.proveedor);
    if (proveedor === 'github') return res.status(410).json({ modelos: [], error: GITHUB_MODELS_RETIRADO });
    if (!PROVEEDORES.some((p) => p.id === proveedor)) {
      return res.status(400).json({ error: "Proveedor desconocido" });
    }

    const { getProviderConfig } = await import("@workspace/integrations-openai-ai-server");
    if (proveedor === 'github_copilot_internal') {
      if (!esDuenoDelSistema(req)) return res.status(403).json({ modelos: [], error: 'La conexión de Copilot la administra el dueño de la plataforma.' });
      const [fila] = await db.select().from(settings).limit(1);
      const base = getProviderConfig(proveedor);
      let modelos: string[];
      let origen = 'copilot';
      try { modelos = await modelosDeCopilot(tokensCopilotGuardados(fila, process.env), base?.defaultHeaders); }
      catch (e) {
        const deAtlas = await modelosCopilotEnAtlas();
        if (deAtlas === null) throw e;
        modelos = deAtlas; origen = 'atlas';
      }
      return res.json({ modelos, total: modelos.length, origen, consultado: origen === 'atlas' ? 'Conexión de Copilot en Atlas' : 'https://api.githubcopilot.com', aviso: origen === 'atlas' ? 'Atlas reconoce la conexión de Copilot ya autenticada. Guarda el modelo y pruébalo en Atlas; no hace falta reemplazar el token.' : modelos.length ? 'Catálogo de la cuenta; prueba el modelo antes de usarlo.' : 'La cuenta no ofrece modelos de chat con selección manual para esta conexión. Revisa tu plan y las políticas en GitHub.' });
    }
    const guardadas = await leerClavesGuardadas();
    const base = getProviderConfig(proveedor);
    const guardada = guardadas[proveedor];
    const apiKey = (guardada?.apiKey ? descifrar(guardada.apiKey) : null) || base?.apiKey;
    // Ollama publica su catálogo SIN autenticación. Se permite consultarlo sin
    // clave a propósito: sus modelos rotan (los que había al escribir esto ya
    // no existen), así que el admin necesita ver qué hay HOY antes de darse de
    // alta, no después.
    const urlPublica = CATALOGO_PUBLICO[proveedor];
    const raiz = base?.baseUrl || urlPublica;
    if (!raiz || (!apiKey && !urlPublica)) {
      return res.json({ modelos: [], error: "Configura primero la clave de este proveedor" });
    }

    const url = raiz.replace(/\/$/, "") + "/models";
    const r = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!r.ok) {
      return res.json({ modelos: [], error: `El proveedor respondió ${r.status}` });
    }
    const j: any = await r.json();
    // Formato OpenAI: { data: [{ id }] }. Algunos devuelven {models:[...]}.
    // En OpenAI aparecen embeddings, transcripciones, tts, imagenes... que no
    // sirven para charlar: probarlos o elegirlos da 404 "not a chat model".
    const NO_ES_CHAT = /embed|transcribe|tts|whisper|dall-e|dalle|image|audio|moderation|search-preview|computer|instruct/i;
    const lista: string[] = (j?.data || j?.models || [])
      .map((m: any) => (typeof m === "string" ? m : m?.id || m?.name))
      .filter(Boolean)
      .filter((m: string) => !(proveedor === "openai" && NO_ES_CHAT.test(m)))
      .sort();

    // Se devuelve también la URL consultada: variables de entorno como
    // OPENAI_BASE_URL pueden redirigir un proveedor a otro distinto, y sin
    // esto el admin vería modelos ajenos sin entender por qué.
    return res.json({ modelos: lista, total: lista.length, consultado: raiz });
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
    const { proveedor, model } = req.body || {};
    if (proveedor === 'github') return res.status(410).json({ error: GITHUB_MODELS_RETIRADO });
    if (proveedor === 'github_copilot_internal') return res.status(400).json({ error: 'Configura Copilot en Conexión de GitHub Copilot mediante el código de dispositivo; guarda el modelo desde ese panel.' });
    // Vacío o enmascarado ("••••abcd") NO es una clave nueva: no se toca la
    // guardada. Antes el vacío la BORRABA y la máscara se cifraba como si
    // fuera la clave real. Para borrarla hay que pedirlo: { borrarClave: true }.
    const apiKey: string | undefined = req.body?.borrarClave === true
      ? ""
      : (secretoNuevo(req.body?.apiKey) ?? undefined);
    if (!proveedor || !PROVEEDORES.some((p) => p.id === proveedor)) {
      return res.status(400).json({ error: "Proveedor desconocido" });
    }

    // ── La clave de un cliente se guarda EN SU CLIENTE ────────────────────
    // `settings` es una fila ÚNICA y global (no tiene tenantId), y encima sus
    // claves se vuelcan a `process.env`. Guardar acá la clave de un cliente
    // significaba pisarle la configuración a todos, hacer que su cuota pagara
    // las conversaciones ajenas, y dejar que cualquier otro admin se la
    // pisara. Ver lib/ai-keys-tenant.ts.
    //
    // El dueño del sistema (tenant admin) sigue escribiendo en la global: es
    // la que hace de respaldo para todo cliente que no configuró nada.
    const tenantId = req.tenant?.id;
    if (tenantId && !esDuenoDelSistema(req)) {
      const { guardarClaveDeTenant, clavesDelTenant } = await import("../lib/ai-keys-tenant");
      if (typeof model === "string" && model.trim()) {
        // Mismo filtro que en la rama del dueño: un modelo que la API rechaza
        // no se guarda (se prueba con la clave nueva si viene, si no con la suya).
        const suya = (await clavesDelTenant(tenantId))[proveedor];
        const claveParaProbar = (typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : null) || suya?.apiKey || null;
        const motivo = await motivoDeModeloRoto(proveedor, claveParaProbar, model.trim());
        if (motivo) return res.status(400).json({ error: motivo });
      }
      await guardarClaveDeTenant(tenantId, proveedor, { apiKey, model });
      const suyas = await clavesDelTenant(tenantId);
      return res.json({
        ok: true,
        proveedor,
        tieneClave: !!suyas[proveedor]?.apiKey,
        modelo: suyas[proveedor]?.model || null,
        ambito: "cliente",
      });
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
    if (typeof model === "string" && model.trim()) {
      // Se prueba EN VIVO antes de guardar: un modelo que la API rechaza no
      // sirve ni para el chat ni para las landings, y hasta ahora se quedaba
      // guardado en verde hasta que fallaba en producción.
      const { getProviderConfig } = await import("@workspace/integrations-openai-ai-server");
      const claveParaProbar =
        (actual.apiKey ? descifrar(actual.apiKey) : null) ||
        getProviderConfig(proveedor as any)?.apiKey ||
        null;
      const motivo = await motivoDeModeloRoto(proveedor, claveParaProbar, model.trim());
      if (motivo) return res.status(400).json({ error: motivo });
      actual.model = model.trim();
    }

    if (Object.keys(actual).length === 0) delete cfg.aiProviders[proveedor];
    else cfg.aiProviders[proveedor] = actual;

    // Acotado por id: settings es una fila única, pero sin WHERE un futuro
    // multi-fila haría que esto sobrescribiera todas.
    await db.update(settings).set({ businessConfig: cfg as any }).where(eq(settings.id, row.id));
    // Se vuelca al entorno YA, para que la clave funcione sin reiniciar.
    await cargarClavesEnEntorno();
    logger.info({ proveedor, conClave: !!actual.apiKey, modelo: actual.model }, "[AICatalog] proveedor guardado");

    // Sincroniza la clave (recién guardada, en texto plano en esta misma
    // request) hacia OpenCode -- best-effort, nunca bloquea la respuesta.
    if (typeof apiKey === "string" && apiKey.trim()) {
      sincronizarProveedorConOpencode(proveedor, apiKey.trim()).catch(() => {});
    }

    return res.json({ ok: true, proveedor, tieneClave: !!actual.apiKey, modelo: actual.model || null });
  } catch (e) {
    return next(e);
  }
});

/**
 * PUT /api/ai/active — marca qué proveedor queda ACTIVO para Atlas.
 * Body: { proveedor: string }
 *
 * Escribe la fila única `settings.aiProvider`, la misma que lee el agente al
 * armar su cola de rotación (agent.ts: "Elegido al frente"). Solo el dueño
 * del sistema puede moverla: la fila es global, así que un cliente
 * cambiándola le cambiaría la IA a todos los chats.
 */
router.put("/active", async (req: TenantRequest, res, next) => {
  try {
    const { proveedor } = req.body || {};
    if (proveedor === 'github') return res.status(410).json({ error: GITHUB_MODELS_RETIRADO });
    if (!proveedor || !PROVEEDORES.some((p) => p.id === proveedor)) {
      return res.status(400).json({ error: "Proveedor desconocido" });
    }
    if (req.tenant?.id && !esDuenoDelSistema(req)) {
      return res.status(403).json({ error: "Solo el dueño del sistema puede cambiar la IA global de Atlas" });
    }

    const [row] = await db.select().from(settings).limit(1);
    if (!row) return res.status(404).json({ error: "No hay configuración creada" });

    await db.update(settings).set({ aiProvider: proveedor }).where(eq(settings.id, row.id));

    // Se avisa si va a caer al respaldo (sin clave, el agente rota a DeepSeek).
    const cfg = leerBusinessConfig(row.businessConfig).aiProviders || {};
    const meta = PROVEEDORES.find((p) => p.id === proveedor)!;
    const tieneClave = !!process.env[meta.envKey] || !!cfg[proveedor]?.apiKey || (proveedor === 'github_copilot_internal' && !!(row.githubToken || process.env.GITHUB_TOKEN));
    const modelo = (proveedor === 'github_copilot_internal' ? row.githubModel : cfg[proveedor]?.model) || null;
    logger.info({ proveedor, modelo, tieneClave }, "[AICatalog] IA activa de Atlas cambiada");
    return res.json({ ok: true, activa: proveedor, modelo, tieneClave });
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /api/ai/sync-opencode — reenvía TODAS las claves ya guardadas hacia
 * OpenCode (backfill para las que se guardaron antes de que existiera esta
 * sincronización, o para realinear si operato perdió su config). Nunca
 * devuelve ni loguea las claves en sí, solo cuántas se sincronizaron.
 */
router.post("/sync-opencode", async (_req: TenantRequest, res, next) => {
  try {
    const resultado = await sincronizarTodasLasClavesConOpencode();
    return res.json({ ok: true, ...resultado });
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
    if (proveedor === 'github') return res.status(410).json({ ok: false, error: GITHUB_MODELS_RETIRADO });
    const { getProviderConfig, getProviderConfigConClave, createAIClient } = await import("@workspace/integrations-openai-ai-server");

    const tenantId = req.tenant?.id;
    const guardadas = await leerClavesGuardadas();
    const { clavesDelTenant, configDelTenant } = await import("../lib/ai-keys-tenant");
    const propias = tenantId ? await clavesDelTenant(tenantId) : {};
    const resuelta = tenantId ? await configDelTenant(tenantId, proveedor, propias) : null;
    let base = resuelta?.config || getProviderConfig(proveedor);
    // La prueba y el catálogo deben usar la misma cuenta recién conectada,
    // aunque el entorno conserve un token de Copilot anterior.
    if (proveedor === 'github_copilot_internal' && esDuenoDelSistema(req)) {
      const [fila] = await db.select().from(settings).limit(1);
      if (fila?.githubToken) base = getProviderConfigConClave(proveedor, fila.githubToken, fila.githubModel || undefined);
    }
    if (!base?.apiKey) {
      if (proveedor === 'github_copilot_internal' && esDuenoDelSistema(req) && await modelosCopilotEnAtlas() !== null) return res.json({ ok: false, requiereAtlas: true, error: 'Copilot está autenticado en Atlas. Prueba allí el modelo; esta prueba local no dispone de esa sesión.' });
      return res.json({ ok: false, error: "Ese proveedor no tiene clave configurada" });
    }
    const cfg = {
      ...base,
      model: model || (resuelta?.propia ? propias[proveedor]?.model : guardadas[proveedor]?.model) || base.model || "",
    };
    if (!cfg.baseUrl) return res.json({ ok: false, error: "No se pudo resolver la URL del proveedor" });

    // ── Copilot necesita un intercambio de token, no el PAT crudo ────────
    // La API de Copilot no acepta el token de GitHub tal cual: hay que
    // canjearlo por un token de sesión (lib/copilot.ts, ya usado por agent.ts
    // y code-agent.ts). Acá faltaba, así que probar Copilot desde el panel
    // devolvía SIEMPRE "400 Authorization header is badly formatted" -- o sea
    // que el admin no tenía forma de saber si su cuenta de Copilot servía o
    // no. Un probador que no puede dar OK nunca es peor que no tenerlo:
    // muestra roto algo que funciona.
    if (cfg.baseUrl === "https://api.githubcopilot.com") {
      const [fila] = esDuenoDelSistema(req) ? await db.select().from(settings).limit(1) : [];
      const tokens = esDuenoDelSistema(req) ? tokensCopilotGuardados(fila, process.env) : [cfg.apiKey];
      const sesion = await sesionCopilotGuardada(tokens);
      if (!sesion) {
        const deAtlas = esDuenoDelSistema(req) ? await modelosCopilotEnAtlas() : null;
        return res.json({
          ok: false,
          modelo: cfg.model,
          requiereAtlas: deAtlas !== null,
          error: deAtlas !== null ? 'Copilot está autenticado en Atlas. Guarda el modelo y pruébalo allí; no es necesario reemplazar el token.' : 'No se pudo renovar la sesión local. El token guardado se conserva; vuelve a probar antes de autorizar de nuevo.',
        });
      }
      cfg.apiKey = sesion.token;
    }

    const inicio = Date.now();
    try {
      const client = createAIClient(cfg as any);
      const params: any = {
        model: cfg.model,
        messages: [{ role: "user", content: "Responde exactamente: OK" }],
        // 2000 y no 20: los modelos de razonamiento gastan el presupuesto
        // "pensando" y devuelven content vacío si se les da poco margen.
        // Con un tope bajo, esta prueba los declaraba rotos sin estarlo.
        ...(usaCompletionTokens(cfg.model) ? { max_completion_tokens: 2000 } : { max_tokens: 2000 }),
      };
      let r: any;
      try {
        r = await client.chat.completions.create(params, { timeout: 15_000, maxRetries: 0 });
      } catch (e: any) {
        // GPT-5+/Luna rechazan `max_tokens`: reintenta con `max_completion_tokens`
        // antes de darlo por roto (era el "400" que veía el admin con clave válida).
        if (/max_tokens/i.test(String(e?.message || "")) && !("max_completion_tokens" in params)) {
          delete params.max_tokens;
          params.max_completion_tokens = 2000;
          r = await client.chat.completions.create(params, { timeout: 15_000, maxRetries: 0 });
        } else {
          throw e;
        }
      }
      const texto = r.choices[0]?.message?.content || "";
      const ms = Date.now() - inicio;
      if (!texto.trim()) {
        return res.json({ ok: false, ms, modelo: cfg.model, error: "Respondió sin contenido (modelo de solo razonamiento)" });
      }
      return res.json({ ok: true, ms, modelo: cfg.model, respuesta: texto.slice(0, 60) });
    } catch (e: any) {
      const msg = String(e?.message || "");
      const agotado = /429|rate.?limit|FreeUsageLimit|quota/i.test(msg);
      const modeloRoto = /not a chat model|model_not_found|does not exist|not found in model/i.test(msg);
      const error = agotado
        ? "Cuota agotada (429) — se restablece más tarde"
        : modeloRoto
          ? `El modelo "${cfg.model}" no sirve para chat con la API (${msg.slice(0, 110)}). Cambialo por gpt-5.6-luna o gpt-4o-mini.`
          : msg.slice(0, 140);
      return res.json({ ok: false, modelo: cfg.model, agotado, error });
    }
  } catch (e) {
    return next(e);
  }
});

export default router;
