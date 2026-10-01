/**
 * Secciones base: las que usa la plantilla "Producto COD" y reutilizan
 * las demás plantillas.
 */

import type { SectionRenderer } from './shared';
import {
  benefitCard,
  blob,
  checkList,
  ed,
  imageCount,
  primaryCta,
  priceBlock,
  productImage,
  sealsRow,
  section,
  sectionHead,
  shot,
  socialProofLine,
  stars,
  trustSeals,
  waUrl,
  whatsappCta,
} from './shared';
import { cop, discountPercent, esc, humanTitle, longDate } from '../format';
import { icon } from '../icons';
import { DEPARTMENT_NAMES } from '../data/colombia';

/* ------------------------------------------------------------------ */
/* Barra superior                                                      */
/* ------------------------------------------------------------------ */

export const announcementBar: SectionRenderer = (ctx, props) => {
  const text = (props.text as string) || ctx.settings.copy.announcement;
  const variant = (props.variant as string) === 'accent' ? ' lf-topbar--accent' : '';
  return `<div class="lf-topbar${variant}">
      <div class="lf-topbar__inner">
        ${icon(ctx.product.kind === 'digital' ? 'zap' : 'truck', { size: 15 })}
        <span${ed(ctx, "announcement")}>${esc(text)}</span>
      </div>
    </div>`;
};

/* ------------------------------------------------------------------ */
/* Hero de producto                                                    */
/* ------------------------------------------------------------------ */

export const heroProduct: SectionRenderer = (ctx, props) => {
  const { product, settings, theme } = ctx;
  const copyB = settings.copy;
  const title = (props.headline as string) || copyB.headline;
  const sub = (props.subheadline as string) || copyB.subheadline;
  const eyebrow = (props.eyebrow as string) || copyB.heroEyebrow;
  const bullets = Array.isArray(props.bullets) ? (props.bullets as string[]) : copyB.bullets.slice(0, 4);
  const off = discountPercent(settings.offer.price, settings.offer.compareAt);
  const proof = socialProofLine(ctx);
  const n = imageCount(ctx);

  const slides = Array.from({ length: Math.max(1, Math.min(n || 1, 6)) })
    .map(
      (_, i) =>
        `<div class="lf-gallery__slide">${shot(ctx, {
          index: i,
          eager: i === 0,
          autoCrop: i,
          badgeRight: i === 0 && off > 0 ? `-${off}%` : null,
          sizes: '(min-width: 900px) 58vw, 100vw',
        })}</div>`
    )
    .join('');

  const showThumbs = (n || 0) > 1;
  const thumbs = showThumbs
    ? `<div class="lf-gallery__thumbs">${Array.from({ length: Math.min(n, 6) })
        .map(
          (_, i) =>
            `<button type="button" class="lf-thumb" aria-label="Ver foto ${i + 1}" aria-current="${i === 0}">
              <img src="${esc(productImage(ctx, i) ?? '')}" alt="" loading="lazy" decoding="async">
            </button>`
        )
        .join('')}</div>`
    : '';

  const gallery = `<div class="lf-gallery lf-reveal" data-lf-gallery>
      <div class="lf-gallery__track">${slides}</div>
      ${n > 1 ? `<button type="button" class="lf-gallery__nav lf-gallery__nav--prev" aria-label="Foto anterior">${icon('chevron-left', { size: 20 })}</button>
      <button type="button" class="lf-gallery__nav lf-gallery__nav--next" aria-label="Foto siguiente">${icon('chevron-right', { size: 20 })}</button>` : ''}
      ${n > 1 ? `<div class="lf-gallery__dots">${Array.from({ length: Math.min(n, 6) })
        .map((_, i) => `<button type="button" class="lf-gallery__dot" aria-label="Ir a la foto ${i + 1}" aria-current="${i === 0}"></button>`)
        .join('')}</div>` : ''}
      ${thumbs}
    </div>`;

  const content = `<div class="lf-hero__content lf-reveal" data-d="1">
      <p class="lf-eyebrow lf-eyebrow--accent"${ed(ctx, 'heroEyebrow')}>${esc(eyebrow)}</p>
      <h1 class="lf-h1 lf-hero__title"${ed(ctx, 'headline')}>${esc(title)}</h1>
      ${proof ? `<div class="lf-hero__rating">${stars(settings.socialProof.rating ?? 5)}<span>${esc(proof)}</span></div>` : ''}
      <p class="lf-lead"${ed(ctx, 'subheadline')}>${esc(sub)}</p>
      ${bullets.length ? checkList(bullets.slice(0, 4)) : ''}
      <div>${priceBlock(ctx)}</div>
      <div class="lf-btns" data-lf-sticky-anchor>
        ${primaryCta(ctx, { xl: true })}
        ${whatsappCta(ctx)}
      </div>
      ${settings.offer.deadline ? countdownInline(settings.offer.deadline) : ''}
    </div>`;

  const organic = theme.organicShapes ? `${blob(1)}` : '';

  return `<section class="lf-section lf-hero">${organic}<div class="lf-wrap">
      <div class="lf-split">
        <div>${gallery}</div>
        ${content}
      </div>
    </div></section>`;
};

