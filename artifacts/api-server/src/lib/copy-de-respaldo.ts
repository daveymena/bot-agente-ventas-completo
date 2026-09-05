/**
 * ============================================================
 * SI EL MODELO NO ESCRIBE, EL ANUNCIO SALE IGUAL
 * ============================================================
 *
 * Idea tomada del Landing Agent que construyó otra IA en este mismo repo
 * (`routes/landing-pages-ai.ts`, 04-09-2026). Ahí hace esto:
 *
 *     const sections = normalizeSections(result?.sections, product);
 *     // si el modelo devuelve basura → fallbackSections(product)
 *
 * O sea: pase lo que pase con el modelo, sale algo USABLE armado con los datos
 * reales del producto. Atlas hacía lo contrario en `crear_anuncio`:
 *
 *     if (!copy?.primaryText) return { ok: false, summary: "El modelo no
 *       devolvió un copy utilizable. Probá de nuevo en un momento." };
 *
 * Se rendía. Y ese mensaje exacto ya estaba documentado como fallo MEDIDO en
 * vivo el 2026-08-19: 388 ms, un fallo instantáneo --ni siquiera un timeout--
 * y el admin sin anuncio con la clave paga ya cargada. Es la misma queja que
 * volvió el 04-09: *"Atlas duró más de un minuto para generar un copy y nunca
 * lo entregó"*.
 *
 * ── Por qué un respaldo determinístico y no otro reintento ────────────────
 *
 * Reintentar cuesta tiempo, que es justo lo que no sobra: el turno tiene 135s
 * y el admin ya esperó. Este respaldo no llama a nadie y no puede fallar,
 * porque lo único que hace es ORDENAR datos que ya están en la fila del
 * producto.
 *
 * ── La regla que no se negocia ────────────────────────────────────────────
 *
 * El respaldo NO INVENTA NADA. Solo usa nombre, características, descripción,
 * precio y moneda tal como están cargados. Sin urgencia, sin prueba social,
 * sin garantías, sin resultados. Un respaldo que rellena con frases de venta
 * genéricas sería peor que el error: publicaría afirmaciones que el negocio no
 * puede sostener. Por eso el resultado sigue pasando por `revisarCopy()` igual
 * que el del modelo -- si algo de acá no pasara el validador, es un bug de
 * este archivo, no una excepción a tolerar.
 *
 * Y se le dice al admin que es un borrador base, no el copy de la IA. Hacerlo
 * pasar por trabajo del modelo sería mentirle sobre lo que tiene en la mano.
 */

export interface ProductoParaRespaldo {
  name?: string | null;
  description?: string | null;
  features?: unknown;
  highlight?: string | null;
  price?: number | string | null;
  currency?: string | null;
  kind?: string | null;
}

export interface CopyDeRespaldo {
  primaryText: string;
  headline: string;
  description: string;
  /** Siempre true: quien lo recibe tiene que poder distinguirlo del copy del modelo. */
  esRespaldo: true;
}

/** Emoji genéricos por posición, para cuando la característica no trae el suyo. */
const VINETAS = ["✅", "✅", "✅", "✅", "✅"];

/**
 * ¿Esta característica ya viene con su propio emoji del catálogo?
 *
 * Mismo criterio que el copy del modelo (ver FORMATO_COPY en
 * publicidad-persuasiva.ts): el emoji que el dueño eligió para representar un
 * ítem se respeta; ✅ es solo para los que no traen ninguno.
 */
export function yaTraeEmoji(texto: string): boolean {
  return /^\s*\p{Extended_Pictographic}/u.test(texto);
}

/** Corta en el último espacio antes del límite, para no partir una palabra. */
function recortar(texto: string, max: number): string {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const esp = corte.lastIndexOf(" ");
  return (esp > max * 0.6 ? corte.slice(0, esp) : corte).replace(/[.,;:]$/, "");
}

