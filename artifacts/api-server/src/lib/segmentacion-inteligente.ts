/**
 * SEGMENTACIÓN INTELIGENTE — CON ESTUDIO REAL
 * ===========================================
 *
 * Lo que pidió el dueño (03-10-2026): "que el mismo sistema revise el algoritmo
 * de las personas que tienen perros o animales, que también busque las ciudades
 * y pueblos donde SÍ hay cobertura y donde hay menos riesgos de devolución…
 * que escoja inteligentemente, con investigación real, dónde se vendería mejor."
 *
 * Hasta hoy la segmentación del anuncio era la de la plantilla por nicho
 * ("Compras online, Ofertas, Bienestar") — la misma para la mochila del bebé
 * que para la de los perros: honesta pero genérica. Y la ciudad nunca se
 * preguntó: se anuncia en "todo el país", incluido un pueblo sin cobertura
 * de contraentrega, que es exactamente el pedido que se va a rechazar.
 *
 * Las TRES fuentes son datos reales que el sistema ya tiene:
 *   1. EL PÚBLICO  → `publico-del-producto.ts` (derivado: unisex/mujer/hombre/
 *                     niños → edad y género con su razón).
 *   2. EL MERCADO  → las referencias multi-idioma (`referencias-de-mercado.ts`):
 *                     qué intereses usan los anuncios que el mercado sostiene.
 *   3. LA LOGÍSTICA → `geografiaDeDropi()` (cobertura con contraentrega) y
 *                     `dropshipping_orders` (mis pedidos con `dropi_estado`:
 *                     el riesgo de devolución POR CIUDAD, medido en los MÍOS).
 *
 * Nada de esto se inventa: si un dato no se puede leer (sin Dropi, sin
 * pedidos), el paso queda marcado y la segmentación sale con lo que sí hay —
 * diciéndolo.
 */

export interface CiudadEstudiada {
  ciudad: string;
  departamento: string | null;
  /** ¿Dropi despacha ahí con contraentrega? (lo que se promete al cliente). */
  cubierta: boolean | null;
  /** Mis pedidos en esa ciudad: lo único que mide el riesgo de verdad. */
  pedidos: number;
  rechazados: number;
  /** 0..1 — pedidos rechazados / totales. Sin pedidos = null (sin señal). */
  tasaRiesgo: number | null;
  recomendada: boolean;
  /** En palabras: por qué (o por qué no). */
  porque: string;
}

/** Umbral: más de 1 de cada 3 pedidos rechazados NO es buen objetivo. */
const RIESGO_TOPE = 0.34;

/**
 * Califica UNA ciudad con sus datos. Puro a propósito: la decisión de
 * recomendar la pruebo sin base, sin Dropi y sin pedidos.
 */
export function calificarCiudad(d: {
  ciudad: string;
  departamento?: string | null;
  cubierta: boolean | null;
  pedidos: number;
  rechazados: number;
}): CiudadEstudiada {
  const total = Number(d.pedidos) || 0;
  const rechazados = Number(d.rechazados) || 0;
  const tasa = total > 0 ? rechazados / total : null;

  const razones: string[] = [];
  let recomendada = true;

  if (d.cubierta === false) {
    recomendada = false;
    razones.push("Dropi NO la tiene en cobertura con contraentrega: ahí el pedido se rechaza o se paga por adelantado");
  } else if (d.cubierta === null) {
    razones.push("cobertura sin confirmar (se confirma al pedir el pedido)");
  } else {
    razones.push("cobertura con contraentrega confirmada");
  }

  if (total === 0) {
    if (recomendada) razones.push("sin pedidos tuyos ahí todavía: riesgo sin medir");
  } else if (tasa !== null && tasa > RIESGO_TOPE) {
    recomendada = false;
    razones.push(`${rechazados} de ${total} pedidos rechazados (riesgo ${Math.round(tasa * 100)}%)`);
  } else if (total >= 3) {
    razones.push(`${total} pedidos tuyos con ${rechazados} rechazo(s): la más segura de la lista`);
  } else {
    razones.push(`${total} pedido(s) sin rechazo${rechazados ? "" : "s"}`);
  }

  return {
    ciudad: String(d.ciudad || "").trim(),
    departamento: d.departamento || null,
    cubierta: d.cubierta,
    pedidos: total,
    rechazados,
    tasaRiesgo: tasa,
    recomendada,
    porque: razones.filter(Boolean).join(" · "),
  };
}

