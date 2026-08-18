import { eq, inArray, desc, and } from "drizzle-orm";
import { transcribirAudio, describirImagen } from "./media-entrante";
import { contextoDeMoneda } from "./moneda-por-pais";
import path from "node:path";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import QRCode from "qrcode";
import {
  db,
  conversations,
  messages,
  activityEvents,
  leads,
  products,
  productCategories,
} from "@workspace/db";
import { logger } from "./logger";
import { runAgentReply } from "./agent";
import { toEmojiStyle } from "./conversation-engine";
import { createAIClient, getProviderConfig } from "@workspace/integrations-openai-ai-server";
import { getMessageHandler } from "./services/message-handler";
import { tenantManager, addTenantToInsert, type TenantContext } from "./tenantManager";
import { 
  makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState, 
  fetchLatestBaileysVersion, 
  downloadMediaMessage,
  proto
} from "@whiskeysockets/baileys";
import { trackWhatsAppCost } from "../middleware/rateLimiting";

// ─── Simulación de escritura humana ───────────────────────────────────────────
// Muestra "escribiendo..." en WhatsApp antes de enviar, con delay proporcional al texto

const TYPING_WPM = 800;          // Palabras por minuto (acelerado)
const TYPING_MIN_MS = 300;       // Mínimo siempre visible
const TYPING_MAX_MS = 1500;      // Máximo para no hacer esperar demasiado
const READ_DELAY_MS = 100;       // Pausa antes de empezar a "escribir" (simula leer el mensaje)

function calcTypingDelay(text: string): number {
  const words = text.trim().split(/\s+/).length;
  const ms = Math.round((words / TYPING_WPM) * 60_000);
  return Math.min(Math.max(ms, TYPING_MIN_MS), TYPING_MAX_MS);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Caché global de IDs de mensajes procesados para evitar duplicados/bucle
const processedMessageIds = new Set<string>();

// Función de diagnóstico para mensajes problemáticos
function diagnoseMessage(msgObj: any): { 
  diagnosis: string; 
  possibleText: string | null; 
  recommendations: string[] 
} {
  const keys = Object.keys(msgObj || {});
  const recommendations: string[] = [];
  let possibleText: string | null = null;
  
  // Buscar texto en cualquier lugar del objeto
  const findTextInObject = (obj: any, path = ""): string[] => {
    const texts: string[] = [];
    if (typeof obj === 'string' && obj.length > 2 && /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(obj)) {
      texts.push(`${path}: "${obj}"`);
    } else if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        texts.push(...findTextInObject(value, path ? `${path}.${key}` : key));
      }
    }
    return texts;
  };
  
  const allTexts = findTextInObject(msgObj);
  if (allTexts.length > 0) {
    possibleText = allTexts[0].split(': "')[1]?.replace('"', '') || null;
  }
  
  let diagnosis = `Mensaje con claves: [${keys.join(', ')}]`;
  
  if (keys.includes('stickerMessage')) {
    diagnosis += " - Es un sticker";
    recommendations.push("Los stickers no contienen texto extraíble");
  }
  
  if (keys.includes('audioMessage')) {
    diagnosis += " - Es un audio";
    recommendations.push("Implementar transcripción de audio si es necesario");
  }
  
  if (keys.includes('locationMessage')) {
    diagnosis += " - Es una ubicación";
    recommendations.push("Extraer información de ubicación si es relevante");
  }
  
  if (keys.includes('contactMessage')) {
    diagnosis += " - Es un contacto";
    recommendations.push("Extraer información del contacto compartido");
  }
  
  if (keys.includes('reactionMessage')) {
    diagnosis += " - Es una reacción";
    recommendations.push("Las reacciones no requieren respuesta del bot");
  }
  
  if (allTexts.length > 0) {
    diagnosis += ` - Posible texto encontrado en: ${allTexts[0].split(':')[0]}`;
  }
  
  return { diagnosis, possibleText, recommendations };
}

export type AgentReplyPart = {
  kind: "text" | "card";
  content?: string;
  productId?: number;
  paymentOnly?: boolean;
};
import { PaymentGateway } from "./payments";
import { retryWithBackoff, notifyOperatorOfFailure } from "./fallbackSystem";
import { processMessageForLeadScoring } from "./leadScoring";