function countdownInline(deadline: string): string {
  return `<div data-lf-countdown-wrap>
      <p class="lf-xs" style="margin-bottom:8px">Esta promoción termina el ${esc(longDate(deadline))}</p>
      <div class="lf-countdown" data-lf-countdown="${esc(deadline)}" style="justify-content:flex-start">
        <span class="lf-cd-unit"><b data-cd="d">00</b><span>días</span></span>
        <span class="lf-cd-unit"><b data-cd="h">00</b><span>horas</span></span>
        <span class="lf-cd-unit"><b data-cd="m">00</b><span>min</span></span>
        <span class="lf-cd-unit"><b data-cd="s">00</b><span>seg</span></span>
      </div>
    </div>`;
}

export const countdownSection: SectionRenderer = (ctx) => {
  const deadline = ctx.settings.offer.deadline;
  if (!deadline) return '';
  return `<section class="lf-section lf-section--tight lf-section--surface" data-lf-countdown-wrap><div class="lf-wrap">
      <div class="lf-head lf-head--center lf-reveal" style="margin-bottom:22px">
        <p class="lf-eyebrow lf-eyebrow--accent">Precio de lanzamiento</p>
        <h2 class="lf-h2">La promoción termina el ${esc(longDate(deadline))}</h2>
      </div>
      <div class="lf-countdown lf-reveal" data-lf-countdown="${esc(deadline)}">
        <span class="lf-cd-unit"><b data-cd="d">00</b><span>días</span></span>
        <span class="lf-cd-unit"><b data-cd="h">00</b><span>horas</span></span>
        <span class="lf-cd-unit"><b data-cd="m">00</b><span>min</span></span>
        <span class="lf-cd-unit"><b data-cd="s">00</b><span>seg</span></span>
      </div>
    </div></section>`;
};

/* ------------------------------------------------------------------ */
/* Marquee de sellos                                                   */
/* ------------------------------------------------------------------ */

export const trustMarquee: SectionRenderer = (ctx, props) => {
  const seals = trustSeals(ctx);
  const variant = (props.variant as string) === 'accent' ? ' lf-marquee--accent' : '';
  const group = `<span class="lf-marquee__group">${seals
    .concat(seals)
    .map((s) => `<span class="lf-marquee__item">${icon(s.icon, { size: 17 })}${esc(s.text)}</span>`)
    .join('')}</span>`;
  return `<div class="lf-marquee${variant}" aria-hidden="true"><div class="lf-marquee__track">${group}${group}</div></div>
    <p class="lf-sr">${seals.map((s) => s.text).join('. ')}.</p>`;
};

/* ------------------------------------------------------------------ */
/* Beneficios en bento grid                                            */
/* ------------------------------------------------------------------ */

export const benefitsBento: SectionRenderer = (ctx, props) => {
  const items = (Array.isArray(props.items) ? (props.items as string[]) : ctx.settings.copy.bullets).slice(0, 6);
  if (!items.length) return '';
  const hasPhoto = imageCount(ctx) > 0;

  const cards = items
    .map((b, i) => benefitCard(b, i, items.length === 5 && i === 0))
    .join('');

  const photoCard = hasPhoto
    ? `<div class="lf-card lf-card--pad0 lf-reveal is-wide" data-d="2">${shot(ctx, {
        index: 1,
        variant: 'lf-shot--wide',
        autoCrop: 2,
        tag: esc(ctx.product.category),
      })}</div>`
    : '';

  return section({
    cls: 'lf-section--surface',
    theme: ctx.theme,
    inner:
      sectionHead({
        eyebrow: ctx.settings.copy.benefitsEyebrow,
        title: (props.title as string) || ctx.settings.copy.benefitsTitle,
        accentEyebrow: true,
        ctx,
        fields: { eyebrow: 'benefitsEyebrow', title: 'benefitsTitle' },
      }) + `<div class="lf-bento">${cards}${photoCard}</div>`,
  });
};

/* ------------------------------------------------------------------ */
/* Problema → solución                                                 */
/* ------------------------------------------------------------------ */

