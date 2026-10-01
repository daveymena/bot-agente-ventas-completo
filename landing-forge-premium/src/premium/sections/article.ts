/**
 * Secciones de la plantilla "Advertorial / Listicle".
 * Formato de nota periodística para público frío que todavía no sabe que
 * existe una solución.
 */

import type { SectionRenderer } from './shared';
import { ed, imageCount, primaryCta, priceBlock, section, sectionHead, shot, socialProofLine, stars, whatsappCta } from './shared';
import { esc, humanTitle, longDate } from '../format';
import { icon } from '../icons';

export const articleHeader: SectionRenderer = (ctx, props) => {
  const c = ctx.settings.copy;
  const kicker = (props.kicker as string) || c.articleKicker;
  const title = (props.title as string) || c.articleTitle;
  const standfirst = (props.standfirst as string) || c.articleStandfirst;
  const author = (props.author as string) || c.articleAuthor;
  const date = (props.date as string) || new Date().toISOString();

  return `<section class="lf-section lf-section--tight"><div class="lf-wrap">
      <article class="lf-article lf-reveal">
        <span class="lf-article__kicker">${esc(kicker)}</span>
        <h1${ed(ctx, 'articleTitle')}>${esc(title)}</h1>
        <p class="lf-article__standfirst"${ed(ctx, 'articleStandfirst')}>${esc(standfirst)}</p>
        <div class="lf-article__meta">
          <span>Por <b>${esc(author)}</b></span>
          <span>·</span>
          <span>${esc(longDate(date))}</span>
          <span>·</span>
          <span>Lectura de 4 minutos</span>
          <span style="margin-left:auto" class="lf-pill">Contenido comercial</span>
        </div>
      </article>
      ${imageCount(ctx) ? `<div class="lf-article" style="margin-bottom:34px">${shot(ctx, {
        index: 0,
        variant: 'lf-shot--wide',
        eager: true,
        autoCrop: 0,
        tag: `${humanTitle(ctx.product.name)} · ${ctx.product.category}`,
      })}</div>` : ''}
    </div></section>`;
};

export const articleBody: SectionRenderer = (ctx, props) => {
  const c = ctx.settings.copy;
  const paragraphs = (Array.isArray(props.paragraphs) ? (props.paragraphs as string[]) : c.articleBody).filter(Boolean);
  if (!paragraphs.length) return '';
  const pull = (props.pullQuote as string) || c.solutionTitle;
  const half = Math.max(1, Math.ceil(paragraphs.length / 2));

  return `<section class="lf-section" style="padding-top:0"><div class="lf-wrap">
      <article class="lf-article lf-article__body lf-reveal">
        ${paragraphs.slice(0, half).map((p) => `<p>${esc(p)}</p>`).join('')}
        <blockquote class="lf-article__pull">${icon('quote', { size: 22 })} ${esc(pull)}</blockquote>
        ${paragraphs.slice(half).map((p) => `<p>${esc(p)}</p>`).join('')}
      </article>
      ${imageCount(ctx) > 1 ? `<div class="lf-article" style="margin:34px auto">
        <div style="display:grid;gap:12px;grid-template-columns:1fr 1fr">
          ${shot(ctx, { index: 1, autoCrop: 2 })}
          ${shot(ctx, { index: 2, autoCrop: 3 })}
        </div>
        <p class="lf-xs" style="margin-top:10px;text-align:center">Fotos del producto en ${esc(ctx.store.name)}.</p>
      </div>` : ''}
    </div></section>`;
};

export const listicle: SectionRenderer = (ctx, props) => {
  const c = ctx.settings.copy;
  const items = (Array.isArray(props.items) ? (props.items as Array<{ title: string; text: string }>) : c.listicleItems).filter(
    (i) => i && i.title
  );
  if (!items.length) return '';

  return section({
    cls: 'lf-section--surface',
    theme: ctx.theme,
    inner: `<div class="lf-article">
      ${sectionHead({ eyebrow: 'En resumen', title: (props.title as string) || c.listicleTitle, accentEyebrow: true, ctx, fields: { title: 'listicleTitle' } })}
      <div class="lf-listicle">
        ${items
          .map(
            (it, i) => `<article class="lf-listicle__item lf-reveal" data-d="${(i % 5) + 1}">
            <div>
              <h3 class="lf-h3" style="margin-bottom:.35em">${esc(it.title)}</h3>
              <p class="lf-lead" style="font-size:1rem">${esc(it.text)}</p>
            </div>
          </article>`
          )
          .join('')}
      </div>
    </div>`,
  });
};

export const articleOffer: SectionRenderer = (ctx, props) => {
  const { settings, product } = ctx;
  const proof = socialProofLine(ctx);

  return section({
    theme: ctx.theme,
    inner: `<div class="lf-card lf-reveal" style="padding:clamp(22px,4vw,46px)">
      <div class="lf-split">
        <div>${shot(ctx, { index: 0, autoCrop: 0, sizes: '(min-width:900px) 52vw, 100vw' })}</div>
        <div>
          <p class="lf-eyebrow lf-eyebrow--accent">${esc((props.eyebrow as string) || 'Oferta para lectores')}</p>
          <h2 class="lf-h2" style="margin-bottom:.45em">${esc(humanTitle(product.name))}</h2>
          ${proof ? `<div class="lf-hero__rating" style="margin-bottom:14px">${stars(settings.socialProof.rating ?? 5)}<span>${esc(proof)}</span></div>` : ''}
          <div style="margin-bottom:20px">${priceBlock(ctx)}</div>
          <ul class="lf-checks" style="margin-bottom:24px">
            ${settings.copy.bullets
              .slice(0, 4)
              .map((b) => `<li class="lf-check">${icon('check', { size: 22 })}<span>${esc(b)}</span></li>`)
              .join('')}
          </ul>
          <div class="lf-btns" data-lf-sticky-anchor>
            ${primaryCta(ctx, { xl: true })}
            ${whatsappCta(ctx)}
          </div>
        </div>
      </div>
    </div>`,
  });
};
