/**
 * LA RÚBRICA DE UN BORRADOR DE ANUNCIO PROFESIONAL (07-10-2026)
 * ============================================================
 *
 * Pedido del dueño: "que en BORRADORES se creen borradores PROFESIONALES".
 * Para saber si un borrador lo es hace falta medirlo, no opinarlo. Ocho
 * criterios, todos sobre datos que el sistema TIENE (el borrador, el producto
 * y a dónde lleva el anuncio). Es pura: la usan los tests, la lista de
 * borradores del panel (GET /strategist/drafts) y la vuelta de corrección de
 * `crear_anuncio`.
 *
 *   1. gancho      — primera línea propia (≠ titular, ≠ nombre), ≤125 letras
 *   2. beneficio   — al menos un beneficio concreto además del gancho
 *   3. prueba      — ninguna prueba social / garantía / urgencia inventada
 *   4. oferta      — el precio que aparece es EL precio del producto
 *   5. cta         — UNA acción, coherente con el destino (WhatsApp o web)
 *   6. longitudes  — titular ≤40, descripción ≤30, texto 80-1300
 *   7. creativo    — foto(s) REAL(es) del producto, no placeholder
 *   8. segmentación— edades coherentes, intereses válidos
 */
import { LIMITES_META, dicenLoMismo, accionContradiceDestino, type DestinoDelAnuncio } from "./anuncio-por-modelo";
import { revisarCopy } from "./publicidad-persuasiva";

export type CriterioId = "gancho" | "beneficio" | "prueba" | "oferta" | "cta" | "longitudes" | "creativo" | "segmentacion";

export interface ResultadoCriterio {
  id: CriterioId;
  nombre: string;
  ok: boolean;
  /** Qué se vio, en palabras del negocio. */
  detalle: string;
}

export interface EvaluacionDeBorrador {
  /** 0-100: proporción de criterios cumplidos. */
  puntaje: number;
  criterios: ResultadoCriterio[];
  /** Los criterios que fallan, para mostrar o devolverle al modelo. */
  reparos: string[];
}

export interface BorradorParaEvaluar {
  primaryText?: string | null;
  headline?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  images?: string[] | null;
  strategy?: { ageMin?: number; ageMax?: number; interests?: unknown; ciudades?: unknown } | null;
}

export interface ContextoDeEvaluacion {
  producto: { name?: string | null; price?: number | string | null; description?: string | null; features?: unknown };
  destino: DestinoDelAnuncio;
  /** Fotos reales del producto (fotosDelProducto). Sin lista, solo se exige que no sea placeholder. */
  fotosDelProducto?: string[];
  /** Montos que SÍ pueden aparecer además del precio (ej. costo de envío del negocio). */
  otrosMontos?: number[];
  /** Si el NEGOCIO ofrece garantía (business-context): entonces puede decirse. */
  negocioTieneGarantia?: boolean;
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Las líneas de la lista (beneficios): empiezan con viñeta o emoji y no son oferta ni acción. */
function lineasDeBeneficio(texto: string): string[] {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^(?:[•\-*✔✓✅]|\p{Extended_Pictographic})/u.test(l))
    .filter((l) => !/^(?:💰|🔥|🚚|💵|📦|⚡|👉|♾️|📝)/u.test(l));
}

