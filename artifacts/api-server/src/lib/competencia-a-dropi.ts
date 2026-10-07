/**
 * Página de la COMPETENCIA → el mismo producto en DROPI.
 *
 * Pedido del dueño (06-10): "si la extrae de otro negocio debe adaptarla a
 * nuestro negocio y nuestros productos… pero también extraer el producto, ya
 * que muchos de ellos se encuentran en Dropi". Flujo:
 *   1. Forge lee la ficha de la otra tienda (nombre, fotos, características).
 *   2. Se arman consultas SIN su marca ("Almohada Baby Koala Antiplagiocefalia"
 *      → "almohada antiplagiocefalia", "almohada bebe", …) y se busca en el
 *      catálogo de Dropi con el token del negocio.
 *   3. Los candidatos se ordenan por coincidencia de texto y stock, y los
 *      mejores se confirman con VISIÓN contra la foto de la competencia.
 * Importar y crear la landing quedan en manos del dueño (dropi_importar +
 * landing_forge_crear con la URL de la competencia como REFERENCIA).
 */
import { logger } from "./logger";

const STOP = new Set(
  ("de del la las el los un una unos unas y o para por con sin en a al tu su sus mi " +
    "nuevo nueva original oferta envio gratis promo promocion pack kit set unidad unidades " +
    "x pcs pieza piezas color colores talla tallas cm mm ml kg gr g premium pro plus max mini " +
    "the and for with of").split(/\s+/),
);

const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function palabrasClave(texto: string, marcas: string[] = []): string[] {
  const fuera = new Set(marcas.flatMap((m) => norm(m).split(/[^a-z0-9]+/)).filter(Boolean));
  const compactas = marcas.map((m) => norm(m).replace(/[^a-z0-9]/g, "")).filter((m) => m.length >= 3);
  return norm(texto)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !fuera.has(w) && !/^\d+$/.test(w))
    // "baby" y "koala" salen si la marca es "babykoala" (dominio sin espacios)
    .filter((w) => !compactas.some((c) => c === w || (w.length >= 4 && c.includes(w))))
    .filter((w, i, a) => a.indexOf(w) === i);
}

/** Consultas de más específica a más amplia (Dropi busca por subcadena). */
export function consultasParaDropi(nombre: string, marcas: string[] = []): string[] {
  const p = palabrasClave(nombre, marcas).slice(0, 4);
  const out = [p.slice(0, 2).join(" "), p[0] && p[2] ? `${p[0]} ${p[2]}` : "", p[0] || "", p[1] || ""]
    .map((q) => q.trim())
    .filter((q) => q.length >= 3);
  return [...new Set(out)];
}

/** Qué fracción de las palabras clave de la competencia aparece en el candidato. */
export function coincidenciaTexto(claveCompetencia: string[], nombreCandidato: string): number {
  if (!claveCompetencia.length) return 0;
  const c = new Set(palabrasClave(nombreCandidato));
  const hits = claveCompetencia.filter((w) => c.has(w) || [...c].some((x) => x.length >= 5 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5)))));
  return Math.round((hits.length / claveCompetencia.length) * 100) / 100;
}

function mimeDe(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.slice(0, 4).toString("hex") === "89504e47") return "image/png";
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.slice(0, 3).toString() === "GIF") return "image/gif";
  return null;
}

async function bajarImagen(url: string): Promise<{ b64: string; mime: string } | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const mime = buf.length > 2000 && buf.length < 12_000_000 ? mimeDe(buf) : null;
    return mime ? { b64: buf.toString("base64"), mime } : null;
  } catch {
    return null;
  }
}

/** ¿Es el mismo producto? Ignora textos, logos y fondos: las fotos de las
 *  tiendas y de Dropi casi siempre traen rótulos (la comparación estricta de
 *  activos-fabricante los rechaza a propósito, acá no sirve). */
export async function mismoDisenio(fotoCompetencia: string, fotoDropi: string): Promise<{ si: boolean | null; motivo: string }> {
  const [a, b] = await Promise.all([bajarImagen(fotoCompetencia), bajarImagen(fotoDropi)]);
  if (!a || !b) return { si: null, motivo: "no se pudo bajar alguna de las fotos" };
  const { modelosDeVision, opcionesDeVision } = await import("./media-entrante");
  const { getProviderConfig, sanearParamsIA } = await import("@workspace/integrations-openai-ai-server");
  const pregunta =
    "Imagen 1: producto de una tienda. Imagen 2: producto de un proveedor. Respondé en español.\n" +
    "IGNORÁ textos, logos, marcas de agua, precios, fondo, modelo/persona y ángulo.\n" +
    "Fijate SOLO en el objeto: forma, material, partes y mecanismo. Una variante de color del MISMO diseño cuenta como el mismo.\n" +
    "Formato: DIFERENCIAS: ... | VEREDICTO: SI (mismo producto) o NO";
  for (const { proveedor, modelo } of modelosDeVision()) {
    const cfg = getProviderConfig(proveedor as any);
    if (!cfg?.apiKey) continue;
    try {
      const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(sanearParamsIA(modelo, {
          model: modelo,
          max_tokens: 250,
          ...opcionesDeVision(proveedor),
          messages: [{ role: "user", content: [
            { type: "text", text: pregunta },
            { type: "image_url", image_url: { url: `data:${a.mime};base64,${a.b64}` } },
            { type: "image_url", image_url: { url: `data:${b.mime};base64,${b.b64}` } },
          ] }],
        })),
        signal: AbortSignal.timeout(60_000),
      });
      if (!r.ok) continue;
      const j: any = await r.json();
      const t = String(j?.choices?.[0]?.message?.content || "").trim();
      if (!t) continue;
      const m = t.match(/VEREDICTO[\s:：*_]*(S[IÍ]|NO)(?![A-Za-zÁÉÍÓÚáéíóú])/i);
      if (!m) continue;
      return { si: /^S/i.test(m[1]!), motivo: t.slice(0, 200) };
    } catch (e: any) {
      logger.warn({ proveedor, modelo, err: e?.message }, "[Competencia→Dropi] visión falló");
    }
  }
  return { si: null, motivo: "ningún modelo de visión respondió" };
}

