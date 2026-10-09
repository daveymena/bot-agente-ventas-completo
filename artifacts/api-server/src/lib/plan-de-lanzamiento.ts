/**
 * ============================================================
 * "ARMAME UN PLAN PARA LANZAR X": un plan que se puede EJECUTAR
 * ============================================================
 *
 * Pedido del dueño (07-10-2026): que Atlas "arme planes completos cuando se
 * le pide algo grande".
 *
 * Las piezas ya existían por separado y cada una anda:
 *
 *   · `lanzar_producto`   ficha → landing → copies → anuncio en borrador
 *   · `landing_publicar`  la URL pública de una landing en borrador
 *   · `dropi_margen`      cuánto se gana por venta (lectura)
 *   · `que_hago_con_la_campana`  escalar / esperar / cortar (lectura)
 *   · `propose_action` con varias acciones → UNA confirmación las ejecuta
 *     en orden (rama de aprobación de routes/operator-opencode.ts)
 *
 * Lo que faltaba era el PLAN: ante "armame un plan para lanzar el masajeador"
 * el modelo redactaba de memoria una lista de 12 pasos genéricos ("definí tu
 * público", "creá contenido de valor") sin mirar qué tenía ya hecho el negocio
 * ni dejar nada listo para ejecutar. El admin leía un ensayo y después tenía
 * que pedir cada cosa por separado.
 *
 * Acá el plan sale de los HECHOS del negocio (¿hay foto y precio?, ¿ya hay
 * landing?, ¿ya hay paquete de lanzamiento?, ¿Facebook está conectado?, ¿dijo
 * presupuesto?) y cada paso viene marcado con quién lo hace y cuándo:
 *
 *   ✅ hecho     ya está, no se repite
 *   🚀 ahora     el sistema lo puede hacer YA: va en `accionesParaProponer`
 *   🙋 decide    lo decide el dueño (plata, datos que solo él tiene)
 *   ⏳ después   seguimiento, cuando haya datos
 *
 * El núcleo es puro (`armarPlanDeLanzamiento`) para poder probarlo sin base
 * ni red. Activar la pauta NUNCA entra en `accionesParaProponer`: gasta plata
 * y es decisión del dueño, igual que en todo el resto de Atlas.
 */

export type EstadoDelPaso = "hecho" | "ahora" | "decide" | "despues";

export interface AccionDelPlan {
  tool: string;
  args: Record<string, any>;
}

export interface PasoDelPlan {
  n: number;
  que: string;
  estado: EstadoDelPaso;
  detalle: string;
  /** Un cambio que el sistema puede hacer ya (va por propose_action). */
  accion?: AccionDelPlan;
  /** Una LECTURA que conviene correr en el mismo turno (no pide permiso). */
  lectura?: AccionDelPlan;
}

export interface HechosDeLanzamiento {
  producto: {
    id: number;
    nombre: string;
    precio: number | null;
    moneda?: string | null;
    tieneFoto: boolean;
    esDropi: boolean;
  } | null;
  landing: { id: number; publicada: boolean; url?: string | null } | null;
  /** `products.metadata.lanzamiento` existe: landing + copies + borrador ya se armaron. */
  paqueteListo: boolean;
  facebookConectado: boolean;
  /** Lo que dijo el admin. Sin esto no se sube nada a Meta: es su plata. */
  presupuestoDiario: number | null;
  /** Borrador local de anuncio de este producto que todavía no está en Meta. */
  borradorSinSubir?: number | null;
}

export interface PlanDeLanzamiento {
  pasos: PasoDelPlan[];
  /** Exactamente lo que hay que pasarle a propose_action, en orden. */
  accionesParaProponer: AccionDelPlan[];
  /** Lecturas para correr en el mismo turno antes de responder. */
  lecturasSugeridas: AccionDelPlan[];
}

const ICONO: Record<EstadoDelPaso, string> = { hecho: "✅", ahora: "🚀", decide: "🙋", despues: "⏳" };

function plata(n: number, moneda?: string | null): string {
  return `$${Math.round(n).toLocaleString("es-CO")}${moneda ? ` ${moneda}` : ""}`;
}

