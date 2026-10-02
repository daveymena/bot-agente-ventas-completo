/**
 * REFERENCIAS DE MERCADO EN VARIOS IDIOMAS
 * ========================================
 *
 * Paso 1 del plan (`LANDING_Y_ACTIVOS_AUTOMATIZACION.md`): "`fb_ad_library` en
 * el país **+ en 2-3 idiomas** (términos traducidos por IA); guarda los anuncios
 * activos sostenidos y sus landings".
 *
 * Por qué: el anuncio que sirve de modelo no es el del vecino — es uno que
 * lleva MESES al aire en otro mercado. El autor del curso lo busca en neerlandés
 * y alemán justamente por eso. `fb_ad_library` lee UN idioma por llamada (una
 * consulta + un país), así que el bucle y la mezcla son lo que faltaba.
 *
 * Lo que este módulo NO hace:
 *   · No inventa una referencia que no leyó. Si una búsqueda falla, se registra
 *     como fallida y se sigue: si fallan todas, el resultado es `ok: false`.
 *   · No inventa "días activo": la lectura no trae la fecha de inicio. Lo que sí
 *     se puede medir es que el MISMO anuncio aparezca en varias búsquedas, y eso
 *     es lo que se ordena primero.
 *
 * El buscador y el traductor entran por parámetro: así el bucle se prueba entero
 * sin Chromium ni red (que es lo que hay en CI).
 */

/** Un anuncio leído, con de dónde salió. */
export interface ReferenciaDeMercado {
  /** El texto del anuncio tal como se leyó. Es materia prima, no copy final. */
  texto: string;
  pais: string;
  idioma: string;
  /** La consulta con la que se encontró. */
  consulta: string;
}

/** Qué devuelve una búsqueda. */
export interface ResultadoBusqueda {
  ok: boolean;
  anuncios: string[];
  error?: string;
}

export type BuscadorDeAnuncios = (consulta: string, pais: string, limite: number) => Promise<ResultadoBusqueda>;
export type Traductor = (consulta: string) => Promise<string | null>;

/** Idiomas que se agregan al del negocio. Uno solo: cada llamada es pesada. */
export const IDIOMAS_EXTRA = ["en"];
/** País por defecto: el mismo que usa `fb_ad_library`. */
export const PAIS_POR_DEFECTO = "CO";
const LIMITE_POR_BUSQUEDA = 8;
const MAX_REFERENCIAS = 20;

