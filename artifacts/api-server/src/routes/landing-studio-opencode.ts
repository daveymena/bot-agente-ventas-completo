/**
 * Landing Studio v2 — Agentes especializados para generar landing pages.
 *
 * Cada tipo de producto tiene un agente con prompts especializados:
 * - Dropshipping: producto fisico, envio, contraentrega, prueba social
 * - Digital: cursos, ebooks, software, acceso inmediato
 * - Servicios: consultoria, agencias, freelance, booking
 * - Ecommerce: catalogo, multiples productos, carrito
 *
 * Flujo:
 * 1. Analiza el producto (tipo, publico, precio)
 * 2. Selecciona el agente especializado
 * 3. Genera HTML completo con estructura profesional
 *
 * POST /api/landing-studio/chat — genera o edita landings
 * POST /api/landing-studio/test — test sin auth
 */
import { Router } from "express";
import { logger } from "../lib/logger";
import { db, landingPages, products } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fotosDelProducto, videosDelProducto } from "../lib/fotos-de-producto";

const router = Router();

// ── Configuración OpenCode ────────────────────────────────────────────────
function opencodeConfig(): { host: string; authHeader: string } | null {
  const host = process.env.ATLAS_OPENCODE_HOST;
  const user = process.env.ATLAS_OPENCODE_USER;
  const pass = process.env.ATLAS_OPENCODE_PASS;
  if (!host || !user || !pass) return null;
  return {
    host: host.replace(/\/+$/, ""),
    authHeader: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
  };
}

let queue: Promise<any> = Promise.resolve();
function conCandado<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(() => undefined, () => undefined);
  return Promise.race([
    run,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout de cola: 200s")), 200_000)),
  ]);
}

async function createSession(host: string, authHeader: string): Promise<string> {
  const res = await fetch(`${host}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: "{}",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`No se pudo crear sesion OpenCode (${res.status})`);
  const data = (await res.json()) as any;
  if (!data?.id) throw new Error("OpenCode no devolvio id de sesion");
  return data.id;
}

interface OpencodePart { type: string; text?: string; [k: string]: any }

// Cadena de modelos medida en operator-opencode.ts (2026-09-03):
//   deepseek/deepseek-v4-flash    1,68s  ✅
//   deepseek/deepseek-v4-pro      2,47s  ✅
//   mistral/mistral-small-latest  1,53s  ✅
//   opencode/big-pickle           respaldo (gratis, lento)
const MODELOS_RAPIDOS: { providerID: string; modelID: string }[] = [
  { providerID: "deepseek", modelID: "deepseek-v4-flash" },
  { providerID: "deepseek", modelID: "deepseek-v4-pro" },
  { providerID: "mistral", modelID: "mistral-small-latest" },
  { providerID: "opencode", modelID: "big-pickle" },
];

async function sendMessage(
  host: string, authHeader: string, sessionId: string,
  opts: { system: string; text: string; timeoutMs: number },
): Promise<{ text: string; error?: string; model?: string }> {
  let ultimoError = "";
  for (const model of MODELOS_RAPIDOS) {
    try {
      const res = await fetch(`${host}/session/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({
          agent: "general",
          model: { providerID: model.providerID, modelID: model.modelID },
          system: opts.system,
          tools: {},
          parts: [{ type: "text", text: opts.text }],
        }),
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
      if (!res.ok) {
        ultimoError = `OpenCode respondio ${res.status} con ${model.modelID}`;
        continue;
      }
      const data = (await res.json()) as any;
      if (data?.info?.error) {
        ultimoError = data.info.error.data?.message || data.info.error.name || "Error de OpenCode";
        continue;
      }
      const parts: OpencodePart[] = Array.isArray(data?.parts) ? data.parts : [];
      const text = parts.filter(p => p.type === "text" && p.text).map(p => p.text!.trim()).join("\n\n").trim();
      if (!text) {
        ultimoError = `Respuesta vacía de ${model.modelID}`;
        continue;
      }
      return { text, model: model.modelID };
    } catch (e: any) {
      ultimoError = e?.message || "Error desconocido";
    }
  }
  return { text: "", error: ultimoError || "Sin modelos disponibles" };
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENTES ESPECIALIZADOS POR TIPO DE PRODUCTO
// ═══════════════════════════════════════════════════════════════════════════

type ProductType = "dropshipping" | "fisico" | "digital" | "servicio" | "ecommerce";

