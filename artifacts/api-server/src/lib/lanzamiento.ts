/**
 * ============================================================
 * LANZAR UN PRODUCTO: el paquete completo, de punta a punta
 * ============================================================
 *
 * Pedido del dueño (19-09-2026): "agentes extremadamente capacitados para
 * generar landing, copy y anuncio para dropshipping, productos digitales y
 * servicios, que entreguen propuestas completas, profesionales y vendibles,
 * automatizado por completo".
 *
 * Esto NO inventa un agente nuevo por encima de todo: encadena las piezas
 * que ya existen y ya se probaron por separado, con un brief ESPECIALISTA
 * por modelo de negocio y un revisor al final:
 *
 *   1. Ficha: si el producto vino de Dropi y no está curado, se cura
 *      (lib/curador-de-producto.ts; gratuitos primero).
 *   2. Landing: se crea con el agente de landings (mismo camino que Atlas y
 *      el Studio) con la estructura del modelo, se espera a que esté lista y
 *      se publica.
 *   3. Copies: presentación de WhatsApp, 3 ganchos, texto/títulos/descripción
 *      para Meta y guion de video. Pasan por `marcasSinRespaldo` (nada que
 *      la ficha no respalde) y se rehacen con las notas si no pasan.
 *   4. Anuncio: borrador en Meta EN PAUSA con AdStrategist (si hay
 *      credenciales). Activarlo siempre es decisión del dueño.
 *   5. Resumen al dueño por WhatsApp con enlaces y lo que falta aprobar.
 *
 * El paquete queda en `products.metadata.lanzamiento` para que Atlas y el
 * panel lo muestren y para no volver a generar lo que ya está.
 */
import { db, products, landingPages, tenants } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";
import { modeloDelProducto, type ModeloDeNegocio } from "./modelo-de-negocio";
import { ORDEN_GRATUITOS_PRIMERO, redactarConProveedores } from "./landing/agente-landing";

export interface OpcionesLanzamiento {
  presupuestoDiario?: number | null;
  /** Crear el anuncio en Meta (en pausa). Por defecto sí, si hay credenciales. */
  conAnuncio?: boolean;
  /** Video del anuncio con el motor propio (por defecto sí). */
  conVideo?: boolean;
  /** Publicar la landing al terminar. Por defecto sí. */
  publicar?: boolean;
  /** Avisar al dueño por WhatsApp. Por defecto sí. */
  notificar?: boolean;
  /** Regenerar aunque ya exista un paquete. */
  forzar?: boolean;
  sessionId?: string;
}

export interface Copies {
  whatsapp: string;
  ganchos: string[];
  meta: { primaryText: string; headlines: string[]; description: string };
  guionVideo: string;
  revisadoPor?: string;
  notasDelRevisor?: string[];
}

export interface PaqueteDeLanzamiento {
  productId: number;
  modelo: ModeloDeNegocio;
  en: string;
  ficha: { curada: boolean; por?: string | null };
  landing: { id: number | null; url: string | null; estado: "lista" | "generando" | "fallo" | "omitida"; motor?: string | null; nota?: string };
  copies: Copies | null;
  anuncio: { draftId: number | null; estado: "borrador" | "omitido" | "fallo"; nota?: string };
  video?: { estado: "generando" | "listo" | "fallo" | "omitido"; url?: string | null; nota?: string };
  pendiente: string[];
  resumen: string;
}

// ─── Especialistas por modelo ───────────────────────────────────────────────

