/**
 * ============================================================
 * CURADOR DE PRODUCTO: del crudo de Dropi a una ficha que vende
 * ============================================================
 *
 * Pedido del dueño (19-09-2026): "al extraer el producto de Dropi, la misma
 * IA se encarga de organizar la información y agregarla como producto
 * físico de dropshipping, con el copy formateado… con los modelos gratuitos
 * primero para no gastar DeepSeek; si la información está incompleta, que la
 * busque de otras tiendas y la traiga acá".
 *
 * Lo que llega de Dropi es lo que el proveedor escribió para el revendedor:
 * nombre en mayúsculas, HTML, "carga tus pedidos", teléfonos, precios
 * sugeridos. Esto lo convierte en lo que lee un comprador:
 *
 *   nombre comercial · descripción limpia (3-5 líneas) · 4-8 características
 *   con emoji · categoría · beneficio principal · copy corto para WhatsApp ·
 *   3 preguntas frecuentes · (si hubo que buscar) qué se complementó y de dónde
 *
 * Reglas duras: NADA que no esté en los datos (ni garantías, ni plazos, ni
 * "el más vendido"); lo complementado desde la web se marca. Fotos: solo las
 * de Dropi, deduplicadas por contenido; nunca de otras tiendas.
 */
import { logger } from "./logger";
import { ORDEN_GRATUITOS_PRIMERO, redactarConProveedores } from "./landing/agente-landing";
import { esLineaDeProveedor } from "./dropi";

export interface ProductoCrudo {
  id: number;
  nombre: string;
  descripcionHtml?: string | null;
  atributos?: any[];
  categoria?: string | null;
  proveedor?: string | null;
  bodegaCiudad?: string | null;
  costo?: number | null;
  precioSugerido?: number | null;
  stock?: number | null;
  variaciones?: Array<{ id?: number; attributes?: any; stock?: number }>;
}

export interface FichaCurada {
  nombre: string;
  descripcion: string;
  caracteristicas: string[];
  categoria: string;
  beneficioPrincipal: string;
  copyWhatsapp: string;
  preguntasFrecuentes: Array<{ p: string; r: string }>;
  complementadoDesde: string[];
  curadoPor?: string;
}

const SYSTEM = `Sos el curador de fichas de producto de una tienda de dropshipping en Colombia.
Recibís los datos crudos de un producto (los escribió el PROVEEDOR para revendedores) y, a veces, textos de otras tiendas que venden el mismo producto.
Devolvés SOLO un JSON con esta forma exacta:
{"nombre":"…","descripcion":"…","caracteristicas":["…"],"categoria":"…","beneficioPrincipal":"…","copyWhatsapp":"…","preguntasFrecuentes":[{"p":"…","r":"…"}],"complementadoDesde":["url"]}
Reglas:
- nombre: comercial, en mayúsculas y minúsculas normales, sin códigos internos (nada de "KZ", "CN", "x 200ml" salvo que sea la presentación real).
- descripcion: 3 a 5 líneas cortas para el COMPRADOR: qué es, para qué sirve, cómo se usa. Sin HTML, sin emojis, sin frases de proveedor ("carga tus pedidos", "precio sugerido", teléfonos, "dropshipping").
- caracteristicas: 4 a 8, cada una empieza con UN emoji y dice algo concreto (material, medidas, capacidad, qué incluye, para quién). Solo lo que esté en los datos o en las fuentes.
- categoria: una de: Salud y bienestar, Hogar, Cocina, Belleza, Deporte, Tecnología, Mascotas, Bebés y niños, Moda, Vehículos, Herramientas, Otros.
- beneficioPrincipal: una frase con el resultado que busca el comprador.
- copyWhatsapp: 2-3 líneas cálidas para presentar el producto por WhatsApp, sin precio.
- preguntasFrecuentes: 3, con respuestas basadas SOLO en los datos (si algo no está, no lo preguntes).
- complementadoDesde: las URLs de las fuentes que usaste de verdad; [] si no usaste ninguna.
PROHIBIDO: inventar garantías, plazos de entrega, descuentos, "el más vendido", testimonios, cifras de clientes, o datos técnicos que no aparezcan. Si un dato no está, no lo pongas.
Español de Colombia, ortografía y acentos perfectos.`;

function limpiarHtml(v: string | null | undefined): string {
  return String(v || "")
    .replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\s*li\b[^>]*>/gi, "\n• ").replace(/<\/(p|li|div|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n");
}

/** ¿Alcanza con lo de Dropi, o hay que salir a buscar? */
export function estaIncompleto(p: ProductoCrudo): boolean {
  const texto = limpiarHtml(p.descripcionHtml).split("\n").filter((l) => !esLineaDeProveedor(l)).join("\n");
  return texto.length < 200 || (p.atributos || []).length === 0 && !/material|medid|tama|capacidad|incluye|cm\b|ml\b|litro|kg\b/i.test(texto);
}

function extraerJson(t: string): any | null {
  const s = String(t || "");
  const bloque = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cand = (bloque ? bloque[1] : s).trim();
  const i = cand.indexOf("{"); const j = cand.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(cand.slice(i, j + 1)); } catch { return null; }
}

