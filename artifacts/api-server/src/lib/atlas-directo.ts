/**
 * ============================================================
 * ATLAS SIN INTERMEDIARIOS
 * ============================================================
 *
 * Hasta acá el camino de un turno era:
 *
 *     Atlas → OpenCode → puente MCP → DE VUELTA a este mismo servidor
 *
 * O sea que se daba una vuelta por un contenedor ajeno para terminar llamando
 * funciones que ya viven acá. Y esa vuelta se paga cara. Medido el 2026-09-05,
 * mismo prompt, mismas herramientas, mismo modelo `deepseek-v4-flash`:
 *
 *     DeepSeek directo    7.725 tokens    1,7s · 2,0s · 2,6s
 *     por OpenCode       20.674 tokens    13s … +175s
 *
 * OpenCode agrega ~13.000 tokens propios --su prompt de agente de código y sus
 * herramientas internas, que a este proyecto no le sirven de nada-- y corre su
 * propio bucle de agente encima. Resultado: casi el triple de contexto y entre
 * 5 y 100 veces más lento, con una variación tan grande que hacía imposible
 * medir cualquier mejora.
 *
 * ⚠️ Una corrección honesta: al principio concluí que el puente NO era el
 * problema, porque una llamada trivial tarda 2s. Con carga real es al revés.
 * Medir el caso fácil y extrapolar al difícil fue el error.
 *
 * ── "Que todo quede en perfecta sincronía" ────────────────────────────────
 *
 * Es la condición que puso el dueño, y define el diseño de este archivo: NADA
 * se reimplementa. Los dos caminos comparten las mismas fuentes, así que no
 * pueden divergir:
 *
 *   · las herramientas   `buildMcpToolRegistry(pedido)`  -- la misma lista
 *   · la ejecución       `def.handler(args, ctx)`        -- el mismo handler
 *   · el contexto        tenantId/sessionId/turnId/turnDeadline/objetivo
 *   · el resultado       `textoDelResultado(result)`     -- el mismo formato
 *   · el prompt          `promptDeAtlas(pedido)`         -- el mismo texto
 *
 * Lo único propio de este módulo es el BUCLE: pedir, ejecutar lo que el modelo
 * pida, devolverle el resultado y repetir. Eso es lo que hacía OpenCode.
 *
 * Hay una prueba que verifica que ambos caminos usan las mismas fuentes.
 */

import { logger } from "./logger";
import { textoDelResultado, type McpToolDef } from "./opencode-mcp-tools";
import type { OperatorContext } from "./app-operator";

/** DeepSeek habla el formato de OpenAI, así que esto vale para cualquier compatible. */
const URL_POR_DEFECTO = "https://api.deepseek.com/chat/completions";

/**
 * Nivel de razonamiento del modelo (DeepSeek-V4.1-Flash lo acepta como
 * `effort`: verificado contra la API real el 2026-09-29 -- responde con
 * `reasoning_content` separado y el parámetro no da error).
 *
 *   low  turno simple: saludo, lectura puntual, "sí" a una pregunta.
 *   high turno normal: el default de la API, razona antes de contestar.
 *   max  tarea difusa o cara si sale mal: investigación, anuncio completo,
 *        importación de catálogo, insistencia tras un fallo.
 *
 * No es "temperatura": es cuánto piensa antes de escribir. Low ahorra
 * tokens de razonamiento y latency; max se reserva para lo que lo necesita.
 */
export type NivelDeEsfuerzo = "low" | "high" | "max";

export interface OpcionesDeTurnoDirecto {
  /** El system ya armado (promptDeAtlas + catálogo de capacidades). */
  system: string;
  /** Las herramientas de ESTE turno, ya filtradas por el pedido. */
  herramientas: McpToolDef[];
  /** El mensaje del admin. */
  mensaje: string;
  /** El mismo contexto que recibe el puente MCP. */
  ctx: OperatorContext & { turnId: string };
  apiKey: string;
  modelo?: string;
  baseUrl?: string;
  /** Cuánto piensa el modelo antes de contestar. Default: "high" (el de la API). */
  esfuerzo?: NivelDeEsfuerzo;
  /** Cuánto tiempo le queda al turno entero. */
  presupuestoMs: number;
  /** El botón de "Detener" del admin. */
  cancelSignal?: AbortSignal;
  /** Para contarle al admin qué está pasando mientras espera. */
  onProgreso?: (texto: string) => void;
}

