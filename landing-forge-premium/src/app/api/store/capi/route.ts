import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/store/capi
 * Envía el evento de conversión a la Conversions API de Meta desde el servidor.
 * El token NUNCA viaja al navegador: se toma de la variable de entorno
 * `META_CAPI_TOKEN` (o `capiToken` si se llama desde el propio panel).
 *
 * Los datos del cliente se envían con hash SHA-256, como exige Meta.
 */

const GRAPH_VERSION = 'v21.0';

function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/** Normaliza el celular colombiano a E.164 sin el "+" antes de hashear. */
function normalizePhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  return digits;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'El JSON no es válido' }, { status: 400 });
  }

  const pixelId = String(body.pixelId ?? process.env.META_PIXEL_ID ?? '').trim();
  const token = String(process.env.META_CAPI_TOKEN ?? body.capiToken ?? '').trim();
  const eventName = String(body.event ?? 'Lead');

  if (!pixelId) return NextResponse.json({ ok: false, error: 'Falta el pixelId' }, { status: 400 });
  if (!token) {
    // Sin token no es un error de la landing: simplemente no se envía.
    return NextResponse.json({ ok: true, sent: false, reason: 'Sin token de Conversions API' });
  }

  const order = (body.order ?? {}) as Record<string, unknown>;
  const customer = (order.customer ?? {}) as Record<string, string>;
  const attribution = (order.attribution ?? {}) as Record<string, string>;

  const nameParts = String(customer.name ?? '').trim().split(/\s+/);
  const userData: Record<string, unknown> = {};
  if (customer.phone) userData.ph = [sha256(normalizePhone(customer.phone))];
  if (nameParts[0]) userData.fn = [sha256(nameParts[0])];
  if (nameParts.length > 1) userData.ln = [sha256(nameParts[nameParts.length - 1])];
  if (customer.city) userData.ct = [sha256(String(customer.city).replace(/\s+/g, ''))];
  userData.country = [sha256('co')];
  if (attribution.fbc) userData.fbc = attribution.fbc;
  else if (attribution.fbclid) userData.fbc = `fb.1.${Date.now()}.${attribution.fbclid}`;
  if (attribution.fbp) userData.fbp = attribution.fbp;
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) userData.client_ip_address = forwardedFor.split(',')[0].trim();
  const ua = req.headers.get('user-agent');
  if (ua) userData.client_user_agent = ua;

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url: attribution.landingUrl ?? undefined,
        referrer_url: attribution.referrer ?? undefined,
        // Mismo event_id que mandó el Pixel en el navegador: así Meta
        // deduplica el evento en vez de contarlo dos veces.
        event_id: String(body.eventId ?? `${order.landingSlug ?? 'lf'}_${order.createdAt ?? Date.now()}`),
        user_data: userData,
        custom_data: {
          currency: order.currency ?? 'COP',
          value: Number(order.total ?? 0),
          content_ids: [String(order.productId ?? '')],
          content_name: order.productName ?? '',
          content_type: 'product',
          num_items: Number(order.quantity ?? 1),
        },
      },
    ],
    ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
  };

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as Record<string, unknown>;
    return NextResponse.json({ ok: res.ok, sent: res.ok, response: json }, { status: res.ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, sent: false, error: err instanceof Error ? err.message : 'Error al enviar a Meta' },
      { status: 502 }
    );
  }
}