export const problemSolution: SectionRenderer = (ctx, props) => {
  const c = ctx.settings.copy;
  const problemTitle = (props.problemTitle as string) || c.problemTitle;
  const problemText = (props.problemText as string) || c.problemText;
  const solutionTitle = (props.solutionTitle as string) || c.solutionTitle;
  const solutionText = (props.solutionText as string) || c.solutionText;

  return section({
    theme: ctx.theme,
    organic: true,
    inner: `<div class="lf-split lf-split--flip">
      <div class="lf-reveal">${shot(ctx, {
        index: 2,
        variant: 'lf-shot--tall',
        autoCrop: 3,
        sizes: '(min-width: 900px) 42vw, 100vw',
      })}</div>
      <div class="lf-reveal" data-d="1">
        <p class="lf-eyebrow lf-eyebrow--accent"${ed(ctx, 'problemEyebrow')}>${esc(c.problemEyebrow)}</p>
        <h2 class="lf-h2" style="margin-bottom:.5em"${ed(ctx, 'problemTitle')}>${esc(problemTitle)}</h2>
        <p class="lf-lead" style="margin-bottom:1.6em"${ed(ctx, 'problemText')}>${esc(problemText)}</p>
        <hr class="lf-rule" style="margin-bottom:1.6em">
        <h3 class="lf-h3" style="margin-bottom:.5em"${ed(ctx, 'solutionTitle')}>${esc(solutionTitle)}</h3>
        <p${ed(ctx, 'solutionText')}>${esc(solutionText)}</p>
      </div>
    </div>`,
  });
};

/* ------------------------------------------------------------------ */
/* Cómo funciona / cómo se usa                                         */
/* ------------------------------------------------------------------ */

export const howItWorks: SectionRenderer = (ctx, props) => {
  const c = ctx.settings.copy;
  const steps = (Array.isArray(props.steps) ? (props.steps as Array<{ title: string; text: string }>) : c.steps).slice(0, 3);
  if (!steps.length) return '';
  const hasPhoto = imageCount(ctx) > 0;

  const cards = steps
    .map(
      (s, i) => `<article class="lf-reveal" data-d="${i + 1}">
        ${hasPhoto ? shot(ctx, { index: i, variant: 'lf-shot--wide', autoCrop: i + 1, sizes: '(min-width: 900px) 30vw, 100vw' }) : ''}
        <div style="margin-top:18px">
          <span class="lf-num">${String(i + 1).padStart(2, '0')}</span>
          <h3 class="lf-h3" style="margin-bottom:.35em">${esc(s.title)}</h3>
          <p class="lf-lead" style="font-size:.97rem">${esc(s.text)}</p>
        </div>
      </article>`
    )
    .join('');

  return section({
    cls: 'lf-section--surface',
    theme: ctx.theme,
    inner:
      sectionHead({
        eyebrow: c.howEyebrow,
        title: (props.title as string) || c.howTitle,
        center: true,
        accentEyebrow: true,
        ctx,
        fields: { eyebrow: 'howEyebrow', title: 'howTitle' },
      }) +
      `<div style="display:grid;gap:clamp(26px,4vw,34px);grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))">${cards}</div>`,
  });
};

/* ------------------------------------------------------------------ */
/* Selector de paquetes                                                */
/* ------------------------------------------------------------------ */

export const bundlePicker: SectionRenderer = (ctx, props) => {
  const bundles = ctx.settings.offer.bundles;
  if (!bundles.length) return '';
  const c = ctx.settings.copy;

  const cards = bundles
    .map((b, i) => {
      const unit = Math.round(b.price / Math.max(1, b.qty));
      const off = discountPercent(b.price, b.compareAt);
      return `<label class="lf-bundle lf-reveal${b.highlight ? ' is-best' : ''}" data-lf-bundle="${esc(b.id)}" data-d="${i + 1}">
        ${b.badge ? `<span class="lf-bundle__tag">${esc(b.badge)}</span>` : ''}
        <input type="radio" name="lf-bundle" value="${esc(b.id)}"${b.highlight ? ' checked' : ''}>
        <div class="lf-bundle__top">
          <span class="lf-bundle__qty">${esc(b.label)}</span>
          <span class="lf-bundle__radio" aria-hidden="true"></span>
        </div>
        <div class="lf-price-row" style="gap:8px">
          <span class="lf-bundle__price">${esc(cop(b.price))}</span>
          ${b.compareAt && b.compareAt > b.price ? `<s class="lf-price-compare" style="font-size:.95rem">${esc(cop(b.compareAt))}</s>` : ''}
        </div>
        ${off > 0 ? `<span class="lf-pill lf-pill--save" style="margin-top:10px">Ahorras ${esc(cop((b.compareAt ?? 0) - b.price))}</span>` : ''}
        <p class="lf-bundle__unit">${b.qty > 1 ? `${esc(cop(unit))} por unidad` : 'Precio por unidad'}${b.note ? ` · ${esc(b.note)}` : ''}</p>
      </label>`;
    })
    .join('');

  return section({
    theme: ctx.theme,
    inner:
      sectionHead({
        eyebrow: c.bundlesEyebrow,
        title: (props.title as string) || c.bundlesTitle,
        text: (props.subtitle as string) || c.bundlesSubtitle,
        center: true,
        accentEyebrow: true,
        ctx,
        fields: { eyebrow: 'bundlesEyebrow', title: 'bundlesTitle', text: 'bundlesSubtitle' },
      }) +
      `<div class="lf-bundles">${cards}</div>
      <div class="lf-btns" style="justify-content:center;margin-top:30px">${primaryCta(ctx, { xl: true })}</div>`,
  });
};