/** Ordena el estudio: primero las recomendadas, dentro de ellas las más vendidas. */
export function ordenarEstudio(ciudades: CiudadEstudiada[]): CiudadEstudiada[] {
  return [...ciudades]
    .sort((a, b) => {
      if (a.recomendada !== b.recomendada) return a.recomendada ? -1 : 1;
      return (b.pedidos || 0) - (a.pedidos || 0);
    });
}

/** El texto para el prompt del copy y para el panel: el estudio EN PALABRAS. */
export function estudioATexto(ciudades: CiudadEstudiada[]): string {
  if (!ciudades.length) return "";
  const ok = ciudades.filter((c) => c.recomendada);
  const malas = ciudades.filter((c) => !c.recomendada);
  const lineas: string[] = [];
  if (ok.length) {
    lineas.push(`Ciudades recomendadas (cobertura + riesgo medido): ${ok.map((c) => `${c.ciudad} (${c.porque})`).join(" · ")}`);
  }
  if (malas.length) {
    lineas.push(`A anunciar evitando: ${malas.map((c) => `${c.ciudad} (${c.porque})`).join(" · ")}`);
  }
  return lineas.join("\n");
}

export interface SegmentacionEstudiada {
  /** Edad y género derivados del producto (con la razón). */
  edadMin: number;
  edadMax: number;
  genero: "todos" | "hombres" | "mujeres";
  /** Los intereses: los del mercado REAL (referencias) más los del público. */
  intereses: string[];
  /** Por qué esos intereses — de dónde salió cada uno. */
  porqueIntereses: string;
  /** El estudio de ciudades listo para el anuncio. */
  ciudades: CiudadEstudiada[];
  textoCiudades: string;
  /** Qué se pudo medir y qué no — para no prometer de más. */
  evidencia: string[];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * EL ESTUDIO: de las tablas reales a la lista de ciudades
 * ═══════════════════════════════════════════════════════════════════════════ */

const norm = (t: unknown) =>
  String(t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Igualdad de ciudad tolerante a "Cali"/"CALI"/"Palmira (Valle)". */
function esLaMismaCiudad(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

/** Mis pedidos agrupados por ciudad, con los rechazos separados. */
export async function pedidosPorCiudad(tenantId: number): Promise<Array<{ ciudad: string; departamento: string | null; pedidos: number; rechazados: number }>> {
  const { db } = await import("@workspace/db");
  const { sql } = await import("drizzle-orm");
  const filas = await db.execute(sql`
    SELECT lower(coalesce(ciudad, '')) AS clave,
           max(coalesce(ciudad, '')) AS ciudad,
           max(coalesce(departamento, '')) AS departamento,
           count(*)::int AS pedidos,
           count(*) FILTER (
             WHERE dropi_estado ~* 'rechaz|cancel'
                OR dropi_error IS NOT NULL
                OR estado = 'fallido'
           )::int AS rechazados
      FROM dropshipping_orders
     WHERE tenant_id = ${tenantId} AND coalesce(ciudad, '') <> ''
     GROUP BY 1
     ORDER BY pedidos DESC
     LIMIT 40
  `);
  return ((filas as any)?.rows ?? []) as any[];
}

/** ¿Dropi despacha CON contraentrega a una ciudad? (la regla real del negocio) */
async function coberturaDe(tenantId: number, ciudad: string, departamento?: string | null): Promise<boolean | null> {
  try {
    const { geografiaDeDropi } = await import("./dropi-cotizador");
    const geo = await geografiaDeDropi(tenantId);
    if (!geo?.length) return null;
    const objetivo = norm(ciudad);
    // Primero en SU departamento dicho; después en el resto (el cliente escribe
    // solo "Cali", sin el departamento).
    for (const d of geo) {
      if (departamento && norm(d.nombre) === norm(departamento) && (d.ciudades || []).some((c) => esLaMismaCiudad(c, objetivo))) return true;
    }
    for (const d of geo) {
      if ((d.ciudades || []).some((c) => esLaMismaCiudad(c, objetivo))) return true;
    }
    return false;
  } catch {
    return null; // sin Dropi conectado: no se puede saber, y se DICE
  }
}

/**
 * EL ESTUDIO REAL: por cada ciudad con pedidos, cobertura + riesgo, y la lista
 * ordenada de dónde anunciar. Las `extras` (ciudades nuevas que alguien pidió)
 * entran con pedidos 0: mismas reglas, señal propia = nada (y se dice).
 */
export async function estudiarCiudades(tenantId: number, opts: { extra?: string[] } = {}): Promise<CiudadEstudiada[]> {
  const filas = await pedidosPorCiudad(tenantId);
  const extras = (opts.extra || []).map(String);
  const conocidas = new Set(filas.map((f) => norm(f.ciudad)));
  const porEstudiar = filas
    .map((f) => ({ ciudad: String(f.ciudad), departamento: f.departamento, pedidos: Number(f.pedidos) || 0, rechazados: Number(f.rechazados) || 0 }))
    .concat(
      extras
        .filter((e) => e.trim() && !conocidas.has(norm(e)))
        .map((e) => ({ ciudad: e, departamento: null, pedidos: 0, rechazados: 0 })),
    );

  const estudio: CiudadEstudiada[] = [];
  const coberturas = new Map<string, boolean | null>();
  for (const c of porEstudiar) {
    const clave = norm(c.ciudad);
    const ya = coberturas.get(clave);
    const cubierta = ya !== undefined ? ya : await coberturaDe(tenantId, c.ciudad, c.departamento);
    coberturas.set(clave, cubierta);
    estudio.push(calificarCiudad({ ...c, cubierta }));
  }
  return ordenarEstudio(estudio);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ENSAMBLADO: el público (derivado) + los intereses (del mercado) + el estudio
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * La franja de edad y el género del público, DERIVADO de qué producto es.
 * Los bebés y las mascotas deciden por el QUIÉN CUIDA (madres/jóvenes adultos),
 * no por el que usa el producto: el que USA una pañalera es el padre.
 */
export function rangoDePublico(publico: string): { edadMin: number; edadMax: number; genero: "todos" | "hombres" | "mujeres"; porque: string } {
  // bebes/ninos: lo compra el ADULTO responsable (24-45). Es lo que hace el
  // mercado (ver landings-mercado.json).
  if (publico === "bebes" || publico === "ninos") return { edadMin: 24, edadMax: 45, genero: "todos", porque: "el producto es para un bebé/niño: lo compra el adulto responsable, no el que lo usa" };
  if (publico === "mujer") return { edadMin: 18, edadMax: 55, genero: "mujeres", porque: `"${publico}": el producto se le anuncia a ella` };
  if (publico === "hombre") return { edadMin: 18, edadMax: 55, genero: "hombres", porque: `"${publico}": el producto se le anuncia a él` };
  return { edadMin: 18, edadMax: 55, genero: "todos", porque: "público general: sin restricción de género" };
}

/**
 * Los intereses que EL MERCADO sostiene con plata, extraídos de las
 * referencias reales (los anuncios activos). Solo cuentan PALABRAS que Meta
 * conoce como interés en su taxonomía: lo que no está en la lista de abajo no
 * se envía (Meta lo ignoraría en silencio -- error ya documentado).
 */
const INTERESES_DE_META = new Set([
  "mascotas", "perros", "gatos", "mascotas: perros", "mascotas: gatos", "dueños de mascotas",
  "bebés", "maternidad", "maternidad y cuidado", "bebe y maternidad", "embarazo",
  "compras online", "compras", "ofertas", "bienestar", "hogar", "salud y bienestar",
  "fitness", "ejercicio", "pérdida de peso", "salud", "tecnología", "electrónica",
  "marketing digital", "educación", "idiomas", "viajes", "cocina", "hogar y jardín",
]);

/** Del texto de los anuncios reales a los intereses, con las palabras que el mercado repite. */
export function interesesDeReferencias(refs: Array<{ texto: string }> | undefined | null): string[] {
  if (!Array.isArray(refs) || !refs.length) return [];
  const texto = refs.map((r) => String(r.texto || "")).join("\n").toLowerCase();
  const normalizado = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const out: string[] = [];
  for (const i of INTERESES_DE_META) {
    const clave = i.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    // Por tallo, para que el anuncio que dice "tu perro" casé con el interés
    // "perros" (Meta lo tiene en plural; los anuncios lo escriben en singular).
    const sinS = clave.replace(/s$/, "");
    const re = new RegExp(`(^|[^a-z])${sinS.replace(/ /g, "\\s+")}(s)?(?![a-z])`);
    if (re.test(normalizado)) out.push(i);
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * LA SEGMENTACIÓN COMPLETA del producto, con el estudio real, y guardada en el
 * producto (metadata.segmentacion) para que el anuncio la use.
 *
 * Con `guardado` se sabe si quedó en el producto: el campana/panel no debe
 * decir "aplique el estudio" si no se guardó.
 */
export async function segmentacionDelProducto(
  tenantId: number,
  productId: number,
  opts: { conInvestigacion?: boolean } = {},
): Promise<SegmentacionEstudiada & { guardado: boolean }> {
  const evidencia: string[] = [];
  const { db, products } = await import("@workspace/db");
  const { and, eq } = await import("drizzle-orm");
  const [p] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);
  if (!p) throw new Error("Ese producto no existe en este negocio.");

  // ── 1. El público, derivado del producto (puro, testeado) ───────────────
  const { publicoDelProducto } = await import("./landing/publico-del-producto");
  const publico = publicoDelProducto({
    nombre: p.name,
    categoria: (p as any).category,
    descripcion: p.description,
    caracteristicas: (p as any).features,
    tipo: p.kind,
  });
  const rango = rangoDePublico(publico.publico);
  evidencia.push(`Público: ${publico.publico} — ${publico.porque}`);
  evidencia.push(`Edad/sexo: ${rango.porque}`);

  // ── 2. Los intereses: los que META conoce + el mercado real ─────────────
  let intereses: string[] = [];
  let porqueIntereses = "";
  if (opts.conInvestigacion !== false) {
    const { buscarYGuardarReferenciasDelProducto } = await import("./referencias-de-mercado");
    const refs = await buscarYGuardarReferenciasDelProducto(tenantId, productId).catch(() => null);
    if (refs?.ok) {
      intereses = interesesDeReferencias(refs.referencias);
      const sostenidos = refs.intentos.filter((i) => i.ok);
      porqueIntereses = `${intereses.length} interest(s) salieron de ${sostenidos.length} búsqueda(s) real(es) de anuncios activos (${refs.referencias.length} referencia(s) leida(s))`;
      evidencia.push(porqueIntereses);
    } else {
      evidencia.push("La investigación del mercado no devolvió anuncios: sin ella no hay intereses nuevos que proponer, y los que ya conozco quedan.");
    }
  } else {
    evidencia.push("Paso la investigación (conInvestigacion:false): intereses solo de la taxonomía del negocio.");
  }

  // ── 3. EL ESTUDIO DE CIUDADES (cobertura real + riesgo medido) ──────────
  let ciudades: CiudadEstudiada[] = [];
  try {
    ciudades = await estudiarCiudades(tenantId);
    if (ciudades.length) {
      evidencia.push(`Estudio de cobertura/riesgo sobre ${ciudades.length} ciudad(es) con pedidos tuyos.`);
    }
  } catch (e: any) {
    evidencia.push(`El estudio de ciudades no corrió (${e?.message || "error"}): el anuncio queda a todo el país, como siempre.`);
  }

  const resultado: SegmentacionEstudiada = {
    edadMin: rango.edadMin,
    edadMax: rango.edadMax,
    genero: rango.genero,
    intereses,
    porqueIntereses: porqueIntereses || "sin investigación disponible en esta pasada",
    ciudades,
    textoCiudades: estudioATexto(ciudades),
    evidencia,
  };

  // ── Guardado: cada paso deja su resultado en el producto ────────────────
  let guardado = false;
  try {
    const { metadataDelProducto, guardarMetadata } = await import("./activos-fabricante");
    const meta = (await metadataDelProducto(tenantId, productId)) || {};
    meta.segmentacion = { ...resultado, en: new Date().toISOString() };
    await guardarMetadata(tenantId, productId, meta);
    guardado = true;
  } catch {
    evidencia.push("No se pudo guardar el estudio en el producto: el próximo borrador lo recalcula.");
  }

  return { ...resultado, guardado };
}