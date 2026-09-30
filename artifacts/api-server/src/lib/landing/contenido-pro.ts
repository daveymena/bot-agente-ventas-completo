/**
 * Textos de la landing PRO (ver renderer-pro.ts).
 *
 * El modelo escribe SOLO el contenido, en JSON; el diseño lo pone la
 * plantilla. Así una landing no depende de que el modelo "se acuerde" del
 * diseño móvil, de no repetir fotos o de no escribir "El problema" como
 * rótulo (30-09-2026: las tres cosas fallaban con el HTML libre).
 *
 * Si el modelo no responde o devuelve algo inservible, se arma el contenido
 * con los datos del producto: la landing sale igual, más sobria.
 */
import { NOMBRES_DE_ICONOS, type ContenidoPro } from "./renderer-pro";

export interface ProductoParaContenido {
  name: string;
  description?: string | null;
  features?: string[] | null;
  price?: number | string | null;
  category?: string | null;
}

export function sistemaContenidoPro(): string {
  return `Sos redactor de landings de productos que se venden por anuncios en Colombia, con pago contra entrega. Escribís en español neutro de Colombia, frases cortas, sin adjetivos vacíos ("increíble", "premium", "único").
Devolvé SOLO un objeto JSON válido, sin texto antes ni después, con esta forma exacta:
{"chip":"3-5 palabras con el dato más útil (ej. 'Talla única ajustable')",
 "titulo":"titular de beneficio, 3-6 palabras, sin el nombre del producto",
 "tituloResaltado":"1-3 palabras que completan el titular y se resaltan",
 "lead":"1-2 frases: qué es (con el NOMBRE EXACTO del producto) y qué resuelve",
 "bullets":["3 beneficios concretos, 3-8 palabras cada uno"],
 "cta":"botón en primera persona, 2-4 palabras (ej. 'Lo quiero')",
 "problema":{"eyebrow":"frase corta que conecta (ej. '¿Te suena familiar?')","titulo":"el dolor o la situación, 5-10 palabras","texto":"2 frases: el problema y cómo este producto lo resuelve"},
 "beneficios":[{"icono":"uno de: ${NOMBRES_DE_ICONOS.join(", ")}","titulo":"2-3 palabras","texto":"una línea"}],
 "pasos":[{"titulo":"3-5 palabras","texto":"una línea"}],
 "faq":[{"p":"pregunta real de un comprador","r":"respuesta de 1-2 frases"}]}
REGLAS:
- 4 beneficios, 3 pasos, 3 a 4 preguntas.
- Los pasos son CÓMO SE USA el producto; si los datos no lo dicen, son cómo se compra: pedir → recibir en casa → pagar al recibir.
- Solo hechos que estén en los datos. PROHIBIDO inventar: medidas, materiales, tiempos de resultado ("en 14 días"), porcentajes, estrellas, reseñas, testimonios, descuentos, stock, garantías o plazos de envío.
- "eyebrow" nunca es el nombre de la técnica (Problema, Solución, Atención, Interés, Deseo, Acción).
- Una pregunta del FAQ es sobre el pago contra entrega: "Pagas en efectivo cuando lo recibes en tu casa."`;
}

export function pedidoContenidoPro(p: ProductoParaContenido, extra: { garantia?: string | null; plazoEntrega?: string | null } = {}): string {
  return JSON.stringify({
    producto: {
      nombre: p.name,
      precio: Number(p.price) || null,
      categoria: p.category || null,
      descripcion: String(p.description || "").slice(0, 1800),
      caracteristicas: (p.features || []).slice(0, 12),
    },
    hechos_del_negocio: {
      pago: "contra entrega",
      plazo_de_entrega: extra.plazoEntrega || "NO definido: no lo menciones",
      garantia: extra.garantia || "NO definida: no la menciones",
    },
  });
}

const texto = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const ROTULO_METODO = /^(el |la )?(problema|soluci[oó]n|atenci[oó]n|inter[eé]s|deseo|acci[oó]n)\s*[:.]?$/i;