/* ------------------------------------------------------------------ */
/* Reseñas (SOLO reales, cargadas a mano)                              */
/* ------------------------------------------------------------------ */

export const reviewsSection: SectionRenderer = (ctx, props) => {
  const reviews = ctx.settings.reviews.filter((r) => r.name && r.text);
  // Regla de honestidad: sin reseñas reales, la sección no existe.
  if (!reviews.length) return '';
  const c = ctx.settings.copy;
  const sp = ctx.settings.socialProof;
  const avg = sp.rating ?? reviews.reduce((a, r) => a + r.stars, 0) / reviews.length;

  const header = `<div class="lf-split lf-split--even" style="align-items:end;margin-bottom:clamp(26px,4vw,44px)">
      <div class="lf-reveal">
        <p class="lf-eyebrow lf-eyebrow--accent"${ed(ctx, 'reviewsEyebrow')}>${esc(c.reviewsEyebrow)}</p>
        <h2 class="lf-h2"${ed(ctx, 'reviewsTitle')}>${esc((props.title as string) || c.reviewsTitle)}</h2>
      </div>
      <div class="lf-reveal" data-d="1">
        <div class="lf-rating-big">
          <span class="lf-rating-big__score">${avg.toFixed(1)}</span>
          <div>
            ${stars(avg, 18)}
            <p class="lf-small" style="margin:4px 0 0">${
              sp.ratingCount
                ? `${esc(String(sp.ratingCount))} reseñas verificadas`
                : `${reviews.length} ${reviews.length === 1 ? 'reseña publicada' : 'reseñas publicadas'}`
            }</p>
          </div>
        </div>
      </div>
    </div>`;

  const cards = reviews
    .map((r, i) => {
      const initials = r.name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase())
        .join('');
      return `<article class="lf-card lf-review lf-reveal" data-d="${(i % 3) + 1}">
        <div class="lf-review__stars">${stars(r.stars, 17)}</div>
        <p>${esc(r.text)}</p>
        <div class="lf-review__who">
          <span class="lf-review__avatar">${
            r.photo ? `<img src="${esc(r.photo)}" alt="" loading="lazy" decoding="async">` : esc(initials)
          }</span>
          <span>
            <span class="lf-review__name">${esc(r.name)}</span>
            <span class="lf-xs" style="display:block">${esc(r.city)}${r.verified ? ' · Compra verificada' : ''}${
              r.date ? ` · ${esc(r.date)}` : ''
            }</span>
          </span>
        </div>
      </article>`;
    })
    .join('');

  return section({
    cls: 'lf-section--surface',
    theme: ctx.theme,
    inner: `${header}<div class="lf-reviews">${cards}</div>`,
  });
};

/* ------------------------------------------------------------------ */
/* Garantía                                                            */
/* ------------------------------------------------------------------ */

export const guaranteeSection: SectionRenderer = (ctx, props) => {
  const c = ctx.settings.copy;
  const title = (props.title as string) || c.guaranteeTitle;
  const text = (props.text as string) || c.guaranteeText;

  return section({
    theme: ctx.theme,
    cls: 'lf-section--tight',
    inner: `<div class="lf-card lf-reveal" style="display:grid;gap:clamp(20px,3vw,34px);grid-template-columns:1fr;align-items:center;padding:clamp(24px,4vw,46px)">
      <div style="display:flex;gap:18px;align-items:flex-start">
        <span class="lf-card__icon" style="flex:0 0 auto;width:56px;height:56px;margin:0">${icon('shield', { size: 28 })}</span>
        <div>
          <h2 class="lf-h3" style="margin-bottom:.4em"${ed(ctx, 'guaranteeTitle')}>${esc(title)}</h2>
          <p class="lf-lead" style="font-size:1rem"${ed(ctx, 'guaranteeText')}>${esc(text)}</p>
          ${ctx.settings.returnPolicy ? `<p class="lf-small" style="margin-top:12px">${esc(ctx.settings.returnPolicy)}</p>` : ''}
        </div>
      </div>
    </div>`,
  });
};

