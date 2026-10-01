import { NextResponse } from 'next/server';
import { cacheHeaders, getWhatsappInfo } from '@/lib/store-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/store/whatsapp — teléfono conectado de la tienda. */
export async function GET() {
  const result = await getWhatsappInfo();
  const data = (result.data ?? {}) as { phone?: string; connected?: boolean };

  return NextResponse.json(
    {
      ok: true,
      source: result.source,
      phone: String(data.phone ?? '').replace(/\D/g, ''),
      connected: Boolean(data.connected),
    },
    { headers: cacheHeaders(result.source) }
  );
}
