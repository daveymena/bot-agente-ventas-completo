/**
 * ============================================================
 * ¿EL ADMIN DIJO QUE SÍ A ESTE PLAN?
 * ============================================================
 *
 * `isApproval` es una lista de palabras que creció una palabra por vez, cada
 * vez que el admin usó una que no estaba: "dale", "hágale", "de una", "súbelo",
 * "ya está", "s" sola. Hoy reconoce 21 de 24 formas medidas, y el regex ocupa
 * doce renglones.
 *
 * Pero hay un caso que esa lista NO puede cubrir nunca. Conversación real del
 * 2026-09-02:
 *
 *   Atlas: "📢 PUBLICAR en el muro de la página de Facebook.
 *           ¿Confirmas? Responde sí para ejecutar."
 *   admin: "En el muro"
 *   Atlas: "🤔 No me quedó claro si querés que lo haga."
 *
 * "En el muro" no es una palabra de aprobación: es el admin contestando DÓNDE,
 * y eso solo significa que sí **en relación con lo que se le preguntó**. Sin el
 * plan delante, la frase no dice nada. Ninguna lista de palabras puede
 * resolverlo, porque el sentido no está en las palabras.
 *
 * ── Por qué esto es distinto de todo lo demás que hace el modelo acá ─────
 *
 * Un "sí" mal entendido en el bot de WhatsApp manda un mensaje de más. Un "sí"
 * mal entendido ACÁ publica en la página de Facebook del negocio, o crea una
 * campaña que gasta plata. El costo de equivocarse no es simétrico, y por eso
 * esto está escrito para EQUIVOCARSE HACIA EL NO:
 *
 *   · Solo se pregunta cuando la lista ya dijo que no y tampoco es un rechazo.
 *     Lo que la lista reconoce sigue resolviéndose sin gastar una llamada.
 *   · El modelo recibe el plan concreto, no una pregunta abstracta.
 *   · Se le pide una sola palabra y se exige que sea exactamente "SI".
 *   · Si falla, tarda o contesta cualquier otra cosa, la respuesta es NO --
 *     y entonces Atlas vuelve a preguntar, que es lo que hace hoy.
 *
 * Preguntar de nuevo cuesta un mensaje. Publicar sin permiso cuesta la
 * confianza del dueño en todo el sistema.
 */

import { createAIClient, getProviderConfig } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";
import { modelosDe } from "./modelos-por-tarea";
import { esSiConCorreccion } from "./architect-store";

/** Los proveedores que se prueban, en orden. El primero que conteste gana.
 *  `ollama_local` (gemma4, gratis) va después de Groq y ANTES de DeepSeek:
 *  medido 8/8 aciertos en 0,57 s (lib/modelos-por-tarea.ts). */
const PROVEEDORES = ["groq", "ollama_local", "deepseek", "opencode", "openai"];

/** La configuración del proveedor; para Ollama, con el modelo del reparto por tarea. */
function configDe(proveedor: string): any {
  const config: any = getProviderConfig(proveedor as any);
  if (!config || proveedor !== "ollama_local") return config;
  const modelo = modelosDe("intencion")[0];
  return modelo ? { ...config, model: modelo } : null;
}

function construirPrompt(mensaje: string, plan: string): string {
  return [
    "Un administrador está usando un panel. El sistema le propuso ejecutar esta acción",
    "y le preguntó si la confirma:",
    "",
    `ACCIÓN PROPUESTA: ${String(plan || "(sin descripción)").slice(0, 600)}`,
    "",
    `LO QUE RESPONDIÓ: ${String(mensaje || "").slice(0, 300)}`,
    "",
    "¿Su respuesta significa que ACEPTA que se ejecute esa acción, tal cual está?",
    "",
    "Contestá con UNA sola palabra: SI o NO.",
    "",
    "Reglas:",
    "- Si responde algo que solo tiene sentido como aceptación de esa acción",
    '  (por ejemplo "en el muro" cuando la acción es publicar en el muro), es SI.',
    "- Si pide cambios, duda, pregunta algo o habla de otra cosa, es NO.",
    "- Si no estás seguro, es NO. Ejecutar sin permiso es peor que volver a preguntar.",
  ].join("\n");
}

/**
 * ¿La respuesta del admin acepta ESTE plan?
 *
 * Devuelve false ante cualquier duda, error o demora. Nunca lanza.
 */
export async function esUnSiParaEstePlan(
  mensaje: string,
  plan: string,
  opciones: { timeoutMs?: number } = {},
): Promise<boolean> {
  const texto = String(mensaje || "").trim();
  if (!texto) return false;
  // Un mensaje largo que NO abreva aprobación es una instrucción nueva
  // ("mira, mejor cambiá el título..."): se resuelve NO sin gastar llamada.
  //
  // Pero un "sí, pero…" ("dale pero en rojo", "confirmado, pero sin esos
  // emojis") SÍ abre con aprobación: antes se cortaba acá en NO automático y
  // el plan se descartaba, entrando al loop propone → descarta → restaura
  // (vivo el 2026-09-29). Eso lo decide el modelo, que tiene el plan delante;
  // el prompt ya recorta a 300 caracteres, así que dejarlo pasar no inunda.
  if (texto.length > 120 && !esSiConCorreccion(texto)) return false;

  const timeout = opciones.timeoutMs ?? 6000;
  const prompt = construirPrompt(texto, plan);

  for (const proveedor of PROVEEDORES) {
    let config: any = null;
    try {
      config = configDe(proveedor);
    } catch {
      continue;
    }
    if (!config?.apiKey) continue;

    try {
      const client = createAIClient(config);
      const completion = await client.chat.completions.create(
        {
          model: config.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          max_tokens: 8,
        },
        { timeout, maxRetries: 0 },
      );
      const bruto = String(completion.choices?.[0]?.message?.content || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-ZÍ]/g, "");
      // Se exige el SI exacto. Cualquier otra cosa --incluido el vacío-- es NO.
      const acepta = bruto === "SI" || bruto === "SÍ";
      logger.info({ proveedor, mensaje: texto.slice(0, 60), acepta }, "[EsUnSi] leído contra el plan pendiente");
      return acepta;
    } catch (err: any) {
      logger.warn({ proveedor, err: err?.message }, "[EsUnSi] no se pudo preguntar, se sigue con el siguiente");
    }
  }
  // Sin ningún proveedor: se comporta como hoy, volviendo a preguntar.
  return false;
}


