/**
 * Cupones / promociones reales: validación y cálculo de descuento.
 *
 * Pura y determinística: no toca la base ni llama a un modelo, así se puede
 * probar sin red. Recibe un cupón (fila de la tabla `coupons`) y el total de
 * una compra, y devuelve el precio final con el descuento ya aplicado o el
 * motivo por el que no aplica.
 */

export interface CuponParaValidar {
  code?: string | null;
  tipo?: string | null;
  valor?: number | string | null;
  minimoCompra?: number | string | null;
  usosMax?: number | null;
  usos?: number | null;
  activo?: boolean | null;
  vigenciaInicio?: string | Date | null;
  vigenciaFin?: string | Date | null;
  productId?: number | null;
}

export interface ResultadoCupon {
  ok: boolean;
  motivo?: string;
  /** Cuánto se resta al total. */
  descuento: number;
  /** Total - descuento, nunca negativo. */
  precioFinal: number;
}

function numero(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Normaliza el código que escribe el cliente: sin espacios y en mayúsculas. */
export function normalizarCodigo(c: unknown): string {
  return String(c ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Aplica un cupón a un total. Nunca lanza; devuelve un resultado explicable
 * para que el bot o la landing puedan decirle al cliente POR QUÉ no aplicó.
 */
export function aplicarCupon(
  cupon: CuponParaValidar | null | undefined,
  opts: { total: number; productId?: number | null; ahora?: Date },
): ResultadoCupon {
  const total = Math.max(0, numero(opts.total));
  const ahora = opts.ahora ?? new Date();
  const base: ResultadoCupon = { ok: false, descuento: 0, precioFinal: total };

  if (!cupon) return { ...base, motivo: "Ese cupón no existe." };
  if (cupon.activo === false) return { ...base, motivo: "El cupón no está activo." };

  if (cupon.vigenciaInicio) {
    const inicio = new Date(cupon.vigenciaInicio);
    if (!Number.isNaN(inicio.getTime()) && ahora < inicio) return { ...base, motivo: "El cupón todavía no está vigente." };
  }
  if (cupon.vigenciaFin) {
    const fin = new Date(cupon.vigenciaFin);
    if (!Number.isNaN(fin.getTime()) && ahora > fin) return { ...base, motivo: "El cupón venció." };
  }

  const usosMax = numero(cupon.usosMax);
  if (usosMax > 0 && numero(cupon.usos) >= usosMax) return { ...base, motivo: "El cupón ya alcanzó su límite de usos." };

  if (cupon.productId != null && opts.productId != null && numero(cupon.productId) !== numero(opts.productId)) {
    return { ...base, motivo: "El cupón no aplica para este producto." };
  }

  const minimo = numero(cupon.minimoCompra);
  if (minimo > 0 && total < minimo) {
    return { ...base, motivo: `El cupón requiere una compra mínima de $${minimo.toLocaleString("es-CO")}.` };
  }

  const valor = numero(cupon.valor);
  if (valor <= 0) return { ...base, motivo: "El cupón no tiene un descuento configurado." };

  const tipo = String(cupon.tipo || "porcentaje").toLowerCase();
  const descuento = tipo === "fijo" ? Math.min(valor, total) : total * Math.min(valor, 100) / 100;
  const precioFinal = Math.max(0, total - descuento);

  return { ok: true, descuento, precioFinal };
}
