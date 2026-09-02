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

/** Los proveedores que se prueban, en orden. El primero que conteste gana. */
const PROVEEDORES = ["groq", "deepseek", "opencode", "openai"];

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
  // Un mensaje largo no es una confirmación: es una instrucción nueva.
  if (!texto || texto.length > 120) return false;

  const timeout = opciones.timeoutMs ?? 6000;
  const prompt = construirPrompt(texto, plan);

  for (const proveedor of PROVEEDORES) {
    let config: any = null;
    try {
      config = getProviderConfig(proveedor as any);
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