/** Estructura y reglas de la landing según qué pasa después del "sí". */
export function briefDeLanding(modelo: ModeloDeNegocio, p: any, ficha: any): string {
  const base = `Producto: "${p.name}" · $${Number(p.price || 0).toLocaleString("es-CO")} COP.` +
    (ficha?.beneficioPrincipal ? ` Beneficio principal: ${ficha.beneficioPrincipal}.` : "") +
    ` Usá SOLO los datos del producto y del negocio; cada foto una sola vez; UN formulario/cierre; nada de garantías, plazos, descuentos, urgencias ni testimonios inventados.`;
  if (modelo === "fisico") {
    return `Landing de venta CONTRAENTREGA (dropshipping Colombia), mobile-first, estructura: ` +
      `1) Hero con el DOLOR real del comprador y una foto; precio y un botón. 2) La causa (2-3 líneas). 3) Cómo lo resuelve el producto (qué es y cómo se usa). ` +
      `4) 4-6 beneficios concretos con emoji. 5) Segunda foto en uso. 6) Qué incluye / especificaciones (solo las reales). 7) Precio único con envío y pago al recibir. ` +
      `8) UN formulario de pedido (nombre, celular, cédula, dirección, barrio, departamento, ciudad, cantidad). 9) 3 preguntas frecuentes (pago, envío a mi ciudad, talla/uso). 10) Cierre con un solo botón al formulario. ` +
      `Tono: DIRECTO y EMOCIONAL (habla del dolor/deseo real del comprador en segunda persona, frases cortas, verbos de acción, cero relleno corporativo); cada sección corta y con un solo mensaje; el botón repite siempre "Pedir ahora · pago contraentrega". ` +
      `Estilo: moderno y profesional con DEGRADADOS del color del producto (familia "dropshipping"): hero con degradado vivo, foto del producto con halo, tarjetas de vidrio suave, botones pastilla con degradado. Nada de blanco/negro/dorado de tienda vieja. ${base}`;
  }
  if (modelo === "digital") {
    return `Landing de PRODUCTO DIGITAL (curso/plantilla/acceso), mobile-first, estructura: ` +
      `1) Hero con la TRANSFORMACIÓN (de dónde a dónde) y una imagen. 2) Para quién es / para quién no. 3) Qué incluye exactamente (módulos o piezas reales, sin inventar cantidades). ` +
      `4) Cómo se entrega y cómo se accede (solo lo que el negocio define). 5) Objeciones: "¿sirve si empiezo de cero?", "¿cuánto tiempo?", "¿cómo pago?". ` +
      `6) Precio con el botón de pago (MercadoPago/PayPal/WhatsApp según exista). 7) FAQ. 8) Cierre. Estilo limpio y de confianza (educación/tecnología según el tema). ${base}`;
  }
  // servicio / cotización / cita / suscripción
  return `Landing de SERVICIO, mobile-first, estructura: 1) Hero con el problema que resuelve y para quién. 2) El método en 3 pasos. 3) Qué entrega y qué no. ` +
    `4) Cómo empieza (agenda / cotización / WhatsApp) con UN botón. 5) Preguntas frecuentes reales. 6) Cierre. Sin promesas de resultados garantizados. ${base}`;
}

const SYSTEM_COPIES = `Sos el redactor senior de una agencia de performance en Colombia. Escribís copies que venden con hechos, no con adjetivos.
Devolvés SOLO un JSON: {"whatsapp":"…","ganchos":["…","…","…"],"meta":{"primaryText":"…","headlines":["…","…","…"],"description":"…"},"guionVideo":"…"}
- whatsapp: presentación de 3-4 líneas para mandar por WhatsApp (sin precio; termina con una pregunta corta).
- ganchos: 3 primeras líneas distintas para anuncios (dolor / curiosidad / resultado), máximo 90 caracteres cada una.
- meta.primaryText: 4-7 líneas, una idea por línea, un emoji por línea como máximo, sin mayúsculas sostenidas; cierra con llamado a la acción.
- meta.headlines: 3 títulos de máximo 40 caracteres. meta.description: máximo 30 palabras.
- guionVideo: 20-30 segundos, formato "0-3s: … / 3-10s: … / …", para grabar con el producto.
PROHIBIDO: garantías, plazos de entrega, descuentos, precio tachado, "el más vendido", cifras de clientes, testimonios, resultados médicos, envío gratis, y cualquier dato que no esté en la ficha o en los hechos del negocio. Español de Colombia, acentos perfectos.`;

