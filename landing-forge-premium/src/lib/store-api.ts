/**
 * Cliente de servidor para la API pública de la tienda, con caché de 5 min.
 * Se usa desde las rutas `/api/store/*` para evitar CORS en el navegador.
 */

import { SEED_CATALOG, seedProductPayload } from '@/premium/data/seed';

export const STORE_BASE = process.env.STORE_BASE || 'https://ventasproia.com';
export const STORE_SLUG = process.env.STORE_SLUG || 'sofia-premium';

/** 5 minutos. */
export const CACHE_TTL_MS = 5 * 60 * 1000;
export const CACHE_TTL_S = 300;

interface CacheEntry {
  at: number;
  data: unknown;
}

const cache = new Map<string, CacheEntry>();

export function cacheGet(key: string): unknown | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

export function cacheSet(key: string, data: unknown): void {
  cache.set(key, { at: Date.now(), data });
  // Tope simple para no crecer sin control.
  if (cache.size > 300) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

export interface FetchResult<T> {
  ok: boolean;
  data: T | null;
  /** `live` = API, `cache` = caché, `seed` = datos de respaldo. */
  source: 'live' | 'cache' | 'seed';
  error?: string;
}

async function fetchJson<T>(url: string, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'LandingForgePremium/1.0 (+VentasProIA)',
      },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Catálogo completo de la tienda. */
export async function getCatalog(): Promise<FetchResult<unknown>> {
  const key = `catalog:${STORE_SLUG}`;
  const cached = cacheGet(key);
  if (cached) return { ok: true, data: cached, source: 'cache' };

  try {
    const data = await fetchJson<unknown>(`${STORE_BASE}/api/public/products/${STORE_SLUG}`);
    cacheSet(key, data);
    return { ok: true, data, source: 'live' };
  } catch (err) {
    // Respaldo: datos de prueba reales para que el panel siga funcionando.
    return {
      ok: true,
      data: SEED_CATALOG,
      source: 'seed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Ficha de un producto + relacionados. */
export async function getProduct(id: string | number): Promise<FetchResult<unknown>> {
  const key = `product:${STORE_SLUG}:${id}`;
  const cached = cacheGet(key);
  if (cached) return { ok: true, data: cached, source: 'cache' };

  try {
    const data = await fetchJson<unknown>(`${STORE_BASE}/api/public/product/${STORE_SLUG}/${id}`);
    cacheSet(key, data);
    return { ok: true, data, source: 'live' };
  } catch (err) {
    const seed = seedProductPayload(id);
    if (seed) {
      return { ok: true, data: seed, source: 'seed', error: err instanceof Error ? err.message : String(err) };
    }
    return { ok: false, data: null, source: 'seed', error: err instanceof Error ? err.message : String(err) };
  }
}

/** Teléfono de WhatsApp conectado de la tienda. */
export async function getWhatsappInfo(): Promise<FetchResult<unknown>> {
  const key = `wa:${STORE_SLUG}`;
  const cached = cacheGet(key);
  if (cached) return { ok: true, data: cached, source: 'cache' };

  try {
    const data = await fetchJson<unknown>(`${STORE_BASE}/api/public/whatsapp-info/${STORE_SLUG}`);
    cacheSet(key, data);
    return { ok: true, data, source: 'live' };
  } catch (err) {
    return {
      ok: true,
      data: { phone: SEED_CATALOG.store.whatsappPhone, connected: false },
      source: 'seed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Cabeceras de caché para las respuestas del proxy. */
export function cacheHeaders(source: FetchResult<unknown>['source']): Record<string, string> {
  return {
    'Cache-Control':
      source === 'seed'
        ? 'public, max-age=30, stale-while-revalidate=60'
        : `public, max-age=${CACHE_TTL_S}, stale-while-revalidate=600`,
    'X-Data-Source': source,
  };
}
