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
import { and, eq } from "drizzle-orm";
import { fotosDelProducto, videosDelProducto } from "../lib/fotos-de-producto";
import { contextoLanding, recordarLanding } from "../lib/landing/memoria";
import { tokensDe } from "../lib/landing/design-system";
import { dbNow } from "../lib/date-utils";

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
          // Investigación y navegación reales: si el admin pide investigar la
          // competencia o pasa una URL de referencia, el agente puede usar
          // webfetch/websearch en vez de responder a ciegas.
          tools: { webfetch: true, websearch: true },
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

  // Todo físico se vende con CONTRAENTREGA salvo que tenga link de pago en
  // línea. Es la misma señal que usa el renderer ("la señal real de
  // contraentrega es que NO haya link de pago"). Dropi importa con kind
  // "physical" (ver dropi_import_product), así que acá NO alcanza con mirar
  // `kind === "dropshipping"`: si es físico sin pago en línea, es dropshipping.
  const esFisico = kind === "physical" || kind === "fisico" || kind === "producto" || kind === "dropshipping";
  if (esFisico) {
    const pagaEnLinea = String(product?.paymentLink || "").trim().length > 0;
    return pagaEnLinea ? "fisico" : "dropshipping";
  }
  if (/\bdropshipping\b/.test(cat)) return "dropshipping";
  if (/curso|ebook|libro|software|app|plantilla|preset|pack|curso|clase|memoria|guia|manual|video|tutorial|modulo/i.test(combined)) return "digital";
  if (/servicio|consultoria|asesoria|agencia|freelance|coaching|entrenamiento|terapia|salud|belleza|gimnasio|peluqueria|odontolog|medic|abogad|contador|reparacion|mantenimiento|limpieza|fumigacion|transporte|delivery/i.test(combined)) return "servicio";
  if (/tienda|shop|catalogo|multi|varios/i.test(combined)) return "ecommerce";
  return "digital";
}

// ── AGENTE: DROPSHIPPING ──────────────────────────────────────────────────
const DROPSHIPPING_SYSTEM = `Eres un experto en landing pages de DROPSHIPPING y productos fisicos que se envian. Generas paginas de venta CORTAS que convierten, con la información ANTES de pedir los datos.

ESTRUCTURA (AIDA — en este orden EXACTO, la información SIEMPRE antes de pedir el pedido):
1. HERO — Titulo corto que nombra el DOLOR/deseo (no el producto) + subtitulo con la PROMESA + imagen principal. El boton NO lleva directo al formulario: baja suavemente a los beneficios.
2. PROBLEMA — 2 frases del dolor real que resuelve. Sin nombrar el producto todavia.
3. SOLUCION — el producto como la respuesta natural al dolor. Una o dos frases.
4. BENEFICIOS — maximo 4, una linea cada uno (icono + 3-6 palabras).
5. OFERTA — precio, y que paga al recibir. Corto, sin urgencia inventada.
6. FORMULARIO COMPLETO — ULTIMO. El cliente ya vio qué es, para qué sirve y cuánto cuesta ANTES de dar sus datos. Es la sección final, nunca antes.
7. FAQ — maximo 3 preguntas cortas.

TONO (importante): informa, no vendas. El cliente no tiene que sentir que le están vendiendo: describí el dolor y cómo el producto lo resuelve, con naturalidad. Nada de "oferta por tiempo limitado" inventada, ni presión, ni urgencia falsa. Menciona ENVIO en una linea: si es contraentrega, "Paga al recibir".

REGLAS DEL FORMULARIO (OBLIGATORIO, sin excepcion):
- Campos exactos en este orden:
  * Nombre completo (input texto)
  * Telefono / celular (input tel)
  * Documento / cedula (input)
  * Direccion de entrega (input)
  * Barrio (opcional)
  * DEPARTAMENTO: usa <select> desplegable con los 32 departamentos de Colombia, NO campo de texto libre.
  * CIUDAD: usa <select> desplegable que se llena segun el departamento elegido, NO campo de texto libre.
  * Campo libre de "notas/referencias" (opcional)
- El formulario usa method="POST" action="__FORM_ACTION__". Boton "Pedir ahora y pagar al recibir".
- Titulo del formulario: "Completa tus datos y recibe el pedido en tu casa".

FORMATO DE SALIDA:
SOLO el HTML completo. Empieza con <!DOCTYPE html>. Sin markdown, sin explicaciones, sin \`\`\`html.
Google Fonts via <link> (Inter para texto, Playfair para titulos).
El HTML debe ser AUTONOMO y funcionar solo (incluido el <script> que llena las ciudades segun el departamento).`;

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
  * OPCION 2 - TRANSFERENCIA: boton "Pagar por transferencia" que abre el WhatsApp del brief — los datos de la cuenta se pasan por PRIVADO en el chat. PROHIBIDO escribir numeros de cuenta o nombres de titular en la pagina.
- NO pidas direccion de envio ni documento. Solo nombre y telefono si acaso.
- Si no hay link de pago, el boton unico es WhatsApp.

FORMATO DE SALIDA:
SOLO el HTML completo. Sin markdown, sin explicaciones.
Google Fonts. Responsive. Autonomo.`;

// ── AGENTE: DIGITAL ───────────────────────────────────────────────────────
const DIGITAL_SYSTEM = `Eres un experto en landing pages de PRODUCTOS DIGITALES (cursos, ebooks, software, membresías, plantillas, presets). Generas páginas de venta con estructura profesional, copy que informa sin vender agresivo, y acceso inmediato como beneficio #1.

ELEGÍ UNA DE ESTAS 3 ESTRUCTURAS según el tipo de producto (ver "CUÁL ELEGIR" abajo):

═══ VARIANTE A — CURSO / PROGRAMA / MASTERCLASS (enseña a lograr algo) ═══
1. HERO — resultado/transformación + CTA "Quiero acceso" + imagen.
2. PROBLEMA — el dolor real, 2 frases.
3. SOLUCIÓN / METODOLOGÍA — el MÉTODO que hace que funcione (qué lo distingue de "mirar videos sueltos"), 2-3 frases.
4. QUÉ INCLUYE — módulos, clases, bonos (lista con checkmarks).
5. CÓMO SE APRENDE — los pasos de la metodología (1 → 2 → 3), una línea cada uno.
6. AUTORIDAD — quién lo enseña y por qué sabe (solo datos reales del brief).
7. RESULTADOS — la transformación concreta que logra.
8. GARANTÍA — 1 frase.
9. PRECIO + PAGO — precio y opciones de pago (reglas abajo).
10. FAQ — máximo 4 preguntas.
11. CTA final.

═══ VARIANTE B — EBOOK / PLANTILLA / PRESET / PACK (compra rápida, precio bajo) ═══
1. HERO — qué es + para quién + CTA.
2. BENEFICIOS — 3-4 cortos.
3. QUÉ INCLUYE — archivos/plantillas con checkmarks.
4. PRECIO + PAGO.
5. GARANTÍA (1 frase).
6. FAQ (3 máx).
7. CTA.

═══ VARIANTE C — SOFTWARE / APP / MEMBRESÍA / PLATAFORMA (producto que maneja datos) ═══
1. HERO — el problema que resuelve + CTA.
2. SOLUCIÓN / CÓMO FUNCIONA — demo breve en 3 pasos.
3. BENEFICIOS — 3-4.
4. CARACTERÍSTICAS / QUÉ INCLUYE.
5. SEGURIDAD Y CONFIDENCIALIDAD — tus datos están protegidos / acceso privado (1-2 frases + bullets con icono de candado).
6. PLANES / PRECIO.
7. FAQ.
8. CTA.

CUÁL ELEGIR: curso/clase/masterclass → A. Ebook/plantilla/preset barato → B. Software/app/membresía/plataforma → C.

REGLAS PARA DIGITALES:
- ACCESO INMEDIATO es el beneficio #1. Dilo en una frase: "Acceso inmediato y 100% online, desde cualquier lugar".
- CTA sobre ACCESO, no compra: "Quiero acceso" > "Comprar".
- NUNCA inventes testimonios, alumnos, ni cifras. Si no hay dato real, no lo pongas.
- LA SECCION DE PAGO ofrece DOS opciones, ambas visibles:
  * OPCION 1 - PAGO DIGITAL: boton grande "Pagar ahora" con el enlace de pago del brief (usalo tal cual).
  * OPCION 2 - TRANSFERENCIA: boton "Pagar por transferencia" que abre el WhatsApp del brief — los datos de la cuenta se pasan por PRIVADO en el chat, NUNCA en la pagina. PROHIBIDO escribir numeros de cuenta o nombres de titular.
- Si no hay enlace de pago, el boton unico es WhatsApp.
- NO pidas documento ni direccion. Solo nombre y email si acaso (o pago directo).

FORMATO DE SALIDA:
SOLO el HTML completo. Sin markdown, sin explicaciones.
Google Fonts. Responsive. Autonomo.`;

// ── AGENTE: SERVICIOS ─────────────────────────────────────────────────────
const SERVICIOS_SYSTEM = `Eres un experto en landing pages de SERVICIOS (citas, consultoría, agencia, coaching, salud, belleza, reparación, freelance). Generas páginas que generan CONFIANZA y agendan citas/consultas, con estructura profesional.

ELEGÍ UNA DE ESTAS 2 ESTRUCTURAS según el tipo de servicio (ver "CUÁL ELEGIR"):