function detectarTipo(product: any): ProductType {
  const kind = (product?.kind || "").toLowerCase();
  const name = (product?.name || "").toLowerCase();
  const desc = (product?.description || "").toLowerCase();
  const cat = (product?.category || "").toLowerCase();
  const combined = `${kind} ${name} ${desc} ${cat}`;

  // Dropshipping explícito: siempre formulario completo.
  if (kind === "dropshipping" || /\bdropshipping\b/.test(cat)) return "dropshipping";
  // Físico SIN categoría dropshipping: se paga digital o por transferencia.
  if (kind === "physical" || kind === "fisico" || kind === "producto") return "fisico";
  if (/curso|ebook|libro|software|app|plantilla|preset|pack|curso|clase|memoria|guia|manual|video|tutorial|modulo/i.test(combined)) return "digital";
  if (/servicio|consultoria|asesoria|agencia|freelance|coaching|entrenamiento|terapia|salud|belleza|gimnasio|peluqueria|odontolog|medic|abogad|contador|reparacion|mantenimiento|limpieza|fumigacion|transporte|delivery/i.test(combined)) return "servicio";
  if (/tienda|shop|catalogo|multi|varios/i.test(combined)) return "ecommerce";
  return "digital";
}

// ── AGENTE: DROPSHIPPING ──────────────────────────────────────────────────
const DROPSHIPPING_SYSTEM = `Eres un experto en landing pages de DROPSHIPPING y productos fisicos que se envian. Generas paginas de venta CORATAS que convierten visitantes en compradores.

ESTRUCTURA (solo estas 6 secciones, en este orden):
1. HERO — Titulo corto que ataca el DOLOR/deseo + subtitulo con la PROMESA + boton CTA + imagen principal.
2. PROBLEMA→SOLUCION — 2 frases del problema, 2 frases de como el producto lo resuelve.
3. BENEFICIOS — maximo 4, una linea cada uno (icono + 3-6 palabras).
4. OFERTA — precio, descuento, urgencia (envio gratis / paga al recibir). Corto.
5. FORMULARIO COMPLETO — SIEMPRE, sin excepcion. El cliente completa su pedido ahi mismo.
6. FAQ — maximo 3 preguntas cortas.

REGLAS PARA DROPSHIPPING:
- Menciona ENVIO en una linea. Si es contraentrega: "Paga al recibir".
- NO inventes testimonios largos. Usa "Garantia de devolucion" o "Envio gratis" como frase corta.
- Copy en segunda persona, frases cortas, sin adjetivos vacios.
- EL FORMULARIO COMPLETO ES OBLIGATORIO. Campos exactos en este orden:
  * Nombre completo
  * Telefono / celular
  * Documento (cedula / DNI / identificacion)
  * Direccion de entrega
  * Barrio (opcional)
  * Ciudad
  * Departamento / estado
  * Un campo libre de "notas/referencias" (opcional)
- El formulario usa method="POST" y action="__FORM_ACTION__" (lo reemplaza el sistema). El boton de enviar dice "Pedir ahora" o "Completar pedido".
- El formulario va con un titulo tipo "Completa tus datos y recibe el pedido en tu casa".

FORMATO DE SALIDA:
SOLO el HTML completo. Empieza con <!DOCTYPE html>. Sin markdown, sin explicaciones, sin \`\`\`html.
Google Fonts via <link> (Inter para texto, Playfair para titulos).
El HTML debe ser AUTONOMO y funcionar solo.`;

// ── AGENTE: FISICO (no dropshipping) ──────────────────────────────────────
const FISICO_SYSTEM = `Eres un experto en landing pages de PRODUCTOS FISICOS que se pagan por adelantado (NO dropshipping: no se pide direccion de envio en el formulario). Generas paginas CORATAS de venta.

ESTRUCTURA (solo estas 6 secciones, en este orden):
1. HERO — Titulo corto que ataca el DOLOR/deseo + subtitulo con la PROMESA + boton CTA + imagen principal.
2. PROBLEMA→SOLUCION — 2 frases del problema, 2 frases de como el producto lo resuelve.
3. BENEFICIOS — maximo 4, una linea cada uno (icono + 3-6 palabras).
4. OFERTA — precio, descuento, urgencia. Corto.
5. METODOS DE PAGO — la seccion que cierra la venta (ver reglas).
6. FAQ — maximo 3 preguntas cortas.

REGLAS PARA FISICO NO DROPSHIPPING:
- Copy en segunda persona, frases cortas, sin adjetivos vacios.
- LA SECCION DE PAGO ofrece DOS opciones, ambas visibles y claras:
  * OPCION 1 - PAGO DIGITAL: un boton grande "Pagar ahora" con el enlace de pago que te doy en el brief (usa el link de pago tal cual).
  * OPCION 2 - TRANSFERENCIA: muestra las cuentas de transferencia EXACTAS que te doy en el brief (tipo + numero + titular), con un boton "Ya transferi - avisar por WhatsApp" que abre el link de WhatsApp que te doy.
- NO pidas direccion de envio ni documento. Solo nombre y telefono si acaso.
- Si no hay link de pago ni cuentas de transferencia, el boton unico es WhatsApp.

FORMATO DE SALIDA:
SOLO el HTML completo. Sin markdown, sin explicaciones.
Google Fonts. Responsive. Autonomo.`;