export interface CandidatoDropi {
  id: number;
  nombre: string;
  costo: number | null;
  precioSugerido: number | null;
  margenPct: number | null;
  stock: number | null;
  proveedor: string | null;
  foto: string | null;
  texto: number;
  vision: boolean | null;
  motivo?: string;
}

export interface ResultadoCompetencia {
  ok: boolean;
  error?: string;
  ficha?: { nombre: string; precio: number; moneda: string; host: string; foto: string | null; marcas: string[] };
  consultas?: string[];
  candidatos?: CandidatoDropi[];
}

export async function buscarEnDropiDesdeCompetencia(
  tenantId: number,
  url: string,
  opts: { navegador?: boolean; verificarConFotos?: number } = {},
): Promise<ResultadoCompetencia> {
  const { extraerFichaForge } = await import("./landingforge-client");
  const { tokenDropiDelTenant, estadoTokenDropi, mensajeTokenDropi, buscarProductosDropi, resumenProductoDropi } = await import("./dropi-directo");

  const token = await tokenDropiDelTenant(tenantId);
  if (!token) return { ok: false, error: mensajeTokenDropi(await estadoTokenDropi(tenantId)) };

  let ex = await extraerFichaForge(url, !!opts.navegador);
  // Sin nombre o sin fotos, la página cargaba por JS: segundo intento con navegador real.
  if (!opts.navegador && (!ex.ok || !ex.product?.name || !ex.product?.images?.length)) ex = await extraerFichaForge(url, true);
  if (!ex.ok || !ex.product?.name) return { ok: false, error: `No pude leer esa página: ${ex.error || "sin nombre de producto"}` };

  const p = ex.product;
  const host = String(p.host || "").replace(/^www\./, "");
  const etiqueta = host.split(".")[0] || "";
  const marcas = [p.brand, etiqueta].filter((m: any) => typeof m === "string" && m.trim().length >= 3);
  const consultas = consultasParaDropi(p.name, marcas);
  if (!consultas.length) return { ok: false, error: `No saqué palabras clave de "${p.name}".` };
  const clave = palabrasClave([p.name, ...(p.bullets || []).slice(0, 3)].join(" "), marcas).slice(0, 8);

  const vistos = new Map<number, CandidatoDropi>();
  for (const q of consultas) {
    const r = await buscarProductosDropi(token, { q, porPagina: 30 });
    if (!r.ok) {
      if (!vistos.size) return { ok: false, error: `Dropi no respondió: ${r.error}` };
      break;
    }
    for (const prod of r.data || []) {
      const s = resumenProductoDropi(prod);
      if (!s.id || vistos.has(s.id)) continue;
      vistos.set(s.id, { ...s, texto: coincidenciaTexto(clave, s.nombre), vision: null });
    }
    if (vistos.size >= 40) break;
  }

  // Texto primero, con stock por delante a igual coincidencia.
  const orden = [...vistos.values()].sort(
    (a, b) => b.texto - a.texto || Number((b.stock ?? 0) > 0) - Number((a.stock ?? 0) > 0) || (b.stock ?? 0) - (a.stock ?? 0),
  );

  const fotoComp = Array.isArray(p.images) && p.images[0] ? String(p.images[0]) : null;
  const n = Math.max(0, Math.min(opts.verificarConFotos ?? 5, 8));
  if (fotoComp && n) {
    for (const c of orden.slice(0, n)) {
      if (!c.foto) continue;
      const v = await mismoDisenio(fotoComp, c.foto);
      c.vision = v.si;
      c.motivo = v.motivo;
    }
    // Confirmados por foto arriba; descartados por foto al fondo.
    const peso = (c: CandidatoDropi) => (c.vision === true ? 2 : c.vision === null ? 1 : 0);
    orden.sort((a, b) => peso(b) - peso(a) || b.texto - a.texto);
  }

  return {
    ok: true,
    ficha: { nombre: String(p.name), precio: Number(p.price) || 0, moneda: String(p.currency || "COP"), host, foto: fotoComp, marcas },
    consultas,
    candidatos: orden.slice(0, 10),
  };
}
