/**
 * EL CLIENTE DEL MODELO
 * =====================
 *
 * Dos decisiones de diseño, las dos obligadas por la realidad del sistema:
 *
 * 1. MANDA EL PROVEEDOR ELEGIDO (2026-10-02, por encima de "DeepSeek siempre
 *    primero" del 2026-09-03): si el admin eligió un proveedor en
 *    Configuración Y está configurado (clave o URL), sus candidatos van al
 *    frente; DeepSeek queda justo detrás como respaldo. Sin elección válida,
 *    DeepSeek primero como siempre (regla con pruebas en
 *    `lib/deepseek-al-frente.ts`, que se sigue llamando igual).
 *
 * 2. SI EL MODELO NO TRAE HERRAMIENTAS, EL MOTOR SIGUE IGUAL. La plataforma
 *    rota por modelos gratis (OpenCode Zen, Groq, Cerebras) y varios no
 *    soportan tool calling. Caer al motor viejo por eso hubiera dejado el
 *    arreglo sin efecto justo en las horas de mayor tráfico. En vez de eso,
 *    cuando el proveedor rechaza las herramientas, se le pide el mismo
 *    razonamiento en un JSON chico y el SERVIDOR ejecuta las herramientas
 *    igual. Lo que pierde el cliente en ese caso es una vuelta de
 *    conversación, no la garantía de que los datos salgan de la base.
 *
 * Lo que NO hay acá: otra lista de proveedores escrita a mano. Se reutiliza la
 * rotación que ya existe (`getProviderRotation`), los tiempos por proveedor
 * (`getProviderTimeout`), el castigo por caída (`optimizedRotation`) y la
 * salud por servicio (`healthMonitor`). Que el motor cambie no puede cambiar
 * cómo se elige el modelo: son dos asuntos distintos.
 */

import { createAIClient, getProviderConfig, getProviderConfigConClave, getProviderConfigFromSettings, getProviderRotation, type AIProviderConfig } from "@workspace/integrations-openai-ai-server";
import { db, settings as settingsTable } from "@workspace/db";
import { healthMonitor } from "../fallbackSystem";
import { getProviderTimeout, optimizedRotation, reportProviderResult } from "../optimized-rotation";
import { deepseekVaPrimero } from "../deepseek-al-frente";
import { MODELO_DE_RAZONAMIENTO } from "../agent";
import { logger } from "../logger";

export interface LlamadaHerramienta {
  id: string;
  name: string;
  arguments: string;
}

export interface RespuestaLLM {
  content: string | null;
  toolCalls: LlamadaHerramienta[];
  /** Qué modelo contestó de verdad. Sin esto no se puede diagnosticar nada. */
  proveedor: string;
  /** Si se usó el modo JSON (el modelo no traía herramientas). */
  modoPlan: boolean;
  /**
   * Tokens de esta llamada, si el proveedor los informa. `cacheados` son los
   * de entrada que el proveedor sirvió desde su caché de prefijo (DeepSeek:
   * `prompt_cache_hit_tokens`; OpenAI: `prompt_tokens_details.cached_tokens`)
   * y se cobran una fracción. Hasta el 23-09-2026 no se medía: no había forma
   * de saber cuánto costaba un turno ni si el caché servía.
   */
  uso?: UsoDeTokens;
}

export interface UsoDeTokens {
  entrada: number;
  salida: number;
  cacheados: number;
}

/** Lee el `usage` de una respuesta estilo OpenAI (con las variantes de DeepSeek). */
export function usoDe(completion: any): UsoDeTokens | undefined {
  const u = completion?.usage;
  if (!u) return undefined;
  return {
    entrada: Number(u.prompt_tokens) || 0,
    salida: Number(u.completion_tokens) || 0,
    cacheados: Number(u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens) || 0,
  };
}

export interface ClienteLLM {
  crear(params: {
    messages: any[];
    tools?: any[];
    temperature?: number;
    maxTokens?: number;
    /**
     * Cuánto piensa el modelo (DeepSeek-V4.1-Flash lo acepta como `effort`,
     * verificado contra la API real el 2026-09-29). Solo viaja cuando el
     * proveedor es DeepSeek: otros compatibles lo rechazarían.
     * Se usa en "high" para los reintentos de corrección (el motor lo pasa
     * cuando hay que reescribir sin inventar cifras): ahí la calidad paga
     * más que la velocidad.
     */
    effort?: "low" | "high" | "max";
  }): Promise<RespuestaLLM>;
}