/**
 * ============================================================
 * QUE QUIERE EL ADMIN, CUANDO NO ES UN SI NI UN NO
 * ============================================================
 *
 * Pedido del admin el 2026-09-04: "que entienda las preguntas, los terminos;
 * que no sea tan robotico, que razone: si no es algo que se parece a lo que
 * esperas pero se asemeja, que comprenda los terminos del usuario".
 *
 * Hoy la decision se toma con DOS LISTAS de palabras --`isApproval` y
 * `arrancaPedidoNuevo`-- y solo cuando las dos fallan se le pregunta al
 * modelo... para que conteste SI o NO. Con eso, un mensaje que no es ninguna
 * de las dos cosas termina en "no me quedo claro", que es el bucle que el
 * admin sufrio cuatro veces seguidas.
 *
 * El problema no es que falte una palabra en la lista: es que las opciones
 * eran dos y las situaciones son cuatro. Un admin con un plan pendiente puede
 * estar diciendo que si, que no, pidiendo otra cosa, o preguntando algo sobre
 * el plan. Las dos ultimas no son ambiguedad -- son conversacion, y merecen
 * respuesta, no otra pregunta.
 *
 * ── Por que sigue siendo barato ──────────────────────────────────────────
 *
 * Se consulta SOLO cuando las listas no resolvieron, igual que antes: lo obvio
 * se sigue decidiendo gratis. Y ante error, demora o respuesta rara devuelve
 * "duda", que produce exactamente el comportamiento de hoy -- volver a
 * preguntar manteniendo el plan vivo. El piso no baja.
 */
export type QueQuiere = "si" | "no" | "pedido" | "pregunta" | "duda";

function promptDeIntencion(mensaje: string, plan: string): string {
  return [
    "Un administrador esta usando un panel de ventas. El sistema le propuso esta",
    "accion y le pidio que la confirme:",
    "",
    `ACCION PROPUESTA: ${String(plan || "(sin descripcion)").slice(0, 600)}`,
    "",
    `LO QUE RESPONDIO: ${String(mensaje || "").slice(0, 300)}`,
    "",
    "Clasifica su respuesta en UNA de estas cuatro:",
    "",
    "SI       - acepta que se ejecute la accion tal como esta.",
    "NO       - la rechaza, o pide cancelarla.",
    "PEDIDO   - esta pidiendo OTRA cosa (que le muestres algo, que cambies algo,",
    "           que hagas otra tarea). Aunque este mal escrito o dictado por voz.",
    "PREGUNTA - esta preguntando algo sobre el plan o sobre el negocio.",
    "",
    "Reglas:",
    "- Si esta mal escrito pero se entiende que pide algo, es PEDIDO.",
    "- Si solo dice una palabra de aliento o cortesia ('dale', 'oka', 'listo',",
    "  'hazlo pues'), es SI.",
    "- Si no se entiende NADA de lo que dijo, responde DUDA.",
    "- Ante cualquier vacilacion entre SI y otra, elegi la otra: ejecutar sin",
    "  permiso es peor que volver a preguntar.",
    "",
    "Responde SOLO con una palabra: SI, NO, PEDIDO, PREGUNTA o DUDA.",
  ].join("\n");
}

/**
 * Que quiere el admin con este mensaje, dado el plan pendiente.
 *
 * Nunca lanza. Ante error, demora o respuesta que no se entienda devuelve
 * "duda", que es el comportamiento actual: volver a preguntar sin descartar
 * el plan.
 */
export async function queQuiereElAdmin(
  mensaje: string,
  plan: string,
  opciones: { timeoutMs?: number } = {},
): Promise<QueQuiere> {
  const texto = String(mensaje || "").trim();
  if (!texto) return "duda";

  const timeout = opciones.timeoutMs ?? 6000;
  const prompt = promptDeIntencion(texto, plan);

  for (const proveedor of PROVEEDORES) {
    let config: any = null;
    try {
      config = configDe(proveedor);
    } catch {
      continue;
    }
    if (!config?.apiKey) continue;

    try {
      const client = createAIClient(config);
      const completion = await client.chat.completions.create(
        { model: config.model, messages: [{ role: "user", content: prompt }], temperature: 0, max_tokens: 8 },
        { timeout, maxRetries: 0 },
      );
      const bruto = String(completion.choices?.[0]?.message?.content || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-ZI]/g, "");
      const mapa: Record<string, QueQuiere> = {
        SI: "si", NO: "no", PEDIDO: "pedido", PREGUNTA: "pregunta", DUDA: "duda",
      };
      const leido = mapa[bruto] ?? "duda";
      logger.info({ proveedor, mensaje: texto.slice(0, 60), leido }, "[QueQuiere] intencion leida contra el plan pendiente");
      return leido;
    } catch (err: any) {
      logger.warn({ proveedor, err: err?.message }, "[QueQuiere] no se pudo preguntar, sigo con el siguiente");
    }
  }
  return "duda";
}