export function armarPlanDeLanzamiento(h: HechosDeLanzamiento): PlanDeLanzamiento {
  const pasos: Omit<PasoDelPlan, "n">[] = [];
  const p = h.producto;
  if (!p) {
    return { pasos: [], accionesParaProponer: [], lecturasSugeridas: [] };
  }

  // 1. La ficha. Sin precio ni foto no hay landing ni anuncio que valga.
  const falta = [!p.precio || p.precio <= 0 ? "precio" : "", !p.tieneFoto ? "foto" : ""].filter(Boolean);
  const fichaLista = falta.length === 0;
  pasos.push(fichaLista
    ? { que: "Ficha del producto", estado: "hecho", detalle: `precio ${plata(p.precio!, p.moneda)} y foto cargados` }
    : { que: "Ficha del producto", estado: "decide", detalle: `falta ${falta.join(" y ")}: pasámelo y lo cargo` });

  // 2. Los números, solo cuando hay un costo de proveedor que leer.
  if (p.esDropi) {
    pasos.push({
      que: "Cuánto se gana por venta",
      estado: "ahora",
      detalle: "costo del proveedor + flete contra el precio de venta",
      lectura: { tool: "dropi_margen", args: { productId: p.id } },
    });
  }

  // 3 y 4. Página + copies + anuncio en borrador: si no hay paquete, lo arma
  // `lanzar_producto` entero (incluida la landing). Si ya lo hay, lo que
  // puede faltar es publicar la landing.
  const subirYa = h.facebookConectado && !!h.presupuestoDiario && h.presupuestoDiario > 0;
  if (!h.paqueteListo) {
    if (h.landing?.publicada) {
      pasos.push({ que: "Página de venta", estado: "hecho", detalle: h.landing.url ? `publicada: ${h.landing.url}` : "publicada" });
    }
    pasos.push({
      que: h.landing?.publicada ? "Copies y anuncio en borrador" : "Página de venta, copies y anuncio en borrador",
      estado: fichaLista ? "ahora" : "decide",
      detalle: fichaLista
        ? `lo arma el paquete de lanzamiento en 2-5 min${subirYa ? ", y sube el anuncio a Meta EN PAUSA" : " (el anuncio queda en borrador local)"}`
        : "se arma apenas esté la ficha",
      ...(fichaLista
        ? {
            accion: {
              tool: "lanzar_producto",
              args: {
                productId: p.id,
                ...(h.presupuestoDiario ? { presupuestoDiario: h.presupuestoDiario } : {}),
                ...(subirYa ? { conAnuncio: true } : {}),
              },
            },
          }
        : {}),
    });
  } else {
    if (h.landing && !h.landing.publicada) {
      pasos.push({
        que: "Página de venta",
        estado: "ahora",
        detalle: "está en borrador: la publico para tener la URL",
        accion: { tool: "landing_publicar", args: { id: h.landing.id } },
      });
    } else {
      pasos.push({ que: "Página de venta", estado: "hecho", detalle: h.landing?.url ? `publicada: ${h.landing.url}` : "lista" });
    }
    pasos.push({ que: "Copies y anuncio en borrador", estado: "hecho", detalle: "ya están en el paquete de lanzamiento" });
  }

  // 5. El presupuesto: es plata del dueño, no se elige por él.
  pasos.push(h.presupuestoDiario && h.presupuestoDiario > 0
    ? { que: "Presupuesto de la prueba", estado: "hecho", detalle: `${plata(h.presupuestoDiario, p.moneda)} por día` }
    : { que: "Presupuesto de la prueba", estado: "decide", detalle: "cuánto por día querés invertir en la prueba" });

  // 6. Meta.
  if (!h.facebookConectado) {
    pasos.push({ que: "Subir el anuncio a Meta en pausa", estado: "decide", detalle: "primero conectá Facebook desde el panel" });
  } else if (h.paqueteListo) {
    const subible = subirYa && !!h.borradorSinSubir;
    pasos.push({
      que: "Subir el anuncio a Meta en pausa",
      estado: subible ? "ahora" : "decide",
      detalle: subible
        ? `subo el borrador #${h.borradorSinSubir} en pausa (no gasta hasta que lo enciendas)`
        : subirYa ? "no encontré un borrador sin subir de este producto: lo armo de nuevo si querés" : "con el presupuesto definido lo subo en pausa",
      ...(subible ? { accion: { tool: "fb_upload_draft_to_meta", args: { draftId: h.borradorSinSubir } } } : {}),
    });
  } else if (!subirYa) {
    pasos.push({ que: "Subir el anuncio a Meta en pausa", estado: "decide", detalle: "con el presupuesto definido lo subo en pausa" });
  }

  // 7 y 8. Lo que nunca se hace solo, y el seguimiento.
  pasos.push({ que: "Encender la campaña", estado: "decide", detalle: "gasta plata: lo decidís vos cuando la veas en pausa" });
  pasos.push({ que: "Revisión a las 48 h", estado: "despues", detalle: "escalar 20%, esperar o cortar según los resultados reales" });

  const numerados: PasoDelPlan[] = pasos.map((x, i) => ({ ...x, n: i + 1 }));
  return {
    pasos: numerados,
    accionesParaProponer: numerados.filter((x) => x.estado === "ahora" && x.accion).map((x) => x.accion!),
    lecturasSugeridas: numerados.filter((x) => x.lectura).map((x) => x.lectura!),
  };
}

/** El plan en el formato que lee el admin: un paso por línea. */
export function planEnTexto(nombreProducto: string, plan: PlanDeLanzamiento): string {
  const lineas = plan.pasos.map((x) => `${ICONO[x.estado]} ${x.n}. ${x.que}: ${x.detalle}`);
  return `📋 Plan para lanzar **${nombreProducto}**\n\n${lineas.join("\n")}`;
}

// ── Encontrar el producto del que habla ──────────────────────────────────

const ACENTOS: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n" };
const normalizar = (s: string) => String(s || "").toLowerCase().replace(/[áéíóúüñ]/g, (c) => ACENTOS[c] ?? c);
const palabras = (s: string) => normalizar(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

/**
 * El producto que mejor coincide con lo que dijo el admin.
 *
 * Por palabras compartidas con el nombre, no por igualdad: el admin dice "el
 * masajeador" y el producto se llama "Masajeador Cervical Eléctrico 8 Nodos".
 * Si hay empate entre varios, no se elige por él: se devuelven los candidatos.
 */
export function elegirProducto<T extends { id: number; name: string }>(
  lista: T[],
  dicho: string,
): { elegido: T | null; candidatos: T[] } {
  const buscadas = palabras(dicho);
  if (!buscadas.length) return { elegido: null, candidatos: [] };
  const puntaje = lista
    .map((p) => {
      const delNombre = new Set(palabras(p.name));
      return { p, n: buscadas.filter((w) => delNombre.has(w)).length };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  if (!puntaje.length) return { elegido: null, candidatos: [] };
  const mejores = puntaje.filter((x) => x.n === puntaje[0].n).map((x) => x.p);
  return mejores.length === 1 ? { elegido: mejores[0], candidatos: [] } : { elegido: null, candidatos: mejores.slice(0, 5) };
}