// ── AGENTE: DIGITAL ───────────────────────────────────────────────────────
const DIGITAL_SYSTEM = `Eres un experto en landing pages de PRODUCTOS DIGITALES (cursos, ebooks, software, presets, plantillas, packs). Generas paginas de venta CORTAS que venden acceso inmediato.

ESTRUCTURA (solo estas 6 secciones, en este orden):
1. HERO — Titulo corto que promete un RESULTADO + subtitulo con el beneficio + CTA "Quiero acceso" + imagen.
2. PROBLEMA→SOLUCION — 2 frases del dolor, 2 frases del producto como atajo.
3. QUE INCLUYE — lista corta de 4-5 items (modulos, archivos, bonuses) con checkmarks.
4. RESULTADOS — 1-2 frases de la transformacion que logra.
5. PRECIO + METODOS DE PAGO — precio tachado vs real + la seccion que cierra la venta (ver reglas).
6. GARANTIA + FAQ — garantia en 1 frase + maximo 3 preguntas.

REGLAS PARA DIGITALES:
- ACCESO INMEDIATO es el beneficio #1. Dilo en una frase corta.
- CTA sobre ACCESO, no compra: "Quiero acceso" > "Comprar".
- Sin testimonios largos. Usa "X personas ya lo tienen".
- LA SECCION DE PAGO ofrece DOS opciones, ambas visibles:
  * OPCION 1 - PAGO DIGITAL: boton grande "Pagar ahora" con el enlace de pago que te doy en el brief (usalo tal cual).
  * OPCION 2 - TRANSFERENCIA: muestra las cuentas de transferencia EXACTAS que te doy en el brief (tipo + numero + titular), con boton "Ya transferi - avisar por WhatsApp" que abre el link de WhatsApp del brief.
- Si no hay link de pago ni cuentas de transferencia, el boton unico es WhatsApp.
- NO pidas documento ni direccion. Solo nombre y email si acaso (o pago directo).

FORMATO DE SALIDA:
SOLO el HTML completo. Sin markdown, sin explicaciones.
Google Fonts. Responsive. Autonomo.`;

// ── AGENTE: SERVICIOS ─────────────────────────────────────────────────────
const SERVICIOS_SYSTEM = `Eres un experto en landing pages de SERVICIOS (consultoria, agencias, freelance, coaching, salud, belleza, reparacion, etc). Generas paginas CORTAS que generan CONFIANZA y bookings.

ESTRUCTURA (solo estas 6 secciones, en este orden):
1. HERO — Titulo corto que posiciona como EXPERTO + subtitulo con el resultado + CTA "Agenda tu cita" + imagen.
2. PROBLEMA→SOLUCION — 2 frases del problema, 2 frases de como el servicio lo resuelve.
3. SERVICIOS — lista corta de 3-5 servicios (icono + nombre + 1 linea).
4. COMO TRABAJA — 3 pasos (consulta, solucion, seguimiento). Una linea cada uno.
5. CONFIANZA + PRECIOS — "X clientes atendidos" / "Primera consulta gratis" + "Desde $X". Corto.
6. CTA + UBICACION — formulario (nombre, telefono) o boton WhatsApp + direccion/horarios en 1 linea.

REGLAS PARA SERVICIOS:
- CONFIANZA es el factor #1. Lenguaje de experto, frases cortas.
- NO uses "Comprar". Usa "Agendar", "Reservar", "Consultar".
- Si es WhatsApp, link directo wa.me/NUMERO.
- Formulario FACIL: nombre + telefono + un boton.

FORMATO DE SALIDA:
SOLO el HTML completo. Sin markdown, sin explicaciones.
Google Fonts. Responsive. Autonomo.`;

