import { NextResponse } from 'next/server';
import { cacheHeaders, getCatalog } from '@/lib/store-api';
import { normalizeCatalog } from '@/premium/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/store/products
 * Proxy del catálogo con caché de 5 min. Devuelve los datos ya normalizados
 * (precios como número, imágenes absolutas) más el payload crudo.
 */
export async function GET() {
  const result = await getCatalog();

  if (!result.ok || !result.data) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'No se pudo cargar el catálogo', source: result.source },
      { status: 502 }
    );
  }

  const normalized = normalizeCatalog(result.data);

  return NextResponse.json(
    {
      ok: true,
      source: result.source,
      warning: result.source === 'seed' ? `La tienda no respondió (${result.error}). Mostrando datos de prueba.` : null,
      store: normalized.store,
      products: normalized.products,
      count: normalized.products.length,
    },
    { headers: cacheHeaders(result.source) }
  );
}
