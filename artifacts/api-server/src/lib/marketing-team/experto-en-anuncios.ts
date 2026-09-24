/**
 * EXPERTO EN ANUNCIOS: los DATOS que Atlas necesita antes de escribir uno.
 *
 * Pedido del dueño (13-09-2026): "no solo que sepa hacer anuncios: que sea
 * experto. Datos de qué convierte, qué información debe llevar, sugerencias
 * de imagen o video, un buen marco de copy con emojis y espacios. Nada
 * genérico."
 *
 * Lo genérico sale de escribir sin datos. Esto junta, en una sola lectura:
 *   1. Lo que YA convirtió en ESTA cuenta (gasto, CTR, CPC, costo por
 *      resultado por campaña, y el gancho/estructura del copy que lo logró),
 *      leído de Meta con la radiografía y las métricas reales.
 *   2. La estructura de la campaña más reciente (conjuntos, destino,
 *      optimización, Instagram, mejoras) para replicarla.
 *   3. Referencias del rubro, marcadas como orientativas, para tener contra
 *      qué comparar cuando la cuenta todavía no tiene historia.
 *   4. Especificaciones creativas concretas (formatos, medidas, qué mostrar,
 *      qué NO) y sugerencias de imagen/video para ESTE producto.
 *   5. Metas de KPI y reglas de decisión (cuándo cambiar gancho, cuándo
 *      pausar, cuándo escalar) y la lista de lo que el anuncio DEBE decir.
 *
 * El copy lo sigue escribiendo el modelo (MODULO_PUBLICIDAD); acá van los
 * hechos que lo vuelven específico.
 */
import { and, eq } from "drizzle-orm";
import { db, products } from "@workspace/db";
import { modeloDelProducto, codigoDePais } from "../modelo-de-negocio";
import { getBusinessContext } from "../business-context";

export interface CampanaMedida {
  id: string; nombre: string; estado: string; objetivo: string | null;
  gasto: number; impresiones: number; clics: number; ctr: number; cpc: number; cpm: number;
  resultados: number; costoPorResultado: number;
  destino: string | null; optimizacion: string | null; paises: string[];
  formato: string | null; gancho: string | null; titulo: string | null; cta: string | null;
  lectura: string;
}

/** Referencias del rubro para Colombia (COP). ORIENTATIVAS: sirven para comparar, no son promesa. */
export const REFERENCIAS_DEL_RUBRO = {
  fuente: "Rangos habituales medidos por agencias y anunciantes en Colombia 2025-2026 para campañas de mensajes a WhatsApp y tráfico. Orientativos; la cuenta propia manda.",
  digital: {
    cpmCop: [6000, 18000], ctrPct: [1.5, 4.0], cpcCop: [250, 900],
    costoPorConversacionCop: [500, 3000], conversacionAVentaPct: [3, 10],
    nota: "Cursos y productos digitales de ticket bajo ($20.000-$80.000): el cuello suele ser el CIERRE en el chat, no el clic.",
  },
  fisico: {
    cpmCop: [7000, 22000], ctrPct: [1.2, 3.5], cpcCop: [300, 1200],
    costoPorConversacionCop: [800, 4000], conversacionAVentaPct: [8, 20],
    nota: "Contraentrega: la tasa de entrega efectiva (cliente recibe y paga) suele ser 60-80%; contarla en el margen.",
  },
};