// ── AGENTE: ECOMMERCE ─────────────────────────────────────────────────────
const ECOMMERCE_SYSTEM = `Eres un experto en landing pages de ECOMMERCE y catalogos. Generas paginas CORTAS que muestran productos y facilitan la compra.

ESTRUCTURA (solo estas 5 secciones, en este orden):
1. HERO — Nombre de la tienda + tagline corto + buscador o categorias.
2. PRODUCTOS DESTACADOS — Grid de 4-8 productos: imagen + nombre + precio + boton "Comprar".
3. OFERTAS — productos en oferta con precio tachado + descuento visible.
4. BENEFICIOS DE LA TIENDA — 3-4 frases cortas (envio gratis, contraentrega, devoluciones).
5. CONTACTO — WhatsApp + email + redes en una linea.

REGLAS PARA ECOMMERCE:
- CADA producto: imagen, nombre, precio, boton. Sin descripciones largas.
- Grid RESPONSIVE: 1 columna movil, 2-4 desktop.
- Precios GRANDES. Si hay descuento: precio tachado + "% OFF".
- Colores de la marca (los de la paleta del brief). Sin carrito complejo: links directos a pago o WhatsApp.

FORMATO DE SALIDA:
SOLO el HTML completo. Sin markdown, sin explicaciones.
Google Fonts. Responsive. Autonomo.`;

// ═══════════════════════════════════════════════════════════════════════════
// CONSTRUCTOR DE PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

// Reglas compartidas por TODOS los agentes: concision + imagenes + tipografia + colores.
const REGLAS_COMPARTIDAS = `
REGLAS DE CONCISION (LO MAS IMPORTANTE - la landing debe ser CORTA):
1. MENOS ES MAS. La landing debe atraer al cliente, no leerle un libro. Nada de muros de texto.
2. HERO: titulo de maximo 8 palabras + subtitulo de maximo 15 palabras + 1 boton CTA. Y ya.
3. Cada seccion tiene: un titulo corto (3-6 palabras) + 1 o 2 frases cortas + su imagen. Nada mas.
4. Frases cortas: maximo 15-20 palabras por frase. Sin parrafos largos. Sin relleno.
5. BENEFICIOS: maximo 4, una linea cada uno (icono + 3-6 palabras).
6. FAQ: maximo 3 preguntas, respuesta de 1-2 frases.
7. El visitante debe entender en 10 segundos: que es el producto, que problema resuelve y como comprarlo.
8. NO repitas informacion entre secciones. Cada seccion aporta algo nuevo.
9. Prefiere listas y bullets cortos antes que parrafos. La landing se escanea, no se lee.
10. Total de la landing: corta y directa. Si una seccion no aporta a la conversion, eliminala.

REGLAS DE IMAGENES (OBLIGATORIAS):
1. Usa TODAS las imagenes del producto que te doy. No te quedes con una sola.
2. En el HERO usa la imagen PRINCIPAL (la marcada como tal), junto al titulo y subtitulo.
3. Cada BLOQUE/seccion de contenido debe llevar UNA imagen distinta. Intercala imagenes y texto para que la landing no sea un muro de texto.
4. NO repitas la misma imagen en secciones consecutivas.
5. Las imagenes van acompañando el titulo de cada bloque: titulo + imagen + texto.
6. Usa <img loading="lazy"> en las imagenes que NO estan en el hero (carga mas rapido).
7. Si una imagen falla, el <img> debe tener alt descriptivo.

REGLAS DE TIPOGRAFIA RESPONSIVE (OBLIGATORIAS):
1. Titulo principal (hero H1): 28px en movil, 48-56px en desktop. Usa font-size con media queries.
2. Subtitulos/secciones (H2): 22px en movil, 34-38px en desktop.
3. Titulos menores (H3): 18px en movil, 24-26px en desktop.
4. Texto de parrafo (body): 15-16px en movil, 17-18px en desktop. Interlineado 1.6.
5. Botones CTA: texto 16px, padding amplio, facil de tocar en movil (altura minima 48px).
6. Usa viewport meta correcto: <meta name="viewport" content="width=device-width, initial-scale=1.0">.
7. Los tamanos se controlan con CSS inline dentro de <style> o media queries. NUNCA uses clamp() que no funcione en navegadores viejos; prefiere media queries explicitas: @media (max-width: 768px) y @media (min-width: 769px).
8. En movil: una sola columna, titulos centrados, imagenes a ancho completo.
9. En desktop: max-width de contenido 1200px, centrado.
10. Verifica que los titulos NO se corten ni desborden en pantallas de 375px.

REGLAS DE COLORES (OBLIGATORIAS):
1. NO uses colores de fondo al azar. Usa la PALETA que te doy en el brief (colores de marca + color dominante del producto).
2. El color PRIMARIO va en fondos de secciones, encabezados y elementos destacados.
3. El color de ACENTO va en botones CTA, precios y elementos de urgencia.
4. El color DOMINANTE del producto sirve para degradados, bordes y detalles.
5. Fondo general: blanco o un tono MUY claro derivado del color primario (ej. si primary es verde, fondo #f0fdf4). Nunca un fondo de color saturado al azar.
6. Contraste legible: texto oscuro sobre fondo claro, texto blanco sobre fondo oscuro del color primario.
7. Si el producto NO tiene paleta definida, deriva los colores de la imagen del producto y de la categoria (tecnologia=azul, salud/belleza=verde/rosa, comida=naranja/rojo, premium/negocio=negro/dorado, educativo=indigo).
8. Maximo 3-4 colores en total. Consistencia en toda la landing.

NOTA: El <style> es obligatorio para los media queries. No todo puede ir inline: las media queries SIEMPRE van en un <style> dentro del <head>.`;