/* ------------------------------------------------------------------ */
/* Envío                                                               */
/* ------------------------------------------------------------------ */

export const shippingInfo: SectionRenderer = (ctx, props) => {
  const { offer } = ctx.settings;
  const items = [
    { icon: 'clock', title: offer.shippingEta, text: 'Te escribimos por WhatsApp para confirmar la dirección antes de despachar.' },
    { icon: 'package', title: 'Revisas el producto y pagas al recibir', text: 'Abres el paquete delante del mensajero. Si no es lo que pediste, no pagas.' },
    { icon: 'truck', title: offer.freeShipping ? 'Envío gratis a toda Colombia' : 'Envío a toda Colombia', text: 'Llegamos a las principales ciudades y municipios de los 32 departamentos.' },
  ];
  if (offer.financing.addi || offer.financing.sistecredito) {
    const fin = [offer.financing.addi ? 'Addi' : null, offer.financing.sistecredito ? 'Sistecrédito' : null]
      .filter(Boolean)
      .join(' o ');
    items.push({ icon: 'credit-card', title: `También puedes pagar con ${fin}`, text: 'Lo divides en cuotas al confirmar el pedido por WhatsApp.' });
  }

  return section({
    cls: 'lf-section--surface lf-section--tight',
    theme: ctx.theme,
    inner:
      sectionHead({ eyebrow: 'Logística', title: (props.title as string) || ctx.settings.copy.shippingTitle, accentEyebrow: true, ctx, fields: { title: 'shippingTitle' } }) +
      `<div style="display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))">${items
        .map(
          (it, i) => `<div class="lf-card lf-reveal" data-d="${i + 1}">
            <span class="lf-card__icon">${icon(it.icon, { size: 23 })}</span>
            <h3 class="lf-h4" style="margin-bottom:.4em">${esc(it.title)}</h3>
            <p>${esc(it.text)}</p>
          </div>`
        )
        .join('')}</div>`,
  });
};

/* ------------------------------------------------------------------ */
/* FAQ                                                                 */
/* ------------------------------------------------------------------ */

export const faqSection: SectionRenderer = (ctx, props) => {
  const faq = ctx.settings.faq.filter((f) => f.q && f.a);
  if (!faq.length) return '';
  return section({
    theme: ctx.theme,
    inner: `<div class="lf-split">
      <div class="lf-reveal">
        <p class="lf-eyebrow lf-eyebrow--accent">Dudas</p>
        <h2 class="lf-h2"${ed(ctx, 'faqTitle')}>${esc((props.title as string) || ctx.settings.copy.faqTitle)}</h2>
        <p class="lf-lead" style="margin-top:.8em">¿Te queda alguna otra? Escríbenos por WhatsApp y te respondemos.</p>
        <div class="lf-btns" style="margin-top:20px">${whatsappCta(ctx, 'Preguntar por WhatsApp')}</div>
      </div>
      <div class="lf-acc lf-reveal" data-d="1" data-lf-acc="single">
        ${faq
          .map(
            (f, i) => `<div class="lf-acc__item">
            <button type="button" class="lf-acc__btn" aria-expanded="false" aria-controls="faq-${i}">
              <span>${esc(f.q)}</span>${icon('chevron-down', { size: 20 })}
            </button>
            <div class="lf-acc__panel" id="faq-${i}"><div class="lf-acc__inner">${esc(f.a)}</div></div>
          </div>`
          )
          .join('')}
      </div>
    </div>`,
  });
};

/* ------------------------------------------------------------------ */
/* Formulario de pedido contra entrega                                 */
/* ------------------------------------------------------------------ */