export interface Candidato {
  config: AIProviderConfig;
  /** "deepseek/deepseek-chat": proveedor/modelo. Se reporta igual que en agent.ts. */
  source: string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * LA CADENA
 * ──────────────────────────────────────────────────────────────────────────── */

const SALUD: Record<string, string> = {
  deepseek: "deepseek",
  github_copilot_internal: "copilot_internal",
  groq: "groq",
  cerebras: "cerebras",
  openai: "openai",
  nvidia: "nvidia_8b",
  opencode: "opencode",
};

/**
 * Los candidatos de este turno, en orden.
 *
 * El orden es el mismo que ya usa el vendedor (y que está medido): DeepSeek
 * primero, después la cuenta propia del cliente, después lo que el dueño
 * eligió en el panel, y los gratis al final.
 */
export async function armarCadena(opts: {
  tenantId?: number | null;
  /** La fila de `settings`, si el llamador ya la tiene cargada. */
  appSettings?: any | null;
  proveedorElegido?: string | null;
}): Promise<Candidato[]> {
  const { tenantId, appSettings } = opts;
  const cola: Candidato[] = [];
  const proveedorElegido = String(opts.proveedorElegido ?? appSettings?.aiProvider ?? "none");

  const conModelos = (proveedor: string) => {
    if (proveedorElegido === proveedor) return []; // ya entra por su cuenta, más abajo
    if (!healthMonitor.isServiceHealthy(SALUD[proveedor] || proveedor)) return [];
    if (optimizedRotation.isInCooldown(proveedor)) return [];
    return getProviderRotation(proveedor).map((config: AIProviderConfig) => ({ config, source: `${proveedor}/${config.model}` }));
  };

  // ── 0. Ollama del servidor, si está (gratis): lib/modelos-por-tarea.ts ─────
  // Medido con la venta completa: gemma4:31b 1,7 s por turno contra 2,2 s de
  // DeepSeek. Si se corta, se queda sin cuota o el plan no lo incluye, la
  // rotación lo aparta y el turno sigue con DeepSeek. `IA_VENDEDOR=off` lo
  // saca sin redesplegar código.
  if (!optimizedRotation.isInCooldown("ollama_local")) {
    const { candidatosDeOllama } = await import("../modelos-por-tarea");
    cola.push(...candidatosDeOllama("vendedor"));
  }

  // ── 1. DeepSeek al frente, con TODOS sus modelos ──────────────────────────
  if (
    deepseekVaPrimero({
      hayClave: !!process.env.DEEPSEEK_API_KEY,
      sano: healthMonitor.isServiceHealthy("deepseek"),
      enCooldown: optimizedRotation.isInCooldown("deepseek"),
      proveedorElegido,
    })
  ) {
    for (const config of getProviderRotation("deepseek")) {
      cola.push({ config, source: `deepseek/${config.model}` });
    }
  }

  // ── 2. Las claves del PROPIO cliente: es su cuenta, manda sobre la nuestra ──
  if (tenantId) {
    try {
      const { clavesDelTenant } = await import("../ai-keys-tenant");
      for (const [proveedor, datos] of Object.entries((await clavesDelTenant(tenantId)) as Record<string, any>)) {
        const cfg = datos?.apiKey ? getProviderConfigConClave(proveedor, datos.apiKey, datos.model) : null;
        if (cfg) cola.push({ config: cfg, source: `${proveedor}_cliente` });
      }
    } catch (e: any) {
      logger.warn({ err: e?.message, tenantId }, "[MotorV2] no se pudieron leer las claves propias del cliente");
    }
  }

  // ── 3. Lo que el dueño eligió en Configuración ────────────────────────────
  // `appSettings` llega undefined cuando el que llama no la tiene a mano (es
  // el caso del motor v2, que se engancha antes de cargar nada). Se lee una
  // vez por turno y sin romper si la tabla no está.
  let ajustes = appSettings;
  if (ajustes === undefined) {
    try {
      const [fila] = await db.select().from(settingsTable).limit(1);
      ajustes = fila ?? null;
    } catch {
      ajustes = null;
    }
  }
  if (ajustes && proveedorElegido !== "none" && proveedorElegido !== "opencode") {
    try {
      const cfg = getProviderConfigFromSettings(ajustes);
      if (cfg) cola.push({ config: cfg, source: `${proveedorElegido}/${cfg.model}` });
    } catch {
      /* si no se puede resolver, sigue la cadena */
    }
  }

  // ── 4. Los gratis y los de respaldo ───────────────────────────────────────
  for (const p of ["github_copilot_internal", "opencode", "groq", "cerebras", "openai"]) {
    cola.push(...conModelos(p));
  }
  try {
    const nvidia = getProviderConfig("nvidia_fast");
    if (nvidia && healthMonitor.isServiceHealthy("nvidia_8b")) cola.push({ config: nvidia, source: `nvidia/${nvidia.model}` });
  } catch {
    /* sin nvidia configurado */
  }

  // ── El elegido al frente, si resuelve ───────────────────────────────────
  // El admin elige el proveedor en Configuración y el motor elige el MODELO
  // (el primero sano de ese proveedor en la cola). Solo se promueve si el
  // proveedor resuelve de verdad (clave o URL): promover un elegido sin
  // configurar pondría un candidato muerto primero en cada turno.
  if (proveedorElegido && proveedorElegido !== "none" && proveedorElegido !== "deepseek" && proveedorElegido !== "opencode") {
    let resuelve = false;
    try {
      const { getProviderConfigFromSettings: resolver } = await import("@workspace/integrations-openai-ai-server");
      resuelve = !!resolver({ ...(ajustes || {}), aiProvider: proveedorElegido });
    } catch { resuelve = false; }
    if (resuelve) {
      const esElegido = (s: unknown): boolean => {
        const v = String(s || "");
        if (proveedorElegido === "ollama_cloud") return v.startsWith("ollama_cloud") || v.startsWith("ollama_local");
        if (proveedorElegido === "ollama_local") return v.startsWith("ollama_local");
        return v === proveedorElegido || v.startsWith(`${proveedorElegido}/`) || v.startsWith(`${proveedorElegido}_`);
      };
      const pri = cola.filter((c) => esElegido(c.source));
      if (pri.length) {
        const resto = cola.filter((c) => !esElegido(c.source));
        cola.length = 0;
        cola.push(...pri, ...resto);
      }
    }
  }

  // Un modelo de razonamiento tarda 26-30s medidos contra producción: nadie
  // espera eso en WhatsApp. Se filtra venga de donde venga ( la config del
  // tenant es una fuente tan válida como el entorno).
  return cola.filter(
    ({ config, source }) => !MODELO_DE_RAZONAMIENTO.test(String(config?.model || "")) && !MODELO_DE_RAZONAMIENTO.test(source),
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * EL MODO PLAN (para modelos sin tool calling)
 * ──────────────────────────────────────────────────────────────────────────── */

export const INSTRUCCION_DE_PLAN = `
Vas a contestar en DOS PARTES, y el servidor ejecuta lo que vos decidas.

PRIMERO pensá en una sola línea qué está pidiendo el cliente y qué le falta saber al sistema.
DESPUÉS respondé con este JSON y NADA MÁS (sin explicaciones afuera del JSON):

{
  "herramientas": [
    {"nombre": "mostrar", "args": {"productoId": 123, "seccion": "precio"}}
  ],
  "mensaje": "lo que le escribís al cliente"
}

Reglas:
· "herramientas" puede ir vacío: [] si no hace falta consultar ni mandar nada.
· NUNCA escribas precios, números de cuenta, enlaces de pago ni plazos de entrega en "mensaje".
  Para eso están las herramientas: el sistema los pone con los datos reales del negocio.
· "mensaje" escribeselo como una persona: 2 a 4 frases, sin listas ni títulos.
`.trim();

/** Modelos a los que ya se les comprobó que las herramientas no les gustan. */
const sinHerramientas = new Set<string>();

/** Saca el JSON del texto aunque el modelo lo envuelva en prosa o en ```json. */
export function extraerPlan(texto: string): { herramientas: { nombre: string; args: any }[]; mensaje: string } | null {
  const limpio = String(texto || "").replace(/```(?:json)?/gi, "").trim();
  const inicio = limpio.search(/\{/);
  if (inicio < 0) return null;
  // El último "}" cierra el objeto: se busca desde el final para no cortar en
  // el primer bloque anidado.
  const fin = limpio.lastIndexOf("}");
  if (fin <= inicio) return null;

  try {
    const j = JSON.parse(limpio.slice(inicio, fin + 1));
    if (!j || typeof j !== "object") return null;
    const herramientas = Array.isArray(j.herramientas)
      ? j.herramientas
          .filter((h: any) => h && typeof h.nombre === "string")
          .map((h: any) => ({ nombre: String(h.nombre), args: h.args && typeof h.args === "object" ? h.args : {} }))
      : [];
    const mensaje = typeof j.mensaje === "string" ? j.mensaje : "";
    if (!herramientas.length && !mensaje.trim()) return null;
    return { herramientas, mensaje };
  } catch {
    return null;
  }
}

function pareceErrorDeHerramientas(mensaje: string): boolean {
  const m = String(mensaje || "").toLowerCase();
  return (
    m.includes("tool") ||
    m.includes("function") ||
    m.includes("unsupported") ||
    m.includes("not supported") ||
    m.includes("no soport") ||
    m.includes("unexpected role") ||
    (m.includes("400") && (m.includes("invalid") || m.includes("bad request")))
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * EL CLIENTE
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Crea el cliente. Recibe la cadena ya armada (o la arma sola) y se encarga de
 * probar, castigar al que falla y caer al modo JSON cuando haga falta.
 */
export function crearClienteLLM(opts: {
  cadena: Candidato[];
  tenantId?: number | null;
  /** Si el llamador quiere forzar el modo JSON (pruebas, o modelo conocido). */
  forzarPlan?: boolean;
  timeoutMsPorDefecto?: number;
  /**
   * Cómo construir el cliente HTTP. Existe para poder probar el bucle entero
   * sin red y sin claves: en producción es `createAIClient` y nada cambia.
   */
  fabrica?: (config: AIProviderConfig) => any;
}): ClienteLLM {
  const { cadena } = opts;
  const fabrica = opts.fabrica ?? createAIClient;

  return {
    async crear({ messages, tools, temperature, maxTokens, effort }): Promise<RespuestaLLM> {
      const errores: string[] = [];

      for (const { config, source } of cadena) {
        const providerName = source.split("/")[0];
        if (optimizedRotation.isInCooldown(providerName)) continue;

        const usaHerramientas = tools && tools.length > 0 && !opts.forzarPlan && !sinHerramientas.has(source);
        const timeout = getProviderTimeout(providerName) || opts.timeoutMsPorDefecto || 25_000;
        const t0 = Date.now();
        // `effort` solo existe en DeepSeek nativo: mandarlo a otro proveedor
        // rompería su llamada (400 por parámetro desconocido).
        const esDeepSeek = providerName === "deepseek" || /^deepseek\//i.test(source);

        try {
          const client = fabrica(config);
          const body: any = {
            model: config.model,
            messages,
            temperature: temperature ?? 0.6,
            max_tokens: maxTokens ?? 700,
            ...(effort && esDeepSeek ? { effort } : {}),
          };

          // En modo plan la instrucción va como un mensaje del sistema extra,
          // no mezclada con el prompt del negocio: así el mismo system sirve
          // para los dos caminos y no pueden divergir.
          if (!usaHerramientas && tools && tools.length > 0) {
            body.messages = [...messages, { role: "system", content: INSTRUCCION_DE_PLAN }];
          }
          if (usaHerramientas) {
            body.tools = tools;
            body.tool_choice = "auto";
          }

          const completion: any = await client.chat.completions.create(body, { timeout, maxRetries: 0 } as any);
          const msg = completion?.choices?.[0]?.message || {};
          const content = typeof msg.content === "string" ? msg.content : null;

          // ── Con herramientas ──────────────────────────────────────────────
          if (usaHerramientas) {
            const toolCalls: LlamadaHerramienta[] = Array.isArray(msg.tool_calls)
              ? msg.tool_calls.map((tc: any) => ({
                  id: String(tc.id || `call_${Math.random().toString(36).slice(2, 9)}`),
                  name: String(tc.function?.name || ""),
                  arguments: String(tc.function?.arguments || "{}"),
                }))
              : [];

            if (toolCalls.length || (content && content.trim())) {
              reportProviderResult(providerName, true, Date.now() - t0);
              return { content, toolCalls, proveedor: source, modoPlan: false, uso: usoDe(completion) };
            }
            // 200 con todo vacío = fallo, aunque no tire error. Medido: 8 de
            // los 26 modelos de OpenCode Go contestan 200 sin una sola letra.
            reportProviderResult(providerName, false, Date.now() - t0, "respuesta vacía");
            errores.push(`${source}: respuesta vacía`);
            continue;
          }

          // ── Sin herramientas: modo texto o modo plan ──────────────────────
          if (content && content.trim()) {
            reportProviderResult(providerName, true, Date.now() - t0);
            if (tools && tools.length > 0 && !opts.forzarPlan) {
              const plan = extraerPlan(content);
              if (plan) {
                return {
                  content: plan.mensaje || null,
                  toolCalls: plan.herramientas.map((h, i) => ({
                    id: `plan_${i}`,
                    name: h.nombre,
                    arguments: JSON.stringify(h.args || {}),
                  })),
                  proveedor: source,
                  modoPlan: true,
                  uso: usoDe(completion),
                };
              }
              // Pidió herramientas, contestó prosa: se usa como texto y el
              // turno sigue. Mejor una respuesta sin ficha que ninguna.
              return { content, toolCalls: [], proveedor: source, modoPlan: true, uso: usoDe(completion) };
            }
            return { content, toolCalls: [], proveedor: source, modoPlan: false, uso: usoDe(completion) };
          }

          reportProviderResult(providerName, false, Date.now() - t0, "respuesta vacía");
          errores.push(`${source}: respuesta vacía`);
        } catch (err: any) {
          const mensaje = String(err?.message || err);
          reportProviderResult(providerName, false, undefined, mensaje);
          errores.push(`${source}: ${mensaje.slice(0, 120)}`);

          // Si el proveedor rechazó las herramientas, se lo recuerda y se le
          // vuelve a preguntar en modo JSON con el MISMO modelo: cambiar de
          // modelo por esto entrega la conversación a un modelo peor.
          if (usaHerramientas && pareceErrorDeHerramientas(mensaje)) {
            sinHerramientas.add(source);
            logger.warn({ source }, "[MotorV2] el modelo no acepta herramientas: se reintenta en modo plan");
            try {
              const client = fabrica(config);
              const completion: any = await client.chat.completions.create(
                {
                  model: config.model,
                  messages: [...messages, { role: "system", content: INSTRUCCION_DE_PLAN }],
                  temperature: temperature ?? 0.6,
                  max_tokens: maxTokens ?? 700,
                  ...(effort && esDeepSeek ? { effort } : {}),
                },
                { timeout, maxRetries: 0 } as any,
              );
              const content = typeof completion?.choices?.[0]?.message?.content === "string"
                ? String(completion.choices[0].message.content)
                : null;
              if (content && content.trim()) {
                const plan = extraerPlan(content);
                return {
                  content: plan?.mensaje || content,
                  toolCalls: (plan?.herramientas || []).map((h, i) => ({
                    id: `plan_${i}`,
                    name: h.nombre,
                    arguments: JSON.stringify(h.args || {}),
                  })),
                  proveedor: source,
                  modoPlan: true,
                };
              }
            } catch (err2: any) {
              errores.push(`${source} (plan): ${String(err2?.message || err2).slice(0, 120)}`);
            }
          }
        }
      }

      throw new Error(`Ningún modelo respondió (${cadena.length} intentados): ${errores.slice(0, 4).join(" | ")}`);
    },
  };
}

/** Para pruebas: un cliente que devuelve respuestas prefijadas. */
export function clienteFalso(respuestas: Array<{ content?: string | null; toolCalls?: LlamadaHerramienta[] }>): ClienteLLM & {
  llamadas: { messages: any[]; tools?: any[] }[];
} {
  const llamadas: { messages: any[]; tools?: any[] }[] = [];
  let i = 0;
  return {
    llamadas,
    async crear({ messages, tools }) {
      llamadas.push({ messages, tools });
      const r = respuestas[Math.min(i, respuestas.length - 1)] ?? {};
      i++;
      return { content: r.content ?? null, toolCalls: r.toolCalls ?? [], proveedor: "falso", modoPlan: false };
    },
  };
}
