/**
 * Lo que Atlas (y cualquier herramienta del servidor) puede hacer con los
 * creativos, sin pantalla: crear desde un producto, cambiar textos / color /
 * formato / maqueta y exportar el PNG.
 *
 * Usa las mismas maquetas y el mismo dibujante que el estudio: un creativo
 * hecho por Atlas se abre y se sigue editando a mano en /creativos.
 */
import { MAQUETAS, maquetaPorId, type DatosCreativo } from "../estudio/maquetas-creativo";
import { FORMATOS, normalizarEscena, revisarEscena, type Escena, type Formato } from "../estudio/escena";
import { normalizarHex, tintaSobre } from "../estudio/retoque";
import { datosDelProducto, ganchosConIA, type VarianteDeCopy } from "./datos";
import { guardarCreativo, leerCreativo, type Creativo } from "./almacen";

const esFormato = (f: unknown): f is Formato => typeof f === "string" && f in FORMATOS;

/** Lee de la escena los textos que la maqueta puso (por nombre de capa). */
export function datosDesdeEscena(base: DatosCreativo, e: Escena): DatosCreativo {
  const texto = (nombres: string[]) => (e.capas.find((c) => c.tipo === "texto" && nombres.includes(c.nombre || "")) as any)?.texto as string | undefined;
  return { ...base, gancho: texto(["Gancho", "Gancho resaltado"]) ?? base.gancho, apoyo: texto(["Apoyo"]) ?? base.apoyo, cta: texto(["Texto del botón"]) ?? base.cta };
}

export interface ResultadoCreativo { id: string; nombre: string; maqueta: string; formato: Formato; gancho: string; png: string | null; avisos: string[] }

export async function crearCreativos(tenantId: number, a: {
  productId: number; maqueta?: string | null; formato?: string | null; cantidad?: number;
  gancho?: string | null; apoyo?: string | null; cta?: string | null; acento?: string | null;
  conIA?: boolean; pedido?: string | null; exportar?: boolean;
}): Promise<{ ok: true; creativos: ResultadoCreativo[]; motor: string } | { ok: false; error: string }> {
  const d = await datosDelProducto(tenantId, a.productId);
  if (!d) return { ok: false, error: `No encontré el producto ${a.productId} en este negocio.` };
  if (!d.datos.fotos.length) return { ok: false, error: `El producto "${d.producto.name}" no tiene fotos: un creativo sin el producto no sirve. Cargale fotos primero.` };
  const formato: Formato = esFormato(a.formato) ? a.formato : "4:5";
  const cantidad = Math.max(1, Math.min(6, Number(a.cantidad) || 1));
  const acento = normalizarHex(a.acento);
  const base: DatosCreativo = { ...d.datos, ...(acento ? { acento, sobreAcento: tintaSobre(acento) } : {}) };

  // Ganchos: los del pedido, o de la IA (si se puede), o el de la ficha.
  let ganchos: VarianteDeCopy[] = [];
  let motor = "ficha";
  if (a.gancho) ganchos = [{ gancho: String(a.gancho).slice(0, 80), apoyo: String(a.apoyo || base.apoyo || ""), cta: String(a.cta || base.cta) }];
  else if (a.conIA !== false) {
    const r = await ganchosConIA(tenantId, d, Math.min(3, cantidad), a.pedido || null);
    ganchos = r.variantes; motor = r.motor;
  }
  if (!ganchos.length) ganchos = [{ gancho: base.gancho, apoyo: base.apoyo || "", cta: base.cta }];

  const maquetas = a.maqueta && MAQUETAS.some((m) => m.id === a.maqueta)
    ? [maquetaPorId(a.maqueta)]
    : [...MAQUETAS].sort((x, y) => Number(y.ideal === formato) - Number(x.ideal === formato));

  // Maqueta y gancho rotan a la vez: 3 creativos = 3 diseños con 3 ganchos
  // distintos (lo que sirve para probar en el anuncio). Sin repetidos.
  const combos: { m: (typeof MAQUETAS)[number]; g: VarianteDeCopy }[] = [];
  for (let i = 0; i < cantidad; i++) {
    const m = maquetas[i % maquetas.length]!, g = ganchos[i % ganchos.length]!;
    if (!combos.some((c) => c.m.id === m.id && c.g.gancho === g.gancho)) combos.push({ m, g });
  }

  const salida: ResultadoCreativo[] = [];
  for (const { m, g } of combos) {
    const datos = { ...base, gancho: g.gancho, apoyo: g.apoyo || base.apoyo, cta: g.cta || base.cta };
    const escena = normalizarEscena(m.armar(datos, formato));
    let c = await guardarCreativo(tenantId, { nombre: `${g.gancho.slice(0, 40)} · ${m.nombre}`, productId: a.productId, maqueta: m.id, escena }, "atlas");
    let png: string | null = null;
    if (a.exportar !== false) {
      try {
        const { exportarEscena } = await import("./render");
        png = await exportarEscena(tenantId, escena, c.nombre);
        c = await guardarCreativo(tenantId, { ...c, png });
      } catch { png = null; }
    }
    salida.push({ id: c.id, nombre: c.nombre, maqueta: m.id, formato, gancho: g.gancho, png, avisos: revisarEscena(escena).map((x) => x.texto) });
  }
  return { ok: true, creativos: salida, motor };
}

