/**
 * ============================================================
 * LANDING DE IMÁGENES — el plan de 11 paneles
 * ============================================================
 *
 * Pedido del dueño (29-09-2026), a partir del método de Joel Ortiz ("Landing
 * page con IA gratis en 5 minutos"): la landing de dropshipping que convierte
 * en Latam es una COLUMNA DE IMÁGENES verticales con el texto adentro (hero
 * con el dolor, beneficios con chulitos, comparativa, modo de uso, ofertas…),
 * pensada para el celular. Él la arma con un GPT que pregunta 3 cosas
 * (ofertas, ángulo, público), propone sección por sección y escribe el prompt
 * para generar cada imagen con Nano Banana a partir de las fotos del producto.
 *
 * Decisión del dueño: SIN generación de imágenes paga. Cada panel se ve con:
 *   1. la imagen que la persona genera por su cuenta (gratis en la app de
 *      Gemini, con el prompt que damos listo) y sube, o
 *   2. mientras tanto, un panel COMPUESTO con las fotos reales del producto y
 *      el texto encima (ver renderer-imagenes.ts).
 *
 * Reglas (CLAUDE.md: lo que no está configurado no se afirma):
 *   - Los sellos (paga al recibir, envío gratis, plazo) salen de las
 *     condiciones REALES del negocio, no del modelo.
 *   - Las ofertas y sus precios los pone el dueño; el pedido cobra esos.
 *   - Nada de "⭐ 4.7 | 843 clientes": el video lo hace y es publicidad
 *     engañosa. Prueba social solo si el dueño la cargó.
 */
import { logger } from "../logger";

export type ClavePanel =
  | "portada" | "dolor" | "solucion" | "beneficios" | "comparativa" | "modo-de-uso"
  | "para-quien" | "ofertas" | "confianza" | "preguntas" | "cierre";

export interface OfertaLanding { nombre: string; cantidad: number; precio: number }

export interface PanelImagen {
  id: string;
  type: "panel";
  clave: ClavePanel;
  titulo: string;
  subtitulo?: string;
  bullets?: string[];
  /** "Pregunta | respuesta" en el panel de preguntas; "ventaja | tradicional" en la comparativa. */
  pares?: Array<{ a: string; b: string }>;
  conceptoVisual?: string;
  /** Imagen subida por la persona (texto ya adentro): manda sobre el compuesto. */
  imagen?: string | null;
  /** Foto del producto elegida para el panel compuesto. */
  foto?: string | null;
  oculto?: boolean;
}

export interface RespuestasLanding {
  ofertas: OfertaLanding[];
  angulo: string;
  publico: string;
  /** Solo si el dueño la tiene de verdad: "4,8 en 120 reseñas de MercadoLibre". */
  pruebaSocial?: string | null;
}

/** Las 11 secciones, en orden, con lo que tiene que lograr cada una. */
export const CATALOGO_DE_PANELES: Array<{ clave: ClavePanel; nombre: string; guia: string }> = [
  { clave: "portada", nombre: "Portada", guia: "Gancho con el dolor o el deseo principal (pregunta corta), el producto como solución, subtítulo con el beneficio central." },
  { clave: "dolor", nombre: "El problema", guia: "Nombrar el problema cotidiano del público con 3-4 frustraciones concretas." },
  { clave: "solucion", nombre: "La solución", guia: "Presentar el producto como la salida: qué hace, en una frase, y 3 viñetas de cómo lo resuelve." },
  { clave: "beneficios", nombre: "Beneficios", guia: "4-5 beneficios concretos (resultado para la persona, no especificaciones sueltas)." },
  { clave: "comparativa", nombre: "Comparativa", guia: "¿Por qué es mejor que la alternativa tradicional? 3-4 pares 'con este producto | con lo tradicional'." },
  { clave: "modo-de-uso", nombre: "Modo de uso", guia: "3 pasos simples para usarlo." },
  { clave: "para-quien", nombre: "Para quién es", guia: "A quién le sirve (3-4 perfiles o situaciones) y qué puede esperar de forma realista." },
  { clave: "ofertas", nombre: "Ofertas", guia: "Titular que invite a elegir la oferta. Las ofertas y precios los pone el negocio, no los inventes." },
  { clave: "confianza", nombre: "Compra segura", guia: "Tranquilizar sobre la compra usando SOLO las condiciones dadas (pago, envío, plazo)." },
  { clave: "preguntas", nombre: "Preguntas frecuentes", guia: "4 pares pregunta | respuesta con dudas reales de compra, respondidas SOLO con datos dados." },
  { clave: "cierre", nombre: "Cierre", guia: "Llamado a la acción final, recordando el beneficio principal. Sin falsa escasez ni cuentas regresivas." },
];