/** Del texto del modelo al contenido; lo que falte se completa con el producto. */
export function contenidoDesdeRespuesta(raw: string, p: ProductoParaContenido): ContenidoPro {
  let j: any = null;
  try {
    const s = String(raw || "");
    const desde = s.indexOf("{"), hasta = s.lastIndexOf("}");
    if (desde >= 0 && hasta > desde) j = JSON.parse(s.slice(desde, hasta + 1));
  } catch { j = null; }
  const base = contenidoDeRespaldo(p);
  if (!j || typeof j !== "object") return base;

  const lista = <T,>(v: unknown, fn: (x: any) => T | null, min: number, max: number, respaldo: T[]): T[] => {
    const xs = (Array.isArray(v) ? v : []).map(fn).filter(Boolean) as T[];
    return xs.length >= min ? xs.slice(0, max) : respaldo;
  };
  const eyebrow = texto(j.problema?.eyebrow, 40);
  return {
    chip: texto(j.chip, 40) || base.chip,
    titulo: texto(j.titulo, 60) || base.titulo,
    tituloResaltado: texto(j.tituloResaltado, 40) || base.tituloResaltado,
    lead: texto(j.lead, 260) || base.lead,
    bullets: lista(j.bullets, (x) => texto(x, 70) || null, 2, 3, base.bullets),
    cta: texto(j.cta, 28) || base.cta,
    problema: {
      eyebrow: eyebrow && !ROTULO_METODO.test(eyebrow) ? eyebrow : base.problema.eyebrow,
      titulo: texto(j.problema?.titulo, 90) || base.problema.titulo,
      texto: texto(j.problema?.texto, 320) || base.problema.texto,
    },
    beneficios: lista(j.beneficios, (x) => (texto(x?.titulo, 40) ? { icono: NOMBRES_DE_ICONOS.includes(String(x?.icono)) ? String(x.icono) : "check", titulo: texto(x.titulo, 40), texto: texto(x?.texto, 90) } : null), 2, 4, base.beneficios),
    pasos: lista(j.pasos, (x) => (texto(x?.titulo, 50) ? { titulo: texto(x.titulo, 50), texto: texto(x?.texto, 110) } : null), 2, 3, base.pasos),
    faq: lista(j.faq, (x) => (texto(x?.p, 120) && texto(x?.r, 1) ? { p: texto(x.p, 120), r: texto(x.r, 280) } : null), 2, 5, base.faq),
  };
}

/** Contenido armado solo con los datos del producto (sin modelo). */
export function contenidoDeRespaldo(p: ProductoParaContenido): ContenidoPro {
  const feats = (p.features || []).map((f) => texto(String(f).replace(/^[^\p{L}\p{N}]+/u, ""), 70)).filter(Boolean);
  const desc = texto(p.description, 600);
  const primeraFrase = desc.split(/(?<=[.!?])\s/)[0] || "";
  return {
    chip: "Pago contra entrega",
    titulo: "Pídelo hoy y",
    tituloResaltado: "págalo al recibir",
    lead: `${p.name}${primeraFrase ? `: ${primeraFrase}` : ""}`.slice(0, 260),
    bullets: feats.length ? feats.slice(0, 3) : ["Envío a domicilio", "Pagas cuando lo recibes", "Te confirmamos por WhatsApp"],
    cta: "Lo quiero",
    problema: { eyebrow: "Por qué elegirlo", titulo: p.name, texto: desc.slice(0, 320) || `Conoce ${p.name}.` },
    beneficios: (feats.length ? feats : ["Envío a domicilio", "Pago contra entrega", "Compra segura", "Atención por WhatsApp"]).slice(0, 4).map((f, i) => ({ icono: ["sparkle", "check", "box", "chat"][i] || "check", titulo: f.split(/\s+/).slice(0, 3).join(" "), texto: f })),
    pasos: [
      { titulo: "Haz tu pedido", texto: "Deja tus datos en el formulario." },
      { titulo: "Lo recibes en casa", texto: "Te lo enviamos a tu dirección." },
      { titulo: "Pagas al recibir", texto: "En efectivo, cuando lo tengas en tus manos." },
    ],
    faq: [
      { p: "¿Cómo funciona el pago contra entrega?", r: "Pagas en efectivo cuando recibes el producto en tu casa." },
      { p: "¿Cómo sé que mi pedido quedó registrado?", r: "Te confirmamos por WhatsApp antes de despacharlo." },
    ],
  };
}
