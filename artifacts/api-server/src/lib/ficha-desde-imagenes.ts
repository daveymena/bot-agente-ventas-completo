/**
 * Ficha de un producto físico a partir de SUS imágenes.
 *
 * Los productos de dropshipping llegan por Dropify → WooCommerce → acá sin
 * descripción (el bolso antirrobo tenía como descripción su propio título,
 * 12-09-2026). La API de Dropi rechaza nuestro token por diseño, así que de
 * ahí no se puede leer. Pero cada producto trae las imágenes reales del
 * proveedor, y en dropshipping esas imágenes son casi siempre infografías con
 * las características escritas encima: medidas, material, capacidad, usos.
 *
 * Esa es la única fuente que COINCIDE con el mismo producto. Buscar el nombre
 * en internet devuelve un producto parecido de otro vendedor, y dejar que el
 * modelo "complete" produce lo que pasó con el bolso: cierres de seguridad y
 * compartimentos ocultos que nadie verificó.
 *
 * Regla: solo lo que se ve o está escrito en las imágenes. Lo que no se ve,
 * se lista como "no se pudo confirmar" y no entra a la ficha.
 */
import { getProviderConfig } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";
import { modelosDeVision, visionDisponible } from "./media-entrante";

export interface FichaDesdeImagenes {
  descripcion: string;
  caracteristicas: string[];
  noSePudoConfirmar: string[];
  /** Cuántas imágenes se leyeron y con qué modelo: para decirlo, no para adornar. */
  imagenesLeidas: number;
  modelo: string;
}

import { fotosDelProducto } from "./fotos-de-producto";

const MAX_IMAGENES = 5;
const MAX_BYTES = 4 * 1024 * 1024;

/** URLs de imagen que este producto tiene de verdad (las del proveedor primero). */
export function imagenesDelProducto(p: { imageUrl?: string | null; metadata?: unknown }, appUrl: string): string[] {
  // Una sola lista para todo el sistema (galería del dueño + Dropi/Woo + principal).
  return fotosDelProducto(p, appUrl, MAX_IMAGENES);
}

function safeJson(s: string): any { try { return JSON.parse(s); } catch { return null; } }

async function bajar(url: string): Promise<{ b64: string; mime: string } | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const mime = (r.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!mime.startsWith("image/")) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) return null;
    return { b64: buf.toString("base64"), mime };
  } catch {
    return null;
  }
}

/** ¿La descripción que tiene sirve, o es el título repetido / nada? */
export function descripcionVacia(p: { name?: string | null; description?: string | null }): boolean {
  const d = String(p.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const n = String(p.name || "").replace(/\s+/g, " ").trim().toLowerCase();
  return !d || d === n || d.length < 25 || /^\d+$/.test(d);
}

const INSTRUCCION = [
  "Sos el redactor de fichas de una tienda. Estas son las imágenes REALES de un producto físico.",
  "Escribí en español, para WhatsApp, SOLO lo que se ve o está escrito en las imágenes.",
  "Prohibido inventar: nada de garantías, materiales, medidas, capacidades ni usos que no aparezcan escritos o sean evidentes en la foto.",
  "Devolvé ÚNICAMENTE un JSON con esta forma:",
  '{"descripcion": "2 o 3 frases, qué es y para qué sirve, sin adjetivos vacíos", "caracteristicas": ["hasta 6, cortas, una por dato visible o escrito (medida, material, capacidad, color, qué incluye)"], "noSePudoConfirmar": ["lo que un cliente preguntaría y NO se ve en las imágenes"]}',
].join("\n");

export async function fichaDesdeImagenes(
  producto: { id: number; name: string; imageUrl?: string | null; metadata?: unknown },
  appUrl: string,
): Promise<FichaDesdeImagenes | { error: string }> {
  const disponible = visionDisponible();
  if (!disponible.hay) return { error: "Ningún modelo de visión tiene clave: no se pueden leer las imágenes." };

  const urls = imagenesDelProducto(producto, appUrl);
  if (urls.length === 0) return { error: "El producto no tiene imágenes de las que leer." };

  const bajadas = (await Promise.all(urls.map(bajar))).filter((x): x is { b64: string; mime: string } => !!x);
  if (bajadas.length === 0) return { error: "No se pudo descargar ninguna imagen del producto." };

  for (const { proveedor, modelo } of modelosDeVision()) {
    const cfg = getProviderConfig(proveedor);
    if (!cfg?.apiKey) continue;
    try {
      const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: modelo,
          temperature: 0.1,
          max_tokens: 700,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: `${INSTRUCCION}\n\nNombre del producto en el catálogo: "${producto.name}".` },
              ...bajadas.map((b) => ({ type: "image_url", image_url: { url: `data:${b.mime};base64,${b.b64}` } })),
            ],
          }],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!r.ok) {
        logger.warn({ proveedor, modelo, status: r.status }, "[FichaImagenes] el modelo rechazó el pedido");
        continue;
      }
      const j: any = await r.json();
      const texto = String(j?.choices?.[0]?.message?.content || "");
      const json = texto.match(/\{[\s\S]*\}/)?.[0];
      const parsed = json ? safeJson(json) : null;
      if (!parsed || typeof parsed.descripcion !== "string") {
        logger.warn({ proveedor, modelo, texto: texto.slice(0, 200) }, "[FichaImagenes] respuesta sin JSON válido");
        continue;
      }
      const lista = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 6) : []);
      return {
        descripcion: parsed.descripcion.trim(),
        caracteristicas: lista(parsed.caracteristicas),
        noSePudoConfirmar: lista(parsed.noSePudoConfirmar),
        imagenesLeidas: bajadas.length,
        modelo: `${proveedor}/${modelo}`,
      };
    } catch (e: any) {
      logger.warn({ proveedor, modelo, err: e?.message }, "[FichaImagenes] falló el modelo, se prueba el siguiente");
    }
  }
  return { error: "Ningún modelo de visión pudo leer las imágenes." };
}