function fichaTexto(p: any, meta: any, negocio: any): string {
  const feats: string[] = Array.isArray(p.features) ? p.features : [];
  const cur = meta?.curado || {};
  return [
    `Nombre: ${p.name}`, `Precio: $${Number(p.price || 0).toLocaleString("es-CO")} COP`, `Tipo: ${p.kind}`,
    p.description ? `Descripción: ${String(p.description).slice(0, 1200)}` : "",
    feats.length ? `Características: ${feats.join(" | ")}` : "",
    cur.beneficioPrincipal ? `Beneficio principal: ${cur.beneficioPrincipal}` : "",
    meta?.dropiBodega ? `Despacha desde: ${meta.dropiBodega}` : "",
    negocio?.entrega ? `Entrega (hecho del negocio): ${negocio.entrega.metodo} — ${negocio.entrega.plazo}` : "Entrega: NO definida (no la menciones)",
    negocio?.garantia?.descripcion ? `Garantía (hecho del negocio): ${negocio.garantia.descripcion}` : "Garantía: NO definida (no la menciones)",
  ].filter(Boolean).join("\n");
}

function extraerJson(t: string): any | null {
  const s = String(t || ""); const b = s.match(/```(?:json)?\s*([\s\S]*?)```/); const c = (b ? b[1] : s).trim();
  const i = c.indexOf("{"); const j = c.lastIndexOf("}"); if (i < 0 || j <= i) return null;
  try { return JSON.parse(c.slice(i, j + 1)); } catch { return null; }
}
const copiesValidos = (j: any) => !!j && typeof j.whatsapp === "string" && Array.isArray(j.ganchos) && j.ganchos.length >= 2 && j.meta && typeof j.meta.primaryText === "string" && Array.isArray(j.meta.headlines);

/** Copies con revisor: si el revisor marca inventos, se rehacen una vez con sus notas. */
export async function generarCopies(tenantId: number, p: any, meta: any, negocio: any, modelo: ModeloDeNegocio): Promise<Copies | null> {
  const { respaldoDe, marcasSinRespaldo } = await import("./anuncio-inteligente");
  const respaldo = respaldoDe({ name: p.name, description: p.description, features: p.features } as any);
  const ficha = fichaTexto(p, meta, negocio);
  let notas: string[] = [];
  let ultimo: Copies | null = null;
  for (let intento = 0; intento < 2; intento++) {
    const r = await redactarConProveedores({
      tenantId, system: SYSTEM_COPIES,
      user: `MODELO DE NEGOCIO: ${modelo}\n\nFICHA Y HECHOS:\n${ficha}${notas.length ? `\n\nEL REVISOR RECHAZÓ EL INTENTO ANTERIOR POR ESTO (corregilo):\n- ${notas.join("\n- ")}` : ""}`,
      maxTokens: 1400, timeoutMs: 30_000, orden: ORDEN_GRATUITOS_PRIMERO, tarea: "copies", validar: (t) => copiesValidos(extraerJson(t)),
    });
    if (!r.text) return ultimo;
    const j = extraerJson(r.text);
    const c: Copies = {
      whatsapp: String(j.whatsapp).trim(), ganchos: j.ganchos.map((g: any) => String(g).trim()).slice(0, 3),
      meta: { primaryText: String(j.meta.primaryText).trim().split("\n").map((l: string) => l.replace(/^(\s*)(\p{L})/u, (_m, sp, ch) => sp + ch.toUpperCase())).join("\n"), headlines: j.meta.headlines.map((h: any) => String(h).trim()).slice(0, 3), description: String(j.meta.description || "").trim() },
      guionVideo: String(j.guionVideo || "").trim(), revisadoPor: r.proveedor ? `${r.proveedor}/${r.modelo}` : undefined,
    };
    ultimo = c;
    // Revisor: nada que la ficha no respalde.
    const todo = [c.whatsapp, ...c.ganchos, c.meta.primaryText, ...c.meta.headlines, c.meta.description, c.guionVideo].join("\n");
    const sinRespaldo = marcasSinRespaldo(todo, respaldo);
    const prohibido = todo.match(/garant[ií]a|devoluci[oó]n|reembolso|d[ií]as h[aá]biles|env[ií]o gratis|el m[aá]s vendido|\d+\s*clientes|descuento|antes \$/gi) || [];
    notas = [...new Set([...sinRespaldo.map((m) => `afirma "${m}" y la ficha no lo respalda`), ...prohibido.map((m) => `usa "${m}", prohibido`)])];
    if (!notas.length) return c;
    c.notasDelRevisor = notas;
    logger.info({ productId: p.id, intento, notas }, "[Lanzamiento] el revisor pidió rehacer los copies");
  }
  return ultimo;
}

