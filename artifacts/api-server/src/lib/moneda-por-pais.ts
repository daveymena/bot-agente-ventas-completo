/**
 * Precio y medios de pago según el país del cliente.
 *
 * El catálogo está en pesos colombianos, pero los anuncios corren en varios
 * países. A un cliente de México, España o Estados Unidos decirle "$60.000"
 * no le dice nada -- o peor, lo lee como 60 mil de SU moneda y se asusta. Y
 * los medios de pago tampoco sirven igual: Nequi y Daviplata son billeteras
 * colombianas, y el checkout de MercadoPago Colombia le rechaza la tarjeta a
 * un extranjero. Lo único que cobra afuera es PayPal.
 *
 * El país sale del código del número de WhatsApp, que es el dato más
 * confiable que hay en una conversación: el cliente no lo elige para
 * responder una encuesta, es su línea real.
 *
 * SOBRE LA CONVERSIÓN: la tasa NO se inventa ni se cablea en el código. Sale
 * de USD_COP_RATE, que el admin controla. Si no está configurada, NO se
 * muestra un precio en dólares -- se muestra el de pesos y listo. Este
 * proyecto ya se quemó con una conversión inventada: un generador viejo tomó
 * 20.000 PESOS como si fueran 20.000 DÓLARES y sacó anuncios que pedían
 * "$82.000.000 COP". Un precio equivocado en un anuncio pago es peor que no
 * mostrar precio.
 */

/** Códigos de país que usan peso colombiano. */
const COLOMBIA = "57";

/**
 * Prefijos telefónicos por país, del más largo al más corto: hay códigos de
 * 1, 2 y 3 dígitos y "1" (EE.UU./Canadá) es prefijo de muchos otros.
 */
const PREFIJOS: Array<{ codigo: string; pais: string; moneda: string }> = [
  { codigo: "57", pais: "Colombia", moneda: "COP" },
  { codigo: "52", pais: "México", moneda: "USD" },
  { codigo: "54", pais: "Argentina", moneda: "USD" },
  { codigo: "56", pais: "Chile", moneda: "USD" },
  { codigo: "51", pais: "Perú", moneda: "USD" },
  { codigo: "58", pais: "Venezuela", moneda: "USD" },
  { codigo: "593", pais: "Ecuador", moneda: "USD" },
  { codigo: "591", pais: "Bolivia", moneda: "USD" },
  { codigo: "595", pais: "Paraguay", moneda: "USD" },
  { codigo: "598", pais: "Uruguay", moneda: "USD" },
  { codigo: "506", pais: "Costa Rica", moneda: "USD" },
  { codigo: "507", pais: "Panamá", moneda: "USD" },
  { codigo: "503", pais: "El Salvador", moneda: "USD" },
  { codigo: "502", pais: "Guatemala", moneda: "USD" },
  { codigo: "504", pais: "Honduras", moneda: "USD" },
  { codigo: "505", pais: "Nicaragua", moneda: "USD" },
  { codigo: "809", pais: "República Dominicana", moneda: "USD" },
  { codigo: "34", pais: "España", moneda: "USD" },
  { codigo: "1", pais: "Estados Unidos / Canadá", moneda: "USD" },
];

export interface ContextoDeMoneda {
  pais: string;
  esColombia: boolean;
  /** Precio ya formateado para mostrarle a ESTE cliente. */
  precioTexto: string;
  /** true si el cliente puede pagar por MercadoPago / Nequi / Daviplata. */
  aceptaPagosLocales: boolean;
}

/** País del cliente a partir de su número de WhatsApp. */
export function paisDeTelefono(telefono: string | null | undefined): { pais: string; moneda: string } {
  const n = String(telefono || "").replace(/\D/g, "");
  if (!n) return { pais: "", moneda: "COP" };
  // Del prefijo más largo al más corto: "593" (Ecuador) tiene que ganarle a
  // "59" y "1" (EE.UU.) no puede robarse los números que empiezan con 1 de
  // otro código más largo.
  for (const p of [...PREFIJOS].sort((a, b) => b.codigo.length - a.codigo.length)) {
    if (n.startsWith(p.codigo)) return { pais: p.pais, moneda: p.moneda };
  }
  // País desconocido: se asume Colombia, que es el mercado principal y la
  // moneda real del catálogo. Mejor eso que convertir a ciegas.
  return { pais: "", moneda: "COP" };
}

/** Tasa USD→COP configurada por el admin. 0 = no configurada. */
export function tasaUsdCop(): number {
  const t = Number(process.env.USD_COP_RATE || 0);
  return Number.isFinite(t) && t > 0 ? t : 0;
}

/**
 * Cómo mostrarle el precio a este cliente.
 *
 * A un colombiano: pesos, como siempre.
 * A un extranjero: dólares, con el equivalente en pesos entre paréntesis para
 * que no haya sorpresas si termina pagando en la pasarela local. Si no hay
 * tasa configurada, se muestran los pesos y se aclara la moneda -- nunca se
 * inventa un número en dólares.
 */
export function contextoDeMoneda(
  telefono: string | null | undefined,
  precioCop: number,
  monedaDelProducto?: string | null,
): ContextoDeMoneda {
  const { pais, moneda } = paisDeTelefono(telefono);
  const esColombia = moneda === "COP";
  const cop = Number(precioCop) || 0;
  const monedaBase = String(monedaDelProducto || "COP").toUpperCase();

  const enPesos = `$${cop.toLocaleString("es-CO")} COP`;

  // El producto ya está en otra moneda: se respeta tal cual, no se toca.
  if (monedaBase !== "COP") {
    return {
      pais,
      esColombia,
      precioTexto: `$${cop.toLocaleString("es-CO")} ${monedaBase}`,
      aceptaPagosLocales: esColombia,
    };
  }

  if (esColombia) {
    return { pais: pais || "Colombia", esColombia: true, precioTexto: enPesos, aceptaPagosLocales: true };
  }

  const tasa = tasaUsdCop();
  if (!tasa) {
    // Sin tasa NO se inventa un precio en dólares: se dice el de pesos,
    // dejando claro que son pesos colombianos.
    return { pais, esColombia: false, precioTexto: enPesos, aceptaPagosLocales: false };
  }

  const usd = cop / tasa;
  // Redondeo a entero desde 20 USD: "$14.87" se ve a precio de saldo, y por
  // debajo de eso los centavos sí importan.
  const usdTexto = usd >= 20
    ? `USD $${Math.round(usd).toLocaleString("en-US")}`
    : `USD $${usd.toFixed(2)}`;

  return {
    pais,
    esColombia: false,
    precioTexto: `${usdTexto} (${enPesos})`,
    aceptaPagosLocales: false,
  };
}
