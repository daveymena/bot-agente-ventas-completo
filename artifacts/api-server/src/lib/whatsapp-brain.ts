import { logger } from "./logger";
import { db, conversations, messages, products } from "@workspace/db";
import { eq, and } from "drizzle-orm";

/**
 * WhatsApp Brain - Arquitecto IA para análisis y respuestas automáticas
 * Analiza mensajes de cliente y decide si responder automáticamente
 */

export interface WhatsAppAnalysis {
  debe_responder: boolean;
  respuesta: string | null;
  confianza: number;
  tipo_mensaje: "precio" | "producto" | "compra" | "horario" | "otro";
  razonamiento: string;
}

/**
 * Analiza un mensaje y decide si debe responderse automáticamente
 */
export async function analyzeWhatsAppMessage(
  conversationId: number,
  tenantId: number
): Promise<WhatsAppAnalysis> {
  try {
    // Obtener los últimos 5 mensajes para contexto
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy((m) => m.createdAt)
      .limit(5);

    if (!msgs.length) {
      return {
        debe_responder: false,
        respuesta: null,
        confianza: 0,
        tipo_mensaje: "otro",
        razonamiento: "No hay mensajes en la conversación",
      };
    }

    const lastMessage = msgs[msgs.length - 1];
    const messageText = lastMessage.content.toLowerCase();

    // Obtener productos disponibles
    const prods = await db
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)))
      .limit(200);

    // 1. DETECCIÓN DE TIPO DE MENSAJE
    const tipología = detectarTipo(messageText);

    // 2. CONFIANZA INICIAL
    let confianza = 50;

    // 3. ANÁLISIS POR TIPO
    let respuesta: string | null = null;
    let debe_responder = false;

    let productoEncontrado: any = null;
    try {
      const { findBestProductMatch } = await import("./conversation-engine");
      const match = await findBestProductMatch(lastMessage.content, prods as any, new Map());
      if (match?.product && match.score >= 45) productoEncontrado = match.product;
    } catch (err: any) {
      logger.warn({ err: err?.message, conversationId }, "[WhatsAppBrain] no se pudo resolver el producto semánticamente");
    }

    if (tipología === "precio") {
      confianza += 20;
      if (productoEncontrado) {
        respuesta = generarRespuestaPrecio(productoEncontrado);
        debe_responder = confianza >= 75;
      } else if (prods.length === 1) {
        respuesta = generarRespuestaPrecio(prods[0]);
        debe_responder = confianza >= 75;
      } else {
        // Nunca adivinar el producto preguntado por el precio.
        respuesta = "¿De cuál producto querés saber el precio? Decime el nombre y te lo confirmo con el valor real. 😊";
        debe_responder = true;
      }
    } else if (tipología === "producto") {
      confianza += 15;
      if (productoEncontrado) {
        respuesta = generarRespuestaProducto([productoEncontrado]);
        debe_responder = confianza >= 75;
      } else if (prods.length > 0) {
        respuesta = generarRespuestaProducto(prods);
        debe_responder = confianza >= 75;
      }
    } else if (tipología === "compra") {
      confianza += 25;
      respuesta = generarRespuestaCompra();
      debe_responder = confianza >= 75;
    } else if (tipología === "horario") {
      // No hay horario verificable en este módulo. Es mejor reconocerlo y
      // derivar que inventar un horario de atención.
      confianza = 20;
      respuesta = null;
      debe_responder = false;
    } else {
      confianza = 40; // Mensajes genéricos
      debe_responder = false;
    }

    // 4. VALIDACIÓN FINAL
    if (!respuesta || confianza < 75) {
      debe_responder = false;
      respuesta = null;
    }

    return {
      debe_responder,
      respuesta,
      confianza: Math.min(100, confianza),
      tipo_mensaje: tipología,
      razonamiento: `Mensaje tipo "${tipología}" detectado. Confianza: ${confianza}%`,
    };
  } catch (err: any) {
    logger.error({ err, conversationId, tenantId }, "Error analizando mensaje WhatsApp");
    return {
      debe_responder: false,
      respuesta: null,
      confianza: 0,
      tipo_mensaje: "otro",
      razonamiento: `Error: ${err.message}`,
    };
  }
}

/**
 * Detecta el tipo de mensaje basado en palabras clave
 */
function detectarTipo(
  text: string
): "precio" | "producto" | "compra" | "horario" | "otro" {
  const precioPalabras = ["precio", "cuesta", "costo", "valor", "cuánto", "cuanto"];
  const productoPalabras = ["producto", "curso", "servicio", "que venden", "qué venden"];
  const compraPalabras = ["comprar", "pago", "pagar", "inscribir", "registro", "inscripcion"];
  const horarioPalabras = ["horario", "abierto", "cierra", "atención", "cuando atienden"];

  if (precioPalabras.some((p) => text.includes(p))) return "precio";
  if (productoPalabras.some((p) => text.includes(p))) return "producto";
  if (compraPalabras.some((p) => text.includes(p))) return "compra";
  if (horarioPalabras.some((p) => text.includes(p))) return "horario";
  return "otro";
}

/**
 * Genera respuesta para preguntas de precio
 */
function generarRespuestaPrecio(producto: any): string {
  const precio = Number(producto.price);
  const moneda = String(producto.currency || "COP");
  if (!Number.isFinite(precio) || precio <= 0) {
    return `Puedo confirmarte el precio de *${producto.name}*, pero ahora mismo no aparece cargado. Lo reviso y te confirmo. 😊`;
  }

  return `
💰 *Precio del ${producto.name}*

El valor es *$${precio.toLocaleString("es-CO")} ${moneda}*.

¿Querés que te muestre cómo comprarlo? 📲
  `.trim();
}

/**
 * Genera respuesta para preguntas de productos
 */
function generarRespuestaProducto(productos: any[]): string {
  const listaProductos = productos
    .map((p) => {
      const precio = Number(p.price);
      const valor = Number.isFinite(precio) && precio > 0
        ? `$${precio.toLocaleString("es-CO")} ${p.currency || "COP"}`
        : "precio por confirmar";
      return `• *${p.name}* — ${valor}`;
    })
    .join("\n");

  return `
🎓 *Nuestros Cursos*

${listaProductos}

¿Cuál te interesa? 💬
  `.trim();
}

/**
 * Genera respuesta para intención de compra
 */
function generarRespuestaCompra(): string {
  return `
🎉 *¡Excelente decisión!*

Para completar tu compra:

1️⃣ Confirma el producto que deseas
2️⃣ Elige tu método de pago (Nequi, Daviplata, Mercado Pago)
3️⃣ Realiza el pago
4️⃣ Recibirás el acceso al instante 🚀

¿Cuál prefieres? 💳
  `.trim();
}

/**
 * Genera respuesta para horarios
 */