function valida(j: any): j is FichaCurada {
  return !!j && typeof j.nombre === "string" && j.nombre.trim().length > 3
    && typeof j.descripcion === "string" && j.descripcion.trim().length > 40
    && Array.isArray(j.caracteristicas) && j.caracteristicas.length >= 3;
}

/**
 * Cura el producto. Si falta información, busca en otras tiendas (texto)
 * y se lo pasa al modelo como fuentes. Devuelve null si ningún modelo
 * respondió algo válido (quien llama usa la limpieza básica de siempre).
 */
export async function curarProducto(tenantId: number, p: ProductoCrudo, opts: { buscarEnWeb?: boolean; timeoutMs?: number } = {}): Promise<FichaCurada | null> {
  const descripcion = limpiarHtml(p.descripcionHtml);
  let fuentes: Array<{ url: string; titulo: string; texto: string }> = [];
  const incompleto = estaIncompleto(p);
  if (incompleto && opts.buscarEnWeb !== false) {
    try {
      const { fuentesParaProducto } = await import("./buscar-en-la-web");
      fuentes = await fuentesParaProducto(p.nombre, 3);
      logger.info({ producto: p.id, fuentes: fuentes.map((f) => f.url) }, "[Curador] ficha incompleta: se buscó en otras tiendas");
    } catch (e: any) {
      logger.warn({ producto: p.id, err: e?.message }, "[Curador] no se pudo buscar en la web");
    }
  }

  const user = [
    `PRODUCTO CRUDO DE DROPI (id ${p.id})`,
    `Nombre: ${p.nombre}`,
    `Categoría del proveedor: ${p.categoria || "—"}`,
    `Proveedor: ${p.proveedor || "—"}${p.bodegaCiudad ? ` (despacha desde ${p.bodegaCiudad})` : ""}`,
    `Costo: ${p.costo ?? "—"} · Precio sugerido: ${p.precioSugerido ?? "—"} · Stock: ${p.stock ?? "—"}`,
    (p.atributos || []).length ? `Atributos: ${JSON.stringify(p.atributos).slice(0, 800)}` : "",
    (p.variaciones || []).length ? `Variaciones: ${JSON.stringify((p.variaciones || []).map((v) => v.attributes ?? v)).slice(0, 800)}` : "",
    `Descripción del proveedor:\n${descripcion.slice(0, 3000) || "(vacía)"}`,
    fuentes.length ? `\nFUENTES DE OTRAS TIENDAS (usá solo datos concretos y verificables; citá la URL en complementadoDesde):\n${fuentes.map((f, i) => `[${i + 1}] ${f.url}\n${f.texto.slice(0, 2500)}`).join("\n\n")}` : "",
    incompleto && !fuentes.length ? "\n(La información es escasa y no se encontraron fuentes: NO rellenes con suposiciones; hacé la ficha con lo que hay.)" : "",
  ].filter(Boolean).join("\n");

  const r = await redactarConProveedores({
    tenantId,
    system: SYSTEM,
    user,
    maxTokens: 1500,
    timeoutMs: opts.timeoutMs ?? 30_000,
    orden: ORDEN_GRATUITOS_PRIMERO,
    tarea: "curar-producto",
    validar: (t) => valida(extraerJson(t)),
  });
  if (!r.text) {
    logger.warn({ producto: p.id, error: r.error }, "[Curador] ningún modelo devolvió una ficha válida");
    return null;
  }
  const j = extraerJson(r.text) as FichaCurada;
  const ficha: FichaCurada = {
    nombre: String(j.nombre).trim().slice(0, 120),
    descripcion: String(j.descripcion).trim().slice(0, 1200),
    caracteristicas: j.caracteristicas.map((c: any) => String(c).trim()).filter(Boolean).slice(0, 8),
    categoria: String(j.categoria || p.categoria || "Otros").trim().slice(0, 60),
    beneficioPrincipal: String(j.beneficioPrincipal || "").trim().slice(0, 200),
    copyWhatsapp: String(j.copyWhatsapp || "").trim().slice(0, 500),
    preguntasFrecuentes: Array.isArray(j.preguntasFrecuentes) ? j.preguntasFrecuentes.filter((x: any) => x?.p && x?.r).slice(0, 3).map((x: any) => ({ p: String(x.p).slice(0, 160), r: String(x.r).slice(0, 300) })) : [],
    complementadoDesde: Array.isArray(j.complementadoDesde) ? j.complementadoDesde.filter((u: any) => typeof u === "string" && /^https?:/i.test(u)).slice(0, 3) : [],
    curadoPor: r.proveedor ? `${r.proveedor}/${r.modelo}` : undefined,
  };
  // Nada de garantías/plazos inventados, venga de donde venga.
  const prohibido = /garant[ií]a|devoluci[oó]n|reembolso|d[ií]as h[aá]biles|env[ií]o gratis|el m[aá]s vendido|\d+\s*clientes/i;
  ficha.caracteristicas = ficha.caracteristicas.filter((c) => !prohibido.test(c));
  ficha.preguntasFrecuentes = ficha.preguntasFrecuentes.filter((f) => !prohibido.test(f.r));
  ficha.descripcion = ficha.descripcion.split("\n").filter((l) => !prohibido.test(l)).join("\n").trim() || ficha.descripcion;
  return ficha;
}