/** Sellos a partir de las condiciones reales del negocio (nunca del modelo). */
export function sellosDelNegocio(c: { envio?: { pago?: string; costo?: string; plazo?: string; cobertura?: string } } | null | undefined): string[] {
  const e = c?.envio || {};
  const out: string[] = [];
  if (/contraentrega|al recibir|contra entrega/i.test(String(e.pago || ""))) out.push("Paga al recibir");
  if (/^incluid|gratis/i.test(String(e.costo || "").trim())) out.push("Envío gratis");
  if (e.plazo) out.push(`Llega en ${String(e.plazo).trim()}`);
  if (e.cobertura && /todo/i.test(String(e.cobertura))) out.push(`Envíos a ${String(e.cobertura).trim()}`);
  return out.slice(0, 4);
}

// ── Prueba social inventada ────────────────────────────────────────────
// "⭐ 4.7 | 843 clientes satisfechos", "+5.000 vendidos", "miles de clientes":
// si el dueño no la cargó, se borra la frase entera.
const PRUEBA_SOCIAL = /(⭐|★|\b[1-5][.,]\d\s*(\/\s*5)?\s*(estrellas|⭐|\||de\s*5))|\b\+?\s*\d[\d.,]*\s*(k\s*)?(clientes|compradores|personas|usuarios|reseñas|opiniones|valoraciones|vendid[oa]s|unidades vendidas|pedidos)\b|\b(miles|cientos|millones)\s+de\s+(clientes|personas|usuarios|compradores)|\b(el|la)\s+m[aá]s\s+vendid[oa]\b|\b#\s*1\b|n[uú]mero\s+uno/i;

export function sinPruebaSocialInventada(texto: string, permitida: string | null | undefined): string {
  const t = String(texto || "").trim();
  if (!t) return t;
  if (permitida && t.includes(permitida)) return t;
  return PRUEBA_SOCIAL.test(t) ? "" : t;
}

function limpiarPanel(p: PanelImagen, permitida: string | null | undefined): PanelImagen {
  const f = (s: any) => sinPruebaSocialInventada(String(s ?? ""), permitida);
  return {
    ...p,
    titulo: f(p.titulo) || p.titulo.replace(PRUEBA_SOCIAL, "").trim(),
    subtitulo: f(p.subtitulo),
    bullets: (p.bullets || []).map(f).filter(Boolean).slice(0, 6),
    pares: (p.pares || []).map((x) => ({ a: f(x.a), b: f(x.b) })).filter((x) => x.a).slice(0, 6),
  };
}

const f$ = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

/**
 * El prompt para generar la imagen del panel (en la app de Gemini u otra).
 * Se arma del lado del servidor, no lo escribe el modelo: así siempre lleva
 * el texto exacto en español, el formato 9:16 y la orden de NO rediseñar el
 * producto ni agregar reseñas o precios.
 */
