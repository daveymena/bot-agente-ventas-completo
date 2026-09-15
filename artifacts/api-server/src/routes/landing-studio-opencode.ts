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

type ProductType = "dropshipping" | "digital" | "servicio" | "ecommerce";

function detectarTipo(product: any): ProductType {
  const kind = (product?.kind || "").toLowerCase();
  const name = (product?.name || "").toLowerCase();
  const desc = (product?.description || "").toLowerCase();
  const cat = (product?.category || "").toLowerCase();
  const combined = `${kind} ${name} ${desc} ${cat}`;

  if (kind === "physical" || kind === "fisico") return "dropshipping";
  if (/curso|ebook|libro|software|app|plantilla|preset|pack|curso|clase|memoria|guia|manual|video|tutorial|modulo/i.test(combined)) return "digital";
  if (/servicio|consultoria|asesoria|agencia|freelance|coaching|entrenamiento|terapia|salud|belleza|gimnasio|peluqueria|odontolog|medic|abogad|contador|reparacion|mantenimiento|limpieza|fumigacion|transporte|delivery/i.test(combined)) return "servicio";
  if (/tienda|shop|catalogo|multi|varios/i.test(combined)) return "ecommerce";
  return "dropshipping";
}

// ── AGENTE: DROPSHIPPING ──────────────────────────────────────────────────
const DROPSHIPPING_SYSTEM = `Eres un experto en landing pages de DROPSHIPPING y productos fisicos. Generas paginas de venta que convierten visitantes en compradores.

ESTRUCTURA OBLIGATORIA DE LA LANDING:
1. HERO — Titulo que ataca el DOLOR o deseo del cliente. Subtitulo con la PROMESA. boton CTA visible. Imagen del producto.
2. PROBLEMA — Describe el problema que el cliente tiene (2-3 frases). Genera empatia.
3. SOLUCION — Presenta el producto como la solucion. Que es, que hace, como funciona.
4. BENEFICIOS — 4-6 beneficios con iconos. Beneficio = resultado tangible, NO caracteristica.
5. COMO FUNCIONA — Pasos simples (1, 2, 3). Facilita la decision.
6. PRUEBA SOCIAL — Testimonios o garantia. Si no hay testimonios reales, usa garantia de satisfaccion.
7. OFERTA — Precio, descuento si aplica, bonus. Urgencia real (stock limitado, tiempo limitado).
8. CTA FINAL — Repite la promesa del hero. Boton grande de compra.
9. FAQ — 3-5 preguntas frecuentes con respuestas claras.
10. FOOTER — Link de contacto, politicas, redes sociales.

REGLAS PARA DROPSHIPPING:
- Menciona ENVIO a todo el pais o la region relevante.
- Si es contraentrega, resalta "Paga al recibir" como beneficio.
- Usa imagenes del producto que te den. Si no hay, usa picsum.photos.
- Colores: profesionales, no neones. Azul/verde para confianza, naranja/rojo para urgencia.
- El formulario de contacto debe tener: nombre, telefono, email, direccion (si es fisico).
- NO inventes testimonios. Si no los hay, usa "Garantia de devolucion" o "Envio gratis".
- Copy persuasivo: habla en segunda persona ("tu", "te", "tu vida").
- Responsive: que se vea perfecto en celular (375px).

FORMATO DE SALIDA:
SOLO el HTML completo. Empieza con <!DOCTYPE html>. Sin markdown, sin explicaciones, sin \`\`\`html.
TODO el CSS va inline (style="..."). Sin <style> ni clases externas.
Google Fonts via <link> (Inter para texto, Playfair para titulos).
El HTML debe ser AUTONOMO y funcionar solo.`;

