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

export type TipoPro = "fisico" | "digital" | "servicio";
const CIERRE: Record<TipoPro, string> = {
  fisico: "producto físico que se envía; se paga contra entrega",
  digital: "producto DIGITAL (curso, ebook, plantilla): se paga en línea y se recibe el acceso; no hay envío ni contra entrega",
  servicio: "SERVICIO: se agenda por WhatsApp; no hay envío ni contra entrega",
};

export function sistemaContenidoPro(tipo: TipoPro = "fisico"): string {
  return `Eres redactor de landings que se venden por anuncios en Colombia. Esto es un ${CIERRE[tipo]}. Escribes en español de Colombia y TUTEAS al cliente (tú: "lleva", "pide", "recibes"; nunca vos: "llevá", "pedí", "recibís"), frases cortas, sin adjetivos vacíos ("increíble", "premium", "único").
Devuelve SOLO un objeto JSON válido, sin texto antes ni después, con esta forma exacta:
{"chip":"3-5 palabras con el dato más útil (ej. 'Talla única ajustable')",
 "titulo":"titular de beneficio, 3-6 palabras, sin el nombre del producto",
 "tituloResaltado":"1-3 palabras que van DESPUÉS del titular y lo completan (no repitas palabras del titular)",
 "lead":"1-2 frases: qué es (con el NOMBRE EXACTO del producto) y qué resuelve",
 "bullets":["3 beneficios concretos, 3-8 palabras cada uno"],
 "cta":"botón en primera persona, 2-4 palabras (ej. 'Lo quiero')",
 "problema":{"eyebrow":"frase corta que conecta (ej. '¿Te suena familiar?')","titulo":"el dolor o la situación, 5-10 palabras","texto":"2 frases: el problema y cómo este producto lo resuelve"},
 "beneficios":[{"icono":"uno de: ${NOMBRES_DE_ICONOS.join(", ")}","titulo":"2-3 palabras","texto":"una línea"}],
 "pasos":[{"titulo":"3-5 palabras","texto":"una línea"}],
 "faq":[{"p":"pregunta real de un comprador","r":"respuesta de 1-2 frases"}]}
REGLAS:
- 4 beneficios, 3 pasos, 3 a 4 preguntas.
- Los pasos son CÓMO SE USA el producto; si los datos no lo dicen, son cómo se compra: ${tipo === "fisico" ? "pedir → recibir en casa → pagar al recibir" : tipo === "digital" ? "pagar en línea → recibir el acceso → empezar" : "escribir por WhatsApp → agendar → recibir el servicio"}.
- Solo hechos que estén en los datos. PROHIBIDO inventar: medidas, materiales, tiempos de resultado ("en 14 días"), porcentajes, estrellas, reseñas, testimonios, descuentos, stock, garantías, plazos de envío ni COBERTURA ('a todo el país', 'a cualquier ciudad', 'envío gratis').
- "eyebrow" nunca es el nombre de la técnica (Problema, Solución, Atención, Interés, Deseo, Acción).
- Las preguntas frecuentes son sobre el PRODUCTO (uso, medidas, materiales, para quién sirve) y sobre lo que está en hechos_del_negocio. NO inventes políticas: nada de "puedes probarlo", "abrirlo/inspeccionarlo antes de pagar", cambios, devoluciones o reembolsos, salvo que estén en los hechos. Si la única respuesta posible es una política que no está, no hagas esa pregunta.
- La garantía cubre EXACTAMENTE lo que dice el texto de la garantía (ej. "defectos de fábrica"): no la estires a "si no te gusta" o "si no le queda cómodo".
- ${tipo === "fisico" ? "Una pregunta del FAQ es sobre el pago contra entrega: \"Pagas en efectivo cuando lo recibes en tu casa.\"" : tipo === "digital" ? "Una pregunta del FAQ es cómo se recibe el acceso: \"Después del pago te lo enviamos.\" No menciones envío ni contra entrega." : "Una pregunta del FAQ es cómo se agenda: \"Escríbenos por WhatsApp y coordinamos el horario.\" No menciones envío ni contra entrega."}`;
}

export function pedidoContenidoPro(p: ProductoParaContenido, extra: { garantia?: string | null; plazoEntrega?: string | null; tipo?: TipoPro } = {}): string {
  return JSON.stringify({
    producto: {
      nombre: p.name,
      precio: Number(p.price) || null,
      categoria: p.category || null,
      descripcion: String(p.description || "").slice(0, 1800),
      caracteristicas: (p.features || []).slice(0, 12),
    },
    hechos_del_negocio: {
      pago: extra.tipo === "digital" ? "en línea (MercadoPago/PayPal/transferencia)" : extra.tipo === "servicio" ? "se coordina por WhatsApp" : "contra entrega",
      plazo_de_entrega: extra.plazoEntrega || "NO definido: no lo menciones",
      cobertura_de_envio: "NO definida: no digas a qué ciudades o regiones llega",
      garantia: extra.garantia || "NO definida: no la menciones",
    },
  });
}

const texto = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const ROTULO_METODO = /^(el |la )?(problema|soluci[oó]n|atenci[oó]n|inter[eé]s|deseo|acci[oó]n)\s*[:.]?$/i;

/**
 * El h1 es `titulo + tituloResaltado`. El modelo a veces pone el resaltado
 * también al final del titulo y salía "Aprende piano desde cero desde cero"
 * (curso de piano, 01-10-2026): se quita del titulo.
 */
export function tituloSinRepetir(titulo: string, resaltado: string): { titulo: string; tituloResaltado: string } {
  const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
  const t = norm(titulo), r = norm(resaltado);
  if (r && t !== r && t.endsWith(" " + r)) {
    const palabras = titulo.trim().split(/\s+/);
    const recortado = palabras.slice(0, palabras.length - r.split(" ").length).join(" ");
    if (recortado) return { titulo: recortado, tituloResaltado: resaltado };
  }
  return { titulo, tituloResaltado: resaltado };
}