export const ESPECIFICACIONES_CREATIVAS = {
  imagen: [
    "Feed 1:1 (1080×1080) y 4:5 (1080×1350): el 4:5 ocupa más pantalla en el celular, rinde mejor en feed.",
    "Stories/Reels 9:16 (1080×1920): dejar 250 px libres arriba y abajo para la interfaz.",
    "Texto sobre la imagen: máximo 3-5 palabras grandes (el gancho o el precio), nunca el anuncio entero.",
    "Mostrar el producto EN USO o el resultado (persona tocando el piano, pantalla del curso, la faja puesta), no un logo ni un mockup vacío.",
    "Una cara con emoción real sube el CTR; fondo limpio y contraste alto con el color de marca.",
    "Fotos reales del catálogo primero; IA solo para contexto, nunca para fingir testimonios.",
  ],
  video: [
    "15-30 s. El gancho va en los primeros 3 s (pregunta o problema en pantalla, sin logo de entrada).",
    "Subtítulos siempre: la mayoría lo ve sin sonido.",
    "Estructura: problema (0-3 s) → qué es y cómo se ve por dentro (3-15 s) → precio y cómo se pide (15-25 s) → CTA (últimos 3 s).",
    "Vertical 9:16 para Reels/Stories y 1:1 o 4:5 para feed; el mismo video recortado sirve para las dos.",
  ],
  formatoDelCopy: [
    "Gancho en la primera línea (pregunta o problema), SIN 'Tenemos disponible', 'Nuevo', 'Oferta'.",
    "Un emoji al inicio de cada línea con contenido, y una línea en blanco entre bloques: se lee en el celular.",
    "Bloque de beneficios: 3-5 líneas, cada una con su emoji y un beneficio concreto (no características sueltas).",
    "Precio exacto y cómo llega (Drive / contraentrega) SIEMPRE: es lo primero que preguntan por WhatsApp.",
    "Cierre con UNA acción: 'Escríbenos por WhatsApp' (en campañas de mensajes) o 'Pedir ahora' (tráfico).",
    "Titular ≤ 40 caracteres; descripción = precio + garantía/acceso ('Pago único $60.000 · Acceso de por vida').",
    "Largo total del texto principal: 8-12 líneas. Más es folleto, menos es pobre.",
  ],
};

export function metasYReglas(modelo: "digital" | "fisico") {
  const r = modelo === "fisico" ? REFERENCIAS_DEL_RUBRO.fisico : REFERENCIAS_DEL_RUBRO.digital;
  return {
    metas: {
      ctrMinimoPct: r.ctrPct[0],
      cpcMaximoCop: r.cpcCop[1],
      costoPorConversacionMaximoCop: r.costoPorConversacionCop[1],
      conversacionAVentaMinimaPct: r.conversacionAVentaPct[0],
    },
    reglas: [
      `Con 1.000 impresiones y CTR < ${r.ctrPct[0]}%: el problema es el GANCHO o la imagen → cambiar creativo, no presupuesto.`,
      `Con $30.000 gastados y costo por conversación > $${r.costoPorConversacionCop[1].toLocaleString("es-CO")}: pausar ese conjunto y probar otro ángulo o público.`,
      `Conversaciones llegan pero cierre < ${r.conversacionAVentaPct[0]}%: el anuncio funciona, arreglar el VENDEDOR (respuesta, precio, objeciones) antes de subir presupuesto.`,
      "Costo por conversación por debajo del rango y ventas confirmadas: subir presupuesto 20% cada 48 h, nunca duplicar de golpe (reinicia el aprendizaje).",
      "Tres días sin resultados en un conjunto → pausarlo; dos conjuntos buenos → mantener ambos, no consolidar.",
      "Nunca comparar un conjunto de Colombia con uno internacional: distintos CPM, distinta optimización.",
    ],
  };
}

export function loQueDebeDecir(modelo: "digital" | "fisico"): string[] {
  const base = [
    "Para quién es y qué problema le resuelve (primera línea).",
    "Qué incluye, en 3-5 beneficios concretos sacados de la ficha real.",
    "Precio exacto en COP y que es pago único (si aplica).",
    "Cómo lo recibe: acceso por Google Drive de por vida (digital) o envío a domicilio con pago contraentrega (físico).",
    "Desde dónde se usa (celular/computador) o cómo se usa (físico).",
    "Una sola llamada a la acción, al final.",
  ];
  if (modelo === "fisico") base.push("Cobertura: a dónde se envía (el país del negocio) y que se paga al recibir.");
  return base;
}

