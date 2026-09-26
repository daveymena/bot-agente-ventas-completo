/**
 * EL ANUNCIO SEGÚN QUÉ SE VENDE
 * =============================
 *
 * Hasta el 23-09-2026 había UN solo texto para todo (`generateAdCopy`):
 * "Este contenido digital es tu atajo…", "Haz clic para DESCARGAR todo el
 * contenido", "Acceso inmediato y PERMANENTE". El anuncio del corrector de
 * postura -- un producto físico que se despacha -- le prometía al cliente
 * una descarga. Publicidad engañosa pagada, y motivo de rechazo en Meta.
 *
 * Marco que pidió el dueño (guía de Meta, 23-09): el creativo segmenta; cada
 * modelo se vende distinto.
 *
 *   físico    → impulso: transformación inmediata, demo en uso (UGC), oferta
 *               de envío/pago real. Métrica: costo por venta.
 *   digital   → aspiración: del punto A al B, qué aprende/recibe, entrega
 *               inmediata. Métrica: costo por venta/lead.
 *   servicio  → confianza: resultado + método, conversación o agenda.
 *               Métrica: calidad del lead/citas.
 *
 * Y la regla de siempre en este proyecto (CLAUDE.md): nada se afirma si no
 * está en el producto. Sin "acceso de por vida" si el producto no lo dice,
 * sin testimonios ni cifras de clientes, sin urgencia fabricada.
 */
import { modeloDelProducto, type ModeloDeNegocio, type CondicionesDelNegocio } from "./modelo-de-negocio";
import { hablarColombiano } from "./hablar-colombiano";

export interface PlanDeAnuncio {
  modelo: ModeloDeNegocio;
  primaryText: string;
  headline: string;
  description: string;
  /** Tipo de botón sugerido (lo usa la estrategia; el destino lo fija facebook.ts). */
  ctaType: "SHOP_NOW" | "SIGN_UP" | "CONTACT_US";
  /** Qué objetivo de campaña conviene para este modelo (ver objetivos-campana.ts). */
  objetivoRecomendado: "mensajes" | "ventas" | "trafico";
  /** Qué creativo producir: lo que el dueño o Atlas tienen que grabar/diseñar. */
  creativo: { formato: string; estructura: string[] };
  metricaClave: string;
}

interface ProductoParaAnuncio {
  name?: string | null;
  description?: string | null;
  price?: number | string | null;
  currency?: string | null;
  kind?: string | null;
  category?: string | null;
  deliveryLink?: string | null;
  features?: unknown;
}

const limpio = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").trim();

/** Primera frase útil que escribió el dueño: es el gancho más honesto posible. */
function ganchoReal(p: ProductoParaAnuncio): string {
  const primera = String(p.description || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[^\p{L}\p{N}¿¡]+/u, "").trim())
    .find((l) => l.length >= 20);
  if (!primera) return limpio(p.name);
  // Frases COMPLETAS hasta tener algo que diga el beneficio (≥ 60 letras),
  // sin pasar de 160. "Corrector de postura con diseño en X." solo nombra el
  // producto; la frase que sigue ("Ayuda a mantener la espalda recta…") es el
  // gancho de verdad. Y nunca se corta a mitad de frase: "Fácil de ajustar…"
  // colgando es lo que salía antes.
  const frases = primera.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)?.map((f) => f.trim()) ?? [primera];
  let gancho = "";
  for (const f of frases) {
    if (gancho && (gancho + " " + f).length > 160) break;
    gancho = gancho ? `${gancho} ${f}` : f;
    if (gancho.length >= 60) break;
  }
  return gancho.length > 160 ? `${gancho.slice(0, gancho.lastIndexOf(" ", 157))}…` : gancho;
}

/** Hasta 3 características REALES, cada una con su emoji (el suyo si lo trae). */
function puntosReales(p: ProductoParaAnuncio, emojiPorDefecto: string): string[] {
  const crudas = Array.isArray(p.features) ? (p.features as unknown[]).map(limpio) : [];
  const deLaDescripcion = String(p.description || "")
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => /^[•\-*✅✔️👉▪️◾]|^\p{Extended_Pictographic}/u.test(l))
    .map((l) => l.replace(/^[•\-*▪️◾]\s*/u, "").trim());
  const todas = [...crudas, ...deLaDescripcion].filter((t) => t.length >= 4 && t.length <= 90);
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const t of todas) {
    const clave = t.toLowerCase().replace(/[^a-z0-9ñáéíóú ]/gi, "").trim();
    if (!clave || vistas.has(clave)) continue;
    vistas.add(clave);
    out.push(/^\p{Extended_Pictographic}/u.test(t) ? t : `${emojiPorDefecto} ${t}`);
    if (out.length >= 3) break;
  }
  return out;
}

function precioTexto(p: ProductoParaAnuncio): string | null {
  const n = Number(p.price) || 0;
  if (n <= 0) return null;
  return `$${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })} ${String(p.currency || "COP").toUpperCase()}`;
}

