/**
 * ============================================================
 * LEER LA BANDEJA — la fuente que el cliente no puede falsificar
 * ============================================================
 *
 * `pagos-por-correo.ts` parsea UN correo. Esto lee la bandeja del dueño por
 * IMAP y devuelve los avisos de plata recibida que haya en la ventana.
 *
 * Solo Gmail por ahora: es lo que usa el negocio y la clave de aplicación ya
 * está cargada en SMTP_USER/SMTP_PASS. La misma clave de aplicación sirve para
 * IMAP (imap.gmail.com:993), así que no hace falta ninguna credencial nueva.
 */

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { bancoDelRemitente, leerCorreoDePago, type PagoAvisadoPorElBanco } from "./pagos-por-correo";

/** Cuántos avisos de banco se miran como máximo. */
const MAX_AVISOS = 30;

/**
 * Convierte el HTML de un correo a texto plano.
 *
 * Nequi manda el aviso como `multipart/alternative` con SOLO `text/html`, así
 * que `mailparser` devuelve `text` vacío y hay que sacar el texto del HTML. Es
 * un strip a propósito tosco: para esto alcanza con recuperar la frase
 * "Recibiste X de Y el Z", no hace falta un render fiel de la tabla.
 */
function htmlATexto(html: string): string {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(td|tr|p|div|h[1-6]|li|table)>/gi, "\n")
    .replace(/<(td|th)[^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]*\n[ \t]*\n+/g, "\n\n")
    .trim();
}

/**
 * Lee la bandeja del dueño y devuelve los avisos de plata RECIBIDA de bancos
 * reales que llegaron desde `desde` (inclusive).
 *
 * Nequi manda el aviso como `multipart/alternative` con SOLO `text/html` (no
 * hay parte `text/plain`), y encima en quoted-printable. Por eso no alcanza
 * con pedirle a IMAP "la parte de texto": hay que parsear el MIME completo con
 * `mailparser`, que decodifica el quoted-printable y convierte el HTML a texto.
 *
 * Devuelve lista vacía si no hay credenciales, si el IMAP falla o si no hay
 * nada. Nunca tira: un pago no se pierde por no poder leer el correo, se
 * queda en `pending` y el aviso normal (la captura) igual sale.
 */
export async function leerAvisosDeBanco(opts: {
  user: string;
  pass: string;
  /** Solo se miran correos de esta fecha en adelante. */
  desde: Date;
  /** Host IMAP. Por defecto el de Gmail. */
  host?: string;
}): Promise<PagoAvisadoPorElBanco[]> {
  const { user, pass, desde, host = "imap.gmail.com" } = opts;
  if (!user || !pass) return [];

  const client = new ImapFlow({
    host,
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
    socketTimeout: 20_000,
  });

  try {
    await client.connect();
  } catch (e: any) {
    console.error(`[Pago-correo] No se pudo conectar a ${host}: ${e?.message}`);
    return [];
  }

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const encontrados: PagoAvisadoPorElBanco[] = [];
      // `since` filtra por la fecha interna (de recepción) del servidor, que es
      // la que importa para cruzar con el comprobante, no la del header.
      for await (const msg of client.fetch(
        { since: desde },
        { envelope: true, internalDate: true, source: true },
      )) {
        if (encontrados.length >= MAX_AVISOS) break;

        // Filtrar por dominio de banco ANTES de parsear: parsear el MIME de
        // cada correo de la bandeja es caro, y solo interesan los del banco.
        const from = msg.envelope?.from?.[0]?.address || "";
        if (!bancoDelRemitente(from)) continue;

        const subject = msg.envelope?.subject || "";
        const fecha = msg.internalDate
          ? new Date(msg.internalDate as any)
          : msg.envelope?.date || new Date();

        let cuerpo = "";
        try {
          const parsed = await simpleParser(msg.source as Buffer);
          cuerpo = String(parsed.text || "").trim();
          // Nequi no manda text/plain: solo HTML. Ahí el texto sale del HTML.
          if (!cuerpo && parsed.html) cuerpo = htmlATexto(String(parsed.html));
        } catch {
          cuerpo = "";
        }

        const pago = leerCorreoDePago({ remitente: from, asunto: subject, cuerpo, fecha });
        if (pago) encontrados.push(pago);
      }
      return encontrados;
    } finally {
      lock.release();
    }
  } catch (e: any) {
    console.error(`[Pago-correo] Fallo leyendo la bandeja: ${e?.message}`);
    return [];
  } finally {
    await client.logout().catch(() => {});
  }
}