/** Lo que YA pasó en la cuenta: campaña por campaña, con su copy y sus números. */
export async function benchmarksDeLaCuenta(fb: any, dias = 30): Promise<{ campanas: CampanaMedida[]; resumen: string; mejor: CampanaMedida | null; peor: CampanaMedida | null }> {
  const lista = await fb.listActiveCampaigns();
  const metricas = lista.length ? await fb.getCampaignMetrics({ campaignIds: lista.map((c: any) => c.id), days: dias }) : null;
  const campanas: CampanaMedida[] = [];
  for (const c of lista.slice(0, 12)) {
    const m = (metricas?.campaigns || []).find((x: any) => x.id === c.id);
    let rx: any = null;
    try { rx = await fb.radiografiaDeCampana(c.id); } catch { rx = null; }
    const conjunto = rx?.conjuntos?.[0] || null;
    const creativo = rx?.conjuntos?.flatMap((cj: any) => cj.anuncios || []).find((a: any) => a.creativo)?.creativo || null;
    const gancho = creativo?.textoPrincipal ? String(creativo.textoPrincipal).split(/\n/).map((l: string) => l.trim()).filter(Boolean)[0] || null : null;
    const gasto = Number(m?.spend || 0), imp = Number(m?.impressions || 0), clics = Number(m?.clicks || 0), res = Number(m?.results || 0);
    const fila: CampanaMedida = {
      id: c.id, nombre: c.name, estado: c.effectiveStatus || c.status, objetivo: rx?.campana?.objetivo || null,
      gasto, impresiones: imp, clics, ctr: imp ? +(clics / imp * 100).toFixed(2) : 0, cpc: clics ? Math.round(gasto / clics) : 0, cpm: imp ? Math.round(gasto / imp * 1000) : 0,
      resultados: res, costoPorResultado: res ? Math.round(gasto / res) : 0,
      destino: conjunto?.destino || null, optimizacion: conjunto?.optimizacion || null, paises: conjunto?.segmentacion?.paises || [],
      formato: creativo?.formato || null, gancho, titulo: creativo?.titulo || null, cta: creativo?.cta || null,
      lectura: "",
    };
    fila.lectura = gasto === 0
      ? "sin gasto en la ventana"
      : res === 0
        ? `gastó $${gasto.toLocaleString("es-CO")} sin resultados`
        : `$${fila.costoPorResultado.toLocaleString("es-CO")} por resultado (${res}) con CTR ${fila.ctr}%`;
    campanas.push(fila);
  }
  const conResultados = campanas.filter((c) => c.resultados > 0 && c.gasto > 0);
  const mejor = conResultados.sort((a, b) => a.costoPorResultado - b.costoPorResultado)[0] || null;
  const peor = campanas.filter((c) => c.gasto > 0).sort((a, b) => (b.resultados ? b.costoPorResultado : Infinity) - (a.resultados ? a.costoPorResultado : Infinity))[0] || null;
  const resumen = campanas.length
    ? campanas.map((c) => `• ${c.nombre} (${c.estado}): ${c.lectura}${c.gancho ? ` · gancho: "${c.gancho.slice(0, 70)}"` : ""}${c.formato ? ` · ${c.formato}` : ""}`).join("\n")
    : "La cuenta no tiene campañas medibles todavía: se usan las referencias del rubro.";
  return { campanas, resumen, mejor, peor };
}