/** ¿El producto DICE que el acceso es de por vida? Solo entonces se afirma. */
const diceAccesoPermanente = (p: ProductoParaAnuncio) =>
  /de por vida|acceso permanente|acceso ilimitado|para siempre/i.test(`${p.description || ""} ${JSON.stringify(p.features || "")}`);

export function planDeAnuncio(
  p: ProductoParaAnuncio,
  cond?: CondicionesDelNegocio | null,
  /** `gancho`: el que trajo la investigación de Atlas (manda sobre el del producto). */
  opts: { gancho?: string | null } = {},
): PlanDeAnuncio {
  const modelo = modeloDelProducto(p as any);
  const nombre = limpio(p.name);
  const gancho = limpio(opts.gancho) || ganchoReal(p);
  const precio = precioTexto(p);
  const titulo = nombre.length > 40 ? `${nombre.slice(0, nombre.lastIndexOf(" ", 38))}…` : nombre;

  if (modelo === "fisico") {
    const envio = cond?.envio;
    const oferta = [
      precio ? `💰 ${precio}` : "",
      envio?.costo === "incluido" ? "🚚 Envío incluido" : envio?.costo ? `🚚 Envío: ${envio.costo}` : "",
      envio?.pago === "contraentrega" ? "💵 Pagas al recibir" : envio?.pago === "ambos" ? "💵 Pagas antes o al recibir" : "",
      envio?.plazo ? `📦 Llega en ${envio.plazo}` : "",
    ].filter(Boolean);
    const puntos = puntosReales(p, "✔️");
    return {
      modelo,
      // AIDA: atención (el beneficio del producto) → interés/deseo (lo que
      // trae de verdad) → oferta real → acción.
      primaryText: [
        gancho,
        puntos.length ? puntos.join("\n") : "",
        oferta.join("\n"),
        envio?.pago === "contraentrega"
          ? "👉 Escríbenos por WhatsApp, te lo enviamos y lo pagas cuando llegue."
          : "👉 Escríbenos por WhatsApp y te ayudamos con tu pedido.",
      ].filter(Boolean).join("\n\n"),
      headline: titulo,
      description: [precio, envio?.pago === "contraentrega" ? "Pago contraentrega" : "", envio?.costo === "incluido" ? "Envío incluido" : ""]
        .filter(Boolean).join(" • ") || "Pídelo por WhatsApp",
      ctaType: "SHOP_NOW",
      objetivoRecomendado: "mensajes",
      creativo: {
        formato: "Video vertical 9:16 tipo UGC (grabado con celular, persona real usándolo), 15–30 s",
        estructura: [
          "0–3 s: el problema o el resultado a la vista (el producto EN USO, no sobre la mesa)",
          "3–20 s: demostración rápida de cómo se usa + 2 o 3 beneficios reales",
          "20–25 s: cómo llega (envío, pago al recibir)",
          "Cierre: \"Escríbenos por WhatsApp\"",
        ],
      },
      metricaClave: "Costo por conversación y por pedido confirmado",
    };
  }

  if (modelo === "servicio" || modelo === "cotizacion") {
    const puntos = puntosReales(p, "✔️");
    return {
      modelo,
      primaryText: [
        gancho,
        puntos.length ? puntos.join("\n") : "",
        modelo === "cotizacion"
          ? "📝 Cuéntanos qué necesitas y te enviamos una cotización a tu medida."
          : precio ? `💰 Desde ${precio}` : "",
        "👉 Escríbenos por WhatsApp y agendamos.",
      ].filter(Boolean).join("\n\n"),
      headline: titulo,
      description: modelo === "cotizacion" ? "Cotización sin compromiso" : "Agenda por WhatsApp",
      ctaType: "CONTACT_US",
      objetivoRecomendado: "mensajes",
      creativo: {
        formato: "Video 'a cámara' de quien presta el servicio (30–45 s) o carrusel con trabajos REALES hechos",
        estructura: [
          "0–3 s: para quién es (\"Si eres… y buscas…\")",
          "El resultado que se logra y cómo se trabaja (el método, en 2–3 pasos)",
          "Prueba real: fotos de trabajos hechos o reseñas verdaderas (nunca inventadas)",
          "Cierre: \"Escríbenos para agendar\"",
        ],
      },
      metricaClave: "Costo por conversación calificada y citas agendadas",
    };
  }

  // digital (y suscripción): el puente del punto A al punto B.
  const puntos = puntosReales(p, "📌");
  const entrega = p.deliveryLink ? "⚡ Lo recibes al instante por enlace" : "⚡ Lo recibes por WhatsApp apenas pagas";
  return {
    modelo,
    primaryText: [
      gancho,
      puntos.length ? `Lo que incluye:\n${puntos.join("\n")}` : "",
      [precio ? `💰 ${precio}${modelo === "suscripcion" ? "" : " pago único"}` : "", entrega, diceAccesoPermanente(p) ? "♾️ Acceso de por vida" : ""]
        .filter(Boolean).join("\n"),
      "👉 Escríbenos por WhatsApp y empiezas hoy.",
    ].filter(Boolean).join("\n\n"),
    headline: titulo,
    description: [precio, modelo === "suscripcion" ? "" : "Pago único", "Entrega inmediata"].filter(Boolean).join(" • "),
    ctaType: "SIGN_UP",
    objetivoRecomendado: "mensajes",
    creativo: {
      formato: "Carrusel (portada + un módulo/beneficio por tarjeta) o video corto educativo 20–40 s",
      estructura: [
        "0–3 s: el error o la frustración común del tema",
        "Qué vas a lograr y qué trae (módulos o entregables reales)",
        "Cómo se entrega (enlace inmediato) y el precio",
        "Cierre: \"Escríbenos y empiezas hoy\"",
      ],
    },
    metricaClave: "Costo por venta (y por conversación)",
  };
}

