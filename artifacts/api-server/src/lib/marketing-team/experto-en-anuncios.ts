/**
 * EXPERTO EN ANUNCIOS: los DATOS que Atlas necesita antes de escribir uno.
 *
 * Pedido del dueño (13-09-2026): "no solo que sepa hacer anuncios: que sea
 * experto. Datos de qué convierte, qué información debe llevar, sugerencias
 * de imagen o video, un buen marco de copy con emojis y espacios. Nada
 * genérico."
 *
 * Lee datos aislados por tenant, métricas de entrega y estructura observada.
 * Adjunta un plan de conversión específico y economía sin costos inventados.
 * Los resultados de Meta no se clasifican como compras ni se usan para
 * declarar un ganador; contrastar marketing_attribution y cierre final.
 */
import { and, eq } from "drizzle-orm";
import { db, products } from "@workspace/db";
import { modeloDelProducto, codigoDePais } from "../modelo-de-negocio";
import { getBusinessContext } from "../business-context";
import { planDeConversion } from "./plan-de-conversion";

export interface CampanaMedida {
  id: string; nombre: string; estado: string; objetivo: string | null;
  gasto: number; impresiones: number; clics: number; ctr: number; cpc: number; cpm: number;
  resultados: number; costoPorResultado: number;
  destino: string | null; optimizacion: string | null; paises: string[];
  formato: string | null; gancho: string | null; titulo: string | null; cta: string | null;
  lectura: string;
}

export const ESPECIFICACIONES_CREATIVAS = {
  imagen: [
    "Feed 1:1 (1080×1080) y 4:5 (1080×1350): el 4:5 ocupa más pantalla en el celular; probar su rendimiento en la cuenta.",
    "Stories/Reels 9:16 (1080×1920): dejar 250 px libres arriba y abajo para la interfaz.",
    "Texto sobre la imagen: máximo 3-5 palabras grandes (el gancho o el precio), nunca el anuncio entero.",
    "Mostrar el producto EN USO o el resultado (persona tocando el piano, pantalla del curso, la faja puesta), no un logo ni un mockup vacío.",
    "Probar demostración humana y producto en detalle como hipótesis; no afirmar que una cara aumenta el CTR sin medición.",
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
    "Emojis con moderación y sentido; párrafos cortos y buena lectura móvil, sin decoración repetitiva.",
    "Bloque de beneficios: 3-5 líneas, cada una con su emoji y un beneficio concreto (no características sueltas).",
    "Precio/condición de cotización y entrega/acceso/agenda reales, adecuados al modelo de negocio.",
    "Cierre con UNA acción: 'Escríbenos por WhatsApp' (en campañas de mensajes) o 'Pedir ahora' (tráfico).",
    "Titular breve. Nunca asumir acceso de por vida, garantía, envío gratis, cobertura nacional ni contraentrega por el tipo de producto.",
    "Probar copy conciso según placement y nivel de conocimiento; no imponer un número universal de líneas.",
  ],
};

export function loQueDebeDecir(): string[] {
  return ["Para quién sirve y qué uso o beneficio permite según la ficha real.", "Demostración o evidencia propia verificable, sin promesas de resultados garantizados.", "Precio, condiciones, acceso, entrega o agenda SOLO según datos confirmados del negocio.", "Una acción coherente con el objetivo y el destino. Aclarar límites relevantes para filtrar contactos sin encaje."];
}

/** Resultados de entrega en la cuenta; no son necesariamente compras: campaña por campaña, con su copy y sus números. */
export async function benchmarksDeLaCuenta(fb: any, dias = 30): Promise<{ campanas: CampanaMedida[]; resumen: string; mejor: CampanaMedida | null; peor: CampanaMedida | null }> {
  const lista = await fb.listActiveCampaigns();
  if (fb.lastCampaignListError) throw new Error("No se pudieron consultar campañas de Meta; no equivale a cuenta sin campañas.");
  const metricas = lista.length ? await fb.getCampaignMetrics({ campaignIds: lista.map((c: any) => c.id), days: dias }) : null;
  if (lista.length && !Array.isArray(metricas?.campaigns)) throw new Error("Métricas de Meta no disponibles; no interpretar como cero ventas.");
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
    fila.lectura = !m ? "sin métricas para esta campaña en la respuesta; resultado desconocido" : gasto === 0
      ? "sin gasto en la ventana"
      : res === 0
        ? `gastó $${gasto.toLocaleString("es-CO")} sin resultados`
        : `$${fila.costoPorResultado.toLocaleString("es-CO")} por resultado (${res}) con CTR ${fila.ctr}%`;
    campanas.push(fila);
  }
  // No ordenar campañas con resultados/objetivos distintos como si fueran ventas.
  const mejor: CampanaMedida | null = null;
  const peor: CampanaMedida | null = null;
  const resumen = campanas.length
    ? campanas.map((c) => `• ${c.nombre} (${c.estado}): ${c.lectura}${c.gancho ? ` · gancho: "${c.gancho.slice(0, 70)}"` : ""}${c.formato ? ` · ${c.formato}` : ""}`).join("\n")
    : "La cuenta no tiene campañas medibles todavía: no hay evidencia de ventas para elegir un ganador.";
  return { campanas, resumen, mejor, peor };
}