import { variante } from "./variacion";
function formatPriceForWa(price: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${currency} ${price.toFixed(2)}`;
  }
}

/**
 * Carga los bytes de la imagen REAL de un producto.
 *
 * Antes esto se resolvía mal en producción y el bot terminaba mandando una
 * foto de stock de Unsplash elegida por palabra clave del nombre — es decir,
 * al cliente se le enseñaba una imagen que NO era el producto que compraba.
 * Dos errores se sumaban:
 *
 *  1. La ruta local se buscaba en "<cwd>/../ventas-pro/public", pero en el
 *     contenedor el frontend compilado vive en
 *     /app/artifacts/ventas-pro/dist/public.
 *  2. Si eso fallaba, se pedía por HTTP a http://localhost:5173 — el puerto
 *     del servidor de desarrollo de Vite, que en producción no existe.
 *
 * Como 79 de 83 productos guardan la imagen con ruta relativa
 * (/images/products/41.jpg), fallaban los dos caminos y SIEMPRE se caía al
 * stock. Ahora se prueban las rutas reales del contenedor y, como último
 * recurso, el propio dominio público de la app (APP_URL), que sí sirve
 * /images y /uploads.
 *
 * Devuelve null si no se pudo obtener: quien llama debe mandar solo texto,
 * nunca una imagen sustituta.
 */
async function loadProductImage(imageUrl: string): Promise<Buffer | null> {
  if (!imageUrl) return null;

  const axios = (await import("axios")).default;

  // URL absoluta: se descarga tal cual.
  if (/^https?:\/\//i.test(imageUrl)) {
    try {
      const r = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 8000 });
      return Buffer.from(r.data);
    } catch {
      return null;
    }
  }

  // Ruta relativa (/images/products/41.jpg, /uploads/products/123.jpg):
  // primero desde disco, que es instantáneo y no depende de la red.
  const path = await import("path");
  const fs = await import("fs");
  const rel = imageUrl.replace(/^\/+/, "");

  const candidatos = [
    // Volumen de subidas (IMAGE_STORE_DIR monta /uploads)
    process.env.IMAGE_STORE_DIR ? path.resolve(process.env.IMAGE_STORE_DIR, rel.replace(/^uploads\//, "")) : null,
    // Frontend compilado dentro del contenedor
    path.resolve("/app/artifacts/ventas-pro/dist/public", rel),
    // Desarrollo local
    path.resolve(process.cwd(), "../ventas-pro/dist/public", rel),
    path.resolve(process.cwd(), "../ventas-pro/public", rel),
    path.resolve(process.cwd(), rel),
  ].filter(Boolean) as string[];

  for (const c of candidatos) {
    try {
      if (fs.existsSync(c)) return fs.readFileSync(c);
    } catch {
      /* siguiente candidato */
    }
  }

  // Último recurso: pedirla al propio dominio público de la app, que sirve
  // /images y /uploads. Sustituye al viejo localhost:5173.
  const appUrl = process.env.APP_URL || "";
  if (/^https?:\/\//i.test(appUrl)) {
    try {
      const r = await axios.get(`${appUrl.replace(/\/+$/, "")}/${rel}`, {
        responseType: "arraybuffer",
        timeout: 8000,
      });
      return Buffer.from(r.data);
    } catch {
      /* no se pudo */
    }
  }

  return null;
}

/**
 * La ficha partida en BLOQUES, para mandarla como varios mensajes seguidos en
 * vez de un solo muro.
 *
 * Pedido del admin (2026-08-16): "que el texto vaya partido, que no se vea tan
 * lleno... sabiendo que no es lo mismo en PC que en móvil". Tiene razón: en el
 * celular un mensaje de 30 líneas ocupa la pantalla entera y da pereza; cuatro
 * mensajes cortos se leen de un vistazo y además se siente humano, que es como
 * escribe un vendedor de verdad.
 *
 * El corte es por SECCIÓN, no cada N renglones fijos: partir a ciegas cada 3
 * líneas cortaría una lista de módulos por la mitad y quedaría peor que el
 * muro. Cada bloque es una idea completa.
 */
async function buildProductBlocks(p: typeof products.$inferSelect, dynamicLinks?: any, semilla = ""): Promise<string[]> {
  const completo = await buildProductCaption(p, null, dynamicLinks, semilla);
  // El separador es la línea en blanco doble que deja cada sección; se agrupan
  // las secciones cortas para no mandar ocho mensajes de una línea.
  // 🎬 incluido: el video de muestra va en su PROPIO mensaje, para que
  // WhatsApp le arme la vista previa con miniatura. Pegado a otro texto, el
  // enlace queda perdido en el medio y pierde todo su efecto.
  const secciones = completo.split(/\n(?=📚 |💻 |🎬 |💰 |━|💳 |🛒 |🚀 )/);
  const bloques: string[] = [];
  let actual = "";
  for (const s of secciones) {
    const limpio = s.replace(/^\n+|\n+$/g, "");
    if (!limpio || limpio === "━━━━━━━━━━━━━━━━━━") continue;
    // Un bloque se cierra cuando ya tiene 3+ renglones con contenido.
    const renglones = (actual + "\n" + limpio).split("\n").filter((l) => l.trim()).length;
    if (actual && renglones > 8) {
      bloques.push(actual.trim());
      actual = limpio;
    } else {
      actual = actual ? `${actual}\n\n${limpio}` : limpio;
    }
  }
  if (actual.trim()) bloques.push(actual.trim());
  return bloques;
}

async function buildProductCaption(p: typeof products.$inferSelect, categoryName: string | null, dynamicLinks?: any, semilla = ""): Promise<string> {
  const lines: string[] = [];
  const sem = `${semilla}|${p.id}`;
  // La semilla viene como "telefono|productId": el teléfono dice de qué país
  // es el cliente, y de ahí salen la moneda y los medios de pago que le
  // sirven de verdad.
  const mon = await contextoDeMoneda(String(semilla).split("|")[0], Number(p.price), p.currency);

  let meta: any = {};
  try { meta = JSON.parse(p.metadata || "{}"); } catch(e) {}

  const nameUpper = p.name.toUpperCase();
  const mainEmoji = nameUpper.includes("PIANO") ? "🎹" : 
                    nameUpper.includes("GUITARRA") ? "🎸" : 
                    nameUpper.includes("CANTO") ? "🎤" : 
                    nameUpper.includes("EXCEL") ? "📊" : "💻";

  // ── Formato corto y escaneable ────────────────────────────────────────────
  // Regla explícita del admin (2026-08-16): "no quiero texto tan grande, eso
  // da pereza leer". Antes esta ficha volcaba la DESCRIPCIÓN COMPLETA -- que
  // desde la restauración del catálogo incluye el bloque de beneficios -- y
  // justo debajo repetía esos mismos beneficios como "BENEFICIOS INCLUIDOS".
  // El cliente recibía el mismo contenido dos veces y un muro de texto.
  //
  // Ahora: título, UNA línea de qué es, qué incluye (lo específico del curso),
  // modalidad (lo estándar), precio y pago. Cada bloque corto y separado.
  lines.push(`${mainEmoji} *${nameUpper}*`);
  lines.push("");

  // Resumen: la primera línea, y CORTADA.
  //
  // Quedarse con la primera línea no alcanza: hay productos cuyo texto
  // original trae el temario entero en un solo párrafo (el curso de piano
  // son 550 caracteres de corrido). Eso es exactamente el muro que el admin
  // no quiere -- y encima repite lo que ya va listado en "Incluye" abajo.
  //
  // Se corta en la primera frase que cierre antes de los 180 caracteres; si
  // no hay punto, en el último espacio. La idea es que el cliente lea DE QUÉ
  // ES en dos segundos y el detalle lo vea en las viñetas.
  const crudo = String(p.description || "")
    .split(/\r?\n/)[0]
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();
  let resumen = crudo;
  if (crudo.length > 180) {
    const corteFrase = crudo.slice(0, 180).lastIndexOf(". ");
    if (corteFrase > 60) {
      resumen = crudo.slice(0, corteFrase + 1);
    } else {
      const corteEspacio = crudo.slice(0, 180).lastIndexOf(" ");
      resumen = crudo.slice(0, corteEspacio > 60 ? corteEspacio : 180).trimEnd() + "…";
    }
  }
  lines.push(resumen || "Formación práctica para llevar tus habilidades al siguiente nivel.");
  lines.push("");

  // Lo ESPECÍFICO de este curso va en "Incluye"; lo estándar (que es igual en
  // todos) va aparte en "Modalidad", para no mezclar temario con condiciones.
  // Condiciones de entrega y acceso: van en "Modalidad", no en el temario.
  //
  // El patrón cubre las VARIANTES de redacción porque cada producto las
  // escribe distinto. Con una lista corta se colaban a "Incluye" y el bloque
  // de Modalidad las repetía debajo -- el admin lo detectó en el curso de
  // piano: "Acceso de por vida" y "Online y descargable" aparecían dos veces
  // en la misma ficha.
  const ESTANDAR = /acceso (permanente|de por vida|inmediato|ilimitado)|de por vida|contenido actualizable|actualizaciones|soporte (t[eé]cnico|incluido)|descargas? (ilimitadas?|incluidas?)|descargable|alta definici[oó]n|\bHD\b|google drive|100% online|certificaci[oó]n de participaci[oó]n/i;
  const features = (p.features ?? []) as string[];
  const propias = features.filter((f) => !ESTANDAR.test(String(f)));
  const estandar = features.filter((f) => ESTANDAR.test(String(f)));

  if (propias.length > 0) {
    lines.push(variante([`📚 *Incluye:*`, `📚 *Qué vas a recibir:*`, `📚 *Contenido:*`, `📚 *Esto trae:*`], sem));
    // Tope de 8: más que eso vuelve a ser un muro. Si hay más, se dice.
    for (const f of propias.slice(0, 8)) lines.push(`✅ ${f}`);
    if (propias.length > 8) lines.push(`✅ …y ${propias.length - 8} módulos más`);
    lines.push("");
  } else if (meta.classes) {
    lines.push(variante([`📚 *Incluye:*`, `📚 *Qué vas a recibir:*`, `📚 *Contenido:*`, `📚 *Esto trae:*`], sem));
    lines.push(`✅ ${meta.classes} en Alta Definición`);
    lines.push("");
  }

  lines.push(variante([`💻 *Modalidad:*`, `💻 *Cómo funciona:*`, `💻 *Acceso:*`, `💻 *Cómo lo recibís:*`], sem));
  if (estandar.length > 0) {
    for (const f of estandar.slice(0, 4)) lines.push(`✅ ${f}`);
  } else {
    lines.push(`✅ 100% online y descargable`);
    lines.push(`✅ Acceso de por vida ♾️`);
  }
  lines.push("");

  // ── Video de muestra ────────────────────────────────────────────────
  // Pedido del admin: mostrarle al cliente CÓMO son las clases, no solo
  // contárselo. Una promesa se discute; ver la primera clase, no.
  //
  // Va como enlace, no como archivo: la presentación del curso de piano pesa
  // 118 MB y WhatsApp corta en 16 MB. El enlace de Drive abre el reproductor
  // directo en el celular y muestra vista previa con miniatura en el chat.
  //
  // Se ubica ANTES del precio a propósito: primero que vea lo que se lleva,
  // después cuánto cuesta.
  const videoMuestra = String(meta.videoIntro || meta.videoUrl || "").trim();
  if (videoMuestra) {
    lines.push(variante([
      `🎬 *Mirá cómo son las clases:*`,
      `🎬 *Así se ve el curso por dentro:*`,
      `🎬 *Te dejo la primera clase para que veas:*`,
      `🎬 *Mirá un pedacito antes de decidir:*`,
    ], sem));
    lines.push(videoMuestra);
    lines.push("");
  }

  // Precio en la moneda que el cliente entiende. La semilla trae su teléfono,
  // y el código de país es el dato más confiable de una conversación: no lo
  // eligió para una encuesta, es su línea real.
  lines.push(`💰 *PRECIO: ${mon.precioTexto}*`);
  if (!mon.esColombia && mon.pais) {
    lines.push(`🌎 Precio para ${mon.pais} — pagás en línea, acceso inmediato.`);
  }
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push("");

  if (dynamicLinks) {
    lines.push(variante([`💳 *FORMAS DE PAGO*`, `💳 *Podés pagar así*`, `💳 *Medios de pago*`, `💳 *Cómo pagar*`], sem));
    lines.push("");

    // Enlace CORTO primero. El acortador ya existía y generaba /p/<código>,
    // pero acá se pedía `url || shortUrl`: el largo ganaba siempre y el corto
    // solo aparecía si el largo faltaba. Un checkout de MercadoPago crudo son
    // ~120 caracteres de ruido con tokens adentro; en el celular ocupa cuatro
    // renglones y parece un enlace sospechoso.
    const corto = (m: any) => m?.shortUrl || m?.url || "";

    // A un cliente de otro país, MercadoPago Colombia le rechaza la tarjeta y
    // Nequi/Daviplata directamente no existen para él: son billeteras
    // colombianas. Mostrarle esas opciones es hacerle perder el tiempo y
    // pedirle que confíe en algo que no puede usar. Afuera cobra PayPal.
    if (mon.aceptaPagosLocales && corto(dynamicLinks.mercadopago)) {
      lines.push(`🔹 *Tarjeta / PSE:*`);
      lines.push(corto(dynamicLinks.mercadopago));
      lines.push("");
    }
    if (corto(dynamicLinks.paypal)) {
      lines.push(mon.esColombia ? `🔹 *PayPal (Internacional):*` : `🔹 *Tarjeta o PayPal:*`);
      lines.push(corto(dynamicLinks.paypal));
      lines.push("");
    }
    if (mon.aceptaPagosLocales && dynamicLinks.transfer?.options?.[0]) {
      lines.push(`🔹 *Nequi / Daviplata:*`);
      lines.push(`📱 ${dynamicLinks.transfer.options[0].number}`);
      lines.push(`👤 ${dynamicLinks.transfer.options[0].name}`);
      lines.push("");
    }
  }

  // Comprar desde la tienda: pedido del admin (2026-08-16). Es la salida
  // cuando el cliente no quiere ninguno de los métodos de arriba, y además
  // ahí ve el producto con su foto y su ficha completa. El enlace corto /p/<id>
  // redirige a la página real y ya trae vista previa con imagen al compartirse.
  const urlTienda = `${(process.env.APP_URL || "https://ventasproia.com").replace(/\/+$/, "")}/p/${p.id}`;
  lines.push(variante([`🛒 *O comprá directo en la tienda:*`, `🛒 *También podés comprarlo acá:*`, `🛒 *Directo desde la web:*`, `🛒 *Si preferís, desde la tienda:*`], sem));
  lines.push(urlTienda);
  lines.push("");

  lines.push(variante([`🚀 *¿Querés comprarlo ahora o tenés alguna pregunta?*`, `🚀 *¿Lo querés llevar o te resuelvo alguna duda primero?*`, `🚀 *¿Arrancamos hoy o te queda alguna pregunta?*`, `🚀 *¿Te lo activo ahora o querés saber algo más?*`, `🚀 *¿Seguimos con la compra o te ayudo con algo más?*`], sem));
  
  return lines.join("\n");
}

function buildPaymentOnlyCaption(p: typeof products.$inferSelect, dynamicLinks?: any) {
  const lines: string[] = [];

  const nameUpper = p.name.toUpperCase();
  const mainEmoji = nameUpper.includes("PIANO") ? "🎹" : 
                    nameUpper.includes("GUITARRA") ? "🎸" : 
                    nameUpper.includes("CANTO") ? "🎤" : 
                    nameUpper.includes("EXCEL") ? "📊" : "💻";

  lines.push(`💳 *PAGO — ${mainEmoji} ${nameUpper}*`);
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");

  if (dynamicLinks) {
    if (dynamicLinks.mercadopago && (dynamicLinks.mercadopago.url || dynamicLinks.mercadopago.shortUrl)) {
      lines.push(`🔹 *Tarjeta de Crédito / PSE (Colombia):*`);
      lines.push(`${dynamicLinks.mercadopago.url || dynamicLinks.mercadopago.shortUrl}`);
      lines.push("");
    }
    if (dynamicLinks.paypal && (dynamicLinks.paypal.url || dynamicLinks.paypal.shortUrl)) {
      lines.push(`🔹 *PayPal (Internacional):*`);
      lines.push(`${dynamicLinks.paypal.url || dynamicLinks.paypal.shortUrl}`);
      lines.push("");
    }
    if (dynamicLinks.transfer && dynamicLinks.transfer.options && dynamicLinks.transfer.options[0]) {
      lines.push(`🔹 *Transferencia Directa:*`);
      lines.push(`📍 *Nequi/Daviplata:* ${dynamicLinks.transfer.options[0].number}`);
      lines.push(`👤 *Titular:* ${dynamicLinks.transfer.options[0].name}`);
      lines.push("");
    }
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`_¿Confirmas tu compra o tienes alguna duda?_`);

  return lines.join("\n");
}

type WAState = "disconnected" | "connecting" | "qr" | "connected" | "error";

export type WhatsAppPublicStatus = {
  state: WAState;
  qrDataUrl: string | null;
  phoneNumber: string | null;
  connectedAt: string | null;
  lastError: string | null;
};

// AUTH_DIR: dentro del volumen persistente /app/data para que sobreviva deploys
// EasyPanel monta ./data:/app/data — .baileys-auth queda en /app/data/.baileys-auth
const AUTH_DIR = process.env.WA_AUTH_DIR
  ? path.resolve(process.env.WA_AUTH_DIR)
  : path.resolve(process.cwd(), "data", ".baileys-auth");

/**
 * Deja SOLO el numero de un JID de WhatsApp.
 *
 * Un JID puede venir como "573001234567:12@s.whatsapp.net": el ":12" es el
 * identificador de DISPOSITIVO, no parte del telefono. Cortando solo por "@"
 * quedaba "573001234567:12" como si fuera el numero.
 *
 * Lo vio el admin en un cliente que llego de un anuncio pago: el bot lo
 * saludo con "Hola 51908825398:0". Ademas ensuciaba la identidad -- el mismo
 * contacto podia quedar en dos conversaciones segun si el JID traia sufijo.
 */
function soloNumero(jid: string | null | undefined): string {
  return String(jid || "").split("@")[0]!.split(":")[0]!.replace(/\D/g, "");
}

/** Lo que viaja pegado al primer mensaje de alguien que llego por un anuncio. */
export interface ContextoDeAnuncio {
  titulo: string;
  cuerpo: string;
  url: string;
  anuncioId: string;
}

/**
 * Cuando alguien hace clic en "Enviar mensaje" de un anuncio de Facebook o
 * Instagram, WhatsApp adjunta al primer mensaje un `externalAdReply` con el
 * titular del anuncio, su texto y el link de destino. Ese bloque dice a QUE
 * producto le hizo clic el cliente -- que es exactamente lo que el mensaje de
 * texto NO dice, porque Meta lo autocompleta con "Hola! Quiero mas
 * informacion" para todos los anuncios por igual.
 *
 * Hasta ahora el backend no lo leia en ningun lado: se pagaba el clic, llegaba
 * el dato de que producto lo genero, y se tiraba a la basura.
 */
export function extraerContextoDeAnuncio(msgObj: any): ContextoDeAnuncio | null {
  if (!msgObj || typeof msgObj !== "object") return null;
  // El contextInfo cuelga del sub-mensaje (extendedTextMessage, imageMessage,
  // videoMessage...) segun con que formato haya salido el anuncio.
  const candidatos = [msgObj, ...Object.values(msgObj)];
  for (const c of candidatos) {
    const ad = (c as any)?.contextInfo?.externalAdReply;
    if (!ad) continue;
    const ctx: ContextoDeAnuncio = {
      titulo: String(ad.title || "").trim(),
      cuerpo: String(ad.body || "").trim(),
      url: String(ad.sourceUrl || "").trim(),
      anuncioId: String(ad.sourceId || ad.ctwaClid || "").trim(),
    };
    if (ctx.titulo || ctx.cuerpo || ctx.url || ctx.anuncioId) return ctx;
  }
  return null;
}

export class WhatsAppManager {
  /**
   * Ids de mensajes de WhatsApp ya procesados, para no contestar dos veces el
   * mismo. Es ESTÁTICO a propósito: compartido entre todas las instancias
   * (una por tenant, más el proxy del singleton), porque la duplicación
   * justamente viene de tener más de un socket vivo a la vez. Si viviera en
   * la instancia, cada socket duplicado tendría su propio registro y no
   * serviría de nada.
   */
  protected static mensajesVistos = new Set<string>();

  /**
   * LID (identificador interno de WhatsApp) → teléfono real, recordado.
   *
   * `getPNForLID` falla de forma intermitente para el mismo contacto. Sin
   * memoria, un mensaje se guardaba con el número real y el siguiente con el
   * id interno: la misma persona quedaba partida en dos conversaciones, y el
   * agente respondía leyendo el hilo equivocado.
   *
   * Estático por el mismo motivo que `mensajesVistos`: lo comparten todas las
   * instancias (una por tenant, más el proxy del singleton).
   */
  protected static lidAPhone = new Map<string, string>();

  // protected (no private): WhatsAppByTenant hereda de esta clase y necesita
  // tocar estos campos directamente en su propio start()/stop() para aislar
  // la sesión por tenant.
  protected state: WAState = "disconnected";
  protected qrDataUrl: string | null = null;
  protected phoneNumber: string | null = null;
  protected connectedAt: string | null = null;
  protected lastError: string | null = null;
  protected sock: any = null;
  protected starting = false;
  protected hadQrInThisSession = false;
  protected _usePairingCode = false;
  protected currentTenant: TenantContext;

  // ── Límite real de envíos salientes (anti-bloqueo de número) ──────────────
  // WA_MAX_MSGS_PER_HOUR/DAY estaban documentados en .env pero nunca se leían
  // en ningún archivo -- cero protección real contra que Meta marque el
  // número por volumen alto. Cada WhatsAppManager es por tenant/número (ver
  // WhatsAppByTenant), así que un array de timestamps por instancia ya aísla
  // el conteo correctamente sin necesitar keyear por tenantId.
  // En memoria (se resetea si el proceso reinicia) -- igual que el resto del
  // rate limiting de este backend (ver middleware/rateLimiting.ts); para un
  // límite que sobreviva reinicios habría que moverlo a Redis/DB más adelante.
  private sentTimestampsMs: number[] = [];
  private consecutiveSendFailures = 0;
  private sendingPausedUntil: number | null = null;

  // ── Calentamiento del número ──────────────────────────────────────────────
  // Un chip recién activado que manda 400 mensajes el primer día es la receta
  // más directa para que WhatsApp lo restrinja: los números nuevos arrancan
  // con reputación cero y el volumen alto de entrada es la señal más fuerte.
  // El tope real es el MENOR entre el límite del plan y el del calentamiento,
  // que sube solo con los días de operación.
  private diasOperandoCache: { valor: number; expira: number } | null = null;

  // Texto normalizado -> destinatarios distintos a los que ya se le mandó.
  // Mandar el MISMO mensaje palabra por palabra a mucha gente es otra señal
  // fuerte de automatización (más que el volumen en sí).
  private textosEnviados = new Map<string, { destinos: Set<string>; desde: number }>();

  constructor(tenant?: TenantContext) {
    this.currentTenant = tenant || tenantManager.getDefaultTenant();
  }

  /** Días que lleva operando este número, según su primer mensaje saliente. */
  private async diasOperando(): Promise<number> {
    const ahora = Date.now();
    if (this.diasOperandoCache && ahora < this.diasOperandoCache.expira) return this.diasOperandoCache.valor;
    let dias = 999; // ante la duda, NO restringir a un número que ya venía operando
    try {
      const tenantId = this.currentTenant?.id;
      const [fila] = await db
        .select({ primero: messages.createdAt })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(eq(conversations.tenantId, tenantId as number))
        .orderBy(messages.createdAt)
        .limit(1);
      if (fila?.primero) {
        dias = Math.floor((ahora - new Date(fila.primero).getTime()) / 86_400_000);
      } else {
        dias = 0; // sin historial: número nuevo, arranca en la franja más baja
      }
    } catch {
      /* si falla la consulta se deja 999 -- no bloquear por un problema de BD */
    }
    this.diasOperandoCache = { valor: dias, expira: ahora + 60 * 60 * 1000 };
    return dias;
  }

  /** Tope diario del calentamiento según los días operando. */
  private topeCalentamiento(dias: number): number {
    if (dias <= 2) return 20;
    if (dias <= 6) return 50;
    if (dias <= 13) return 120;
    if (dias <= 20) return 250;
    return Number.MAX_SAFE_INTEGER; // ya "caliente": manda el límite del plan
  }

  /**
   * ¿Este contacto nos escribió alguna vez? Es LA pregunta que más importa
   * para no perder el número.
   *
   * La causa número uno de bloqueo en WhatsApp NO es el volumen: son los
   * REPORTES y bloqueos de gente que nunca pidió el mensaje. Un bot que solo
   * responde a quien le escribió primero casi nunca cae; uno que inicia
   * conversaciones en frío cae aunque respete todos los límites de volumen.
   *
   * Por eso, por defecto, solo se permite escribirle a alguien que ya nos
   * escribió. Se puede desactivar con WA_PERMITIR_ENVIO_EN_FRIO=true, pero
   * es una decisión consciente del dueño de la plataforma, no el default.
   */
  private async contactoNosEscribio(telefono: string): Promise<boolean> {
    const soloDigitos = String(telefono).replace(/\D/g, "");
    if (!soloDigitos) return false;
    try {
      const tenantId = this.currentTenant?.id;
      const [fila] = await db
        .select({ id: messages.id })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(
          and(
            eq(conversations.tenantId, tenantId as number),
            eq(conversations.contactPhone, soloDigitos),
            // "customer" es el valor REAL con el que se guarda un mensaje
            // entrante en toda la app (conversation-engine, message-handler,
            // facebook-messenger, facebook-comments). "user" no existe en
            // ninguna fila.
            //
            // BUG DE PRODUCCIÓN (2026-08-16): al preguntar por "user" esta
            // consulta nunca encontraba nada, así que la función concluía
            // "este contacto nunca nos escribió" para TODO el mundo y
            // bloqueaba TODAS las respuestas. El bot quedó completamente
            // mudo desde que se agregó la protección. Verificado con la fila
            // real: {"role":"customer","content":"Tienes el curso de piano"},
            // una consulta de un cliente que se quedó sin respuesta mientras
            // había una campaña paga corriendo.
            eq(messages.role, "customer"),
          ),
        )
        .limit(1);
      return !!fila;
    } catch (e: any) {
      // Ante un fallo de consulta NO se bloquea: dejar mudo el bot de un
      // cliente que sí pagó es peor que dejar pasar un mensaje.
      logger.warn({ err: e?.message }, "[WhatsApp] No se pudo verificar si el contacto escribió; se permite el envío");
      return true;
    }
  }

  /**
   * Controles que necesitan consultar datos (envío en frío, calentamiento y
   * repetición de contenido). Van aparte de enforceSendLimits() porque esa es
   * síncrona. Lanza con un mensaje entendible: quien llama decide si avisar
   * al admin.
   */
  private async verificarProteccionesAsync(texto: string, destino: string): Promise<void> {
    // 0) Envío en frío -- el control que más protege el número
    if (process.env.WA_PERMITIR_ENVIO_EN_FRIO !== "true") {
      if (!(await this.contactoNosEscribio(destino))) {
        throw new Error(
          `No se envía: ${destino} nunca escribió a este WhatsApp. Escribirle a alguien que no lo pidió es la causa ` +
            `número uno de que Meta bloquee un número (los reportes pesan más que el volumen). ` +
            `Si el contacto responde una vez, la conversación queda habilitada sola. ` +
            `Para permitir envíos en frío bajo tu responsabilidad: WA_PERMITIR_ENVIO_EN_FRIO=true.`,
        );
      }
    }

    // 1) Calentamiento
    const dias = await this.diasOperando();
    const tope = this.topeCalentamiento(dias);
    if (tope !== Number.MAX_SAFE_INTEGER) {
      const desdeHace24h = Date.now() - 86_400_000;
      const enviadosHoy = this.sentTimestampsMs.filter((t) => t >= desdeHace24h).length;
      if (enviadosHoy >= tope) {
        throw new Error(
          `Este número lleva ${dias} día(s) operando, así que está en período de calentamiento: máximo ${tope} mensajes por día. ` +
            `Mandar más de entrada es la causa más común de que WhatsApp restrinja un número nuevo. El tope sube solo con los días.`,
        );
      }
    }

    // 2) Mismo texto a muchos destinatarios distintos
    const MAX_DESTINOS_MISMO_TEXTO = Number(process.env.WA_MAX_DESTINOS_MISMO_TEXTO) || 5;
    const clave = texto.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim().slice(0, 160);
    if (clave.length >= 25) { // los mensajes muy cortos ("ok", "gracias") se repiten naturalmente
      const haceUnaHora = Date.now() - 60 * 60 * 1000;
      for (const [k, v] of this.textosEnviados) if (v.desde < haceUnaHora) this.textosEnviados.delete(k);

      const reg = this.textosEnviados.get(clave) || { destinos: new Set<string>(), desde: Date.now() };
      if (!reg.destinos.has(destino) && reg.destinos.size >= MAX_DESTINOS_MISMO_TEXTO) {
        throw new Error(
          `Este MISMO texto ya se envió a ${reg.destinos.size} personas distintas en la última hora. ` +
            `Repetir un mensaje palabra por palabra es una de las señales más fuertes de automatización para WhatsApp. ` +
            `Variá el mensaje (saludo, orden de las ideas, cierre) antes de seguir.`,
        );
      }
      reg.destinos.add(destino);
      this.textosEnviados.set(clave, reg);
    }
  }

  /**
   * Gate real antes de cualquier envío: corta si se supera el límite por
   * hora/día, o si el circuito está abierto por fallos recientes seguidos
   * (señal de que WhatsApp ya está rechazando/restringiendo el número).
   * Lanza en vez de enviar en silencio -- no queremos que un límite superado
   * pase desapercibido.
   */
  /**
   * Espera lo necesario para que NUNCA salgan dos mensajes pegados a menos de
   * ~8-20s uno del otro (con variación aleatoria, no un intervalo fijo).
   *
   * Por qué importa: el límite por hora/día no impide mandar 60 mensajes en
   * 60 segundos y después parar -- y esa ráfaga es exactamente el patrón que
   * delata a un bot y hace que WhatsApp restrinja el número. Un humano no
   * escribe a 60 personas en un minuto. La variación aleatoria evita el otro
   * patrón delator: intervalos perfectamente regulares.
   *
   * No afecta la conversación normal (una respuesta cada varios segundos ya
   * cumple el espaciado por sí sola); solo frena los envíos en lote.
   */
  private ultimoEnvioMs = 0;
  private async esperarEspaciadoEntreEnvios(): Promise<void> {
    const MIN_MS = Number(process.env.WA_MIN_MS_ENTRE_ENVIOS) || 8000;
    const JITTER_MS = Number(process.env.WA_JITTER_MS_ENTRE_ENVIOS) || 12000;
    const objetivo = MIN_MS + Math.floor(Math.random() * JITTER_MS);
    const transcurrido = Date.now() - this.ultimoEnvioMs;
    if (this.ultimoEnvioMs > 0 && transcurrido < objetivo) {
      await sleep(objetivo - transcurrido);
    }
    this.ultimoEnvioMs = Date.now();
  }

  private enforceSendLimits(): void {
    const now = Date.now();

    if (this.sendingPausedUntil && now < this.sendingPausedUntil) {
      const mins = Math.ceil((this.sendingPausedUntil - now) / 60000);
      throw new Error(
        `Envíos en pausa de protección por ${mins} min más: hubo ${this.consecutiveSendFailures} fallos seguidos al enviar, probable señal de restricción del número. Revisa el estado de la sesión de WhatsApp antes de reintentar.`,
      );
    }

    // Valores por DEFECTO, no "sin límite". Antes, si nadie configuraba las
    // env vars, esto devolvía sin forzar nada -- y en producción no estaban
    // configuradas (verificado 2026-08-12), así que la protección existía en
    // el código pero NUNCA se aplicaba: el número podía mandar miles de
    // mensajes de corrido. Un límite que hay que acordarse de encender no es
    // una protección.
    //
    // Los números son conservadores a propósito: Baileys es un cliente NO
    // oficial y el volumen alto es la causa #1 de bloqueo. 60/hora y 400/día
    // permiten una operación de ventas normal (conversaciones reales,
    // seguimientos) y cortan el envío masivo, que es lo que quema números.
    // Se pueden subir por env var si un negocio lo justifica.
    const maxPerHour = Number(process.env.WA_MAX_MSGS_PER_HOUR) || 60;
    const maxPerDay = Number(process.env.WA_MAX_MSGS_PER_DAY) || 400;

    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    // Podar mientras contamos, así el array no crece sin límite en una sesión larga.
    this.sentTimestampsMs = this.sentTimestampsMs.filter((t) => t >= oneDayAgo);

    const sentLastHour = this.sentTimestampsMs.filter((t) => t >= oneHourAgo).length;
    const sentLastDay = this.sentTimestampsMs.length;

    if (maxPerHour > 0 && sentLastHour >= maxPerHour) {
      throw new Error(`Límite de ${maxPerHour} mensajes/hora alcanzado (${sentLastHour} enviados en la última hora). Se corta el envío para no arriesgar el número -- espera antes de seguir.`);
    }
    if (maxPerDay > 0 && sentLastDay >= maxPerDay) {
      throw new Error(`Límite de ${maxPerDay} mensajes/día alcanzado. Se corta el envío para no arriesgar el número -- espera a que rote la ventana de 24h.`);
    }
  }

  private recordSendSuccess(): void {
    this.sentTimestampsMs.push(Date.now());
    this.consecutiveSendFailures = 0;
  }

  /**
   * Varios fallos de envío seguidos son la señal más directa de que WhatsApp
   * ya está restringiendo el número -- mejor pausar todo el envío un rato y
   * que alguien lo revise, que seguir insistiendo y empeorar el bloqueo.
   */
  private recordSendFailure(): void {
    this.consecutiveSendFailures++;
    const CIRCUIT_BREAKER_THRESHOLD = 5;
    const CIRCUIT_BREAKER_PAUSE_MS = 30 * 60 * 1000;
    if (this.consecutiveSendFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      this.sendingPausedUntil = Date.now() + CIRCUIT_BREAKER_PAUSE_MS;
      logger.error(
        { tenantId: this.currentTenant.id, failures: this.consecutiveSendFailures },
        "[WhatsApp] Circuito abierto: demasiados fallos de envío seguidos, pausando 30 min por protección del número",
      );
    }
  }

  // Getter de compatibilidad: el código heredado (y subclases) referenciaba
  // this.tenant, pero la propiedad real es currentTenant. Este getter evita
  // TypeError "Cannot read properties of undefined (reading 'id')" cuando un
  // método usa this.tenant.id sin haberlo declarado.
  get tenant(): TenantContext {
    return this.currentTenant;
  }

  setTenant(tenant: TenantContext): void {
    this.currentTenant = tenant;
    logger.info({ tenantId: tenant.id }, "[WhatsApp] Tenant context updated");
  }

  getStatus(): WhatsAppPublicStatus & { qrCode: string | null; phone: string | null; phoneNumber: string | null } {
     const status = {
       state: this.state,
       qrCode: this.qrDataUrl,
       phone: this.phoneNumber,
       phoneNumber: this.phoneNumber,
       connectedAt: this.connectedAt,
       lastError: this.lastError,
       // Keep original field names for internal consistency
       qrDataUrl: this.qrDataUrl,
     } as any;
     
     if (this.state === "qr" && this.qrDataUrl) {
       console.log("📲 [STATUS] QR disponible - Longitud:", this.qrDataUrl.length);
     }
     
     return status;
   }

  isConnected() {
    return this.state === "connected";
  }

  protected reconnectAttempts = 0;
  protected readonly MAX_RECONNECT_ATTEMPTS = 5;

  async stop(keepAuth: boolean = true): Promise<WhatsAppPublicStatus> {
    try {
      if (this.sock) {
        this.sock.ev.removeAllListeners();
        // logout() invalidates the WhatsApp session. A normal stop must only
        // close the socket so the persisted credentials remain usable.
        if (!keepAuth) {
          await this.sock.logout().catch(() => {});
        }
        this.sock.end(undefined);
        this.sock = null;
      }
    } catch (e) {
      logger.warn({ err: e }, "[WhatsApp] Error during stop");
    }
    
    // Solo borrar auth cuando se pide explícitamente (reset-session)
    if (!keepAuth) {
      try {
        if (existsSync(AUTH_DIR)) {
          rmSync(AUTH_DIR, { recursive: true, force: true });
          logger.info("[WhatsApp] Auth directory deleted");
        }
      } catch (e) {
        logger.warn({ err: e }, "[WhatsApp] Error deleting auth directory");
      }
    }
    
    this.state = "disconnected";
    this.qrDataUrl = null;
    this.phoneNumber = null;
    this.connectedAt = null;
    this.starting = false;
    this.lastError = null;
    this.hadQrInThisSession = false;
    logger.info({ keepAuth }, "[WhatsApp] Stopped");
    return this.getStatus();
  }

   async requestPairingCode(phoneNumber: string): Promise<string> {
      if (!this.sock) throw new Error("WhatsApp no está iniciado. Llama a startWithPairing() primero.");

      let lastError = null;
      const maxRetries = 8;
      const waitTimes = [2000, 3000, 4000, 5000, 6000, 7000, 8000, 10000];

      for (let i = 0; i < maxRetries; i++) {
        try {
          const waitMs = waitTimes[i] || 10000;
          console.log(`⏳ [PAIRING] Intento ${i+1}/${maxRetries} - esperando ${waitMs}ms para handshake Noise...`);
          await new Promise(r => setTimeout(r, waitMs));

          console.log(`🔄 [PAIRING] Solicitando código de emparejamiento para ${phoneNumber}...`);
          const code = await this.sock.requestPairingCode(phoneNumber);
          const formatted = code.match(/.{1,4}/g)?.join("-") || code;

          logger.info({ phoneNumber, code: formatted }, "[WhatsApp] Pairing code generated successfully");
          console.log(`✅ [PAIRING] Código generado: ${formatted}`);
          return formatted;
        } catch (e: any) {
          lastError = e;
          const msg = e.message || String(e);
          console.warn(`⚠️ [PAIRING] Intento ${i+1}/${maxRetries} falló - ${msg}`);

          // Si es un error irrecuperable, no reintentar
          if (msg.includes("Invalid") || msg.includes("Unauthorized") || msg.includes("Bad request")) {
            logger.error({ phoneNumber, error: msg }, "[WhatsApp] Pairing code request failed - not retrying");
            throw e;
          }

          if (i === maxRetries - 1) {
            const finalError = `No se pudo generar código de emparejamiento tras ${maxRetries} intentos. Último error: ${msg}`;
            logger.error({ phoneNumber, lastError: msg }, "[WhatsApp] Max pairing retries reached");
            throw new Error(finalError);
          }
        }
      }
      throw lastError || new Error("No se pudo obtener el código después de varios intentos");
    }

  async startWithPairing() {
    // NO setear `this.starting` ni `this.state` acá: start() tiene guards
    // (`if (this.starting)` / `if (state === "connected" || "qr")`) que hacían
    // que retornara inmediatamente sin crear el socket → requestPairingCode()
    // fallaba con "WhatsApp no está iniciado". Dejar que start() gestione
    // starting/state normalmente.
    this._usePairingCode = true;
    console.log("🔄 [PAIRING] Iniciando sesión en modo pairing code (Baileys 7.0.0-rc14)...");
    logger.info("[WhatsApp] Starting with pairing code mode");

    try {
      const result = await this.start();

      // Pairing is requested before WhatsApp becomes authenticated/connected.
      // Waiting for state === connected here deadlocks the flow.
      console.log("⏳ [PAIRING] Esperando inicialización del socket...");
      await new Promise(r => setTimeout(r, 1500));
      if (!this.sock || this.state === "error" || this.state === "disconnected") {
        throw new Error(`Socket no está disponible para pairing (estado: ${this.state})`);
      }
      console.log("✅ [PAIRING] Socket listo para solicitar código de emparejamiento");
      logger.info("[WhatsApp] Pairing socket ready");
      return result;
    } catch (e) {
      console.error("❌ [PAIRING] Error iniciando pairing:", e);
      this.state = "error";
      const errMsg = e instanceof Error ? e.message : String(e);
      this.lastError = `Error en pairing: ${errMsg}`;
      logger.error({ error: errMsg }, "[WhatsApp] Pairing initialization failed");
      throw e;
    } finally {
      this._usePairingCode = false;
      this.starting = false;
    }
  }

  async start() {
      if (this.starting) {
        console.log("⚠️ [START] Ya hay un proceso de inicio en curso");
        return this.getStatus();
      }
      if (this.state === "connected" || this.state === "qr") {
        console.log(`ℹ️ [START] Estado actual: ${this.state} - No iniciando nueva conexión`);
        return this.getStatus();
      }

      this.starting = true;
      this.state = "connecting";
      console.log("🔄 [START] Iniciando conexión WhatsApp...");

      const connectionTimeoutMs = this._usePairingCode ? 45000 : 30000;
      const startTimeout = setTimeout(() => {
        if (this.state === "connecting" && this.starting) {
          this.starting = false;
          this.state = "disconnected";
          this.lastError = `Timeout: No se pudo conectar con WhatsApp en ${connectionTimeoutMs / 1000}s. Revisa tu conexión a internet, firewall, o que web.whatsapp.com esté accesible.`;
          console.error(`❌ [TIMEOUT] Timeout de ${connectionTimeoutMs}ms alcanzado`);
          logger.error({ timeoutMs: connectionTimeoutMs, mode: this._usePairingCode ? "pairing" : "qr" }, "[WhatsApp] Connection timeout");
        }
      }, connectionTimeoutMs);

     try {
       if (!existsSync(AUTH_DIR)) {
         mkdirSync(AUTH_DIR, { recursive: true });
         console.log(`📁 [AUTH] Directorio de autenticación creado: ${AUTH_DIR}`);
       }

       const baileys = await import("@whiskeysockets/baileys");
       const makeWASocket = (baileys as any).default ?? (baileys as any).makeWASocket;
       const { useMultiFileAuthState, DisconnectReason } = baileys as any;

       console.log("✅ [IMPORT] Módulos de Baileys importados correctamente");

       const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
       console.log("✅ [AUTH] Estado de autenticación cargado");

       // fetchLatestBaileysVersion() estaba importado pero nunca se llamaba:
       // el socket se creaba SIN `version`, así que usaba el WA_VERSION
       // hardcodeado dentro del paquete al momento de compilarse. Cuando
       // WhatsApp rota su versión de protocolo (pasa seguido) esa versión
       // vieja hace que el servidor cierre la conexión de inmediato -- antes
       // de emitir el evento "qr" -- lo que se veía como "no se pudo
       // conectar, revisa que el servidor tenga acceso a whatsapp.com"
       // aunque la red funcionara perfecto. Si falla la consulta, se sigue
       // sin version (comportamiento anterior) en vez de romper el arranque.
       let waVersion: [number, number, number] | undefined;
       try {
         const { version } = await fetchLatestBaileysVersion();
         waVersion = version;
         console.log(`✅ [VERSION] Baileys usará WA v${version.join(".")}`);
       } catch (e) {
         console.warn("⚠️ [VERSION] No se pudo obtener la versión más reciente de WhatsApp, usando la del paquete:", e instanceof Error ? e.message : e);
       }

      // Configurar proxy si está disponible (para Floppy Data u otros servicios)
      let httpAgent: any = undefined;
      let httpsAgent: any = undefined;
      const proxyUrl = process.env.PROXY_URL; // ej: http://user:pass@proxy.host:port
      if (proxyUrl) {
        console.log("[PROXY] Configurando proxy para WhatsApp...");
        try {
          const proxyUri = new URL(proxyUrl);
          const proxyAuth = proxyUri.username && proxyUri.password
            ? `${proxyUri.username}:${proxyUri.password}`
            : undefined;

          httpAgent = new HttpProxyAgent({
            host: proxyUri.hostname || undefined,
            port: proxyUri.port ? Number(proxyUri.port) : undefined,
            proxyAuth: proxyAuth,
          });

          httpsAgent = new HttpsProxyAgent({
            host: proxyUri.hostname || undefined,
            port: proxyUri.port ? Number(proxyUri.port) : undefined,
            proxyAuth: proxyAuth,
          });
          console.log("✅ [PROXY] Proxy configurado correctamente");
        } catch (err) {
          console.warn("⚠️ [PROXY] Error al configurar proxy:", err instanceof Error ? err.message : err);
        }
      }

      const sock = makeWASocket({
         auth: authState,
         browser: ["VentasPro", "Chrome", "1.0.0"],
         syncFullHistory: false,
         markOnlineOnConnect: true,
         generateHighQualityLinkPreview: false,
         // usePairingCode DEBE estar en el constructor para que Baileys inicie
         // el handshake Noise en modo pairing y no en modo QR. Sin esta flag
         // requestPairingCode() falla con "Connection Failure" del noise-handler.
         ...(this._usePairingCode ? { usePairingCode: true } : {}),
         ...(waVersion ? { version: waVersion } : {}),
         ...(httpAgent ? { agent: { http: httpAgent, https: httpsAgent } } : {}),
       });
       this.sock = sock;
       console.log("✅ [INIT] Socket WhatsApp inicializado correctamente");

       sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update: any) => {
         clearTimeout(startTimeout);
         const { connection, lastDisconnect, qr } = update;

          if (qr) {
            this.hadQrInThisSession = true;
            try {
              this.qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 1 });
             this.state = "qr";
             logger.info("[WhatsApp] QR code generated successfully");
             console.log("✅ [QR] Código QR generado exitosamente - Longitud: ", this.qrDataUrl?.length);
           } catch (err) {
             logger.error({ err }, "[WhatsApp] Error generating QR code");
             console.error("❌ [QR] Error generando código QR:", err);
             this.state = "error";
             this.lastError = `Error generating QR: ${err instanceof Error ? err.message : String(err)}`;
           }
         }

         if (connection === "open") {
           this.state = "connected";
           this.qrDataUrl = null;
           this.connectedAt = new Date().toISOString();
           this.phoneNumber = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
           this.starting = false;
           this.reconnectAttempts = 0; // Reset on successful connection
           this.lastError = null;
           logger.info({ phone: this.phoneNumber }, "[WhatsApp] Connected");
           console.log(`✅ [CONNECTED] WhatsApp conectado exitosamente - Teléfono: ${this.phoneNumber}`);
         }

         if (connection === "close") {
           const code = (lastDisconnect?.error as any)?.output?.statusCode;
           const loggedOut = code === DisconnectReason.loggedOut;
           const errorMessage = (lastDisconnect?.error as any)?.message || 'Unknown error';

           console.log(`⚠️ [CONNECTION] Desconexión detectada - Código: ${code}, LoggedOut: ${loggedOut}, Error: ${errorMessage}`);

           this.sock = null;
           this.starting = false;
           this.qrDataUrl = null;

            if (loggedOut) {
              this.reconnectAttempts = 0;
              this.state = "disconnected";
              this.lastError = "Sesión cerrada (LoggedOut)";
              logger.info("[WhatsApp] Logged out");
              console.log("❌ [AUTH] Usuario deslogueado - Se requiere nuevo QR");
            } else if (!this.hadQrInThisSession) {
              this.reconnectAttempts = 0;
              this.state = "disconnected";
              this.lastError = "No se pudo conectar con WhatsApp. Revisa que el servidor tenga acceso a web.whatsapp.com (WebSocket).";
              logger.error("[WhatsApp] Connection closed before QR was generated - network issue");
              console.log("❌ [NETWORK] No se pudo conectar con WhatsApp - posible bloqueo de red");
            } else if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
             this.reconnectAttempts++;
             const delay = Math.min(3000 * this.reconnectAttempts, 30000); // max 30s
             this.state = "error";
             this.lastError = `Reconectando... Intento ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}`;
             logger.warn({ attempt: this.reconnectAttempts, delay, error: errorMessage }, "[WhatsApp] Connection closed, reconnecting...");
             console.log(`🔄 [RECONNECT] Reintentando en ${delay}ms - Intento ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}`);
             setTimeout(() => this.start(), delay);
           } else {
             this.state = "disconnected";
             this.reconnectAttempts = 0;
             this.lastError = "Máximo número de reconexiones alcanzado";
             logger.error("[WhatsApp] Max reconnect attempts reached. Stopped. Please rescan QR manually.");
             console.log("❌ [FATAL] Máximo de reintentos alcanzado - Se requiere nuevo QR");
           }
         }
      });

      sock.ev.on("messages.upsert", (upsert: any) => this.handleIncomingMessages(upsert));
       this.starting = false;
        return this.getStatus();
      } catch (e: any) {
        clearTimeout(startTimeout);
        this.starting = false;
        this.state = "error";
        this.lastError = `Error al conectar: ${e instanceof Error ? e.message : String(e)}`;
        logger.error({ err: e }, "Failed to start WhatsApp");
        console.error("❌ [ERROR] Error fatal al iniciar WhatsApp:", e instanceof Error ? e.message : String(e));
        console.error("Stack:", e instanceof Error ? e.stack : "No stack available");
        return this.getStatus();
      }
    }

  /**
   * Procesa el evento "messages.upsert" de Baileys: extrae el texto del
   * mensaje entrante y lo encola en el MessageHandler para que el
   * AgentOrchestrator lo procese. Extraído a método propio (antes vivía
   * inline dentro de start()) para que WhatsAppByTenant pueda reusarlo sin
   * duplicar 250 líneas -- antes intentaba delegar a un método
   * "handleIncoming" que nunca existió, así que los mensajes entrantes de
   * TODAS las instancias multi-tenant se perdían en silencio.
   */
  protected async handleIncomingMessages(upsert: any): Promise<void> {
        console.log("📨 Evento messages.upsert recibido:", JSON.stringify({
          type: upsert.type,
          count: upsert.messages?.length,
          firstMsgType: upsert.messages?.[0] ? Object.keys(upsert.messages[0].message || {})[0] : null,
          allMsgTypes: upsert.messages?.map((m: any) => Object.keys(m.message || {})).flat()
        }));

        try {
          // "notify" es un mensaje que llega EN VIVO. "append" es el que
          // WhatsApp reenvía al reconectar: los que llegaron mientras el bot
          // estaba caído o reiniciándose.
          //
          // Descartar "append" hacía que cada reinicio se tragara en silencio
          // los mensajes de esa ventana. Pasó dos veces hoy con clientes que
          // llegaron de anuncios PAGOS: escribieron, el mensaje nunca se
          // guardó, y nadie les contestó nunca. No hay peor forma de perder
          // plata: se paga el clic, el cliente escribe, y del otro lado no
          // queda ni rastro de que escribió.
          //
          // Se aceptan los dos. El resto (notificaciones de estado, recibos)
          // sí se ignora. La deduplicación por id de mensaje que corre más
          // abajo evita contestar dos veces si WhatsApp reenvía algo que ya
          // se había procesado.
          if (upsert.type !== "notify" && upsert.type !== "append") {
            console.log("⏭️ Ignorando evento tipo:", upsert.type);
            return;
          }
          if (upsert.type === "append") {
            console.log(`📥 [RECUPERADO] ${upsert.messages?.length || 0} mensaje(s) que llegaron mientras el bot estaba desconectado`);
          }
          
          for (const msg of upsert.messages ?? []) {
            // ── Un mensaje se contesta UNA sola vez ──────────────────────
            // Segunda línea de defensa, independiente de cuántos listeners
            // haya montados. La primera es desmontar el socket viejo antes
            // de reconectar (ver whatsappManagerByTenant.start), pero esto
            // cubre cualquier otro camino de duplicación: reintentos de
            // Baileys, dos instancias del proceso, un upsert repetido.
            //
            // Motivo real (2026-08-16): el admin escribió "Hola" una vez y
            // recibió SEIS veces la misma respuesta. Para el cliente es spam
            // y para el número es riesgo de reporte, que es justo lo que más
            // hay que cuidar.
            const idMensaje = msg?.key?.id ? String(msg.key.id) : "";
            if (idMensaje) {
              if (WhatsAppManager.mensajesVistos.has(idMensaje)) {
                console.log("⏭️ Mensaje ya procesado, se ignora:", idMensaje);
                continue;
              }
              WhatsAppManager.mensajesVistos.add(idMensaje);
              // Se recorta para no crecer sin límite en un proceso largo.
              if (WhatsAppManager.mensajesVistos.size > 5000) {
                const it = WhatsAppManager.mensajesVistos.values();
                for (let i = 0; i < 1000; i++) WhatsAppManager.mensajesVistos.delete(it.next().value as string);
              }
            }
            console.log("📨 Procesando mensaje:", {
              msgKey: msg.key,
              fromMe: msg.key.fromMe,
              remoteJid: msg.key.remoteJid,
              pushName: msg.pushName,
              messageKeys: msg.message ? Object.keys(msg.message) : null,
              messageType: msg.message ? Object.keys(msg.message)[0] : null,
              hasText: !!msg.message?.conversation,
              hasExtendedText: !!msg.message?.extendedTextMessage,
              hasImageCaption: !!msg.message?.imageMessage?.caption,
              hasVideoCaption: !!msg.message?.videoMessage?.caption,
              timestamp: new Date().toISOString()
            });
            
            // Log detallado de la estructura del mensaje para debugging
            if (msg.message?.extendedTextMessage) {
              console.log("🔍 [DEBUG] Estructura completa de extendedTextMessage:", JSON.stringify(msg.message.extendedTextMessage, null, 2).substring(0, 1000));
              console.log("🔍 [DEBUG] Propiedades de extendedTextMessage:", Object.keys(msg.message.extendedTextMessage));
              console.log("🔍 [DEBUG] Text property:", msg.message.extendedTextMessage.text);
              console.log("🔍 [DEBUG] SelectedDisplayText property:", msg.message.extendedTextMessage.selectedDisplayText);
              console.log("🔍 [DEBUG] MatchedText property:", msg.message.extendedTextMessage.matchedText);
            }
            
            if (!msg.message) {
              console.log("⏭️ Ignorando: mensaje sin contenido");
              continue;
            }
            
            if (msg.key.fromMe) {
              console.log("⏭️ Ignorando: mensaje enviado por nosotros (fromMe=true)");
              continue;
            }
            
            // Acá vivía un filtro que descartaba TODO mensaje que fuera solo
            // imagen, documento, sticker o audio, diciendo que era media del
            // bot que volvía a entrar. Pero el reingreso propio ya se ataja
            // arriba con fromMe, así que lo único que llegaba a este filtro
            // era media del CLIENTE: la foto sin texto, el pantallazo del
            // comprobante y la nota de voz se tiraban en silencio y el bot
            // nunca contestaba. Ahora la media se entiende (ver más abajo).
            const msgKeys = Object.keys(msg.message || {});

            // DEDUPLICACIÓN DE MENSAJES (Evita que el bot responda varias veces al mismo mensaje)
            const msgId = msg.key.id;
            if (msgId) {
              if (processedMessageIds.has(msgId)) {
                console.log(`⏭️ [ANTI-DUP] Ignorando mensaje duplicado ya procesado: ${msgId}`);
                continue;
              }
              processedMessageIds.add(msgId);
              
              // Limitar tamaño de caché para evitar fugas de memoria
              if (processedMessageIds.size > 2000) {
                const firstAdded = Array.from(processedMessageIds)[0];
                processedMessageIds.delete(firstAdded);
              }
            }
            
            const remoteJid: string = msg.key.remoteJid ?? "";
            
            // Aceptar tanto JID individuales (@s.whatsapp.net) como LID (@lid)
            const isIndividualChat = remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@lid");
            if (!isIndividualChat) {
              console.log("⏭️ Ignorando JID no estándar:", remoteJid.split("@")[1]);
              continue;
            }
            
            // Para LID (@lid), el JID NO contiene el número real -- es un
            // identificador interno de privacidad que WhatsApp usa desde el
            // rollout de "phone number privacy". Antes esto se guardaba tal
            // cual como si fuera el teléfono (ver bug: leads con "teléfono"
            // tipo 6988129931330). Hay que resolverlo al número real vía el
            // LIDMappingStore de Baileys; participant solo sirve en grupos.
            let phone: string;
            let originalJid: string = remoteJid; // Guardar el JID original para responder
            if (remoteJid.endsWith("@lid")) {
              let resolvedPn: string | null = null;
              try {
                resolvedPn = (await this.sock?.signalRepository?.lidMapping?.getPNForLID(remoteJid)) ?? null;
              } catch (err) {
                console.error("⚠️ Error resolviendo LID a número real:", err);
              }
              if (resolvedPn) {
                phone = soloNumero(resolvedPn);
                // Se recuerda: la resolución falla de forma INTERMITENTE para
                // el mismo contacto, y ahí estaba el bug (ver abajo).
                WhatsAppManager.lidAPhone.set(remoteJid, phone);
              } else if (msg.key.participant) {
                phone = soloNumero(msg.key.participant);
                WhatsAppManager.lidAPhone.set(remoteJid, phone);
              } else if (WhatsAppManager.lidAPhone.has(remoteJid)) {
                // Ya lo resolvimos antes en esta sesión: se reusa.
                phone = WhatsAppManager.lidAPhone.get(remoteJid)!;
                console.log("↩️ LID resuelto desde memoria:", remoteJid, "->", phone);
              } else {
                // BUG DE PRODUCCIÓN (2026-08-16): acá se usaba el LID como si
                // fuera el teléfono, sin más. Como la resolución falla de
                // forma intermitente, el MISMO cliente terminaba en dos
                // conversaciones: una con su número real y otra con el id
                // interno. Medido en la base: conv 8 (1 mensaje del cliente,
                // 0 respuestas) contra conv 9 (0 mensajes, 3 respuestas) --
                // el mismo par partido en dos. Y el peor efecto: sus
                // mensajes entraban en un hilo y el agente respondía leyendo
                // el OTRO, que tenía historia vieja. Por eso el admin veía
                // que "solo saluda": contestaba con el contexto equivocado.
                console.warn("⚠️ No se pudo resolver LID a número real, usando ID interno como fallback:", remoteJid);
                phone = soloNumero(remoteJid);
              }
            } else {
              phone = soloNumero(remoteJid);
            }
            const pushName: string = msg.pushName ?? phone;

            // Extraer texto de TODAS las formas posibles con mejor logging
            let text = "";
            const msgObj = msg.message;
            
            console.log("🔍 Analizando mensaje. Claves disponibles:", Object.keys(msgObj || {}));
            
            // Función helper para extraer texto de manera recursiva
            const extractTextRecursively = (obj: any, path = ""): string => {
              if (!obj) return "";
              
              // Casos directos más comunes
              if (obj.conversation) return obj.conversation;
              if (obj.text) return obj.text;
              if (obj.caption) return obj.caption;
              if (obj.selectedDisplayText) return obj.selectedDisplayText;
              if (obj.title) return obj.title;
              if (obj.body) return obj.body;
              
              // Buscar en propiedades anidadas
              for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'object' && value !== null) {
                  const nestedText = extractTextRecursively(value, `${path}.${key}`);
                  if (nestedText) {
                    console.log(`✅ Texto encontrado en: ${path}.${key} = "${nestedText.substring(0, 50)}"`);
                    return nestedText;
                  }
                }
              }
              
              return "";
            };
            
            // Intentar extracción directa primero
            if (msgObj.conversation) {
              text = msgObj.conversation;
              console.log("✅ Texto extraído de: conversation");
            }
            else if (msgObj.extendedTextMessage?.text) {
              text = msgObj.extendedTextMessage.text;
              console.log("✅ Texto extraído de: extendedTextMessage.text");
            }
            else if (msgObj.extendedTextMessage?.selectedDisplayText) {
              text = msgObj.extendedTextMessage.selectedDisplayText;
              console.log("✅ Texto extraído de: extendedTextMessage.selectedDisplayText");
            }
            else if (msgObj.imageMessage?.caption) {
              text = msgObj.imageMessage.caption;
              console.log("✅ Texto extraído de: imageMessage.caption");
            }
            else if (msgObj.videoMessage?.caption) {
              text = msgObj.videoMessage.caption;
              console.log("✅ Texto extraído de: videoMessage.caption");
            }
            else if (msgObj.documentMessage?.caption) {
              text = msgObj.documentMessage.caption;
              console.log("✅ Texto extraído de: documentMessage.caption");
            }
            else if (msgObj.buttonsResponseMessage?.selectedDisplayText) {
              text = msgObj.buttonsResponseMessage.selectedDisplayText;
              console.log("✅ Texto extraído de: buttonsResponseMessage.selectedDisplayText");
            }
            else if (msgObj.listResponseMessage?.title) {
              text = msgObj.listResponseMessage.title;
              console.log("✅ Texto extraído de: listResponseMessage.title");
            }
            else if (msgObj.templateButtonReplyMessage?.selectedDisplayText) {
              text = msgObj.templateButtonReplyMessage.selectedDisplayText;
              console.log("✅ Texto extraído de: templateButtonReplyMessage.selectedDisplayText");
            }
            else if (msgObj.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
              try {
                const params = JSON.parse(msgObj.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
                text = params.body || params.text || "";
                console.log("✅ Texto extraído de: interactiveResponseMessage JSON params");
              } catch (e) {
                console.log("⚠️ Error parseando interactiveResponseMessage JSON:", e);
              }
            }
            else if (msgObj.ephemeralMessage?.message) {
              text = extractTextRecursively(msgObj.ephemeralMessage.message, "ephemeralMessage.message");
            }
            else if (msgObj.viewOnceMessage?.message) {
              text = extractTextRecursively(msgObj.viewOnceMessage.message, "viewOnceMessage.message");
            }
            else if (msgObj.protocolMessage?.caption) {
              text = msgObj.protocolMessage.caption;
              console.log("✅ Texto extraído de: protocolMessage.caption");
            }
            else {
              // Extracción recursiva como último recurso
              console.log("🔄 Intentando extracción recursiva...");
              text = extractTextRecursively(msgObj, "message");
            }
            
            if (!text || !text.trim()) {
              console.log("⚠️ MENSAJE SIN TEXTO EXTRAÍBLE");

              // ── Nota de voz o foto del cliente ────────────────────────────
              // Va ANTES del rebusque de más abajo: ese rebusque agarra
              // cualquier cadena del JSON del mensaje, y en una foto eso puede
              // terminar siendo un mimetype ("image/jpeg") entrando al agente
              // como si fuera lo que dijo el cliente.
              const esAudio = !!(msgObj?.audioMessage || msgObj?.pttMessage);
              const esImagen = !!msgObj?.imageMessage;
              if (esAudio || esImagen) {
                try {
                  const buf = (await downloadMediaMessage(msg, "buffer", {})) as Buffer;
                  const mime = String(
                    msgObj?.audioMessage?.mimetype || msgObj?.imageMessage?.mimetype || ""
                  ).split(";")[0] || (esAudio ? "audio/ogg" : "image/jpeg");

                  if (esAudio) {
                    const dicho = await transcribirAudio(buf, mime);
                    if (dicho) {
                      text = dicho;
                      console.log(`🎙️ [AUDIO] Nota de voz transcrita: "${dicho.slice(0, 60)}"`);
                    } else {
                      // Sin transcripción no se adivina: se le dice al cliente
                      // la verdad y se le da una salida, en vez de callarse.
                      text = "[el cliente mandó una nota de voz que no se pudo escuchar]";
                    }
                  } else {
                    const visto = await describirImagen(buf, mime);
                    text = visto
                      ? `[el cliente mandó una foto: ${visto}]`
                      : "[el cliente mandó una foto que no se pudo ver]";
                    console.log(`🖼️ [IMAGEN] ${visto ? "descrita" : "sin modelo que la vea"}`);
                  }
                } catch (e: any) {
                  console.error("❌ [MEDIA] No se pudo procesar la media:", e?.message);
                  text = esAudio
                    ? "[el cliente mandó una nota de voz que no se pudo escuchar]"
                    : "[el cliente mandó una foto que no se pudo ver]";
                }
              }
            }

            if (!text || !text.trim()) {
              // Usar función de diagnóstico
              const diagnostic = diagnoseMessage(msgObj);
              console.log("🔍 DIAGNÓSTICO:", diagnostic.diagnosis);
              console.log("💡 RECOMENDACIONES:", diagnostic.recommendations);
              
              if (diagnostic.possibleText) {
                text = diagnostic.possibleText;
                console.log("🎯 Usando texto encontrado en diagnóstico:", text);
              } else {
                console.log("📋 Claves del mensaje:", Object.keys(msgObj || {}));
                console.log("🔍 Estructura completa del mensaje:");
                console.log(JSON.stringify(msgObj, null, 2).substring(0, 1000));
                
                // Último recurso: rebuscar cualquier cadena del mensaje que
                // parezca texto escrito por una persona.
                //
                // JSON.stringify devuelve también los NOMBRES DE LOS CAMPOS,
                // no solo los valores, y este rebusque los tomaba como si
                // fueran el mensaje del cliente: en el panel llegó a quedar
                // una conversación cuyo último mensaje era, literalmente,
                // "messageContextInfo" -- un campo del protocolo de WhatsApp
                // mostrado como si el cliente lo hubiera escrito, y peor,
                // metido al agente como si fuera su consulta. Se descartan las
                // cadenas que no parecen lenguaje humano.
                const PARECE_CAMPO_TECNICO = /^[a-z]+([A-Z][a-zA-Z0-9]*)+$/;      // messageContextInfo, deviceListMetadata
                const PARECE_IDENTIFICADOR = /^[A-Za-z0-9+/=_-]{16,}$/;           // claves, hashes, ids en base64
                const allStrings = JSON.stringify(msgObj).match(/"[^"]{3,}"/g);
                if (allStrings && allStrings.length > 0) {
                  const potentialText = allStrings
                    .map(s => s.slice(1, -1)) // Remover comillas
                    .filter(s => s.length > 2 && !s.includes('http') && !s.includes('@') && !/^\d+$/.test(s))
                    .filter(s => !PARECE_CAMPO_TECNICO.test(s) && !PARECE_IDENTIFICADOR.test(s))
                    // Texto de verdad: tiene espacios, o es una palabra suelta
                    // corta y en minúsculas ("hola", "si", "cuanto").
                    .filter(s => /\s/.test(s.trim()) || /^[a-záéíóúñ¿¡?!.,]{2,15}$/i.test(s.trim()))
                    .find(s => /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(s)); // Contiene letras

                  if (potentialText) {
                    text = potentialText;
                    console.log("🎯 Texto potencial encontrado:", text);
                  }
                }
                
                if (!text || !text.trim()) {
                  console.log("❌ No se pudo extraer texto del mensaje. Ignorando.");
                  continue;
                }
              }
            }
            
             console.log("✅ Texto extraído:", text.substring(0, 50));

             // Si el mensaje es del admin respondiendo una sugerencia del
             // agente de anuncios ("sí 45" / "no 45"), se resuelve acá y NO
             // pasa al bot de ventas -- son cosas distintas aunque lleguen
             // por el mismo número de WhatsApp.
             try {
               const { handleAdminReply } = await import("./ad-growth-agent");
               const handled = await handleAdminReply(phone, text.trim());
               if (handled) continue;
             } catch (err) {
               console.error("[AdGrowthAgent] Error procesando respuesta del admin:", err);
             }

             // ✅ DELEGADO AL MESSAGE HANDLER + ORCHESTRATOR
             // El MessageHandler encola el mensaje y el AgentOrchestrator lo procesa
             // Esto evita respuestas duplicadas al procesar por una sola ruta
             const messageHandler = getMessageHandler();
             try {
               await messageHandler.handleIncomingMessage({
                 tenantId: String(this.currentTenant.id),
                 remoteJid: originalJid,
                 phone,
                 fromMe: false,
                 messageId: msg.key.id || `msg_${Date.now()}`,
                 body: text.trim(),
                 timestamp: new Date(msg.messageTimestamp ? msg.messageTimestamp * 1000 : Date.now()),
                 pushName,
                 // De que anuncio llego (si llego de uno). El texto que manda
                 // Meta es siempre el mismo para todos los anuncios, asi que
                 // esto es lo unico que dice que producto vino a buscar.
                 anuncio: extraerContextoDeAnuncio(msgObj) ?? undefined,
               });
               console.log(`📤 [WA-QUEUE] Mensaje encolado exitosamente a MessageHandler: ${text.substring(0, 30)}...`);
             } catch (error) {
               console.error(`❌ [WA-QUEUE] Error encolando mensaje en MessageHandler:`, error);
             }
           }
        } catch (e) {
          logger.error({ err: e }, "Error processing incoming message");
        }
  }

  async sendText(phone: string, text: string, originalJid?: string) {
    if (!this.sock || this.state !== "connected") throw new Error("WhatsApp no conectado");
    this.enforceSendLimits();
    await this.verificarProteccionesAsync(text, phone);
    await this.esperarEspaciadoEntreEnvios();
    const targetJid = originalJid || `${phone}@s.whatsapp.net`;

    // Estilo emoji: sin asteriscos ni viñetas de punto (más amigable/pro)
    text = toEmojiStyle(text);

    // Simular lectura + escritura
    await sleep(READ_DELAY_MS);
    await this.sock.sendPresenceUpdate("composing", targetJid);
    await sleep(calcTypingDelay(text));
    await this.sock.sendPresenceUpdate("paused", targetJid);

    try {
      await this.sock.sendMessage(targetJid, { text });
    } catch (e) {
      this.recordSendFailure();
      throw e;
    }
    this.recordSendSuccess();
    trackWhatsAppCost(this.currentTenant.id.toString());
  }

  async sendImage(phone: string, imageUrl: string, caption: string, originalJid?: string) {
    if (!this.sock || this.state !== "connected") throw new Error("WhatsApp no conectado");
    this.enforceSendLimits();
    await this.esperarEspaciadoEntreEnvios();
    const jid = originalJid || `${phone}@s.whatsapp.net`;

    // Simular lectura + escritura (basado en el caption)
    await sleep(READ_DELAY_MS);
    await this.sock.sendPresenceUpdate("composing", jid);
    await sleep(calcTypingDelay(caption));
    await this.sock.sendPresenceUpdate("paused", jid);

    let sentSomething = false;
    try {
      const buffer = await loadProductImage(imageUrl);
      if (!buffer) throw new Error(`no se pudo obtener la imagen (${imageUrl})`);
      await this.sock.sendMessage(jid, { image: buffer, caption });
      sentSomething = true;
    } catch (e: any) {
      // NO se manda una imagen "parecida" cuando falla la real.
      //
      // Antes se caía a getProductImage(), que devuelve fotos de stock de
      // Unsplash elegidas por palabra clave del nombre. En una conversación
      // de venta eso significa enseñarle al cliente una foto que NO es el
      // producto que está comprando: peor que no mandar nada, porque induce
      // a error sobre lo que recibe. Se manda el texto solo, que es honesto.
      console.error(
        `[WhatsApp] Imagen no disponible (${imageUrl}): ${e.message}. Se envía solo el texto para no mostrar una foto que no es del producto.`,
      );
      try {
        await this.sock.sendMessage(jid, { text: caption });
        sentSomething = true;
      } catch (err: any) {
        console.error(`[WhatsApp] Error fatal enviando texto: ${err.message}`);
      }
    }
    // Solo cuenta como fallo de ENVÍO (para el circuit breaker) si ni la
    // imagen ni el texto de respaldo lograron salir por el socket -- que
    // falte la imagen del producto no es una señal de que WhatsApp esté
    // restringiendo el número.
    if (sentSomething) this.recordSendSuccess();
    else this.recordSendFailure();
    trackWhatsAppCost(this.currentTenant.id.toString());
  }

  async sendAgentParts(phone: string, pushName: string, parts: AgentReplyPart[], originalJid?: string) {
    const timestamp = new Date().toISOString();
    console.log(`📤 [WA-PARTS] Iniciando envío de partes - Teléfono: ${phone}, Partes: ${parts.length} - ${timestamp}`);
    
    const cardIds = parts.flatMap((p) => (p.kind === "card" ? [p.productId] : []));
    let cardCache: Map<number, any> = new Map();
    const pg = new PaymentGateway(this.currentTenant);
    
    console.log(`🃏 [WA-PARTS] Tarjetas a procesar: ${cardIds.length} - IDs: [${cardIds.join(', ')}] - ${timestamp}`);
    
     if (cardIds.length) {
       const rows = await db.select().from(products).where(inArray(products.id, cardIds.filter((id): id is number => id !== undefined)));
       cardCache = new Map(rows.map((r) => [r.id, r]));
       console.log(`📦 [WA-PARTS] Productos cargados: ${rows.length}/${cardIds.length} - ${timestamp}`);
     }

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      console.log(`📨 [WA-PARTS] Procesando parte ${i + 1}/${parts.length} - Tipo: ${part.kind} - ${timestamp}`);

      // Pausa natural entre partes consecutivas (simula que el agente "termina" un mensaje antes del siguiente)
      if (i > 0) await sleep(600);

      if (part.kind === "text") {
        console.log(`💬 [WA-TEXT] Enviando texto: "${part.content?.substring(0, 50)}..." - ${timestamp}`);
        await this.sendText(phone, part.content || "", originalJid);
        console.log(`✅ [WA-TEXT] Texto enviado exitosamente - ${timestamp}`);
       } else {
         const product = cardCache.get(part.productId!);
         if (!product) {
           console.log(`⚠️ [WA-CARD] Producto no encontrado para ID: ${part.productId} - ${timestamp}`);
           continue;
         }
        
        console.log(`🃏 [WA-CARD] Enviando tarjeta de producto: ${product.name} (ID: ${part.productId}) - ${timestamp}`);
        
        try {
          const dynamicLinks = await pg.getAllLinks(product, { phone, name: pushName });
          console.log(`🔗 [WA-CARD] Enlaces generados - MercadoPago: ${!!dynamicLinks.mercadopago?.url}, PayPal: ${!!dynamicLinks.paypal?.url}, Transfer: ${dynamicLinks.transfer.options.length} - ${timestamp}`);
          
          const isPaymentOnly = part.paymentOnly === true;
          // Solo la imagen REAL del producto. Si no la tiene, sendImage manda
          // el texto solo — nunca una foto de otro producto (ver sendImage).
          const imageToUse = product.imageUrl || "";

          if (isPaymentOnly) {
            const caption = buildPaymentOnlyCaption(product, dynamicLinks);
            console.log(`🖼️ [WA-CARD] Enviando pago - Caption: ${caption.length} caracteres - ${timestamp}`);
            await this.sendImage(phone, imageToUse, caption, originalJid);
          } else {
            // La ficha va PARTIDA: la foto con el título y el resumen, y el
            // resto como mensajes cortos seguidos. En el celular un solo
            // mensaje de 30 líneas tapa la pantalla; así se lee de un vistazo
            // y se siente como alguien escribiendo, no como un folleto.
            // El teléfono va de semilla: dos clientes distintos reciben
            // redacciones distintas, y el mismo cliente siempre la misma.
            const bloques = await buildProductBlocks(product, dynamicLinks, phone);
            console.log(`🖼️ [WA-CARD] Enviando ficha en ${bloques.length} bloques - ${timestamp}`);
            await this.sendImage(phone, imageToUse, bloques[0] || product.name, originalJid);
            for (const bloque of bloques.slice(1)) {
              // Pausa entre bloques: sin esto llegan todos juntos y se pierde
              // el efecto de mensajes separados.
              await sleep(900);
              await this.sendText(phone, bloque, originalJid);
            }
          }
          console.log(`✅ [WA-CARD] Tarjeta enviada exitosamente para ${product.name} - ${timestamp}`);
        } catch (err: any) {
          console.log(`❌ [WA-CARD] Error enviando tarjeta para ${product.name}: ${err.message} - ${timestamp}`);
        }
      }
    }
    
    console.log(`🏁 [WA-PARTS] Envío de partes completado - Total: ${parts.length} partes procesadas - ${timestamp}`);
  }

}

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export const whatsapp = new WhatsAppManager();
