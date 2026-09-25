/**
 * ¿Este producto físico aguanta publicidad? Se mira ANTES de crear el
 * anuncio (25-09-2026, pedido del dueño: "digitales y dropshipping").
 *
 * La ganancia por pedido (precio − costo del proveedor − flete con recaudo)
 * la calcula `margenDeProductoDropi` con los datos reales de Dropi. Esa
 * ganancia es lo MÁXIMO que puede costar cada venta en anuncios sin perder
 * plata -- sin contar devoluciones, que la bajan todavía más.
 */
export interface LecturaDeMargen {
  /** true = no se crea el anuncio: cada venta pierde plata antes de pagar Meta. */
  bloquea: boolean;
  texto: string;
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

export function lecturaDeMargen(ganancia: number | null | undefined, presupuestoDiario: number): LecturaDeMargen {
  if (ganancia == null || !Number.isFinite(ganancia)) {
    return {
      bloquea: false,
      texto: "⚠️ No pude calcular la ganancia por pedido (falta el costo o el flete): no sé cuánto puede costar cada venta en anuncios.",
    };
  }
  if (ganancia <= 0) {
    return {
      bloquea: true,
      texto:
        `❌ Este producto deja ${pesos(ganancia)} por pedido ANTES de pagar anuncios: cada venta pierde plata. ` +
        `No creé el anuncio. Subí el precio de venta o elegí otro producto (dropi_margen con "precio" simula otro precio).`,
    };
  }
  const ventasPorDia = Math.max(1, Math.ceil(presupuestoDiario / ganancia));
  return {
    bloquea: false,
    texto:
      `📊 Ganancia por pedido entregado: ${pesos(ganancia)}. Cada venta puede costar como máximo ${pesos(ganancia)} en anuncios ` +
      `(sin contar devoluciones). Con ${pesos(presupuestoDiario)}/día necesitás al menos ${ventasPorDia} venta(s) entregada(s) por día para no perder.`,
  };
}