/**
 * ¿Este texto le promete al cliente algo que ESTE tipo de producto no entrega?
 *
 * Caso real (24-09-2026): se subió a Meta el anuncio de un producto FÍSICO con
 * texto de curso digital ("descargá", "acceso de por vida") -- y el admin
 * pidió cuidar también lo contrario, un curso anunciado con "pagás al recibir".
 * El plan de arriba ya arma bien el texto; lo que se colaba era el texto que
 * trae quien llama (el lanzamiento, la investigación de Atlas), que lo pisaba
 * sin mirar. Devuelve el motivo, o null si el texto es coherente.
 */
const PROMESA_DIGITAL = /\bdescarg|acceso\s+(inmediato|permanente|de\s+por\s+vida|ilimitado|total)|contenido\s+digital|\bm[oó]dulos\b|\blecciones\b|clases\s+(en\s+video|grabadas)|\balumnos\b|certificado\s+de|\bmegapack\b|\bcurso\b/i;
const PROMESA_FISICA = /pag[aá]s?\s+al\s+recibir|contra\s*entrega|contraentrega|env[ií]os?\s+(a\s+todo|gratis|a\s+domicilio)|te\s+llega\s+a\s+(tu\s+)?casa|lo\s+recib[ií]s\s+en\s+tu\s+casa/i;

export function copyDeOtroModelo(texto: string, modelo: ModeloDeNegocio): string | null {
  const t = String(texto || "");
  if (modelo === "fisico") {
    const m = t.match(PROMESA_DIGITAL);
    return m ? `promete algo digital ("${m[0]}") y el producto es físico` : null;
  }
  if (modelo === "digital" || modelo === "suscripcion") {
    const m = t.match(PROMESA_FISICA);
    return m ? `promete una entrega física ("${m[0]}") y el producto es digital` : null;
  }
  return null;
}

export { modeloDelProducto };

const VOSEO_DE_ANUNCIO: [string, string][] = [
  ["pasás", "pasas"], ["completá", "completa"], ["pedí", "pide"], ["pedilo", "pídelo"], ["escribinos", "escríbenos"],
  ["mirá", "mira"], ["aprovechá", "aprovecha"], ["elegí", "elige"], ["sentís", "sientes"], ["usás", "usas"],
  ["tenés", "tienes"], ["querés", "quieres"], ["podés", "puedes"], ["recibís", "recibes"], ["pagás", "pagas"],
  ["hacé", "haz"], ["tocá", "toca"], ["dejá", "deja"], ["llevá", "lleva"], ["probá", "prueba"], ["notás", "notas"],
];

/**
 * Último pulido del texto que va a Meta: tuteo colombiano (salvo AR/UY) y,
 * en un físico, sin "pago único" (es lenguaje de cursos: en un corrector que
 * se paga al recibir no dice nada y suena a plantilla).
 */
export function pulirCopyDeAnuncio(
  copy: { primaryText: string; headline: string; description: string },
  opts: { esFisico: boolean; pais?: string },
): { primaryText: string; headline: string; description: string } {
  const tutea = !/^(AR|UY)$|argentin|uruguay/i.test(String(opts.pais || ""));
  const pulir = (t: string) => {
    let s = String(t || "");
    if (tutea) {
      s = hablarColombiano(s);
      // Voseo típico de anuncio que el traductor general no cubre.
      for (const [vos, tu] of VOSEO_DE_ANUNCIO) s = s.replace(new RegExp(`(?<!\\p{L})${vos}(?!\\p{L})`, "giu"), (m) => (m[0] === m[0].toUpperCase() ? tu[0].toUpperCase() + tu.slice(1) : tu));
    }
    if (opts.esFisico) {
      s = s
        .replace(/\s*[,·•|-]?\s*pago [úu]nico\s*(?=[.·•|\n]|$)/giu, "")
        .replace(/pago [úu]nico\s*(de\s*)?/giu, "")
        .replace(/^\s*[·•|]\s*/u, "")
        .replace(/\s*[·•|]\s*$/u, "")
        .replace(/ {2,}/g, " ");
    }
    return s.trim();
  };
  return { primaryText: pulir(copy.primaryText), headline: pulir(copy.headline), description: pulir(copy.description) };
}
