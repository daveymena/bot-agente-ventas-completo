/**
 * Secciones de la plantilla "Servicio WhatsApp".
 * Las fotos salen del catálogo de la tienda (producto elegido + relacionados).
 */

import type { SectionRenderer } from './shared';
import {
  checkList,
  ed,
  imageCount,
  primaryCta,
  priceBlock,
  section,
  sectionHead,
  shot,
  socialProofLine,
  stars,
  waUrl,
  whatsappCta,
} from './shared';
import { cop, esc, humanTitle } from '../format';
import { icon } from '../icons';

export const serviceHero: SectionRenderer = (ctx, props) => {
  const { settings } = ctx;
  const c = settings.copy;
  const proof = socialProofLine(ctx);

  return `<section class="lf-section lf-hero"><div class="lf-wrap">
      <div class="lf-split">
        <div class="lf-hero__content lf-reveal">
          <p class="lf-eyebrow lf-eyebrow--accent"${ed(ctx, 'heroEyebrow')}>${esc((props.eyebrow as string) || c.heroEyebrow)}</p>
          <h1 class="lf-h1 lf-hero__title"${ed(ctx, 'headline')}>${esc((props.headline as string) || c.headline)}</h1>
          ${proof ? `<div class="lf-hero__rating">${stars(settings.socialProof.rating ?? 5)}<span>${esc(proof)}</span></div>` : ''}
          <p class="lf-lead"${ed(ctx, 'subheadline')}>${esc((props.subheadline as string) || c.subheadline)}</p>
          ${checkList(c.bullets.slice(0, 4), 'lf-check--accent')}
          <div>${priceBlock(ctx, { note: 'Precio desde. Te pasamos la cotización exacta por WhatsApp.' })}</div>
          <div class="lf-btns" data-lf-sticky-anchor>
            ${primaryCta(ctx, { xl: true, label: 'AGENDAR POR WHATSAPP' })}
          </div>
        </div>
        <div class="lf-reveal" data-d="1">${
          imageCount(ctx) ? shot(ctx, { index: 0, variant: 'lf-shot--tall', eager: true, autoCrop: 0 }) : ''
        }</div>
      </div>
    </div></section>`;
};

export const serviceProcess: SectionRenderer = (ctx, props) => {
  const c = ctx.settings.copy;
  const steps = (Array.isArray(props.steps) ? (props.steps as Array<{ title: string; text: string }>) : c.steps).slice(0, 4);
  if (!steps.length) return '';

  return section({
    cls: 'lf-section--surface',
    theme: ctx.theme,
    inner:
      sectionHead({ eyebrow: c.howEyebrow, title: (props.title as string) || c.howTitle, center: true, accentEyebrow: true }) +
      `<div style="display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))">
        ${steps
          .map(
            (s, i) => `<article class="lf-card lf-reveal" data-d="${i + 1}">
            <span class="lf-num lf-num--solid">${String(i + 1).padStart(2, '0')}</span>
            <h3 class="lf-h4" style="margin-bottom:.4em">${esc(s.title)}</h3>
            <p>${esc(s.text)}</p>
          </article>`
          )
          .join('')}
      </div>`,
  });
};

export const serviceIncludes: SectionRenderer = (ctx, props) => {
  const c = ctx.settings.copy;
  const items = (Array.isArray(props.items) ? (props.items as string[]) : c.serviceIncludes).filter(Boolean);
  if (!items.length) return '';

  return section({
    theme: ctx.theme,
    inner: `<div class="lf-split lf-split--flip">
      <div class="lf-reveal">${imageCount(ctx) ? shot(ctx, { index: 1, autoCrop: 2 }) : ''}</div>
      <div class="lf-reveal" data-d="1">
        <p class="lf-eyebrow lf-eyebrow--accent">Alcance</p>
        <h2 class="lf-h2" style="margin-bottom:.7em">${esc((props.title as string) || 'Qué incluye el servicio')}</h2>
        ${checkList(items)}
        <div class="lf-btns" style="margin-top:26px">${whatsappCta(
          ctx,
          'Pedir cotización',
          `Hola, quiero cotizar ${humanTitle(ctx.product.name)}.`
        )}</div>
      </div>
    </div>`,
  });
};