function getSystemPrompt(tipo: ProductType): string {
  const base = (() => {
    switch (tipo) {
      case "dropshipping": return DROPSHIPPING_SYSTEM;
      case "fisico": return FISICO_SYSTEM;
      case "digital": return DIGITAL_SYSTEM;
      case "servicio": return SERVICIOS_SYSTEM;
      case "ecommerce": return ECOMMERCE_SYSTEM;
      default: return DIGITAL_SYSTEM;
    }
  })();
  return base + REGLAS_COMPARTIDAS;
}

// ── Paleta de colores del producto ────────────────────────────────────────
// Saca los colores de marca del tenant y el color dominante de la imagen del
// producto. OpenCode los usa para armar la paleta en vez de inventar colores
// al azar.
interface Paleta { primary?: string; secondary?: string; accent?: string; dominante?: string }

// Diseño que el cliente elige desde el panel (fondo, botones, color). Se aplica
// en la preview al instante y se le pasa a la IA para regenerar.
interface Diseno { fondo?: string; botones?: string; color?: string }

async function colorDominanteDeImagen(url: string): Promise<string | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    const sharp = (await import("sharp")).default;
    const data = await sharp(buf)
      .resize(24, 24, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer();
    const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
    for (let i = 0; i < data.length; i += 3) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 232 && g > 232 && b > 232) continue; // fondo blanco
      if (r < 22 && g < 22 && b < 22) continue;    // casi negro
      const key = `${r >> 5},${g >> 5},${b >> 5}`;
      const e = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 };
      e.r += r; e.g += g; e.b += b; e.n += 1;
      buckets.set(key, e);
    }
    let mejor: { r: number; g: number; b: number; n: number } | null = null;
    for (const e of buckets.values()) if (!mejor || e.n > mejor.n) mejor = e;
    if (!mejor || mejor.n < 4) return null;
    const hex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
    return `#${hex(mejor.r / mejor.n)}${hex(mejor.g / mejor.n)}${hex(mejor.b / mejor.n)}`;
  } catch {
    return null;
  }
}

async function paletaDelProducto(product: any): Promise<Paleta> {
  const paleta: Paleta = {};
  try {
    const { tenantManager } = await import("../lib/tenantManager");
    const tenant = await tenantManager.getTenantById(product?.tenantId || 1);
    const brand = tenant?.brandColors;
    if (brand?.primary) paleta.primary = brand.primary;
    if (brand?.secondary) paleta.secondary = brand.secondary;
    if (brand?.accent) paleta.accent = brand.accent;
  } catch { /* sin tenant: se sigue con la imagen */ }

  const foto = fotosDelProducto(product)[0] || product?.imageUrl;
  if (foto) {
    const dom = await colorDominanteDeImagen(foto);
    if (dom) paleta.dominante = dom;
  }
  return paleta;
}

// ── Datos de pago del negocio ─────────────────────────────────────────────
// Lo que la landing necesita para cobrar: cuentas de transferencia y WhatsApp.
interface DatosDePago {
  cuentas: Array<{ type: string; number: string; name: string }>;
  paymentLink: string | null;
  whatsapp: string | null;
}

async function datosDePagoDelProducto(product: any): Promise<DatosDePago> {
  const res: DatosDePago = { cuentas: [], paymentLink: product?.paymentLink || null, whatsapp: null };
  try {
    const { tenantManager } = await import("../lib/tenantManager");
    const { credencialesDe } = await import("../lib/tenant-payment-credentials");
    const tenant = await tenantManager.getTenantById(product?.tenantId || 1);
    res.whatsapp = (tenant as any)?.contactPhone || (tenant as any)?.whatsappNumber || null;
    const cred = credencialesDe(tenant || undefined);
    if (cred?.transfer?.enabled) res.cuentas = cred.transfer.accounts || [];
  } catch { /* sin tenant: sin datos de pago */ }
  return res;
}

