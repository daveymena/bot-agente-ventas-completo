/**
 * Telegram ↔ Atlas: el dueño le escribe al bot y Atlas le contesta.
 *
 * Pedido del dueño (19-09-2026): "¿cómo hago para que Atlas tenga
 * comunicación directa con Telegram, que si le hablo me responda?". Hasta acá
 * Telegram era solo salida (avisos). Esto lo vuelve conversación.
 *
 * Cómo funciona, sin inventar nada nuevo:
 *  - Un sondeo largo por negocio (`getUpdates`, sin webhook: no hace falta
 *    exponer nada ni tocar el dominio). Un solo sondeo por token, porque
 *    Telegram devuelve 409 si dos procesos leen el mismo bot.
 *  - Solo se atiende al chat configurado en el panel (`tenants.apiKeys.
 *    telegram.model`). Cualquier otra persona que le escriba al bot se ignora:
 *    Atlas puede ejecutar acciones del negocio.
 *  - El mensaje entra por la MISMA puerta que el chat del panel
 *    (`POST /api/code-agent/operator-opencode`), en bucle local con la cookie
 *    firmada del negocio. Así valen las mismas reglas: memoria por sesión
 *    (`sessionId: "telegram"`), plan → "sí" para ejecutar, "detener", audio.
 *    No se duplica ni una línea del cerebro de Atlas.
 *  - Las notas de voz de Telegram se bajan y se mandan como `audio`: la ruta
 *    ya transcribe.
 */
import { createHmac } from "node:crypto";
import { db, tenants } from "@workspace/db";
import { logger } from "./logger";
import { describirImagen } from "./media-entrante";
import { configTelegramDelTenant, enviarTelegram, type ConfigTelegram } from "./telegram";

type Sondeo = { cfg: ConfigTelegram; offset: number; parar: boolean };
const sondeos = new Map<number, Sondeo>();

const api = (token: string, metodo: string) => `https://api.telegram.org/bot${token}/${metodo}`;

/** Cookie `tenant_id` firmada igual que cookie-parser (s:<valor>.<hmac base64 sin =>). */
export function cookieFirmadaDeTenant(tenantId: number): string {
  const secreto = process.env.COOKIE_SECRET || "";
  const valor = String(tenantId);
  const firma = createHmac("sha256", secreto).update(valor).digest("base64").replace(/=+$/, "");
  return `tenant_id=${encodeURIComponent(`s:${valor}.${firma}`)}`;
}

function urlLocal(path: string): string {
  const port = Number(process.env.PORT) || 3000;
  return `http://127.0.0.1:${port}${path}`;
}

async function accionEscribiendo(cfg: ConfigTelegram): Promise<void> {
  try {
    await fetch(api(cfg.botToken, "sendChatAction"), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, action: "typing" }), signal: AbortSignal.timeout(8000),
    });
  } catch { /* cosmético */ }
}

/** Nota de voz → data URL para la ruta de Atlas (que ya transcribe). */
async function audioComoDataUrl(cfg: ConfigTelegram, fileId: string, mime: string): Promise<string | null> {
  try {
    const r = await fetch(api(cfg.botToken, `getFile?file_id=${encodeURIComponent(fileId)}`), { signal: AbortSignal.timeout(10000) });
    const j: any = await r.json().catch(() => ({}));
    const ruta = j?.result?.file_path;
    if (!ruta) return null;
    const f = await fetch(`https://api.telegram.org/file/bot${cfg.botToken}/${ruta}`, { signal: AbortSignal.timeout(30000) });
    const buf = Buffer.from(await f.arrayBuffer());
    return `data:${mime || "audio/ogg"};base64,${buf.toString("base64")}`;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[TelegramAtlas] no se pudo bajar la nota de voz");
    return null;
  }
}

/** Foto → descripción con la misma cadena de visión del bot (Ollama local,
 *  respaldo DeepSeek). Se manda como texto a Atlas: la puerta del operador
 *  solo acepta prompt/audio, así que la imagen viaja ya leída. */
async function fotoComoDescripcion(cfg: ConfigTelegram, fileId: string): Promise<string | null> {
  try {
    const r = await fetch(api(cfg.botToken, `getFile?file_id=${encodeURIComponent(fileId)}`), { signal: AbortSignal.timeout(10000) });
    const j: any = await r.json().catch(() => ({}));
    const ruta = j?.result?.file_path;
    if (!ruta) return null;
    const f = await fetch(`https://api.telegram.org/file/bot${cfg.botToken}/${ruta}`, { signal: AbortSignal.timeout(30000) });
    const buf = Buffer.from(await f.arrayBuffer());
    if (!buf.length) return null;
    return await describirImagen(buf, "image/jpeg");
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[TelegramAtlas] no se pudo leer la foto");
    return null;
  }
}