export interface ResultadoDirecto {
  texto: string;
  error?: string;
  vueltas: number;
  herramientasUsadas: string[];
  ms: number;
}

/**
 * Cuántas veces puede pedir herramientas antes de tener que contestar.
 *
 * No es un número al azar: una tarea real encadena leer producto → armar
 * borrador → validar, que son tres. Doce deja margen para pedidos compuestos
 * más complejos (investigar → crear producto → generar copy → validar) sin
 * permitir que un modelo confundido se quede dando vueltas hasta consumir
 * el turno entero -- que es justo lo que pasaba con el bucle de OpenCode.
 */
const VUELTAS_MAX = 8;

/**
 * Tope por herramienta. Visto en producción el 14-09-2026: `fb_ad_library`
 * se quedó colgada (Chromium dentro del contenedor) y el turno entero quedó
 * en "Consultando fb ad library…" durante horas, porque el presupuesto del
 * turno solo acotaba las llamadas al MODELO, no a las herramientas. Ninguna
 * lectura legítima necesita más que esto; las de investigación larga
 * (deep_research) tienen su propio camino asíncrono.
 */
const TOPE_HERRAMIENTA_MS = 90_000;
/** Lo que se reserva después de una herramienta para que el modelo alcance a contestar. */
const RESERVA_PARA_RESPONDER_MS = 8_000;

class HerramientaVencida extends Error {
  constructor(nombre: string, ms: number) {
    super(`${nombre} tardó más de ${Math.round(ms / 1000)}s y se canceló`);
    this.name = "HerramientaVencida";
  }
}

/**
 * Corre el handler con límite. Si se vence, el turno sigue (el modelo recibe
 * el error y decide); el handler queda corriendo de fondo hasta que termine
 * solo -- las herramientas de navegador cierran el suyo por su cuenta.
 */
async function conLimite<T>(nombre: string, ms: number, fn: () => Promise<T>, cancel?: AbortSignal): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  let onAbort: (() => void) | undefined;
  const limite = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HerramientaVencida(nombre, ms)), ms);
    if (cancel) {
      onAbort = () => reject(new Error("detenido"));
      if (cancel.aborted) onAbort();
      else cancel.addEventListener("abort", onAbort, { once: true });
    }
  });
  try {
    return await Promise.race([fn(), limite]);
  } finally {
    if (timer) clearTimeout(timer);
    if (cancel && onAbort) cancel.removeEventListener("abort", onAbort);
  }
}

/** Un esquema vacío es válido, pero `undefined` rompe la API. */
const SIN_PARAMETROS = { type: "object", properties: {} };

/** McpToolDef → el formato de herramientas de OpenAI/DeepSeek. */
function comoHerramientaDeOpenAI(t: McpToolDef) {
  return {
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema || SIN_PARAMETROS,
    },
  };
}

/**
 * Los argumentos vienen como TEXTO y a veces no son JSON válido.
 *
 * Un modelo que se equivoca escribiendo el JSON no puede tumbar el turno: se
 * le devuelve el error como resultado de la herramienta y que lo corrija en la
 * vuelta siguiente, que es lo que haría una persona.
 */
function leerArgumentos(bruto: unknown): { ok: true; args: any } | { ok: false; error: string } {
  const t = String(bruto ?? "").trim();
  if (!t) return { ok: true, args: {} };
  try {
    const v = JSON.parse(t);
    return { ok: true, args: v && typeof v === "object" ? v : {} };
  } catch (e: any) {
    return { ok: false, error: `Los argumentos no son JSON válido: ${e?.message || e}` };
  }
}

/**
 * Un turno completo de Atlas, hablando con el modelo sin intermediarios.
 *
 * Devuelve el texto final y, si algo falló, el motivo. Nunca lanza: quien
 * llama tiene que poder mostrarle algo al admin pase lo que pase.
 */
