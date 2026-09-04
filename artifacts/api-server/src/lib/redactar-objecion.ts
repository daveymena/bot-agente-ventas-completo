/**
 * ============================================================
 * QUE LA OBJECIÓN LA CONTESTE ALGUIEN, NO UNA PLANTILLA
 * ============================================================
 *
 * Reportado el 2026-09-03 leyendo una conversación real de WhatsApp:
 *
 *     cliente: lo voy a pensar
 *     bot:     Tranquilo, pensalo con calma 🙏 Si te surge cualquier duda,
 *              escribime y te la resuelvo.
 *
 * El admin lo dijo así: "no usa razonamiento ni nada, está respondiendo como
 * por inercia". Y tenía razón en el sentido más literal posible: esa frase es
 * una **cadena fija** en `objeciones.ts`, y `agent.ts` la devuelve ANTES de
 * llamar al modelo. Nadie pensó nada. No es que el modelo razonara mal: no
 * corrió.
 *
 * ── Y sin embargo la plantilla estaba bien puesta ────────────────────────
 *
 * Se agregó por una razón medida, no por pereza: dejando escribir al modelo,
 * a quien decía "lo voy a pensar" le contestaba con urgencia inventada, y a
 * quien desconfiaba con "somos serios" -- que es exactamente lo que dice el
 * que estafa. Sacar la plantilla sin más es volver a eso.
 *
 * El error no fue poner la plantilla: fue quedarse ahí. La elección no es
 * entre "una frase hecha" y "que el modelo invente". Es partir la
 * responsabilidad, que es lo que `hechos-intocables.ts` ya venía a resolver --
 * y que hasta hoy no llamaba NADIE fuera de sus propias pruebas: estaba
 * escrito, probado y desconectado.
 *
 *   · El SERVIDOR decide qué se dice: el precio, la garantía real, las
 *     características que el negocio cargó. Eso ya lo hace `responderObjecion`.
 *   · El MODELO decide cómo se dice, para ESTE cliente y ESTE producto.
 *   · La ADUANA (`entregaFinal`) deja pasar la redacción solo si no inventó ni
 *     cambió un solo hecho. Ante cualquier duda, gana la plantilla.
 *
 * Así, lo peor que puede pasar es exactamente lo que pasa hoy. Todo lo demás
 * es mejor.
 */
import { createAIClient, getProviderConfig } from "@workspace/integrations-openai-ai-server";
import { entregaFinal } from "./hechos-intocables";
import { logger } from "./logger";

/**
 * DeepSeek primero: es lo que el admin paga y lo medido más rápido (1,16 s
 * contra su API). Acá hay un cliente esperando en WhatsApp.
 */
const PROVEEDORES = ["deepseek", "groq", "opencode", "openai"];

export interface ContextoDeObjecion {
  /** Lo que el cliente escribió, tal cual. */
  mensajeDelCliente: string;
  /** El producto del que se está hablando, si se sabe cuál. */
  producto?: string | null;
  /** Los últimos turnos, para no repetir lo que ya se dijo. */
  historia?: string[];
  /** Cómo se presenta el negocio (tono, tratamiento). */
  tono?: string | null;
}

function construirPrompt(plantilla: string, ctx: ContextoDeObjecion): string {
  const historia = (ctx.historia || []).slice(-4).join("\n");
  return [
    "Sos un vendedor por WhatsApp. Un cliente puso una objeción y el sistema ya",
    "preparó la respuesta CORRECTA en cuanto al contenido. Tu trabajo es decir",
    "eso mismo, pero como se lo dirías a ESTA persona.",
    "",
    ctx.producto ? `PRODUCTO DEL QUE SE HABLA: ${ctx.producto}` : "",
    historia ? `ÚLTIMOS MENSAJES:\n${historia}` : "",
    `LO QUE ACABA DE ESCRIBIR EL CLIENTE: ${ctx.mensajeDelCliente.slice(0, 300)}`,
    "",
    `RESPUESTA PREPARADA POR EL SISTEMA:\n${plantilla}`,
    "",
    "Reglas, y son duras:",
    "- NO inventes NADA. Ni precios, ni garantías, ni plazos, ni cantidades de",
    "  alumnos, ni certificaciones, ni sedes. Si no está arriba, no existe.",
    "- No agregues urgencia ni escasez: nada de 'últimos cupos' ni 'solo por hoy'.",
    "  Ya dijo que no está listo; apurarlo lo pierde.",
    "- No uses adjetivos para convencer ('somos serios', 'la mejor inversión'):",
    "  eso lo dice igual el que estafa. Solo hechos que estén arriba.",
    "- Mismo largo o más corto. Es WhatsApp, no un folleto.",
    "- Hablale de vos, natural, como una persona. Un emoji como mucho.",
    "- Respondé SOLO con el mensaje para el cliente, sin comillas ni comentarios.",
    ctx.tono ? `- Tono del negocio: ${ctx.tono}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * Devuelve la objeción redactada para este cliente, o la plantilla tal cual.
 *
 * NUNCA lanza y NUNCA devuelve vacío: ante error, demora o cualquier duda sale
 * la plantilla, que es lo que se manda hoy. El piso de calidad no baja.
 */
export async function redactarObjecion(
  plantilla: string,
  ctx: ContextoDeObjecion,
  opciones: { timeoutMs?: number } = {},
): Promise<string> {
  const base = String(plantilla || "").trim();
  if (!base) return base;

  // Corto a propósito. Esto corre en el camino de una respuesta de WhatsApp, y
  // el problema que este proyecto persigue hace semanas es la demora: un
  // cliente esperando no puede pagar 15s porque el mensaje quede más lindo.
  // Si no llegó en 4s, sale la plantilla y listo.
  const timeout = opciones.timeoutMs ?? 4000;
  const prompt = construirPrompt(base, ctx);

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
          // Algo de temperatura: con 0 vuelve a escribir casi la plantilla y
          // todos los clientes reciben lo mismo, que es el defecto original.
          temperature: 0.7,
          max_tokens: 220,
        },
        { timeout, maxRetries: 0 },
      );
      const propuesta = String(completion.choices?.[0]?.message?.content || "")
        .trim()
        // El modelo a veces devuelve el mensaje entre comillas, como si lo
        // estuviera citando. Al cliente le llegarían las comillas.
        .replace(/^["'«]|["'»]$/g, "")
        .trim();

      // La aduana. Si tocó un monto, un enlace, una cuenta o un porcentaje,
      // vuelve la plantilla y queda el motivo en el log.
      const final = entregaFinal(base, propuesta, (motivo, detalle) => {
        logger.warn({ proveedor, motivo, detalle }, "[Objeción] La redacción no pasó la aduana -- va la plantilla");
      });
      if (final !== base) {
        logger.info({ proveedor }, "[Objeción] Contestada con redacción propia sobre los hechos del servidor");
      }
      return final;
    } catch (e: any) {
      logger.warn({ proveedor, err: e?.message }, "[Objeción] No se pudo redactar, sigo con el siguiente proveedor");
    }
  }

  return base;
}