export const orderForm: SectionRenderer = (ctx, props) => {
  const { product, settings } = ctx;
  const c = settings.copy;
  const off = discountPercent(settings.offer.price, settings.offer.compareAt);

  const variantFields = (product.opciones ?? [])
    .map(
      (o, i) => `<div class="lf-field lf-field--full">
        <label class="lf-label" for="lf-var-${i}">${esc(o.name)} <span>*</span></label>
        <select class="lf-select" id="lf-var-${i}" data-lf-variant="${esc(o.name)}" required>
          <option value="">Selecciona ${esc(o.name.toLowerCase())}</option>
          ${o.values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}
        </select>
      </div>`
    )
    .join('');

  const summaryCard = `<aside class="lf-card lf-reveal" data-d="1" style="align-self:start;position:sticky;top:76px">
      <div style="display:flex;gap:14px;align-items:center;margin-bottom:16px">
        <div style="flex:0 0 84px;width:84px">${shot(ctx, { index: 0, variant: 'lf-shot--frame', autoCrop: 0 })}</div>
        <div style="min-width:0">
          <p class="lf-xs" style="margin:0 0 2px">${esc(product.category)}</p>
          <h3 class="lf-h4" style="line-height:1.25">${esc(humanTitle(product.name))}</h3>
        </div>
      </div>
      <div class="lf-summary" style="background:transparent;border:0;padding:0">
        <div class="lf-summary__row"><span>Paquete</span><strong data-lf-pack-label>${esc(settings.offer.bundles[0]?.label ?? '1 unidad')}</strong></div>
        <div class="lf-summary__row"><span>Cantidad</span><strong data-lf-qty>1</strong></div>
        <div class="lf-summary__row"><span>Envío</span><strong>${settings.offer.freeShipping ? 'Gratis' : 'Según ciudad'}</strong></div>
        ${off > 0 ? `<div class="lf-summary__row"><span>Descuento</span><strong style="color:var(--lf-success)">-${off}%</strong></div>` : ''}
        <div class="lf-summary__row lf-summary__row--total"><span>Total</span><strong data-lf-total>${esc(cop(settings.offer.price))}</strong></div>
      </div>
      <p class="lf-xs" style="margin-top:14px">${
        settings.offer.cod
          ? 'No pagas nada ahora. El total se paga en efectivo al mensajero cuando recibas el pedido.'
          : 'El pago se coordina por WhatsApp al confirmar el pedido.'
      }</p>
      <ul class="lf-checks" style="margin-top:16px">
        ${trustSeals(ctx)
          .slice(0, 3)
          .map((s) => `<li class="lf-check" style="font-size:.88rem">${icon('check', { size: 20 })}<span>${esc(s.text)}</span></li>`)
          .join('')}
      </ul>
    </aside>`;

  return `<section id="pedido" class="lf-section lf-section--surface">
    <div class="lf-wrap">
      ${sectionHead({
        eyebrow: c.formEyebrow,
        title: (props.title as string) || c.formTitle,
        text: (props.subtitle as string) || c.formSubtitle,
        center: true,
        accentEyebrow: true,
        ctx,
        fields: { eyebrow: 'formEyebrow', title: 'formTitle', text: 'formSubtitle' },
      })}
      <div class="lf-split" style="align-items:start">
        <div>
          <div data-lf-form-panel>
            <form class="lf-form lf-form--2col lf-card lf-reveal" data-lf-form novalidate style="padding:clamp(20px,3vw,34px)">
              <input type="hidden" name="quantity" value="1">
              <input type="hidden" name="bundleId" value="${esc(settings.offer.bundles[0]?.id ?? '')}">

              <div class="lf-field lf-field--full">
                <label class="lf-label" for="lf-name">Nombre completo <span>*</span></label>
                <input class="lf-input" id="lf-name" name="name" type="text" autocomplete="name" placeholder="Ej: María Rodríguez" required>
                <p class="lf-error" data-error="name"></p>
              </div>

              <div class="lf-field lf-field--full">
                <label class="lf-label" for="lf-phone">Celular (WhatsApp) <span>*</span></label>
                <input class="lf-input" id="lf-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="10" placeholder="3001234567" required>
                <p class="lf-error" data-error="phone"></p>
              </div>

              <div class="lf-field">
                <label class="lf-label" for="lf-dep">Departamento <span>*</span></label>
                <select class="lf-select" id="lf-dep" name="department" autocomplete="address-level1" required>
                  <option value="">Selecciona</option>
                  ${DEPARTMENT_NAMES.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}
                </select>
                <p class="lf-error" data-error="department"></p>
              </div>

              <div class="lf-field">
                <label class="lf-label" for="lf-city">Ciudad <span>*</span></label>
                <select class="lf-select" id="lf-city" name="city" autocomplete="address-level2" required disabled>
                  <option value="">Elige primero el departamento</option>
                </select>
                <p class="lf-error" data-error="city"></p>
              </div>

              <div class="lf-field lf-field--full">
                <label class="lf-label" for="lf-address">Dirección completa <span>*</span></label>
                <input class="lf-input" id="lf-address" name="address" type="text" autocomplete="street-address" placeholder="Calle 45 # 12-30, Apto 302, Torre B" required>
                <p class="lf-error" data-error="address"></p>
              </div>

              <div class="lf-field">
                <label class="lf-label" for="lf-hood">Barrio <span>*</span></label>
                <input class="lf-input" id="lf-hood" name="neighborhood" type="text" placeholder="Ej: Laureles" required>
                <p class="lf-error" data-error="neighborhood"></p>
              </div>

              <div class="lf-field">
                <label class="lf-label" for="lf-notes">Indicaciones (opcional)</label>
                <input class="lf-input" id="lf-notes" name="notes" type="text" placeholder="Portería, punto de referencia…">
              </div>

              ${variantFields}

              <div class="lf-field lf-field--full" style="margin-top:6px">
                ${primaryCta(ctx, {
                  label: settings.offer.cod ? 'CONFIRMAR PEDIDO – PAGO AL RECIBIR' : 'CONFIRMAR PEDIDO',
                  sub: 'Te escribimos por WhatsApp para confirmar',
                  xl: true,
                  submit: true,
                })}
                <p class="lf-xs" style="margin-top:12px;text-align:center">
                  ${icon('lock', { size: 13 })} Tus datos solo se usan para coordinar la entrega.
                </p>
              </div>
            </form>
          </div>

          <div class="lf-card lf-thanks" data-lf-thanks style="padding:clamp(24px,4vw,42px)">
            <span class="lf-thanks__icon">${icon('check-circle', { size: 36 })}</span>
            <h3 class="lf-h2" style="margin-bottom:.4em">¡Pedido recibido!</h3>
            <p class="lf-lead">Te vamos a escribir por WhatsApp para confirmar tu pedido antes de enviarlo.</p>
            <div class="lf-summary" data-lf-thanks-summary style="margin-top:24px;text-align:left"></div>
            <div class="lf-btns" style="justify-content:center;margin-top:24px">
              ${whatsappCta(ctx, 'Abrir WhatsApp ahora', `Hola, acabo de hacer un pedido de ${humanTitle(product.name)}.`)}
            </div>
          </div>
        </div>
        ${summaryCard}
      </div>
    </div>
  </section>`;
};

