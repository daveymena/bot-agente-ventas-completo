/**
 * renderLanding(product, store, config) -> HTML
 *
 * Devuelve un documento HTML completo y autocontenido:
 *  - CSS y JS embebidos (sin librerías)
 *  - imágenes por URL de la tienda
 *  - Meta Pixel opcional
 * Sirve igual para la vista previa, para `/l/[slug]` y para "Descargar HTML".
 */

import type {
  LandingDocument,
  Product,
  RenderConfig,
  SectionSpec,
  StoreInfo,
} from './types';
import { resolveTheme } from './themes';
import { buildCss } from './runtime/css';
import { buildInlineEditor, buildJs, buildPixelSnippet } from './runtime/js';
import { SECTION_REGISTRY } from './sections/registry';
import type { Ctx } from './sections/shared';
import { colombiaMap } from './data/colombia';
import { cop, esc, humanTitle, jsonForScript, truncate } from './format';

export interface RenderResult {
  html: string;
  /** Datos útiles para el panel. */
  meta: {
    title: string;
    description: string;
    sections: number;
    bytes: number;
  };
}

/* ------------------------------------------------------------------ */

export function renderLanding(product: Product, store: StoreInfo, config: RenderConfig): string {
  return renderLandingFull(product, store, config).html;
}

export function renderLandingFull(
  product: Product,
  store: StoreInfo,
  config: RenderConfig
): RenderResult {
  const theme = resolveTheme(config.theme, config.accent);
  const settings = config.settings;
  const ctx: Ctx = {
    product,
    store,
    related: config.related ?? [],
    theme,
    settings,
    config,
    preview: Boolean(config.preview),
  };

  /* --- Secciones ------------------------------------------------- */
  const visible = (config.sections ?? []).filter((sec) => !sec.hidden);
  const topBar = visible.filter((sec) => sec.type === 'announcement-bar');
  const floats = visible.filter((sec) => sec.type === 'sticky-cta' || sec.type === 'whatsapp-float');
  const body = visible.filter(
    (sec) => sec.type !== 'announcement-bar' && sec.type !== 'sticky-cta' && sec.type !== 'whatsapp-float'
  );

  const renderSection = (sec: SectionSpec): string => {
    const renderer = SECTION_REGISTRY[sec.type];
    if (!renderer) return '';
    try {
      return renderer(ctx, (sec.props ?? {}) as Record<string, unknown>);
    } catch (err) {
      if (config.preview) {
        return `<!-- error en la sección ${sec.type}: ${esc(String(err))} -->`;
      }
      return '';
    }
  };

  const htmlTop = topBar.map(renderSection).join('\n');
  const htmlBody = body.map(renderSection).join('\n');
  const htmlFloats = floats.map(renderSection).join('\n');

  /* --- Cabecera -------------------------------------------------- */
  const title = config.title || `${humanTitle(product.name)} · ${cop(settings.offer.price)}`;
  const description = truncate(
    settings.copy.subheadline || settings.copy.headline || product.description,
    160
  );
  const ogImage = product.images[0] ?? product.image ?? '';
  const canonical = config.canonicalUrl ?? '';

  /* --- Config del runtime ---------------------------------------- */
  /*
   * Endpoints del runtime.
   *  - Servida por esta app  -> usa el relé `/api/store/*` y NUNCA expone la
   *    URL del webhook en el HTML.
   *  - HTML exportado        -> sin relé disponible, el pedido va directo al
   *    webhook (a menos que se indique `apiBase`).
   */
  const apiBase = (config.apiBase ?? '').replace(/\/+$/, '');
  const hasRelay = !config.standalone || Boolean(apiBase);

  const runtimeConfig = {
    slug: config.slug,
    productId: product.id,
    productName: humanTitle(product.name),
    category: product.category,
    price: settings.offer.price,
    currency: settings.offer.currency || 'COP',
    freeShipping: settings.offer.freeShipping,
    whatsapp: (settings.whatsappPhone || store.whatsappPhone || '').replace(/\D/g, ''),
    bundles: settings.offer.bundles,
    cities: needsCities(visible) ? colombiaMap() : {},
    orderEndpoint: hasRelay ? `${apiBase}/api/store/order` : null,
    webhookUrl: hasRelay ? null : settings.webhookUrl,
    capiEndpoint: hasRelay && settings.tracking.pixelId ? `${apiBase}/api/store/capi` : null,
    pixelId: settings.tracking.pixelId,
    conversionEvent: settings.tracking.conversionEvent,
    preview: Boolean(config.preview),
    debug: false,
  };

  /* --- Datos estructurados (sin reseñas inventadas) --------------- */
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: humanTitle(product.name),
    description: truncate(product.description, 300),
    image: product.images.length ? product.images : undefined,
    category: product.category,
    sku: product.sku ?? undefined,
    brand: { '@type': 'Brand', name: store.name },
    offers: {
      '@type': 'Offer',
      price: settings.offer.price,
      priceCurrency: settings.offer.currency || 'COP',
      availability: 'https://schema.org/InStock',
      ...(settings.offer.deadline ? { priceValidUntil: settings.offer.deadline.slice(0, 10) } : {}),
    },
  };
  const realReviews = settings.reviews.filter((r) => r.name && r.text);
  if (realReviews.length) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: (
        settings.socialProof.rating ?? realReviews.reduce((a, r) => a + r.stars, 0) / realReviews.length
      ).toFixed(1),
      reviewCount: settings.socialProof.ratingCount ?? realReviews.length,
    };
    jsonLd.review = realReviews.slice(0, 5).map((r) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: r.name },
      reviewRating: { '@type': 'Rating', ratingValue: r.stars, bestRating: 5 },
      reviewBody: r.text,
    }));
  }

  const pixelId = settings.tracking.pixelId;
  const usePixel = Boolean(pixelId) && !config.preview;

  const html = `<!DOCTYPE html>
<html lang="es-CO">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="${esc(theme.tokens.bg)}">
<meta name="robots" content="${config.preview ? 'noindex, nofollow' : 'index, follow'}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:type" content="product">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:locale" content="es_CO">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${ogImage ? `<link rel="preload" as="image" href="${esc(ogImage)}" fetchpriority="high">` : ''}
<link rel="stylesheet" href="${esc(theme.fonts.href)}">
<style>${buildCss(theme)}</style>
<script type="application/ld+json">${jsonForScript(jsonLd)}</script>
${usePixel ? `<script>${buildPixelSnippet(pixelId as string)}</script>
<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${esc(
        pixelId as string
      )}&ev=PageView&noscript=1"></noscript>` : ''}