function linkWhatsApp(numero: string | null | undefined, texto?: string): string | null {
  const n = String(numero || "").replace(/\D/g, "");
  if (!n) return null;
  const msg = texto ? `?text=${encodeURIComponent(texto)}` : "";
  return `https://wa.me/${n}${msg}`;
}

// Hornear el diseño (fondo/botones/color) dentro del HTML guardado, para que la
// landing publicada lleve los cambios sin depender de la IA.
function inyectarDisenoEnHtml(html: string, diseno: Diseno): string {
  if (!html) return html;
  const reglas: string[] = [];
  if (diseno.botones) {
    const radius = diseno.botones === "pill" ? "999px" : diseno.botones === "redondeados" ? "12px" : "4px";
    reglas.push(`button, a[href], input[type="submit"], [role="button"] { border-radius: ${radius} !important; }`);
  }
  if (diseno.color) {
    reglas.push(`button, input[type="submit"] { background-color: ${diseno.color} !important; border-color: ${diseno.color} !important; }`);
  }
  if (diseno.fondo === "marca" && diseno.color) {
    reglas.push(`body { background-color: ${diseno.color}18 !important; }`);
  } else if (diseno.fondo === "degradado" && diseno.color) {
    reglas.push(`body { background: linear-gradient(180deg, ${diseno.color}26, #ffffff 70%) !important; }`);
  }
  if (!reglas.length) return html;
  const style = `<style id="diseno-cliente">${reglas.join("\n")}</style>`;
  if (html.includes("</head>")) return html.replace("</head>", `${style}</head>`);
  if (html.includes("</body>")) return html.replace("</body>", `${style}</body>`);
  return style + html;
}