export const servicePortfolio: SectionRenderer = (ctx, props) => {
  const own = imageCount(ctx);
  const items = ctx.related.filter((r) => r.image).slice(0, 4);
  if (own < 2 && !items.length) return '';

  // Primero las fotos propias del servicio. Nunca llamamos "caso de éxito" a
  // una foto del catálogo: se muestra con el nombre real que tiene en la tienda.
  const useOwn = own >= 2;

  const cards = useOwn
    ? Array.from({ length: Math.min(4, own) })
        .map(
          (_, i) => `<figure class="lf-card lf-card--pad0 lf-reveal" data-d="${i + 1}" style="margin:0">
          ${shot(ctx, { index: i, autoCrop: i })}
        </figure>`
        )
        .join('')
    : items
        .map(
          (r, i) => `<figure class="lf-card lf-card--pad0 lf-reveal" data-d="${(i % 4) + 1}" style="margin:0">
          <div class="lf-shot${i % 2 ? ' lf-shot--alt' : ''}"><img src="${esc(r.image ?? '')}" alt="${esc(
            r.name
          )}" loading="lazy" decoding="async"></div>
          <figcaption style="padding:14px 16px">
            <p class="lf-related__name" style="margin-top:0">${esc(r.name)}</p>
            <p class="lf-xs" style="margin:4px 0 0">${esc(r.category ?? '')}</p>
          </figcaption>
        </figure>`
        )
        .join('');

  return section({
    cls: 'lf-section--surface',
    theme: ctx.theme,
    inner:
      sectionHead({
        eyebrow: 'Galería',
        title: (props.title as string) || (useOwn ? 'Así se ve el trabajo' : 'Lo que manejamos'),
        text: useOwn
          ? 'Imágenes del servicio tal como lo entregamos.'
          : 'Productos y referencias del catálogo con los que trabajamos a diario.',
        accentEyebrow: true,
      }) + `<div class="lf-related">${cards}</div>`,
  });
};

export const servicePlans: SectionRenderer = (ctx, props) => {
  const bundles = ctx.settings.offer.bundles;
  if (!bundles.length) return '';

  return section({
    theme: ctx.theme,
    inner:
      sectionHead({
        eyebrow: 'Planes',
        title: (props.title as string) || 'Elige el plan que te sirve',
        text: 'Todos los planes se confirman por WhatsApp antes de empezar. Sin cobros automáticos.',
        center: true,
        accentEyebrow: true,
      }) +
      `<div class="lf-bundles">
        ${bundles
          .map((b, i) => {
            const msg = `Hola, quiero el plan "${b.label}" de ${humanTitle(ctx.product.name)} por ${cop(b.price)}.`;
            return `<a class="lf-bundle lf-reveal${b.highlight ? ' is-best' : ''}" data-d="${i + 1}" href="${esc(
              waUrl(ctx, msg)
            )}" target="_blank" rel="nofollow noopener" data-lf-wa>
            ${b.badge ? `<span class="lf-bundle__tag">${esc(b.badge)}</span>` : ''}
            <div class="lf-bundle__top"><span class="lf-bundle__qty">${esc(b.label)}</span>${icon('arrow-right', {
              size: 20,
            })}</div>
            <div class="lf-price-row" style="gap:8px">
              <span class="lf-bundle__price">${esc(cop(b.price))}</span>
              ${b.compareAt && b.compareAt > b.price ? `<s class="lf-price-compare" style="font-size:.95rem">${esc(cop(b.compareAt))}</s>` : ''}
            </div>
            <p class="lf-bundle__unit">${esc(b.note ?? 'Cotización exacta por WhatsApp')}</p>
          </a>`;
          })
          .join('')}
      </div>`,
  });
};