export function promptParaImagen(panel: PanelImagen, producto: { name?: string | null }, opts: { paleta?: string[]; ofertas?: OfertaLanding[]; sellos?: string[] } = {}): string {
  const lineas: string[] = [];
  lineas.push("Vertical 9:16 advertising image for a mobile e-commerce landing page (1080x1920).");
  lineas.push(`Product: ${producto.name || "the product"}. Use the ATTACHED PRODUCT PHOTO as the exact product: same shape, colors, logo and details. Do not redesign it.`);
  if (panel.conceptoVisual) lineas.push(`Scene: ${panel.conceptoVisual}`);
  lineas.push("Include ONLY this Spanish text, exactly as written, large and highly legible:");
  if (panel.titulo) lineas.push(`- Headline: "${panel.titulo}"`);
  if (panel.subtitulo) lineas.push(`- Subheadline: "${panel.subtitulo}"`);
  for (const b of panel.bullets || []) lineas.push(`- Bullet with a green check icon: "${b}"`);
  for (const p of panel.pares || []) lineas.push(panel.clave === "comparativa" ? `- Comparison row: ✓ "${p.a}" vs ✗ "${p.b}"` : `- "${p.a}" — "${p.b}"`);
  if (panel.clave === "ofertas") for (const o of opts.ofertas || []) lineas.push(`- Offer card: "${o.nombre}" — "${f$(o.precio)}"`);
  if ((panel.clave === "portada" || panel.clave === "confianza") && opts.sellos?.length) lineas.push(`- Small badges: ${opts.sellos.map((s) => `"${s}"`).join(", ")}`);
  if (opts.paleta?.length) lineas.push(`Color palette: ${opts.paleta.join(", ")}.`);
  lineas.push("Style: clean premium Latin American e-commerce design, soft shadows, rounded cards, realistic lifestyle photography, lots of breathing room.");
  lineas.push("Do NOT add star ratings, reviews, customer counts, prices or any text not listed above.");
  return lineas.join("\n");
}

const SYSTEM = `Sos un director creativo de landings de dropshipping con pago contraentrega en Latinoamérica.
Escribís en español neutro latino, tuteando, frases cortas y concretas (esto va dentro de imágenes para celular).
Devolvés SOLO un JSON válido: {"paleta":[3 colores con nombre],"paneles":[...]} con un objeto por cada clave pedida, en el mismo orden:
{"clave":"...","titulo":"máx 60 caracteres","subtitulo":"máx 110","bullets":["máx 45 c/u"],"pares":[{"a":"...","b":"..."}],"conceptoVisual":"escena de la foto en español, 1-2 frases, con el producto real en uso"}
Reglas duras:
- Usá SOLO los datos del producto y las condiciones que te doy. Lo que no está, no existe.
- PROHIBIDO: calificaciones con estrellas, número de clientes/ventas/reseñas, "el más vendido", testimonios, garantías, descuentos, cuentas regresivas o escasez que no te di.
- No pongas precios en los textos (las ofertas las muestra el sistema).
- "pares" solo en comparativa (a = con este producto, b = con lo tradicional) y en preguntas (a = pregunta, b = respuesta). En el resto, lista vacía.`;

function extraerJson(t: string): any {
  const s = String(t || "");
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(s.slice(i, j + 1)); } catch { return null; }
}

/** Plan mínimo sin IA: si ningún modelo responde, la landing igual se arma con los datos. */
export function planDeRespaldo(producto: { name?: string | null; description?: string | null; features?: string[] | null }, r: RespuestasLanding): { paleta: string[]; paneles: PanelImagen[] } {
  const nombre = String(producto.name || "Producto");
  const feats = (producto.features || []).map(String).filter(Boolean);
  const desc = String(producto.description || "").replace(/\s+/g, " ").trim();
  const base = (clave: ClavePanel, titulo: string, extra: Partial<PanelImagen> = {}): PanelImagen => ({ id: clave, type: "panel", clave, titulo, ...extra });
  return {
    paleta: [],
    paneles: [
      base("portada", nombre, { subtitulo: desc.slice(0, 110) }),
      base("dolor", `¿Te pasa esto?`, { subtitulo: r.angulo || undefined }),
      base("solucion", `${nombre}: la solución`, { bullets: feats.slice(0, 3) }),
      base("beneficios", "Lo que vas a notar", { bullets: feats.slice(0, 5) }),
      base("comparativa", "¿Por qué elegirlo?", { oculto: !feats.length }),
      base("modo-de-uso", "Así de fácil se usa", { oculto: true }),
      base("para-quien", "Ideal para", { subtitulo: r.publico || undefined }),
      base("ofertas", "Elige tu oferta"),
      base("confianza", "Compra segura"),
      base("preguntas", "Preguntas frecuentes", { oculto: true }),
      base("cierre", `Pide tu ${nombre} hoy`),
    ],
  };
}