/** Clave para comparar anuncios: sin mayúsculas, sin espacios de más, sin signos. */
export function claveDeAnuncio(texto: string): string {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Une los anuncios de todas las búsquedas.
 *
 * Sin repetir (el mismo anuncio puede salir en dos idiomas o dos consultas) y
 * ordenando primero los que aparecen MÁS VECES: un anuncio que el mercado
 * repite es el que está sostenido con plata, y ese es el que sirve de modelo.
 */
export function unirReferencias(grupos: ReferenciaDeMercado[][], max = MAX_REFERENCIAS): ReferenciaDeMercado[] {
  const porClave = new Map<string, { ref: ReferenciaDeMercado; veces: number }>();
  for (const grupo of grupos) {
    for (const r of grupo || []) {
      const clave = claveDeAnuncio(r?.texto);
      // Un texto vacío no es una referencia: no se cuela como si lo fuera.
      if (!clave) continue;
      const ya = porClave.get(clave);
      if (ya) ya.veces += 1;
      else porClave.set(clave, { ref: r, veces: 1 });
    }
  }
  return [...porClave.values()]
    .sort((a, b) => b.veces - a.veces)
    .slice(0, Math.max(1, max))
    .map((x) => x.ref);
}

export interface IntentoDeBusqueda {
  consulta: string;
  idioma: string;
  pais: string;
  anuncios: number;
  ok: boolean;
  error?: string;
}

export interface ResultadoReferencias {
  ok: boolean;
  error?: string;
  referencias: ReferenciaDeMercado[];
  /** Cada búsqueda con su resultado: es lo que permite decir la verdad en el panel. */
  intentos: IntentoDeBusqueda[];
}

/**
 * Busca el mismo nicho en el idioma del negocio y en los idiomas extra, y une
 * todo. No cambia de país: lo que se busca es QUÉ ÁNGULO funciona, y el país
 * define a quién le llega — mezclarlos daría referencias de un mercado que no
 * es el de este negocio.
 */
export async function buscarReferenciasDeMercado(
  opts: { consulta: string; pais?: string; limite?: number; max?: number; idiomas?: string[] },
  deps: { buscar?: BuscadorDeAnuncios; traducir?: Traductor } = {},
): Promise<ResultadoReferencias> {
  const consulta = String(opts.consulta || "").trim();
  if (!consulta) {
    return { ok: false, error: "Falta la consulta: decime qué nicho o producto buscar.", referencias: [], intentos: [] };
  }
  if (!deps.buscar) {
    return { ok: false, error: "No hay buscador configurado.", referencias: [], intentos: [] };
  }

  const pais = String(opts.pais || PAIS_POR_DEFECTO).toUpperCase().slice(0, 2);
  const limite = Math.min(Math.max(Number(opts.limite) || LIMITE_POR_BUSQUEDA, 1), 20);
  const idiomas = opts.idiomas?.length ? opts.idiomas : IDIOMAS_EXTRA;

  // El idioma del negocio primero: si la traducción falla, igual hay resultado.
  const consultas: { consulta: string; idioma: string }[] = [{ consulta, idioma: "es" }];
  for (const idioma of idiomas) {
    if (!deps.traducir) break;
    try {
      const traducida = String((await deps.traducir(consulta)) || "").trim();
      // Traducir a lo mismo no agrega nada y gasta una lectura de 75 s.
      if (traducida && claveDeAnuncio(traducida) !== claveDeAnuncio(consulta)) {
        consultas.push({ consulta: traducida, idioma });
      }
    } catch {
      /* si el traductor falla, se sigue con el idioma del negocio */
    }
  }

  const intentos: IntentoDeBusqueda[] = [];
  const grupos: ReferenciaDeMercado[][] = [];

  for (const c of consultas) {
    try {
      const r = await deps.buscar(c.consulta, pais, limite);
      if (!r.ok) {
        intentos.push({ consulta: c.consulta, idioma: c.idioma, pais, anuncios: 0, ok: false, error: r.error });
        continue;
      }
      const anuncios = (r.anuncios || []).map((t) => String(t || "").trim()).filter(Boolean);
      intentos.push({ consulta: c.consulta, idioma: c.idioma, pais, anuncios: anuncios.length, ok: true });
      grupos.push(anuncios.map((texto) => ({ texto, pais, idioma: c.idioma, consulta: c.consulta })));
    } catch (e: any) {
      intentos.push({ consulta: c.consulta, idioma: c.idioma, pais, anuncios: 0, ok: false, error: e?.message || "error" });
    }
  }

  const referencias = unirReferencias(grupos, opts.max ?? MAX_REFERENCIAS);
  if (!referencias.length) {
    return {
      ok: false,
      error: "Ninguna búsqueda devolvió anuncios. No se guarda nada inventado.",
      referencias: [],
      intentos,
    };
  }

  return { ok: true, referencias, intentos };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * CABLEADO: del producto a `metadata.referencias`
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface ResultadoReferenciasDeProducto extends ResultadoReferencias {
  /** Si el hallazgo quedó guardado en el producto. */
  guardado: boolean;
}

/**
 * Busca las referencias de UN producto y las deja guardadas en su metadata.
 *
 * Reusa lo que ya existe en vez de reimplementarlo:
 *   · `traducirConsultaAingles` (activos-fabricante) para el idioma extra.
 *   · `fb_ad_library` vía `executeAction`, la misma lectura de la Biblioteca de
 *     Anuncios que usa Atlas — una sola verdad.
 *   · `metadataDelProducto` / `guardarMetadata` (activos-fabricante) para no
 *     tener dos formas de escribir la metadata del producto.
 */
export async function buscarYGuardarReferenciasDelProducto(
  tenantId: number,
  productId: number,
  opts: { pais?: string; limite?: number; max?: number; idiomas?: string[] } = {},
): Promise<ResultadoReferenciasDeProducto> {
  const { db, products } = await import("@workspace/db");
  const { and, eq } = await import("drizzle-orm");
  const vacio: Pick<ResultadoReferenciasDeProducto, "referencias" | "intentos" | "guardado"> = {
    referencias: [],
    intentos: [],
    guardado: false,
  };

  const [p] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);
  if (!p) return { ok: false, error: "Ese producto no existe en este negocio.", ...vacio };

  const nombre = String((p as any).name || "").trim();
  if (!nombre) return { ok: false, error: "El producto no tiene nombre: no hay qué buscar.", ...vacio };

  const { traducirConsultaAingles, metadataDelProducto, guardarMetadata } = await import("./activos-fabricante");
  const { executeAction } = await import("./app-operator");

  const r = await buscarReferenciasDeMercado(
    { consulta: nombre, pais: opts.pais, limite: opts.limite, max: opts.max, idiomas: opts.idiomas },
    {
      traducir: (c) => traducirConsultaAingles(tenantId, c),
      buscar: async (consulta, pais, limite) => {
        const res = await executeAction("fb_ad_library", { query: consulta, pais, limite }, { tenantId });
        return {
          ok: res.ok,
          anuncios: Array.isArray((res.data as any)?.anuncios) ? ((res.data as any).anuncios as string[]) : [],
          error: res.ok ? undefined : res.summary,
        };
      },
    },
  );

  // Nada leído → nada guardado. Guardar una lista vacía haría creer que ya se
  // investigó este producto, y el próximo turno no volvería a intentarlo.
  if (!r.ok) return { ...r, guardado: false };

  try {
    const meta = (await metadataDelProducto(tenantId, productId)) || {};
    meta.referencias = {
      en: new Date().toISOString(),
      producto: nombre,
      referencias: r.referencias,
      intentos: r.intentos,
    };
    await guardarMetadata(tenantId, productId, meta);
  } catch (e: any) {
    return { ...r, error: `Se leyeron las referencias pero no se pudieron guardar: ${e?.message || "error"}`, guardado: false };
  }

  return { ...r, guardado: true };
}