export function evaluarBorrador(b: BorradorParaEvaluar, ctx: ContextoDeEvaluacion): EvaluacionDeBorrador {
  const texto = String(b.primaryText || "").trim();
  const titular = String(b.headline || "").trim();
  const desc = String(b.description || "").trim();
  const nombre = String(ctx.producto.name || "").trim();
  const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const primera = lineas[0] || "";
  const criterios: ResultadoCriterio[] = [];
  const add = (id: CriterioId, nombreC: string, ok: boolean, detalle: string) => criterios.push({ id, nombre: nombreC, ok, detalle });

  // 1. Gancho
  {
    const sinEmoji = primera.replace(/^[\p{Extended_Pictographic}️\s]+/u, "");
    const problemas: string[] = [];
    if (!primera) problemas.push("no hay primera línea");
    if (primera && titular && dicenLoMismo(sinEmoji, titular)) problemas.push("repite el titular");
    if (primera && nombre && dicenLoMismo(sinEmoji, nombre)) problemas.push("es solo el nombre del producto (la ficha no trae un beneficio con el que abrir)");
    if (primera.length > LIMITES_META.primeraVista) problemas.push(`mide ${primera.length} letras y Meta corta en ${LIMITES_META.primeraVista}`);
    add("gancho", "Gancho en la primera línea", problemas.length === 0, problemas.length ? `El gancho ${problemas.join("; ")}.` : `Abre con: "${primera.slice(0, 80)}"`);
  }

  // 2. Beneficio concreto
  {
    const beneficios = lineasDeBeneficio(texto).filter((l) => !dicenLoMismo(l, primera));
    add("beneficio", "Beneficio concreto", beneficios.length >= 1,
      beneficios.length ? `${beneficios.length} beneficio(s) de la ficha.` : "No hay ningún beneficio además del gancho: la ficha del producto no trae características (conviene curarla).");
  }

  // 3. Prueba: nada inventado
  {
    const r = revisarCopy(`${texto}\n${titular}\n${desc}`);
    const reparos = r.bloquea.map((x) => x.problema);
    const respaldo = sinTildes(`${ctx.producto.description || ""} ${JSON.stringify(ctx.producto.features || "")}`);
    const t = sinTildes(`${texto} ${titular} ${desc}`);
    if (/\btestimonio|\bresenas?\b|\bclientes satisfechos|\bestrellas\b/.test(t) && !/\btestimonio|\bresenas?\b/.test(respaldo)) reparos.push("menciona testimonios o reseñas que no están en la ficha");
    if (/\bgarantia\b/.test(t) && !ctx.negocioTieneGarantia && !/\bgarantia\b/.test(respaldo)) reparos.push("promete una garantía que ni el producto ni el negocio definieron");
    if (/\benvio gratis\b/.test(t)) reparos.push("dice \"envío gratis\": el negocio lo define como \"envío incluido\" o con su costo");
    add("prueba", "Prueba real (o ninguna)", reparos.length === 0, reparos.length ? `Inventa: ${reparos.join("; ")}.` : "Sin prueba social, garantías ni urgencia inventadas.");
  }

  // 4. Oferta / precio correcto
  {
    const precio = Number(ctx.producto.price) || 0;
    const permitidos = new Set([precio, ...(ctx.otrosMontos || [])].filter((n) => n > 0));
    const montos = (`${texto} ${titular} ${desc}`.match(/\$\s?\d[\d.,]*/g) || []).map((m) => Number(m.replace(/[^\d]/g, "")));
    const ajenos = montos.filter((n) => !permitidos.has(n));
    const ok = ajenos.length === 0 && (precio <= 0 || montos.includes(precio));
    add("oferta", "Oferta y precio correctos", ok,
      ajenos.length ? `Aparece un monto que no es el precio del producto: ${ajenos.map((n) => `$${n.toLocaleString("es-CO")}`).join(", ")}.`
        : precio > 0 && !montos.includes(precio) ? "No dice el precio: llegan consultas peor calificadas."
          : "El precio es el del producto.");
  }

  // 5. CTA único y coherente con el destino
  {
    const acciones = lineas.filter((l) => /^👉/u.test(l));
    const accion = acciones[acciones.length - 1] || "";
    const problemas: string[] = [];
    if (acciones.length === 0) problemas.push("no termina con una acción (👉)");
    if (acciones.length > 1) problemas.push(`pide ${acciones.length} acciones distintas`);
    if (accion && accionContradiceDestino(accion, ctx.destino)) {
      problemas.push(ctx.destino === "web" ? "pide escribir por WhatsApp y el anuncio lleva a la página" : "manda a un enlace y el anuncio abre WhatsApp");
    }
    add("cta", "Una sola acción, coherente con el destino", problemas.length === 0,
      problemas.length ? `La acción ${problemas.join("; ")}.` : `Acción: "${accion.replace(/^👉\s*/u, "")}" (${ctx.destino === "web" ? "a la página" : "a WhatsApp"}).`);
  }

  // 6. Longitudes de Meta
  {
    const problemas: string[] = [];
    if (!titular) problemas.push("no hay titular");
    if (titular.length > LIMITES_META.titular) problemas.push(`titular de ${titular.length} letras (máx. ${LIMITES_META.titular})`);
    if (desc.length > LIMITES_META.descripcion) problemas.push(`descripción de ${desc.length} letras (máx. ${LIMITES_META.descripcion})`);
    if (texto.length < 80) problemas.push(`texto de ${texto.length} letras: muy corto`);
    if (texto.length > 1300) problemas.push(`texto de ${texto.length} letras: Meta lo esconde tras "ver más"`);
    if (/…$/.test(titular) || /…$/.test(desc)) problemas.push("un campo termina cortado con \"…\"");
    add("longitudes", "Largos que Meta muestra completos", problemas.length === 0,
      problemas.length ? problemas.join("; ") + "." : `Titular ${titular.length}/40 · descripción ${desc.length}/30 · texto ${texto.length}.`);
  }

  // 7. Creativo: fotos reales del producto
  {
    const imgs = (Array.isArray(b.images) && b.images.length ? b.images : [b.imageUrl]).filter(Boolean) as string[];
    const problemas: string[] = [];
    if (!imgs.length) problemas.push("no tiene imagen");
    if (imgs.some((u) => /placehold\.co/i.test(u))) problemas.push("usa el cartel gris de \"sin foto\"");
    const fotos = ctx.fotosDelProducto || [];
    if (fotos.length && imgs[0] && !/placehold\.co/i.test(imgs[0])) {
      const deLaFicha = new Set(fotos);
      // Las subidas por el admin (/uploads/ fuera de products) también valen: las eligió él.
      if (!deLaFicha.has(imgs[0]) && !/\/uploads\//.test(imgs[0])) problemas.push("la foto principal no es una foto del producto");
    }
    if (fotos.length > 1 && imgs.length === 1) problemas.push(`el producto tiene ${fotos.length} fotos y el anuncio usa una (podría ser carrusel)`);
    add("creativo", "Fotos reales del producto", problemas.length === 0,
      problemas.length ? `El creativo ${problemas.join("; ")}.` : `${imgs.length} foto(s) real(es)${imgs.length > 1 ? " · carrusel" : ""}.`);
  }

  // 8. Segmentación coherente
  {
    const st: any = b.strategy || {};
    const problemas: string[] = [];
    const min = Number(st.ageMin), max = Number(st.ageMax);
    if (Number.isFinite(min) && min < 18) problemas.push(`edad mínima ${min} (menores de edad)`);
    if (Number.isFinite(min) && Number.isFinite(max) && min >= max) problemas.push(`edades al revés (${min}-${max})`);
    if (Number.isFinite(max) && max > 65) problemas.push(`edad máxima ${max} (Meta usa 65+)`);
    if (st.interests != null && (!Array.isArray(st.interests) || st.interests.some((i: unknown) => typeof i !== "string" || !String(i).trim()))) problemas.push("intereses mal formados");
    if (st.ciudades != null && (!Array.isArray(st.ciudades) || st.ciudades.some((c: unknown) => typeof c !== "string" || !String(c).trim()))) problemas.push("ciudades mal formadas");
    const intereses = Array.isArray(st.interests) ? st.interests.length : 0;
    add("segmentacion", "Segmentación coherente", problemas.length === 0,
      problemas.length ? `${problemas.join("; ")}.` : `${Number.isFinite(min) ? `${min}-${Number.isFinite(max) ? max : "65"} años` : "Edad abierta"} · ${intereses ? `${intereses} interés(es)` : "público amplio (Advantage+)"}${Array.isArray(st.ciudades) && st.ciudades.length ? ` · ${st.ciudades.length} ciudad(es)` : ""}.`);
  }

  const cumplidos = criterios.filter((c) => c.ok).length;
  return {
    puntaje: Math.round((cumplidos / criterios.length) * 100),
    criterios,
    reparos: criterios.filter((c) => !c.ok).map((c) => `${c.nombre}: ${c.detalle}`),
  };
}

/**
 * Los reparos que el MODELO puede corregir reescribiendo (no los de la ficha
 * ni los del creativo): es lo que `crear_anuncio` le devuelve en su vuelta
 * de corrección.
 */
export function reparosDeRedaccion(e: EvaluacionDeBorrador): string | null {
  const corregibles = e.criterios.filter((c) => !c.ok && (c.id === "cta" || c.id === "oferta" || c.id === "prueba" || (c.id === "gancho" && /repite el titular|corta en/.test(c.detalle))));
  return corregibles.length ? corregibles.map((c) => `${c.nombre}: ${c.detalle}`).join("\n") : null;
}