/** El paquete completo para un producto: todo lo que hace falta ANTES de escribir el anuncio. */
export async function datosExpertosParaAnuncio(opts: { tenantId: number; productId: number; objetivo?: string; fb: any | null }) {
  const [p] = await db.select().from(products).where(and(eq(products.id, opts.productId), eq(products.tenantId, opts.tenantId))).limit(1);
  if (!p) throw new Error(`No encontré el producto ${opts.productId}.`);
  const modelo = modeloDelProducto(p as any) === "fisico" ? "fisico" : "digital";
  const referencias = modelo === "fisico" ? REFERENCIAS_DEL_RUBRO.fisico : REFERENCIAS_DEL_RUBRO.digital;
  const ctxNeg = await getBusinessContext(opts.tenantId).catch(() => null);
  const pais = codigoDePais(ctxNeg?.condiciones?.pais || null);
  const notaPais = pais === "CO"
    ? ""
    : ` El negocio está en ${ctxNeg?.condiciones?.pais || pais}: las referencias son de Colombia, en COP; conviértalas a la moneda de la cuenta y ajústelas al país (CPM y costo por conversación suelen ser mayores en US/ES y similares en MX/PE/EC).`;

  let cuenta: Awaited<ReturnType<typeof benchmarksDeLaCuenta>> | null = null;
  let plantilla: any = null;
  if (opts.fb && opts.fb.isConfigured?.()) {
    try { cuenta = await benchmarksDeLaCuenta(opts.fb); } catch { cuenta = null; }
    try { const r = await (opts.fb.campanaModelo ? opts.fb.campanaModelo() : opts.fb.campanaMasReciente()); plantilla = r ? await opts.fb.plantillaDesdeCampana(r.id) : null; } catch { plantilla = null; }
  }

  const { fotosDelProducto } = await import("../fotos-de-producto");
  const fotos: string[] = fotosDelProducto(p);

  const precio = (p as any).price != null ? `$${Number((p as any).price).toLocaleString("es-CO")} ${(p as any).currency || "COP"}` : "sin precio cargado";
  const sugerenciasCreativas = modelo === "digital"
    ? [
        `Imagen 4:5: una persona usando lo que enseña el curso (${p.name}), con el gancho en 3-4 palabras arriba y el precio ${precio} en una etiqueta chica.`,
        "Segunda imagen: captura REAL del contenido por dentro (módulos/lecciones) con el texto 'Así se ve por dentro'.",
        "Video 15-20 s vertical: 3 s de pregunta en pantalla → 10 s mostrando el contenido por dentro → precio y 'Escríbenos por WhatsApp'.",
      ]
    : [
        `Imagen 4:5: el producto (${p.name}) EN USO por una persona, fondo limpio, gancho de 3-4 palabras y 'Pago contraentrega' como etiqueta.`,
        "Segunda imagen: el producto solo, en detalle, con 3 beneficios en íconos.",
        "Video 15-30 s vertical: problema (3 s) → el producto resolviéndolo (12 s) → precio, envío y 'Pedir por WhatsApp'.",
      ];

  return {
    producto: { id: p.id, nombre: p.name, modelo, precio, fotosReales: fotos.length, descripcion: String((p as any).description || "").slice(0, 600), caracteristicas: ((p as any).features as string[]) || [] },
    objetivoSugerido: opts.objetivo || "mensajes",
    loQueDebeDecir: loQueDebeDecir(modelo),
    formatoDelCopy: ESPECIFICACIONES_CREATIVAS.formatoDelCopy,
    creativo: { imagen: ESPECIFICACIONES_CREATIVAS.imagen, video: ESPECIFICACIONES_CREATIVAS.video, sugerenciasParaEsteProducto: sugerenciasCreativas },
    cuenta: cuenta
      ? {
          resumen: cuenta.resumen,
          mejor: cuenta.mejor ? { nombre: cuenta.mejor.nombre, costoPorResultado: cuenta.mejor.costoPorResultado, ctr: cuenta.mejor.ctr, gancho: cuenta.mejor.gancho, formato: cuenta.mejor.formato, optimizacion: cuenta.mejor.optimizacion } : null,
          peor: cuenta.peor ? { nombre: cuenta.peor.nombre, lectura: cuenta.peor.lectura } : null,
        }
      : { resumen: "Facebook no conectado o sin campañas: se usan referencias del rubro.", mejor: null, peor: null },
    estructuraARepetir: plantilla
      ? { deCampana: plantilla.origen?.nombre || null, conjuntos: plantilla.conjuntos.map((c: any) => `${c.nombre}: ${c.paises.join(",")} · ${c.optimizacion || "según objetivo"} · ${c.presupuestoDiario ? `$${Number(c.presupuestoDiario).toLocaleString("es-CO")}/día` : ""}`), instagram: !!plantilla.instagram, mejorasCompletas: !!plantilla.mejorasCompletas }
      : null,
    pais,
    moneda: (p as any).currency || "COP",
    referenciasDelRubro: { ...referencias, fuente: REFERENCIAS_DEL_RUBRO.fuente + notaPais },
    ...metasYReglas(modelo),
  };
}
