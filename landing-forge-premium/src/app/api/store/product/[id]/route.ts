import { NextResponse } from 'next/server';
import { cacheHeaders, getProduct } from '@/lib/store-api';
import { normalizeProductPayload } from '@/premium/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/store/product/[id]
 * Proxy de la ficha de producto con caché de 5 min.
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  if (!id || !/^[\w-]{1,64}$/.test(id)) {
    return NextResponse.json({ ok: false, error: 'Id de producto inválido' }, { status: 400 });
  }

  const result = await getProduct(id);

  if (!result.ok || !result.data) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'Producto no encontrado', source: result.source },
      { status: 404 }
    );
  }

  const normalized = normalizeProductPayload(result.data);

  return NextResponse.json(
    {
      ok: true,
      source: result.source,
      warning: result.source === 'seed' ? `La tienda no respondió (${result.error}). Mostrando datos de prueba.` : null,
      store: normalized.store,
      product: normalized.product,
      related: normalized.related,
    },
    { headers: cacheHeaders(result.source) }
  );
}

/**
 * POST /api/store/product/[id]
 * Modo de respaldo: pegar el JSON del producto a mano desde el panel.
 * El `id` de la ruta se ignora; manda el JSON tal cual lo devuelve la tienda.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'El JSON no es válido' }, { status: 400 });
  }

  try {
    const payload = body as Record<string, unknown>;
    // Acepta tanto `{ store, product, related }` como un producto suelto.
    const wrapped = payload.product ? payload : { store: {}, product: payload, related: [] };
    const normalized = normalizeProductPayload(wrapped);
    if (!normalized.product.name) {
      return NextResponse.json({ ok: false, error: 'Falta el campo "name" del producto' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, source: 'manual', warning: null, ...normalized });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'No se pudo leer el producto' },
      { status: 400 }
    );
  }
}