export async function planearPaneles(
  tenantId: number,
  producto: { name?: string | null; description?: string | null; features?: string[] | null; category?: string | null },
  r: RespuestasLanding,
  condiciones: { pais?: string; envio?: { pago?: string; costo?: string; plazo?: string; cobertura?: string } } | null,
): Promise<{ paleta: string[]; paneles: PanelImagen[]; autor: string }> {
  const sellos = sellosDelNegocio(condiciones);
  const user = [
    `PRODUCTO: ${producto.name || ""}`,
    producto.category ? `Categoría: ${producto.category}` : "",
    `Descripción: ${String(producto.description || "").slice(0, 2500) || "(vacía)"}`,
    (producto.features || []).length ? `Características: ${(producto.features || []).join(" · ")}` : "",
    `ÁNGULO DE VENTA: ${r.angulo || "dolor / solución"}`,
    `PÚBLICO: ${r.publico || "general"}`,
    `CONDICIONES REALES: ${sellos.join(" · ") || "(sin condiciones cargadas: no menciones envío ni pago)"}`,
    r.pruebaSocial ? `PRUEBA SOCIAL REAL (podés usarla tal cual): ${r.pruebaSocial}` : "PRUEBA SOCIAL: ninguna (no inventes).",
    `CLAVES, en orden: ${CATALOGO_DE_PANELES.map((c) => `${c.clave} (${c.guia})`).join(" | ")}`,
  ].filter(Boolean).join("\n");

  try {
    const { redactarConProveedores, ORDEN_GRATUITOS_PRIMERO } = await import("./agente-landing");
    const res = await redactarConProveedores({
      tenantId,
      system: SYSTEM,
      user,
      maxTokens: 3500,
      timeoutMs: 45_000,
      orden: ORDEN_GRATUITOS_PRIMERO as any,
      tarea: "landing-imagenes",
      validar: (t: string) => Array.isArray(extraerJson(t)?.paneles) && extraerJson(t).paneles.length >= 6,
    });
    const j = extraerJson(res.text);
    if (j?.paneles) {
      const porClave = new Map<string, any>(j.paneles.map((p: any) => [String(p?.clave || ""), p]));
      const paneles: PanelImagen[] = CATALOGO_DE_PANELES.map(({ clave, nombre }) => {
        const p = porClave.get(clave) || {};
        return limpiarPanel({
          id: clave,
          type: "panel",
          clave,
          titulo: String(p.titulo || nombre).slice(0, 80),
          subtitulo: p.subtitulo ? String(p.subtitulo).slice(0, 160) : undefined,
          bullets: Array.isArray(p.bullets) ? p.bullets.map((x: any) => String(x).slice(0, 70)) : [],
          pares: Array.isArray(p.pares) ? p.pares.map((x: any) => ({ a: String(x?.a || "").slice(0, 120), b: String(x?.b || "").slice(0, 200) })) : [],
          conceptoVisual: p.conceptoVisual ? String(p.conceptoVisual).slice(0, 300) : undefined,
        }, r.pruebaSocial);
      });
      return { paleta: Array.isArray(j.paleta) ? j.paleta.map(String).slice(0, 4) : [], paneles, autor: `${res.proveedor || "?"}/${res.modelo || "?"}` };
    }
    logger.warn({ tenantId, error: res.error }, "[LandingImagenes] ningún modelo devolvió un plan válido; se usa el de respaldo");
  } catch (e: any) {
    logger.warn({ tenantId, err: e?.message }, "[LandingImagenes] el plan con IA falló; se usa el de respaldo");
  }
  const resp = planDeRespaldo(producto, r);
  return { ...resp, autor: "respaldo (sin IA)" };
}
