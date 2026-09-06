/**
 * ============================================================
 * UN MEDIO DE PAGO POR RENGLÓN
 * ============================================================
 *
 * Esto vivía dentro de `buildProductCaption` y ponía la etiqueta en una línea,
 * el enlace en la siguiente y una línea en blanco entre cada medio. Cuatro
 * medios se convertían en trece renglones. Copiado de una conversación real
 * (2026-09-06):
 *
 *   🔹 *Tarjeta / PSE:*
 *   https://ventasproia.com/p/g3Qk92
 *
 *   🔹 *PayPal (Internacional):*
 *   https://ventasproia.com/p/Ci9Nb9
 *
 *   🔹 *Nequi:*
 *   📱 3136174267
 *   👤 Duvier Mena
 *
 * En el celular eso se lee como un formulario, no como alguien contestando.
 * El admin lo pidió así: "los enlaces deben aparecer integrados dentro de la
 * respuesta, nunca un enlace solo como un mensaje independiente".
 *
 * Está en su propio archivo, y no dentro de la función que arma la ficha,
 * porque es una regla de formato que hay que poder PROBAR. Adentro no se podía
 * (la función es async, privada y necesita un producto entero), así que esta
 * regla nunca tuvo un candado — y por eso se rompió sin que nadie lo notara.
 */

export interface MediosDePago {
  mercadopago?: { url?: string | null; shortUrl?: string | null } | null;
  paypal?: { url?: string | null; shortUrl?: string | null } | null;
  transfer?: {
    options?: Array<{ type?: string | null; number?: string | null; name?: string | null }> | null;
  } | null;
}

/** El corto primero: un checkout crudo de MercadoPago son ~120 caracteres. */
const corto = (m: { url?: string | null; shortUrl?: string | null } | null | undefined): string =>
  String(m?.shortUrl || m?.url || "").trim();

/**
 * Las líneas de medios de pago, una por medio.
 *
 * `aceptaPagosLocales` viene de la moneda del cliente: a alguien de otro país,
 * MercadoPago Colombia le rechaza la tarjeta y Nequi/Daviplata directamente no
 * existen. Mostrárselos es hacerle perder el tiempo.
 *
 * Cada medio lleva SU emoji, no el mismo cuatro veces: el emoji está para que
 * el ojo encuentre de un vistazo el medio que busca, y cuatro rombos iguales no
 * ayudan a nadie.
 */
export function lineasDeMediosDePago(
  medios: MediosDePago | null | undefined,
  opciones: { aceptaPagosLocales: boolean; esColombia: boolean; etiquetaTransferencia?: string },
): string[] {
  if (!medios) return [];
  const out: string[] = [];

  if (opciones.aceptaPagosLocales && corto(medios.mercadopago)) {
    out.push(`💳 Tarjeta / PSE: ${corto(medios.mercadopago)}`);
  }

  if (corto(medios.paypal)) {
    const et = opciones.esColombia ? "PayPal (internacional)" : "Tarjeta o PayPal";
    out.push(`🅿️ ${et}: ${corto(medios.paypal)}`);
  }

  if (opciones.aceptaPagosLocales && medios.transfer?.options?.length) {
    // TODAS las billeteras cargadas, no solo la primera. El negocio puede tener
    // Nequi y Daviplata con el mismo número, y mostrar una sola le esconde al
    // cliente justo la que sí usa. Tope de 3 para que no se vuelva una lista.
    for (const o of medios.transfer.options.slice(0, 3)) {
      const numero = String(o?.number || "").trim();
      if (!numero) continue;
      const etiqueta = String(o?.type || opciones.etiquetaTransferencia || "Transferencia").trim();
      const nombre = String(o?.name || "").trim();
      out.push(`📱 ${etiqueta}: ${numero}${nombre ? ` — ${nombre}` : ""}`);
    }
  }

  return out;
}
