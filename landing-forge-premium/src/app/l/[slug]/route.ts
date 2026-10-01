import { getLanding } from '@/lib/landing-store';
import { renderLandingDocument } from '@/premium/render';
import { esc } from '@/premium/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /l/[slug]
 * Sirve la landing publicada como documento HTML autocontenido.
 * Si el slug no está en el servidor, devuelve una página puente que busca el
 * borrador en el navegador (localStorage del panel) y lo publica.
 */
export async function GET(req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const doc = await getLanding(slug);

  if (!doc) {
    return new Response(bridgePage(slug), {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  const origin = new URL(req.url).origin;

  const html = renderLandingDocument(doc, {
    preview: false,
    canonicalUrl: `${origin}/l/${doc.slug}`,
  });

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
    },
  });
}

/**
 * Puente: el panel guarda los borradores en localStorage. Si abres la URL
 * pública y la landing aún no está publicada en el servidor, esta página la
 * encuentra en tu navegador y la publica de una vez.
 */
function bridgePage(slug: string): string {
  const safe = esc(slug);
  return `<!doctype html>
<html lang="es-CO">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Landing no publicada · ${safe}</title>
<style>
  :root { color-scheme: dark }
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;
    background:#0B0D12;color:#E7E9EE;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .card{max-width:30rem;width:100%;border:1px solid #242938;background:#12151D;
    border-radius:18px;padding:28px}
  h1{font-size:1.35rem;margin:0 0 10px;letter-spacing:-.02em}
  p{margin:0 0 14px;font-size:.9rem;line-height:1.65;color:#9AA3B2}
  code{background:#0B0D12;border:1px solid #242938;border-radius:6px;padding:2px 6px;font-size:.8rem}
  .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
  a,button{appearance:none;border:1px solid #2E3446;background:#1A1F2B;color:#E7E9EE;
    border-radius:10px;padding:11px 16px;font-size:.85rem;font-weight:600;cursor:pointer;
    text-decoration:none;display:inline-flex;align-items:center;gap:8px}
  button.primary{background:#5B6CFF;border-color:#5B6CFF;color:#fff}
  #msg{margin-top:16px;font-size:.82rem;color:#7DE2B8;min-height:1.2em}
</style>
</head>
<body>
  <div class="card">
    <h1>Esta landing todavía no está publicada</h1>
    <p>No hay ninguna landing guardada en el servidor con el slug <code>${safe}</code>.</p>
    <p id="found" hidden>La encontramos entre tus borradores de este navegador. Publícala para que
      quede disponible en esta URL.</p>
    <div class="row">
      <button class="primary" id="publish" hidden>Publicar ahora</button>
      <a href="/premium">Abrir el generador</a>
      <a href="/premium/demo">Ver la demo</a>
    </div>
    <p id="msg"></p>
  </div>
<script>
(function () {
  var slug = ${JSON.stringify(slug)};
  var doc = null;
  try {
    var raw = localStorage.getItem('lf_drafts_v1');
    var list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].slug === slug) { doc = list[i]; break; }
      }
    }
  } catch (e) { /* localStorage bloqueado */ }

  if (!doc) return;
  var btn = document.getElementById('publish');
  document.getElementById('found').hidden = false;
  btn.hidden = false;
  btn.addEventListener('click', function () {
    btn.disabled = true;
    document.getElementById('msg').textContent = 'Publicando…';
    fetch('/api/store/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc: doc })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'No se pudo publicar');
        document.getElementById('msg').textContent = 'Listo. Recargando…';
        location.reload();
      })
      .catch(function (err) {
        btn.disabled = false;
        document.getElementById('msg').style.color = '#FF8E8E';
        document.getElementById('msg').textContent = err.message;
      });
  });
})();
</script>
</body>
</html>`;
}
