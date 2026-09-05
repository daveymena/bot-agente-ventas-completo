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

/**
 * El unico modelo con vision que este proyecto tiene realmente pagado.
 *
 * Medido contra la API el 2026-09-05: describe una imagen correctamente. Ya
 * habia sido descartado por "contesta vacio", y el sintoma era cierto pero la
 * causa era otra: es un modelo de razonamiento, y con poco `max_tokens` gasta
 * todo el presupuesto en `reasoning_content` y devuelve `content` vacio. Con
 * espacio suficiente responde bien (43 tokens de razonamiento + 6 de
 * respuesta). Por eso este archivo pide un `max_tokens` holgado.
 */
const VISION_DE_RESERVA = { proveedor: "deepseek", modelo: "deepseek-v4-flash-vision-exp" };

/** Modelos con vision, en orden. "proveedor|modelo" separados por coma. */
function modelosDeVision(): Array<{ proveedor: string; modelo: string }> {
  const configurados = String(process.env.VISION_MODELS || "")
    .split(",")
    .map((par) => par.trim())
    .filter(Boolean)
    .map((par) => {
      const i = par.indexOf("|");
      return { proveedor: par.slice(0, i).trim(), modelo: par.slice(i + 1).trim() };
    })
    .filter((p) => p.proveedor && p.modelo);

  // El respaldo va SIEMPRE al final, aunque `VISION_MODELS` traiga algo.
  // Durante semanas esa variable apunto en produccion a tres candidatos de
  // OpenRouter y NVIDIA sin que existiera clave de ninguno de los dos (y uno
  // de los modelos ni siquiera existia en el catalogo), asi que la lista se
  // agotaba entera y el bot no veia una sola imagen. Una lista configurable
  // que se puede quedar sin ninguna opcion valida necesita piso.
  const yaEsta = configurados.some(
    (p) => p.proveedor === VISION_DE_RESERVA.proveedor && p.modelo === VISION_DE_RESERVA.modelo,
  );
  return yaEsta ? configurados : [...configurados, VISION_DE_RESERVA];
}

/**
 * La extensión que le corresponde a un tipo de audio.
 *
 * Exportada para poder probarla: es una tabla chica y aburrida, y justo por
 * eso es donde se cuela el caso que nadie miró -- `webm` faltaba, que es lo
 * que graba Chrome.
 */
export function extensionDeAudio(mime: string): string {
  const m = String(mime || "").toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("wav")) return "wav";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("flac")) return "flac";
  // ogg/opus y lo que no se reconozca: es lo que manda WhatsApp y era el
  // único caso cuando esto se escribió.
  return "ogg";
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
    // ── La extensión tiene que coincidir con lo que va adentro ────────────
    //
    // Whisper decide cómo decodificar mirando el nombre del archivo, así que
    // mandar audio webm llamado `nota.ogg` es pedirle que lo lea mal.
    //
    // `webm` y `wav` no estaban, y son justamente lo que graba un NAVEGADOR:
    // `MediaRecorder` da `audio/webm;codecs=opus` en Chrome y `audio/mp4` en
    // Safari. Mientras esto solo recibía notas de voz de WhatsApp (ogg) no
    // importaba; con el micrófono de Atlas, es la ruta normal.
    const ext = extensionDeAudio(mime);
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
  // El prompt le pide CAUTELA, no precisión. Un modelo de visión que afirma
  // montos y fechas es justo el que termina describiendo un Excel como "un
  // comprobante de transferencia con valor, fecha y banco" (caso real
  // 2026-09-05). Para detectar un comprobante alcanza con saber el TIPO de
  // imagen; los datos exactos los confirma una persona, no un modelo.
  const instruccion =
    "Describí en 1-2 frases, en español, QUÉ TIPO de imagen es esta "
    + "(por ejemplo: comprobante de pago, hoja de cálculo de Excel, captura de pantalla, foto de un producto, etc.). "
    + "NO afirmes montos, fechas, nombres de bancos ni números salvo que los leas con total claridad. "
    + "Si no estás seguro de qué es, decí 'no está claro'. No inventes nada que no se vea con claridad.";

  for (const { proveedor, modelo } of modelosDeVision()) {
    const cfg = getProviderConfig(proveedor);
    if (!cfg?.apiKey) continue;
    try {
      const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: modelo,
          max_tokens: 500,
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