</head>
<body>
${htmlTop}
<main>
${htmlBody}
</main>
${htmlFloats}
<script>window.__LF__ = ${jsonForScript(runtimeConfig)};</script>
<script>${buildJs()}</script>
${config.preview ? `<script>${buildInlineEditor()}</script>` : ''}
</body>
</html>`;

  return {
    html,
    meta: {
      title,
      description,
      sections: visible.length,
      bytes: html.length,
    },
  };
}

function needsCities(sections: SectionSpec[]): boolean {
  return sections.some((s) => s.type === 'order-form');
}

/** Atajo: renderiza directamente desde el documento guardado. */
export function renderLandingDocument(
  doc: LandingDocument,
  options: {
    preview?: boolean;
    canonicalUrl?: string | null;
    standalone?: boolean;
    apiBase?: string | null;
  } = {}
): string {
  return renderLanding(doc.product, doc.store, {
    slug: doc.slug,
    title: doc.title,
    template: doc.template,
    theme: doc.theme,
    accent: doc.accent,
    related: doc.related,
    settings: doc.settings,
    sections: doc.sections,
    preview: options.preview,
    canonicalUrl: options.canonicalUrl ?? null,
    standalone: options.standalone,
    apiBase: options.apiBase ?? null,
  });
}

/** Link con UTM listo para pegar en el anuncio. */
export function buildUtmLink(baseUrl: string, utm: { source: string; medium: string; campaign: string; content?: string; term?: string }): string {
  const url = baseUrl.replace(/\?.*$/, '');
  const params = new URLSearchParams();
  if (utm.source) params.set('utm_source', utm.source);
  if (utm.medium) params.set('utm_medium', utm.medium);
  if (utm.campaign) params.set('utm_campaign', utm.campaign);
  if (utm.content) params.set('utm_content', utm.content);
  if (utm.term) params.set('utm_term', utm.term);
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}