/** Manda el pedido a Atlas por la puerta normal y devuelve el texto para el chat. */
export async function preguntarleAAtlas(tenantId: number, entrada: { prompt?: string; audio?: string; mimeAudio?: string }): Promise<string> {
  const cuerpo: any = { sessionId: "telegram", history: [] };
  if (entrada.audio) { cuerpo.audio = entrada.audio; cuerpo.mimeAudio = entrada.mimeAudio; }
  else cuerpo.prompt = entrada.prompt;
  const r = await fetch(urlLocal("/api/code-agent/operator-opencode"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieFirmadaDeTenant(tenantId) },
    body: JSON.stringify(cuerpo),
    // Un turno de Atlas puede tardar más de 2 minutos (investiga, crea landings…).
    signal: AbortSignal.timeout(Number(process.env.TELEGRAM_ATLAS_TIMEOUT_MS || 270000)),
  });
  const j: any = await r.json().catch(() => ({}));
  if (j?.error) return `⚠️ ${j.error}`;
  let texto = String(j?.reply || "").trim() || "No tengo respuesta para eso ahora mismo.";
  if (j?.status === "awaiting_confirmation" && !/\bs[ií]\b/i.test(texto.slice(-120))) {
    texto += "\n\nRespondé *sí* para que lo ejecute, o decime qué cambiar.";
  }
  if (j?.needsContinuation) texto += "\n\n_(Me quedé a mitad: escribime \"seguí\" y continúo.)_";
  return texto;
}

async function atenderMensaje(tenantId: number, s: Sondeo, m: any): Promise<void> {
  const chatId = String(m?.chat?.id || "");
  if (chatId !== s.cfg.chatId) {
    logger.warn({ tenantId, chatId }, "[TelegramAtlas] mensaje de un chat que no es el del dueño -- se ignora");
    return;
  }
  const texto = String(m.text || m.caption || "").trim();
  if (/^\/start\b/.test(texto)) {
    await enviarTelegram(s.cfg, "👋 Soy Atlas. Por acá podés pedirme lo mismo que en el panel: ventas, pedidos, Dropi, landings, anuncios, informes. Entiendo texto, notas de voz y fotos.");
    return;
  }
  const voz = m.voice || m.audio;
  const fotos = Array.isArray(m.photo) ? m.photo : [];
  if (!texto && !voz && !fotos.length) {
    await enviarTelegram(s.cfg, "Por ahora leo texto, notas de voz y fotos. Archivos todavía no.");
    return;
  }
  const escribiendo = setInterval(() => { void accionEscribiendo(s.cfg); }, 4500);
  void accionEscribiendo(s.cfg);
  try {
    let respuesta: string;
    if (voz && !texto) {
      const audio = await audioComoDataUrl(s.cfg, voz.file_id, voz.mime_type || "audio/ogg");
      respuesta = audio ? await preguntarleAAtlas(tenantId, { audio, mimeAudio: voz.mime_type || "audio/ogg" }) : "No pude bajar la nota de voz. ¿Me lo escribís?";
    } else {
      let prompt = texto;
      // La foto se lee ANTES con visión y viaja como texto: Atlas la "ve"
      // aunque su puerta solo acepte prompt.
      const mejorFoto = fotos.length ? fotos[fotos.length - 1] : null;
      if (mejorFoto?.file_id) {
        const vista = await fotoComoDescripcion(s.cfg, mejorFoto.file_id);
        const pie = vista ? `[Foto recibida: ${vista}]` : "[Foto recibida pero no la pude ver bien]";
        prompt = `${pie}${texto ? ` ${texto}` : ""}`;
      }
      respuesta = await preguntarleAAtlas(tenantId, { prompt });
    }
    const envio = await enviarTelegram(s.cfg, respuesta);
    if (!envio.ok) logger.warn({ tenantId, err: envio.error }, "[TelegramAtlas] no se pudo enviar la respuesta");
  } catch (e: any) {
    logger.error({ tenantId, err: e?.message }, "[TelegramAtlas] falló el turno");
    await enviarTelegram(s.cfg, `⚠️ No pude terminar: ${String(e?.message || e).slice(0, 200)}. Probá de nuevo.`);
  } finally {
    clearInterval(escribiendo);
  }
}

