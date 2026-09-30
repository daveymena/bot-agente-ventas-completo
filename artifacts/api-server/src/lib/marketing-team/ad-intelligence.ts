/**
 * MARKETING TEAM — AD INTELLIGENCE (2026-09-29)
 * =====================
 * Capa de inteligencia sobre anuncios EXTERNOS (competencia), sin duplicar
 * nada existente:
 * - La LECTURA ya existe: tool `fb_ad_library` (Biblioteca de Anuncios de
 *   Meta con navegador real, ordenada por impresiones).
 * - La GENERACIÓN ya existe: `creativeDirection()` (creative-director),
 *   `marketResearch()` (market-researcher), `saveLearning` (marketing-memory).
 *
 * Este módulo es el eslabón que faltaba entre ambos: clasifica cada anuncio
 * (hook / ángulo / formato / oferta), extrae patrones del mercado, detecta
 * huecos de diferenciación y devuelve ángulos listos para alimentar
 * `creativeDirection()` vía `research.angulos`.
 *
 * Regla anti-humo: un patrón repetido es una HIPÓTESIS para probar, nunca
 * prueba de que convierte (la biblioteca no muestra ventas del competidor).
 */

export type CategoriaAnuncio =
  | "PROBLEMA"
  | "BENEFICIO"
  | "DEMOSTRACION"
  | "EDUCATIVO"
  | "OFERTA"
  | "TESTIMONIO"
  | "URGENCIA"
  | "OTRO";

export type FormatoSugerido = "video" | "imagen" | "carrusel";

export interface AnuncioClasificado {
  texto: string;
  anunciante: string | null;
  hook: string;
  categoria: CategoriaAnuncio;
  categoriasSecundarias: CategoriaAnuncio[];
  oferta: string[];
  formatoSugerido: FormatoSugerido;
}

export interface PatronMercado {
  categoria: CategoriaAnuncio;
  frecuencia: number;
  ejemplos: string[];
  frasesRepetidas: string[];
}

export interface InteligenciaMercado {
  total: number;
  patrones: PatronMercado[];
  angulosSaturados: string[];
  huecos: { categoria: CategoriaAnuncio; porQue: string }[];
  lenguajeDelMercado: string[];
  angulosSugeridos: string[];
  advertencia: string;
}

const REGLAS: Array<{ categoria: Exclude<CategoriaAnuncio, "OTRO">; re: RegExp; peso: number }> = [
  { categoria: "OFERTA", re: /(\d+\s*%|\bdescuento\b|\boferta\b|env[ií]o gratis|2x1|\bbono\b|\bcuotas\b|\bprecio\b|\bpromo\b)/i, peso: 3 },
  { categoria: "TESTIMONIO", re: /(testimonio|clientes?\s+(felices|reales)|me funcion[oó]|recomiendo|⭐|⭐⭐|opiniones|casos?\s+de\s+[ée]xito)/i, peso: 3 },
  { categoria: "URGENCIA", re: /(\bhoy\b|[úu]ltimos|quedan\s+\d+|solo\s+(hoy|por\s+hoy)|aprovecha|cupos?\s+limitados?|cierra)/i, peso: 3 },
  { categoria: "DEMOSTRACION", re: /(antes\s+y\s+despu[eé]s|mira\s+como|te muestro|video|resultados?\s+reales|as[ií]\s+qued[oó]|paso\s+a\s+paso)/i, peso: 2 },
  { categoria: "EDUCATIVO", re: /(c[óo]mo\s|errores?\s+comunes|aprende|tips?|gu[ií]a|te ense[ñn]o|clase\s+gratis|aprende\b)/i, peso: 2 },
  { categoria: "PROBLEMA", re: /(dolor|sufres?|problema|cansad[oa]|error\b|cuesta|pierdes?|ya no|basta de|¿.+sufr)/i, peso: 2 },
  { categoria: "BENEFICIO", re: /(consigue|logra|ahorra|gana|beneficio|disfruta|mejora|consigue|resultado|libertad|tranquilidad)/i, peso: 2 },
];

const STOPWORDS = new Set(
  "el,la,los,las,un,una,de,del,en,y,o,que,con,para,por,tu,tus,su,sus,mi,se,te,lo,le,les,nos,como,cómo,más,mas,muy,sin,sobre,este,esta,hasta,desde,donde,dónde,cuando,cuándo,porque,está,están,son,es,hay,tiene,tienen,pero,si,no,sí,al,a,tu".split(","),
);

function primeraLineaUtil(texto: string): string {
  const lineas = String(texto || "")
    .split(/[|\n]/)
    .map((l) => l.trim())
    .filter((l) => l.length > 12 && !/^(identificador de la biblioteca|library id|activo|ver detalles|plataformas)/i.test(l));
  return (lineas[0] || String(texto || "").slice(0, 120)).slice(0, 140);
}