/**
 * Saca los puntos de la lista de los datos reales del producto.
 *
 * Prioridad: `features` (que es donde el dueño los cargó uno por uno) y, si no
 * hay, las frases de la descripción. Nada más: si el producto no tiene
 * material, la lista sale corta, y una lista corta es mejor que una inventada.
 */
function puntosReales(prod: ProductoParaRespaldo): string[] {
  const features = Array.isArray(prod.features)
    ? (prod.features as unknown[]).map((f) => String(f ?? "").trim()).filter(Boolean)
    : [];
  if (features.length > 0) return features.slice(0, 5).map((f) => recortar(f, 70));

  const desc = String(prod.description || "").replace(/\s+/g, " ").trim();
  if (!desc) return [];
  return desc
    .split(/(?<=[.;·•])\s+|\n+/)
    .map((f) => f.replace(/^[-•·]\s*/, "").trim())
    .filter((f) => f.length >= 12)
    .slice(0, 4)
    .map((f) => recortar(f, 70));
}

/** El precio tal como está cargado, sin adornos. */
function precioTexto(prod: ProductoParaRespaldo): string {
  const n = Number(prod.price ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `$${n.toLocaleString("es-CO")} ${String(prod.currency || "").trim()}`.trim();
}

/**
 * Un anuncio base, armado solo con lo que el producto ya dice.
 *
 * Respeta la misma forma que se le pide al modelo --gancho / beneficio / lista
 * / precio / acción-- para que el admin reciba algo con la estructura correcta
 * y pueda editarlo, en vez de un error.
 */
export function copyDeRespaldo(prod: ProductoParaRespaldo): CopyDeRespaldo {
  const nombre = String(prod.name || "").trim() || "este producto";
  const puntos = puntosReales(prod);
  const precio = precioTexto(prod);
  const esDigital = !["physical", "fisico", "físico", "dropshipping"].includes(String(prod.kind || "digital").toLowerCase());

  const bloques: string[] = [];

  // GANCHO. Una pregunta sobre el producto real -- no una promesa sobre lo que
  // le va a pasar a quien lo compre, que es lo que no se puede sostener.
  bloques.push(`👉 ¿Estás buscando ${nombre.toLowerCase()}?`);

  // BENEFICIO. Lo destacado si el dueño lo cargó; si no, la descripción. Y si
  // no hay ninguno de los dos, este bloque simplemente no va.
  const respaldo = String(prod.highlight || "").trim() || recortar(String(prod.description || ""), 160);
  if (respaldo) bloques.push(respaldo);

  // LISTA, con el emoji del catálogo cuando la característica lo trae.
  if (puntos.length > 0) {
    bloques.push(puntos.map((p, i) => (yaTraeEmoji(p) ? p : `${VINETAS[i] || "✅"} ${p}`)).join("\n"));
  }

  if (precio) bloques.push(`🔥 ${precio}`);

  // ACCIÓN. Solo se afirma la forma de entrega cuando se sabe cuál es.
  bloques.push(esDigital ? "👉 Escribinos y te contamos cómo recibirlo." : "👉 Escribinos para coordinar el tuyo.");

  return {
    primaryText: bloques.join("\n\n"),
    headline: recortar(nombre, 40),
    description: recortar(respaldo || nombre, 60),
    esRespaldo: true,
  };
}

/**
 * El aviso que ve el admin cuando el anuncio salió del respaldo.
 *
 * Va aparte del copy para que quien lo muestre no tenga que redactarlo, y para
 * que diga siempre lo mismo: qué pasó, qué tiene en la mano, y qué hacer.
 */
export function avisoDeCopyDeRespaldo(): string {
  return (
    `⚠️ El modelo no alcanzó a escribir el copy, así que armé un **borrador base** con los datos reales del producto ` +
    `--nombre, características y precio, sin agregar nada--.\n\n` +
    `Sirve para no dejarte sin anuncio, pero no está trabajado como venta: revisalo antes de publicarlo, ` +
    `o pedímelo de nuevo y lo escribo completo.`
  );
}
