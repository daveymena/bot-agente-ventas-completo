import { NextResponse } from 'next/server';
import { getLanding } from '@/lib/landing-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/store/order
 * Relé de pedidos: recibe el JSON del pedido desde la landing y lo reenvía al
 * webhook configurado. Útil cuando el webhook destino no acepta CORS desde el
 * navegador, y además evita que la URL del webhook quede escrita en el HTML.
 *
 * El destino NUNCA se toma del cuerpo de la petición (sería un SSRF abierto):
 * sale de la landing publicada o de `ORDER_WEBHOOK_URL`.
 */

/** Bloquea destinos internos para que el relé no sirva de puente a la red privada. */
function isSafeTarget(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '[::1]'
  ) {
    return false;
  }
  return true;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'El JSON no es válido' }, { status: 400 });
  }

  const order = (body.order ?? body) as Record<string, unknown>;

  if (!order || typeof order !== 'object' || !('productId' in order)) {
    return NextResponse.json({ ok: false, error: 'Falta el pedido' }, { status: 400 });
  }

  // 1. Webhook guardado en la landing publicada. 2. Variable de entorno.
  let target = '';
  const slug = typeof order.landingSlug === 'string' ? order.landingSlug : '';
  if (slug) {
    const doc = await getLanding(slug);
    if (doc?.settings?.webhookUrl) target = String(doc.settings.webhookUrl).trim();
  }
  if (!target) target = String(process.env.ORDER_WEBHOOK_URL ?? '').trim();

  if (!target) {
    // Sin webhook configurado: confirmamos la recepción igual, el pedido viaja
    // por WhatsApp. Así la landing nunca se rompe por falta de configuración.
    return NextResponse.json({ ok: true, forwarded: false, reason: 'Sin webhook configurado' });
  }

  if (!isSafeTarget(target)) {
    return NextResponse.json(
      { ok: false, forwarded: false, error: 'La URL del webhook no es válida o apunta a una red interna' },
      { status: 400 }
    );
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.ORDER_WEBHOOK_SECRET ? { 'X-Webhook-Secret': process.env.ORDER_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify({
        source: 'landing-forge-premium',
        receivedAt: new Date().toISOString(),
        order,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return NextResponse.json({ ok: true, forwarded: true, status: res.status });
  } catch (err) {
    return NextResponse.json(
      { ok: false, forwarded: false, error: err instanceof Error ? err.message : 'Error al reenviar el pedido' },
      { status: 502 }
    );
  }
}