export async function correrTurnoDirecto(o: OpcionesDeTurnoDirecto): Promise<ResultadoDirecto> {
  const t0 = Date.now();
  const limite = t0 + o.presupuestoMs;
  const herramientasUsadas: string[] = [];
  const porNombre = new Map(o.herramientas.map((t) => [t.name, t]));

  const mensajes: any[] = [
    { role: "system", content: o.system },
    { role: "user", content: o.mensaje },
  ];

  let ultimoTexto = "";
  let vueltas = 0;

  for (; vueltas < VUELTAS_MAX; vueltas++) {
    if (o.cancelSignal?.aborted) {
      return { texto: ultimoTexto, error: "detenido", vueltas, herramientasUsadas, ms: Date.now() - t0 };
    }
    const restante = limite - Date.now();
    // Menos de 5s no alcanza ni para una respuesta corta: se corta acá y se
    // devuelve lo que haya, en vez de gastar el resto en una llamada que va a
    // morir a mitad de camino.
    if (restante < 5_000) {
      return {
        texto: ultimoTexto,
        error: ultimoTexto ? undefined : "sin tiempo",
        vueltas, herramientasUsadas, ms: Date.now() - t0,
      };
    }

    let datos: any;
    try {
      const porTiempo = AbortSignal.timeout(restante);
      const res = await fetch(o.baseUrl || URL_POR_DEFECTO, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.apiKey}` },
        body: JSON.stringify({
          model: o.modelo || "deepseek-v4-flash",
          messages: mensajes,
          // `effort` solo lo entiende DeepSeek nativo; otros compatibles con
          // OpenAI lo ignoran o lo rechazan, así que viaja únicamente cuando
          // el llamador lo pide explícito (el default "high" es el de la API
          // y no hace falta mandarlo).
          ...(o.esfuerzo && o.esfuerzo !== "high" ? { effort: o.esfuerzo } : {}),
          ...(o.herramientas.length ? { tools: o.herramientas.map(comoHerramientaDeOpenAI) } : {}),
        }),
        signal: o.cancelSignal ? AbortSignal.any([porTiempo, o.cancelSignal]) : porTiempo,
      });

      if (!res.ok) {
        const cuerpo = await res.text().catch(() => "");
        logger.warn({ status: res.status, cuerpo: cuerpo.slice(0, 300) }, "[AtlasDirecto] El modelo devolvió error");
        return { texto: ultimoTexto, error: `el modelo respondió ${res.status}`, vueltas, herramientasUsadas, ms: Date.now() - t0 };
      }
      datos = await res.json();
    } catch (e: any) {
      const detenido = o.cancelSignal?.aborted;
      return {
        texto: ultimoTexto,
        error: detenido ? "detenido" : String(e?.message || e),
        vueltas, herramientasUsadas, ms: Date.now() - t0,
      };
    }

    // ⚠️ Los proveedores compatibles con OpenAI devuelven 200 con el error
    // ADENTRO. Medido en vivo contra OpenCode: un modelo sin saldo contesta
    // 200 con {"error":{"message":"Insufficient balance"}}. Sin mirar acá, eso
    // parece una respuesta vacía y se diagnostica como "el modelo no dijo
    // nada" durante horas.
    if (datos?.error) {
      const msg = String(datos.error?.message || datos.error);
      logger.warn({ err: msg }, "[AtlasDirecto] 200 con error adentro");
      return { texto: ultimoTexto, error: msg, vueltas, herramientasUsadas, ms: Date.now() - t0 };
    }

    const eleccion = datos?.choices?.[0]?.message;
    if (!eleccion) {
      return { texto: ultimoTexto, error: "el modelo no devolvió ningún mensaje", vueltas, herramientasUsadas, ms: Date.now() - t0 };
    }

    if (typeof eleccion.content === "string" && eleccion.content.trim()) {
      ultimoTexto = eleccion.content.trim();
    }

    const llamadas = Array.isArray(eleccion.tool_calls) ? eleccion.tool_calls : [];
    if (llamadas.length === 0) {
      // Sin herramientas pendientes: esto era la respuesta.
      return { texto: ultimoTexto, vueltas: vueltas + 1, herramientasUsadas, ms: Date.now() - t0 };
    }

    // El mensaje del modelo va al historial TAL CUAL, con sus tool_calls: sin
    // eso la API rechaza los resultados que vienen después.
    mensajes.push(eleccion);

    for (const llamada of llamadas) {
      const nombre = String(llamada?.function?.name || "");
      const def = porNombre.get(nombre);
      let texto: string;

      if (!def) {
        texto = `❌ Herramienta desconocida: ${nombre}`;
      } else {
        const leidos = leerArgumentos(llamada?.function?.arguments);
        if (!leidos.ok) {
          texto = `❌ ${leidos.error}`;
        } else {
          herramientasUsadas.push(nombre);
          o.onProgreso?.(`Consultando ${nombre.replace(/_/g, " ")}…`);
          // Lo que le queda al turno, menos lo que hace falta para que el
          // modelo escriba la respuesta con el resultado.
          const disponible = limite - Date.now() - RESERVA_PARA_RESPONDER_MS;
          const tope = Math.max(1_000, Math.min(TOPE_HERRAMIENTA_MS, disponible));
          try {
            // EL MISMO handler y EL MISMO ctx que usa el puente MCP.
            const resultado = await conLimite(nombre, tope, () => def.handler(leidos.args, o.ctx), o.cancelSignal);
            texto = textoDelResultado(resultado);
          } catch (e: any) {
            if (o.cancelSignal?.aborted) {
              return { texto: ultimoTexto, error: "detenido", vueltas, herramientasUsadas, ms: Date.now() - t0 };
            }
            // Una herramienta que se cae (o se vence) no puede tumbar el
            // turno: el modelo recibe el error y decide -- reintentar con
            // otros argumentos, buscar por otro lado, o decirle al admin.
            logger.warn({ tool: nombre, err: e?.message, tope }, "[AtlasDirecto] La herramienta falló");
            texto = e instanceof HerramientaVencida
              ? `❌ ${e.message}. No la vuelvas a llamar en este turno: seguí con lo que tenés o decile al admin que esa consulta no respondió.`
              : `❌ ${nombre} falló: ${e?.message || e}`;
          }
        }
      }

      mensajes.push({ role: "tool", tool_call_id: llamada?.id, content: texto });
    }
  }

  // Se acabaron las vueltas. Si alcanzó a escribir algo, eso se entrega: es
  // mejor que un error, y suele ser un avance real.
  return {
    texto: ultimoTexto,
    error: ultimoTexto ? undefined : `no terminó en ${VUELTAS_MAX} vueltas de herramientas`,
    vueltas, herramientasUsadas, ms: Date.now() - t0,
  };
}

/**
 * Config del camino directo: Ollama Pro (paga del dueño) como principal,
 * DeepSeek como respaldo. Sin clave de ninguno no hay camino directo.
 *
 * Por qué Ollama primero (02-10-2026): la key de DeepSeek se quedó sin
 * saldo (402) y Atlas quedaba "pensando" hasta para un saludo: el directo
 * fallaba y el turno caía al puente OpenCode, donde la rotación también
 * estaba muerta y el big-pickle de respaldo es lento. Con Ollama Pro el
 * turno va directo a ollama.com/v1 sin intermediarios ni cola global.
 */
export interface ConfigDirecta { apiKey: string; baseUrl: string; modelo: string; proveedor: string }

/**
 * El fetch de más abajo manda POST a `baseUrl` tal cual. DeepSeek trae el
 * sufijo en su URL (`.../chat/completions`) pero Ollama viene como
 * `https://ollama.com/v1`: sin el `/chat/completions` devuelve 405 Method
 * Not Allowed (visto en prod 02-10-2026) y el turno cae al puente OpenCode.
 * Acá se normaliza el endpoint completo, sea cual sea el proveedor.
 */
function endpointChat(base: string): string {
  const b = String(base || "").replace(/\/+$/, "");
  if (/\/chat\/completions$/.test(b)) return b;
  return `${b}/chat/completions`;
}

export function configDirecta(env: NodeJS.ProcessEnv = process.env): ConfigDirecta | null {
  if (env.OLLAMA_CLOUD_API_KEY) {
    return {
      apiKey: String(env.OLLAMA_CLOUD_API_KEY),
      baseUrl: endpointChat(String(env.ATLAS_DIRECTO_URL || env.OLLAMA_CLOUD_URL || "https://ollama.com/v1")),
      modelo: String(env.ATLAS_DIRECTO_MODELO || env.OLLAMA_CLOUD_MODEL || "gpt-oss:20b"),
      proveedor: "ollama_cloud",
    };
  }
  if (env.DEEPSEEK_API_KEY) {
    return {
      apiKey: String(env.DEEPSEEK_API_KEY),
      baseUrl: endpointChat(String(env.ATLAS_DIRECTO_URL || URL_POR_DEFECTO)),
      modelo: String(env.ATLAS_DIRECTO_MODELO || "deepseek-v4-flash"),
      proveedor: "deepseek",
    };
  }
  return null;
}

/**
 * ¿Está el camino directo habilitado y utilizable?
 *
 * Se enciende con `ATLAS_DIRECTO=true` y necesita la clave de Ollama Pro
 * o la de DeepSeek. Sin clave no se enciende aunque la variable diga que
 * sí: quedarse sin camino es peor que usar el lento.
 */
export function directoDisponible(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ATLAS_DIRECTO === "true" && configDirecta(env) !== null;
}