// ─── Landing ────────────────────────────────────────────────────────────────

async function crearYPublicarLanding(tenantId: number, p: any, brief: string, familia: string | null, publicar: boolean, sessionId?: string): Promise<PaqueteDeLanzamiento["landing"]> {
  const { lanzarGeneracionDeLandingEnSegundoPlano, estadoDeGeneracion } = await import("./app-operator");
  const slug = `${String(p.name).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "landing"}-${Date.now().toString(36)}`;
  const [creada] = await db.insert(landingPages).values({
    tenantId, productId: p.id, name: `Landing · ${p.name}`.slice(0, 200), slug, status: "draft",
    strategy: { generando: true, desde: new Date().toISOString(), instruccion: brief.slice(0, 500), origen: "lanzamiento" },
    sections: [], design: familia ? { familia } : {}, source: { type: "product", productId: p.id }, html: null,
  } as any).returning();
  lanzarGeneracionDeLandingEnSegundoPlano({ tenantId, sessionId } as any, { landingId: creada.id, slug, product: p, instruccion: brief, familia });

  // Esperar a que termine (máx. 4 min).
  const limite = Date.now() + 4 * 60_000;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 5000));
    const [l] = await db.select().from(landingPages).where(eq(landingPages.id, creada.id)).limit(1);
    const est = estadoDeGeneracion(l);
    if (est.estado === "generando") continue;
    if (est.estado === "fallo") return { id: creada.id, url: null, estado: "fallo", nota: est.texto.slice(0, 200) };
    let url: string | null = null;
    if (publicar) {
      const { urlPublicaDe } = await import("../routes/landing-publica");
      url = urlPublicaDe(slug);
      await db.update(landingPages).set({ status: "published", publishedUrl: url, updatedAt: new Date() } as any).where(eq(landingPages.id, creada.id));
    }
    return { id: creada.id, url, estado: "lista", motor: (l as any)?.strategy?.motor || null };
  }
  return { id: creada.id, url: null, estado: "generando", nota: "sigue generándose; ver landing_estado" };
}

// ─── Anuncio ────────────────────────────────────────────────────────────────

async function crearBorradorDeAnuncio(tenantId: number, productId: number, copies: Copies | null, presupuesto: number | null): Promise<PaqueteDeLanzamiento["anuncio"]> {
  try {
    const { tenantManager } = await import("./tenantManager");
    const tenant = await tenantManager.getTenantById(tenantId);
    const { credencialesFacebookDe } = await import("./tenant-facebook-credentials");
    const fb = credencialesFacebookDe(tenant as any);
    if (!fb.accessToken || !fb.adAccountId) return { draftId: null, estado: "omitido", nota: "Sin credenciales de Meta cargadas: el anuncio no se creó." };
    const { AdStrategist } = await import("./ad-strategist");
    const grounded = copies ? { primaryText: copies.meta.primaryText, headline: copies.meta.headlines[0], description: copies.meta.description } as any : undefined;
    const draft = await new AdStrategist(tenant as any).createDraftAd(fb.adAccountId, fb.accessToken, productId, grounded, undefined, undefined, presupuesto || undefined);
    return { draftId: Number((draft as any)?.id) || null, estado: "borrador", nota: "Borrador guardado; se sube a Meta EN PAUSA cuando lo apruebes." };
  } catch (e: any) {
    return { draftId: null, estado: "fallo", nota: String(e?.message || e).slice(0, 200) };
  }
}

// ─── Orquestador ────────────────────────────────────────────────────────────

