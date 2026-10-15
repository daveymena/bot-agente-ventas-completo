/**
 * Los datos con los que se arma un creativo, sacados de la BASE.
 *
 * Mismo reparto que el vendedor (ver memoria "reparto modelo / servidor"):
 * el servidor pone lo que tiene que salir exacto —precio, fotos, sellos de
 * entrega, características— y el modelo solo redacta el gancho. Si el modelo
 * no responde, hay gancho igual (el nombre o el `highlight` del producto):
 * el estudio nunca queda en blanco por una IA caída.
 */
import { and, eq } from "drizzle-orm";
import { db, products } from "@workspace/db";
import type { DatosCreativo } from "../estudio/maquetas-creativo";
import type { KitDeMarca } from "../estudio/kit";

export interface VarianteDeCopy { gancho: string; apoyo: string; cta: string; angulo?: string }

export interface DatosDelProducto {
  producto: { id: number; name: string; price: string | null; currency: string | null; kind: string | null };
  datos: DatosCreativo;
  modelo: string;
  /** El kit de marca del negocio (vacío si el dueño no lo definió). */
  kit: KitDeMarca;
  kitDefinido: boolean;
  /** Por qué no se pudo recortar la primera foto (si no se pudo). */
  recorteMotivo?: string | null;
}

const corta = (s: string, max: number) => {
  const limpio = s.replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  const cortado = limpio.slice(0, max);
  return cortado.slice(0, Math.max(cortado.lastIndexOf(" "), max * 0.6)).replace(/[,;:.\-–]+$/, "");
};

/** Beneficios: las características guardadas, o frases de la descripción. */
export function beneficiosDe(p: { features?: unknown; description?: string | null }): string[] {
  const feats = Array.isArray(p.features) ? (p.features as unknown[]).map((f) => String(f || "").trim()).filter(Boolean) : [];
  const base = feats.length ? feats : String(p.description || "").split(/(?<=[.!?])\s+|\n+|•/).map((s) => s.trim()).filter((s) => s.length > 8);
  // Sin viñetas ni emojis al principio: la maqueta pone sus propios ✓.
  return base.map((b) => corta(b.replace(/^[\s\p{Extended_Pictographic}️‍*✓✔•\-\d.)]+/u, ""), 46)).filter((b) => b.length > 4).slice(0, 5);
}

export async function datosDelProducto(tenantId: number, productId: number): Promise<DatosDelProducto | null> {
  const [p] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.tenantId, tenantId))).limit(1);
  if (!p) return null;
  const { fotosDelProducto } = await import("../fotos-de-producto");
  const fotos = fotosDelProducto(p, process.env.APP_URL || "https://ventasproia.com", 8);
  const { colorDelProducto } = await import("../landing/color-del-producto");
  const color = await colorDelProducto({ fotoUrl: fotos[0], categoria: p.category, nombre: p.name, descripcion: p.description, caracteristicas: p.features, tipo: p.kind }).catch(() => null);
  const { modeloDelProducto, sellosDelNegocio, CONDICIONES_DE_RESPALDO } = await import("../modelo-de-negocio");
  const modelo = modeloDelProducto(p as any);
  const ctx = await import("../business-context").then((m) => m.getBusinessContext(tenantId)).catch(() => null);
  const condiciones = ctx?.condiciones ?? CONDICIONES_DE_RESPALDO;
  // Los sellos de entrega solo valen para lo que se despacha: un curso no
  // "se paga al recibir".
  const sellos = modelo === "fisico" ? sellosDelNegocio(condiciones) : [];
  const precioNum = Number(p.price);
  let precio: string | null = null;
  if (Number.isFinite(precioNum) && precioNum > 0) {
    const { formatPrice } = await import("../conversation-engine");
    // Sin el espacio duro que pone Intl ("$ 36.000"): en grande se ve suelto.
    precio = formatPrice(precioNum, p.currency || "COP").replace(/^([^\d\s]+)[\s ]+/, "$1");
  }
  const pagaAlRecibir = sellos.some((s) => /recibir/i.test(s));
  const datos: DatosCreativo = {
    nombre: p.name,
    gancho: corta(String(p.highlight || p.name), 48),
    apoyo: beneficiosDe(p)[0] || null,
    cta: modelo === "fisico" ? (pagaAlRecibir ? "Pídelo y paga al recibir" : "Pídelo hoy") : modelo === "servicio" ? "Agenda ahora" : "Lo quiero",
    precio,
    sellos,
    beneficios: beneficiosDe(p),
    fotos,
    acento: color?.acento || "#4F46E5",
    sobreAcento: color?.sobreAcento || "#ffffff",
    marca: ctx?.businessName || null,
  };
  // El producto "flotando": se intenta quitar el fondo de la primera foto que
  // lo permita (fondo liso). Si ninguna, las maquetas usan la foto completa.
  let recorteMotivo: string | null = null;
  try {
    const { recortesDe, recortarFondo } = await import("./recorte");
    datos.recortes = await recortesDe(fotos, 1);
    if (!Object.keys(datos.recortes).length && fotos[0]) { const r = await recortarFondo(fotos[0]); recorteMotivo = r.ok ? null : r.motivo; }
  } catch { datos.recortes = {}; }
  const { leerKit } = await import("./kit");
  const k = await leerKit(tenantId).catch(() => ({ kit: {}, definido: false }));
  return { producto: { id: p.id, name: p.name, price: p.price, currency: p.currency, kind: p.kind }, datos, modelo, kit: k.kit, kitDefinido: k.definido, recorteMotivo };
}