export async function editarCreativo(tenantId: number, id: string, cambios: {
  gancho?: string | null; apoyo?: string | null; cta?: string | null; acento?: string | null; formato?: string | null; maqueta?: string | null; exportar?: boolean;
}): Promise<{ ok: true; creativo: Creativo; avisos: string[] } | { ok: false; error: string }> {
  const c = await leerCreativo(tenantId, id);
  if (!c) return { ok: false, error: `No encontré el creativo ${id}.` };
  const d = c.productId ? await datosDelProducto(tenantId, c.productId) : null;
  const maquetaId = cambios.maqueta && MAQUETAS.some((m) => m.id === cambios.maqueta) ? cambios.maqueta : c.maqueta;
  const formato: Formato = esFormato(cambios.formato) ? cambios.formato : c.escena.formato;
  const acento = normalizarHex(cambios.acento);
  let escena: Escena;
  if (d && maquetaId) {
    // Con maqueta conocida se vuelve a diagramar (otro largo de texto u otro
    // formato necesitan otra composición), conservando los textos actuales.
    const actuales = datosDesdeEscena(d.datos, c.escena);
    const datos: DatosCreativo = {
      ...actuales,
      ...(cambios.gancho ? { gancho: String(cambios.gancho).slice(0, 80) } : {}),
      ...(cambios.apoyo !== undefined && cambios.apoyo !== null ? { apoyo: String(cambios.apoyo).slice(0, 120) } : {}),
      ...(cambios.cta ? { cta: String(cambios.cta).slice(0, 40) } : {}),
      ...(acento ? { acento, sobreAcento: tintaSobre(acento) } : {}),
    };
    escena = normalizarEscena(maquetaPorId(maquetaId).armar(datos, formato));
  } else {
    // Hecho a mano: solo se cambian los textos por nombre de capa y el formato.
    escena = normalizarEscena({
      ...c.escena,
      formato,
      capas: c.escena.capas.map((x) => x.tipo !== "texto" ? x
        : ["Gancho", "Gancho resaltado"].includes(x.nombre || "") && cambios.gancho ? { ...x, texto: cambios.gancho }
        : x.nombre === "Apoyo" && cambios.apoyo ? { ...x, texto: cambios.apoyo }
        : x.nombre === "Texto del botón" && cambios.cta ? { ...x, texto: cambios.cta } : x),
    });
  }
  let nuevo = await guardarCreativo(tenantId, { ...c, maqueta: maquetaId, escena, png: null });
  if (cambios.exportar !== false) {
    try {
      const { exportarEscena } = await import("./render");
      nuevo = await guardarCreativo(tenantId, { ...nuevo, png: await exportarEscena(tenantId, escena, nuevo.nombre) });
    } catch { /* sin PNG: queda guardado igual */ }
  }
  return { ok: true, creativo: nuevo, avisos: revisarEscena(escena).map((x) => x.texto) };
}
