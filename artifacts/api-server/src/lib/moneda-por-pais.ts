/**
 * Precio y medios de pago según el país del cliente.
 *
 * El catálogo está en pesos colombianos, pero los anuncios corren en varios
 * países. A un cliente de México "$60.000" no le dice nada -- o peor, lo lee
 * como 60 mil pesos MEXICANOS y se asusta. Y los medios de pago tampoco
 * sirven igual: Nequi y Daviplata son billeteras colombianas, y el checkout
 * de MercadoPago Colombia le rechaza la tarjeta a un extranjero. Afuera cobra
 * PayPal.
 *
 * El país sale del código del número de WhatsApp, que es el dato más confiable
 * de una conversación: el cliente no lo eligió para responder una encuesta,
 * es su línea real.
 *
 * SOBRE LA CONVERSIÓN. La tasa se trae del día, de una API pública sin clave,
 * y se cachea unas horas. NUNCA se inventa ni se cablea un número: este
 * proyecto ya se quemó con una conversión inventada -- un generador viejo tomó
 * 20.000 PESOS como si fueran 20.000 DÓLARES y sacó anuncios pidiendo
 * "$82.000.000 COP". Si la tasa no se puede obtener, se muestra el precio en
 * pesos aclarando la moneda; jamás una cifra convertida a ojo.
 */

import { logger } from "./logger";

/** Prefijo telefónico → país y su moneda local. */
const PREFIJOS: Array<{ codigo: string; pais: string; moneda: string }> = [
  { codigo: "57", pais: "Colombia", moneda: "COP" },
  { codigo: "52", pais: "México", moneda: "MXN" },
  { codigo: "54", pais: "Argentina", moneda: "ARS" },
  { codigo: "56", pais: "Chile", moneda: "CLP" },
  { codigo: "51", pais: "Perú", moneda: "PEN" },
  { codigo: "58", pais: "Venezuela", moneda: "USD" },   // de hecho se opera en dólares
  { codigo: "593", pais: "Ecuador", moneda: "USD" },    // moneda oficial: dólar
  { codigo: "591", pais: "Bolivia", moneda: "BOB" },
  { codigo: "595", pais: "Paraguay", moneda: "PYG" },
  { codigo: "598", pais: "Uruguay", moneda: "UYU" },
  { codigo: "506", pais: "Costa Rica", moneda: "CRC" },
  { codigo: "507", pais: "Panamá", moneda: "USD" },     // moneda oficial: dólar
  { codigo: "503", pais: "El Salvador", moneda: "USD" }, // moneda oficial: dólar
  { codigo: "502", pais: "Guatemala", moneda: "GTQ" },
  { codigo: "504", pais: "Honduras", moneda: "HNL" },
  { codigo: "505", pais: "Nicaragua", moneda: "NIO" },
  { codigo: "809", pais: "República Dominicana", moneda: "DOP" },
  { codigo: "829", pais: "República Dominicana", moneda: "DOP" },
  { codigo: "849", pais: "República Dominicana", moneda: "DOP" },
  { codigo: "34", pais: "España", moneda: "EUR" },
  { codigo: "1", pais: "Estados Unidos", moneda: "USD" },
];

/** Monedas que no se muestran con decimales: el centavo no existe en la práctica. */
const SIN_DECIMALES = new Set(["COP", "CLP", "PYG", "ARS", "CRC"]);

// ─── Tasas del día ──────────────────────────────────────────────────────────
// Se cachean en memoria: cotizar en CADA mensaje sería lento y abusivo con un
// servicio gratuito, y la tasa no se mueve tanto en unas horas.
let tasasCache: { valores: Record<string, number>; obtenidas: number } | null = null;
const VIGENCIA_MS = 6 * 60 * 60 * 1000; // 6 horas

const API_TASAS = process.env.EXCHANGE_RATES_URL || "https://open.er-api.com/v6/latest/USD";

/**
 * Tasas con base USD ("1 USD = X de esa moneda"). Devuelve null si no se
 * pudieron obtener -- quien llama NO debe convertir a ojo en ese caso.
 */