/* ------------------------------------------------------------------ */
/* Relacionados (order bump)                                           */
/* ------------------------------------------------------------------ */

export const relatedProducts: SectionRenderer = (ctx, props) => {
  const items = ctx.related.filter((r) => r.name).slice(0, 4);
  if (!items.length) return '';
  const slug = ctx.store.slug;

  return section({
    cls: 'lf-section--tight',
    theme: ctx.theme,
    inner:
      sectionHead({
        eyebrow: 'Te puede servir',
        title: (props.title as string) || ctx.settings.copy.relatedTitle,
        accentEyebrow: true,
        ctx,
        fields: { title: 'relatedTitle' },
      }) +
      `<div class="lf-related">${items
        .map((r, i) => {
          const msg = `Hola, quiero pedir ${r.name} por ${cop(r.price)} con pago contra entrega.`;
          return `<a class="lf-card lf-card--pad0 lf-reveal" data-d="${(i % 4) + 1}" href="${esc(
            waUrl(ctx, msg)
          )}" target="_blank" rel="nofollow noopener" data-lf-wa style="padding:0;display:block">
            <div class="lf-shot${i % 2 ? ' lf-shot--alt' : ''}">${
              r.image
                ? `<img src="${esc(r.image)}" alt="${esc(r.name)}" loading="lazy" decoding="async">`
                : ''
            }</div>
            <div style="padding:0 14px 16px">
              <p class="lf-related__name">${esc(r.name)}</p>
              <p class="lf-related__price">${esc(cop(r.price))}</p>
            </div>
          </a>`;
        })
        .join('')}</div>
      <p class="lf-xs" style="margin-top:16px">${
        ctx.product.kind === 'physical'
          ? 'Pídelos junto con tu pedido principal y te llegan en el mismo envío.'
          : 'Escríbenos por WhatsApp y te contamos cómo sumarlos.'
      } Catálogo completo en <a href="https://ventasproia.com/tienda/${esc(
        slug
      )}" target="_blank" rel="noopener" style="text-decoration:underline">la tienda</a>.</p>`,
  });
};

/* ------------------------------------------------------------------ */
/* Cierre + footer                                                     */
/* ------------------------------------------------------------------ */

