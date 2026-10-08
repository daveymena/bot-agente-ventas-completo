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
 *
 * 07-10-2026 (pedido del dueño: "borradores PROFESIONALES"): medido contra el
 * catálogo real, el texto salía con descripciones de 44-52 letras (Meta corta
 * en 30), el gancho era la política de garantía del proveedor o 150 letras de
 * ficha técnica, la acción decía WhatsApp aunque el anuncio llevara a la
 * landing, y una ficha de un párrafo daba cero beneficios. La rúbrica que lo
 * mide vive en `anuncio-rubrica.ts`.
 */
import { modeloDelProducto, type ModeloDeNegocio, type CondicionesDelNegocio } from "./modelo-de-negocio";
import { hablarColombiano } from "./hablar-colombiano";
import { revisarCopy } from "./publicidad-persuasiva";

export interface PlanDeAnuncio {
  modelo: ModeloDeNegocio;
  primaryText: string;
  headline: string;
  description: string;
  /** Tipo de botón sugerido (lo usa la estrategia; el destino lo fija facebook.ts). */
  ctaType: "SHOP_NOW" | "SIGN_UP" | "CONTACT_US";
  /** Qué objetivo de campaña conviene para este modelo (ver objetivos-campana.ts). */
  objetivoRecomendado: "mensajes" | "ventas" | "trafico";
  /** A dónde lleva el anuncio: el texto pide ESA acción y no otra. */
  destino: DestinoDelAnuncio;
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
  /** De acá sale la ficha CURADA (`metadata.curado.beneficioPrincipal`). */
  metadata?: unknown;
}

/** A dónde lleva el anuncio: decide el llamado a la acción del texto. */
export type DestinoDelAnuncio = "whatsapp" | "web";

/** Límites del feed de Meta (lo que pasa de acá, Meta lo corta). */
export const LIMITES_META = {
  /** "Ver más" del texto principal en el feed. */
  primeraVista: 125,
  titular: 40,
  descripcion: 30,
} as const;