export async function tasasDelDia(): Promise<Record<string, number> | null> {
  if (tasasCache && Date.now() - tasasCache.obtenidas < VIGENCIA_MS) return tasasCache.valores;
  try {
    const r = await fetch(API_TASAS, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j: any = await r.json();
    const valores = j?.rates || j?.conversion_rates;
    if (!valores?.COP) throw new Error("la respuesta no trae COP");
    tasasCache = { valores, obtenidas: Date.now() };
    logger.info({ cop: valores.COP }, "[Moneda] Tasas del día actualizadas");
    return valores;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[Moneda] No se pudo traer la tasa del día");
    // Cache vencido pero existente: mejor una tasa de hace unas horas que
    // ninguna. Una tasa vieja se desvía centavos; no convertir pierde la venta.
    if (tasasCache) return tasasCache.valores;
    // Último recurso: la tasa fija que haya configurado el admin.
    const manual = Number(process.env.USD_COP_RATE || 0);
    return manual > 0 ? { COP: manual, USD: 1 } : null;
  }
}

export interface ContextoDeMoneda {
  pais: string;
  esColombia: boolean;
  /** Precio ya formateado para ESTE cliente. */
  precioTexto: string;
  /** true si puede pagar por MercadoPago / Nequi / Daviplata. */
  aceptaPagosLocales: boolean;
}

export function paisDeTelefono(telefono: string | null | undefined): { pais: string; moneda: string } {
  const n = String(telefono || "").replace(/\D/g, "");
  if (!n) return { pais: "", moneda: "COP" };
  // Del prefijo más largo al más corto: "593" (Ecuador) tiene que ganarle a
  // "59", y "1" (EE.UU.) no puede robarse los códigos más largos.
  for (const p of [...PREFIJOS].sort((a, b) => b.codigo.length - a.codigo.length)) {
    if (n.startsWith(p.codigo)) return { pais: p.pais, moneda: p.moneda };
  }
  // País desconocido: se asume Colombia, que es el mercado principal y la
  // moneda real del catálogo. Mejor eso que convertir a ciegas.
  return { pais: "", moneda: "COP" };
}

function formatearMonto(monto: number, moneda: string): string {
  if (SIN_DECIMALES.has(moneda)) return `${moneda} $${Math.round(monto).toLocaleString("es-CO")}`;
  // Desde 20 se redondea: "$14.87" se ve a precio de saldo; por debajo los
  // centavos sí importan.
  return monto >= 20
    ? `${moneda} $${Math.round(monto).toLocaleString("en-US")}`
    : `${moneda} $${monto.toFixed(2)}`;
}

/**
 * Cómo mostrarle el precio a este cliente.
 *
 * Colombiano  → pesos, como siempre.
 * Extranjero  → su moneda local + el equivalente en dólares, que es la
 *               referencia que todos entienden y con la que va a pagar en
 *               PayPal. Sin tasa disponible, pesos colombianos aclarados.
 */
export async function contextoDeMoneda(
  telefono: string | null | undefined,
  precioCop: number,
  monedaDelProducto?: string | null,
): Promise<ContextoDeMoneda> {
  const { pais, moneda } = paisDeTelefono(telefono);
  const esColombia = moneda === "COP";
  const cop = Number(precioCop) || 0;
  const monedaBase = String(monedaDelProducto || "COP").toUpperCase();
  const enPesos = `$${cop.toLocaleString("es-CO")} COP`;

  // El producto ya está en otra moneda: se respeta tal cual, no se toca.
  if (monedaBase !== "COP") {
    return { pais, esColombia, precioTexto: `$${cop.toLocaleString("es-CO")} ${monedaBase}`, aceptaPagosLocales: esColombia };
  }
  if (esColombia) {
    return { pais: pais || "Colombia", esColombia: true, precioTexto: enPesos, aceptaPagosLocales: true };
  }

  const tasas = await tasasDelDia();
  if (!tasas?.COP) {
    return { pais, esColombia: false, precioTexto: enPesos, aceptaPagosLocales: false };
  }

  const usd = cop / tasas.COP;
  const usdTexto = formatearMonto(usd, "USD");

  // Su moneda local primero (es la que entiende sin hacer cuentas), el dólar
  // entre paréntesis como referencia y porque es con lo que paga en PayPal.
  const tasaLocal = tasas[moneda];
  const precioTexto = moneda !== "USD" && tasaLocal
    ? `${formatearMonto(usd * tasaLocal, moneda)} (${usdTexto})`
    : usdTexto;

  return { pais, esColombia: false, precioTexto, aceptaPagosLocales: false };
}
