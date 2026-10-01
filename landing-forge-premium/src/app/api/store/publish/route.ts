import { NextResponse } from 'next/server';
import type { LandingDocument } from '@/premium/types';
import { deleteLanding, isValidSlug, listLandings, saveLanding } from '@/lib/landing-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/store/publish — lista de landings publicadas. */
export async function GET() {
  return NextResponse.json({ ok: true, landings: await listLandings() });
}

/** POST /api/store/publish — guarda el documento en `/l/[slug]`. */
export async function POST(req: Request) {
  let body: { doc?: LandingDocument };
  try {
    body = (await req.json()) as { doc?: LandingDocument };
  } catch {
    return NextResponse.json({ ok: false, error: 'El JSON no es válido' }, { status: 400 });
  }

  const doc = body?.doc;
  if (!doc || !doc.slug || !doc.product || !doc.settings || !Array.isArray(doc.sections)) {
    return NextResponse.json({ ok: false, error: 'Falta el documento de la landing' }, { status: 400 });
  }

  if (!isValidSlug(doc.slug)) {
    return NextResponse.json(
      { ok: false, error: 'El slug solo admite minúsculas, números y guiones (3 a 80 caracteres)' },
      { status: 400 }
    );
  }

  try {
    await saveLanding({ ...doc, updatedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, slug: doc.slug, url: `/l/${doc.slug}` });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'No se pudo guardar la landing' },
      { status: 500 }
    );
  }
}

/** DELETE /api/store/publish?slug=… */
export async function DELETE(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? '';
  const removed = await deleteLanding(slug);
  return NextResponse.json({ ok: removed }, { status: removed ? 200 : 404 });
}