const limpio = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").trim();
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const clave = (t: string) => sinTildes(String(t || "")).replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * ¿Esta línea de la ficha es texto del PROVEEDOR y no del producto?
 *
 * Medido con el catálogo real (07-10-2026): el "Corrector de Postura Trenza"
 * importado de Dropi trae como descripción la POLÍTICA DE GARANTÍA del
 * proveedor ("se ofrece una garantía de devolución del dinero válida por 10
 * días… para todas las compras realizadas a través del sitio web"). El
 * anuncio abría con "Política de Garantía de 10 Días" y los "beneficios" eran
 * "Por ello" y "Condiciones de la Garantía". Otras fichas traen "NOTA
 * IMPORTANTE… copia este link" y los horarios de guía del proveedor.
 *
 * Nada de eso describe el producto, y prometerlo en un anuncio pago es
 * prometer condiciones que el negocio no definió. Lo mismo el envío y el pago
 * que traiga la ficha: esos los pone el bloque de oferta, con las condiciones
 * DEL NEGOCIO (business-context), no las del proveedor.
 */
export function esTextoDeProveedor(linea: string): boolean {
  const t = sinTildes(String(linea || ""));
  return (
    esPoliticaDelProveedor(t) ||
    /https?:\/\/|www\.|bit\.ly|wa\.me/.test(t) ||
    /\bproveedor|\bdropi\b|\bbodega\b|numero de guia|generacion de guia/.test(t) ||
    /\bescrib[ie]nos\b|\bwhatsapp\b|\bcontactanos\b/.test(t) ||
    /pagas? al recibir|contra ?entrega|\benvios? (gratis|a todo|incluido|a domicilio|nacional)/.test(t)
  );
}

/**
 * Las POLÍTICAS del proveedor (garantía, devoluciones, guías) contaminan la
 * línea entera: "La satisfacción del cliente es una prioridad. Por ello, se
 * ofrece una garantía de devolución del dinero…" -- la primera frase sola
 * parece inocente y terminaba de gancho. El resto del ruido (un código de
 * proveedor al final de la ficha del portátil) se saca frase por frase.
 */
function esPoliticaDelProveedor(t: string): boolean {
  return /\bpolitica\b|terminos y condiciones|condiciones de (la )?garantia|plazo de garantia|devolucion del dinero|\breembolso|a partir de la fecha|nota importante|copia este link|se genera(n)? (la )?guia/.test(sinTildes(t));
}

/**
 * Un RÓTULO de sección no es una característica ni un gancho.
 *
 * Las fichas importadas de Dropi traen, PEGADO AL FINAL, el encabezado de la
 * plantilla de origen sin contenido: "✨ BENEFICIOS PRINCIPALES", "Lo que
 * incluye", "Características:", "Material:"… Al llevar emoji adelante pasaba
 * como característica y llegaba visible al anuncio -- la "copia truncada" tal
 * cual la midió el dueño (02-10). Misma regla que la landing (sanear-html →
 * ROTULO_INTERNO), tolerante al emoji.
 */
function esRotulo(t: string): boolean {
  const cuerpo = t.replace(/^[\p{Extended_Pictographic}️\s•*▪◾✔✓☑-]+/u, "").trim();
  if (!cuerpo) return true; // solo emoji: no dice nada
  return (
    /^[\p{Lu}À-ß0-9][^\p{Ll}]{2,60}[.:]?$/u.test(cuerpo) ||
    /^[^.!?]{2,40}:$/u.test(cuerpo) ||
    /^\d+\.\s/.test(cuerpo) ||
    /^(?:lo que|qué|que)\s+(?:incluye|trae|lleva)[.:]?$/i.test(cuerpo) ||
    /^(?:beneficios?|caracter[ií]sticas?|incluye|el kit|la oferta|garant[ií]a|compra segura|ventajas?|características? del producto)[.:]?\s*$/i.test(cuerpo) ||
    /^(?:principales|destacad[oa]s?|incluid[oa]s?)[.:]?\s*$/i.test(cuerpo)
  );
}

/** ¿La línea es (casi) el nombre del producto? Dropi arranca la ficha repitiéndolo. */
function esElNombre(linea: string, nombre: string): boolean {
  const n = clave(nombre);
  if (!n) return false;
  const l = clave(linea);
  if (!l) return false;
  // "Portátil HP 15-DY0700TG." es el comienzo del nombre largo con la ficha técnica.
  return l === n || (l.includes(n) && l.replace(n, "").trim().length < 12) || (l.length >= 8 && n.startsWith(l));
}

/** Frases de una línea, sin partir decimales ("15.6") ni dejar texto afuera. */
function frasesDe(linea: string): string[] {
  return linea
    .split(/(?<=[.!?])\s+(?=[\p{Lu}¿¡0-9\p{Extended_Pictographic}])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Deja la frase en `max` caracteres cortando en una frontera NATURAL (punto y
 * coma, coma, dos puntos, conector). Si no hay ninguna, devuelve "": un
 * anuncio no publica una frase cortada a mitad de palabra con "…".
 *
 * `cortes`: el orden en que se prueban. Para un gancho, lo de antes de ":"
 * es la afirmación ("Aprende a tocar con 19 módulos en video: presentación,
 * ejercicios…"); para un punto, la coma conserva "Etiqueta: explicación".
 * La coma va con espacio: "2,8 pulgadas" no se parte.
 */
function recortarFrase(t: string, max: number, cortes: RegExp[], min = 20): string {
  const s = limpio(t).replace(/[;:,]\s*$/, "");
  if (s.length <= max) return s;
  for (const sep of cortes) {
    const primera = s.split(sep)[0]!.trim().replace(/[;:,]\s*$/, "");
    if (primera.length >= min && primera.length <= max) return primera;
  }
  return "";
}
const CORTES_GANCHO = [/;\s*/, /:\s+/, /,\s+/, /\s+(?:o|y|u|para|que|con)\s+/i];
const CORTES_PUNTO = [/;\s*/, /,\s+/, /:\s+/, /\s+(?:o|y|u|para|que|con)\s+/i];

/**
 * ¿La frase le habla al cliente o dice para qué sirve? Esa es la que abre.
 *
 * "Rueda abdominal de diseño grueso con mango antideslizante." describe;
 * "Sirve para tonificar el abdomen sin necesidad de ir al gimnasio." vende.
 * Solo ORDENA las frases reales del producto: no escribe ninguna.
 */
const INTERPELA =
  /\?|(?:^|\s)(?:tu|tus|te|ti|contigo)(?=\s|[.,;:!?]|$)|\bsin necesidad\b|\bpara que\b|\bideal para\b|\bsirve para\b|\bayuda a\b|\bolv[ií]date\b|^(?:¡\s*)?(?:aprende|aprend[eé]|descubre|lleva|llev[aá]|disfruta|logra|consigue|mejora|protege|organiza|mant[eé]n|imagina|transforma|dile adi[oó]s|desp[ií]dete|evita)(?=\s)/i;

interface Frase { texto: string; fuente: number }

/** Las frases USABLES de la ficha, en orden: sin rótulos, sin el nombre, sin texto del proveedor. */
function frasesUtiles(p: ProductoParaAnuncio): Frase[] {
  const nombre = limpio(p.name);
  const out: Frase[] = [];
  let i = 0;
  for (const cruda of String(p.description || "").split(/\r?\n/)) {
    const linea = cruda.replace(/^[\s•*▪◾✔✓☑✅️-]+/u, "").trim();
    if (!linea || esRotulo(linea) || esPoliticaDelProveedor(linea) || esElNombre(linea, nombre)) continue;
    // Viñetas EN LÍNEA ("CARACTERISTICAS · Rueda de… · Diseño simple…"):
    // cada tramo es una característica, no una sola frase de 600 letras.
    for (const tramo of linea.split(/\s+[·•]\s+/)) {
      for (const f of frasesDe(tramo)) {
        if (esRotulo(f) || esTextoDeProveedor(f) || esElNombre(f, nombre)) continue;
        // La ficha del dueño también puede traer lo que el validador bloquea
        // ("los mejores libros de marketing"): esa frase no va al anuncio,
        // si no crear_anuncio y el plan se contradicen.
        if (revisarCopy(f).bloquea.length) continue;
        out.push({ texto: f, fuente: i++ });
      }
    }
  }
  return out;
}

/** La ficha curada (curador-de-producto) trae su beneficio principal: es el mejor gancho que hay. */
function beneficioCurado(p: ProductoParaAnuncio): string {
  let m: any = p.metadata;
  if (typeof m === "string") { try { m = JSON.parse(m); } catch { m = null; } }
  const b = limpio(m?.curado?.beneficioPrincipal);
  return b && !esTextoDeProveedor(b) && !esElNombre(b, limpio(p.name)) ? b : "";
}

/**
 * El gancho: la frase real del producto que mejor abre, en ≤125 caracteres.
 *
 * Bugs medidos sobre el catálogo real (07-10-2026):
 *   · el recorte de frases (`match` con /g) SALTABA texto: "Portátil HP
 *     15-DY0700TG… 15.6\" HD" abría con "6\" HD, sistema operativo…";
 *   · la Cámara abría con 150 caracteres de ficha técnica terminados en ";";
 *   · el Corrector Trenza abría con la política de garantía del proveedor;
 *   · sin ninguna frase útil el gancho era el NOMBRE, igual al titular.
 * Devuelve la fuente para no repetir esa frase como punto. `null` = la ficha
 * no tiene una sola frase que sirva para abrir (se dice, no se inventa).
 */
function ganchoReal(p: ProductoParaAnuncio, frases: Frase[]): Frase | null {
  const curado = beneficioCurado(p);
  if (curado) {
    const t = recortarFrase(curado, LIMITES_META.primeraVista, CORTES_GANCHO, 25);
    if (t) return { texto: t, fuente: -1 };
  }
  const orden = [...frases.slice(0, 4).filter((f) => INTERPELA.test(f.texto)), ...frases];
  for (const f of orden) {
    const t = recortarFrase(f.texto, LIMITES_META.primeraVista, CORTES_GANCHO, 25);
    if (t && t.length >= 25) return { texto: t, fuente: f.fuente };
  }
  return null;
}

/** La viñeta: el emoji propio de la característica se respeta; ✔/✅/• del proveedor se cambian por el del anuncio. */
function conVineta(t: string, emojiPorDefecto: string): string {
  const s = t.replace(/^[\s•*▪◾✔✓☑✅️-]+/u, "").trim();
  return /^\p{Extended_Pictographic}/u.test(s) ? s : `${emojiPorDefecto} ${s}`;
}

/**
 * Hasta 3 características REALES, cada una con su emoji (el suyo si lo trae).
 *
 * Historia de bugs (todos con fichas reales de Dropi):
 *   02-10 · solo leía líneas con viñeta (las fichas vienen en párrafos) y
 *           repetía el gancho como primer punto.
 *   07-10 · la coma de "2,8 pulgadas" partía el punto ("…pantalla IPS de 2");
 *           "Por ello" (resto de un corte) salía como beneficio; una ficha de
 *           UN párrafo (AB Roller) daba cero puntos porque la línea 0 se
 *           descartaba entera; "✔" del proveedor convivía con "✔️" del
 *           anuncio en la misma lista.
 *
 * `sinFrase`: el texto que ya va como gancho, para excluirlo.
 */
function puntosReales(p: ProductoParaAnuncio, emojiPorDefecto: string, sinFrase = "", fuenteDelGancho = -2): string[] {
  const excluida = clave(sinFrase);
  const nombre = clave(limpio(p.name));
  const crudas = Array.isArray(p.features) ? (p.features as unknown[]).map(limpio).filter(Boolean) : [];

  const candidatos: string[] = [];
  const conNombre: string[] = [];
  for (const f of frasesUtiles(p)) {
    if (f.fuente === fuenteDelGancho) continue;
    const t = recortarFrase(f.texto, 110, CORTES_PUNTO, 15);
    if (!t || t.split(/\s+/).length < 3) continue;
    // "La Pañalera Mochila … es el accesorio ideal" presenta el producto, no
    // dice qué gana el cliente: va al final de la fila, no se descarta.
    (nombre && clave(t).includes(nombre) ? conNombre : candidatos).push(t);
  }

  const vistas = new Set<string>();
  const out: string[] = [];
  for (const t of [...crudas, ...candidatos, ...conNombre]) {
    if (esRotulo(t) || esTextoDeProveedor(t)) continue;
    const k = clave(t);
    if (!k || vistas.has(k)) continue;
    // El gancho no se repite: ni igual, ni contenido uno en el otro.
    if (excluida && (k === excluida || excluida.includes(k) || k.includes(excluida))) continue;
    vistas.add(k);
    out.push(conVineta(t, emojiPorDefecto));
    if (out.length >= 3) break;
  }
  return out;
}

/** Exportada para probarla directamente: el CI no corre el anuncio completo. */
export { puntosReales };

function precioTexto(p: ProductoParaAnuncio): string | null {
  const n = Number(p.price) || 0;
  if (n <= 0) return null;
  return `$${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })} ${String(p.currency || "COP").toUpperCase()}`;
}

/** "$110.990" (sin moneda): para el titular y la descripción, que tienen 40 y 30 letras. */
function precioCorto(p: ProductoParaAnuncio): string | null {
  const n = Number(p.price) || 0;
  return n > 0 ? `$${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })}` : null;
}

/** Corta en la última palabra que entra, sin "…" y sin dejar un conector colgando. */
export function recortarAPalabra(texto: string, max: number): string {
  const t = limpio(texto);
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const espacio = corte.lastIndexOf(" ");
  let s = espacio >= max * 0.5 ? corte.slice(0, espacio) : corte;
  s = s.replace(/[\s|:;,·•–-]+$/u, "").replace(/\s+(?:de|del|la|el|los|las|y|o|con|para|en|a|al|por)$/i, "");
  return s.trim();
}

const MINUSCULAS_EN_TITULO = new Set(["de", "del", "la", "el", "los", "las", "y", "o", "en", "a", "al", "con", "para", "por", "un", "una", "tu", "mi", "mil"]);

/**
 * El titular: el nombre del producto, legible y en ≤40.
 *
 * Catálogo real: "CURSO DE PIANO COMPLETO" (gritado), "Portátil HP 15-DY0700TG
 * | Pentium N5030 | 8GB | 256GB SSD | 15.6\" HD | Windows 11" (la ficha
 * técnica entera) y nombres con "📂" adelante. Las siglas cortas (BIM, SEO,
 * DJ, 3D) se dejan en mayúscula.
 */
export function titularDelProducto(nombre: string, max: number = LIMITES_META.titular): string {
  let n = limpio(nombre).replace(/^[\p{Extended_Pictographic}️\s]+/u, "");
  n = n.split(/\s+\|\s+/)[0]!.trim();
  const letras = n.replace(/[^\p{L}]/gu, "");
  const mayus = letras.replace(/[^\p{Lu}]/gu, "").length;
  if (letras.length >= 4 && mayus / letras.length > 0.7) {
    n = n
      .split(/\s+/)
      .map((w, i) => {
        const l = w.toLowerCase();
        if (i === 0) return l.charAt(0).toUpperCase() + l.slice(1);
        if (w.replace(/[^\p{L}]/gu, "").length <= 3 && !MINUSCULAS_EN_TITULO.has(l)) return w; // sigla
        return l;
      })
      .join(" ");
  }
  return recortarAPalabra(n, max);
}

/** Une datos cortos con " · " mientras entren en `max` (la descripción de Meta: 30). */
function unirHasta(partes: Array<string | null | undefined | false>, max: number): string {
  let out = "";
  for (const p of partes) {
    if (!p) continue;
    const cand = out ? `${out} · ${p}` : p;
    if (cand.length <= max) out = cand;
  }
  return out;
}

/** ¿Dos textos dicen lo mismo? (el gancho que repite el titular, o al revés). */
export function dicenLoMismo(a: string, b: string): boolean {
  const x = clave(a), y = clave(b);
  if (!x || !y) return false;
  return x === y || (x.startsWith(y) && x.length < y.length + 12) || (y.startsWith(x) && y.length < x.length + 12);
}

/**
 * La línea de ACCIÓN del texto, según A DÓNDE lleva el anuncio.
 *
 * Bug (07-10-2026): el texto decía SIEMPRE "👉 Escríbenos por WhatsApp" y la
 * subida, con landing publicada, mandaba el botón a la landing
 * (destinoPorDefecto). Un anuncio que dice una cosa y hace otra.
 */
export function lineaDeAccion(modelo: ModeloDeNegocio, destino: DestinoDelAnuncio, pago?: string | null): string {
  const contraentrega = pago === "contraentrega";
  if (modelo === "fisico") {
    if (destino === "web") return contraentrega ? "👉 Pídelo en el enlace y lo pagas cuando llegue." : "👉 Pídelo en el enlace.";
    return contraentrega ? "👉 Escríbenos por WhatsApp: te lo enviamos y lo pagas cuando llegue." : "👉 Escríbenos por WhatsApp y te ayudamos con tu pedido.";
  }
  if (modelo === "servicio" || modelo === "cotizacion") {
    if (destino === "web") return modelo === "cotizacion" ? "👉 Entra al enlace y pide tu cotización." : "👉 Entra al enlace y agenda tu cita.";
    return "👉 Escríbenos por WhatsApp y agendamos.";
  }
  return destino === "web" ? "👉 Entra al enlace y empieza hoy." : "👉 Escríbenos por WhatsApp y empiezas hoy.";
}

/** El destino que corresponde a un objetivo de campaña (mensajes = WhatsApp; el resto, la web). */
export function destinoDeObjetivo(objetivo: string | null | undefined): DestinoDelAnuncio {
  return String(objetivo || "mensajes") === "mensajes" ? "whatsapp" : "web";
}

/**
 * Cambia la línea de acción (la que abre con 👉) por la del destino nuevo.
 * Si el texto no tiene línea 👉, se agrega al final. Lo usa el editor del
 * panel cuando el admin cambia el objetivo del borrador.
 */
export function conLineaDeAccion(primaryText: string, linea: string): string {
  const t = String(primaryText || "").replace(/\s+$/, "");
  const lineas = t.split("\n");
  for (let i = lineas.length - 1; i >= 0; i--) {
    if (/^\s*👉/u.test(lineas[i]!)) {
      lineas[i] = linea;
      return lineas.join("\n");
    }
  }
  return t ? `${t}\n\n${linea}` : linea;
}

/** ¿El producto DICE que el acceso es de por vida? Solo entonces se afirma. */
const diceAccesoPermanente = (p: ProductoParaAnuncio) =>
  /de por vida|acceso permanente|acceso ilimitado|para siempre/i.test(`${p.description || ""} ${JSON.stringify(p.features || "")}`);

export function planDeAnuncio(
  p: ProductoParaAnuncio,
  cond?: CondicionesDelNegocio | null,
  /**
   * `gancho`: el que trajo la investigación de Atlas (manda sobre el del producto).
   * `destino`: a dónde lleva el anuncio (sin dato, WhatsApp: el de siempre).
   */
  opts: { gancho?: string | null; destino?: DestinoDelAnuncio } = {},
): PlanDeAnuncio {
  const modelo = modeloDelProducto(p as any);
  const destino: DestinoDelAnuncio = opts.destino === "web" ? "web" : "whatsapp";
  const frases = frasesUtiles(p);
  const propio = limpio(opts.gancho);
  const g: Frase | null = propio
    ? { texto: recortarFrase(propio, LIMITES_META.primeraVista, CORTES_GANCHO, 25) || propio, fuente: -1 }
    : ganchoReal(p, frases);
  const nombre = limpio(p.name);
  const gancho = g?.texto || nombre;
  const precio = precioTexto(p);
  const corto = precioCorto(p);
  const titularBase = titularDelProducto(nombre);
  // Sin una frase propia, el anuncio abre con el nombre: el titular entonces
  // NO puede repetirlo (gancho ≠ titular) y pasa a decir la oferta.
  const abreConElNombre = !g || dicenLoMismo(gancho, titularBase) || esElNombre(gancho, nombre);
  const objetivoRecomendado = destino === "web" ? "trafico" : "mensajes";

  if (modelo === "fisico") {
    const envio = cond?.envio;
    const oferta = [
      precio ? `💰 ${precio}` : "",
      envio?.costo === "incluido" ? "🚚 Envío incluido" : envio?.costo ? `🚚 Envío: ${envio.costo}` : "",
      envio?.pago === "contraentrega" ? "💵 Pagas al recibir" : envio?.pago === "ambos" ? "💵 Pagas antes o al recibir" : "",
      envio?.plazo ? `📦 Llega en ${envio.plazo}` : "",
    ].filter(Boolean);
    const puntos = puntosReales(p, "✔️", gancho, g?.fuente);
    const pagaAlRecibir = envio?.pago === "contraentrega" ? "Pagas al recibir" : null;
    const envioIncluido = envio?.costo === "incluido" ? "Envío incluido" : null;
    const respaldoDesc = destino === "web" ? "Pídelo en línea" : "Pídelo por WhatsApp";
    const headline = abreConElNombre
      ? unirHasta([pagaAlRecibir || envioIncluido || "Pídelo hoy", corto], LIMITES_META.titular)
      : titularBase;
    const description = abreConElNombre
      ? unirHasta([pagaAlRecibir ? envioIncluido : null, envio?.plazo ? `Llega en ${envio.plazo}` : null], LIMITES_META.descripcion) || respaldoDesc
      : unirHasta([corto, pagaAlRecibir, envioIncluido], LIMITES_META.descripcion) || respaldoDesc;
    return {
      modelo,
      destino,
      // AIDA: atención (el beneficio del producto) → interés/deseo (lo que
      // trae de verdad) → oferta real → acción.
      primaryText: [gancho, puntos.length ? puntos.join("\n") : "", oferta.join("\n"), lineaDeAccion(modelo, destino, envio?.pago)]
        .filter(Boolean)
        .join("\n\n"),
      headline,
      description,
      ctaType: "SHOP_NOW",
      objetivoRecomendado,
      creativo: {
        formato: "Video vertical 9:16 tipo UGC (grabado con celular, persona real usándolo), 15–30 s",
        estructura: [
          "0–3 s: el problema o el resultado a la vista (el producto EN USO, no sobre la mesa)",
          "3–20 s: demostración rápida de cómo se usa + 2 o 3 beneficios reales",
          "20–25 s: cómo llega (envío, pago al recibir)",
          destino === "web" ? "Cierre: \"Pídelo en el enlace\"" : "Cierre: \"Escríbenos por WhatsApp\"",
        ],
      },
      metricaClave: destino === "web" ? "Costo por visita a la página y por pedido" : "Costo por conversación y por pedido confirmado",
    };
  }

  if (modelo === "servicio" || modelo === "cotizacion") {
    const puntos = puntosReales(p, "✔️", gancho, g?.fuente);
    const agenda = modelo === "cotizacion" ? "Cotización sin compromiso" : destino === "web" ? (corto ? `Desde ${corto}` : "Agenda tu cita") : "Agenda por WhatsApp";
    return {
      modelo,
      destino,
      primaryText: [
        gancho,
        puntos.length ? puntos.join("\n") : "",
        modelo === "cotizacion"
          ? "📝 Cuéntanos qué necesitas y te enviamos una cotización a tu medida."
          : precio ? `💰 Desde ${precio}` : "",
        lineaDeAccion(modelo, destino),
      ].filter(Boolean).join("\n\n"),
      headline: abreConElNombre ? agenda : titularBase,
      description: abreConElNombre ? unirHasta([corto ? `Desde ${corto}` : null], LIMITES_META.descripcion) || "Agenda tu cita" : unirHasta([agenda], LIMITES_META.descripcion),
      ctaType: "CONTACT_US",
      objetivoRecomendado,
      creativo: {
        formato: "Video 'a cámara' de quien presta el servicio (30–45 s) o carrusel con trabajos REALES hechos",
        estructura: [
          "0–3 s: para quién es (\"Si eres… y buscas…\")",
          "El resultado que se logra y cómo se trabaja (el método, en 2–3 pasos)",
          "Prueba real: fotos de trabajos hechos o reseñas verdaderas (nunca inventadas)",
          destino === "web" ? "Cierre: \"Agenda en el enlace\"" : "Cierre: \"Escríbenos para agendar\"",
        ],
      },
      metricaClave: "Costo por conversación calificada y citas agendadas",
    };
  }

  // digital (y suscripción): el puente del punto A al punto B.
  const puntos = puntosReales(p, "📌", gancho, g?.fuente);
  const entrega = p.deliveryLink ? "⚡ Lo recibes al instante por enlace" : "⚡ Lo recibes por WhatsApp apenas pagas";
  return {
    modelo,
    destino,
    primaryText: [
      gancho,
      puntos.length ? `Lo que incluye:\n${puntos.join("\n")}` : "",
      [precio ? `💰 ${precio}${modelo === "suscripcion" ? "" : " pago único"}` : "", entrega, diceAccesoPermanente(p) ? "♾️ Acceso de por vida" : ""]
        .filter(Boolean).join("\n"),
      lineaDeAccion(modelo, destino),
    ].filter(Boolean).join("\n\n"),
    headline: abreConElNombre ? unirHasta([corto, "Entrega inmediata"], LIMITES_META.titular) || "Entrega inmediata" : titularBase,
    description: abreConElNombre
      ? unirHasta([modelo === "suscripcion" ? null : "Pago único", "Empiezas hoy"], LIMITES_META.descripcion)
      : unirHasta([corto, "Entrega inmediata", modelo === "suscripcion" ? null : "Pago único"], LIMITES_META.descripcion),
    ctaType: "SIGN_UP",
    objetivoRecomendado,
    creativo: {
      formato: "Carrusel (portada + un módulo/beneficio por tarjeta) o video corto educativo 20–40 s",
      estructura: [
        "0–3 s: el error o la frustración común del tema",
        "Qué vas a lograr y qué trae (módulos o entregables reales)",
        "Cómo se entrega (enlace inmediato) y el precio",
        destino === "web" ? "Cierre: \"Entra al enlace y empieza hoy\"" : "Cierre: \"Escríbenos y empiezas hoy\"",
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
["encontrás", "encuentras"], ["organizá", "organiza"], ["pedila", "pídela"], ["salís", "sales"], ["llevalo", "llévalo"], ["llevala", "llévala"], ["comprá", "compra"], ["empezá", "empieza"], ["descubrí", "descubre"], ["aprendé", "aprende"],
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

/**
 * El copy, listo para Meta, ANTES de guardarse como borrador.
 *
 * Tres arreglos mecánicos que no necesitan al modelo (07-10-2026):
 *   · tuteo colombiano y sin "pago único" en un físico (pulirCopyDeAnuncio,
 *     que antes solo corría al SUBIR: el panel mostraba "Llevá", "Escribinos");
 *   · titular ≤40 y descripción ≤30: lo que pasa de ahí Meta lo corta. Una
 *     descripción larga se cambia por la del plan (datos reales, ya ≤30) en
 *     vez de mocharla a mitad de frase;
 *   · el titular no puede repetir la primera línea (gancho ≠ titular).
 *
 * `respaldo`: el plan determinístico del producto, de donde salen los
 * reemplazos. Sin él, se recorta en la última palabra.
 */
export function ajustarCopyAMeta(
  copy: { primaryText: string; headline: string; description: string },
  opts: { esFisico: boolean; pais?: string; respaldo?: { headline: string; description: string } | null },
): { primaryText: string; headline: string; description: string } {
  const c = pulirCopyDeAnuncio(copy, { esFisico: opts.esFisico, pais: opts.pais });
  const r = opts.respaldo || null;
  let headline = c.headline.length > LIMITES_META.titular ? recortarAPalabra(c.headline, LIMITES_META.titular) : c.headline;
  let description = c.description;
  if (description.length > LIMITES_META.descripcion) {
    description = r?.description && r.description.length <= LIMITES_META.descripcion ? r.description : recortarAPalabra(description, LIMITES_META.descripcion);
  }
  const primera = c.primaryText.split("\n").find((l) => l.trim()) || "";
  if (headline && dicenLoMismo(primera, headline) && r?.headline && !dicenLoMismo(primera, r.headline)) {
    headline = r.headline;
  }
  return { primaryText: c.primaryText, headline, description };
}

/** La acción pide WhatsApp y el anuncio lleva a la web, o al revés. */
export function accionContradiceDestino(accion: string, destino: DestinoDelAnuncio): boolean {
  const a = sinTildes(String(accion || ""));
  if (!a.trim()) return false;
  const pideWhatsApp = /whatsapp|escrib[ie]nos|\bmensaje|\bchat\b/.test(a);
  const pideWeb = /enlace|\blink\b|pagina|\bweb\b|sitio|tienda|landing|formulario|\bclic\b/.test(a);
  return destino === "web" ? pideWhatsApp && !pideWeb : pideWeb && !pideWhatsApp;
}

/**
 * ¿La línea de acción (👉) contradice el destino? Devuelve el texto con la
 * acción correcta, o el mismo texto si ya era coherente.
 *
 * Es la última barrera antes de Meta: un anuncio que dice "Escríbenos por
 * WhatsApp" con el botón a la landing (o "entra al enlace" abriendo WhatsApp)
 * paga clics que llegan confundidos.
 */
export function accionCoherenteConDestino(
  primaryText: string,
  modelo: ModeloDeNegocio,
  destino: DestinoDelAnuncio,
  pago?: string | null,
): { texto: string; corregido: boolean } {
  const t = String(primaryText || "");
  const accion = [...t.split("\n")].reverse().find((l) => /^\s*👉/u.test(l)) || "";
  if (!accionContradiceDestino(accion, destino)) return { texto: t, corregido: false };
  return { texto: conLineaDeAccion(t, lineaDeAccion(modelo, destino, pago)), corregido: true };
}

