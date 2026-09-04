/**
 * ENTREGA CON CLAVE, UNA POR CLIENTE.
 *
 * Pedido del admin: que lo que se le entrega al cliente vaya con su clave.
 *
 * Lo primero, porque cambia el diseño: **una clave fija por producto no sirve
 * para nada**. El bot manda el enlace y la clave en el mismo mensaje de
 * WhatsApp, así que quien reenvíe ese mensaje reenvía las dos cosas. Es un
 * candado con la llave pegada en la puerta.
 *
 * Lo que sí sirve es una clave DISTINTA por comprador:
 *  · Si el curso aparece circulando, se sabe de qué venta salió.
 *  · Se puede anular el enlace de UNO sin tocar a los demás.
 *  · Y al comprador le llega algo que se ve hecho para él.
 *
 * Comprobado contra la cuenta real el 2026-08-24: `shareSet` con clave
 * devuelve un enlace que redirige a `/sharing/init` (la página que pide el
 * código) y NO muestra el contenido. Sin clave iba directo a `/sharing/link`
 * y se veía todo.
 *
 * ── El riesgo que introduce, y cómo se contiene ───────────────────────────
 * Generar el enlace en el momento del pago hace que la entrega dependa de que
 * Terabox responda JUSTO cuando el cliente acaba de pagar -- el peor momento
 * para fallar. Hoy el enlace fijo no tiene esa dependencia.
 *
 * Por eso `prepararEntrega` SIEMPRE cae al enlace fijo del producto si algo
 * falla (cookie vencida, Terabox caído, producto sin ruta cargada). El cliente
 * recibe su acceso igual; se pierde la clave personal, no la venta.
 */
import { logger } from "./logger";

/**
 * Alfabeto sin caracteres que se confunden al dictarlos o copiarlos: nada de
 * 0/O, 1/l/I. La clave se lee por WhatsApp y se teclea a mano.
 */
const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";

/** Terabox acepta exactamente 4 caracteres. */
export function generarClaveDeEntrega(azar: () => number = Math.random): string {
  let clave = "";
  for (let i = 0; i < 4; i++) {
    clave += ALFABETO[Math.floor(azar() * ALFABETO.length)];
  }
  return clave;
}

export interface ResultadoEntrega {
  url: string;
  /** null cuando se cayó al enlace fijo: ese no tiene clave. */
  clave: string | null;
  /** De dónde salió, para poder auditarlo después. */
  origen: "personalizada" | "fija";
  /** Por qué se cayó al fijo, si se cayó. */
  motivo?: string;
}

export interface ProductoParaEntregar {
  id: number;
  name: string;
  /** El enlace fijo de siempre. Es el respaldo. */
  deliveryLink?: string | null;
  /** Ruta en Terabox, ej. "/INGLES_TOTAL...". Sale de metadata.teraboxPath. */
  teraboxPath?: string | null;
}

/**
 * Devuelve el acceso que se le manda a ESTE comprador.
 *
 * `crearShare` se inyecta para poder probar los caminos sin tocar Terabox.
 */
export async function prepararEntrega(
  producto: ProductoParaEntregar,
  opciones: {
    crearShare?: (paths: string[], clave: string) => Promise<{ shorturl: string }>;
    azar?: () => number;
  } = {},
): Promise<ResultadoEntrega | null> {
  const fijo = String(producto.deliveryLink || "").trim();
  const ruta = String(producto.teraboxPath || "").trim();

  const alFijo = (motivo: string): ResultadoEntrega | null => {
    if (!fijo) {
      // Ni personalizada ni fija: no hay nada que entregar. Se devuelve null
      // para que quien llama avise, en vez de mandar un mensaje sin enlace.
      logger.error({ productId: producto.id, motivo }, "[Entrega] Sin enlace de entrega para el producto");
      return null;
    }
    return { url: fijo, clave: null, origen: "fija", motivo };
  };

  if (!ruta) return alFijo("el producto no tiene cargada su ruta de Terabox");

  const crear = opciones.crearShare
    ?? (async (paths: string[], clave: string) => {
      const { crearLinkTerabox } = await import("./terabox");
      return crearLinkTerabox(paths, clave, 0);
    });

  const clave = generarClaveDeEntrega(opciones.azar);
  try {
    const r = await crear([ruta], clave);
    const url = String(r?.shorturl || "").trim();
    if (!url) return alFijo("Terabox no devolvió enlace");
    return { url, clave, origen: "personalizada" };
  } catch (e: any) {
    // La cookie `ndus` de Terabox vence en días. Cuando pase, esto se llena de
    // estas líneas y hay que renovarla -- pero la venta no se cae.
    return alFijo(`Terabox falló: ${e?.message || e}`);
  }
}

/** El texto del acceso, listo para el mensaje de WhatsApp. */
export function textoDeEntrega(e: ResultadoEntrega): string {
  if (!e.clave) return `🚀 ${e.url}`;
  return `🚀 ${e.url}\n🔑 Tu clave de acceso: *${e.clave}*\n\n(La pide al abrir el enlace. Es tuya, no la compartas.)`;
}