/**
 * Ganchos con IA, cada uno desde un ángulo distinto. Nada que no esté en la
 * ficha: sin descuentos, sin "más vendido", sin testimonios, sin cifras.
 */
export async function ganchosConIA(tenantId: number, d: DatosDelProducto, cantidad = 4, pedido?: string | null): Promise<{ variantes: VarianteDeCopy[]; motor: "ia" | "respaldo" }> {
  const respaldo = (): VarianteDeCopy[] => {
    const b = d.datos.beneficios || [];
    const lista: VarianteDeCopy[] = [{ gancho: d.datos.gancho, apoyo: b[0] || "", cta: d.datos.cta, angulo: "producto" }];
    for (const ben of b.slice(1, cantidad)) lista.push({ gancho: corta(ben, 42), apoyo: d.datos.nombre, cta: d.datos.cta, angulo: "beneficio" });
    return lista.slice(0, cantidad);
  };
  try {
    const { callMarketingAI } = await import("../marketing-team/ai");
    const r = await callMarketingAI<any>({
      tenantId,
      json: true,
      maxTokens: 900,
      systemPrompt:
        "Sos director creativo de anuncios de Facebook e Instagram para LATAM. Escribís el TEXTO QUE VA SOBRE LA IMAGEN, no el copy del anuncio. " +
        `Devolvé SOLO JSON {"variantes":[{"angulo":"dolor|deseo|curiosidad|prueba|oferta","gancho":"...","apoyo":"...","cta":"..."}]} con ${cantidad} variantes, cada una desde un ángulo distinto. ` +
        "gancho: 3 a 7 palabras, en el idioma del cliente, que frene el scroll. apoyo: una línea de máximo 9 palabras. cta: 2 a 4 palabras. " +
        "PROHIBIDO inventar: descuentos, porcentajes, 'más vendido', cantidades de clientes, testimonios, garantías, tiempos o cifras que no estén en los datos. " +
        "Si los datos dicen 'Paga al recibir', podés usarlo tal cual: significa que paga cuando le llega, NO que lo prueba gratis ni antes de pagar. Sin emojis. Sin comillas.",
      userPrompt: JSON.stringify({
        producto: d.datos.nombre,
        precio: d.datos.precio,
        beneficiosReales: d.datos.beneficios,
        sellosReales: d.datos.sellos,
        tipo: d.modelo,
        pedidoDelDueno: pedido || null,
      }),
    });
    const crudas: any[] = Array.isArray(r?.variantes) ? r.variantes : Array.isArray(r) ? r : [];
    const limpias = crudas
      .map((v) => ({
        gancho: corta(String(v?.gancho || v?.hook || "").replace(/["“”]/g, ""), 56),
        apoyo: corta(String(v?.apoyo || v?.sub || "").replace(/["“”]/g, ""), 70),
        cta: corta(String(v?.cta || d.datos.cta), 28),
        angulo: v?.angulo ? String(v.angulo).slice(0, 20) : undefined,
      }))
      // Lo que trae un número o un % que no está en la ficha, fuera: es
      // exactamente lo que el modelo tiende a inventar ("50% OFF", "+10.000").
      .filter((v) => v.gancho && !inventaCifras(`${v.gancho} ${v.apoyo}`, d));
    if (limpias.length) return { variantes: limpias.slice(0, cantidad), motor: "ia" };
  } catch { /* cae al respaldo */ }
  return { variantes: respaldo(), motor: "respaldo" };
}

/** ¿El texto trae cifras que no salen de los datos reales? */
export function inventaCifras(texto: string, d: Pick<DatosDelProducto, "datos">): boolean {
  if (/%|\bx\s?\d|\d\s?x\b|off\b/i.test(texto)) return true;
  const permitidos = `${d.datos.precio || ""} ${(d.datos.beneficios || []).join(" ")} ${(d.datos.sellos || []).join(" ")} ${d.datos.nombre}`;
  const nums: string[] = texto.match(/\d[\d.,]*/g) ?? [];
  return nums.some((num) => !permitidos.includes(num.replace(/[.,]$/, "")));
}