═══ VARIANTE A — CITAS / AGENDAMIENTO (salud, belleza, consulta, terapia, servicio a domicilio) ═══
1. HERO — resultado + CTA "Agenda tu cita" + imagen.
2. PROBLEMA — el dolor, 2 frases.
3. SOLUCIÓN — tu servicio como la respuesta, 2 frases.
4. SERVICIOS — lista de 3-5 (icono + nombre + 1 línea).
5. METODOLOGÍA / CÓMO TRABAJAS — 3 pasos (consulta → solución → seguimiento), una línea cada uno.
6. AUTORIDAD — quién atiende y por qué sabe (solo datos reales).
7. TESTIMONIOS / CASOS — solo si hay reales; si no, no los inventes.
8. UBICACIÓN + HORARIOS — zona/dirección + horarios de atención (si aplica), 1-2 líneas.
9. PRECIOS / PAQUETES — "Desde $X" o paquetes, sin urgencia falsa.
10. AGENDAR CITA — formulario simple (nombre + teléfono) o botón de WhatsApp con mensaje "Quiero agendar una cita". Si es cita, se puede pedir fecha/hora.
11. FAQ — máximo 4.
12. CTA final.

═══ VARIANTE B — AGENCIA / FREELANCE / B2B (servicio por proyecto) ═══
1. HERO — resultado + CTA "Solicitar propuesta".
2. PROBLEMA.
3. SERVICIOS / PAQUETES.
4. PROCESO — 3-4 pasos.
5. PORTAFOLIO / CASOS — trabajos previos (solo si hay reales).
6. TESTIMONIOS (si hay).
7. FAQ.
8. CTA (WhatsApp o formulario).

CUÁL ELEGIR: atención personal con cita (salud, belleza, consulta, terapia, domicilio) → A. Agencia/freelance/desarrollo por proyecto → B.

REGLAS PARA SERVICIOS:
- CONFIANZA es el factor #1. Lenguaje de experto, frases cortas, sin vender agresivo.
- NO uses "Comprar". Usa "Agendar", "Reservar", "Consultar".
- Si es WhatsApp, link directo wa.me/NUMERO con mensaje precargado.
- Formulario de cita FÁCIL: nombre + teléfono + un botón (nunca pidas documento ni dirección a menos que sea servicio a domicilio).
- NUNCA inventes "X años de experiencia", "X clientes", ni certificaciones que no estén en el brief.

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
5. Cada imagen se usa UNA SOLA VEZ en toda la landing: si hay 6 imagenes y 6 secciones con imagen, asigná una distinta a cada una. Repetir la misma foto en dos secciones es un error.
6. Las imagenes van acompañando el titulo de cada bloque: titulo + imagen + texto.
7. Usa <img loading="lazy"> en las imagenes que NO estan en el hero (carga mas rapido).
8. Si una imagen falla, el <img> debe tener alt descriptivo.

REGLAS DE VIDEO (OBLIGATORIAS - si el producto tiene video):
1. El video va en su PROPIA seccion, con titulo propio (ej: "Mira como funciona") y espacio de fondo y padding generoso (padding: 48px 16px o mas).
2. El <video> ocupa el ANCHO COMPLETO de su contenedor: width:100%, max-width 900px, centrado. NUNCA un ancho fijo chico que lo recorte.
3. Relacion de aspecto: aspect-ratio: 16/9. Usa object-fit: contain para que el video se vea ENTERO sin cortarse los lados.
4. Usa controls, preload="metadata" y playsinline. Si hay foto del producto, usala como poster.
5. Dale borde redondeado (border-radius 12-16px) y una sombra suave para que no parezca pegado.
6. Rodealo de fondo: una seccion con fondo suave (blanco o el tono claro del color primario) para que respire y no quede recortado contra los bordes de la pagina.
7. En movil el video tambien va a ancho completo y se ve entero (no recortado).

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
0. ESTRUCTURA DE UNA LANDING DE PRODUCTO PROFESIONAL (referencia: las plantillas de producto de Envato Elements, tipo Promix/Hedpro/Suppke/Bensen). En este orden, cada bloque con aire y una sola idea:
   a) Barra superior fija: marca a la izquierda, botón de compra a la derecha.
   b) Hero: titular de beneficio (no el nombre del producto), subtítulo de una línea, producto GRANDE (foto real, sin recortar) y dos acciones: comprar + ver más. Debajo, una franja de confianza (entrega, pago seguro, garantía real si existe).
   c) Beneficios: 3 a 6 tarjetas con ícono, título corto y una línea.
   d) "Cómo funciona" o "Qué incluye": pasos numerados o grilla de especificaciones/módulos.
   e) Demo: video del producto si hay, o galería de fotos reales.
   f) Oferta: tarjeta con precio grande, qué incluye, botón. Para físico contraentrega, el formulario de pedido.
   g) Preguntas frecuentes (4 a 6) y cierre con el mismo botón.
   h) Barra inferior pegajosa en móvil con precio + botón.
   Nada de secciones de relleno (blog, equipo, contacto genérico).
