/**
 * Entender la media que manda el cliente (fotos y notas de voz).
 *
 * Hasta ahora WhatsApp descartaba en silencio todo mensaje que fuera SOLO
 * media: la foto sin texto, la nota de voz, el comprobante de pago. El filtro
 * que los tiraba decia ser "anti-loop" (media del bot que vuelve a entrar),
 * pero el reingreso del bot ya se ataja antes con fromMe, asi que lo unico que
 * llegaba a ese filtro era media del CLIENTE. Resultado: el cliente mandaba el
 * pantallazo del pago y el bot no contestaba nada.
 *
 * Que se puede entender depende de lo que sepa hacer cada proveedor, no de lo
 * que prometa. Estado medido (16-08-2026, no supuesto):
 *   - Audio: Groq expone whisper-large-v3 -> transcripcion real.
 *   - Imagen: NINGUN modelo de OpenCode Go ve imagenes. Se probaron los 18 que
 *     responden, incluido gpt-5.6-luna, que ante una imagen devuelve el
 *     mensaje VACIO sin error -- el peor modo de fallo, porque parece que
 *     funciona. Por eso la vision va por una lista aparte y configurable
 *     (VISION_MODELS), y si ninguno contesta se degrada con dignidad en vez de
 *     inventar lo que la foto dice.
 */

import { getProviderConfig } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

/** Modelos con vision, en orden. "proveedor|modelo" separados por coma. */
function modelosDeVision(): Array<{ proveedor: string; modelo: string }> {
  const crudo = process.env.VISION_MODELS
    // Ninguno de los proveedores que ya estan en el entorno (Go, Groq) ve
    // imagenes, asi que el defecto apunta a OpenRouter, que si tiene modelos
    // multimodales gratuitos. Si no hay clave de OpenRouter, esto no resuelve
    // y el flujo cae al plan B sin romperse.
    //
    // Estos IDs estan verificados contra el catalogo publico de OpenRouter
    // (/api/v1/models, campo input_modalities incluye "image"). No es un
    // detalle menor: la primera version de esta lista traia dos modelos que
    // NO existen, y un ID inexistente falla igual de silencioso que un modelo
    // sin vision.
    || "openrouter|nvidia/nemotron-nano-12b-v2-vl:free,openrouter|google/gemma-4-31b-it:free";
  return crudo
    .split(",")
    .map((par) => par.trim())
    .filter(Boolean)
    .map((par) => {
      const i = par.indexOf("|");
      return { proveedor: par.slice(0, i).trim(), modelo: par.slice(i + 1).trim() };
    })
    .filter((p) => p.proveedor && p.modelo);
}

/**
 * Transcribe una nota de voz con Whisper (Groq).
 * Devuelve null si no hay clave o si el audio no se pudo transcribir.
 */
export async function transcribirAudio(audio: Buffer, mime = "audio/ogg"): Promise<string | null> {
  const cfg = getProviderConfig("groq");
  if (!cfg?.apiKey) {
    logger.warn("[Media] sin clave de Groq: no se puede transcribir el audio");
    return null;
  }
  try {
    const ext = mime.includes("mp4") ? "m4a" : mime.includes("mpeg") ? "mp3" : "ogg";
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), `nota.${ext}`);
    form.append("model", process.env.WHISPER_MODEL || "whisper-large-v3");
    form.append("language", "es");
    form.append("response_format", "json");

    const r = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    if (!r.ok) {
      logger.warn({ status: r.status, cuerpo: (await r.text()).slice(0, 200) }, "[Media] Whisper rechazo el audio");
      return null;
    }
    const j: any = await r.json();
    const texto = String(j?.text || "").trim();
    if (!texto) return null;
    logger.info({ largo: texto.length }, "[Media] nota de voz transcrita");
    return texto;
  } catch (e: any) {
    logger.error({ err: e?.message }, "[Media] fallo transcribiendo el audio");
    return null;
  }
}

/**
 * Describe una foto con el primer modelo con vision que conteste.
 *
 * Se le pide una descripcion util para VENDER: si es un comprobante de pago,
 * que lo diga; si es un producto, cual parece; si es un pantallazo, que dice.
 * Devuelve null si ningun modelo pudo verla -- explicitamente null, para que
 * quien llama sepa que NO hay informacion en vez de recibir una invencion.
 */
export async function describirImagen(imagen: Buffer, mime = "image/jpeg"): Promise<string | null> {
  const b64 = imagen.toString("base64");
  const instruccion =
    "Describi esta imagen en 1-2 frases, en espanol, para un vendedor por WhatsApp. "
    + "Si es un comprobante o pantallazo de pago, deci que es un comprobante e incluí el monto y la fecha si se leen. "
    + "Si es un producto, deci que producto parece. Si tiene texto legible, transcribí lo importante. "
    + "No inventes nada que no se vea.";

  for (const { proveedor, modelo } of modelosDeVision()) {
    const cfg = getProviderConfig(proveedor);
    if (!cfg?.apiKey) continue;
    try {
      const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: modelo,
          max_tokens: 180,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: instruccion },
              { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
            ],
          }],
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!r.ok) {
        logger.warn({ proveedor, modelo, status: r.status }, "[Media] modelo de vision rechazo la imagen");
        continue;
      }
      const j: any = await r.json();
      const texto = String(j?.choices?.[0]?.message?.content || "").trim();
      // Luna devuelve 200 con el mensaje vacio cuando le mandan una imagen:
      // un vacio NO es una descripcion, es un modelo que no ve.
      if (!texto) {
        logger.warn({ proveedor, modelo }, "[Media] el modelo contesto vacio: no ve imagenes");
        continue;
      }
      logger.info({ proveedor, modelo }, "[Media] imagen descrita");
      return texto;
    } catch (e: any) {
      logger.warn({ proveedor, modelo, err: e?.message }, "[Media] fallo el modelo de vision");
    }
  }
  return null;
}
