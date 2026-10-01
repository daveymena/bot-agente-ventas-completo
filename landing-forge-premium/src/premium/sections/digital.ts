/**
 * Secciones de la plantilla "Curso / Infoproducto" (kind = "digital").
 * Nunca muestran "pago contra entrega".
 */

import type { SectionRenderer } from './shared';
import {
  checkList,
  ed,
  imageCount,
  primaryCta,
  priceBlock,
  productImage,
  section,
  sectionHead,
  socialProofLine,
  stars,
  trustSeals,
  whatsappCta,
} from './shared';
import { cop, esc, humanTitle } from '../format';
import { icon } from '../icons';

/* ------------------------------------------------------------------ */
/* Mockup del curso con marcos CSS                                     */
/* ------------------------------------------------------------------ */

function laptopMockup(src: string | null, alt: string, withPhone = true): string {
  if (!src) return '';
  return `<div class="lf-device lf-laptop lf-device-duo" style="position:relative">
      <div>
        <div class="lf-laptop__screen"><img src="${esc(src)}" alt="${esc(alt)}" loading="eager" fetchpriority="high"></div>
        <div class="lf-laptop__base"></div>
      </div>
      ${withPhone
      ? `<div class="lf-device lf-phone">
        <div class="lf-phone__body">
          <span class="lf-phone__notch"></span>
          <img src="${esc(src)}" alt="" loading="lazy" decoding="async">
        </div>
      </div>`
      : ''}
    </div>`;
}