async function bucle(tenantId: number, s: Sondeo): Promise<void> {
  // Se descartan los updates viejos: lo que el dueño escribió mientras el
  // servidor estaba caído no debe ejecutarse a ciegas al arrancar.
  try {
    const r = await fetch(api(s.cfg.botToken, "getUpdates?offset=-1&timeout=0"), { signal: AbortSignal.timeout(10000) });
    const j: any = await r.json().catch(() => ({}));
    const ultimo = j?.result?.[j.result.length - 1]?.update_id;
    if (typeof ultimo === "number") s.offset = ultimo + 1;
  } catch { /* se sigue desde 0 */ }
  let fallosSeguidos = 0;
  while (!s.parar) {
    try {
      const r = await fetch(api(s.cfg.botToken, `getUpdates?timeout=50&offset=${s.offset}&allowed_updates=%5B%22message%22%5D`), { signal: AbortSignal.timeout(65000) });
      const j: any = await r.json().catch(() => ({}));
      if (!j.ok) {
        if (r.status === 409) logger.warn({ tenantId }, "[TelegramAtlas] otro proceso lee el mismo bot (409) -- se reintenta en 30s");
        else logger.warn({ tenantId, status: r.status, desc: j.description }, "[TelegramAtlas] getUpdates falló");
        await new Promise((ok) => setTimeout(ok, r.status === 409 ? 30000 : Math.min(60000, 2000 * 2 ** fallosSeguidos++)));
        continue;
      }
      fallosSeguidos = 0;
      for (const u of j.result || []) {
        if (s.parar) break;
        const m = u.message;
        // Los mensajes se atienden en orden, uno por vez: el siguiente espera
        // a que Atlas termine el turno anterior (misma sesión, misma memoria).
        if (m) await atenderMensaje(tenantId, s, m);
        s.offset = u.update_id + 1;
      }
    } catch (e: any) {
      if (s.parar) break;
      logger.warn({ tenantId, err: e?.message }, "[TelegramAtlas] sondeo interrumpido");
      await new Promise((ok) => setTimeout(ok, Math.min(60000, 2000 * 2 ** fallosSeguidos++)));
    }
  }
}

/** Arranca (o reinicia) el sondeo del negocio con su configuración actual. */
export async function iniciarAtlasEnTelegram(tenantId: number): Promise<boolean> {
  detenerAtlasEnTelegram(tenantId);
  const cfg = await configTelegramDelTenant(tenantId);
  if (!cfg) return false;
  const s: Sondeo = { cfg, offset: 0, parar: false };
  sondeos.set(tenantId, s);
  void bucle(tenantId, s).finally(() => { if (sondeos.get(tenantId) === s) sondeos.delete(tenantId); });
  logger.info({ tenantId, chatId: cfg.chatId }, "[TelegramAtlas] escuchando al dueño por Telegram");
  return true;
}

export function detenerAtlasEnTelegram(tenantId: number): void {
  const s = sondeos.get(tenantId);
  if (s) { s.parar = true; sondeos.delete(tenantId); }
}

export function atlasEscuchaEnTelegram(tenantId: number): boolean {
  return sondeos.has(tenantId);
}

/**
 * Al arrancar: un sondeo por cada negocio con Telegram configurado.
 *
 * Medido 19-09 21:25: la primera versión corría en el instante en que se
 * cargaba app.ts, antes de que la base estuviera lista, y el error se tragaba
 * en silencio → `atlasEscucha:false` con Telegram conectado. Ahora espera
 * unos segundos y, si la base todavía no responde, reintenta con pausa.
 */
export function iniciarAtlasEnTelegramParaTodos(): void {
  if (process.env.TELEGRAM_ATLAS === "off") return;
  const primeraMs = Number(process.env.TELEGRAM_ATLAS_PRIMERA_MS || 15000);
  setTimeout(() => { void arrancarTodosConReintentos(); }, primeraMs).unref?.();
}

async function arrancarTodosConReintentos(intento = 1): Promise<void> {
  try {
    const filas = await db.select().from(tenants);
    const conClave = (filas as any[]).filter((f) => f?.apiKeys?.telegram?.apiKey);
    // Sin ninguna clave guardada pero con TELEGRAM_BOT_TOKEN en el entorno:
    // instalación de un solo cliente; escucha el negocio administrador.
    const objetivo = conClave.length ? conClave : (process.env.TELEGRAM_BOT_TOKEN ? (filas as any[]).filter((f) => f.isAdmin).slice(0, 1) : []);
    for (const f of objetivo) await iniciarAtlasEnTelegram(Number(f.id)).catch((e: any) => logger.warn({ tenantId: f.id, err: e?.message }, "[TelegramAtlas] no arrancó"));
    logger.info({ negocios: objetivo.length }, "[TelegramAtlas] arranque completo");
  } catch (e: any) {
    if (intento >= 6) { logger.error({ err: e?.message }, "[TelegramAtlas] no se pudo listar los negocios tras 6 intentos"); return; }
    logger.warn({ err: e?.message, intento }, "[TelegramAtlas] la base no respondió; se reintenta en 20s");
    setTimeout(() => { void arrancarTodosConReintentos(intento + 1); }, 20000).unref?.();
  }
}
