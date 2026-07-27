import { logger } from "./logger";

let cachedRate: number | null = null;
let lastFetch = 0;
const CACHE_TTL_MS = 30 * 60 * 1000;

export async function getExchangeRate(): Promise<number> {
  const now = Date.now();
  if (cachedRate !== null && now - lastFetch < CACHE_TTL_MS) {
    return cachedRate;
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { rates: Record<string, number> };
    const cop = data.rates?.["COP"];
    if (!cop || cop <= 0) throw new Error(`COP rate invalid: ${cop}`);
    cachedRate = cop;
    lastFetch = now;
    logger.info({ copRate: cop }, "[ExchangeRate] Live rate fetched");
    return cop;
  } catch (err) {
    logger.error({ err }, "[ExchangeRate] Failed to fetch live rate");
    if (cachedRate !== null) {
      logger.warn({ cachedRate }, "[ExchangeRate] Using stale cached rate");
      return cachedRate;
    }
    const fallback = Number(process.env.PAYPAL_EXCHANGE_RATE) || 3100;
    logger.warn({ fallback }, "[ExchangeRate] Using env fallback rate");
    return fallback;
  }
}

export function clearCache(): void {
  cachedRate = null;
  lastFetch = 0;
}
