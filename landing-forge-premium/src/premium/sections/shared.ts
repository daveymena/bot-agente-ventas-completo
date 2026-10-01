/**
 * Contexto y piezas reutilizables para todas las secciones.
 *
 * REGLA DE ORO DE LAS IMÁGENES: solo se usan las fotos del producto en la
 * tienda (`product.image` + `product.images`) y las de `related`. Nada de
 * stock, Unsplash ni imágenes generadas. Si solo hay una foto, se reutiliza
 * con recortes y encuadres distintos vía CSS.
 */

import type {
  LandingSettings,
  Product,
  RelatedProduct,
  RenderConfig,
  StoreInfo,
  Theme,
} from '../types';
import { cop, discountPercent, esc, humanTitle } from '../format';
import { icon, pickIconForText } from '../icons';
import { waLink } from '../store';

export interface Ctx {
  product: Product;
  store: StoreInfo;
  related: RelatedProduct[];
  theme: Theme;
  settings: LandingSettings;
  config: RenderConfig;
  preview: boolean;
}

export type SectionRenderer = (ctx: Ctx, props: Record<string, unknown>) => string;

/* ------------------------------------------------------------------ */
/* Imágenes                                                            */
/* ------------------------------------------------------------------ */

/** Variantes de encuadre para reutilizar una misma foto sin que se note. */
export const SHOT_VARIANTS = [
  '',
  'lf-shot--alt',
  'lf-shot--zoom',
  'lf-shot--zoom-tl lf-shot--alt',
  'lf-shot--zoom-br',
] as const;

/** Devuelve la i-ésima foto del producto; si hay menos, cicla. */
export function productImage(ctx: Ctx, index = 0): string | null {
  const imgs = ctx.product.images.length ? ctx.product.images : ctx.product.image ? [ctx.product.image] : [];
  if (!imgs.length) return null;
  return imgs[index % imgs.length];
}

export function imageCount(ctx: Ctx): number {
  return ctx.product.images.length || (ctx.product.image ? 1 : 0);
}

export interface ShotOptions {
  /** Índice de la foto. */
  index?: number;
  /** Clases extra: `lf-shot--tall`, `lf-shot--wide`, `lf-shot--cover`… */
  variant?: string;
  /** Si hay una sola foto, aplica un recorte distinto automáticamente. */
  autoCrop?: number;
  alt?: string;
  eager?: boolean;
  badge?: string | null;
  badgeRight?: string | null;
  tag?: string | null;
  sizes?: string;
  className?: string;
}

/**
 * Contenedor de foto de producto con tratamiento premium:
 * fondo de marca, sombra de contacto, esquinas redondeadas y `object-fit`
 * adecuado para que la foto del proveedor no se vea estirada.
 */