function phoneMockup(src: string | null, alt: string): string {
  if (!src) return '';
  return `<div class="lf-device lf-phone">
      <div class="lf-phone__body">
        <span class="lf-phone__notch"></span>
        <img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

export const digitalHero: SectionRenderer = (ctx, props) => {
  const { product, settings } = ctx;
  const c = settings.copy;
  const proof = socialProofLine(ctx);
  const src = productImage(ctx, 0);

  return `<section class="lf-section lf-hero"><div class="lf-wrap">
      <div class="lf-split lf-split--flip">
        <div class="lf-reveal" data-d="1" style="display:grid;place-items:center">
          ${imageCount(ctx) ? laptopMockup(src, humanTitle(product.name)) : ''}
        </div>
        <div class="lf-hero__content lf-reveal">
          <p class="lf-eyebrow lf-eyebrow--accent"${ed(ctx, 'heroEyebrow')}>${esc((props.eyebrow as string) || c.heroEyebrow)}</p>
          <h1 class="lf-h1 lf-hero__title"${ed(ctx, 'headline')}>${esc((props.headline as string) || c.headline)}</h1>
          ${proof ? `<div class="lf-hero__rating">${stars(settings.socialProof.rating ?? 5)}<span>${esc(proof)}</span></div>` : ''}
          <p class="lf-lead"${ed(ctx, 'subheadline')}>${esc((props.subheadline as string) || c.subheadline)}</p>
          ${checkList(c.bullets.slice(0, 4), 'lf-check--accent')}
          <div>${priceBlock(ctx)}</div>
          <div class="lf-btns" data-lf-sticky-anchor>
            ${primaryCta(ctx, { xl: true })}
            ${whatsappCta(ctx)}
          </div>
          <p class="lf-xs">${icon('lock', { size: 13 })} Pago seguro. Si no es para ti, te devolvemos el dinero en los primeros ${
            settings.offer.guaranteeDays
          } días.</p>
        </div>
      </div>
    </div></section>`;
};

/* ------------------------------------------------------------------ */
/* Acceso inmediato                                                    */
/* ------------------------------------------------------------------ */

export const digitalAccess: SectionRenderer = (ctx) => {
  const seals = trustSeals(ctx);
  return `<section class="lf-section lf-section--tight lf-section--surface"><div class="lf-wrap">
      <div class="lf-split lf-split--even" style="align-items:center">
        <div class="lf-reveal">
          <p class="lf-eyebrow lf-eyebrow--accent">Sin esperas</p>
          <h2 class="lf-h2" style="margin-bottom:.5em">Acceso inmediato después del pago</h2>
          <p class="lf-lead">Apenas confirmamos el pago te llega el enlace al correo y al WhatsApp. En la mayoría de los casos, en menos de 10 minutos. No hay envío ni fecha de entrega que esperar.</p>
          <div class="lf-btns" style="margin-top:22px">${primaryCta(ctx, { xl: true })}</div>
        </div>
        <ul class="lf-seals lf-reveal" data-d="1" style="grid-template-columns:1fr">
          ${seals.map((s) => `<li class="lf-seal">${icon(s.icon, { size: 20 })}<span>${esc(s.text)}</span></li>`).join('')}
        </ul>
      </div>
    </div></section>`;
};

/* ------------------------------------------------------------------ */
/* Para quién es / para quién no                                       */
/* ------------------------------------------------------------------ */

export const digitalAudience: SectionRenderer = (ctx, props) => {
  const c = ctx.settings.copy;
  const forWho = (Array.isArray(props.forWho) ? (props.forWho as string[]) : c.forWho).filter(Boolean);
  const notForWho = (Array.isArray(props.notForWho) ? (props.notForWho as string[]) : c.notForWho).filter(Boolean);
  if (!forWho.length && !notForWho.length) return '';

  return section({
    theme: ctx.theme,
    inner:
      sectionHead({ eyebrow: 'Antes de comprar', title: 'Mira si este curso es para ti', center: true, accentEyebrow: true }) +
      `<div class="lf-split lf-split--even" style="align-items:start">
        <div class="lf-card lf-reveal">
          <span class="lf-card__icon" style="background:color-mix(in srgb,var(--lf-success) 15%,transparent);color:var(--lf-success)">${icon('thumbs-up', { size: 23 })}</span>
          <h3 class="lf-h3" style="margin-bottom:.7em">Es para ti si…</h3>
          ${checkList(forWho)}
        </div>
        <div class="lf-card lf-reveal" data-d="1">
          <span class="lf-card__icon" style="background:color-mix(in srgb,var(--lf-danger) 13%,transparent);color:var(--lf-danger)">${icon('x', { size: 23 })}</span>
          <h3 class="lf-h3" style="margin-bottom:.7em">No es para ti si…</h3>
          <ul class="lf-checks">
            ${notForWho
              .map((t) => `<li class="lf-check lf-check--cross">${icon('x', { size: 22 })}<span>${esc(t)}</span></li>`)
              .join('')}
          </ul>
        </div>
      </div>`,
  });
};

/* ------------------------------------------------------------------ */
/* Currículo                                                           */
/* ------------------------------------------------------------------ */

export const digitalCurriculum: SectionRenderer = (ctx, props) => {
  const c = ctx.settings.copy;
  const items = (Array.isArray(props.items) ? (props.items as string[]) : c.curriculum).filter(Boolean);
  if (!items.length) return '';
  const src = productImage(ctx, 0);

  return section({
    cls: 'lf-section--surface',
    theme: ctx.theme,
    inner: `<div class="lf-split">
      <div>
        ${sectionHead({
          eyebrow: 'Contenido',
          title: (props.title as string) || c.curriculumTitle,
          ctx,
          fields: { title: 'curriculumTitle' },
          // Sin cifras: el conteo de módulos ya viene del propio texto del
          // producto y poner otro número aquí crea contradicciones.
          text: 'Temario completo, en el orden en que lo vas a estudiar.',
          accentEyebrow: true,
        })}
        <ol style="display:grid;gap:2px">
          ${items
            .map(
              (m, i) => `<li class="lf-reveal" data-d="${(i % 5) + 1}" style="display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:center;padding:14px 0;border-bottom:1px solid var(--lf-border)">
              <span style="font-family:var(--lf-font-heading);font-weight:700;font-size:.95rem;color:var(--lf-accent);min-width:2.2em">${String(
                i + 1
              ).padStart(2, '0')}</span>
              <span style="font-weight:550;line-height:1.4">${esc(m)}</span>
            </li>`
            )
            .join('')}
        </ol>
      </div>
      <div class="lf-reveal" data-d="1" style="display:grid;place-items:center;align-self:start;position:sticky;top:84px">
        ${phoneMockup(src, humanTitle(ctx.product.name))}
        <p class="lf-xs" style="margin-top:16px;text-align:center;max-width:26ch">Estudia desde el celular, el computador o la tablet. Descargable para ver sin internet.</p>
      </div>
    </div>`,
  });
};

/* ------------------------------------------------------------------ */
/* Bonos                                                               */
/* ------------------------------------------------------------------ */

export const digitalBonuses: SectionRenderer = (ctx, props) => {
  const bonuses = ctx.settings.offer.bonuses.filter((b) => b.title);
  if (!bonuses.length) return '';
  const total = bonuses.reduce((a, b) => a + (b.value ?? 0), 0);

  return section({
    theme: ctx.theme,
    inner:
      sectionHead({
        eyebrow: 'Incluido hoy',
        title: (props.title as string) || 'Además te llevas estos bonos',
        text: total > 0 ? `Valor sumado de los bonos: ${cop(total)}. Hoy van incluidos.` : null,
        center: true,
        accentEyebrow: true,
      }) +
      `<div style="display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))">
        ${bonuses
          .map(
            (b, i) => `<article class="lf-card lf-reveal" data-d="${(i % 4) + 1}">
            <span class="lf-card__icon">${icon('gift', { size: 23 })}</span>
            <h3 class="lf-h4" style="margin-bottom:.4em">${esc(b.title)}</h3>
            <p>${esc(b.description)}</p>
            ${b.value ? `<p style="margin-top:12px"><s class="lf-price-compare" style="font-size:1rem">${esc(cop(b.value))}</s> <span class="lf-pill lf-pill--ok">Gratis hoy</span></p>` : ''}
          </article>`
          )
          .join('')}
      </div>`,
  });
};

/* ------------------------------------------------------------------ */
/* Precio ancla                                                        */
/* ------------------------------------------------------------------ */

export const digitalPriceAnchor: SectionRenderer = (ctx, props) => {
  const { settings } = ctx;
  const bonuses = settings.offer.bonuses.filter((b) => b.title);
  const bonusValue = bonuses.reduce((a, b) => a + (b.value ?? 0), 0);
  const anchor = settings.offer.compareAt ?? settings.offer.price * 3;
  const rows: Array<[string, number]> = [[`${humanTitle(ctx.product.name)}`, anchor]];
  bonuses.forEach((b) => rows.push([b.title, b.value ?? 0]));
  const realValue = anchor + bonusValue;

  return section({
    cls: 'lf-section--surface',
    theme: ctx.theme,
    inner: `<div style="max-width:620px;margin-inline:auto">
      ${sectionHead({
        eyebrow: 'Resumen',
        title: (props.title as string) || 'Lo que te llevas hoy',
        center: true,
        accentEyebrow: true,
      })}
      <div class="lf-card lf-reveal" style="padding:clamp(22px,3.5vw,38px)">
        ${rows
          .map(
            ([label, value]) =>
              `<div class="lf-summary__row"><span>${esc(label)}</span><strong>${value > 0 ? esc(cop(value)) : '—'}</strong></div>`
          )
          .join('')}
        <div class="lf-summary__row" style="border-top:1px solid var(--lf-border);margin-top:8px;padding-top:14px">
          <span>Valor real</span><strong><s class="lf-price-compare" style="font-size:1.05rem">${esc(cop(realValue))}</s></strong>
        </div>
        <div class="lf-summary__row lf-summary__row--total">
          <span>Hoy pagas</span><strong data-lf-total>${esc(cop(settings.offer.price))}</strong>
        </div>
        <div class="lf-btns" style="margin-top:24px;flex-direction:column">
          ${primaryCta(ctx, { xl: true })}
        </div>
        <p class="lf-xs" style="margin-top:14px;text-align:center">Pago único. Sin mensualidades ni renovaciones.</p>
      </div>
    </div>`,
  });
};

/* ------------------------------------------------------------------ */
/* CTA final                                                           */
/* ------------------------------------------------------------------ */

export const digitalFinalCta: SectionRenderer = (ctx) => {
  const { settings, product } = ctx;
  const hasLink = Boolean(settings.offer.paymentLink || product.paymentLink);

  return `<section class="lf-section" style="text-align:center"><div class="lf-wrap lf-reveal">
      <p class="lf-eyebrow lf-eyebrow--accent" style="justify-content:center">${esc(settings.copy.closingTitle)}</p>
      <h2 class="lf-h2" style="max-width:22ch;margin-inline:auto">${esc(humanTitle(product.name))} por ${esc(
        cop(settings.offer.price)
      )}</h2>
      <p class="lf-lead" style="max-width:54ch;margin:.8em auto 1.8em">${esc(settings.copy.closingText)} ${
        hasLink
          ? 'Haces el pago y recibes el acceso de una vez.'
          : 'Escríbenos por WhatsApp, te pasamos los datos de pago y en minutos tienes el acceso.'
      }</p>
      <div class="lf-btns" style="justify-content:center">${primaryCta(ctx, { xl: true })}</div>
      <p class="lf-xs" style="margin-top:18px">${icon('shield', { size: 13 })} Garantía de ${
        settings.offer.guaranteeDays
      } días · ${icon('infinity', { size: 13 })} Acceso de por vida</p>
    </div></section>`;
};