export const footerSection: SectionRenderer = (ctx) => {
  const { store, settings, product } = ctx;
  const year = new Date().getFullYear();
  return `<section class="lf-section lf-section--tight" style="text-align:center">
      <div class="lf-wrap lf-reveal">
        <h2 class="lf-h2" style="max-width:20ch;margin-inline:auto"${ed(ctx, 'closingTitle')}>${esc(settings.copy.closingTitle)}</h2>
        <p class="lf-lead" style="max-width:52ch;margin:.8em auto 1.8em"${ed(ctx, 'closingText')}>${esc(settings.copy.closingText)}</p>
        <div class="lf-btns" style="justify-content:center">${primaryCta(ctx, { xl: true })}</div>
      </div>
    </section>
    <footer class="lf-footer">
      <div class="lf-wrap">
        <div class="lf-footer__grid">
          <div>
            <p class="lf-footer__brand">${esc(store.name)}</p>
            <p class="lf-small" style="margin-top:8px;max-width:38ch">${esc(settings.legalName)}</p>
            <div style="margin-top:14px">
              <a class="lf-pill" href="${esc(
                waUrl(ctx, `Hola, tengo una pregunta sobre ${humanTitle(product.name)}.`)
              )}" target="_blank" rel="nofollow noopener" data-lf-wa>${icon('whatsapp', { size: 15 })} ${esc(
                formatPhone(settings.whatsappPhone || store.whatsappPhone)
              )}</a>
            </div>
          </div>
          <div>
            <p class="lf-label" style="margin-bottom:12px">${
              product.kind === 'service' ? 'Servicio' : 'Compra'
            }</p>
            <div class="lf-footer__links">
              ${
                product.kind === 'physical'
                  ? `<a href="#pedido" data-lf-scroll="form">Hacer un pedido</a>`
                  : `<a href="${esc(
                      waUrl(
                        ctx,
                        product.kind === 'digital'
                          ? `Hola, quiero el acceso a ${humanTitle(product.name)}.`
                          : `Hola, quiero cotizar ${humanTitle(product.name)}.`
                      )
                    )}" target="_blank" rel="nofollow noopener" data-lf-wa>${
                      product.kind === 'digital' ? 'Pedir acceso' : 'Pedir cotización'
                    }</a>`
              }
              <a href="https://ventasproia.com/tienda/${esc(store.slug)}" target="_blank" rel="noopener">Ver catálogo</a>
              <a href="${esc(
                waUrl(
                  ctx,
                  product.kind === 'physical'
                    ? 'Hola, quiero consultar el estado de mi pedido.'
                    : 'Hola, tengo una duda sobre mi compra.'
                )
              )}" target="_blank" rel="nofollow noopener" data-lf-wa>${
                product.kind === 'physical' ? 'Estado de mi pedido' : 'Soporte por WhatsApp'
              }</a>
            </div>
          </div>
          <div>
            <p class="lf-label" style="margin-bottom:12px">Políticas</p>
            <div class="lf-footer__links">
              <a href="#faq-0">${
                product.kind === 'digital'
                  ? 'Garantía y devoluciones'
                  : product.kind === 'service'
                    ? 'Alcance y ajustes'
                    : 'Garantía y cambios'
              }</a>
              ${
                product.kind === 'physical'
                  ? `<a href="#pedido">Envíos y entregas</a>`
                  : product.kind === 'digital'
                    ? `<a href="#faq-0">Cómo recibes el acceso</a>`
                    : `<a href="#faq-0">Cómo trabajamos</a>`
              }
              <a href="https://ventasproia.com/privacidad" target="_blank" rel="noopener">Tratamiento de datos</a>
            </div>
          </div>
        </div>
        <div class="lf-footer__bottom">
          <span>© ${year} ${esc(store.name)}. Todos los derechos reservados.</span>
          <span>Precios en pesos colombianos (COP).</span>
        </div>
      </div>
    </footer>`;
};

function formatPhone(phone: string): string {
  const d = (phone || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('57')) return `+57 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return `+${d}`;
}

/* ------------------------------------------------------------------ */
/* Barra fija + botón flotante                                         */
/* ------------------------------------------------------------------ */

export const stickyCta: SectionRenderer = (ctx) => {
  const { settings, product } = ctx;
  const label = product.kind === 'physical' ? 'PEDIR' : product.kind === 'digital' ? 'COMPRAR' : 'AGENDAR';
  return `<div class="lf-sticky" data-lf-sticky>
      <div class="lf-sticky__info">
        <p class="lf-sticky__name">${esc(humanTitle(product.name))}</p>
        <p class="lf-sticky__price"><span data-lf-total>${esc(cop(settings.offer.price))}</span>${
          settings.offer.compareAt && settings.offer.compareAt > settings.offer.price
            ? `<s>${esc(cop(settings.offer.compareAt))}</s>`
            : ''
        }</p>
      </div>
      ${primaryCta(ctx, { label, sub: null, shine: false })}
    </div>`;
};

export const whatsappFloat: SectionRenderer = (ctx) => {
  const msg = `Hola, tengo una pregunta sobre ${humanTitle(ctx.product.name)}.`;
  return `<a class="lf-wa-float" href="${esc(waUrl(ctx, msg))}" target="_blank" rel="nofollow noopener"
      aria-label="Escribir por WhatsApp" data-lf-wa>${icon('whatsapp', { size: 29 })}</a>`;
};
