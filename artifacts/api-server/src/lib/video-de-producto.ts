/**
 * El video de muestra de un producto.
 *
 * Por qué existe este archivo y no son tres líneas sueltas:
 *
 * 1. El agente YA sabía mandar video. `lib/whatsapp.ts` lo lee en dos lugares
 *    (la ficha completa y la sección "video" del cierre) desde el 26/08. Pero
 *    medido en producción el 2026-08-29: de 84 productos activos, **0** tenían
 *    el dato cargado. La capacidad estaba; el dato no llegaba nunca. Es el
 *    mismo patrón que ya apareció con el objetivo del anuncio, con el
 *    targeting y con monitoring.ts: código correcto que nadie podía alimentar
 *    porque no había por dónde.
 *
 * 2. El acceso estaba escrito dos veces (`meta.videoIntro || meta.videoUrl`).
 *    Duplicar un accessor es cómo se llega a que un lado soporte un campo y el
 *    otro no. Acá vive una sola vez.
 *
 * El video se guarda como ENLACE, no como archivo, y eso es deliberado: la
 * presentación del curso de piano pesa 118 MB y WhatsApp corta en 16 MB. El
 * enlace abre el reproductor en el celular y el chat le arma miniatura.
 */

/** El metadata del producto viene como TEXT en la base y como objeto en memoria. */
export function leerMetadata(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, any>;
  if (typeof raw !== "string") return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/**
 * El enlace del video de ESTE producto, o "" si no tiene.
 *
 * `videoUrl` se acepta además de `videoIntro` porque hay filas cargadas a mano
 * desde el panel con ese nombre. Un alias es más barato que una migración.
 */
export function videoDeProducto(metadata: unknown): string {
  const meta = leerMetadata(metadata);
  return String(meta.videoIntro || meta.videoUrl || "").trim();
}

export type EnlaceDeVideo =
  | { ok: true; url: string; fuente: string; nota?: string }
  | { ok: false; motivo: string };

/**
 * Deja el enlace en la forma que de verdad REPRODUCE en un celular.
 *
 * El caso que importa es Drive, que es donde el admin tiene los videos. Ahí
 * hay una trampa: `uc?export=download` sirve para imágenes (así lo usa
 * `set_product_image`) pero con un video pesado Drive devuelve la pantalla de
 * "no se pudo analizar en busca de virus" en vez del archivo. El cliente hace
 * clic esperando una clase y recibe una advertencia de seguridad.
 *
 * `/file/d/<id>/view` abre el reproductor y WhatsApp le arma la vista previa.
 * Es la única forma de un enlace de Drive que se puede mandar a un cliente.
 */
export function normalizarEnlaceDeVideo(entrada: string): EnlaceDeVideo {
  const url = String(entrada || "").trim();
  if (!url) return { ok: false, motivo: "El enlace viene vacío." };
  if (!/^https:\/\//i.test(url)) {
    return {
      ok: false,
      motivo: /^http:\/\//i.test(url)
        ? "El enlace es http, no https. WhatsApp no le arma vista previa a un enlace inseguro y muchos celulares directamente lo bloquean."
        : "Eso no es una URL. Tiene que empezar por https://",
    };
  }

  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return { ok: false, motivo: "La URL está mal formada." }; }

  const idDrive = url.match(/\/file\/d\/([\w-]+)/)?.[1] || url.match(/[?&]id=([\w-]+)/)?.[1];
  if (/(^|\.)drive\.google\.com$/.test(host)) {
    if (!idDrive) {
      return {
        ok: false,
        motivo:
          "Ese enlace de Drive no apunta a un archivo. Si es una CARPETA, el cliente ve un listado y tiene que buscar cuál abrir: " +
          "entrá a la carpeta, abrí el video, y copiá el enlace de ESE archivo.",
      };
    }
    return {
      ok: true,
      url: `https://drive.google.com/file/d/${idDrive}/view`,
      fuente: "Google Drive",
      nota: "Convertido al enlace del reproductor. El de descarga directa (uc?export=download) le muestra al cliente la advertencia de virus de Drive en vez del video.",
    };
  }

  // YouTube: el `youtu.be/ID` y el `watch?v=ID` ya reproducen y ya generan
  // miniatura en WhatsApp. No hay nada que arreglar.
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return { ok: true, url, fuente: "YouTube" };
  if (/(^|\.)vimeo\.com$/.test(host)) return { ok: true, url, fuente: "Vimeo" };
  if (/(^|\.)cloudinary\.com$/.test(host)) return { ok: true, url, fuente: "Cloudinary" };
  if (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)) return { ok: true, url, fuente: "archivo de video directo" };

  // Cualquier otro host se acepta: el admin puede tener el video en su propio
  // servidor, en Loom, en Wistia o donde sea. Lo que NO se hace es asumir que
  // funciona -- de eso se encarga la comprobación de alcance en el tool.
  return { ok: true, url, fuente: host };
}
