import { eq, inArray, desc } from "drizzle-orm";
import path from "node:path";
import { existsSync, mkdirSync, rmSync } from "node:fs";
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

function getProductImage(name: string): string {
  const nameLower = name.toLowerCase();
  const genericImage = "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800";
  
  const imageMap: Record<string, string> = {
    "piano": "https://images.unsplash.com/photo-1552422535-c45813c61732?w=800",
    "guitarra": "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800",
    "excel": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800",
    "diseño": "https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800",
    "trading": "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800",
    "hacking": "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800",
    "marketing": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800",
    "fitness": "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800",
    "programación": "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=800",
    "ingles": "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800",
    "idiomas": "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800",
  };

  for (const [key, url] of Object.entries(imageMap)) {
    if (nameLower.includes(key)) return url;
  }

  // Try category-based fallback
  const categoryImages: Record<string, string> = {
    "música": "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=800",
    "musica": "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=800",
    "tecnología": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800",
    "tecnologia": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800",
    "negocios": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800",
    "salud": "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800",
    "fitness": "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800",
    "idiomas": "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800",
  };

  for (const [key, url] of Object.entries(categoryImages)) {
    if (nameLower.includes(key)) return url;
  }

  return genericImage;
}

function buildProductCaption(p: typeof products.$inferSelect, categoryName: string | null, dynamicLinks?: any) {
  const lines: string[] = [];
  
  let meta: any = {};
  try { meta = JSON.parse(p.metadata || "{}"); } catch(e) {}

  const nameUpper = p.name.toUpperCase();
  const mainEmoji = nameUpper.includes("PIANO") ? "🎹" : 
                    nameUpper.includes("GUITARRA") ? "🎸" : 
                    nameUpper.includes("CANTO") ? "🎤" : 
                    nameUpper.includes("EXCEL") ? "📊" : "💻";

  lines.push(`✨ ${mainEmoji} *PROGRAMA PROFESIONAL: ${nameUpper}*`);
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push(`*DESCRIPCIÓN:*`);
  lines.push(`${p.description || 'Formación estructurada para llevar tus habilidades al siguiente nivel con metodología probada y práctica.'}`);
  lines.push("");
  
  lines.push(`*BENEFICIOS INCLUIDOS:*`);
  const features = (p.features ?? []);
  if (features.length > 0) {
    for (const f of features) lines.push(`✅ ${f}`);
  } else {
    lines.push(`✅ ${meta.classes || "Contenido completo"} en Alta Definición`);
    lines.push(`✅ Acceso inmediato y de por vida`);
  }
  
  lines.push("");
  lines.push(`💰 *PRECIO ESPECIAL:*`);
  lines.push(`*${formatPriceForWa(Number(p.price), p.currency)}*`);
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");

  if (dynamicLinks) {
    lines.push(`💳 *ENLACES DE PAGO SEGURO:*`);
    lines.push("");
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

  lines.push(`_¿Deseas confirmar tu compra ahora o tienes alguna pregunta adicional?_`);
  
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

// AUTH_DIR: always relative to this source file's location (artifacts/api-server/)
// Using import.meta.url ensures it works regardless of cwd
const _moduleDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const AUTH_DIR = path.resolve(_moduleDir, "..", ".baileys-auth");

export class WhatsAppManager {
  private state: WAState = "disconnected";
  private qrDataUrl: string | null = null;
  private phoneNumber: string | null = null;
  private connectedAt: string | null = null;
  private lastError: string | null = null;
  private sock: any = null;
  private starting = false;
  private currentTenant: TenantContext;

  constructor(tenant?: TenantContext) {
    this.currentTenant = tenant || tenantManager.getDefaultTenant();
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

  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;

  async stop(): Promise<WhatsAppPublicStatus> {
    try {
      if (this.sock) {
        this.sock.ev.removeAllListeners();
        await this.sock.logout().catch(() => {});
        this.sock.end(undefined);
        this.sock = null;
      }
    } catch (e) {
      logger.warn({ err: e }, "[WhatsApp] Error during stop");
    }
    
    // Borrar carpeta de autenticación para forzar nuevo QR
    try {
      if (existsSync(AUTH_DIR)) {
        rmSync(AUTH_DIR, { recursive: true, force: true });
        logger.info("[WhatsApp] Auth directory deleted");
      }
    } catch (e) {
      logger.warn({ err: e }, "[WhatsApp] Error deleting auth directory");
    }
    
    this.state = "disconnected";
    this.qrDataUrl = null;
    this.phoneNumber = null;
    this.connectedAt = null;
    this.starting = false;
    this.lastError = null;
    logger.info("[WhatsApp] Stopped and auth cleared");
    return this.getStatus();
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

      const sock = makeWASocket({
         auth: authState,
         browser: ["VentasPro", "Chrome", "1.0.0"],
         syncFullHistory: false,
         markOnlineOnConnect: true,
         generateHighQualityLinkPreview: false,
         // WhatsApp rechaza el protocolo WEB antiguo (error 405).
         // Se requiere versión actualizada + plataforma MACOS para nuevo pairing.
         version: [2, 3000, 1034074495],
       });
       this.sock = sock;
       console.log("✅ [INIT] Socket WhatsApp inicializado correctamente");

       sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update: any) => {
         const { connection, lastDisconnect, qr } = update;
         
         if (qr) {
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

      sock.ev.on("messages.upsert", async (upsert: any) => {
        console.log("📨 Evento messages.upsert recibido:", JSON.stringify({ 
          type: upsert.type, 
          count: upsert.messages?.length,
          firstMsgType: upsert.messages?.[0] ? Object.keys(upsert.messages[0].message || {})[0] : null,
          allMsgTypes: upsert.messages?.map((m: any) => Object.keys(m.message || {})).flat()
        }));
        
        try {
          if (upsert.type !== "notify") {
            console.log("⏭️ Ignorando evento tipo:", upsert.type);
            return;
          }
          
          for (const msg of upsert.messages ?? []) {
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
            
            // ANTI-LOOP: Ignorar mensajes que son exclusivamente imágenes o documentos
            // enviados por el bot (el caption de sendImage re-entra como evento)
            const msgKeys = Object.keys(msg.message || {});
            const isBotMediaOnly = msgKeys.length === 1 && 
              (msgKeys[0] === "imageMessage" || msgKeys[0] === "documentMessage" || msgKeys[0] === "stickerMessage" || msgKeys[0] === "audioMessage");
            if (isBotMediaOnly) {
              console.log("⏭️ [ANTI-LOOP] Ignorando mensaje de solo-media reenviado:", msgKeys[0]);
              continue;
            }

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
            
            // Para LID, usar el número alternativo si está disponible
            let phone: string;
            let originalJid: string = remoteJid; // Guardar el JID original para responder
            if (remoteJid.endsWith("@lid") && msg.key.participant) {
              // Usar el participant como número de teléfono para LID
              phone = msg.key.participant.split("@")[0]!;
            } else {
              phone = remoteJid.split("@")[0]!;
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
                
                // Intentar extraer cualquier string que parezca texto
                const allStrings = JSON.stringify(msgObj).match(/"[^"]{3,}"/g);
                if (allStrings && allStrings.length > 0) {
                  const potentialText = allStrings
                    .map(s => s.slice(1, -1)) // Remover comillas
                    .filter(s => s.length > 2 && !s.includes('http') && !s.includes('@') && !/^\d+$/.test(s))
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
             
             // ✅ DELEGADO AL MESSAGE HANDLER + ORCHESTRATOR
             // El MessageHandler encola el mensaje y el AgentOrchestrator lo procesa
             // Esto evita respuestas duplicadas al procesar por una sola ruta
             const messageHandler = getMessageHandler();
             try {
               await messageHandler.handleIncomingMessage({
                 tenantId: "1",
                 remoteJid: originalJid,
                 fromMe: false,
                 messageId: msg.key.id || `msg_${Date.now()}`,
                 body: text.trim(),
                 timestamp: new Date(msg.messageTimestamp ? msg.messageTimestamp * 1000 : Date.now()),
                 pushName,
               });
               console.log(`📤 [WA-QUEUE] Mensaje encolado exitosamente a MessageHandler: ${text.substring(0, 30)}...`);
             } catch (error) {
               console.error(`❌ [WA-QUEUE] Error encolando mensaje en MessageHandler:`, error);
             }
           }
        } catch (e) {
          logger.error({ err: e }, "Error processing incoming message");
        }
      });
       this.starting = false;
        return this.getStatus();
      } catch (e: any) {
        this.starting = false;
        this.state = "error";
        this.lastError = `Error al conectar: ${e instanceof Error ? e.message : String(e)}`;
        logger.error({ err: e }, "Failed to start WhatsApp");
        console.error("❌ [ERROR] Error fatal al iniciar WhatsApp:", e instanceof Error ? e.message : String(e));
        console.error("Stack:", e instanceof Error ? e.stack : "No stack available");
        return this.getStatus();
      }
    }

  async sendText(phone: string, text: string, originalJid?: string) {
    if (!this.sock || this.state !== "connected") throw new Error("WhatsApp no conectado");
    const targetJid = originalJid || `${phone}@s.whatsapp.net`;

    // Simular lectura + escritura
    await sleep(READ_DELAY_MS);
    await this.sock.sendPresenceUpdate("composing", targetJid);
    await sleep(calcTypingDelay(text));
    await this.sock.sendPresenceUpdate("paused", targetJid);

    await this.sock.sendMessage(targetJid, { text });
    trackWhatsAppCost(this.currentTenant.id.toString());
  }

  async sendImage(phone: string, imageUrl: string, caption: string, originalJid?: string, fallbackImageUrl?: string) {
    if (!this.sock || this.state !== "connected") throw new Error("WhatsApp no conectado");
    const jid = originalJid || `${phone}@s.whatsapp.net`;

    // Simular lectura + escritura (basado en el caption)
    await sleep(READ_DELAY_MS);
    await this.sock.sendPresenceUpdate("composing", jid);
    await sleep(calcTypingDelay(caption));
    await this.sock.sendPresenceUpdate("paused", jid);

    try {
      let isLocalFile = false;
      let localPath = "";
      
      if (imageUrl.startsWith('/')) {
        const path = await import("path");
        const fs = await import("fs");
        localPath = path.join(process.cwd(), "..", "ventas-pro", "public", imageUrl);
        if (fs.existsSync(localPath)) {
          isLocalFile = true;
        }
      }

      if (isLocalFile) {
        const fs = await import("fs");
        const buffer = fs.readFileSync(localPath);
        await this.sock.sendMessage(jid, { image: buffer, caption });
      } else {
        const fetchUrl = imageUrl.startsWith('/') ? `http://localhost:5173${imageUrl}` : imageUrl;
        const axios = (await import("axios")).default;
        const response = await axios.get(fetchUrl, { responseType: 'arraybuffer', timeout: 8000 });
        await this.sock.sendMessage(jid, { image: Buffer.from(response.data), caption });
      }
    } catch (e: any) {
      console.error(`[WhatsApp] Error procesando imagen ${imageUrl}: ${e.message}. Intentando fallback...`);
      try {
        if (fallbackImageUrl && fallbackImageUrl !== imageUrl) {
          const axios = (await import("axios")).default;
          const fallbackRes = await axios.get(fallbackImageUrl, { responseType: 'arraybuffer', timeout: 5000 });
          await this.sock.sendMessage(jid, { image: Buffer.from(fallbackRes.data), caption });
        } else {
          throw new Error("No hay fallback image disponible o es igual a la original");
        }
      } catch (fallbackErr: any) {
        console.error(`[WhatsApp] Error con fallback de imagen: ${fallbackErr.message}. Enviando solo texto...`);
        await this.sock.sendMessage(jid, { text: caption }).catch((err: any) => {
          console.error(`[WhatsApp] Error fatal enviando texto fallback: ${err.message}`);
        });
      }
    }
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
          const caption = isPaymentOnly
            ? buildPaymentOnlyCaption(product, dynamicLinks)
            : buildProductCaption(product, null, dynamicLinks);
          const fallbackImage = getProductImage(product.name || "");
          const imageToUse = product.imageUrl || fallbackImage;
          
          console.log(`🖼️ [WA-CARD] Enviando imagen con caption - URL: ${imageToUse?.substring(0, 50)}..., PaymentOnly: ${isPaymentOnly}, Caption: ${caption.length} caracteres - ${timestamp}`);
          await this.sendImage(phone, imageToUse, caption, originalJid, fallbackImage);
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
