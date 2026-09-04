/**
 * Precio en la moneda del visitante.
 *
 * Los precios del catálogo están en pesos colombianos. A alguien de México
 * "$60.000" no le dice nada -- o peor, lo lee como 60 mil pesos MEXICANOS y se
 * va sin preguntar. Mismo criterio que ya usa el bot de WhatsApp: se le muestra
 * su moneda local, y el dólar como referencia, que es con lo que paga si es de
 * afuera (PayPal).
 *
 * El país sale de la zona horaria del navegador. No es infalible (una VPN lo
 * cambia), pero no pide permisos, no depende de un servicio externo y acierta
 * en la enorme mayoría. Ante la duda se muestran pesos colombianos, que es la
 * moneda real del catálogo: nunca se inventa una conversión.
 */

const POR_ZONA: Record<string, { pais: string; moneda: string }> = {
  "America/Bogota": { pais: "Colombia", moneda: "COP" },
  "America/Mexico_City": { pais: "México", moneda: "MXN" },
  "America/Tijuana": { pais: "México", moneda: "MXN" },
  "America/Monterrey": { pais: "México", moneda: "MXN" },
  "America/Argentina/Buenos_Aires": { pais: "Argentina", moneda: "ARS" },
  "America/Santiago": { pais: "Chile", moneda: "CLP" },
  "America/Lima": { pais: "Perú", moneda: "PEN" },
  "America/Caracas": { pais: "Venezuela", moneda: "USD" },
  "America/Guayaquil": { pais: "Ecuador", moneda: "USD" },
  "America/La_Paz": { pais: "Bolivia", moneda: "BOB" },
  "America/Asuncion": { pais: "Paraguay", moneda: "PYG" },
  "America/Montevideo": { pais: "Uruguay", moneda: "UYU" },
  "America/Costa_Rica": { pais: "Costa Rica", moneda: "CRC" },
  "America/Panama": { pais: "Panamá", moneda: "USD" },
  "America/El_Salvador": { pais: "El Salvador", moneda: "USD" },
  "America/Guatemala": { pais: "Guatemala", moneda: "GTQ" },
  "America/Tegucigalpa": { pais: "Honduras", moneda: "HNL" },
  "America/Managua": { pais: "Nicaragua", moneda: "NIO" },
  "America/Santo_Domingo": { pais: "República Dominicana", moneda: "DOP" },
  "Europe/Madrid": { pais: "España", moneda: "EUR" },
  "America/New_York": { pais: "Estados Unidos", moneda: "USD" },
  "America/Chicago": { pais: "Estados Unidos", moneda: "USD" },
  "America/Denver": { pais: "Estados Unidos", moneda: "USD" },
  "America/Los_Angeles": { pais: "Estados Unidos", moneda: "USD" },
  "America/Phoenix": { pais: "Estados Unidos", moneda: "USD" },
  "America/Miami": { pais: "Estados Unidos", moneda: "USD" },
};

/** Monedas donde el centavo no se usa en la práctica. */
const SIN_DECIMALES = new Set(["COP", "CLP", "PYG", "ARS", "CRC", "GTQ", "HNL", "NIO"]);

export interface Visitante {
  pais: string;
  moneda: string;
  esColombia: boolean;
}

export function detectarVisitante(): Visitante {
  try {
    const zona = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const hit = POR_ZONA[zona];
    if (hit) return { ...hit, esColombia: hit.moneda === "COP" };
  } catch {
    /* navegador sin Intl: se cae a Colombia */
  }
  return { pais: "", moneda: "COP", esColombia: true };
}

let tasas: Record<string, number> | null = null;
let pidiendo: Promise<Record<string, number> | null> | null = null;

/** Tasas del día con base USD. null si no se pudieron obtener. */
export async function cargarTasas(): Promise<Record<string, number> | null> {
  if (tasas) return tasas;
  if (pidiendo) return pidiendo;
  pidiendo = fetch("https://open.er-api.com/v6/latest/USD")
    .then((r) => r.json())
    .then((j) => {
      tasas = j?.rates?.COP ? j.rates : null;
      return tasas;
    })
    .catch(() => null);
  return pidiendo;
}

function formatear(monto: number, moneda: string): string {
  if (SIN_DECIMALES.has(moneda)) {
    return `${moneda === "COP" ? "" : moneda + " "}$${Math.round(monto).toLocaleString("es-CO")}`;
  }
  return monto >= 20
    ? `${moneda} $${Math.round(monto).toLocaleString("en-US")}`
    : `${moneda} $${monto.toFixed(2)}`;
}

/**
 * El precio como debe verlo ESTE visitante.
 * Colombiano  -> pesos, como siempre.
 * Extranjero  -> su moneda + el dólar entre paréntesis (con lo que va a pagar).
 * Sin tasas   -> pesos colombianos aclarados. Nunca una conversión inventada.
 */
export function precioParaVisitante(
  precioCop: number,
  v: Visitante,
  r: Record<string, number> | null,
): string {
  const cop = Number(precioCop) || 0;
  if (v.esColombia) return `$${Math.round(cop).toLocaleString("es-CO")}`;
  if (!r?.COP) return `$${Math.round(cop).toLocaleString("es-CO")} COP`;

  const usd = cop / r.COP;
  const usdTexto = formatear(usd, "USD");
  const local = v.moneda !== "USD" && r[v.moneda];
  return local ? `${formatear(usd * r[v.moneda]!, v.moneda)} (${usdTexto})` : usdTexto;
}

// ── Hook para las pantallas ─────────────────────────────────────────────
import { useEffect, useState } from "react";

/**
 * Devuelve un formateador de precios ya adaptado al visitante.
 *
 * Las tasas llegan por red, así que al primer render todavía no están: se
 * muestra el precio en pesos y se re-renderiza solo cuando llegan. Nunca se
 * queda en blanco ni muestra un "cargando" en el lugar del precio -- un precio
 * que parpadea vacío hace dudar al comprador.
 */
export function useMoneda() {
  const [visitante] = useState<Visitante>(() => detectarVisitante());
  const [tasasActuales, setTasas] = useState<Record<string, number> | null>(tasas);

  useEffect(() => {
    if (tasasActuales || visitante.esColombia) return; // a un colombiano no le hace falta
    let vivo = true;
    cargarTasas().then((r) => { if (vivo && r) setTasas(r); });
    return () => { vivo = false; };
  }, [tasasActuales, visitante.esColombia]);

  return {
    visitante,
    formatear: (precioCop: number) => precioParaVisitante(precioCop, visitante, tasasActuales),
  };
}
