import { eq, inArray, desc, and } from "drizzle-orm";
import { getAppUrl } from "./app-url";
import { transcribirAudio, describirImagen } from "./media-entrante";
import { contextoDeMoneda } from "./moneda-por-pais";
import { invitacionDe, sePuedeOfrecerElVideo, pidioElVideo, type SeccionFicha } from "./ficha-parcial";
import { anotarMensajePropio, loMandamosNosotros } from "./mensajes-propios";
import { sumarMensaje } from "./consumo-del-plan";
import { videoDeProducto } from "./video-de-producto";
import { leerFicha, repartirPuntos, PRESUPUESTO_PIE_DE_FOTO } from "./ficha-del-producto";
import { hablarColombiano } from "./hablar-colombiano";
import { etiquetaDeTransferencia } from "./conversation-engine";
import { mediosDePago, loQuePidio, renderMediosDePago, noManejamosEse } from "./hechos-de-pago";
import { getOrCreateLanding, type MagicLandingResult } from "./landingforge-client";

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
  tenants,
} from "@workspace/db";

import { logger } from "./logger";
import { runAgentReply } from "./agent";
import { presentarParaWhatsApp } from "./presentacion";
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

/**
 * ¿Esta cadena la escribió una persona, o es plomería de WhatsApp?
 *
 * El problema que resuelve, visto en producción el 2026-08-22 en la
 * conversación 4 (Martha Cecilia, 573145632442):
 *
 *   17:06:05  cliente: "¡Hola! Quiero más información"   ← venía del anuncio de PIANO
 *   17:06:07  bot:     "¿Vienes por el Cojín Moto Viajero 3D, cierto?"
 *   17:06:10  cliente: "215814204608627@lid"             ← NADIE escribió esto
 *   17:06:49  bot:     "te muestro el Pack de Contabilidad"
 *
 * Ese `215814204608627@lid` es un LID -- el identificador interno de WhatsApp.
 * Cuando el mensaje no traía texto extraíble, `diagnoseMessage()` rebuscaba
 * cualquier cadena del JSON con al menos una letra, y "lid" son letras. Se
 * guardó como mensaje del cliente y el agente le contestó con un producto al
 * azar. Al cliente le llegaron dos productos que no tenían nada que ver con
 * el anuncio que se pagó para traerlo.
 *
 * El rebusque de más abajo YA filtraba esto (descarta las cadenas con "@"),
 * pero esta rama usaba `possibleText` crudo. Dos caminos al mismo lugar y
 * solo uno con reja. Por eso el chequeo vive acá, en una sola función que
 * usan los dos.
 */
