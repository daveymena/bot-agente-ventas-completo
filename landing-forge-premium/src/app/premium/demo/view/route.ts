import { renderLandingDocument } from '@/premium/render';
import { demoDocument, isTemplateId, isThemeId } from '@/lib/demo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /premium/demo/view?template=cod-product&theme=clean-luxe
 * Renderiza una combinación de plantilla × tema con los datos de semilla
 * (productos reales de la tienda) para la matriz 4 × 4 de la demo.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const templateParam = params.get('template');
  const themeParam = params.get('theme');

  const template = isTemplateId(templateParam) ? templateParam : 'cod-product';
  const theme = isThemeId(themeParam) ? themeParam : 'clean-luxe';

  try {
    const html = renderLandingDocument(demoDocument(template, theme), { preview: false });
    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return new Response(
      `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:24px">
       <h1>No se pudo renderizar la demo</h1><pre>${message}</pre></body>`,
      { status: 500, headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
  }
}