// ── AGENTE: DIGITAL ───────────────────────────────────────────────────────
const DIGITAL_SYSTEM = `Eres un experto en landing pages de PRODUCTOS DIGITALES (cursos, ebooks, software, presets, plantillas, packs). Generas paginas de venta que venden conocimiento y acceso inmediato.

ESTRUCTURA OBLIGATORIA DE LA LANDING:
1. HERO — Titulo que promete un RESULTADO. Subtitulo con el beneficio principal. CTA: "Quiero acceso ahora" o similar. Imagen del producto o screenshot.
2. QUIEN SOY — Breve credibilidad del creador. Por que puede enseñar esto.
3. PROBLEMA — El dolor del cliente. Que pierde si no aprende/compra esto.
4. SOLUCION — El producto como atajo. Que obtiene el cliente exactamente.
5. CONTENIDO — Lista de lo que incluye: modulos, videos, archivos, bonuses. Iconos o checkmarks.
6. RESULTADOS — Que podra hacer despues de comprar. Transformacion antes/despues.
7. TESTIMONIOS — Si no hay reales, usa "UNETE a X personas que ya compraron".
8. PRECIO — Precio tachado vs precio real. Bonus con valor agregado. Pago unico o suscripcion.
9. CTA — Boton grande: "Quiero mi acceso", "Descargar ahora", "Empezar hoy".
10. GARANTIA — "30 dias de devolucion" o "Satisfaccion garantizada".
11. FAQ — Preguntas sobre formato, acceso, soporte, duracion.

REGLAS PARA DIGITALES:
- ACCESO INMEDIATO es el beneficio #1. Resaltalo.
- Si es curso: menciona "a tu ritmo", "desde cero", "certificado".
- Si es ebook: "descarga instantanea", "PDF", "lee en cualquier dispositivo".
- Si es software/app: "prueba gratis", "sin instalacion", "soporte 24/7".
- Si es preset/plantilla: "edita en minutos", "compatible con...".
- El CTA debe ser sobre ACCESO, no sobre COMPRA. "Quiero acceso" > "Comprar".
- Copia: educar, no vender. El cliente esta aprendiendo, no comprando.
- Formulario minimo: email y nombre. Opcion de pago directo.
- Responsive: que se vea bien en movil.

FORMATO DE SALIDA:
SOLO el HTML completo. Sin markdown, sin explicaciones.
CSS inline. Google Fonts. Responsive. Autonomo.`;

// ── AGENTE: SERVICIOS ─────────────────────────────────────────────────────
const SERVICIOS_SYSTEM = `Eres un experto en landing pages de SERVICIOS (consultoria, agencias, freelance, coaching, salud, belleza, reparacion, etc). Generas paginas que generan CONFIANZA y bookings/citas.

ESTRUCTURA OBLIGATORIA DE LA LANDING:
1. HERO — Titulo que posiciona como EXPERTO. Subtitulo con el resultado que genera. CTA: "Agenda tu cita" o "Consulta gratis". Foto profesional o imagen relevante.
2. QUIEN ES — Breve presentacion del profesional/empresa. Experiencia, especialidad, enfoque.
3. PROBLEMA — El problema del cliente. Que le cuesta NO resolver esto (tiempo, dinero, salud, etc).
4. SERVICIOS — Lista de servicios ofrecidos. Iconos + nombre + descripcion corta (1 linea).
5. COMO TRABAJA — Proceso paso a paso: 1) Consulta inicial, 2) Diagnostico, 3) Solucion, 4) Seguimiento.
6. RESULTADOS — Casos de exito, estadisticas, antes/despues. Si no hay, usa "Mas de X clientes atendidos".
7. CONFIANZA — Certificaciones, garantias, "Sin compromiso", "Primera consulta gratis".
8. PRECIOS — Opcion basica, premium, VIP. O "Desde $X". Si no hay precios fijos, "Consulta sin compromiso".
9. CTA — Formulario de contacto: nombre, telefono, email, mensaje, fecha preferida. O boton de WhatsApp.
10. UBICACION — Mapa o direccion. Horarios de atencion.
11. FAQ — Preguntas sobre disponibilidad, precios, modalidad, cancelaciones.

REGLAS PARA SERVICIOS:
- CONFIANZA es el factor #1. El cliente esta delegando algo importante.
- Usa lenguaje de EXPERTO: "analizamos", "diagnosticamos", "personalizamos".
- El formulario debe ser FACIL: nombre, telefono, y UN boton de enviar.
- Si es WhatsApp, usa link directo: wa.me/NUMERO?text=Hola...
- Menciona disponibilidad: "Respuesta en menos de 24 horas".
- Horarios: "Lunes a Viernes 9am-6pm".
- Si es servicio local: menciona la zona/ciudad.
- NO uses "Comprar". Usa "Agendar", "Reservar", "Consultar", "Contactar".
- Colores: profesionales. Azul (confianza), verde (salud), morado (premium).

FORMATO DE SALIDA:
SOLO el HTML completo. Sin markdown, sin explicaciones.
CSS inline. Google Fonts. Responsive. Autonomo.`;

