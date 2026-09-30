/**
 * Telegram como canal de avisos del dueño.
 *
 * Pedido del dueño (19-09-2026): "que envíe los reportes y todo lo que pasa en
 * la automatización (pedidos y todo eso) por Telegram". No había nada de
 * Telegram en el proyecto. Esto es lo mínimo que hace falta: un bot (token de
 * @BotFather) y el chat al que escribir. Se guarda cifrado por negocio con el
 * mismo mecanismo que las claves de IA (`tenants.apiKeys.telegram`:
 * apiKey = token del bot, model = chat id), con respaldo en el entorno
 * (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID) para instalaciones de un solo cliente.
 */
import { logger } from "./logger";

export interface ConfigTelegram { botToken: string; chatId: string }

export async function configTelegramDelTenant(tenantId: number): Promise<ConfigTelegram | null> {
  try {
    const { clavesDelTenant } = await import("./ai-keys-tenant");
    const c = (await clavesDelTenant(tenantId))?.telegram;
    if (c?.apiKey && c?.model) return { botToken: String(c.apiKey).trim(), chatId: String(c.model).trim() };
  } catch { /* sin claves */ }
  // Respaldo del .env SOLO para el dueño del servidor (29-09-2026): los
  // pedidos y reportes de otro negocio sin Telegram propio le llegaban al
  // Telegram del dueño. Ver respaldo-del-dueno.ts.
  const { envSoloDelDueno } = await import("./respaldo-del-dueno");
  const botToken = envSoloDelDueno(tenantId, process.env.TELEGRAM_BOT_TOKEN).trim();
  const chatId = envSoloDelDueno(tenantId, process.env.TELEGRAM_CHAT_ID).trim();
  return botToken && chatId ? { botToken, chatId } : null;
}

export async function guardarConfigTelegram(tenantId: number, botToken: string, chatId: string): Promise<void> {
  const { guardarClaveDeTenant } = await import("./ai-keys-tenant");
  await guardarClaveDeTenant(tenantId, "telegram", { apiKey: botToken.trim(), model: chatId.trim() });
}

/** Texto de WhatsApp (*negrita*, _cursiva_) → Telegram en HTML, que no se rompe con caracteres raros. */
function aHtmlTelegram(texto: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc(String(texto || ""))
    .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, "$1<i>$2</i>");
}

export async function enviarTelegram(cfg: ConfigTelegram, texto: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const partes: string[] = [];
    // Telegram corta en 4096; se parte por líneas.
    let actual = "";
    for (const linea of aHtmlTelegram(texto).split("\n")) {
      if ((actual + "\n" + linea).length > 3800) { partes.push(actual); actual = linea; } else actual = actual ? `${actual}\n${linea}` : linea;
    }
    if (actual) partes.push(actual);
    for (const parte of partes) {
      const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: cfg.chatId, text: parte, parse_mode: "HTML", disable_web_page_preview: false }),
        signal: AbortSignal.timeout(15000),
      });
      const j: any = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) return { ok: false, error: j.description || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** ¿El token es de un bot válido? Devuelve su nombre. */
export async function probarBotTelegram(botToken: string): Promise<{ ok: boolean; nombre?: string; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken.trim()}/getMe`, { signal: AbortSignal.timeout(10000) });
    const j: any = await res.json().catch(() => ({}));
    if (!j.ok) return { ok: false, error: j.description || `HTTP ${res.status}` };
    return { ok: true, nombre: j.result?.username ? `@${j.result.username}` : j.result?.first_name };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Chats que le escribieron al bot recientemente (para descubrir el chat id
 * sin webhook: el dueño le manda "hola" al bot y acá aparece).
 */
export async function chatsRecientes(botToken: string): Promise<Array<{ chatId: string; nombre: string; ultimoTexto: string }>> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken.trim()}/getUpdates?limit=50`, { signal: AbortSignal.timeout(10000) });
    const j: any = await res.json().catch(() => ({}));
    if (!j.ok) return [];
    const vistos = new Map<string, { chatId: string; nombre: string; ultimoTexto: string }>();
    for (const u of j.result || []) {
      const m = u.message || u.channel_post || u.edited_message;
      const chat = m?.chat;
      if (!chat?.id) continue;
      const nombre = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || String(chat.id);
      vistos.set(String(chat.id), { chatId: String(chat.id), nombre, ultimoTexto: String(m.text || "").slice(0, 60) });
    }
    return [...vistos.values()];
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[Telegram] getUpdates falló");
    return [];
  }
}