/** Del texto del modelo al contenido; lo que falte se completa con el producto. */
export function contenidoDesdeRespuesta(raw: string, p: ProductoParaContenido, tipo: TipoPro = "fisico"): ContenidoPro {
  let j: any = null;
  try {
    const s = String(raw || "");
    const desde = s.indexOf("{"), hasta = s.lastIndexOf("}");
    if (desde >= 0 && hasta > desde) j = JSON.parse(s.slice(desde, hasta + 1));
  } catch { j = null; }
  const base = contenidoDeRespaldo(p, tipo);
  if (!j || typeof j !== "object") return base;

  const lista = <T,>(v: unknown, fn: (x: any) => T | null, min: number, max: number, respaldo: T[]): T[] => {
    const xs = (Array.isArray(v) ? v : []).map(fn).filter(Boolean) as T[];
    return xs.length >= min ? xs.slice(0, max) : respaldo;
  };
  const eyebrow = texto(j.problema?.eyebrow, 40);
  return {
    chip: texto(j.chip, 40) || base.chip,
    ...tituloSinRepetir(texto(j.titulo, 60) || base.titulo, texto(j.tituloResaltado, 40) || base.tituloResaltado),
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
export function contenidoDeRespaldo(p: ProductoParaContenido, tipo: TipoPro = "fisico"): ContenidoPro {
  const feats = (p.features || []).map((f) => texto(String(f).replace(/^[^\p{L}\p{N}]+/u, ""), 70)).filter(Boolean);
  const desc = texto(p.description, 600);
  const primeraFrase = desc.split(/(?<=[.!?])\s/)[0] || "";
  return {
    chip: tipo === "fisico" ? "Pago contra entrega" : tipo === "digital" ? "Acceso digital" : "Atención personalizada",
    titulo: tipo === "fisico" ? "Pídelo hoy y" : tipo === "digital" ? "Empieza hoy" : "Agenda hoy",
    tituloResaltado: tipo === "fisico" ? "págalo al recibir" : tipo === "digital" ? "a tu ritmo" : "por WhatsApp",
    lead: `${p.name}${primeraFrase ? `: ${primeraFrase}` : ""}`.slice(0, 260),
    bullets: feats.length ? feats.slice(0, 3) : tipo === "fisico" ? ["Envío a domicilio", "Pagas cuando lo recibes", "Te confirmamos por WhatsApp"] : tipo === "digital" ? ["Acceso después del pago", "Desde el celular o el computador", "Soporte por WhatsApp"] : ["Atención directa", "Horario a tu medida", "Respuesta por WhatsApp"],
    cta: tipo === "fisico" ? "Lo quiero" : tipo === "digital" ? "Quiero el acceso" : "Quiero agendar",
    problema: { eyebrow: "Por qué elegirlo", titulo: p.name, texto: desc.slice(0, 320) || `Conoce ${p.name}.` },
    beneficios: (feats.length ? feats : tipo === "fisico" ? ["Envío a domicilio", "Pago contra entrega", "Compra segura", "Atención por WhatsApp"] : ["Atención por WhatsApp", "Pago seguro", "A tu ritmo", "Soporte"]).slice(0, 4).map((f, i) => ({ icono: ["sparkle", "check", "box", "chat"][i] || "check", titulo: f.split(/\s+/).slice(0, 3).join(" "), texto: f })),
    pasos: tipo === "fisico"
      ? [
          { titulo: "Haz tu pedido", texto: "Deja tus datos en el formulario." },
          { titulo: "Lo recibes en casa", texto: "Te lo enviamos a tu dirección." },
          { titulo: "Pagas al recibir", texto: "En efectivo, cuando lo tengas en tus manos." },
        ]
      : tipo === "digital"
        ? [
            { titulo: "Haz tu pago", texto: "Con el medio que prefieras." },
            { titulo: "Recibe el acceso", texto: "Te lo enviamos después del pago." },
            { titulo: "Empieza", texto: "Desde tu celular o computador." },
          ]
        : [
            { titulo: "Escríbenos", texto: "Por WhatsApp, con lo que necesitas." },
            { titulo: "Agendamos", texto: "Coordinamos día y hora contigo." },
            { titulo: "Te atendemos", texto: "En el horario acordado." },
          ],
    faq: tipo === "fisico"
      ? [
          { p: "¿Cómo funciona el pago contra entrega?", r: "Pagas en efectivo cuando recibes el producto en tu casa." },
          { p: "¿Cómo sé que mi pedido quedó registrado?", r: "Te confirmamos por WhatsApp antes de despacharlo." },
        ]
      : tipo === "digital"
        ? [
            { p: "¿Cómo recibo el acceso?", r: "Después del pago te lo enviamos." },
            { p: "¿Qué medios de pago hay?", r: "Los que ves en el botón de pago, o transferencia por WhatsApp." },
          ]
        : [
            { p: "¿Cómo agendo?", r: "Escríbenos por WhatsApp y coordinamos el horario." },
            { p: "¿Cuánto cuesta?", r: "Te damos el valor exacto por WhatsApp según lo que necesites." },
          ],
  };
}

/** ¿La respuesta del modelo trae el JSON de la landing PRO? (titular + beneficios) */
export function respuestaProValida(t: string): boolean {
  try {
    const s = String(t || "");
    const j = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
    return !!(j && typeof j.titulo === "string" && j.titulo.trim() && Array.isArray(j.beneficios) && j.beneficios.length);
  } catch {
    return false;
  }
}