function buildUserPrompt(product: any, tipo: ProductType, existingHtml: string | null, instruction: string, paleta?: Paleta, pago?: DatosDePago, diseno?: Diseno): string {
  const fotos = fotosDelProducto(product);
  const videos = videosDelProducto(product);
  const imagenesTxt = fotos.length
    ? fotos.map((f, i) => `  ${i + 1}. ${f}${i === 0 ? " (PRINCIPAL - usar en el HERO)" : ""}`).join("\n")
    : "  Ninguna (usa picsum.photos como respaldo)";

  // Sección de checkout según el tipo de producto.
  let checkout = "";
  if (tipo === "dropshipping") {
    checkout = `\nCHECKOUT (FORMULARIO COMPLETO OBLIGATORIO):
- Inclui el formulario completo: nombre, telefono, documento, direccion, barrio (opcional), ciudad, departamento, notas (opcional).
- El <form> usa method="POST" action="__FORM_ACTION__".
- Boton de enviar: "Pedir ahora" o "Completar pedido".`;
  } else if (tipo === "fisico" || tipo === "digital") {
    const cuentasTxt = (pago?.cuentas || []).length
      ? (pago!.cuentas).map((c) => `  * ${c.type}: ${c.number} — titular ${c.name}`).join("\n")
      : "  (sin cuentas de transferencia configuradas: no ofrezcas transferencia)";
    const linkPago = pago?.paymentLink || product?.paymentLink || null;
    const wa = linkWhatsApp(pago?.whatsapp, `Hola! Quiero pagar ${product.name}`);
    checkout = `\nCHECKOUT (DOS OPCIONES DE PAGO):
- OPCION 1 - PAGO DIGITAL: boton "Pagar ahora" con este enlace: ${linkPago || "(sin enlace: usa WhatsApp)"}
- OPCION 2 - TRANSFERENCIA: muestra estas cuentas EXACTAS (no las cambies):
${cuentasTxt}
- Boton "Ya transferi - avisar por WhatsApp" con este link: ${wa || "(sin numero de WhatsApp configurado)"}`;
  }

  let prompt = `PRODUCTO A ANALIZAR:
- Nombre: ${product.name}
- Descripcion: ${product.description || "N/A"}
- Precio: ${product.price} ${product.currency || "USD"}
- Tipo detectado: ${tipo}
- Categoria: ${product.category || "N/A"}
- Highlight: ${product.highlight || "N/A"}
- Features: ${(product.features || []).join(", ") || "N/A"}
- Link de pago: ${product.paymentLink || "N/A"}
- Link de entrega: ${product.deliveryLink || "N/A"}

IMAGENES DEL PRODUCTO (${fotos.length} disponibles - USALAS TODAS):
${imagenesTxt}
${videos.principal ? `\nVIDEO PRINCIPAL DEL PRODUCTO: ${videos.principal}\n(Colocalo con un <video> en la seccion de demo/prueba si aplica)` : ""}

CONTEXTO DEL NEGOCIO:
- Moneda: ${product.currency || "USD"}
- Pais objetivo: Colombia (usar COP si es precio colombiano, USD si es dolar)

PALETA DE COLORES (USALA - NO inventes colores al azar):
${paleta?.primary ? `- Color primario (marca): ${paleta.primary}` : "- Color primario: derivalo del color dominante del producto"}
${paleta?.secondary ? `- Color secundario: ${paleta.secondary}` : ""}
${paleta?.accent ? `- Color de acento (CTAs/botones): ${paleta.accent}` : ""}
${paleta?.dominante ? `- Color dominante de la imagen del producto: ${paleta.dominante}` : ""}
Regla: el fondo y los acentos de la landing deben combinar con estos colores. Nada de colores de fondo al azar.
${diseno?.fondo ? `- Fondo elegido por el cliente: ${diseno.fondo}` : ""}
${diseno?.botones ? `- Estilo de botones elegido por el cliente: ${diseno.botones}` : ""}
${diseno?.color ? `- Color primario elegido por el cliente: ${diseno.color} (prioridad sobre la paleta)` : ""}
${checkout}`;

  if (existingHtml) {
    prompt += `\n\nHTML ACTUAL DE LA LANDING (para que mejores/edites):\n${existingHtml}`;
    prompt += `\n\nINSTRUCCION DEL ADMIN: ${instruction}`;
  } else {
    prompt += `\n\nINSTRUCCION: ${instruction || "Genera una landing page profesional y de alta conversion para este producto."}`;
  }

  prompt += `\n\nRECUERDA: Devuelve SOLO el HTML completo. Sin explicaciones, sin markdown, sin tablas. Solo codigo HTML que empiece con <!DOCTYPE html>.`;

  return prompt;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// ── POST /api/landing-studio/test ──────────────────────────────────────────
router.post("/test", async (req, res) => {
  try {
    const { message, productId } = req.body as { message?: string; productId?: number };
    if (!message?.trim()) return res.status(400).json({ message: "Falta el mensaje" });

    const config = opencodeConfig();
    if (!config) return res.status(503).json({ message: "OpenCode no configurado" });

    let product: any = null;
    if (productId) {
      const rows = await db.select().from(products).where(eq(products.id, productId));
      product = rows[0] || null;
    }

    const tipo = product ? detectarTipo(product) : "digital";
    const paleta = product ? await paletaDelProducto(product) : undefined;
    const pago = product ? await datosDePagoDelProducto(product) : undefined;
    const userPrompt = product
      ? buildUserPrompt(product, tipo, null, message, paleta, pago)
      : `INSTRUCCION: ${message}`;

    const startTime = Date.now();
    const result = await conCandado(async () => {
      const sessionId = await createSession(config.host, config.authHeader);
      return await sendMessage(config.host, config.authHeader, sessionId, {
        system: getSystemPrompt(tipo),
        text: userPrompt,
        timeoutMs: 45_000,
      });
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.error) {
      return res.status(500).json({ error: result.error, elapsed: `${elapsed}s` });
    }

    let html = result.text.trim();
    const codeBlockMatch = html.match(/```(?:html)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) html = codeBlockMatch[1].trim();

    return res.json({ html, elapsed: `${elapsed}s`, length: html.length, tipo, model: result.model });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[LandingStudio/test] error");
    return res.status(500).json({ error: e?.message || "Error interno" });
  }
});

// ── POST /api/landing-studio/design ───────────────────────────────────────
// Guarda el diseño elegido por el cliente y lo hornea en el HTML guardado, para
// que la landing publicada refleje el cambio sin regenerar con IA.
router.post("/design", async (req, res) => {
  try {
    const { landingId, diseno } = req.body as { landingId?: number; diseno?: Diseno };
    if (!landingId) return res.status(400).json({ message: "Falta landingId" });

    const rows = await db.select().from(landingPages).where(eq(landingPages.id, landingId));
    const landing = rows[0];
    if (!landing) return res.status(404).json({ message: "Landing no encontrada" });

    const previo: Diseno = (landing.design && typeof landing.design === "object") ? landing.design : {};
    const nuevo: Diseno = { ...previo, ...(diseno || {}) };
    // Limpia claves en undefined para no guardar basura.
    for (const k of Object.keys(nuevo) as (keyof Diseno)[]) if (nuevo[k] === undefined) delete nuevo[k];

    const htmlBase = landing.html || "";
    const htmlFinal = inyectarDisenoEnHtml(htmlBase, nuevo);

    await db.update(landingPages).set({ design: nuevo, html: htmlFinal, updatedAt: new Date() }).where(eq(landingPages.id, landingId));
    return res.json({ ok: true, design: nuevo, html: htmlFinal });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[LandingStudio/design] error");
    return res.status(500).json({ message: e?.message || "Error interno" });
  }
});

// ── POST /api/landing-studio/chat ──────────────────────────────────────────
router.post("/chat", async (req, res) => {
  try {
    const { message, landingId, productId, diseno } = req.body as {
      message?: string; landingId?: number; productId?: number; diseno?: Diseno;
    };
    if (!message?.trim()) return res.status(400).json({ message: "Falta el mensaje" });

    const config = opencodeConfig();
    if (!config) return res.status(503).json({ message: "OpenCode no configurado" });

    let product: any = null;
    if (productId) {
      try {
        const rows = await db.select().from(products).where(eq(products.id, productId));
        product = rows[0] || null;
      } catch (dbErr: any) {
        logger.error({ err: dbErr?.message }, "[LandingStudio] Error consultando producto");
      }
    }

    let existingHtml: string | null = null;
    let existingLanding: any = null;
    if (landingId) {
      try {
        const rows = await db.select().from(landingPages).where(eq(landingPages.id, landingId));
        existingLanding = rows[0] || null;
        existingHtml = existingLanding?.html || null;
      } catch (dbErr: any) {
        logger.error({ err: dbErr?.message }, "[LandingStudio] Error consultando landing");
      }
    }

    const tipo = product ? detectarTipo(product) : "digital";
    const paleta = product ? await paletaDelProducto(product) : undefined;
    const pago = product ? await datosDePagoDelProducto(product) : undefined;

    // Diseño efectivo: el que manda el cliente ahora, o el guardado en la landing.
    const disenoGuardado = (existingLanding?.design && typeof existingLanding.design === "object") ? existingLanding.design : {};
    const disenoFinal: Diseno = { ...disenoGuardado, ...(diseno || {}) };

    const userPrompt = product
      ? buildUserPrompt(product, tipo, existingHtml, message, paleta, pago, disenoFinal)
      : existingHtml
        ? `HTML ACTUAL:\n${existingHtml}\n\nINSTRUCCION: ${message}`
        : `INSTRUCCION: ${message}`;

    const startTime = Date.now();
    const result = await conCandado(async () => {
      const sessionId = await createSession(config.host, config.authHeader);
      return await sendMessage(config.host, config.authHeader, sessionId, {
        system: getSystemPrompt(tipo),
        text: userPrompt,
        timeoutMs: 45_000,
      });
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.error) {
      logger.error({ error: result.error }, "[LandingStudio] OpenCode error");
      return res.status(500).json({ message: `Error de OpenCode: ${result.error}` });
    }

    let html = result.text.trim();
    const codeBlockMatch = html.match(/```(?:html)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) html = codeBlockMatch[1].trim();
    if (!html.includes("<!DOCTYPE") && !html.includes("<html")) {
      html = result.text;
    }

    let savedLandingId = landingId;
    let slug = existingLanding?.slug || "";
    if (landingId && existingLanding) {
      await db.update(landingPages).set({ html, design: disenoFinal, updatedAt: new Date() }).where(eq(landingPages.id, landingId));
      savedLandingId = landingId;
    } else {
      slug = (product?.name || "landing")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        .slice(0, 60) + "-" + Date.now().toString(36);
      const inserted = await db.insert(landingPages).values({
        tenantId: existingLanding?.tenantId || product?.tenantId || 1,
        productId: productId || null,
        name: `Landing · ${product?.name || "Sin nombre"}`,
        slug,
        status: "draft",
        strategy: { tipo, detectedAt: new Date().toISOString() },
        sections: [],
        design: disenoFinal,
        source: productId ? { type: "product", productId } : {},
        html,
      }).returning({ id: landingPages.id });
      savedLandingId = inserted[0]?.id;
    }

    // Cablear el action del formulario (dropshipping) al endpoint real.
    if (tipo === "dropshipping" && html.includes("__FORM_ACTION__") && savedLandingId != null) {
      html = html.split("__FORM_ACTION__").join(`/api/landing-publica/${encodeURIComponent(slug)}/pedido`);
      await db.update(landingPages).set({ html, updatedAt: new Date() }).where(eq(landingPages.id, savedLandingId));
    }

    return res.json({ html, landingId: savedLandingId, elapsed: `${elapsed}s`, tipo, design: disenoFinal });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[LandingStudio] error general");
    return res.status(500).json({ message: e?.message || "Error interno" });
  }
});

export default router;