export function pareceMensajeDePersona(s: unknown): boolean {
  if (typeof s !== "string") return false;
  const t = s.trim();
  // Mínimo 2 y no 3: "sí" es el mensaje MÁS importante de toda la venta, y
  // con el corte en 3 quedaba afuera. Igual que "ok" y "no".
  if (t.length < 2) return false;

  // Tiene que tener alguna letra: "12345" no es un mensaje.
  if (!/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(t)) return false;

  // JIDs y LIDs de WhatsApp: 573001234567@s.whatsapp.net, 2158142@lid,
  // 1234-5678@g.us. Nadie escribe esto en un chat.
  if (/@(lid|s\.whatsapp\.net|g\.us|c\.us|broadcast|newsletter)/i.test(t)) return false;
  if (/^\+?\d[\d\s:.-]*@/.test(t)) return false;

  // Nombres de campos del protocolo: messageContextInfo, deviceListMetadata.
  if (/^[a-z]+([A-Z][a-zA-Z0-9]*)+$/.test(t)) return false;

  // Claves, hashes e ids en base64.
  if (/^[A-Za-z0-9+/=_-]{16,}$/.test(t)) return false;

  // Mimetypes: image/jpeg, audio/ogg; codecs=opus.
  if (/^(image|audio|video|application|text)\/[a-z0-9.+-]+/i.test(t)) return false;

  // Mayoría de dígitos y sin espacios: casi siempre un identificador.
  // `>=` y no `>`: un id hexadecimal como "3A1F2E4B7C9D" tiene exactamente
  // la mitad de dígitos y se colaba por un carácter.
  const digitos = (t.match(/\d/g) || []).length;
  if (!/\s/.test(t) && digitos >= t.length / 2) return false;

  return true;
}

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
    if (typeof obj === 'string' && pareceMensajeDePersona(obj)) {
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
  /**
   * Qué pedazo de la ficha corresponde mandar. Cuando viene, manda sobre
   * `paymentOnly`, que queda solo por compatibilidad con lo ya encolado.
   */
  seccion?: SeccionFicha;
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
/** El tipo real de la imagen, leído de sus primeros bytes. */
export function tipoDeImagen(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  return null;
}

async function loadProductImage(imageUrl: string): Promise<Buffer | null> {
  if (!imageUrl) return null;

  const axios = (await import("axios")).default;

  // URL absoluta: se descarga tal cual.
  if (/^https?:\/\//i.test(imageUrl)) {
    try {
      const r = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        // Las fotos de los productos FÍSICOS viven en el CDN de Dropi
        // (d39ru7awumhhs2.cloudfront.net) y algunas pesan más de medio mega;
        // 8s alcanzaban justo, y un pico de latencia dejaba al cliente sin
        // foto. Los digitales no lo notaban porque salen de disco.
        timeout: 20000,
        maxContentLength: 12 * 1024 * 1024,
        // Sin User-Agent, CloudFront responde 403 (verificado con curl -A "").
        // Axios manda uno propio, pero no hay que depender de ese detalle.
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; VentasProBot/1.0)",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      });
      const buf = Buffer.from(r.data);
      if (buf.length === 0) {
        console.error(`[WhatsApp] La imagen vino vacía: ${imageUrl}`);
        return null;
      }
      return buf;
    } catch (e: any) {
      // El motivo importa: 403 del CDN, timeout y "no existe" se arreglan de
      // formas distintas, y antes los tres se veían igual (silencio).
      const status = e?.response?.status;
      console.error(
        `[WhatsApp] No se pudo descargar la imagen (${imageUrl}): ` +
        `${status ? "HTTP " + status : e?.code || e?.message}`,
      );
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
/**
 * Las condiciones de envío/cobro del NEGOCIO dueño del producto.
 *
 * `getBusinessContext` está cacheado 60s por tenant, así que pedirlo desde la
 * ficha no agrega consultas. Si falla, el respaldo son las condiciones del
 * dueño de la plataforma (las de siempre), para no dejar la ficha sin datos.
 */
/**
 * Qué decir de un producto que NO tiene descripción ni características.
 *
 * Antes era una frase fija de curso ("Formación práctica para llevar tus
 * habilidades al siguiente nivel") para TODO el catálogo: le salió a un bolso
 * antirrobo (12-09-2026). Ahora depende del modelo del producto, y nunca
 * inventa un beneficio: dice cómo se recibe, que es lo único que se sabe.
 */
async function resumenDeRespaldo(p: { name?: string | null; kind?: string | null; category?: string | null; deliveryLink?: string | null; description?: string | null; tenantId?: number | null }): Promise<string> {
  const { modeloDelProducto, frasePagoEnvio } = await import("./modelo-de-negocio");
  switch (modeloDelProducto(p as any)) {
    case "fisico": {
      // Cómo se paga sale de las condiciones del negocio, no de una frase fija.
      const c = await condicionesDelProducto(p);
      return `Producto físico: te lo enviamos a tu dirección. ${frasePagoEnvio(c)}.`;
    }
    case "servicio": return "Atención personalizada: se agenda por este chat.";
    case "suscripcion": return "Acceso por período, con renovación.";
    case "cotizacion": return "Se cotiza según lo que necesités.";
    case "captacion": return "Un asesor te acompaña por este mismo número.";
    default: return "Formación práctica para llevar tus habilidades al siguiente nivel.";
  }
}

async function condicionesDelProducto(p: { tenantId?: number | null }) {
  const { CONDICIONES_DE_RESPALDO } = await import("./modelo-de-negocio");
  if (!p?.tenantId) return CONDICIONES_DE_RESPALDO;
  try {
    const { getBusinessContext } = await import("./business-context");
    const ctx = await getBusinessContext(p.tenantId);
    return ctx?.condiciones ?? CONDICIONES_DE_RESPALDO;
  } catch {
    return CONDICIONES_DE_RESPALDO;
  }
}

async function buildProductBlocks(p: typeof products.$inferSelect, dynamicLinks?: any, semilla = ""): Promise<string[]> {
  const completo = await buildProductCaption(p, null, dynamicLinks, semilla);
  // El separador es la línea en blanco doble que deja cada sección; se agrupan
  // las secciones cortas para no mandar ocho mensajes de una línea.
  // 🎬 incluido: el video de muestra va en su PROPIO mensaje, para que
  // WhatsApp le arme la vista previa con miniatura. Pegado a otro texto, el
  // enlace queda perdido en el medio y pierde todo su efecto.
  const secciones = completo.split(/\n(?=📚 |💻 |🎬 |💰 |━|💳 |🚚 |🛒 |🚀 )/);
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
  const mainEmoji = emojiDelProducto(p.name, categoryName);

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
  // Tomaba `description.split(/\r?\n/)[0]`, o sea la PRIMERA linea -- que en
  // estas fichas es el titulo. Resultado: el nombre del producto impreso dos
  // veces, uno debajo del otro. Se lee igual que en construirSeccion.
  const crudo = leerFicha(p.description, p.name).intro;
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
  lines.push(resumen || (await resumenDeRespaldo(p)));
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
    for (const f of propias.slice(0, 8)) lines.push(`${emojiDeCaracteristica(f, p.name)} ${f}`);
    // Antes decía "…y 1 más" a secas y quedaba cortado, sin decir más de qué.
    // Mismo cuidado con el singular que en la ficha parcial: "1 cosas más" es
    // una falta de ortografía que el cliente lee justo cuando está evaluando
    // si confiar.
    if (propias.length > 8) {
      const restantes = propias.length - 8;
      lines.push(`➕ Y ${restantes} ${restantes === 1 ? "cosa más" : "cosas más"} que te cuento por aquí`);
    }
    lines.push("");
  } else if (meta.classes) {
    lines.push(variante([`📚 *Incluye:*`, `📚 *Qué vas a recibir:*`, `📚 *Contenido:*`, `📚 *Esto trae:*`], sem));
    lines.push(`🎬 ${meta.classes} en Alta Definición`);
    lines.push("");
  }

  // Un producto FISICO no es "online y descargable" ni tiene "acceso de por
  // vida". Este respaldo estaba fijo para TODO el catalogo, asi que una
  // rodillera termica se ofrecia como descargable -- reportado por el admin.
  // Se ramifica por el tipo real del producto.
  // Ahora por MODELO (físico, digital, servicio, suscripción, a cotizar,
  // captación): una consulta nutricional no es "descargable" ni "de por vida".
  const { modeloDelProducto: modeloDe } = await import("./modelo-de-negocio");
  const modeloFicha = modeloDe(p as any);
  const esDigital = modeloFicha === "digital";
  lines.push(
    modeloFicha === "fisico" ? variante([`📦 *Cómo lo recibís:*`, `📦 *Entrega:*`, `📦 *Envío:*`], sem)
    : modeloFicha === "servicio" ? variante([`🗓️ *Cómo funciona:*`, `🗓️ *Modalidad:*`], sem)
    : modeloFicha === "suscripcion" ? `🔁 *Cómo funciona:*`
    : modeloFicha === "cotizacion" ? `🧾 *Cómo funciona:*`
    : modeloFicha === "captacion" ? `🤝 *Cómo funciona:*`
    : variante([`💻 *Modalidad:*`, `💻 *Cómo funciona:*`, `💻 *Acceso:*`, `💻 *Cómo lo recibís:*`], sem),
  );
  if (estandar.length > 0) {
    for (const f of estandar.slice(0, 4)) lines.push(`${emojiDeCaracteristica(f, p.name)} ${f}`);
  } else if (esDigital) {
    lines.push(`💻 100% online y descargable`);
    lines.push(`♾️ Acceso de por vida`);
  } else if (modeloFicha === "fisico") {
    lines.push(`📦 Te lo enviamos a tu dirección`);
    lines.push(`📲 Coordinamos la entrega por aquí`);
  } else if (modeloFicha === "servicio") {
    lines.push(`🗓️ Se agenda por aquí y te confirmamos la hora`);
  } else if (modeloFicha === "suscripcion") {
    lines.push(`🔁 Acceso por período, se renueva`);
  } else if (modeloFicha === "cotizacion") {
    lines.push(`🧾 Precio según lo que necesités: te cotizamos por aquí`);
  } else {
    lines.push(`🤝 Un asesor te contacta por este número`);
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
  const videoMuestra = videoDeProducto(meta);
  if (videoMuestra) {
    lines.push(variante([
      `🎬 *Mira cómo son las clases:*`,
      `🎬 *Así se ve por dentro:*`,
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

  // ── Un producto que se DESPACHA se paga al recibir ──────────────────────
  //
  // La ficha mostraba MercadoPago, PayPal y Nequi para una licuadora que va
  // por transportadora contraentrega, y cerraba con "¿Te lo activo ahora?".
  // El agente, en el mismo turno, decía "pagás cuando la recibís": dos
  // mensajes seguidos que se contradicen (medido el 11-09-2026). Acá no hay
  // enlaces ni cuentas: hay envío incluido, plazo fijo y pago al recibir.
  const { seDespachaPorTransportadora } = await import("./entrega-del-producto");
  if (seDespachaPorTransportadora(p as any)) {
    // Las condiciones son del NEGOCIO dueño del producto, no de la plataforma.
    const c = await condicionesDelProducto(p);
    const { fraseCostoEnvio, frasePagoEnvio } = await import("./modelo-de-negocio");
    lines.push(variante([`🚚 *ENVÍO Y PAGO*`, `🚚 *Cómo lo recibís*`, `🚚 *Entrega y pago*`], sem));
    lines.push("");
    lines.push(`📦 ${fraseCostoEnvio(c)}, ${c.envio.cobertura}`);
    lines.push(`⏱️ Llega en ${c.envio.plazo}`);
    lines.push(`💵 ${frasePagoEnvio(c)}`);
    lines.push("");
    // Contraentrega: no hay nada que cobrar ahora, la ficha termina acá.
    // Pago anticipado: siguen los medios de pago normales.
    if (c.envio.pago === "contraentrega") {
      lines.push(variante([
        `🚀 *¿Te tomo el pedido? Me pasás tus datos de envío y lo dejamos listo.*`,
        `🚀 *¿Lo pedimos? Solo necesito tus datos de envío.*`,
        `🚀 *¿Te lo envío? Decime y te pido los datos para el despacho.*`,
      ], sem));
      return lines.join("\n");
    }
  }

  if (dynamicLinks) {
    lines.push(variante([`💳 *FORMAS DE PAGO*`, `💳 *Puedes pagar así*`, `💳 *Medios de pago*`, `💳 *Cómo pagar*`], sem));
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
    // Una linea por medio, con el enlace adentro. La regla vive en
    // `medios-de-pago-en-linea.ts` y tiene su propio test: aca no se podia
    // probar (funcion async y privada), y por eso se rompio sin que nadie lo
    // notara hasta leer una conversacion real.
    const { lineasDeMediosDePago } = await import("./medios-de-pago-en-linea");
    lines.push(...lineasDeMediosDePago(dynamicLinks, {
      aceptaPagosLocales: !!mon.aceptaPagosLocales,
      esColombia: !!mon.esColombia,
      etiquetaTransferencia: etiquetaDeTransferencia(dynamicLinks.transfer),
    }));
    lines.push("");
  }

  // Comprar desde la tienda: pedido del admin (2026-08-16). Es la salida
  // cuando el cliente no quiere ninguno de los métodos de arriba, y además
  // ahí ve el producto con su foto y su ficha completa. El enlace corto /p/<id>
  // redirige a la página real y ya trae vista previa con imagen al compartirse.
  const urlTienda = `${(process.env.APP_URL || "https://ventasproia.com").replace(/\/+$/, "")}/p/${p.id}`;
  lines.push(variante([`🛒 *O comprá directo en la tienda:*`, `🛒 *También puedes comprarlo acá:*`, `🛒 *Directo desde la web:*`, `🛒 *Si preferís, desde la tienda:*`], sem));
  lines.push(urlTienda);
  lines.push("");

  lines.push(variante([`🚀 *¿Quieres comprarlo ahora o tienes alguna pregunta?*`, `🚀 *¿Lo quieres llevar o te resuelvo alguna duda primero?*`, `🚀 *¿Arrancamos hoy o te queda alguna pregunta?*`, `🚀 *¿Te lo activo ahora o quieres saber algo más?*`, `🚀 *¿Seguimos con la compra o te ayudo con algo más?*`], sem));
  
  return lines.join("\n");
}

/**
 * Los mensajes que corresponden a UNA sección de la ficha.
 *
 * La ficha salía siempre entera: título, resumen, contenido, modalidad, video,
 * precio, TRES medios de pago y el link de la tienda. Preguntaras lo que
 * preguntaras, y también cuando solo dijiste "me interesa el curso de X".
 *
 * Medido en la conversación real del 17-19 de agosto: un "me interesa el curso
 * de educa a tu perro" recibía cinco mensajes seguidos que terminaban con tres
 * enlaces de pago y el número de Nequi -- antes de que el cliente preguntara
 * siquiera el precio. Eso no es atender, es volcar un folleto: al cliente no le
 * queda nada que preguntar, y una conversación que se termina no se cierra.
 *
 * Acá se arma solo el pedazo que el cliente pidió, y se cierra con una puerta
 * abierta (ver `invitacionDe`). El resto se queda para el turno siguiente.
 *
 * Devuelve `{ conFoto, mensajes }`: la foto solo va cuando presenta el
 * producto, no cuando responde "¿cuánto vale?".
 */
/**
 * El emoji que le corresponde a UNA característica, por lo que dice.
 *
 * Antes toda la lista salía con el mismo ✅. Con 5 viñetas iguales el ojo no
 * distingue una de otra y la ficha se lee como un bloque -- el admin lo pidió
 * explícito: "usar el emoji de cada característica del producto".
 *
 * Se elige por PALABRA, no por posición: así el mismo producto siempre da la
 * misma cara, y dos productos distintos no comparten un emoji que no les
 * corresponde. Lo que no reconoce se queda con ✅, que nunca queda mal.
 */
/**
 * El emoji que encabeza la ficha de un producto.
 *
 * Antes esto eran DOS cadenas de cuatro reglas escritas a mano --piano,
 * guitarra, canto, excel-- que caían en 💻. O sea que en cualquier negocio que
 * no fuera este, la ficha abría con un ícono de laptop: una panadería vendiendo
 * una torta, una tienda de ropa vendiendo una camisa, un taller vendiendo un
 * repuesto. Todos, 💻.
 *
 * El admin lo preguntó así el 2026-09-01: "un negocio que no tenga maqueta,
 * ¿no debería la IA reorganizar las cosas, de forma real y racional?".
 *
 * ── La respuesta, y por qué NO la decide el modelo ───────────────────────
 *
 * Se reusa el mismo diccionario que ya clasifica las CARACTERÍSTICAS: son
 * reglas sobre datos reales del catálogo (el nombre y la categoría que cargó
 * el dueño), así que se adaptan solas a cualquier rubro sin que nadie arme una
 * maqueta.
 *
 * Dejárselo al modelo sería más flexible y peor: es la misma puerta por la que
 * este proyecto ya vio entrar precios inventados, garantías que no existían y
 * un número de Nequi que no era de nadie. El reparto que funciona --y que ya
 * gobierna el resto del sistema-- es que el servidor decide lo que tiene que
 * salir exacto, y el modelo escribe lo que es flexible. Un emoji es cosmético,
 * pero encabeza una ficha con precio: si se equivoca, la ficha entera se lee
 * como de otro negocio.
 *
 * El respaldo es 📦 y no 💻: una caja no afirma nada sobre qué se vende. El
 * ícono de laptop sí, y para el 90% de los negocios afirma algo falso.
 */
export function emojiDelProducto(nombre: string, categoria?: string | null): string {
  const porNombre = emojiDeCaracteristica(nombre, "");
  if (porNombre !== "•") return porNombre;
  if (categoria) {
    const porCategoria = emojiDeCaracteristica(String(categoria), "");
    if (porCategoria !== "•") return porCategoria;
  }
  return "📦";
}

export function emojiDeCaracteristica(texto: string, deQueProducto = ""): string {
  const t = String(texto).toLowerCase();
  const REGLAS: Array<[RegExp, string]> = [
    [/certificad|diploma/, "📜"],
    [/garant[ií]a|devoluci[oó]n|reembolso/, "🛡️"],
    [/de por vida|permanente|ilimitad/, "♾️"],
    [/soporte|acompa[ñn]amiento|asesor/, "🙌"],
    [/partitura|m[uú]sica|piano|teclado|acorde/, "🎼"],
    [/perro|cachorr|mascota|canin|adiestra/, "🐶"],
    [/ingl[eé]s|idioma|franc[eé]s|alem[aá]n|italian|portugu/, "🌍"],
    [/dise[ñn]o|gr[aá]fic|imagen|logo|visual|foto/, "🎨"],
    // El orden importa: una linea suele nombrar varias cosas a la vez ("n8n:
    // agente IA, APIs y webhooks"). Gana lo mas ESPECIFICO, que es lo que
    // distingue esa caracteristica de las demas del mismo producto -- si
    // ganara "agente", medio curso de IA saldria con la misma carita.
    [/automatiz|n8n|flujo|webhook|\bapi\b|sin c[oó]digo/, "⚙️"],
    [/servidor|\bvps\b|nube|hosting|montar/, "🚀"],
    [/whatsapp|telegram|slack|conect/, "🔗"],
    [/c[oó]digo|programa|\bapp\b|supabase|render/, "💻"],
    [/agente|\bia\b|inteligencia artificial|chatbot|\bbot\b/, "🤖"],
    [/excel|office|word|powerpoint|outlook|planilla/, "📊"],
    [/plantilla|recurso|descarga|archivo/, "📁"],
    [/video|clase|m[oó]dulo|lecci[oó]n|curso/, "🎬"],
    [/alta definici[oó]n|\bhd\b|calidad/, "📺"],
    [/env[ií]o|direcci[oó]n|domicilio|entrega/, "📦"],
    [/precio|pago|cuota|descuento/, "💰"],
    [/actualiza|nuevo|novedad/, "🆕"],
    [/desde cero|principiante|paso a paso|f[aá]cil/, "🌱"],
    [/negocio|vender|cliente|monetiz/, "💼"],
    // ── Rubros que este catálogo NO tiene ────────────────────────────────
    //
    // Todo lo de arriba se escribió mirando un catálogo de cursos digitales.
    // Para el SaaS eso es la mitad del problema: una panadería, una tienda de
    // ropa o un taller son negocios igual de válidos y ninguno aparecía acá.
    [/torta|pastel|postre|panader|pan\b|galleta|reposter/, "🍰"],
    [/pizza|hamburgues|comida|almuerzo|restaurante|men[uú]/, "🍽️"],
    [/caf[eé]|bebida|jugo|cerveza|vino/, "☕"],
    [/camisa|blusa|vestido|pantal[oó]n|ropa|prenda|moda/, "👕"],
    [/zapato|tenis|calzado|sandalia|bota/, "👟"],
    [/bolso|cartera|mochila|maleta/, "👜"],
    [/anillo|collar|arete|joya|pulsera|reloj/, "💍"],
    // Salud y ortopedia ANTES que belleza: Dropi mete los correctores en
    // "salud y belleza", y el corrector de postura le llegaba al cliente con
    // 💅 (esmalte de uñas). Chat real del 22-09-2026.
    [/postura|corrector|ortop[eé]d|columna|espalda|lumbar|rodillera|faja|tobillera|masajeador/, "🦴"],
    // Solo "uña" CON ñ: `u[ñn]a` casaba con la palabra "una" y cualquier
    // producto que la dijera salía con 💅.
    [/\buñas?\b|esmalte|manicur|cabello|peluquer|maquillaje|belleza|cosm[eé]tic/, "💅"],
    [/gimnasio|fitness|ejercicio|entrenamiento|pesas|deporte/, "💪"],
    [/mueble|sof[aá]|colch[oó]n|hogar|cocina|decoraci[oó]n/, "🛋️"],
    [/herramienta|repuesto|mec[aá]nic|taller|motor|llanta/, "🔧"],
    [/celular|tel[eé]fono|tablet|audifon|cargador|smartphone/, "📱"],
    [/juguete|ni[ñn]o|beb[eé]|infantil/, "🧸"],
    [/planta|jard[ií]n|flor|semilla|maceta/, "🌿"],
    [/libro|revista|lectura/, "📚"],
    [/limpieza|detergente|jab[oó]n|aseo/, "🧼"],
  ];
  for (const [patron, emoji] of REGLAS) if (patron.test(t)) return emoji;

  // El comodín. Antes era ✅ y el admin lo marcó: "no dejas de usar chuleta
  // habiendo tanto emoji". Tenía razón -- con ✅ de relleno la ficha vuelve a
  // ser una columna de tildes iguales, que es justo lo que se quería sacar.
  //
  // Así que cuando la frase no dice de qué habla, se mira DE QUÉ PRODUCTO es:
  // una línea suelta del curso de piano sigue siendo del curso de piano.
  const prod = String(deQueProducto).toLowerCase();
  for (const [patron, emoji] of REGLAS) if (patron.test(prod)) return emoji;
  // Y si tampoco el producto lo dice, un punto neutro: no afirma nada y no
  // ensucia. ✅ solo queda para lo que de verdad es una confirmación.
  return "•";
}

/** Lo que ya ocupan el titulo y el resumen, para no pasarse del pie de foto. */
function presupuestoUsadoPorElEncabezado(lineas: string[]): number {
  return lineas.join("\n").length;
}

/** La primera oración entera. Nada de cortar a los 240 caracteres con "…". */
function primeraFrase(texto: string): string {
  const t = String(texto || "").replace(/\s+/g, " ").trim();
  const m = t.match(/^.+?[.!?](?=\s|$)/);
  const frase = (m ? m[0] : t).trim();
  if (frase.length <= 220) return frase;
  const corte = frase.lastIndexOf(" ", 220);
  return `${frase.slice(0, corte > 80 ? corte : 220).trim()}…`;
}

/**
 * Hasta 4 viñetas "• texto emoji", como las escribe el agente de Meta.
 * Primero lo propio del producto, después los puntos de su ficha, y al final
 * lo estándar (acceso de por vida, etc.) para completar.
 */
export function vinetasDeLoQueIncluye(
  propias: string[],
  puntos: Array<{ emoji: string; texto: string }>,
  todasLasFeatures: string[],
  nombreProducto: string,
): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  const clave = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
  const corta = (t: string) => {
    const limpio = String(t || "").replace(/\s+/g, " ").replace(/[.;:]\s*$/, "").trim();
    if (limpio.length <= 70) return limpio;
    const c = limpio.lastIndexOf(" ", 70);
    return `${limpio.slice(0, c > 30 ? c : 70)}…`;
  };
  const agregar = (texto: string, emoji?: string) => {
    const k = clave(texto);
    if (!k || vistos.has(k) || out.length >= 4) return;
    vistos.add(k);
    // Si la característica YA empieza con su emoji (las de Dropi vienen así:
    // "🧵 Material de neopreno"), se usa ese y no se le pone otro adelante.
    // Salía "✅ 🧵 Material…": dos emojis apilados, lo que CLAUDE.md prohíbe.
    const propio = String(texto).trim().match(/^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s*(.*)$/u);
    if (propio && propio[2]) {
      out.push(`${propio[1]} ${corta(propio[2])}`);
      return;
    }
    // Emoji ADELANTE, como todo lo demás que manda el sistema: la capa de
    // presentación (presentarParaWhatsApp) reescribe los "•" por emojis y
    // dejaba "📦 19 módulos… 🎬" con dos emojis. Meta lo pone atrás, pero lo
    // que el dueño pidió es "decorado y con espacio", y así queda parejo.
    const e = emoji && emoji !== "•" ? emoji : emojiDeCaracteristica(texto, nombreProducto);
    out.push(`${e !== "•" ? e : "✅"} ${corta(texto)}`);
  };
  for (const f of propias) agregar(f);
  for (const pt of puntos) agregar(pt.texto, pt.emoji);
  for (const f of todasLasFeatures) agregar(f);
  return out;
}

/** Una línea de cómo se entrega, con los hechos del negocio (no inventada). */
async function lineaDeComoSeEntrega(p: typeof products.$inferSelect): Promise<string> {
  const { modeloDelProducto, fraseCostoEnvio, frasePagoEnvio } = await import("./modelo-de-negocio");
  const modelo = modeloDelProducto(p as any);
  if (modelo === "digital") {
    return `Es 100% digital, sin suscripciones ni pagos mensuales: ${p.deliveryLink ? "te llega por un enlace de acceso" : "te lo enviamos por aquí"} apenas se confirme el pago. 💎`;
  }
  if (modelo === "fisico") {
    try {
      const c = await condicionesDelProducto(p);
      return `📦 ${fraseCostoEnvio(c)}. ${frasePagoEnvio(c)}.`;
    } catch { return ""; }
  }
  return "";
}

export async function construirSeccion(
  p: typeof products.$inferSelect,
  seccion: SeccionFicha,
  dynamicLinks: any,
  semilla: string,
  /**
   * Si al cliente YA se le mostraron las características de este producto.
   *
   * Sin esto, el cierre de la sección de precio le ofrecía "¿Te cuento qué
   * incluye? 👀" a alguien que acababa de recibir la ficha con la lista de
   * características. El admin lo señaló el 2026-09-01: "sigue diciendo qué
   * incluye cuando en la información principal ya lo dijo".
   *
   * El parámetro para arreglarlo YA existía en `invitacionDe` --con su
   * comentario describiendo este mismo defecto-- y nunca se pasaba, así que
   * siempre valía false. Es el caso clásico de un arreglo escrito a medias:
   * la mitad difícil hecha, la fácil olvidada, y el bug intacto.
   */
  yaVioContenido = false,
  sesionNueva = false,
  /**
   * Si el video de este producto ya salio en esta conversacion.
   *
   * Hace falta para que el video que cierra la entrega del contenido no se
   * repita: el cliente ya lo tiene, y remandarlo es lo mismo que remandarle la
   * ficha.
   */
  videoYaEnviado = false,
  /**
   * Lo que escribio el cliente en este turno.
   *
   * Hace falta para elegir el medio de pago concreto: "daviplata" tiene que
   * traer Daviplata, no la primera cuenta cargada.
   */
  mensajeDelCliente = "",
  /**
   * Si el precio de este producto ya salio en la conversacion.
   *
   * Solo lo usa el cierre, para no ofrecerle el precio a quien acaba de
   * preguntarlo ni cerrar con una encuesta a quien ya lo sabe.
   */
  yaSabeElPrecio = false,
  /** Va como una de varias opciones: sin pregunta de cierre (la hace el agente una vez). */
  sinCierre = false,
): Promise<{ conFoto: boolean; mensajes: string[] }> {
  const mon = await contextoDeMoneda(String(semilla).split("|")[0], Number(p.price), p.currency);
  const esFisico = String((p as any).kind || "digital") === "physical";
  // El producto EN la tienda. Se usa el enlace corto /p/:id y no la ruta larga
  // /tienda/:slug/producto/:id a propósito: el corto resuelve solo qué negocio
  // es (app.ts redirige), así que no hay que pasarle el slug hasta acá ni
  // arriesgar que quede viejo si el admin lo cambia.
  const urlEnTienda = `${getAppUrl().replace(/\/$/, "")}/p/${p.id}`;
  const corto = (m: any) => m?.shortUrl || m?.url || "";

  // ¿ESTE producto tiene video? Medido en produccion el 2026-08-29: NINGUNO de
  // los 84 activos lo tenia cargado. El cierre no puede ofrecer lo que no existe.
  const urlVideo = videoDeProducto(p.metadata);

  // Las secciones que LISTAN las características tampoco pueden cerrar
  // ofreciéndolas: ahí el cliente las está leyendo en el mismo mensaje.
  const estaFichaMuestraContenido = seccion === "completa" || seccion === "info";

  // ⚠️ NO es `!!urlVideo`. Una ficha que muestra el contenido MANDA el video
  // unas lineas mas abajo, asi que ofrecerlo en el cierre es preguntar y
  // contestarse solo en el mismo turno -- que es lo que salio en produccion el
  // 2026-09-02. Y si el video ya salio antes, tampoco se ofrece.
  //
  // La regla vive en ficha-parcial porque agent.ts tiene que clasificar el
  // cierre con EXACTAMENTE el mismo criterio: si los dos lados no coinciden, la
  // metadata miente sobre lo que el cliente leyo y el "si" del turno siguiente
  // se lee mal.
  const seOfreceElVideo = sePuedeOfrecerElVideo({ seccion, tieneVideo: !!urlVideo, videoYaEnviado });
  const cierre = sinCierre
    ? ""
    : invitacionDe(
        seccion,
        esFisico,
        semilla,
        seOfreceElVideo,
        yaVioContenido || estaFichaMuestraContenido,
        yaSabeElPrecio,
      );
  const L: string[] = [];

  // ── Solo el precio ────────────────────────────────────────────────────────
  // ── El producto en la tienda ──────────────────────────────────────────────
  //
  // El admin preguntó "¿tienes tienda?" y el bot contestó "¿de cuál producto
  // querés que te cuente?": no respondió, teniendo la tienda publicada y el
  // producto adentro.
  //
  // Va en su propio mensaje para que WhatsApp le arme la vista previa con la
  // foto; pegado a otro texto el enlace se pierde en el medio.
  if (seccion === "tienda") {
    return {
      conFoto: false,
      mensajes: [`🛒 Míralo en la tienda, con fotos y todo el detalle:\n${urlEnTienda}`, cierre],
    };
  }

  if (seccion === "precio") {
    // Copiado del agente de Meta que el dueño probó el 16-09-2026: el precio
    // va con el nombre del producto y "(Pago único)" en los digitales, para
    // que nadie lea 60.000 como una cuota o una suscripción.
    const texto = esFisico
      ? `💰 *${mon.precioTexto}*\n\n${cierre}`
      : `La inversión para el *${p.name}* es de:\n\n💰 *${mon.precioTexto}*\n(Pago único)\n\n${cierre}`;
    return { conFoto: false, mensajes: [texto] };
  }

  // ── El video de muestra ───────────────────────────────────────────────────
  //
  // Solo llega acá cuando el cliente lo pidió o aceptó verlo. Antes se mandaba
  // en toda presentación, y eso lo gasta: la carnada más fuerte que hay se
  // quemaba con quien todavía no había mostrado interés.
  //
  // Va en su PROPIO mensaje para que WhatsApp le arme la vista previa con
  // miniatura; pegado a otro texto, el enlace se pierde en el medio.
  if (seccion === "video") {
    // Puede llegar acá aunque el producto no tenga video: el cliente lo pide
    // por su cuenta ("¿tienes video?"), no solo aceptando la oferta. Se dice
    // la verdad y se le da una salida, en vez de inventar uno.
    if (!urlVideo) {
      return { conFoto: false, mensajes: [`De este ${esFisico ? "producto" : "curso"} todavía no tengo video 🙏 ¿Te cuento qué incluye?`] };
    }
    // ── El mismo enlace, tres veces en dos minutos ────────────────────────
    //
    // Pasó el 2026-09-02: el video salió con la ficha, y este bloque lo mandó
    // dos veces más sin mirar nunca si ya había salido. El ruteo de arriba SÍ
    // lo miraba, pero con una guarda que no reconocía el enlace de este
    // negocio (ver elVideoYaSalio), así que llegaba igual.
    //
    // Se reenvía en un solo caso: que el cliente lo pida de nuevo con todas
    // las letras. Ahí no es repetir, es contestar.
    if (videoYaEnviado && !pidioElVideo(mensajeDelCliente)) {
      return { conFoto: false, mensajes: [`Te lo mandé recién, mirá un poquito más arriba 👆 ${cierre}`] };
    }
    return { conFoto: false, mensajes: [`🎬 Mira cómo son las clases:\n${urlVideo}`, cierre] };
  }

  // ── Cómo se entrega ───────────────────────────────────────────────────────
  if (seccion === "entrega") {
    const { modeloDelProducto, fraseCostoEnvio, frasePagoEnvio } = await import("./modelo-de-negocio");
    const modelo = modeloDelProducto(p as any);
    const c = await condicionesDelProducto(p);
    const texto = modelo === "fisico"
      ? `📦 Te lo enviamos a tu dirección por transportadora. ${fraseCostoEnvio(c)}.\n⏱️ Llega en ${c.envio.plazo}. ${frasePagoEnvio(c)}.\n\n${cierre}`
      : modelo === "servicio"
        ? `🗓️ Es un servicio: se agenda por acá${c.agenda ? ` (${c.agenda})` : ""} y el negocio te confirma la hora.\n\n${cierre}`
        : modelo === "cotizacion"
          ? `🧾 Este se cotiza según lo que necesités: contame qué buscás y el negocio te manda la cotización por acá.\n\n${cierre}`
          : modelo === "captacion"
            ? `🤝 Un asesor te contacta por este mismo número para acompañarte.\n\n${cierre}`
            // Tres pasos, como los explicó el agente de Meta (16-09-2026). No
            // promete tiempos: el pago lo confirma una persona (ver
            // INSTRUCCIONES_AGENTE_META.txt, punto 2).
            : `🚀 *ENTREGA DIGITAL*\n\nLo recibes así:\n\n1. Realizas el pago. 💳\n2. Me envías el comprobante por aquí. 📸\n3. Apenas se confirme, te llega el acceso por este mismo chat. 📂\n\n${cierre}`;
    return { conFoto: false, mensajes: [texto] };
  }

  // Un físico contraentrega no tiene "medios de pago": se paga al recibir.
  // Mandarle Nequi y MercadoPago a quien pregunta "¿cómo pago?" por una
  // licuadora es cobrarle por adelantado algo que el negocio cobra al recibir.
  if (esFisico && (seccion === "pago" || seccion === "pago_transferencia" || seccion === "pago_link")) {
    const { seDespachaPorTransportadora } = await import("./entrega-del-producto");
    const c = await condicionesDelProducto(p);
    // Con pago anticipado el negocio SÍ cobra antes: se muestran los medios
    // de pago normales (sigue abajo). Solo contraentrega corta acá.
    if (seDespachaPorTransportadora(p as any) && c.envio.pago === "contraentrega") {
      const { fraseCostoEnvio } = await import("./modelo-de-negocio");
      return {
        conFoto: false,
        mensajes: [
          `💵 Este producto se paga contraentrega: no pagás nada ahora, pagás cuando la transportadora te lo entrega en tu dirección.\n📦 ${fraseCostoEnvio(c)} (${mon.precioTexto}) y llega en ${c.envio.plazo}.\n\n¿Te tomo el pedido? Solo necesito tus datos de envío.`,
        ],
      };
    }
  }

  // ── LOS MEDIOS DE PAGO SALEN DE LA HOJA DE HECHOS ────────────────────────
  //
  // Las tres ramas de pago armaban el texto a mano, y las tres usaban
  // `transfer.options[0]`. Si el negocio tiene Nequi Y Daviplata cargados y el
  // cliente pedía Daviplata, le llegaba el número de Nequi -- plata a la
  // cuenta equivocada.
  //
  // Ahora el servidor arma la lista de lo que este negocio DE VERDAD tiene, se
  // elige de ahí, y el mensaje lo escribe él. El modelo no teclea un número de
  // cuenta ni un enlace: los señala.
  //
  // Medido el 2026-09-02, el cliente pidió pagar por Nequi y recibió:
  //   "💳 Para que te llegue el LINK DE PAGO POR NEQUI, necesito que me
  //    confirmes estos datos: 1️⃣ Tu nombre..."
  // Un "link de pago por Nequi" no existe, pidió datos que no hacen falta, y
  // no dio el número. La sección que lo renderiza bien ya existía y no se usó.
  if (seccion === "pago" || seccion === "pago_transferencia" || seccion === "pago_link") {
    const medios = mediosDePago({
      dynamicLinks,
      aceptaPagosLocales: mon.aceptaPagosLocales,
      esColombia: mon.esColombia,
    });
    if (medios.length === 0) {
      return { conFoto: false, mensajes: [`Déjame confirmarte cómo hacemos el pago y te aviso 🙏`] };
    }

    // Lo que el cliente nombró manda sobre la sección: "daviplata" tiene que
    // traer Daviplata, no la primera cuenta que haya.
    const pedido = loQuePidio(String(mensajeDelCliente || ""), medios);
    if (pedido.noConfigurado) {
      return { conFoto: false, mensajes: [noManejamosEse(pedido.noConfigurado, medios)] };
    }

    let elegidos = pedido.pedidos;
    if (elegidos.length === 0) {
      // No nombró ninguno: la sección decide de qué clase van.
      elegidos =
        seccion === "pago_transferencia" ? medios.filter((m) => m.tipo === "transferencia")
        : seccion === "pago_link" ? medios.filter((m) => m.tipo === "link")
        : medios;
    }
    if (elegidos.length === 0) elegidos = medios;

    return { conFoto: false, mensajes: [renderMediosDePago(elegidos, mon.precioTexto, cierre)] };
  }

  // ── Qué es y qué trae, SIN precio ─────────────────────────────────────────
  // El precio es la pregunta siguiente: dárselo acá cierra la conversación.
  const nameUpper = p.name.toUpperCase();
  // -- La ficha la escribio el dueño: aca se LEE, no se aplana ----------
  //
  // Antes: `description.replace(/\s+/g," ")` + corte a 180 caracteres. Eso
  // borraba los bloques y los emojis que el producto ya traia escritos, y
  // como la descripcion empieza por su propio titulo --que la tarjeta ya
  // pone arriba-- al cliente le llegaba el nombre dos veces seguidas y
  // despues media frase. Ver ficha-del-producto.ts.
  const suFicha = leerFicha(p.description, p.name);

  let resumen = suFicha.intro;
  if (resumen.length > 240) {
    const corte = resumen.lastIndexOf(".", 240);
    resumen = corte > 80 ? resumen.slice(0, corte + 1) : resumen.slice(0, resumen.lastIndexOf(" ", 240)) + "…";
  }

  const ESTANDAR = /acceso (permanente|de por vida|inmediato|ilimitado)|de por vida|contenido actualizable|actualizaciones|soporte (t[eé]cnico|incluido)|descargas? (ilimitadas?|incluidas?)|descargable|alta definici[oó]n|\bHD\b|google drive|100% online|certificaci[oó]n de participaci[oó]n/i;
  const propias = ((p.features ?? []) as string[]).filter((f) => !ESTANDAR.test(String(f)));

  // El emoji sale del titulo que el dueño escribio; si no puso, se adivina.
  const emojiTitulo = suFicha.emoji || emojiDelProducto(p.name, (p as any).category);

  // ── MENSAJE CORTO: solo nombre + resumen ─────────────────────────────────
  //
  // El admin pidio (2026-09-09): "necesito q me ayude con la logica de
  // respuesta y con la linea para eso ya que yo no seria capaz de leer esa
  // informacion tan extensa y desordenada". El bot mandaba TODA la descripcion
  // del producto en un solo mensaje masivo -- ilegible en WhatsApp.
  //
  // La ficha inicial no es un temario. La imagen lleva solo el resumen y el
  // video se comparte una vez enseguida si existe. El detalle queda para una
  // pregunta concreta del cliente.
  const esDetallePosterior = seccion === "info" && yaVioContenido;
  const mensajes: string[] = [];
  if (!esDetallePosterior) {
    // ── La presentación, copiada del agente de Meta ─────────────────────
    //
    // El dueño probó el agente de Meta Business el 16-09-2026 y pidió que el
    // nuestro se vea igual. Antes acá salía la descripción cruda cortada a
    // 240 caracteres en un solo bloque ("apiñado", según él). Lo de Meta:
    //
    //   🎹 *CURSO DE PIANO COMPLETO*
    //   <una frase de qué es>
    //   ✅ *Lo que incluye:* + 4 viñetas cortas con emoji al final
    //   <una línea de cómo se entrega / que es digital>
    //   <la pregunta de cierre>
    //
    // Todo en UN mensaje (el pie de la foto), sin precio: el precio sigue
    // siendo la pregunta siguiente. Los datos salen del producto, no del
    // modelo, así que no puede inventar.
    L.push(`${emojiTitulo} *${p.name}*`);
    L.push("");
    L.push(primeraFrase(resumen || (await resumenDeRespaldo(p))));
    // En el orden en que el dueño las cargó: la primera suele ser la más fuerte.
    const vinetas = vinetasDeLoQueIncluye((p.features ?? []) as string[], suFicha.puntos, [], p.name);
    if (vinetas.length) {
      L.push("", "✅ *Lo que incluye:*");
      for (const v of vinetas) L.push(v);
    }
    const lineaDeEntrega = await lineaDeComoSeEntrega(p);
    if (lineaDeEntrega) L.push("", lineaDeEntrega);
    if (cierre) L.push("", cierre);
    mensajes.push(hablarColombiano(L.join("\n").trim()));
  }

  // El voseo llega por la descripcion del producto ("Aprende", "Estudia"),
  // no solo por el modelo. El filtro se aplicaba unicamente al texto que
  // escribe la IA, asi que la ficha --que es lo que mas se lee-- salia sin
  // traducir.
  // ── El precio NO va acá ──────────────────────────────────────────────────
  //
  // Antes "completa" lo agregaba, contradiciendo el comentario que encabeza
  // esta misma sección treinta líneas más arriba: "qué es y qué trae, SIN
  // precio -- el precio es la pregunta siguiente, dárselo acá cierra la
  // conversación".
  //
  // El admin lo señaló el 2026-09-01: "precio dando, no lo han preguntado".
  // Un "¿tienes el curso de piano?" pregunta si EXISTE, no cuánto sale.
  // Contestar con el número salta dos pasos del embudo y deja la conversación
  // sin nada que preguntar.
  //
  // Quien quiera el precio lo pide, y ahí sale entero: PIDE_PRECIO lleva a la
  // sección "precio" (ver seccionQueCorresponde). Eso no cambia -- el arreglo
  // de "preguntaba el precio y no se lo daban" sigue en pie.
  // ── SI PIDE MAS INFO: mostrar el resto de los puntos ──────────────────────
  //
  // Cuando el cliente pregunta "dame mas info" o "que incluye", se le muestran
  // los detalles que no se incluyeron en la presentación corta.
  if (esDetallePosterior && suFicha.puntos.length > 0) {
    const puntosRestantes = suFicha.puntos;
    const infoExtra: string[] = [];
    infoExtra.push(`📋 *MÁS DETALLES DE ${nameUpper}:*`);
    infoExtra.push("");
    for (const punto of puntosRestantes) infoExtra.push(`${punto.emoji} ${punto.texto}`);

    // Agregar features propias que no estan en los puntos
    if (propias.length > 0) {
      infoExtra.push("");
      for (const f of propias.slice(0, 4)) infoExtra.push(`${emojiDeCaracteristica(f, p.name)} ${f}`);
    }

    mensajes.push(hablarColombiano(infoExtra.join("\n").trim()));

  }

  // Si el producto tiene video, se comparte UNA vez al presentarlo. No se
  // pregunta si quiere verlo: está ahí para que pueda revisarlo cuando quiera.
  if (urlVideo && !videoYaEnviado && (seccion === "completa" || esDetallePosterior)) {
    mensajes.push(`🎬 Te dejo este video para que veas el contenido por dentro:\n${urlVideo}`);
  }
  // En la presentación el cierre ya va dentro del pie de foto (un solo
  // mensaje, como Meta). Solo el detalle posterior lo lleva aparte.
  if (cierre && esDetallePosterior) mensajes.push(cierre);

  // -- La foto va con la PRESENTACION, y una sola vez ------------------
  //
  // Pedido del admin: "cuando vayas a presentar la informacion mandala con
  // la imagen". Va, y es este retorno.
  //
  // Pero solo la PRIMERA vez. Si el cliente ya vio la ficha de este producto
  // y vuelve a preguntar, reenviarle los 2 MB de la misma foto es repetirle
  // lo que ya tiene --lo mismo que se corrigio con el texto-- y encima lo
  // hace esperar la descarga para leer dos renglones nuevos.
  // ── La foto vuelve cuando el cliente vuelve ───────────────────────────
  //
  // Esto era `!yaVioContenido` a secas, y `yaVioContenido` es "la ficha de
  // este producto ya salio ALGUNA VEZ en esta conversacion". O sea: la foto
  // salia una sola vez y no volvia nunca mas.
  //
  // El motivo original era bueno --no reenviarle 2 MB de la misma imagen a
  // quien acaba de verla, que ademas lo hace esperar la descarga para leer dos
  // renglones nuevos-- pero el efecto es que un cliente que vuelve mañana a
  // preguntar por el mismo curso recibe la ficha PELADA, sin foto. Y el admin
  // lo pidio dos veces: "cuando vayas a presentar la informacion mandala con
  // la imagen".
  //
  // Con `sesionNueva` se separan los dos casos: dentro de la misma charla la
  // foto no se repite (el motivo original sigue en pie), pero si el cliente
  // vuelve despues de horas, la presentacion arranca de nuevo con su imagen.
  return { conFoto: !yaVioContenido || sesionNueva, mensajes };
}

function buildPaymentOnlyCaption(p: typeof products.$inferSelect, dynamicLinks?: any) {
  const lines: string[] = [];

  const nameUpper = p.name.toUpperCase();
  const mainEmoji = emojiDelProducto(p.name, (p as any).category);

  lines.push(`💳 *PAGO — ${mainEmoji} ${nameUpper}*`);
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━");
  // El precio SIEMPRE visible: cuando el cliente pregunta cuánto cuesta o va a
  // pagar, la tarjeta de pago no lo mostraba y el cliente no sabía el monto.
  const precio = Number(p.price || 0);
  if (precio > 0) {
    lines.push(`💰 *Precio: $${precio.toLocaleString("es-CO")} ${p.currency || "COP"}*`);
    lines.push("");
  }

  if (dynamicLinks) {
    // Enlace CORTO primero. Acá se pedía `url || shortUrl`: el largo (un
    // checkout de MercadoPago con pref_id, ~120 caracteres de tokens) ganaba
    // siempre, y el cliente recibía un link enorme que parece sospechoso en el
    // celular. El corto (/p/<código>) ya existe y se genera en payments.ts.
    const corto = (m: any) => m?.shortUrl || m?.url || "";
    if (corto(dynamicLinks.mercadopago)) {
      lines.push(`🔹 *Tarjeta de Crédito / PSE (Colombia):*`);
      lines.push(corto(dynamicLinks.mercadopago));
      lines.push("");
    }
    if (corto(dynamicLinks.paypal)) {
      lines.push(`🔹 *PayPal (Internacional):*`);
      lines.push(corto(dynamicLinks.paypal));
      lines.push("");
    }
    if (dynamicLinks.transfer && dynamicLinks.transfer.options && dynamicLinks.transfer.options[0]) {
      lines.push(`🔹 *Transferencia Directa:*`);
      lines.push(`📍 *${etiquetaDeTransferencia(dynamicLinks.transfer)}:* ${dynamicLinks.transfer.options[0].number}`);
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

/**
 * El texto del mensaje que el cliente CITÓ al responder (mantener apretado →
 * "Responder" en WhatsApp).
 *
 * Chat real del 22-09-2026: el bot mandó 4 fichas de correctores, el cliente
 * respondió "Me interesa este" citando la primera, y el bot contestó "¿cuál de
 * los cinco?" y después "no puedo ver imágenes ni distinguir a cuál apuntás".
 * La cita traía el nombre del producto; se tiraba sin leerla.
 */
export function extraerMensajeCitado(msgObj: any): string | null {
  if (!msgObj || typeof msgObj !== "object") return null;
  const candidatos = [msgObj, ...Object.values(msgObj)];
  for (const c of candidatos) {
    const q = (c as any)?.contextInfo?.quotedMessage;
    if (!q) continue;
    const texto = String(
      q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || q.documentMessage?.caption || "",
    ).trim();
    if (texto) return texto.slice(0, 500);
    if (q.imageMessage) return "[una foto sin texto]";
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
  /**
   * Si esta sesion llego a estar conectada alguna vez.
   *
   * Es lo que distingue "nunca pude conectarme" de "estaba andando y se
   * cayo". Sin esto no se puede decidir si vale la pena reintentar, y por eso
   * el bot se quedaba muerto despues de cada deploy (ver mas abajo).
   */
  protected yaEstuvoConectado = false;
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
  private ultimoDestino = "";

  /**
   * Espaciado entre envíos, pero SOLO al cambiar de destinatario.
   *
   * Lo que WhatsApp castiga es disparar a muchos contactos distintos en
   * ráfaga. Contestarle a UNA persona con tres mensajes seguidos no es spam:
   * es lo que hace cualquiera que manda el texto, la foto y el precio.
   *
   * Estaba aplicándose a cada envío sin mirar a quién, y el comentario de
   * acá abajo decía que "no afecta la conversación normal". Sí la afectaba, y
   * mucho: las partes de UNA respuesta (texto → ficha → medios de pago →
   * link de la tienda) salen una detrás de otra, así que cada una pagaba
   * entre 8 y 20 segundos. Una respuesta completa tardaba de 24 a 60
   * segundos en terminar de llegar. El admin lo reportó como "el tiempo de
   * envío de cada cosa es muy largo", y tenía razón: para el cliente, el bot
   * escribe una línea y desaparece un minuto.
   *
   * Ahora: mismo destinatario → sin espera (queda solo el "escribiendo…",
   * que son décimas). Destinatario distinto → el espaciado completo, que es
   * donde de verdad protege al número.
   */
  private async esperarEspaciadoEntreEnvios(destino?: string): Promise<void> {
    const jid = String(destino || "");
    const mismaPersona = !!jid && jid === this.ultimoDestino;

    if (!mismaPersona) {
      const MIN_MS = Number(process.env.WA_MIN_MS_ENTRE_ENVIOS) || 8000;
      const JITTER_MS = Number(process.env.WA_JITTER_MS_ENTRE_ENVIOS) || 12000;
      const objetivo = MIN_MS + Math.floor(Math.random() * JITTER_MS);
      const transcurrido = Date.now() - this.ultimoEnvioMs;
      if (this.ultimoEnvioMs > 0 && transcurrido < objetivo) {
        await sleep(objetivo - transcurrido);
      }
    }

    this.ultimoEnvioMs = Date.now();
    if (jid) this.ultimoDestino = jid;
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
    this.yaEstuvoConectado = false;
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
           this.yaEstuvoConectado = true;
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
            } else if (!this.hadQrInThisSession && !this.yaEstuvoConectado) {
              // ⚠️ Acá faltaba `&& !this.yaEstuvoConectado`, y esa omision
              // dejaba el numero mudo despues de CADA despliegue.
              //
              // `hadQrInThisSession` solo se pone en true cuando se dibuja un
              // QR. Al reiniciar el contenedor, la sesion vuelve sola con las
              // credenciales guardadas y NO se muestra ningun QR -- asi que la
              // bandera queda en false. En la primera caida del socket se
              // entraba por esta rama, que no reintenta NADA, y se culpaba a
              // la red de un problema que no era de red.
              //
              // Medido el 2026-09-07: desplegado 06:43, conectado; a las 07:19
              // "disconnected" sin un solo intento en el log.
              //
              // Esta rama es para el caso de verdad: nunca hubo QR y nunca
              // hubo conexion, o sea que el servidor no alcanza WhatsApp.
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
           } else if (this.yaEstuvoConectado) {
             // ── NI SE RINDE PARA SIEMPRE ──────────────────────────────────
             //
             // Antes, al quinto intento fallido quedaba muerto hasta que
             // alguien entrara al panel. Cinco intentos con espera creciente
             // son ~90 segundos: un corte de red mas largo que eso dejaba el
             // numero mudo por horas, sin que nadie se enterara. Ya paso.
             //
             // Como las credenciales siguen guardadas, se sigue intentando
             // cada 5 minutos. Es lento a proposito: reconectar a lo bruto
             // contra WhatsApp es de las cosas que hacen que bloqueen el
             // numero, y el negocio no puede permitirse eso.
             this.state = "error";
             this.reconnectAttempts = 0;
             this.lastError = "Reconectando cada 5 minutos";
             logger.warn("[WhatsApp] Max fast attempts reached, switching to slow retry (5 min)");
             console.log("🐢 [RECONNECT] Agotados los intentos rapidos: se reintenta cada 5 minutos");
             setTimeout(() => this.start(), 5 * 60 * 1000);
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
            
            // ── LO QUE SALE DEL NUMERO, PERO NO LO ESCRIBIMOS NOSOTROS ──────
            //
            // WhatsApp marca `fromMe` en TODO lo que sale de la cuenta: este
            // bot, el dueno desde su celular, o la IA de Meta atendiendo. Antes
            // se tiraba todo, y funcionaba mientras el bot fuera el unico que
            // hablaba.
            //
            // Deja de funcionar apenas contesta alguien mas: esas respuestas
            // existen para el cliente y NO existian para la app. Si Meta ya le
            // dijo el precio, este bot no tenia forma de enterarse.
            //
            // Nuestro propio eco se sigue descartando; lo demas se GUARDA (sin
            // responder) para que el historial este completo.
            if (msg.key.fromMe) {
              if (loMandamosNosotros(msg.key.id)) {
                console.log("⏭️ Ignorando: eco de un mensaje que mandamos nosotros");
                continue;
              }
              try {
                // Lo esencial: el texto plano. No hace falta el extractor
                // completo --que resuelve botones, listas y efimeros-- porque
                // acá solo se observa, y una respuesta de la IA de Meta o del
                // dueño es texto.
                const mo: any = msg.message || {};
                const textoAjeno = String(
                  mo.conversation ||
                  mo.extendedTextMessage?.text ||
                  mo.imageMessage?.caption ||
                  mo.videoMessage?.caption ||
                  "",
                );
                if (textoAjeno && textoAjeno.trim() && this.currentTenant?.id) {
                  const jidDestino = msg.key.remoteJid || "";
                  await getMessageHandler().handleIncomingMessage({
                    tenantId: String(this.currentTenant.id),
                    remoteJid: jidDestino,
                    phone: soloNumero(jidDestino),
                    fromMe: true,
                    messageId: msg.key.id || `otro_${Date.now()}`,
                    body: textoAjeno.trim(),
                    timestamp: new Date(msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now()),
                    pushName: "",
                  });
                  console.log(`👀 [OBSERVADO] Respuesta que NO salio de este bot, guardada: "${textoAjeno.slice(0, 60)}"`);
                }
              } catch (e: any) {
                // Observar no puede romper la atencion: si falla, se pierde
                // una linea de historial, no una conversacion.
                console.log(`⚠️ [OBSERVADO] No se pudo guardar: ${e?.message}`);
              }
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
            // La foto entrante, por si resulta ser un comprobante de pago.
            let comprobanteBuf: Buffer | null = null;
            let comprobanteMime = "";
            let comprobanteVisto: string | null = null;
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
                    const { pareceComprobante } = await import("./verificacion-pago");
                    // ── La descripción NO se le pasa al agente como hecho ──
                    //
                    // Un modelo de visión describe una imagen, no la VERIFICA.
                    // Pasarla como texto del cliente convertía esa descripción
                    // en "lo que el cliente mandó", y el agente la repetía y
                    // elaboraba: caso real 2026-09-05, un Excel descrito como
                    // "comprobante con valor, fecha y banco" que el bot le
                    // confirmó al cliente como si lo hubiera visto. La
                    // descripción real se guarda en `comprobanteVisto` SOLO
                    // para la detección interna y el aviso al admin.
                    // ── Y si NO se pudo ver, el agente tiene que saberlo ─────
                    //
                    // Con "[el cliente mandó una imagen]" a secas, el agente no
                    // distingue una imagen VISTA de una que nadie miró, y
                    // rellena el hueco. Medido contra producción el 2026-09-06:
                    // el cliente mandó la foto de un paisaje y el bot contestó
                    // "Recibí tu comprobante".
                    //
                    // El admin lo dijo así: "echa mentira diciendo que los datos
                    // son tales cuando ni siquiera los lee".
                    //
                    // Y no es un caso raro: cuando no hay ningún modelo de
                    // visión con clave —que fue el estado de producción durante
                    // semanas— `describirImagen` devuelve null SIEMPRE, o sea
                    // que TODAS las imágenes caen acá.
                    // Tres estados distintos, y el agente tiene que poder
                    // distinguirlos. Con un solo marcador para los tres,
                    // rellenaba el hueco: medido en produccion el 2026-09-06,
                    // el cliente mando la foto de un PAISAJE y el bot contesto
                    // "Recibi tu comprobante".
                    //
                    // Ese caso NO era ceguera --el health dice que hay 4
                    // modelos de vision con clave--: la imagen se vio bien, se
                    // describio bien, y el agente igual invento que era un
                    // comprobante porque nadie le dijo que no lo era.
                    //
                    // `pareceComprobante(visto, false)` es la lectura ESTRICTA:
                    // sin apoyarse en la etapa, solo pasa con senales duras
                    // (comprobante, transferencia, Nequi, Daviplata...). Se usa
                    // asi a proposito: aca no se decide si registrar el pago
                    // --eso se decide despues y con la etapa incluida-- sino
                    // que se le prohibe al agente AFIRMAR algo que la imagen no
                    // respalda.
                    const pareceUnPago = visto ? pareceComprobante(visto, false) : false;
                    text = !visto
                      ? "[el cliente mandó una imagen que NO se pudo ver: no digas qué contiene, no la des por comprobante y no confirmes ningún pago]"
                      : pareceUnPago
                        ? "[el cliente mandó una imagen]"
                        : "[el cliente mandó una imagen que NO es un comprobante de pago: no digas que recibiste ningún comprobante ni confirmes ningún pago]";
                    console.log(`🖼️ [IMAGEN] ${visto ? "descrita (solo interno)" : "SIN MODELO QUE LA VEA: no hay ninguna vision con clave"}`);

                    // Si es un comprobante de pago hay que GUARDARLO y avisarle
                    // al admin. Antes la foto se describía y se tiraba: no
                    // quedaba nada que aprobar, así que la "verificación" que
                    // el bot prometía no podía existir.
                    comprobanteBuf = buf;
                    comprobanteMime = mime;
                    comprobanteVisto = visto;
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
              
              if (diagnostic.possibleText && pareceMensajeDePersona(diagnostic.possibleText)) {
                text = diagnostic.possibleText;
                console.log("🎯 Usando texto encontrado en diagnóstico:", text);
              } else if (diagnostic.possibleText) {
                console.log(`🚫 [BASURA] El diagnóstico devolvió "${diagnostic.possibleText.slice(0, 40)}", que no lo escribió una persona — se descarta`);
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
                // Se recorren los VALORES del objeto, nunca el JSON como
                // texto plano.
                //
                // Antes esto era `JSON.stringify(msgObj).match(/"[^"]{3,}"/g)`,
                // que devuelve también los NOMBRES DE LOS CAMPOS. El filtro
                // de campo técnico exigía camelCase (messageContextInfo), así
                // que cualquier nombre de una sola palabra en minúscula
                // pasaba derecho.
                //
                // Costo real, conversación 13 del 2026-08-24 (Samuel
                // Antolinez): se guardó **"key"** como mensaje del cliente
                // -- el campo `msg.key` de Baileys -- y el agente le contestó
                // con un producto al azar. El cliente venía preguntando por
                // el curso de piano.
                //
                // Recorriendo valores el problema desaparece de raíz: un
                // nombre de campo no es un valor, así que nunca puede llegar
                // acá. Es la misma lección de siempre: validar por FORMA en
                // el punto por donde pasan todos, no enumerar lo malo.
                const valores: string[] = [];
                const recolectar = (o: any, prof = 0): void => {
                  if (prof > 8 || valores.length > 200) return;
                  if (typeof o === 'string') { valores.push(o); return; }
                  if (o && typeof o === 'object') {
                    for (const v of Object.values(o)) recolectar(v, prof + 1);
                  }
                };
                recolectar(msgObj);

                const allStrings = valores;
                if (allStrings.length > 0) {
                  const potentialText = allStrings
                    .filter(s => s.length > 2 && !s.includes('http') && !s.includes('@') && !/^\d+$/.test(s))
                    // Texto de verdad: tiene espacios, o es una palabra suelta
                    // corta y en minúsculas ("hola", "si", "cuanto").
                    .filter(s => /\s/.test(s.trim()) || /^[a-záéíóúñ¿¡?!.,]{2,15}$/i.test(s.trim()))
                    .find(s => /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(s)); // Contiene letras

                  if (potentialText && pareceMensajeDePersona(potentialText)) {
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
               // ── ¿El admin está aprobando un comprobante? ─────────────────
               // Va PRIMERO, y cede si el número no corresponde a ningún pago
               // pendiente: así un "aprobar 47" dirigido a una sugerencia de
               // anuncios sigue llegando a su handler.
               try {
                 const { atenderDecisionDelAdmin } = await import("./verificacion-pago");
                 const r = await atenderDecisionDelAdmin(phone, text.trim());
                 if (r) {
                   // ── Primero el cliente, y despues se le cuenta al admin ───
                   //
                   // Estaba al reves: se le mandaba al admin "Le aviso al
                   // cliente con tacto" ANTES de intentar avisarle, y si el
                   // aviso no salía —porque no había conversacion, o porque el
                   // envio fallaba— nadie se enteraba nunca. El admin se
                   // quedaba tranquilo con un acuse que no era cierto.
                   //
                   // Reportado el 2026-09-06: "lo rechace pero nunca le
                   // entrego el mensaje al cliente diciendole que la
                   // transferencia no era correcta".
                   let avisoAlCliente = "";
                   if (r.paraElCliente) {
                     const [c] = await db
                       .select({ phone: conversations.contactPhone })
                       .from(conversations)
                       .where(eq(conversations.id, r.paraElCliente.conversationId))
                       .limit(1);
                     if (!c?.phone) {
                       avisoAlCliente = `\n\n⚠️ No pude avisarle al cliente: la conversacion ${r.paraElCliente.conversationId} no tiene telefono. Escribile vos.`;
                       console.error(`❌ [PAGO] Sin telefono para la conversacion ${r.paraElCliente.conversationId}: el cliente NO fue avisado`);
                     } else {
                       try {
                         await this.sendText(c.phone, r.paraElCliente.texto);
                         // Queda en el historial: si no, el agente no sabe que ya
                         // entregó y en el turno siguiente vuelve a cobrar o se
                         // contradice sobre si hubo compra.
                         const { saveAgentMessage } = await import("./conversation-engine");
                         await saveAgentMessage(
                           r.paraElCliente.conversationId,
                           r.paraElCliente.texto,
                           (r.paraElCliente.entregar ? "converted" : "closing") as any,
                           { intent: "payment_verified", verificadoPor: phone } as any,
                         );
                         console.log(`💬 [PAGO] Cliente ${c.phone} avisado: ${r.paraElCliente.entregar ? "aprobado y entregado" : "rechazado"}`);
                       } catch (errCliente: any) {
                         avisoAlCliente = `\n\n⚠️ NO pude avisarle al cliente (${errCliente?.message || "fallo el envio"}). Escribile vos.`;
                         console.error(`❌ [PAGO] No se le pudo avisar al cliente ${c.phone}: ${errCliente?.message}`);
                       }
                     }
                   } else {
                     avisoAlCliente = `\n\n⚠️ Ese comprobante no tiene una conversacion asociada: al cliente no se le avisó nada.`;
                     console.error(`❌ [PAGO] Decision aplicada sin conversacion asociada: el cliente NO fue avisado`);
                   }

                   await this.sendText(phone, r.paraElAdmin + avisoAlCliente, originalJid);
                   continue;
                 }
               } catch (e: any) {
                 console.error("[Pago] fallo atendiendo la decisión del admin:", e?.message);
               }

               // ── ¿Responde a la revisión diaria ("1", "la 2", "todas")? ──
               // Solo números explícitos: un "sí" pelado sigue siendo para las
               // sugerencias del agente de anuncios (handleAdminReply, abajo).
               try {
                 const { atenderRespuestaAlAviso } = await import("./revision-diaria");
                 const respuesta = await atenderRespuestaAlAviso(phone, text.trim());
                 if (respuesta) {
                   await this.sendText(phone, respuesta);
                   continue;
                 }
               } catch (e: any) {
                 console.log(`⚠️ [REVISION] no se pudo atender la respuesta del admin: ${e?.message}`);
               }
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
                 // Lo que citó al responder ("me interesa ESTE" sobre una ficha).
                 citado: extraerMensajeCitado(msgObj) ?? undefined,
               });
               console.log(`📤 [WA-QUEUE] Mensaje encolado exitosamente a MessageHandler: ${text.substring(0, 30)}...`);

                // Un comprobante no se contesta con IA: se guarda y se le pasa
                // a una persona. Va DESPUÉS de encolar para que la conversación
                // ya exista cuando se busque por teléfono.
                //
                // Si el comprobante lo manda EL ADMIN, no se procesa: el admin
                // no puede aprobar su propio comprobante, y el aviso le llegaría
                // de vuelta a él mismo (reportado 2026-09-09).
                if (comprobanteBuf) {
                  const { esTelefonoDeAdmin } = await import("./verificacion-pago");
                  if (!(await esTelefonoDeAdmin(phone))) {
                    this.procesarComprobante(phone, pushName, comprobanteBuf, comprobanteMime, comprobanteVisto)
                      .catch((e) => console.error("[Pago] fallo procesando el comprobante:", e?.message));
                  } else {
                    console.log(`ℹ️ [PAGO] Comprobante ignorado: enviado por el admin (${phone})`);
                  }
                }
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
    const targetJid = originalJid || `${phone}@s.whatsapp.net`;
    await this.esperarEspaciadoEntreEnvios(targetJid);

    // Presentación: negritas conservadas, precio en negrita, aire entre
    // párrafos y viñetas con emoji con sentido (ver lib/presentacion.ts).
    text = presentarParaWhatsApp(text);

    // Simular lectura + escritura
    await sleep(READ_DELAY_MS);
    await this.sock.sendPresenceUpdate("composing", targetJid);
    await sleep(calcTypingDelay(text));
    await this.sock.sendPresenceUpdate("paused", targetJid);

    try {
      // Se anota el id para poder distinguir despues nuestro propio eco de lo
      // que conteste otro --el dueno desde su celular, o la IA de Meta--, que
      // llega con el mismo `fromMe: true`. Ver `mensajes-propios.ts`.
      const enviado = await this.sock.sendMessage(targetJid, { text });
      anotarMensajePropio(enviado?.key?.id);
    } catch (e) {
      this.recordSendFailure();
      throw e;
    }
    this.recordSendSuccess();
    trackWhatsAppCost(this.currentTenant.id.toString());
    // Y en la base, que es lo que sobrevive a un reinicio. El de arriba vive en
    // un Map del proceso y alimenta el panel de costos; el limite del plan se
    // mide contra este. Sin await: contar no puede demorar el mensaje.
    void sumarMensaje(this.currentTenant.id);
  }

  /**
   * Manda un audio (voz del agente) al cliente.
   *
   * Diferenciador frente a la competencia: el vendedor colombiano cierra con
   * audios, no con texto. La voz la genera `lib/voz-de-atlas.ts` (Edge TTS,
   * es-CO, gratis) y acá solo se despacha. Si la síntesis o el envío fallan,
   * el turno ya quedó respondido por texto: la voz nunca tira.
   */
  async sendAudio(phone: string, buffer: Buffer, mimetype = "audio/mpeg", originalJid?: string) {
    if (!this.sock || this.state !== "connected") throw new Error("WhatsApp no conectado");
    this.enforceSendLimits();
    const targetJid = originalJid || `${phone}@s.whatsapp.net`;
    await this.esperarEspaciadoEntreEnvios(targetJid);
    try {
      const enviado = await this.sock.sendMessage(targetJid, { audio: buffer, mimetype });
      anotarMensajePropio(enviado?.key?.id);
    } catch (e) {
      this.recordSendFailure();
      throw e;
    }
    this.recordSendSuccess();
    trackWhatsAppCost(this.currentTenant.id.toString());
    void sumarMensaje(this.currentTenant.id);
  }

  /**
   * El cliente mandó una foto que parece un comprobante de pago.
   *
   * Se guarda en disco, queda un pago `pending` y le llega el aviso al admin
   * por WhatsApp con la imagen. Antes la foto se describía y se tiraba: no
   * quedaba nada que aprobar, así que la "verificación" que el bot prometía
   * no podía existir.
   *
   * Nada de esto entrega el producto. Solo lo hace el admin respondiendo
   * APROBAR: el dinero lo confirma quien lo ve en su cuenta.
   */
  private async procesarComprobante(
    phone: string,
    pushName: string,
    buf: Buffer,
    mime: string,
    visto: string | null,
  ): Promise<void> {
    const {
      pareceComprobante, registrarComprobante, avisoParaElAdmin, telefonoDelAdmin,
    } = await import("./verificacion-pago");

    const [convo] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.tenantId, this.currentTenant.id), eq(conversations.contactPhone, phone)))
      .orderBy(desc(conversations.id))
      .limit(1);
    if (!convo) return;

    // La etapa dice si se estaba cobrando: con eso, una señal débil alcanza.
    const cobrando = ["closing", "qualified", "hot", "negotiating", "converted"].includes(
      String(convo.currentStage || ""),
    );
    if (!pareceComprobante(visto, cobrando)) return;

    console.log(`💸 [PAGO] Comprobante detectado de ${phone} — se guarda y se avisa al admin`);

    // Se guarda en el volumen de subidas, que sobrevive a los deploys.
    let proofUrl: string | null = null;
    try {
      const dir = process.env.IMAGE_STORE_DIR || path.resolve(process.cwd(), "uploads");
      const destino = path.join(dir, "comprobantes");
      if (!existsSync(destino)) mkdirSync(destino, { recursive: true });
      const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
      const nombre = `c${convo.id}_${Date.now()}.${ext}`;
      (await import("node:fs")).writeFileSync(path.join(destino, nombre), buf);
      proofUrl = `/uploads/comprobantes/${nombre}`;
    } catch (e: any) {
      // Sin la imagen guardada el aviso igual sale: es preferible que el admin
      // revise su cuenta sin la foto, a que nadie se entere del pago.
      console.error(`[Pago] no se pudo guardar el comprobante: ${e?.message}`);
    }

    let producto: any = null;
    if (convo.currentProductId) {
      const [p] = await db.select().from(products).where(eq(products.id, convo.currentProductId)).limit(1);
      producto = p ?? null;
    }

    const pagoId = await registrarComprobante({
      tenantId: this.currentTenant.id,
      conversationId: convo.id,
      leadId: convo.leadId ?? null,
      productId: producto?.id ?? null,
      monto: producto ? Number(producto.price) : null,
      moneda: producto?.currency || "COP",
      telefono: phone,
      nombre: pushName || convo.contactName || phone,
      proofUrl,
      descripcion: visto,
    });
    if (!pagoId) return;

    const adminPhone = await telefonoDelAdmin(this.currentTenant.id);
    if (!adminPhone) {
      console.error("[Pago] No hay teléfono de admin configurado: el comprobante quedó pendiente y NADIE se enteró");
      return;
    }

    // ── Leer el comprobante de verdad, no solo mirarlo ────────────────
    //
    // Pedido del admin el 2026-09-06: "el bot debería poder ver la fecha, el
    // monto, y si la transferencia dice mi nombre y mis datos". Y en la misma
    // frase el límite: "además echa mentira diciendo que los datos son tales
    // cuando ni siquiera los lee".
    //
    // `describirImagen` (que ya corrió y produjo `visto`) contesta QUÉ TIPO de
    // imagen es y tiene prohibido afirmar montos — por el Excel que el
    // 2026-09-05 describió como "comprobante con valor, fecha y banco". Esto
    // es la otra pregunta: QUÉ DICE, campo por campo, y qué NO se pudo leer.
    //
    // El cotejo contra la cuenta real del negocio lo hace el servidor, no el
    // modelo. Y nada de esto aprueba nada: sigue decidiendo el admin.
    let bloqueLeido = "";
    let cotejos: Array<{ marca: "✅" | "⚠️" | "❔"; linea: string }> = [];
    try {
      const { leerComprobante, cotejarComprobante, bloqueDeLectura } = await import("./leer-comprobante");
      const { credencialesDe } = await import("./tenant-payment-credentials");
      const { tenantManager } = await import("./tenantManager");

      const leido = await leerComprobante(buf, mime);
      const tenant = await tenantManager.getTenantById(this.currentTenant.id);
      const cuentas = credencialesDe(tenant as any)?.transfer?.accounts || [];
      cotejos = cotejarComprobante(leido, {
        cuentas,
        monto: producto ? Number(producto.price) : null,
        moneda: producto?.currency || "COP",
      });
      bloqueLeido = bloqueDeLectura(cotejos);

      // Lo que NO cuadra queda guardado con el pago para poder explicarselo al
      // cliente si se rechaza. Solo los ⚠️: un ✅ no es motivo de rechazo, y un
      // ❓ ("no se pudo leer") tampoco — no saber no es lo mismo que estar mal.
      const { anotarMotivos } = await import("./verificacion-pago");
      await anotarMotivos(
        pagoId,
        cotejos.filter((c: any) => c.marca === "⚠️").map((c: any) => c.linea),
      );
    } catch (e: any) {
      // Sin lectura el aviso igual sale: es preferible que el admin revise su
      // cuenta a mano, a que nadie se entere del pago.
      bloqueLeido = "🔍 No pude leer el comprobante (falló la revisión automática): revisalo vos.";
      console.error(`[Pago] no se pudo leer el comprobante: ${e?.message}`);
    }

    // ── Cruce con el correo del banco ──────────────────────────────────────
    //
    // La captura la manda el cliente y se puede falsificar; el correo lo manda
    // el banco a la bandeja del dueño. Si ahí hay un aviso que cuadre (monto +
    // ventana de tiempo), el dueño ve "confirmé un pago de $X a nombre de Y"
    // en vez de tener que adivinar sobre una foto. La decisión sigue siendo
    // suya: el correo dice cuánto y de quién, pero no QUÉ compró esa persona.
    //
    // Va DESPUÉS de leer la captura y ANTES del aviso, y nunca bloquea: si el
    // IMAP falla, el aviso normal (con la captura) sale igual.
    let bloqueCorreo = "";
    let correoConfirmaMonto = false;
    try {
      const { credencialesEmailDe } = await import("./tenant-email-credentials");
      const { leerAvisosDeBanco } = await import("./leer-correo");
      const { cruzarConElComprobante, loQueSeLeDiceAlDueno } = await import("./pagos-por-correo");

      const creds = credencialesEmailDe(this.currentTenant as any);
      if (creds.user && creds.pass) {
        const desde = new Date(Date.now() - 90 * 60_000);
        const avisos = await leerAvisosDeBanco({ user: creds.user, pass: creds.pass, desde });
        const cruces = cruzarConElComprobante(avisos, {
          llegoElComprobante: new Date(),
          montoEsperado: producto ? Number(producto.price) : null,
        });
        correoConfirmaMonto = cruces.some((c: any) => c.montoExacto);
        bloqueCorreo = loQueSeLeDiceAlDueno(cruces, pushName || convo.contactName || phone);
      }
    } catch (e: any) {
      // Sin cruce el aviso igual sale con la captura: no se bloquea un pago por
      // no poder leer el correo.
      console.error(`[Pago] no se pudo cruzar con el correo: ${e?.message}`);
    }

    // La captura y el correo deben coincidir antes de automatizar una decisión.
    // Una alerta comprobable se rechaza de inmediato; un dato incierto nunca
    // se interpreta como aprobación.
    const alertas = cotejos.filter((c) => c.marca === "⚠️").map((c) => c.linea);
    const datosInciertos = cotejos.some((c) => c.marca === "❔");
    const puedeAutomatizar = cotejos.length > 0 && !alertas.length && !datosInciertos;

    if (alertas.length || (puedeAutomatizar && correoConfirmaMonto)) {
      try {
        const { atenderDecisionDelAdmin } = await import("./verificacion-pago");
        const accion = alertas.length ? "RECHAZAR" : "APROBAR";
        const razon = alertas.length ? ` ${alertas.join(" ").slice(0, 500)}` : "";
        const resultado = await atenderDecisionDelAdmin(adminPhone, `${accion} ${pagoId}${razon}`);

        if (resultado?.paraElCliente) {
          await this.sendText(phone, resultado.paraElCliente.texto);
          const { saveAgentMessage } = await import("./conversation-engine");
          await saveAgentMessage(
            resultado.paraElCliente.conversationId,
            resultado.paraElCliente.texto,
            (resultado.paraElCliente.entregar ? "converted" : "closing") as any,
            { intent: "payment_verified", verificadoPor: "automatico" } as any,
          );
          console.log(`💬 [PAGO] Cliente ${phone} avisado: ${accion.toLowerCase()}`);
        }

        if (resultado?.paraElAdmin) {
          await this.sendText(adminPhone, `🤖 Decisión automática del comprobante ${pagoId}:\n${resultado.paraElAdmin}`);
        }
        return;
      } catch (e: any) {
        // Si falla la decisión automática, no se entrega ni se pierde el aviso.
        console.error(`[Pago] fallo en decisión automática: ${e?.message}`);
      }
    }

    const aviso = avisoParaElAdmin({
      pagoId,
      cliente: pushName || convo.contactName || phone,
      telefono: phone,
      producto: producto?.name || "producto sin identificar",
      monto: producto ? Number(producto.price) : 0,
      moneda: producto?.currency || "COP",
      descripcion: visto,
      lectura: bloqueLeido,
      correo: bloqueCorreo,
    });

    try {
      // ── Este aviso también gasta cupo del número ────────────────────────
      //
      // No pasa por enforceSendLimits() A PROPÓSITO: ese método LANZA, y
      // bloquear el aviso de un pago que el cliente ya hizo es peor que el
      // riesgo que evita. Pero sí se espacia y sí se cuenta.
      //
      // Contarlo importa: antes estos envíos no entraban en `sentTimestampsMs`,
      // así que los contadores de 60/hora y 400/día veían MENOS tráfico del
      // que el número mandaba de verdad. Un límite que no cuenta todo lo que
      // sale no protege de nada.
      await this.esperarEspaciadoEntreEnvios(`${adminPhone}@s.whatsapp.net`);
      await this.sock!.sendMessage(`${adminPhone}@s.whatsapp.net`, {
        image: buf,
        caption: aviso,
        mimetype: tipoDeImagen(buf) || "image/jpeg",
      });
      this.recordSendSuccess();
      console.log(`📨 [PAGO] Aviso enviado al admin (${adminPhone}) — comprobante ${pagoId}`);
    } catch (e: any) {
      // Y NO se llama recordSendFailure(): un teléfono de admin mal cargado
      // fallaría siempre, y a los 5 fallos el circuit breaker pausaría TODOS
      // los envíos 30 minutos -- dejando sin respuesta a los clientes por un
      // dato de configuración que no tiene nada que ver con ellos.
      console.error(`[Pago] no se pudo avisar al admin por WhatsApp: ${e?.message}`);
    }

    // Y por correo, que es el respaldo cuando el admin no tiene el WhatsApp a
    // mano. Si el SMTP no está configurado, esto no rompe nada.
    //
    // El destinatario se resuelve en cascada: el email del NEGOCIO primero, y
    // si el negocio no cargó uno, el EMAIL_TO del entorno. Antes esto solo
    // miraba `t.email`, así que un negocio sin email en su ficha NO recibía el
    // comprobante por correo aunque el dueño hubiera cargado EMAIL_TO en el
    // entorno -- el aviso quedaba solo en WhatsApp y, si el admin no lo tenía a
    // mano, el comprobante se pudría sin revisar.
    try {
      const { credencialesEmailDe } = await import("./tenant-email-credentials");
      const { enviarCorreoSimple } = await import("./email");
      const [t] = await db.select().from(tenants).where(eq(tenants.id, this.currentTenant.id)).limit(1);
      const destinatario =
        String((t as any)?.email || "").trim() ||
        String(process.env.EMAIL_TO || "").trim() ||
        String(process.env.EMAIL_FROM || "").trim();
      if (destinatario) {
        await enviarCorreoSimple(
          destinatario,
          `💸 Comprobante para revisar — ${pushName || phone}`,
          aviso.replace(/\*/g, ""),
          credencialesEmailDe(this.currentTenant as any),
          proofUrl ? [{ filename: `comprobante-${pagoId}.jpg`, content: buf }] : undefined,
        );
      } else {
        console.warn("[Pago] Sin email de admin configurado: el comprobante solo quedó en WhatsApp");
      }
    } catch (e: any) {
      console.error(`[Pago] no se pudo avisar al admin por correo: ${e?.message}`);
    }
  }

  async sendImage(phone: string, imageUrl: string, caption: string, originalJid?: string) {
    if (!this.sock || this.state !== "connected") throw new Error("WhatsApp no conectado");
    this.enforceSendLimits();
    // ── Las protecciones fuertes también valen para las imágenes ──────────
    //
    // ⚠️ Esto FALTABA, y era el hueco más caro de todos. `sendImage` llamaba a
    // enforceSendLimits() y al espaciado, pero nunca a verificarProteccionesAsync(),
    // así que mandar una imagen se salteaba las tres protecciones de verdad:
    // el envío en frío --que el comentario de esa función describe como "la
    // causa número uno de que Meta bloquee un número"--, el tope de
    // calentamiento del número nuevo, y el control de mismo texto a muchos
    // destinatarios.
    //
    // Y no es un camino raro: las fichas de producto se mandan como imagen con
    // caption, así que es de los envíos MÁS frecuentes del bot. La protección
    // principal tenía el agujero justo donde pasa el tráfico.
    //
    // Va ANTES del try a propósito: si esto lanza, no tiene que caer al
    // respaldo de "mando solo el texto" -- eso enviaría igual el mensaje que
    // la protección acaba de prohibir, por otro camino.
    await this.verificarProteccionesAsync(caption, phone);
    const jid = originalJid || `${phone}@s.whatsapp.net`;
    await this.esperarEspaciadoEntreEnvios(jid);

    // Simular lectura + escritura (basado en el caption)
    await sleep(READ_DELAY_MS);
    await this.sock.sendPresenceUpdate("composing", jid);
    await sleep(calcTypingDelay(caption));
    await this.sock.sendPresenceUpdate("paused", jid);

    let sentSomething = false;
    try {
      let buffer = await loadProductImage(imageUrl);
      if (!buffer) throw new Error(`no se pudo obtener la imagen (${imageUrl})`);

      // El tipo se declara SIEMPRE, y sale de los bytes -- no de la extensión
      // de la URL, que puede mentir.
      //
      // Sin `mimetype`, Baileys lo deduce, y con WEBP lo trata como STICKER:
      // el cliente recibe una calcomanía sin descripción en vez de la foto del
      // producto con su ficha. De los 56 productos físicos, 5 son .webp -- y
      // son justo los físicos, porque sus fotos vienen del CDN de Dropi
      // mientras las de los digitales salen de disco en JPG/PNG.
      let mimetype = tipoDeImagen(buffer) || "image/jpeg";

      if (mimetype === "image/webp") {
        // Se reencoda a JPEG: WhatsApp acepta webp como STICKER, no como foto
        // con caption, así que mandarlo tal cual pierde la ficha entera.
        //
        // `sharp` está externalizada en build.mjs pero NO declarada en ningún
        // package.json, así que puede no existir en el contenedor. Si no está,
        // se manda igual declarando image/jpeg: Baileys reencoda por su cuenta
        // y, en el peor caso, la foto sale como sticker -- que es exactamente
        // lo que pasa hoy. Nunca peor que ahora, y mejor si sharp está.
        try {
          const sharp = (await import("sharp")).default;
          buffer = await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
        } catch (e: any) {
          console.warn(`[WhatsApp] sin sharp para convertir webp (${imageUrl}): ${e?.message}`);
        }
        mimetype = "image/jpeg";
      }

      const enviadoImg = await this.sock.sendMessage(jid, { image: buffer, caption, mimetype });
      anotarMensajePropio(enviadoImg?.key?.id);
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
        const enviadoAlt = await this.sock.sendMessage(jid, { text: caption });
        anotarMensajePropio(enviadoAlt?.key?.id);
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
    // Y en la base, que es lo que sobrevive a un reinicio. El de arriba vive en
    // un Map del proceso y alimenta el panel de costos; el limite del plan se
    // mide contra este. Sin await: contar no puede demorar el mensaje.
    void sumarMensaje(this.currentTenant.id);
  }

  async sendAgentParts(phone: string, pushName: string, parts: AgentReplyPart[], originalJid?: string) {
    const timestamp = new Date().toISOString();

    // ── Una idea, una burbuja ──────────────────────────────────
    //
    // Cada parte era un mensaje de WhatsApp, asi que tres pedazos de texto
    // seguidos llegaban como tres burbujas en el mismo minuto. Conversacion
    // real del 2026-09-06:
    //
    //   [13:23] 💰 $60.000 COP  ¿Te muestro como es por dentro? 🎬
    //   [13:23] Entonces te comparto los datos del curso de IA...
    //   [13:23] Son 3 cursos, 52 modulos en video 🤖 ...
    //
    // Se juntan aca --en el borde donde "un mensaje" significa algo-- y no en
    // el agente: asi la base y el panel siguen guardando las partes como las
    // penso el agente, y lo que cambia es solo como se entregan.
    //
    // Las fichas NO se absorben: la foto es su propia burbuja y un mensaje de
    // 30 lineas tapa la pantalla del celular.
    const { unirTextosSeguidos, unirElRestoDeLaFicha } = await import("./una-sola-burbuja");
    const antesDeUnir = parts.length;
    parts = unirTextosSeguidos(parts as any) as AgentReplyPart[];
    if (parts.length !== antesDeUnir) {
      console.log(`🧵 [WA-PARTS] ${antesDeUnir} partes -> ${parts.length}: los textos seguidos van en un solo mensaje`);
    }

    console.log(`📤 [WA-PARTS] Iniciando envío de partes - Teléfono: ${phone}, Partes: ${parts.length} - ${timestamp}`);
    
    const cardIds = parts.flatMap((p) => (p.kind === "card" ? [p.productId] : []));
    let cardCache: Map<number, any> = new Map();
    // ── El tenant REAL, no el de fábrica ───────────────────────────────────
    //
    // `getWhatsAppForTenant` cae a `tenantManager.getDefaultTenant()` cuando
    // nadie le pasa un contexto, y ese tenant de fábrica arma las cuentas de
    // transferencia desde `TRANSFER_NUMBER`/`TRANSFER_NAME` -- variables que
    // NO existen en producción. Resultado, medido en vivo el 2026-08-26: el
    // cliente preguntó "cómo pago por Nequi" y el bot contestó "ahora mismo no
    // tengo el dato de transferencia a mano", con el número correcto guardado
    // en la base todo el tiempo.
    //
    // Es el mismo patrón que ya mordió con el AdStrategist y con las
    // credenciales de correo: la instancia compartida se construye sin tenant
    // y termina leyendo el entorno en vez de la base.
    //
    // `getTenantById` está cacheado 5 min, así que no agrega consultas.
    let tenantParaCobrar = this.currentTenant;
    try {
      const real = await tenantManager.getTenantById(this.currentTenant.id);
      if (real) tenantParaCobrar = real;
    } catch (e: any) {
      console.error(`[Pagos] no se pudo leer el tenant real, se usa el de la sesión: ${e?.message}`);
    }
    const pg = new PaymentGateway(tenantParaCobrar);
    
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
          // ── Los links de pago NO pueden tumbar la ficha ──────────────────
          //
          // Demo del dueño (19-09-2026, conversación 165): el cliente escribió
          // "Precio" y recibió solo la frase del modelo, sin el precio. La
          // sección "precio" sí se había decidido; lo que puede fallar es
          // generar el link de MercadoPago/PayPal (red, token vencido), y ese
          // error caía en el catch de abajo y descartaba la tarjeta ENTERA.
          // Ahora, si los links fallan, la ficha sale igual con las cuentas
          // de transferencia que el negocio tiene cargadas.
          let dynamicLinks: any;
          try {
            dynamicLinks = await pg.getAllLinks(product, { phone, name: pushName });
          } catch (e: any) {
            logger.error({ err: e?.message, productId: product.id }, "[WA-CARD] No se pudieron generar los links de pago; la ficha sale sin ellos");
            let transfer: any = { options: [] };
            try { transfer = (pg as any).getTransferInfo?.() || transfer; } catch { /* sin cuentas */ }
            dynamicLinks = { transfer, mercadopago: null, paypal: null };
          }
          console.log(`🔗 [WA-CARD] Enlaces generados - MercadoPago: ${!!dynamicLinks.mercadopago?.url}, PayPal: ${!!dynamicLinks.paypal?.url}, Transfer: ${dynamicLinks.transfer?.options?.length ?? 0} - ${timestamp}`);
          
          // Solo la imagen REAL del producto. Si no la tiene, sendImage manda
          // el texto solo — nunca una foto de otro producto (ver sendImage).
          const imageToUse = product.imageUrl || "";

          // ── Se manda SOLO el pedazo que el cliente pidió ──────────────────
          // La ficha entera en cada turno es lo que hacía ver al bot como un
          // folleto automático: al cliente no le quedaba nada que preguntar.
          const seccion: SeccionFicha | null = (part as any).seccion ?? null;

          if (seccion) {
            const { conFoto, mensajes } = await construirSeccion(
              product, seccion, dynamicLinks, phone,
              // Lo decide el agente, que es el que tiene el historial.
              !!(part as any).yaVioContenido,
              // Si volvio despues de horas, la presentacion arranca de nuevo
              // con su foto: la ficha pelada no es una presentacion.
              !!(part as any).sesionNueva,
              !!(part as any).videoYaEnviado,
              String((part as any).mensajeDelCliente || ""),
              !!(part as any).yaSabeElPrecio,
              !!(part as any).sinCierre,
            );
            console.log(`🎯 [WA-CARD] Sección "${seccion}" — ${mensajes.length} mensaje(s), foto: ${conFoto} - ${timestamp}`);
            // El pie de foto va con la foto; TODO lo demas en un solo
            // mensaje. Antes salia uno cada 900ms, asi que una ficha de cuatro
            // pedazos eran cuatro burbujas seguidas -- una ametralladora.
            const juntos = unirElRestoDeLaFicha(mensajes);
            if (conFoto) {
              await this.sendImage(phone, imageToUse, juntos[0] || product.name, originalJid);
              if (juntos[1]) {
                await sleep(900);
                await this.sendText(phone, juntos[1], originalJid);
              }
            } else {
              for (const [i, m] of juntos.entries()) {
                if (i > 0) await sleep(900);
                await this.sendText(phone, m, originalJid);
              }
            }
          } else if (part.paymentOnly === true) {
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
          // Antes esto era un console.log y la tarjeta desaparecía sin rastro
          // ni respaldo. Ahora se registra como error y se manda lo mínimo que
          // responde la pregunta del cliente (el precio, el nombre), para que
          // nunca se quede esperando una respuesta que no llega.
          logger.error({ err: err?.message, productId: product.id, seccion: (part as any).seccion || null }, "[WA-CARD] Error enviando tarjeta; se manda el respaldo mínimo");
          console.log(`❌ [WA-CARD] Error enviando tarjeta para ${product.name}: ${err.message} - ${timestamp}`);
          try {
            const seccionFallida = String((part as any).seccion || "");
            const precio = Number(product.price);
            const precioTexto = Number.isFinite(precio) && precio > 0
              ? `${product.currency === "USD" ? "USD " : "$"}${precio.toLocaleString("es-CO")}${product.currency && product.currency !== "USD" ? ` ${product.currency}` : ""}`
              : "";
            const respaldo =
              seccionFallida === "precio" || seccionFallida === "pago" || seccionFallida === "pago_link" || seccionFallida === "pago_transferencia" || (part as any).paymentOnly
                ? (precioTexto ? `💰 *${product.name}*: *${precioTexto}*${seccionFallida === "precio" ? "" : "\n\nDame un momento y te paso los datos de pago 🙏"}` : `Déjame confirmarte el precio exacto de *${product.name}* y te escribo enseguida 🙏`)
                : `*${product.name}*\n\nDame un momento y te paso el detalle completo 🙏`;
            await this.sendText(phone, respaldo, originalJid);
          } catch (e2: any) {
            logger.error({ err: e2?.message }, "[WA-CARD] Tampoco salió el respaldo mínimo");
          }
        }
      }
    }
    
    // ── VOZ: el agente también habla ─────────────────────────────────────────
    // Diferenciador: además del texto, se manda una nota de voz del agente.
    // Activable con WHATSAPP_AUDIO_ENABLED=true. La voz (Edge TTS es-CO) es
    // gratis; si falla, el turno ya quedó respondido por texto.
    if (String(process.env.WHATSAPP_AUDIO_ENABLED || "").toLowerCase() === "true") {
      const textoHablado = parts
        .filter((p) => p.kind === "text" && (p as any).content)
        .map((p) => (p as any).content)
        .join(" ");
      if (textoHablado.trim().length >= 20) {
        try {
          const { hablar, generoDeNombre, vozParaGenero } = await import("./voz-de-atlas");
          // Ritmo natural (+0%): una voz de ventas calmada suena más confiable
          // que la de Atlas, que corre un poco para leer paneles.
          // Voz según el género del cliente: mujer responde con voz de mujer,
          // hombre con voz de hombre. WHATSAPP_AUDIO_VOICE fuerza una fija.
          const voz = process.env.WHATSAPP_AUDIO_VOICE || vozParaGenero(generoDeNombre(pushName));
          const audio = await hablar(textoHablado, voz, "+0%");
          if (audio) {
            await this.sendAudio(phone, audio, "audio/mpeg", originalJid);
            console.log(`🎙️ [WA-VOZ] Audio enviado (${Math.round(audio.length / 1024)} KB) - ${timestamp}`);
          }
        } catch (e: any) {
          logger.warn({ err: e?.message }, "[WA-Voz] No se pudo generar/enviar el audio");
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