/** Clasifica UN anuncio (texto crudo de fb_ad_library) sin IA: reglas + hook. */
export function clasificarAnuncio(bloque: string): AnuncioClasificado {
  const texto = String(bloque || "").slice(0, 2000);
  const puntajes = new Map<CategoriaAnuncio, number>();
  for (const r of REGLAS) {
    const hits = texto.match(new RegExp(r.re.source, "gi"))?.length || 0;
    if (hits) puntajes.set(r.categoria, (puntajes.get(r.categoria) || 0) + hits * r.peso);
  }
  const orden = [...puntajes.entries()].sort((a, b) => b[1] - a[1]);
  const categoria: CategoriaAnuncio = orden[0]?.[0] || "OTRO";
  const categoriasSecundarias = orden.slice(1, 3).map(([c]) => c);
  const oferta: string[] = [];
  const mPct = texto.match(/\d+\s*%\s*(de\s+descuento|off|dcto)?/i)?.[0];
  if (mPct) oferta.push(mPct.trim());
  for (const w of ["envío gratis", "2x1", "bono", "cuotas", "garantía", "oferta"]) {
    if (new RegExp(w, "i").test(texto) && !oferta.some((o) => new RegExp(w, "i").test(o))) oferta.push(w);
  }
  const formatoSugerido: FormatoSugerido = /video|antes\s+y\s+despu|paso\s+a\s+paso|mira\s+como/i.test(texto)
    ? "video"
    : /carrusel|colecci|varios\s+modelos|cat[aá]logo/i.test(texto)
      ? "carrusel"
      : "imagen";
  return { texto: texto.slice(0, 700), anunciante: null, hook: primeraLineaUtil(texto), categoria, categoriasSecundarias, oferta, formatoSugerido };
}

/** Bigramas repetidos entre anuncios (lenguaje real del mercado). */
function frasesRepetidas(textos: string[], minVeces = 2): string[] {
  const cuenta = new Map<string, number>();
  for (const t of textos) {
    const palabras = t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 3 && !STOPWORDS.has(w));
    const vistos = new Set<string>();
    for (let i = 0; i < palabras.length - 1; i++) {
      const bi = `${palabras[i]} ${palabras[i + 1]}`;
      if (!vistos.has(bi)) { vistos.add(bi); cuenta.set(bi, (cuenta.get(bi) || 0) + 1); }
    }
  }
  return [...cuenta.entries()].filter(([, n]) => n >= minVeces).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([b]) => b);
}

const TODAS: CategoriaAnuncio[] = ["PROBLEMA", "BENEFICIO", "DEMOSTRACION", "EDUCATIVO", "OFERTA", "TESTIMONIO", "URGENCIA"];

const PORQUE_HUECO: Record<CategoriaAnuncio, string> = {
  PROBLEMA: "nadie está nombrando el dolor: quien lo nombre primero se adueña del nicho",
  BENEFICIO: "pocos prometen el resultado final: espacio para liderar con beneficio",
  DEMOSTRACION: "casi nadie muestra prueba visual: un antes/después real diferencia al instante",
  EDUCATIVO: "nadie enseña: el que educa se vuelve referencia y vende sin presionar",
  OFERTA: "nadie compite por precio/oferta: hay margen para una oferta clara",
  TESTIMONIO: "faltan caras reales de clientes: prueba social propia gana",
  URGENCIA: "nadie mete urgencia honesta: un cierre con fecha real convierte",
  OTRO: "",
};

/**
 * Patrones del mercado + huecos + ángulos sugeridos (hipótesis, no pruebas).
 * `nombreProducto` se usa para formular la diferenciación sin copiar.
 */
export function extraerPatrones(clasificados: AnuncioClasificado[], nombreProducto = "tu producto"): InteligenciaMercado {
  const total = clasificados.length;
  const porCat = new Map<CategoriaAnuncio, AnuncioClasificado[]>();
  for (const c of clasificados) {
    const lista = porCat.get(c.categoria) || [];
    lista.push(c);
    porCat.set(c.categoria, lista);
  }
  const patrones: PatronMercado[] = [...porCat.entries()]
    .map(([categoria, lista]) => ({
      categoria,
      frecuencia: total ? lista.length / total : 0,
      ejemplos: lista.slice(0, 3).map((l) => l.hook),
      frasesRepetidas: frasesRepetidas(lista.map((l) => l.texto)),
    }))
    .sort((a, b) => b.frecuencia - a.frecuencia);
  const angulosSaturados = patrones.filter((p) => p.frecuencia >= 0.3 && p.categoria !== "OTRO").map((p) => p.categoria);
  const huecos = TODAS.filter((c) => !(porCat.get(c)?.length)).map((categoria) => ({ categoria, porQue: PORQUE_HUECO[categoria] }));
  const lenguajeDelMercado = frasesRepetidas(clasificados.map((c) => c.texto), 2).slice(0, 8);
  // Diferenciación: lo saturado se evita, lo ausente se ocupa, con el
  // producto por nombre para no generar ángulos genéricos copiados.
  const topSaturada = patrones[0]?.categoria;
  const angulosSugeridos = [
    ...(huecos.slice(0, 2).map((h) => `${h.categoria}: ${nombreProducto} — ${h.porQue.split(":")[0]}`)),
    ...(topSaturada && topSaturada !== "OTRO"
      ? [`Diferenciación: el mercado satura ${topSaturada}; ${nombreProducto} entra por el ángulo menos usado`]
      : []),
  ].slice(0, 4);
  return {
    total,
    patrones,
    angulosSaturados,
    huecos,
    lenguajeDelMercado,
    angulosSugeridos,
    advertencia: "Patrón repetido = hipótesis para probar (A/B), no prueba de que convierte: la biblioteca no muestra ventas del competidor.",
  };
}
