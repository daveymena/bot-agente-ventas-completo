/**
 * Sacarle el TEXTO a un documento para que Atlas lo pueda leer.
 *
 * Hasta ahora el chat solo aceptaba imágenes: un catálogo de proveedor en PDF,
 * una lista de precios en Excel o una propuesta en Word había que copiarlos y
 * pegarlos a mano. Pedido del admin: poder subirlos y que los analice.
 *
 * Lo que se puede y lo que no, medido y no prometido:
 *   - PDF, Word (.docx), Excel (.xlsx/.xls/.csv) y PowerPoint (.pptx): se
 *     extrae el texto real.
 *   - Imágenes: NO pasan por acá. Las lee un modelo con visión
 *     (lib/media-entrante.ts), que es otro camino distinto.
 *   - Video: no. Un modelo no "ve" un video; haría falta ffmpeg para sacarle
 *     fotogramas y audio. Si algún día hace falta, el atajo bueno es
 *     transcribir el audio, que ya se sabe hacer.
 *
 * Un PDF ESCANEADO (una foto dentro de un PDF) no tiene texto que extraer: se
 * avisa en vez de devolver vacío, porque un vacío silencioso parece que
 * funcionó.
 */
import { logger } from "./logger";

export interface DocumentoLeido {
  ok: boolean;
  texto: string;
  /** Qué se pudo leer, para decírselo al admin sin tecnicismos. */
  resumen: string;
  tipo: string;
}

/** Tope de texto que se le pasa al modelo. Un catálogo de 300 páginas no entra
 * en un prompt y además lo vuelve inútil: se corta y se avisa. */
const MAX_CARACTERES = 120_000;

function porExtension(nombre: string): string {
  const m = String(nombre || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1]! : "";
}

export async function leerDocumento(buffer: Buffer, nombre: string): Promise<DocumentoLeido> {
  const ext = porExtension(nombre);
  try {
    let texto = "";
    let tipo = ext;

    if (ext === "pdf") {
      // pdf-parse v2 expone una CLASE (PDFParse), no la función por defecto de
      // la v1: `(await import("pdf-parse")).default` no existe y falla al
      // compilar. Se instancia con el buffer y se le pide el texto.
      const { PDFParse } = (await import("pdf-parse")) as any;
      const lector = new PDFParse({ data: buffer });
      const datos = await lector.getText();
      texto = String(datos?.text || "").trim();
      tipo = "PDF";
      if (!texto) {
        return {
          ok: false,
          texto: "",
          tipo,
          resumen:
            "Ese PDF no tiene texto que se pueda extraer: probablemente sea un escaneo o una foto dentro de un PDF. " +
            "Si podés, mandame el archivo original o una captura de la página que te interesa y la leo como imagen.",
        };
      }
    } else if (ext === "docx") {
      const mammoth = await import("mammoth");
      const r = await (mammoth as any).extractRawText({ buffer });
      texto = String(r?.value || "").trim();
      tipo = "Word";
    } else if (ext === "xlsx" || ext === "xls" || ext === "csv") {
      const XLSX = await import("xlsx");
      const libro = (XLSX as any).read(buffer, { type: "buffer" });
      // Cada hoja como CSV: es el formato que un modelo lee mejor, porque
      // conserva filas y columnas sin el ruido del XML de Excel.
      const partes: string[] = [];
      for (const hoja of libro.SheetNames) {
        const csv = (XLSX as any).utils.sheet_to_csv(libro.Sheets[hoja]);
        if (csv.trim()) partes.push(`--- Hoja: ${hoja} ---\n${csv}`);
      }
      texto = partes.join("\n\n").trim();
      tipo = "Excel";
    } else if (ext === "pptx") {
      // Un .pptx es un zip de XML. No hace falta una librería dedicada: se
      // abre el zip y se sacan los textos de cada diapositiva.
      const JSZip = (await import("jszip")).default as any;
      const zip = await JSZip.loadAsync(buffer);
      const diapos = Object.keys(zip.files)
        .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
        .sort((a, b) => {
          const na = Number(a.match(/(\d+)/)?.[1] || 0);
          const nb = Number(b.match(/(\d+)/)?.[1] || 0);
          return na - nb;
        });
      const partes: string[] = [];
      for (let i = 0; i < diapos.length; i++) {
        const xml = await zip.files[diapos[i]!].async("string");
        // <a:t> son los nodos de texto de PowerPoint.
        const textos = Array.from(String(xml).matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)).map((m) => m[1]);
        const contenido = textos.join(" ").replace(/\s+/g, " ").trim();
        if (contenido) partes.push(`--- Diapositiva ${i + 1} ---\n${contenido}`);
      }
      texto = partes.join("\n\n").trim();
      tipo = "PowerPoint";
    } else if (ext === "txt" || ext === "md" || ext === "json") {
      texto = buffer.toString("utf8").trim();
      tipo = "texto";
    } else {
      return {
        ok: false,
        texto: "",
        tipo: ext || "desconocido",
        resumen: `No sé leer archivos ".${ext}". Puedo con PDF, Word, Excel, PowerPoint, texto e imágenes.`,
      };
    }

    if (!texto) {
      return { ok: false, texto: "", tipo, resumen: `El archivo ${tipo} vino vacío o no tiene texto legible.` };
    }

    const recortado = texto.length > MAX_CARACTERES;
    const final = recortado ? texto.slice(0, MAX_CARACTERES) : texto;
    return {
      ok: true,
      texto: final,
      tipo,
      resumen: recortado
        ? `Leí el ${tipo} "${nombre}" (${texto.length.toLocaleString("es-CO")} caracteres). Es muy largo, así que trabajo con la primera parte.`
        : `Leí el ${tipo} "${nombre}" (${texto.length.toLocaleString("es-CO")} caracteres).`,
    };
  } catch (err: any) {
    logger.warn({ err: err?.message, nombre }, "[Documentos] no se pudo leer el archivo");
    return {
      ok: false,
      texto: "",
      tipo: ext || "desconocido",
      resumen: `No pude abrir "${nombre}": ${err?.message || "archivo dañado o protegido"}.`,
    };
  }
}