export async function lanzarProducto(tenantId: number, productId: number, opts: OpcionesLanzamiento = {}): Promise<PaqueteDeLanzamiento> {
  const [p] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
  if (!p) throw new Error(`No existe el producto ${productId} en este negocio.`);
  let meta: any = {};
  try { meta = typeof (p as any).metadata === "string" ? JSON.parse((p as any).metadata) : ((p as any).metadata || {}); } catch { /* sin metadata */ }
  if (meta?.lanzamiento && !opts.forzar) return meta.lanzamiento as PaqueteDeLanzamiento;

  const modelo = modeloDelProducto(p as any);
  const { getBusinessContext } = await import("./business-context");
  const negocio: any = await getBusinessContext(tenantId).catch(() => null);
  const pendiente: string[] = [];

  // 1) Ficha curada (solo productos de Dropi sin curar).
  let fichaInfo: PaqueteDeLanzamiento["ficha"] = { curada: !!meta?.curado, por: meta?.curado?.por || null };
  if (meta?.dropiProductId && !meta?.curado) {
    try {
      const { curarProducto } = await import("./curador-de-producto");
      const ficha = await curarProducto(tenantId, { id: Number(meta.dropiProductId), nombre: String((p as any).name), descripcionHtml: (p as any).description, categoria: (p as any).category, proveedor: meta.dropiSupplierNombre, bodegaCiudad: meta.dropiBodega, costo: meta.dropiCost, precioSugerido: null, stock: meta.dropiStock });
      if (ficha) {
        meta = { ...meta, curado: { por: ficha.curadoPor || null, en: new Date().toISOString(), beneficioPrincipal: ficha.beneficioPrincipal, copyWhatsapp: ficha.copyWhatsapp, preguntasFrecuentes: ficha.preguntasFrecuentes, complementadoDesde: ficha.complementadoDesde } };
        await db.update(products).set({ name: ficha.nombre, description: ficha.descripcion, features: ficha.caracteristicas, category: ficha.categoria, metadata: JSON.stringify(meta) } as any).where(eq(products.id, productId));
        (p as any).name = ficha.nombre; (p as any).description = ficha.descripcion; (p as any).features = ficha.caracteristicas;
        fichaInfo = { curada: true, por: ficha.curadoPor || null };
      }
    } catch (e: any) { logger.warn({ productId, err: e?.message }, "[Lanzamiento] no se pudo curar la ficha"); }
  }
  if (!negocio?.entrega) pendiente.push("Cargar cómo se entrega (plazo y método) en el perfil del negocio");
  if (modelo === "digital" && !(p as any).deliveryLink) pendiente.push("Cargar el enlace de entrega del producto digital");

  // 2) Landing con el brief especialista.
  // La familia sale del RUBRO (design-system.elegirFamilia), no fija por
  // modelo: "ecommerce" para todo físico hacía que todas las landings de
  // Dropi fueran la misma plantilla (medido 20-09-2026).
  const { elegirFamilia } = await import("./landing/design-system");
  const eleccion = elegirFamilia({ nombre: (p as any).name, categoria: (p as any).category, descripcion: (p as any).description, tipo: (p as any).kind, precio: Number((p as any).price) || null });
  const familia = eleccion.familia;
  const landing = await crearYPublicarLanding(tenantId, p, briefDeLanding(modelo, p, meta?.curado), familia, opts.publicar !== false, opts.sessionId);
  if (landing.estado !== "lista") pendiente.push(`Landing: ${landing.nota || landing.estado}`);

  // 3) Copies revisados.
  const copies = await generarCopies(tenantId, p, meta, negocio, modelo);
  if (!copies) pendiente.push("Copies: ningún modelo devolvió una propuesta válida");
  else if (copies.notasDelRevisor?.length) pendiente.push(`Copies con observaciones del revisor: ${copies.notasDelRevisor.slice(0, 2).join("; ")}`);

  // 4) Anuncio en borrador.
  const anuncio = opts.conAnuncio === false ? { draftId: null, estado: "omitido" as const, nota: "No se pidió anuncio." } : await crearBorradorDeAnuncio(tenantId, productId, copies, opts.presupuestoDiario ?? null);
  if (anuncio.estado === "borrador") pendiente.push("Aprobar el anuncio (se sube a Meta en pausa) y definir presupuesto");
  else if (anuncio.nota) pendiente.push(`Anuncio: ${anuncio.nota}`);

  // ── Video del anuncio (motor propio), en segundo plano ──────────────────
  // Se dispara después de las copies (usa sus ganchos y el guion previo) y no
  // frena el paquete: tarda 2–5 min y avisa solo con el enlace.
  let video: PaqueteDeLanzamiento["video"] = { estado: "omitido", nota: "No se pidió video." };
  if (opts.conVideo !== false) {
    try {
      const { generarVideoEnSegundoPlano, hayFfmpeg } = await import("./video-anuncio");
      if (await hayFfmpeg()) {
        generarVideoEnSegundoPlano(tenantId, productId, async (r) => {
          try {
            const [fila] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
            let mm: any = {}; try { mm = typeof (fila as any)?.metadata === "string" ? JSON.parse((fila as any).metadata) : ((fila as any)?.metadata || {}); } catch { /* nada */ }
            if (mm?.lanzamiento) {
              mm.lanzamiento.video = r.ok && r.video ? { estado: "listo", url: r.video.url } : { estado: "fallo", nota: r.error };
              await db.update(products).set({ metadata: JSON.stringify(mm) } as any).where(eq(products.id, productId));
            }
            if (opts.notificar !== false) {
              const { avisarAlDueno } = await import("./avisos");
              await avisarAlDueno(tenantId, r.ok && r.video ? `🎬 *Video del anuncio listo* para ${(p as any).name} (${r.video.duracion}s${r.video.conBroll ? ", con clips reales" : ""})\n${r.video.url}` : `⚠️ El video de ${(p as any).name} no salió: ${r.error}`);
            }
          } catch { /* sin aviso */ }
        });
        video = { estado: "generando", nota: "Tarda 2–5 min; el enlace llega por WhatsApp/Telegram." };
      } else {
        video = { estado: "fallo", nota: "El servidor no tiene ffmpeg." };
      }
    } catch (e: any) {
      video = { estado: "fallo", nota: String(e?.message || e) };
    }
  }

  const resumen = [
    `🚀 *Paquete de lanzamiento: ${(p as any).name}* (${modelo})`,
    fichaInfo.curada ? `📋 Ficha organizada${fichaInfo.por ? ` por ${fichaInfo.por}` : ""}` : "📋 Ficha: la del catálogo",
    landing.url ? `🌐 Landing publicada: ${landing.url}` : `🌐 Landing: ${landing.estado}${landing.nota ? ` (${landing.nota})` : ""}`,
    copies ? `✍️ Copies listos (WhatsApp, 3 ganchos, Meta, guion de video)${copies.revisadoPor ? ` · ${copies.revisadoPor}` : ""}` : "✍️ Copies: no se pudieron generar",
    anuncio.estado === "borrador" ? `📢 Anuncio en borrador #${anuncio.draftId} (en pausa hasta que lo apruebes)` : `📢 Anuncio: ${anuncio.nota || anuncio.estado}`,
    video?.estado === "generando" ? "🎬 Video del anuncio: generándose, te llega el enlace en unos minutos" : video?.estado === "listo" ? `🎬 Video: ${video.url}` : video?.nota ? `🎬 Video: ${video.nota}` : "",
    pendiente.length ? `\n⏳ Pendiente:\n• ${pendiente.join("\n• ")}` : "\n✅ Nada pendiente de tu lado salvo revisar.",
  ].filter(Boolean).join("\n");

  const paquete: PaqueteDeLanzamiento = { productId, modelo, en: new Date().toISOString(), ficha: fichaInfo, landing, copies, anuncio, video, pendiente, resumen };
  await db.update(products).set({ metadata: JSON.stringify({ ...meta, lanzamiento: paquete }) } as any).where(eq(products.id, productId));

  if (opts.notificar !== false) {
    try {
      const { avisarAlDueno } = await import("./avisos");
      await avisarAlDueno(tenantId, resumen);
    } catch (e: any) { logger.warn({ productId, err: e?.message }, "[Lanzamiento] no se pudo avisar al admin"); }
  }
  logger.info({ tenantId, productId, modelo, landing: landing.estado, anuncio: anuncio.estado }, "[Lanzamiento] paquete generado");
  return paquete;
}