// ── AGENTE: ECOMMERCE ─────────────────────────────────────────────────────
const ECOMMERCE_SYSTEM = `Eres un experto en landing pages de ECOMMERCE y catalogos. Generas paginas que muestran multiples productos y facilitan la compra.

ESTRUCTURA OBLIGATORIA DE LA LANDING:
1. HERO — Nombre de la tienda. Logo o tipografia distintiva. Tagline. Buscador o categorias.
2. CATEGORIAS — Grid de categorias con iconos/imagenes. Navegacion faciла.
3. PRODUCTOS DESTACADOS — Grid de 4-8 productos con: imagen, nombre, precio, boton "Ver detalle" o "Agregar al carrito".
4. OFERTAS — Seccion de productos en oferta con precio tachado y descuento visible.
5. BENEFICIOS DE LA TIENDA — Envio gratis, pago contraentrega, devoluciones, soporte.
6. TESTIMONIOS — Opiniones de clientes. Si no hay, "Calificacion 4.8/5" o "X clientes satisfechos".
7. CONTACTO — WhatsApp, email, telefono, redes sociales.
8. FOOTER — Politicas, terminos, mapa del sitio.

REGLAS PARA ECOMMERCE:
- CADA producto debe tener: imagen, nombre, precio, boton de accion.
- El grid debe ser RESPONSIVE: 1 columna en movil, 2-4 en desktop.
- Precios visible GRANDE. El precio es el factor de decision #1.
- Si hay descuento: precio tachado + precio real + "% OFF".
- Buscador o filtros si hay muchos productos.
- Carrito simple: icono + numero de items.
- Colores: consistentes con la marca. Max 3 colores principales.
- Formulario de contacto minimo: solo WhatsApp o email.
- NO uses carrito complejo. Links directos a pago o WhatsApp.

FORMATO DE SALIDA:
SOLO el HTML completo. Sin markdown, sin explicaciones.
CSS inline. Google Fonts. Responsive. Autonomo.`;

// ═══════════════════════════════════════════════════════════════════════════
// CONSTRUCTOR DE PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

function getSystemPrompt(tipo: ProductType): string {
  switch (tipo) {
    case "dropshipping": return DROPSHIPPING_SYSTEM;
    case "digital": return DIGITAL_SYSTEM;
    case "servicio": return SERVICIOS_SYSTEM;
    case "ecommerce": return ECOMMERCE_SYSTEM;
    default: return DROPSHIPPING_SYSTEM;
  }
}

function buildUserPrompt(product: any, tipo: ProductType, existingHtml: string | null, instruction: string): string {
  let prompt = `PRODUCTO A ANALIZAR:
- Nombre: ${product.name}
- Descripcion: ${product.description || "N/A"}
- Precio: ${product.price} ${product.currency || "USD"}
- Tipo detectado: ${tipo}
- Categoria: ${product.category || "N/A"}
- Imagen: ${product.imageUrl || "Ninguna"}
- Highlight: ${product.highlight || "N/A"}
- Features: ${(product.features || []).join(", ") || "N/A"}
- Link de pago: ${product.paymentLink || "N/A"}
- Link de entrega: ${product.deliveryLink || "N/A"}

CONTEXTO DEL NEGOCIO:
- Moneda: ${product.currency || "USD"}
- Pais objetivo: Colombia (usar COP si es precio colombiano, USD si es dolar)`;

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

    const tipo = product ? detectarTipo(product) : "dropshipping";
    const userPrompt = product
      ? buildUserPrompt(product, tipo, null, message)
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

// ── POST /api/landing-studio/chat ──────────────────────────────────────────
router.post("/chat", async (req, res) => {
  try {
    const { message, landingId, productId } = req.body as {
      message?: string; landingId?: number; productId?: number;
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

    const tipo = product ? detectarTipo(product) : "dropshipping";
    const userPrompt = product
      ? buildUserPrompt(product, tipo, existingHtml, message)
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
    if (landingId && existingLanding) {
      await db.update(landingPages).set({ html, updatedAt: new Date() }).where(eq(landingPages.id, landingId));
      savedLandingId = landingId;
    } else {
      const slug = (product?.name || "landing")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        .slice(0, 60) + "-" + Date.now().toString(36);
      const inserted = await db.insert(landingPages).values({
        tenantId: existingLanding?.tenantId || 1,
        productId: productId || null,
        name: `Landing · ${product?.name || "Sin nombre"}`,
        slug,
        status: "draft",
        strategy: { tipo, detectedAt: new Date().toISOString() },
        sections: [],
        design: {},
        source: productId ? { type: "product", productId } : {},
        html,
      }).returning({ id: landingPages.id });
      savedLandingId = inserted[0]?.id;
    }

    return res.json({ html, landingId: savedLandingId, elapsed: `${elapsed}s`, tipo });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[LandingStudio] error general");
    return res.status(500).json({ message: e?.message || "Error interno" });
  }
});

export default router;