1. NO uses colores de fondo al azar. Usa la PALETA que te doy en el brief (colores de marca + color dominante del producto).
2. El color PRIMARIO va en fondos de secciones, encabezados y elementos destacados.
3. El color de ACENTO va en botones CTA, precios y elementos de urgencia.
4. El color DOMINANTE del producto sirve para degradados, bordes y detalles.
5. Fondo general: blanco o un tono MUY claro derivado del color primario (ej. si primary es verde, fondo #f0fdf4). Nunca un fondo de color saturado al azar.
6. Contraste legible: texto oscuro sobre fondo claro, texto blanco sobre fondo oscuro del color primario.
7. Si el producto NO tiene paleta definida, deriva los colores de la imagen del producto y de la categoria (tecnologia=azul, salud/belleza=verde/rosa, comida=naranja/rojo, premium/negocio=negro/dorado, educativo=indigo).
8. Maximo 3-4 colores en total. Consistencia en toda la landing.

REGLAS DE DISEÑO PREMIUM (para que se vea cara, no plantilla barata):
1. Aire entre secciones: padding vertical generoso (64-96px en desktop). Nunca secciones pegadas.
2. Jerarquía clara: UN mensaje por sección. Título grande, una frase de apoyo, y el contenido. Nada más.
3. Botones: altura mínima 52px, ancho completo en móvil, con sombra suave de color (no sombra negra dura).
4. Bordes redondeados consistentes (12-16px) en tarjetas, botones e imágenes. Nada de esquinas 0px que parezcan de los 2000.
5. Chips de confianza bajo el hero o junto al precio: "Pago al recibir", "Envío incluido", "Garantía de devolución" como pills pequeñas con borde suave.
6. En móvil, una barra de CTA fija abajo (sticky) con el botón principal: el usuario nunca tiene que buscar cómo comprar.
7. Sombras suaves y difusas (0 20px 50px rgba(0,0,0,.08)), no bordes negros ni box-shadows duras.
8. Un solo acento dominante para los CTA. El resto en grises suaves. Consistencia de punta a punta.
9. Micro-espaciado: los bullets con iconos van con gap, no apilados. Respira.
10. ICONOS SVG SEGUROS (obligatorio, 02-10-2026: los svg sin tamaño se desbordan antes del header):
    TODO <svg> lleva width="15" height="15" y aria-hidden="true".
    La barra superior (topbar/ann-bar) usa spans con display:inline-flex, align-items:center, gap:7px,
    SIN white-space:nowrap global (permite wrap en móvil). Regla CSS obligatoria:
    .topbar svg{width:15px;height:15px;flex:none} .topbar-in span{display:inline-flex;align-items:center;gap:7px}

NOTA: El <style> es obligatorio para los media queries. No todo puede ir inline: las media queries SIEMPRE van en un <style> dentro del <head>.

REGLAS DE INVESTIGACIÓN (solo cuando aplica):
1. Tenés disponible webfetch y websearch. Usalos SOLO si el admin pide investigar (ej: "mirá la competencia X", "fijate qué hace tal página") o te pasa una URL de referencia para tomar estilo.
2. Si NO hay pedido de investigación, NO busques en internet: generá directo con los datos del brief (más rápido y más barato).
3. Lo que encontrás en internet sirve para el ÁNGULO y el ESTILO, NUNCA para copiar condiciones comerciales ajenas (garantías, precios, cupos): esas salen del brief del negocio.`;

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
interface Paleta {
  primary?: string; secondary?: string; accent?: string; dominante?: string; acentoProducto?: string; sobreAcento?: string; tinte?: string; origenAcento?: string;
  /** Para quién es el producto y cómo se le habla (lib/landing/publico-del-producto.ts). */
  publico?: import("../lib/landing/publico-del-producto").LecturaDePublico;
  paletaDePublico?: import("../lib/landing/publico-del-producto").PaletaDePublico;
}

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
  // Color REAL del producto (ffmpeg; `sharp` no está instalado y devolvía
  // null siempre): acento de la landing = color del producto, o el del
  // rubro si el producto es neutro. Ver lib/landing/color-del-producto.ts.
  try {
    const { colorDelProducto } = await import("../lib/landing/color-del-producto");
    const c = await colorDelProducto({
      fotoUrl: foto || null, categoria: product?.category || null, marcaPrimaria: paleta.primary || null,
      nombre: product?.name || null, descripcion: product?.description || null, caracteristicas: product?.features, tipo: product?.kind || null,
    });
    paleta.dominante = c.dominante || undefined;
    paleta.acentoProducto = c.acento; paleta.sobreAcento = c.sobreAcento; paleta.tinte = c.tinte; paleta.origenAcento = c.origen;
    paleta.publico = c.publico; paleta.paletaDePublico = c.paletaDePublico;
  } catch {
    if (foto) { const dom = await colorDominanteDeImagen(foto); if (dom) paleta.dominante = dom; }
  }
  return paleta;
}

// ── Datos de pago del negocio ─────────────────────────────────────────────
// Lo que la landing necesita para cobrar: enlaces de pago REALES de la app
// (MercadoPago/PayPal) y el WhatsApp. NUNCA números de cuenta ni nombres de
// titular: eso es sensible y no se muestra en una página pública.
interface DatosDePago {
  mercadopago?: string;
  paypal?: string;
  whatsapp: string | null;
}

async function datosDePagoDelProducto(product: any): Promise<DatosDePago> {
  const res: DatosDePago = { whatsapp: null };
  try {
    const { tenantManager } = await import("../lib/tenantManager");
    const tenant = await tenantManager.getTenantById(product?.tenantId || 1);
    res.whatsapp = (tenant as any)?.contactPhone || (tenant as any)?.whatsappNumber || null;

    // Enlaces de pago generados por la app (PaymentGateway), no un link crudo
    // del producto: así el botón "Pagar" lleva al checkout real de MercadoPago
    // o PayPal del negocio, con el monto correcto.
    try {
      const { PaymentGateway } = await import("../lib/payments");
      const pg = new PaymentGateway(tenant || undefined);
      const links: any = await pg.getAllLinks(product, { phone: "", name: "Landing" });
      res.mercadopago = links?.mercadopago?.shortUrl || links?.mercadopago?.url || undefined;
      res.paypal = links?.paypal?.shortUrl || links?.paypal?.url || undefined;
    } catch (e: any) {
      logger.warn({ err: e?.message }, "[LandingStudio] no se pudieron generar los enlaces de pago");
    }
  } catch { /* sin tenant: sin enlaces */ }
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

// ── Formulario de dropshipping: GARANTIZADO ────────────────────────────────
// El modelo a veces omite el formulario de pedido (o lo borra al editar). No se
// puede depender de que lo incluya: si no está, se inyecta acá, determinista.
// Es la única sección que NO puede faltar en una landing de dropshipping: sin
// formulario no hay pedido, y sin pedido no hay venta.
function asegurarFormularioDropshipping(html: string): string {
  if (!html) return html;
  const yaTieneFormulario = /<form/i.test(html) && /name=["']direccion["']/i.test(html) && /name=["']telefono["']/i.test(html);
  if (yaTieneFormulario) return html;

  const form = `
<section class="pedido-ds" id="pedido">
  <div class="pedido-ds__wrap">
    <div class="pedido-ds__head">
      <h2>Completa tus datos y recibe el pedido en tu casa</h2>
      <p>Paga al recibir. Sin anticipos.</p>
    </div>
    <form method="POST" action="__FORM_ACTION__" class="pedido-ds__form">
      <div class="pedido-ds__grid">
        <label><span>Nombre completo *</span><input name="nombre" autocomplete="name" required></label>
        <label><span>Celular *</span><input name="telefono" inputmode="tel" autocomplete="tel" required></label>
        <label><span>Documento *</span><input name="documento" inputmode="numeric" required></label>
        <label><span>Departamento *</span><select name="departamento" id="ds-departamento" required></select></label>
        <label><span>Ciudad *</span><select name="ciudad" id="ds-ciudad" required><option value="">Elige un departamento primero</option></select></label>
        <label class="pedido-ds__full"><span>Dirección de entrega *</span><input name="direccion" autocomplete="street-address" required></label>
        <label><span>Barrio</span><input name="barrio"></label>
        <label class="pedido-ds__full"><span>Referencia / notas</span><input name="referencia"></label>
      </div>
      <button type="submit" class="pedido-ds__btn">Pedir ahora y pagar al recibir</button>
      <p class="pedido-ds__note">Pago contra entrega · Envío a todo el país</p>
    </form>
  </div>
</section>
<style>
.pedido-ds{--ds-accent:var(--accent,#2563eb);padding:72px 16px;background:linear-gradient(180deg,color-mix(in srgb,var(--ds-accent) 7%,#ffffff),#ffffff)}
.pedido-ds__wrap{max-width:680px;margin:0 auto}
.pedido-ds__head{text-align:center;margin-bottom:28px}
.pedido-ds__head h2{font-size:clamp(1.5rem,4vw,2rem);font-weight:800;margin:0 0 8px}
.pedido-ds__head p{color:#64748b;margin:0}
.pedido-ds__form{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;box-shadow:0 20px 50px rgba(2,6,23,.08)}
.pedido-ds__grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.pedido-ds__grid label{display:flex;flex-direction:column;gap:6px}
.pedido-ds__grid label span{font-size:.8rem;font-weight:600;color:#334155}
.pedido-ds__grid input,.pedido-ds__grid select{padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;font-size:1rem;width:100%;box-sizing:border-box;background:#fff}
.pedido-ds__grid input:focus,.pedido-ds__grid select:focus{outline:none;border-color:var(--ds-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--ds-accent) 20%,transparent)}
.pedido-ds__full{grid-column:1 / -1}
.pedido-ds__btn{width:100%;margin-top:20px;padding:16px;background:var(--ds-accent);color:#fff;border:none;border-radius:12px;font-size:1rem;font-weight:700;cursor:pointer}
.pedido-ds__btn:hover{filter:brightness(1.05)}
.pedido-ds__note{text-align:center;color:#64748b;font-size:.8rem;margin:14px 0 0}
@media(max-width:600px){.pedido-ds__grid{grid-template-columns:1fr}}
</style>
<script>
(function(){
  var DEPARTAMENTOS = {
    "Amazonas":["Leticia","Puerto Nariño"],
    "Antioquia":["Medellín","Bello","Envigado","Itagüí","Rionegro","Apartadó","Sabaneta","Caucasia"],
    "Arauca":["Arauca","Saravena","Tame"],
    "Atlántico":["Barranquilla","Soledad","Malambo","Baranoa","Sabanalarga"],
    "Bogotá D.C.":["Bogotá"],
    "Bolívar":["Cartagena","Magangué","Turbaco","El Carmen de Bolívar"],
    "Boyacá":["Tunja","Duitama","Sogamoso","Chiquinquirá","Paipa"],
    "Caldas":["Manizales","La Dorada","Chinchiná","Villamaría"],
    "Caquetá":["Florencia","San Vicente del Caguán"],
    "Casanare":["Yopal","Aguazul","Villanueva"],
    "Cauca":["Popayán","Santander de Quilichao","Puerto Tejada"],
    "Cesar":["Valledupar","Aguachica","Codazzi"],
    "Chocó":["Quibdó","Istmina","Bahía Solano"],
    "Córdoba":["Montería","Cereté","Lorica","Sahagún"],
    "Cundinamarca":["Soacha","Chía","Zipaquirá","Facatativá","Girardot","Mosquera","Cajicá","Fusagasugá"],
    "Guainía":["Inírida"],
    "Guaviare":["San José del Guaviare"],
    "Huila":["Neiva","Pitalito","Garzón","La Plata"],
    "La Guajira":["Riohacha","Maicao","Uribia"],
    "Magdalena":["Santa Marta","Ciénaga","Fundación","El Banco"],
    "Meta":["Villavicencio","Acacías","Granada","Puerto López"],
    "Nariño":["Pasto","Ipiales","Tumaco","Túquerres"],
    "Norte de Santander":["Cúcuta","Ocaña","Pamplona","Villa del Rosario"],
    "Putumayo":["Mocoa","Puerto Asís","Orito"],
    "Quindío":["Armenia","Calarcá","Montenegro","La Tebaida"],
    "Risaralda":["Pereira","Dosquebradas","Santa Rosa de Cabal","La Virginia"],
    "San Andrés y Providencia":["San Andrés","Providencia"],
    "Santander":["Bucaramanga","Floridablanca","Girón","Piedecuesta","Barrancabermeja","San Gil"],
    "Sucre":["Sincelejo","Corozal","Tolú","San Marcos"],
    "Tolima":["Ibagué","Espinal","Melgar","Honda"],
    "Valle del Cauca":["Cali","Palmira","Buenaventura","Tuluá","Cartago","Buga","Yumbo","Jamundí"],
    "Vaupés":["Mitú"],
    "Vichada":["Puerto Carreño"]
  };
  var dpto = document.getElementById("ds-departamento");
  var ciudad = document.getElementById("ds-ciudad");
  if (!dpto || !ciudad) return;
  dpto.innerHTML = '<option value="">Elige tu departamento</option>' + Object.keys(DEPARTAMENTOS).map(function(d){ return '<option value="'+d+'">'+d+'</option>'; }).join("");
  dpto.addEventListener("change", function(){
    var ciudades = DEPARTAMENTOS[dpto.value] || [];
    ciudad.innerHTML = '<option value="">Elige tu ciudad</option>' + ciudades.map(function(c){ return '<option value="'+c+'">'+c+'</option>'; }).join("");
  });
})();
</script>`;

  if (html.includes("</body>")) return html.replace("</body>", `${form}</body>`);
  return html + form;
}

// ── Estilo visual (familia) ────────────────────────────────────────────────
// Traduce los tokens de una familia del design system a una instrucción de
// diseño concreta para OpenCode. Así el selector "estilo visual" deja de ser
// decorativo: cambia de verdad la tipografía, los colores, el ritmo, la
// alineación, el tratamiento de imagen y la forma del CTA de la landing.
function instruccionDeFamilia(familia: string | null | undefined, semilla = 0): string {
  if (!familia) return "";
  const t = tokensDe(familia);
  // Dos productos de la misma familia no tienen que abrir igual: el hero rota
  // entre los layouts que la familia admite, según el id del producto.
  const heroes = t.layoutsPreferidos?.hero || [];
  const hero = heroes.length ? heroes[Math.abs(semilla) % heroes.length] : null;
  const heroTxt: Record<string, string> = {
    hero_gradient_product: "fondo con DEGRADADO del acento (de su versión profunda arriba-izquierda a la viva abajo-derecha, con un brillo radial suave), título grande en blanco con la promesa emocional, subtítulo de 1 línea, foto del producto recortada con halo/sombra de color flotando a la derecha (o debajo en móvil), etiqueta 'Pago contraentrega' y CTA pastilla blanca o con degradado; debajo del hero, una franja clara con 3 micro-beneficios con icono",
    hero_center: "título y CTA centrados, foto del producto grande debajo",
    hero_split: "dos columnas: texto a la izquierda, foto del producto a la derecha",
    hero_editorial: "título enorme a la izquierda con la foto recortada a sangre a la derecha",
    hero_offer: "oferta arriba (precio + contraentrega) y la foto ocupando media pantalla",
    hero_product_focus: "la foto del producto es la protagonista a pantalla completa, título encima",
    hero_left: "todo alineado a la izquierda, foto a la derecha con fondo de tinte",
    hero_full_visual: "foto a sangre de fondo con el título encima y velo oscuro",
  };
  const direccion: Record<string, string> = {
    premium: "editorial de lujo: serif expresiva, mucho espacio negativo, detalles finos y producto tratado como pieza de galería",
    "respuesta-directa": "conversión de alto impacto: titular contundente, oferta visible, pasos de lectura rápidos y contraste disciplinado",
    minimal: "minimalismo de marca: una columna limpia, reglas finas, pocas piezas y tipografía precisa",
    editorial: "revista contemporánea: tipografía serif, bloques narrativos, fotografía grande y composición asimétrica",
    ecommerce: "tienda de producto cuidada: galería protagonista, compra clara, atributos y confianza en bloques compactos",
    belleza: "beauty editorial: luz suave, aire, titular elegante, superficies cálidas y fotografía sensorial",
    fitness: "rendimiento y energía: titulares compactos, ritmo diagonal, cifras solo si son reales y contraste deportivo",
    educacion: "academia moderna: temario escaneable, progreso por módulos y mockup real del material sin interfaz inventada",
    tecnologia: "producto digital tech: grilla precisa, tipografía geométrica, diagramas simples y foco en uso real",
    familiar: "marca cercana para hogar: formas cálidas, lectura amable, escenas cotidianas y confianza",
    creativa: "dirección gráfica atrevida: grilla expresiva, color controlado, titulares gráficos y formas con intención",
    oscura: "producto premium oscuro: negro tinta, contraste legible, halo sutil y superficies profundas",
    launch: "lanzamiento contemporáneo: una promesa, visual protagonista, fecha/condición solo si viene en los datos y ritmo de estreno",
    electronica: "ficha tech inmersiva: producto grande, especificaciones ordenadas, acento luminoso y fondos oscuros",
    suplemento: "bienestar informado: claridad, frescura, jerarquía limpia y sin promesas médicas no verificadas",
    gourmet: "gastro editorial: fotografía apetitosa, tonos cálidos, serif medida y bloques breves",
    dropshipping: "venta directa móvil: producto y CTA tempranos, condiciones reales a la vista y lectura por tarjetas",
    clinica: "salud confiable: azul y verde, navegación sobria, textos claros, afirmaciones responsables y formulario simple",
    creator: "creator premium para digital: portada/módulos en capas, lavanda y tinta, tipografía geométrica y entrega digital clara",
    "servicios-pro": "servicio profesional: narrativa de confianza, proceso en pasos, prueba real y agenda/consulta como acción principal",
  };
  const artDirection = direccion[familia] || `${t.nombre}: conserva una identidad visual reconocible y distinta del resto de las familias`;
  return `\n\nESTILO VISUAL ELEGIDO (familia "${t.nombre}" — ${t.cuando}):${hero ? `\n- Apertura (hero): "${hero}" → ${heroTxt[hero] || hero}.` : ""}
- Dirección de arte propia: ${artDirection}. Esta familia debe reconocerse por tipografía, composición, fotografía y ritmo, no solo por el color.
- Tipografía: títulos en ${t.tipografia.display} (peso ${t.tipografia.pesoDisplay}, escala ${t.tipografia.escala}), cuerpo en ${t.tipografia.texto} con interlineado ${t.tipografia.interlineado}.
- Paleta: fondo ${t.color.fondo}, superficies ${t.color.superficie}, texto ${t.color.texto}, texto suave ${t.color.textoSuave}, ACENTO (botones/destacados) ${t.color.acento}, borde ${t.color.borde}.
- Ritmo: contenido de hasta ${t.ritmo.anchoContenido}, secciones con padding vertical ${t.ritmo.padSeccionY} y separación interna ${t.ritmo.separacion}.
- Alineación general: ${t.alineacion}. Fondo: ${t.fondos}${t.fondos === "degradado-vivo" ? " → el hero y el bloque de precio llevan degradado lineal del acento (135deg, de la versión oscura del acento a la viva) con un brillo radial blanco al 20 %; el resto alterna blanco y el tinte suave del acento; tarjetas con fondo blanco al 70 % y borde blanco semitransparente (vidrio suave); botones con degradado del acento y sombra de color; TODO profesional: nada de degradados arcoíris ni más de 2 colores en un degradado" : ""}.
- Imágenes: tratamiento "${t.imagen}". CTA: estilo "${t.cta}".
- Bordes redondeados ${t.forma.radio}, sombra ${t.forma.sombra}.
 - Variedad real: alterná los layouts preferidos de esta familia por bloque; evita repetir la misma cuadrícula de tarjetas en toda la página. Mantén una jerarquía tipográfica clara con tamaños fluidos y ancho de lectura cómodo.
- Movimiento sutil: incorpora entrada progresiva al hacer scroll y microinteracciones de hover/focus en botones, tarjetas y galería. Respeta prefers-reduced-motion y deja la página completa si el movimiento está desactivado.
- Adaptación móvil: una columna, titulares sin desborde, controles táctiles cómodos, CTA visible y sin desplazamiento horizontal.
- Fidelidad: no inventes testimonios, garantías, cifras, interfaces de software ni condiciones comerciales. Los mockups solo pueden representar el material real descrito.
Respetá este estilo en TODA la página: es lo que el admin eligió explícitamente. No lo mezcles con otra paleta.`;
}

function buildUserPrompt(product: any, tipo: ProductType, existingHtml: string | null, instruction: string, paleta?: Paleta, pago?: DatosDePago, diseno?: Diseno, familia?: string | null): string {
  // `__fotosUnicas` lo precalcula generarLandingConOpenCode (deduplicadas por contenido).
  const fotos: string[] = Array.isArray(product?.__fotosUnicas) ? product.__fotosUnicas : fotosDelProducto(product);
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
    const mp = pago?.mercadopago;
    const pp = pago?.paypal;
    const wa = linkWhatsApp(pago?.whatsapp, `Hola! Quiero pagar ${product.name}`);
    const botones = [mp ? `"Pagar ahora" → ${mp}` : "", pp ? `"Pagar con PayPal" → ${pp}` : ""].filter(Boolean).join(" y ");
    checkout = `\nCHECKOUT (PAGO POR LA APP — SIN datos sensibles en la pagina):
- BOTON PRINCIPAL "Pagar ahora": ${botones || "sin enlace de pago configurado: usa WhatsApp"}
- BOTON SECUNDARIO "Pagar por transferencia": abre este WhatsApp ${wa || "(sin numero configurado)"}. La cuenta se le pasa al cliente por PRIVADO en el chat, NUNCA en la pagina.
- PROHIBIDO: escribir numeros de cuenta, nombres de titular, claves ni ningun dato bancario en la landing. El unico dato que se muestra es el precio.`;
  }

  let prompt = `PRODUCTO A ANALIZAR:
- Nombre: ${product.name}
- Descripcion: ${product.description || "N/A"}
- Precio: ${product.price} ${product.currency || "USD"}
- Tipo detectado: ${tipo}
- Categoria: ${product.category || "N/A"}
- Highlight: ${product.highlight || "N/A"}
- Features: ${(product.features || []).join(", ") || "N/A"}
- Link de entrega: ${product.deliveryLink || "N/A"}

IMAGENES DEL PRODUCTO (${fotos.length} disponibles - USALAS TODAS):
${imagenesTxt}
${videos.principal ? `\nVIDEO PRINCIPAL DEL PRODUCTO: ${videos.principal}\n(Incluilo con un <video> en una seccion propia de "Mira como funciona" o demo. Usa controls, preload="metadata" y poster si hay foto. Ancho completo, NO recortado.)` : ""}

CONTEXTO DEL NEGOCIO:
- Moneda: ${product.currency || "USD"}
- Pais objetivo: Colombia (usar COP si es precio colombiano, USD si es dolar)

PALETA DE COLORES (USALA - NO inventes colores al azar):
${familia
  ? (paleta?.acentoProducto
      ? `- El ESTILO VISUAL de abajo pone la composición, la tipografía, el ritmo y los fondos/superficies/texto. El ACENTO (botones, precio, destacados, franjas, iconos) es ${paleta.acentoProducto} — ${paleta.origenAcento === "publico" ? "el color del PÚBLICO del producto (ver PÚBLICO abajo)" : paleta.origenAcento === "foto" ? "el color real del producto en su foto" : paleta.origenAcento === "rubro" ? "el color del rubro (el producto es neutro)" : "el color de marca"} — con texto ${paleta.sobreAcento} encima; para fondos de sección suaves usá ${paleta.tinte}. NO uses el acento genérico del estilo si contradice a este. Los colores de marca del negocio son solo para el logo/encabezado.`
      : `- MANDA la paleta del ESTILO VISUAL de abajo (fondo, superficies, texto y acento). Los colores de marca del negocio son solo para el logo/encabezado o un detalle menor: NO tiñas la página con ellos, y NO uses rosas, lilas ni degradados pastel salvo que el estilo lo indique.`)
  : (paleta?.acentoProducto ? `- Color primario/acento: ${paleta.acentoProducto} (${paleta.origenAcento === "publico" ? "color del público del producto" : paleta.origenAcento === "foto" ? "color real del producto" : "color del rubro"}), texto encima ${paleta.sobreAcento}; tinte para fondos suaves ${paleta.tinte}` : paleta?.primary ? `- Color primario (marca): ${paleta.primary}` : "- Color primario: derivalo del color dominante del producto")}
${paleta?.paletaDePublico ? `
PÚBLICO DEL PRODUCTO (manda sobre el estilo visual y los colores de marca): ${paleta.publico?.porque || ""}
- Tono visual: ${paleta.paletaDePublico.tono}
- Color secundario (detalles, íconos, subrayados): ${paleta.paletaDePublico.secundario}
- Cómo hablarle: ${paleta.paletaDePublico.lenguaje}
- NO uses: ${paleta.paletaDePublico.evitar}
- Todo tiene que verse profesional y coherente de principio a fin: mismos colores en hero, secciones, botones y formulario.` : ""}
${paleta?.primary && familia ? `- Color de marca (solo logo/detalles): ${paleta.primary}` : ""}
${paleta?.secondary && !familia ? `- Color secundario: ${paleta.secondary}` : ""}
${paleta?.accent && !familia ? `- Color de acento (CTAs/botones): ${paleta.accent}` : ""}
${paleta?.dominante ? `- Color dominante de la imagen del producto: ${paleta.dominante} (podés usarlo como acento secundario si combina con el estilo)` : ""}
Regla: el fondo y los acentos de la landing deben combinar con estos colores. Nada de colores de fondo al azar.
${diseno?.fondo ? `- Fondo elegido por el cliente: ${diseno.fondo}` : ""}
${diseno?.botones ? `- Estilo de botones elegido por el cliente: ${diseno.botones}` : ""}
${diseno?.color ? `- Color primario elegido por el cliente: ${diseno.color} (prioridad sobre la paleta)` : ""}
${checkout}${instruccionDeFamilia(familia, Number(product?.id) || 0)}`;

  if (existingHtml) {
    prompt += `\n\nMODO EDICIÓN — NO regeneres la página desde cero. Reglas de oro:\n1. Aplicá SOLO lo que pide el admin. Conservá TODO lo demás EXACTO: secciones, textos, imágenes, colores, tipografía y el formulario/checkout.\n2. NUNCA borres el FORMULARIO de pedido (dropshipping) ni ninguna sección que no te hayan pedido quitar.\n3. Si el pedido es ambiguo, hacé el cambio más pequeño posible.\n4. Devolvé el HTML completo con tu cambio aplicado, pero sin alterar lo que no se pidió.\n\nHTML ACTUAL DE LA LANDING:\n${existingHtml}`;
    prompt += `\n\nINSTRUCCION DEL ADMIN: ${instruction}`;
  } else {
    prompt += `\n\nINSTRUCCION: ${instruction || "Genera una landing page profesional y de alta conversion para este producto."}`;
  }

  prompt += `\n\nRECUERDA: Devuelve SOLO el HTML completo. Sin explicaciones, sin markdown, sin tablas. Solo codigo HTML que empiece con <!DOCTYPE html>.`;

  return prompt;
}

/**
 * Landing PRO: textos del modelo (JSON) + plantilla fija (renderer-pro.ts).
 * Si el modelo falla, la plantilla se llena con los datos del producto.
 */
async function generarLandingPro(a: {
  product: any;
  tipo: ProductType;
  tenantId: number;
  usaAgentePropio: boolean;
  config: ReturnType<typeof opencodeConfig> | null;
  pago: DatosDePago;
  estilo?: "pro" | "clinico";
  timeoutMs?: number;
}): Promise<{ html: string; tipo: ProductType; familia?: string; familiaPorque?: string; quitado?: string[]; proveedor?: string }> {
  const { product, tipo, tenantId } = a;
  // Qué es y cómo cierra: físico contraentrega (Dropi) → formulario; físico
  // con pago en línea o digital → botones de pago; servicio → WhatsApp.
  const tipoPro: "fisico" | "digital" | "servicio" = tipo === "dropshipping" || tipo === "fisico" ? "fisico" : tipo === "servicio" ? "servicio" : "digital";
  const hayEnlaces = !!(a.pago.mercadopago || a.pago.paypal);
  const modo: "contraentrega" | "pago" | "whatsapp" = tipo === "dropshipping" ? "contraentrega" : tipo === "servicio" ? "whatsapp" : hayEnlaces || tipo === "fisico" ? "pago" : "whatsapp";
  const { sistemaContenidoPro, pedidoContenidoPro, contenidoDesdeRespuesta, respuestaProValida } = await import("../lib/landing/contenido-pro");
  const { renderizarLandingPro } = await import("../lib/landing/renderer-pro");
  const { garantiaDelProducto, testimoniosDelProducto } = await import("../lib/landing/plantillas");
  const { redactarConProveedores, htmlDesdeRespuesta } = await import("../lib/landing/agente-landing");

  let ctx: any = null;
  try { const { getBusinessContext } = await import("../lib/business-context"); ctx = await getBusinessContext(tenantId); } catch { /* sin contexto */ }
  const garantia = garantiaDelProducto(product) || ctx?.garantia?.descripcion || null;
  const plazoEntrega = ctx?.entrega?.plazo || null;
  const whatsapp = a.pago.whatsapp || null;
  const datos = {
    name: String(product?.name || "Producto"),
    description: product?.description ?? null,
    features: Array.isArray(product?.features) ? product.features.map(String) : [],
    price: product?.price ?? null,
    category: product?.category ?? null,
  };

  let crudo = "";
  let proveedor: string | undefined;
  try {
    const system = sistemaContenidoPro(tipoPro);
    const user = pedidoContenidoPro(datos, { garantia, plazoEntrega, tipo: tipoPro });
    const r: { text: string; error?: string; proveedor?: string } = a.usaAgentePropio
      ? await redactarConProveedores({
          tenantId, system, user, timeoutMs: a.timeoutMs ?? 90_000, maxTokens: 3000, tarea: "landing-pro",
          // El validador por defecto exige <html>: con él TODA respuesta JSON se
          // descartaba y la landing salía con el texto de respaldo (landings
          // 16 y 20 en producción, "plantilla (sin modelo)", 30-09-2026).
          validar: respuestaProValida,
        })
      : a.config
        ? await conCandado(async () => {
            const sessionId = await createSession(a.config!.host, a.config!.authHeader);
            return await sendMessage(a.config!.host, a.config!.authHeader, sessionId, { system, text: user, timeoutMs: a.timeoutMs ?? 45_000 });
          })
        : { text: "", error: "sin proveedor" };
    crudo = r.error ? "" : String(r.text || "");
    proveedor = r.proveedor;
  } catch { /* se arma con los datos del producto */ }

  let opciones: any[] = [];
  try { const o = typeof product?.opciones === "string" ? JSON.parse(product.opciones) : product?.opciones; opciones = Array.isArray(o) ? o : []; } catch { /* sin opciones */ }
  const unicas = (product as any)?.__fotosUnicas;
  const fotos: string[] = (Array.isArray(unicas) && unicas.length ? unicas : [product?.imageUrl, ...(Array.isArray(product?.images) ? product.images : [])]).filter(Boolean).map(String);
  // Fotos y clips del fabricante (AliExpress, comprobados por visión) que el dueño APROBÓ.
  const { activosAprobados } = await import("../lib/activos-fabricante");
  const fabricante = activosAprobados(product?.metadata);
  for (const f of fabricante.fotos) if (!fotos.includes(f)) fotos.push(f);
  let nombreNegocio = "";
  try { const { tenantManager } = await import("../lib/tenantManager"); const t: any = await tenantManager.getTenantById(tenantId); nombreNegocio = String(t?.brandName || t?.name || ""); } catch { /* sin nombre */ }

  // La MODERNA es el estándar (01-10-2026, el dueño: 'la idea es que generen landings profesionales');
  // el estilo 'clínico' (azul y blanco) sigue saliendo de la plantilla PRO.
  const { renderizarLandingModerna } = await import("../lib/landing/renderer-moderno");
  // Contraentrega (dropshipping): la product page que VENDE en etapa de prueba
  // (modelo Momo Today, ver lib/landing/renderer-cod.ts). Las demás, la moderna.
  const { renderizarLandingCod } = await import("../lib/landing/renderer-cod");
  const { videoDeProducto } = await import("../lib/video-de-producto");
  const video = videoDeProducto(product?.metadata);
  // "Enviamos con…" desde el cotizador de Dropi (idea del dueño 01-10-2026):
  // las transportadoras que maneja la cuenta, sin inventar. Si no hay token
  // o Dropi no lista, la línea simplemente no sale (ver renderer-cod).
  let transportadoras: string[] = [];
  if (modo === "contraentrega") {
    try {
      const { tokenDropiDelTenant, transportadorasGenerales } = await import("../lib/dropi-directo");
      const token = await tokenDropiDelTenant(tenantId);
      if (token) transportadoras = await transportadorasGenerales(token);
    } catch { /* sin transportadoras: la línea no sale */ }
  }
  const renderizar = a.estilo === "clinico"
    ? renderizarLandingPro
    : modo === "contraentrega"
      ? (o: any) => renderizarLandingCod({ ...o, caracteristicas: datos.features, videos: fabricante.clips.length ? fabricante.clips : /\.(mp4|webm)(\?|$)/i.test(video) ? [video] : [], transportadoras })
      : renderizarLandingModerna;
  const html = renderizar({
    contenido: contenidoDesdeRespuesta(crudo, datos, tipoPro),
    producto: { id: product?.id, name: datos.name, price: Number(product?.price) || 0, categoria: datos.category, opciones },
    fotos,
    negocio: { nombre: nombreNegocio, whatsapp },
    accion: "__FORM_ACTION__",
    modo,
    tipo: tipoPro,
    enlaces: { mercadopago: a.pago.mercadopago, paypal: a.pago.paypal },
    estilo: a.estilo === "clinico" ? "clinico" : "pro",
    plazoEntrega,
    garantia,
    testimonios: testimoniosDelProducto(product),
  });
  const r = htmlDesdeRespuesta(html);
  return { html: r.html, tipo, familiaPorque: `plantilla PRO ${a.estilo === "clinico" ? "estilo clínico" : "neutra"} (${tipoPro}, ${modo})`, quitado: r.quitado, proveedor: crudo ? proveedor : "plantilla (sin modelo)" };
}

/**
 * Genera una landing PROFESIONAL con OpenCode (agentes especializados por tipo).
 *
 * Es el camino "premium": a diferencia del generador por plantillas (que arma
 * maquetas a partir de secciones), acá OpenCode escribe el HTML completo con un
 * agente especializado para dropshipping/digital/servicio/etc. Atlas usa esta
 * función vía la herramienta `landing_profesional` para no entregar maquetas
 * genéricas.
 */
export async function generarLandingConOpenCode(opts: {
  product: any;
  instruction: string;
  existingHtml?: string | null;
  diseno?: Diseno;
  familia?: string | null;
  /** Por modelo. Los 45s de siempre valen dentro de un request; en segundo plano se puede esperar más. */
  timeoutMs?: number;
  /** Bitácora de la landing en edición: lo que ya se le pidió antes (ver agente-landing.ts). */
  bitacora?: string;
  /** true = HTML libre del modelo (sin la plantilla PRO). */
  htmlLibre?: boolean;
  /** Variante de la plantilla PRO: "pro" (neutra) o "clinico" (azul/blanco). */
  estilo?: "pro" | "clinico";
  /** Slug ya asignado (landings nuevas por vía familia: el cierre lo necesita). */
  slug?: string | null;
  /** "estilo" = renderer-estilo.ts (port del generador COD, 4 variantes visuales). */
  renderer?: "estilo";
  /** Variante fija (cod|premium|bold|dark); null/undefined = la elige la IA por el producto. */
  style?: string | null;
  /** Secciones actuales de la landing en edición: el copy parte de ellas, no del HTML. */
  seccionesActuales?: any[] | null;
}): Promise<{ html: string; tipo: ProductType; error?: string; familia?: string; familiaPorque?: string; quitado?: string[]; proveedor?: string; sections?: any[]; design?: any; strategy?: any }> {
  const { product, instruction } = opts;
  const tenantIdDelProducto = Number(product?.tenantId) || 1;
  // El agente propio (DeepSeek/Groq del negocio) va primero; el puente de
  // OpenCode queda solo para negocios sin ninguna clave. Ver agente-landing.ts.
  const { hayProveedorPropio, redactarConProveedores, REGLAS_DEL_AGENTE_DE_LANDINGS, htmlDesdeRespuesta } = await import("../lib/landing/agente-landing");
  const usaAgentePropio = await hayProveedorPropio(tenantIdDelProducto);
  const config = usaAgentePropio ? null : opencodeConfig();
  const tipo = detectarTipo(product);

  // ── Vía ESTILO (02-10-2026): port del generador COD ──────────────────────
  // Secciones (copy por el generador local) + renderer-estilo: el HTML sale
  // determinista con sus 4 variantes (cod/premium/bold/dark). Va ANTES del
  // resto porque no necesita OpenCode (el generador local cae a plantilla si
  // el negocio ni siquiera tiene claves) y porque IGNORA el HTML existente:
  // la fuente de verdad son las secciones + design, no el snapshot guardado.
  if (opts.renderer === "estilo" && tipo !== "ecommerce") {
    try {
      const { generarLandingLocal } = await import("./landing-pages-ai");
      const { renderizarLandingEstilo, elegirEstilo, ESTILOS } = await import("../lib/landing/renderer-estilo");
      const slug = String(opts.slug || "");
      const seccionesBase = Array.isArray(opts.seccionesActuales) && opts.seccionesActuales.length ? (opts.seccionesActuales as any[]) : null;
      const g: any = await generarLandingLocal({
        tenantId: tenantIdDelProducto,
        product,
        contexto: seccionesBase
          ? `${instruction}\n\nSECCIONES ACTUALES de la landing (editá SOLO lo que pide la instrucción y conservá el resto):\n${JSON.stringify(seccionesBase)}`
          : instruction,
        estiloExtras: true,
        familia: null,
      });
      const estilo = opts.style && (ESTILOS as readonly string[]).includes(String(opts.style)) ? String(opts.style) : elegirEstilo(product);
      const pago = await datosDePagoDelProducto(product);
      const html = await renderizarLandingEstilo({
        tenantId: tenantIdDelProducto,
        row: { name: g.name, slug, sections: g.sections, design: { ...(g.design || {}), style: estilo } },
        producto: product,
        accion: slug ? `/api/landing-publica/${encodeURIComponent(slug)}/pedido` : "",
        host: "",
        pago: { mercadopago: pago.mercadopago, paypal: pago.paypal },
      });
      const design: any = { ...(g.design || {}), renderer: "estilo", style: estilo };
      delete design.familia;
      if (g.estilo) design.estiloExtras = g.estilo;
      return {
        html,
        tipo,
        familiaPorque: `estilo COD (${estilo})`,
        proveedor: `molde+ia (${(g as any).generatedBy || "ai"})`,
        sections: g.sections,
        design,
        strategy: (g as any).strategy,
      };
    } catch (e: any) {
      return { html: "", tipo, error: `La vía estilo falló: ${e?.message || e}` };
    }
  }

  if (!usaAgentePropio && !config) return { html: "", tipo: "digital", error: "Sin proveedor de IA: el negocio no tiene claves cargadas y OpenCode no está configurado" };

  const existingHtml = opts.existingHtml ?? null;
  const diseno = opts.diseno ?? {};
  // ── Sin familia elegida, se elige por el producto ───────────────────────
  //
  // Medido el 18-09-2026: todas las landings salían con la misma paleta
  // (rosa/violeta) porque, sin familia, OpenCode recibía solo el color de
  // marca del negocio --el mismo para todos los productos-- y rellenaba el
  // resto con su gusto. Las 13 familias de design-system.ts YA tienen paleta
  // por rubro; solo faltaba usarlas cuando el admin no elige una. En modo
  // edición NO se cambia la familia: se respeta la que la página ya tiene.
  let familia = opts.familia ?? null;
  let familiaPorque = "";
  if (!familia && !existingHtml) {
    const { elegirFamilia } = await import("../lib/landing/design-system");
    const e = elegirFamilia({ nombre: product?.name, categoria: product?.category, descripcion: product?.description, tipo: product?.kind, precio: Number(product?.price) || null });
    familia = e.familia;
    familiaPorque = e.porque;
  }
  const paleta = await paletaDelProducto(product);
  const pago = await datosDePagoDelProducto(product);
  const memoria = await contextoLanding(product?.tenantId || 1, { productId: product?.id, tipo });

  // Fotos sin repetidas por contenido (la misma foto bajo 3 URLs, medido 19-09).
  try {
    const { fotosUnicasDelProducto, guardadorDeMetadata } = await import("../lib/fotos-de-producto");
    (product as any).__fotosUnicas = await fotosUnicasDelProducto(product, { guardar: product?.id ? guardadorDeMetadata(Number(product.id)) : undefined });
  } catch { /* se usan las de siempre */ }
  let userPrompt = buildUserPrompt(product, tipo, existingHtml, instruction, paleta, pago, diseno, familia);
  if (memoria) userPrompt += `\n\n${memoria}`;
  if (opts.bitacora) userPrompt += opts.bitacora;
  // Lo que el negocio SÍ tiene definido (garantía, entrega): el modelo no
  // puede prometer lo que no está. Medido 19-09 en la landing 8: "Garantía de
  // devolución" en el hero de un negocio sin garantía cargada.
  let hechosDelNegocio = "";
  let tieneGarantia = false;
  try {
    const { getBusinessContext } = await import("../lib/business-context");
    const ctx: any = await getBusinessContext(tenantIdDelProducto);
    const { garantiaDelProducto, testimoniosDelProducto } = await import("../lib/landing/plantillas");
    // La garantía del PRODUCTO (ej. la de 30 días del proveedor de Dropi) manda
    // sobre la del negocio; sin ninguna de las dos, no se menciona.
    const garantia = garantiaDelProducto(product) || ctx?.garantia?.descripcion || "";
    tieneGarantia = !!garantia;
    const testimonios = testimoniosDelProducto(product);
    hechosDelNegocio =
      "\n\nHECHOS DEL NEGOCIO (lo único que podés prometer):" +
      `\n- Entrega: ${ctx?.entrega ? `${ctx.entrega.metodo} — ${ctx.entrega.plazo}` : "NO definida: no prometas plazos ni 'envío gratis'"}` +
      `\n- Garantía: ${tieneGarantia ? garantia : "NO definida: NO menciones garantía, devolución ni reembolso en ninguna parte"}` +
      (testimonios.length
        ? `\n- TESTIMONIOS REALES (usalos TEXTUALES, con nombre y ciudad, en tarjetas; no agregues ni cambies ninguno):\n${testimonios.map((t) => `  • ${t.nombre}${t.ciudad ? ` (${t.ciudad})` : ""}: "${t.texto}"`).join("\n")}`
        : "\n- Testimonios: NO hay. No pongas sección de testimonios, reseñas, estrellas ni calificaciones.") +
      "\n- Duraciones, cantidades de uso ('20-30 min al día') y cifras: solo si vienen en los datos del producto.";
  } catch { /* sin contexto: el saneador igual actúa */ }
  const system = `${getSystemPrompt(tipo)}\n\n${REGLAS_DEL_AGENTE_DE_LANDINGS}${hechosDelNegocio}`;

  // ── Vía FAMILIA (las 17 mandan, 2026-10-02) ─────────────────────────────
  // Familia explícita en una landing NUEVA: molde (plantilla → secciones →
  // copy) + renderer-v3 con skins y esqueletos por familia. Se guardan
  // secciones (el editor las edita) y el HTML sale del renderer, no del
  // modelo. Sin familia explícita: sigue el camino PRO/moderno/COD de abajo.
  const { esFamilia, elegirFamilia } = await import("../lib/landing/design-system");
  // "Automática" (sin familia explícita): se sugiere por el producto, como en
  // /generate. El tipo catálogo ("ecommerce", varios productos) y el HTML
  // libre siguen su camino de siempre: el molde es de UN producto.
  let familiaV3: string | null = esFamilia(opts.familia) ? String(opts.familia) : null;
  if (!familiaV3 && !existingHtml && !(opts as any).htmlLibre && tipo !== "ecommerce") {
    try {
      familiaV3 = elegirFamilia({ nombre: product?.name, categoria: product?.category, descripcion: product?.description, tipo: product?.kind, precio: Number(product?.price) || null }).familia;
    } catch { familiaV3 = null; }
  }
  if (familiaV3 && !existingHtml && !(opts as any).htmlLibre && tipo !== "ecommerce") {
    try {
      const { generarLandingLocal } = await import("./landing-pages-ai");
      const g = await generarLandingLocal({ tenantId: tenantIdDelProducto, product, contexto: instruction, familia: familiaV3 });
      const { renderizarLanding } = await import("../lib/landing/renderer-v3");
      const { negocioParaRender } = await import("../lib/landing/negocio-para-render");
      const { modeloDelProducto, CONDICIONES_DE_RESPALDO } = await import("../lib/modelo-de-negocio");
      const { getBusinessContext } = await import("../lib/business-context");
      const { fotosUnicasDelProducto, guardadorDeMetadata } = await import("../lib/fotos-de-producto");
      const { enlacesDePagoLocal } = await import("./landing-pages");
      const negocio = await negocioParaRender(tenantIdDelProducto, product);
      const modelo = modeloDelProducto(product as any);
      const ctx = await getBusinessContext(tenantIdDelProducto).catch(() => null);
      const c = ctx?.condiciones ?? CONDICIONES_DE_RESPALDO;
      const slug = String(opts.slug || "");
      const cierre = modelo === "fisico"
        ? { tipo: "contraentrega" as const, accion: slug ? `/api/landing-publica/${encodeURIComponent(slug)}/pedido` : "", pais: c.pais, pago: c.envio.pago }
        : modelo === "digital"
          ? { tipo: "pago" as const, accion: slug ? `/api/landing-publica/${encodeURIComponent(slug)}/cupon` : "", mercadopago: (await enlacesDePagoLocal(tenantIdDelProducto, product)).mercadopago, paypal: (await enlacesDePagoLocal(tenantIdDelProducto, product)).paypal }
          : { tipo: "whatsapp" as const };
      const html = renderizarLanding({
        nombre: g.name,
        secciones: g.sections as any,
        familia: (g.design as any)?.familia ?? familiaV3,
        producto: {
          name: product.name, description: product.description, imageUrl: product.imageUrl,
          images: await fotosUnicasDelProducto(product, product?.id ? { guardar: guardadorDeMetadata(Number(product.id)) } : undefined).catch(() => [product.imageUrl].filter(Boolean)),
          price: product.price, currency: product.currency, paymentLink: product.paymentLink,
          whatsapp: negocio.whatsapp,
          opciones: Array.isArray(product.opciones) ? product.opciones : (typeof product.opciones === "string" ? (() => { try { return JSON.parse(product.opciones); } catch { return null; } })() : null),
        },
        negocio,
        cierre: cierre as any,
      });
      return { html, tipo, familia: (g.design as any)?.familia, familiaPorque: `molde + familia ${(g.design as any)?.familia} (${(g as any)?.plantilla?.nombre || tipo})`, proveedor: `molde+ia (${(g as any)?.generatedBy || "ai"})`, sections: g.sections as any, design: g.design as any, strategy: (g as any)?.strategy };
    } catch (e: any) {
      return { html: "", tipo, error: `La vía de familias falló: ${e?.message || e}` };
    }
  }

  // ── Landing PRO (plantilla elegida por el dueño, 30-09-2026) ────────────
  // Dropshipping NUEVA: el modelo escribe solo los textos (JSON) y la
  // plantilla pone el diseño móvil. Las ediciones siguen por HTML libre.
  // Todos los tipos menos "tienda" (catálogo de varios productos).
  if (tipo !== "ecommerce" && !existingHtml && !opts.htmlLibre) {
    return await generarLandingPro({ product, tipo, tenantId: tenantIdDelProducto, usaAgentePropio, config, pago, estilo: opts.estilo, timeoutMs: opts.timeoutMs });
  }

  let result: { text: string; error?: string; proveedor?: string };
  if (usaAgentePropio) {
    result = await redactarConProveedores({ tenantId: tenantIdDelProducto, system, user: userPrompt, timeoutMs: opts.timeoutMs ?? 150_000 });
  } else {
    result = await conCandado(async () => {
      const sessionId = await createSession(config!.host, config!.authHeader);
      return await sendMessage(config!.host, config!.authHeader, sessionId, { system, text: userPrompt, timeoutMs: opts.timeoutMs ?? 45_000 });
    });
  }

  if (result.error) return { html: "", tipo, error: result.error };

  // Saneado a la salida: el modelo devolvió portada, formulario y fotos por
  // duplicado al editar (landing 4, 19-09). Se quita lo repetido y se cuenta.
  const saneado = htmlDesdeRespuesta(result.text);
  let html = saneado.html;
  if (!tieneGarantia) {
    const { sinGarantiaInventada } = await import("../lib/landing/sanear-html");
    const g = sinGarantiaInventada(html);
    html = g.html;
    saneado.quitado.push(...g.quitado);
  }
  if (!html.includes("<!DOCTYPE") && !html.includes("<!doctype") && !html.includes("<html")) html = result.text;
  if (tipo === "dropshipping") html = asegurarFormularioDropshipping(html);
  if (saneado.quitado.length) console.log(`🧹 [LANDING] Saneado del HTML: ${saneado.quitado.join(", ")}`);

  return { html, tipo, familia: familia || undefined, familiaPorque: familiaPorque || undefined, quitado: saneado.quitado, proveedor: result.proveedor };
}

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// El negocio SIEMPRE sale de la sesión (29-09-2026). Antes el router era
// público, buscaba productos y landings solo por id y, sin producto, usaba el
// negocio 1: cualquiera reescribía landings ajenas con los proveedores de IA
// del dueño. Productos y landings se filtran por este negocio.
const negocioDe = (req: any): number => Number(req.tenant?.id) || 0;

// ── POST /api/landing-studio/test ──────────────────────────────────────────
router.post("/test", async (req, res) => {
  try {
    const tenantId = negocioDe(req);
    if (!tenantId) return res.status(401).json({ message: "Iniciá sesión" });
    const { message, productId } = req.body as { message?: string; productId?: number };
    if (!message?.trim()) return res.status(400).json({ message: "Falta el mensaje" });

    const config = opencodeConfig();
    if (!config) return res.status(503).json({ message: "OpenCode no configurado" });

    let product: any = null;
    if (productId) {
      const rows = await db.select().from(products).where(and(eq(products.id, productId), eq(products.tenantId, tenantId)));
      product = rows[0] || null;
    }

    const tipo = product ? detectarTipo(product) : "digital";
    const paleta = product ? await paletaDelProducto(product) : undefined;
    const pago = product ? await datosDePagoDelProducto(product) : undefined;
    const memoria = await contextoLanding(tenantId, { productId: product?.id, tipo });
    let userPrompt = product
      ? buildUserPrompt(product, tipo, null, message, paleta, pago)
      : `INSTRUCCION: ${message}`;
    if (memoria) userPrompt += `\n\n${memoria}`;

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
    if (tipo === "dropshipping") html = asegurarFormularioDropshipping(html);

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
    const tenantId = negocioDe(req);
    if (!tenantId) return res.status(401).json({ message: "Iniciá sesión" });
    const { landingId, diseno } = req.body as { landingId?: number; diseno?: Diseno };
    if (!landingId) return res.status(400).json({ message: "Falta landingId" });

    const rows = await db.select().from(landingPages).where(and(eq(landingPages.id, landingId), eq(landingPages.tenantId, tenantId)));
    const landing = rows[0];
    if (!landing) return res.status(404).json({ message: "Landing no encontrada" });

    const previo: Diseno = (landing.design && typeof landing.design === "object") ? landing.design : {};
    const nuevo: Diseno = { ...previo, ...(diseno || {}) };
    // Limpia claves en undefined para no guardar basura.
    for (const k of Object.keys(nuevo) as (keyof Diseno)[]) if (nuevo[k] === undefined) delete nuevo[k];

    const htmlBase = landing.html || "";
    const htmlFinal = inyectarDisenoEnHtml(htmlBase, nuevo);

    await db.update(landingPages).set({ design: nuevo, html: htmlFinal, updatedAt: dbNow() }).where(and(eq(landingPages.id, landingId), eq(landingPages.tenantId, tenantId)));
    return res.json({ ok: true, design: nuevo, html: htmlFinal });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[LandingStudio/design] error");
    return res.status(500).json({ message: e?.message || "Error interno" });
  }
});

// ── POST /api/landing-studio/chat ──────────────────────────────────────────
router.post("/chat", async (req, res) => {
  try {
    const tenantId = negocioDe(req);
    if (!tenantId) return res.status(401).json({ message: "Iniciá sesión" });
    const { message, landingId, productId, diseno, familia, estilo, plantilla } = req.body as {
      message?: string; landingId?: number; productId?: number; diseno?: Diseno; familia?: string | null; estilo?: string | null; plantilla?: string | null;
    };
    if (!message?.trim()) return res.status(400).json({ message: "Falta el mensaje" });

    // ── El Studio pasa por el MISMO agente que Atlas ──────────────────────
    //
    // Hasta el 19-09-2026 esta ruta abría su propia sesión con OpenCode: sin
    // las reglas de landing, sin la bitácora, sin fotos únicas ni saneado.
    // Medido por el dueño ese día: "cuando la genero con Atlas la genera
    // bien; desde el generador hace lo que se le da la gana". Una sola
    // puerta: generarLandingConOpenCode (agente propio en cadena; el puente
    // de OpenCode solo si el negocio no tiene ningún proveedor).
    let product: any = null;
    if (productId) {
      try {
        const rows = await db.select().from(products).where(and(eq(products.id, productId), eq(products.tenantId, tenantId)));
        product = rows[0] || null;
      } catch (dbErr: any) {
        logger.error({ err: dbErr?.message }, "[LandingStudio] Error consultando producto");
      }
    }

    let existingHtml: string | null = null;
    let existingLanding: any = null;
    if (landingId) {
      try {
        const rows = await db.select().from(landingPages).where(and(eq(landingPages.id, landingId), eq(landingPages.tenantId, tenantId)));
        existingLanding = rows[0] || null;
        if (!existingLanding) return res.status(404).json({ message: "Landing no encontrada" });
        existingHtml = existingLanding?.html || null;
      } catch (dbErr: any) {
        logger.error({ err: dbErr?.message }, "[LandingStudio] Error consultando landing");
      }
    }
    // Editando una landing sin elegir producto: el producto es el de la landing.
    if (!product && existingLanding?.productId) {
      try {
        const rows = await db.select().from(products).where(and(eq(products.id, Number(existingLanding.productId)), eq(products.tenantId, tenantId)));
        product = rows[0] || null;
      } catch { /* sigue sin producto */ }
    }
    if (!product) return res.status(400).json({ message: "Elegí un producto: el agente de landings trabaja sobre los datos reales del producto." });

    const tipo = detectarTipo(product);

    // Diseño efectivo: el que manda el cliente ahora, o el guardado en la landing.
    const disenoGuardado = (existingLanding?.design && typeof existingLanding.design === "object") ? existingLanding.design : {};
    const disenoFinal: Diseno = { ...disenoGuardado, ...(diseno || {}) };
    // Plantilla del Studio (02-10-2026): "estilo" / "estilo:cod|premium|bold|dark"
    // manda el renderer nuevo; cualquier otro valor crudo es una familia v3.
    // Retrocompatible: sin `plantilla` sigue mandando el campo `familia`.
    const plantillaParam = typeof plantilla === "string" ? plantilla.trim() : "";
    const esEstilo = plantillaParam === "estilo" || plantillaParam.startsWith("estilo:");
    // Diseño premium (lib/landing/renderer-premium.ts): la IA escribe las
    // secciones como siempre y la página la dibuja el renderer premium.
    const esPremiumVp = plantillaParam === "vp:premium";
    const estiloPedido = esEstilo ? (plantillaParam === "estilo" ? null : plantillaParam.slice("estilo:".length)) : null;
    // Familia visual (estilo): la que manda el cliente ahora, o la guardada.
    const familiaElegida = esEstilo || esPremiumVp
      ? null
      : plantillaParam
        ? plantillaParam
        : ((familia ?? (disenoGuardado as any)?.familia ?? null) as string | null);
    const designGuardado: any = { ...disenoFinal, ...(familiaElegida ? { familia: familiaElegida } : {}) };
    if (esPremiumVp) {
      delete designGuardado.familia;
      delete designGuardado.style;
      designGuardado.renderer = "premium";
    }
    if (esEstilo) {
      delete designGuardado.familia;
      designGuardado.renderer = "estilo";
      if (estiloPedido) designGuardado.style = estiloPedido;
      else delete designGuardado.style;
    }

    const { bitacoraDe, textoDeBitacora, anotarEnBitacora } = await import("../lib/landing/agente-landing");
    // La vía de familias hornea el cierre (formulario/links) con el slug: para
    // landings nuevas se reserva acá, antes de generar.
    let slugPrevio = "";
    if (!landingId) {
      slugPrevio = (product?.name || "landing")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        .slice(0, 60) + "-" + Date.now().toString(36);
    }
    const startTime = Date.now();
    const r = await generarLandingConOpenCode({
      product,
      // Vía estilo: se regenera de las secciones (el HTML guardado es solo
      // snapshot), así que la instrucción va literal, sin "EDITÁ el HTML".
      instruction: esEstilo
        ? message
        : existingHtml
          ? `EDITÁ la página existente (viene abajo como HTML). Aplicá SOLO este cambio y devolvé el HTML completo actualizado: ${message}`
          : message,
      existingHtml,
      diseno: disenoFinal,
      familia: familiaElegida,
      estilo: estilo === "clinico" ? "clinico" : "pro",
      renderer: esEstilo ? "estilo" : undefined,
      style: esEstilo ? estiloPedido : undefined,
      seccionesActuales: esEstilo && existingLanding?.sections ? (existingLanding.sections as any[]) : undefined,
      slug: slugPrevio || existingLanding?.slug || undefined,
      timeoutMs: 120_000,
      bitacora: existingLanding ? textoDeBitacora(bitacoraDe(existingLanding)) : "",
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    if (r.error || !r.html) {
      logger.error({ error: r.error }, "[LandingStudio] el agente no devolvió HTML");
      return res.status(500).json({ message: `El agente de landings no pudo generar la página: ${r.error || "sin HTML"}` });
    }
    let html = r.html;
    const motor = r.proveedor || "puente OpenCode";
    const saneado = r.quitado || [];

    let savedLandingId = landingId;
    let slug = existingLanding?.slug || "";
    if (landingId && existingLanding) {
      // Vía estilo: el renderer devuelve el design resuelto (variante +
      // estiloExtras) y las secciones con las que se regeneró; se guardan para
      // que la publicada no dependa del html snapshot.
      await db.update(landingPages).set({
        html,
        design: esEstilo && (r as any).design ? { ...designGuardado, ...(r as any).design } : designGuardado,
        ...((r as any).sections?.length ? { sections: (r as any).sections } : {}),
        updatedAt: dbNow(),
      } as any).where(eq(landingPages.id, landingId));
      savedLandingId = landingId;
    } else {
      slug = slugPrevio || ((product?.name || "landing")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        .slice(0, 60) + "-" + Date.now().toString(36));
      const inserted = await db.insert(landingPages).values({
        tenantId: tenantId,
        productId: productId || null,
        name: `Landing · ${product?.name || "Sin nombre"}`,
        slug,
        status: "draft",
        strategy: (r as any).strategy || { tipo, detectedAt: new Date().toISOString() },
        sections: (r as any).sections || [],
        design: (r as any).design || designGuardado,
        source: productId ? { type: "product", productId } : {},
        html,
      }).returning({ id: landingPages.id });
      savedLandingId = inserted[0]?.id;
    }

    // Garantizar el formulario completo de dropshipping: no depende del modelo.
    // Si el modelo lo omitió (o lo borró al editar), se inyecta acá y se cablea
    // el action al endpoint real de pedido.
    if (tipo === "dropshipping") {
      html = asegurarFormularioDropshipping(html);
      if (savedLandingId != null) {
        html = html.split("__FORM_ACTION__").join(`/api/landing-publica/${encodeURIComponent(slug)}/pedido`);
        await db.update(landingPages).set({ html, updatedAt: dbNow() }).where(eq(landingPages.id, savedLandingId));
      }
    }

    // Guardar en memoria para que la próxima generación no arranque de cero.
    await recordarLanding({
      tenantId: tenantId,
      productId: product?.id ?? productId ?? null,
      productName: product?.name || null,
      tipo,
      slug: slug || null,
      landingId: savedLandingId ?? null,
      instruccion: message || null,
      summary: `Landing ${savedLandingId ? `[${savedLandingId}]` : ""} ${product?.name || ""} (${tipo}).`,
    });

    if (savedLandingId != null) {
      await anotarEnBitacora(Number(savedLandingId), message, saneado.length ? `aplicado (se quitó: ${saneado.join(", ")})` : "aplicado");
      try {
        const [fila] = await db.select().from(landingPages).where(eq(landingPages.id, Number(savedLandingId))).limit(1);
        await db.update(landingPages).set({ strategy: { ...((fila?.strategy as any) || {}), tipo, generador: "opencode", motor, saneado, listaEn: new Date().toISOString() } } as any).where(eq(landingPages.id, Number(savedLandingId)));
      } catch { /* la landing ya quedó guardada */ }
    }

    return res.json({ html, landingId: savedLandingId, elapsed: `${elapsed}s`, tipo, design: designGuardado, motor, saneado });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[LandingStudio] error general");
    return res.status(500).json({ message: e?.message || "Error interno" });
  }
});

export default router;