export function shot(ctx: Ctx, options: ShotOptions = {}): string {
  const index = options.index ?? 0;
  const src = productImage(ctx, index);
  const alt = esc(options.alt ?? humanTitle(ctx.product.name));
  const only = imageCount(ctx) <= 1;
  const auto = only && options.autoCrop !== undefined ? SHOT_VARIANTS[options.autoCrop % SHOT_VARIANTS.length] : '';
  const cls = ['lf-shot', options.variant ?? '', auto, options.className ?? ''].filter(Boolean).join(' ');

  if (!src) {
    // Sin foto en el catálogo: bloque de color de marca, nunca un placeholder externo.
    return `<div class="${cls}" aria-hidden="true"></div>`;
  }

  const loading = options.eager ? '' : ' loading="lazy" decoding="async"';
  const fetchPriority = options.eager ? ' fetchpriority="high"' : '';
  const sizes = options.sizes ? ` sizes="${esc(options.sizes)}"` : '';
  return `<div class="${cls}">
      ${options.badge ? `<span class="lf-badge">${esc(options.badge)}</span>` : ''}
      ${options.badgeRight ? `<span class="lf-badge lf-badge--right">${esc(options.badgeRight)}</span>` : ''}
      <img src="${esc(src)}" alt="${alt}"${loading}${fetchPriority}${sizes}>
      ${options.tag ? `<span class="lf-shot__tag">${esc(options.tag)}</span>` : ''}
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Piezas de texto                                                     */
/* ------------------------------------------------------------------ */

/**
 * Marca un texto como editable en línea desde la vista previa del panel.
 * Fuera del modo preview no agrega nada al HTML exportado.
 */
export function ed(ctx: Ctx, field?: string | null): string {
  return ctx.preview && field ? ` data-lf-edit="${field}"` : '';
}

export function sectionHead(opts: {
  eyebrow?: string | null;
  title: string;
  text?: string | null;
  center?: boolean;
  accentEyebrow?: boolean;
  ctx?: Ctx;
  fields?: { eyebrow?: string; title?: string; text?: string };
}): string {
  const cls = `lf-head${opts.center ? ' lf-head--center' : ''}`;
  const mark = (field?: string) => (opts.ctx ? ed(opts.ctx, field) : '');
  return `<div class="${cls} lf-reveal">
      ${opts.eyebrow ? `<p class="lf-eyebrow${opts.accentEyebrow ? ' lf-eyebrow--accent' : ''}"${mark(opts.fields?.eyebrow)}>${esc(opts.eyebrow)}</p>` : ''}
      <h2 class="lf-h2"${mark(opts.fields?.title)}>${esc(opts.title)}</h2>
      ${opts.text ? `<p class="lf-lead"${mark(opts.fields?.text)}>${esc(opts.text)}</p>` : ''}
    </div>`;
}

export function stars(count: number, size = 16): string {
  const full = Math.round(Math.max(0, Math.min(5, count)));
  return `<span class="lf-stars" role="img" aria-label="${full} de 5 estrellas">${Array.from({ length: 5 })
    .map((_, i) => icon(i < full ? 'star-filled' : 'star', { size }))
    .join('')}</span>`;
}

/* ------------------------------------------------------------------ */
/* Precio                                                              */
/* ------------------------------------------------------------------ */

export function priceBlock(ctx: Ctx, opts: { note?: string | null } = {}): string {
  const { offer } = ctx.settings;
  const off = discountPercent(offer.price, offer.compareAt);
  return `<div class="lf-price-row">
      <span class="lf-price" data-lf-total>${esc(cop(offer.price))}</span>
      ${offer.compareAt && offer.compareAt > offer.price ? `<s class="lf-price-compare">${esc(cop(offer.compareAt))}</s>` : ''}
      ${off > 0 ? `<span class="lf-pill lf-pill--save">${off}% OFF</span>` : ''}
    </div>
    ${opts.note !== null ? `<p class="lf-price-note">${esc(opts.note ?? defaultPriceNote(ctx))}</p>` : ''}`;
}

function defaultPriceNote(ctx: Ctx): string {
  if (ctx.product.kind === 'digital') return 'Pago único. Acceso inmediato y de por vida.';
  const bits: string[] = [];
  if (ctx.settings.offer.freeShipping) bits.push('Envío gratis');
  if (ctx.settings.offer.cod) bits.push('pagas al recibir');
  const fin: string[] = [];
  if (ctx.settings.offer.financing.addi) fin.push('Addi');
  if (ctx.settings.offer.financing.sistecredito) fin.push('Sistecrédito');
  let text = bits.length ? `${bits.join(' · ')}.` : '';
  if (fin.length) text += ` También puedes financiar con ${fin.join(' o ')}.`;
  return text.trim() || 'Precio final, sin costos ocultos.';
}

/* ------------------------------------------------------------------ */
/* CTAs                                                                */
/* ------------------------------------------------------------------ */

export function waUrl(ctx: Ctx, message: string): string {
  return waLink(ctx.settings.whatsappPhone || ctx.store.whatsappPhone, message);
}

export interface CtaOptions {
  label?: string;
  sub?: string | null;
  shine?: boolean;
  xl?: boolean;
  className?: string;
  /** Renderiza un `<button type="submit">` en vez de un enlace. */
  submit?: boolean;
}

/** Botón principal. En físicos baja al formulario; en digitales va al pago. */
export function primaryCta(ctx: Ctx, opts: CtaOptions = {}): string {
  const { product, settings } = ctx;
  const label = opts.label ?? settings.copy.ctaPrimary;
  const cls = ['lf-btn', opts.shine === false ? '' : 'lf-btn--shine', opts.xl ? 'lf-btn--xl' : '', opts.className ?? '']
    .filter(Boolean)
    .join(' ');

  const inner = `<span class="lf-btn__stack"><span>${esc(label)}</span>${
    opts.sub === null ? '' : `<span class="lf-btn__sub">${esc(opts.sub ?? defaultCtaSub(ctx))}</span>`
  }</span>${icon('arrow-right', { size: 19 })}`;

  if (opts.submit) {
    return `<button type="submit" class="${cls}">${inner}</button>`;
  }

  if (product.kind === 'digital') {
    const link = settings.offer.paymentLink || product.paymentLink;
    if (link) {
      return `<a class="${cls}" href="${esc(link)}" rel="nofollow noopener" target="_blank" data-lf-pay>${inner}</a>`;
    }
    const msg = `Hola, quiero el ${humanTitle(product.name)} de ${cop(settings.offer.price)}. ¿Me pasas los datos para el pago?`;
    return `<a class="${cls}" href="${esc(waUrl(ctx, msg))}" rel="nofollow noopener" target="_blank" data-lf-wa>${inner}</a>`;
  }

  if (product.kind === 'service') {
    const msg = `Hola, quiero agendar ${humanTitle(product.name)}. ¿Cómo empezamos?`;
    return `<a class="${cls}" href="${esc(waUrl(ctx, msg))}" rel="nofollow noopener" target="_blank" data-lf-wa>${inner}</a>`;
  }

  return `<a class="${cls}" href="#pedido" data-lf-scroll="form">${inner}</a>`;
}

function defaultCtaSub(ctx: Ctx): string {
  if (ctx.product.kind === 'digital') return 'Acceso inmediato después del pago';
  if (ctx.product.kind === 'service') return 'Te respondemos hoy mismo';
  const bits: string[] = [];
  if (ctx.settings.offer.freeShipping) bits.push('Envío gratis');
  if (ctx.settings.offer.cod) bits.push('pagas al recibir');
  return bits.join(' · ') || 'Entrega a toda Colombia';
}

export function whatsappCta(ctx: Ctx, label?: string, message?: string): string {
  const msg = message ?? `Hola, tengo una pregunta sobre ${humanTitle(ctx.product.name)}.`;
  return `<a class="lf-btn lf-btn--ghost" href="${esc(waUrl(ctx, msg))}" rel="nofollow noopener" target="_blank" data-lf-wa>
      ${icon('whatsapp', { size: 20 })}<span>${esc(label ?? ctx.settings.copy.ctaSecondary)}</span>
    </a>`;
}

/* ------------------------------------------------------------------ */
/* Sellos                                                              */
/* ------------------------------------------------------------------ */

export function sealsRow(ctx: Ctx): string {
  const seals = trustSeals(ctx);
  return `<ul class="lf-seals lf-reveal">${seals
    .map(
      (s) => `<li class="lf-seal">${icon(s.icon, { size: 20 })}<span>${esc(s.text)}</span></li>`
    )
    .join('')}</ul>`;
}

export function trustSeals(ctx: Ctx): Array<{ icon: string; text: string }> {
  const { offer } = ctx.settings;
  if (ctx.product.kind === 'digital') {
    return [
      { icon: 'zap', text: 'Acceso inmediato' },
      { icon: 'infinity', text: 'Acceso de por vida' },
      { icon: 'smartphone', text: 'Celular o computador' },
      { icon: 'message-circle', text: 'Soporte por WhatsApp' },
    ];
  }
  if (ctx.product.kind === 'service') {
    return [
      { icon: 'message-circle', text: 'Respuesta el mismo día' },
      { icon: 'list-checks', text: 'Alcance por escrito' },
      { icon: 'calendar', text: 'Fecha de entrega clara' },
      { icon: 'shield', text: 'Ajustes incluidos' },
    ];
  }
  const out: Array<{ icon: string; text: string }> = [];
  if (offer.freeShipping) out.push({ icon: 'truck', text: 'Envío gratis a toda Colombia' });
  if (offer.cod) out.push({ icon: 'banknote', text: 'Pago contra entrega' });
  out.push({ icon: 'shield', text: `Garantía de ${offer.guaranteeDays} días` });
  out.push({ icon: 'message-circle', text: 'Soporte por WhatsApp' });
  return out.slice(0, 4);
}

/* ------------------------------------------------------------------ */
/* Beneficios                                                          */
/* ------------------------------------------------------------------ */

export function checkList(items: string[], modifier = ''): string {
  if (!items.length) return '';
  return `<ul class="lf-checks">${items
    .map((b) => `<li class="lf-check ${modifier}">${icon('check', { size: 22 })}<span>${esc(b)}</span></li>`)
    .join('')}</ul>`;
}

export function benefitCard(text: string, index: number, wide = false): string {
  const name = pickIconForText(text, index);
  return `<article class="lf-card lf-reveal${wide ? ' is-wide' : ''}" data-d="${(index % 5) + 1}">
      <span class="lf-card__icon">${icon(name, { size: 23 })}</span>
      <h3 class="lf-h4">${esc(text)}</h3>
    </article>`;
}

/* ------------------------------------------------------------------ */
/* Formas orgánicas (Soft Wellness)                                    */
/* ------------------------------------------------------------------ */

export function blob(variant: 1 | 2): string {
  const paths = {
    1: 'M43.6,-58.3C56,-50.5,65,-36.5,69.4,-21.2C73.8,-5.9,73.5,10.6,67.3,24.3C61.1,38,49,48.8,35.4,56.9C21.8,65,6.7,70.4,-8.6,69.9C-23.9,69.4,-39.4,63,-50.7,52C-62,41,-69.1,25.4,-70.9,9.2C-72.7,-7,-69.2,-23.9,-60.3,-36.8C-51.4,-49.7,-37.1,-58.7,-22.6,-65.3C-8.1,-71.9,6.6,-76.1,20.9,-73C35.2,-69.9,49,-59.5,43.6,-58.3Z',
    2: 'M38.5,-52.7C50.9,-44.3,62.4,-33.9,67.7,-20.6C73,-7.3,72.1,8.9,66.3,22.8C60.5,36.7,49.8,48.3,36.9,56.4C24,64.5,8.9,69.1,-5.9,67.9C-20.7,66.7,-35.2,59.7,-47.7,49.8C-60.2,39.9,-70.7,27.1,-74.3,12.4C-77.9,-2.3,-74.6,-18.9,-66.2,-32C-57.8,-45.1,-44.3,-54.7,-30.6,-62.3C-16.9,-69.9,-3,-75.5,8.9,-72.3C20.8,-69.1,26.1,-61.1,38.5,-52.7Z',
  };
  return `<svg class="lf-blob lf-blob--${variant}" viewBox="-100 -100 200 200" aria-hidden="true"><path fill="currentColor" d="${paths[variant]}"/></svg>`;
}

/** Envuelve una sección estándar. */
export function section(opts: {
  id?: string;
  cls?: string;
  inner: string;
  organic?: boolean;
  theme?: Theme;
}): string {
  const organic = opts.organic && opts.theme?.organicShapes ? `${blob(1)}${blob(2)}` : '';
  return `<section${opts.id ? ` id="${opts.id}"` : ''} class="lf-section ${opts.cls ?? ''}">${organic}<div class="lf-wrap">${opts.inner}</div></section>`;
}

/** Texto plano del número de prueba social, solo si el usuario lo cargó. */
export function socialProofLine(ctx: Ctx): string | null {
  const sp = ctx.settings.socialProof;
  const bits: string[] = [];
  if (sp.rating && sp.ratingCount) {
    bits.push(`${sp.rating.toFixed(1)}/5 en ${sp.ratingCount} reseñas`);
  } else if (sp.rating) {
    bits.push(`${sp.rating.toFixed(1)}/5`);
  }
  if (sp.customers) bits.push(`+${sp.customers.toLocaleString('es-CO').replace(/,/g, '.')} clientes`);
  return bits.length ? bits.join(' · ') : null;
}