/** El paquete completo para un producto: todo lo que hace falta ANTES de escribir el anuncio. */
export async function datosExpertosParaAnuncio(opts: { tenantId: number; productId: number; objetivo?: string; fb: any | null; costosVariablesPorVenta?: number; beneficioMinimoPorVenta?: number }) {
  const [p] = await db.select().from(products).where(and(eq(products.id, opts.productId), eq(products.tenantId, opts.tenantId))).limit(1);
  if (!p) throw new Error(`No encontré el producto ${opts.productId}.`);
  const modelo = modeloDelProducto(p as any);
  const ctxNeg = await getBusinessContext(opts.tenantId).catch(() => null);
  const pais = codigoDePais(ctxNeg?.condiciones?.pais || null);

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
    : modelo === "fisico" ? [
        `Imagen 4:5: el producto (${p.name}) EN USO por una persona, fondo limpio, gancho de 3-4 palabras y una condición de pago verificada (no asumir contraentrega).`,
        "Segunda imagen: el producto solo, en detalle, con 3 beneficios en íconos.",
        "Video 15-30 s vertical: problema (3 s) → el producto resolviéndolo (12 s) → precio, envío y 'Pedir por WhatsApp'.",
      ] : [
        `Demostración real de ${p.name}: proceso, alcance y prueba verificable del trabajo.`,
        "Pieza centrada en una objeción real, con condiciones de agenda, cotización o suscripción confirmadas.",
        "CTA acorde al cierre: reservar, cotizar o consultar; no prometer entrega digital ni contraentrega.",
      ];

  return {
    producto: { id: p.id, nombre: p.name, modelo, precio, fotosReales: fotos.length, descripcion: String((p as any).description || "").slice(0, 600), caracteristicas: ((p as any).features as string[]) || [] },
    objetivoSugerido: opts.objetivo || "mensajes",
    loQueDebeDecir: loQueDebeDecir(),
    formatoDelCopy: ESPECIFICACIONES_CREATIVAS.formatoDelCopy,
    creativo: { imagen: ESPECIFICACIONES_CREATIVAS.imagen, video: ESPECIFICACIONES_CREATIVAS.video, sugerenciasParaEsteProducto: sugerenciasCreativas },
    cuenta: cuenta
      ? {
          resumen: cuenta.resumen,
          mejor: cuenta.mejor ? { nombre: cuenta.mejor.nombre, costoPorResultado: cuenta.mejor.costoPorResultado, ctr: cuenta.mejor.ctr, gancho: cuenta.mejor.gancho, formato: cuenta.mejor.formato, optimizacion: cuenta.mejor.optimizacion } : null,
          peor: cuenta.peor ? { nombre: cuenta.peor.nombre, lectura: cuenta.peor.lectura } : null,
        }
      : { resumen: "Sin métricas verificadas de Meta; no afirmar que un anuncio vende.", mejor: null, peor: null },
    estructuraARepetir: plantilla
      ? { deCampana: plantilla.origen?.nombre || null, conjuntos: plantilla.conjuntos.map((c: any) => `${c.nombre}: ${c.paises.join(",")} · ${c.optimizacion || "según objetivo"} · ${c.presupuestoDiario ? `$${Number(c.presupuestoDiario).toLocaleString("es-CO")}/día` : ""}`), instagram: !!plantilla.instagram, mejorasCompletas: !!plantilla.mejorasCompletas }
      : null,
    pais,
    moneda: (p as any).currency || "COP",
    planConversion: planDeConversion({ modelo, nombre: p.name, descripcion: String(p.description || ""), fotos: fotos.length, precio: p.price == null ? null : Number(p.price) }, { costos: opts.costosVariablesPorVenta ?? null, beneficioMinimo: opts.beneficioMinimoPorVenta ?? null }),
  };
}
