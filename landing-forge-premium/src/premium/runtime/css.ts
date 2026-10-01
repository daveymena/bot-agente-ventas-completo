/**
 * CSS de la landing exportada.
 * Sin frameworks: todo son variables CSS + clases propias con prefijo `lf-`.
 * Objetivo: Lighthouse móvil >= 90, así que nada de librerías ni @import extra.
 */

import type { Theme } from '../types';
import { themeCssVars } from '../themes';

export function buildCss(theme: Theme): string {
  return `
/* ===== Tokens ===================================================== */
:root {
${themeCssVars(theme)}
  --lf-pad: clamp(20px, 5vw, 56px);
  --lf-gap: clamp(16px, 3vw, 32px);
  --lf-section-y: clamp(56px, 9vw, 112px);
  --lf-ease: cubic-bezier(.22,.61,.36,1);
}

/* ===== Reset ====================================================== */
*,*::before,*::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--lf-bg);
  color: var(--lf-text);
  font-family: var(--lf-font-body);
  font-size: 17px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow-x: hidden;
}
img, svg, video { display: block; max-width: 100%; }
img { height: auto; }
button, input, select, textarea { font: inherit; color: inherit; }
a { color: inherit; text-decoration: none; }
h1,h2,h3,h4 { margin: 0; font-family: var(--lf-font-heading); font-weight: 700; line-height: 1.04; letter-spacing: var(--lf-heading-ls); text-transform: var(--lf-heading-transform); }
p { margin: 0 0 1em; }
p:last-child { margin-bottom: 0; }
ul, ol { margin: 0; padding: 0; list-style: none; }

/* ===== Tipografía fluida ========================================== */
.lf-h1 { font-size: clamp(2rem, 1.15rem + 3.9vw, 4rem); }
.lf-h2 { font-size: clamp(1.65rem, 1.1rem + 2.3vw, 2.9rem); line-height: 1.08; }
.lf-h3 { font-size: clamp(1.15rem, .98rem + .8vw, 1.5rem); line-height: 1.2; }
.lf-h4 { font-size: clamp(1rem, .95rem + .3vw, 1.15rem); line-height: 1.3; }
.lf-lead { font-size: clamp(1.02rem, .97rem + .4vw, 1.2rem); color: var(--lf-text-muted); line-height: 1.6; }
.lf-small { font-size: .875rem; color: var(--lf-text-muted); }
.lf-xs { font-size: .78rem; color: var(--lf-text-muted); }

.lf-eyebrow {
  display: inline-flex; align-items: center; gap: .5em;
  font-family: var(--lf-font-body);
  font-size: .72rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
  color: var(--lf-text-muted); margin-bottom: .85em;
}
.lf-eyebrow::before {
  content: ''; width: 22px; height: 1px; background: currentColor; opacity: .55;
}
.lf-eyebrow--accent { color: var(--lf-accent); }
${theme.dark ? '.lf-eyebrow--accent { color: var(--lf-accent); }' : ''}

/* ===== Layout ===================================================== */
.lf-wrap { width: 100%; max-width: var(--lf-max); margin-inline: auto; padding-inline: var(--lf-pad); }
.lf-section { padding-block: var(--lf-section-y); position: relative; }
.lf-section--tight { padding-block: clamp(36px, 6vw, 72px); }
.lf-section--surface { background: var(--lf-surface); }
.lf-section--ink { background: var(--lf-primary); color: var(--lf-on-primary); }
.lf-section--ink .lf-lead, .lf-section--ink .lf-small, .lf-section--ink .lf-eyebrow { color: color-mix(in srgb, var(--lf-on-primary) 72%, transparent); }
.lf-section--accent { background: var(--lf-accent); color: var(--lf-on-accent); }
.lf-section--accent .lf-lead, .lf-section--accent .lf-eyebrow { color: color-mix(in srgb, var(--lf-on-accent) 75%, transparent); }

.lf-head { max-width: 46ch; margin-bottom: clamp(28px, 4vw, 52px); }
.lf-head--center { margin-inline: auto; text-align: center; }
.lf-head--center .lf-eyebrow::before { display: none; }
.lf-head p { margin-top: .7em; }

/* Grilla asimétrica 7/5 */
.lf-split { display: grid; gap: var(--lf-gap); align-items: center; }
@media (min-width: 900px) {
  .lf-split { grid-template-columns: 7fr 5fr; gap: clamp(32px, 4vw, 72px); }
  .lf-split--flip { grid-template-columns: 5fr 7fr; }
  .lf-split--flip > :first-child { order: 2; }
  .lf-split--flip > :last-child { order: 1; }
  .lf-split--even { grid-template-columns: 1fr 1fr; }
}

/* Bento */
.lf-bento { display: grid; gap: 14px; grid-template-columns: repeat(2, 1fr); }
.lf-bento > * { grid-column: span 2; }
@media (min-width: 640px) {
  .lf-bento { grid-template-columns: repeat(6, 1fr); gap: 16px; }
  .lf-bento > * { grid-column: span 3; }
  .lf-bento > .is-wide { grid-column: span 6; }
  .lf-bento > .is-third { grid-column: span 2; }
}
@media (min-width: 1000px) {
  .lf-bento > * { grid-column: span 2; }
  .lf-bento > .is-wide { grid-column: span 4; }
  .lf-bento > .is-third { grid-column: span 2; }
}

/* ===== Botones ==================================================== */
.lf-btn {
  --btn-bg: var(--lf-primary);
  --btn-fg: var(--lf-on-primary);
  position: relative; overflow: hidden;
  display: inline-flex; align-items: center; justify-content: center; gap: .6em;
  min-height: 56px; padding: 14px 28px;
  background: var(--btn-bg); color: var(--btn-fg);
  border: 1px solid transparent; border-radius: var(--lf-radius-pill);
  font-family: var(--lf-font-body); font-weight: 700; font-size: 1rem; letter-spacing: .01em;
  text-align: center; cursor: pointer; width: 100%;
  transition: transform .18s var(--lf-ease), box-shadow .22s var(--lf-ease), background-color .2s;
  box-shadow: var(--lf-shadow-md);
  -webkit-tap-highlight-color: transparent;
}
@media (min-width: 640px) { .lf-btn { width: auto; min-height: 60px; font-size: 1.05rem; padding: 16px 34px; } }
.lf-btn:hover { transform: translateY(-2px); box-shadow: var(--lf-shadow-lg); background: var(--lf-primary-hover); }
.lf-btn:active { transform: translateY(0); }
.lf-btn:focus-visible { outline: 3px solid var(--lf-accent); outline-offset: 3px; }
/* brillo animado del CTA principal */
.lf-btn--shine::after {
  content: ''; position: absolute; inset: 0 auto 0 -60%;
  width: 45%; background: linear-gradient(100deg, transparent, rgba(255,255,255,.38), transparent);
  transform: skewX(-18deg); animation: lf-shine 3.6s var(--lf-ease) infinite;
}
@keyframes lf-shine { 0%,62% { left: -60%; } 100% { left: 130%; } }
.lf-btn--accent { --btn-bg: var(--lf-accent); --btn-fg: var(--lf-on-accent); }
.lf-btn--accent:hover { background: color-mix(in srgb, var(--lf-accent) 88%, #000); }
.lf-btn--ghost {
  --btn-bg: transparent; --btn-fg: var(--lf-text);
  border-color: var(--lf-border); box-shadow: none;
}
.lf-btn--ghost:hover { background: var(--lf-surface); box-shadow: var(--lf-shadow-sm); }
.lf-btn--wa { --btn-bg: #25D366; --btn-fg: #06310F; }
.lf-btn--wa:hover { background: #1FBE5A; }
.lf-btn--xl { min-height: 62px; font-size: 1.1rem; }
.lf-btn__sub { display: block; font-weight: 500; font-size: .76rem; opacity: .78; letter-spacing: .02em; text-transform: none; margin-top: 2px; }
.lf-btn__stack { display: flex; flex-direction: column; align-items: center; line-height: 1.15; }

.lf-btns { display: flex; flex-direction: column; gap: 12px; }
@media (min-width: 640px) { .lf-btns { flex-direction: row; flex-wrap: wrap; align-items: center; } }

/* ===== Píldoras, badges, sellos =================================== */
.lf-pill {
  display: inline-flex; align-items: center; gap: .45em;
  padding: 6px 13px; border-radius: var(--lf-radius-pill);
  background: var(--lf-accent-soft); color: var(--lf-text);
  font-size: .8rem; font-weight: 600; line-height: 1.3;
}
.lf-pill--save { background: var(--lf-accent); color: var(--lf-on-accent); font-weight: 700; }
.lf-pill--hot { background: var(--lf-danger); color: #fff; }
.lf-pill--ok { background: color-mix(in srgb, var(--lf-success) 16%, transparent); color: var(--lf-success); }
.lf-pill svg { width: 15px; height: 15px; }

.lf-badge {
  position: absolute; top: 14px; left: 14px; z-index: 3;
  padding: 6px 12px; border-radius: var(--lf-radius-pill);
  background: var(--lf-primary); color: var(--lf-on-primary);
  font-size: .72rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
}
.lf-badge--right { left: auto; right: 14px; background: var(--lf-accent); color: var(--lf-on-accent); }

.lf-seals { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
@media (min-width: 720px) { .lf-seals { grid-template-columns: repeat(4, 1fr); } }
.lf-seal {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; border: 1px solid var(--lf-border); border-radius: var(--lf-radius-md);
  background: var(--lf-surface-raised); font-size: .84rem; font-weight: 600; line-height: 1.25;
}
.lf-seal svg { flex: 0 0 auto; width: 20px; height: 20px; color: var(--lf-accent); }

/* ===== Precio ===================================================== */
.lf-price-row { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px 14px; }
.lf-price {
  font-family: var(--lf-font-heading); font-weight: 700;
  font-size: clamp(2.1rem, 1.5rem + 2.3vw, 3.1rem); line-height: 1; letter-spacing: -.03em;
}
.lf-price-compare { font-size: 1.1rem; color: var(--lf-text-muted); text-decoration: line-through; text-decoration-thickness: 1.5px; }
.lf-price-note { font-size: .85rem; color: var(--lf-text-muted); }

/* ===== Tratamiento de fotos del producto ========================== */
.lf-shot {
  position: relative; overflow: hidden;
  border-radius: var(--lf-radius-lg);
  background: var(--lf-product-bg);
  aspect-ratio: 1 / 1;
  display: grid; place-items: center;
  isolation: isolate;
}
.lf-shot::before {
  content: ''; position: absolute; inset: 0; z-index: 0;
  background: radial-gradient(120% 90% at 50% 8%, color-mix(in srgb, var(--lf-surface-raised) 55%, transparent), transparent 62%);
  pointer-events: none;
}
/* sombra de contacto bajo el producto */
.lf-shot::after {
  content: ''; position: absolute; z-index: 1;
  left: 50%; bottom: 7%; transform: translateX(-50%);
  width: 56%; height: 22px; border-radius: 50%;
  background: var(--lf-shadow-contact);
  filter: blur(14px); opacity: .5; pointer-events: none;
}
.lf-shot img {
  position: relative; z-index: 2;
  width: 100%; height: 100%;
  object-fit: contain; padding: clamp(18px, 5%, 44px);
  mix-blend-mode: ${theme.dark ? 'normal' : 'multiply'};
  transition: transform .5s var(--lf-ease);
}
${theme.dark ? '.lf-shot img { filter: saturate(1.04); }' : ''}
.lf-shot--cover img { object-fit: cover; padding: 0; mix-blend-mode: normal; }
.lf-shot--cover::after { display: none; }
.lf-shot--alt { background: var(--lf-product-bg-alt); }
.lf-shot--tall { aspect-ratio: 4 / 5; }
.lf-shot--wide { aspect-ratio: 16 / 10; }
.lf-shot--zoom img { transform: scale(1.5); object-position: 50% 42%; }
.lf-shot--zoom-tl img { transform: scale(1.45); object-position: 30% 32%; }
.lf-shot--zoom-br img { transform: scale(1.4); object-position: 70% 68%; }
.lf-shot--frame { border: 1px solid var(--lf-border); }
a.lf-shot:hover img, .lf-card:hover .lf-shot img { transform: scale(1.04); }
.lf-shot--zoom:hover img { transform: scale(1.58); }

.lf-shot__tag {
  position: absolute; z-index: 4; bottom: 12px; left: 12px;
  padding: 6px 12px; border-radius: var(--lf-radius-pill);
  background: color-mix(in srgb, var(--lf-bg) 86%, transparent);
  backdrop-filter: blur(8px);
  border: 1px solid var(--lf-border);
  font-size: .74rem; font-weight: 600;
}

/* ===== Galería ==================================================== */
.lf-gallery { position: relative; }
.lf-gallery__track {
  display: flex; gap: 10px;
  overflow-x: auto; scroll-snap-type: x mandatory;
  scrollbar-width: none; -ms-overflow-style: none;
  border-radius: var(--lf-radius-lg);
}
.lf-gallery__track::-webkit-scrollbar { display: none; }
.lf-gallery__slide { flex: 0 0 100%; scroll-snap-align: center; }
.lf-gallery__dots { display: flex; justify-content: center; gap: 7px; margin-top: 14px; }
.lf-gallery__dot {
  width: 7px; height: 7px; padding: 0; border: 0; border-radius: 50%;
  background: var(--lf-border); cursor: pointer; transition: all .22s var(--lf-ease);
}
.lf-gallery__dot[aria-current="true"] { width: 24px; border-radius: 4px; background: var(--lf-primary); }
.lf-gallery__thumbs { display: flex; gap: 10px; margin-top: 14px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
.lf-gallery__thumbs::-webkit-scrollbar { display: none; }
.lf-thumb {
  flex: 0 0 72px; width: 72px; height: 72px; padding: 0;
  border: 1.5px solid var(--lf-border); border-radius: var(--lf-radius-sm);
  background: var(--lf-product-bg); cursor: pointer; overflow: hidden;
  transition: border-color .2s, transform .2s var(--lf-ease);
}
.lf-thumb img { width: 100%; height: 100%; object-fit: contain; padding: 6px; mix-blend-mode: ${theme.dark ? 'normal' : 'multiply'}; }
.lf-thumb[aria-current="true"] { border-color: var(--lf-primary); transform: translateY(-2px); }
.lf-gallery__nav {
  position: absolute; top: 50%; transform: translateY(-50%); z-index: 5;
  width: 40px; height: 40px; display: none; place-items: center;
  border: 1px solid var(--lf-border); border-radius: 50%;
  background: color-mix(in srgb, var(--lf-bg) 88%, transparent);
  backdrop-filter: blur(6px); cursor: pointer; color: var(--lf-text);
}
.lf-gallery__nav--prev { left: 12px; }
.lf-gallery__nav--next { right: 12px; }
@media (min-width: 900px) { .lf-gallery__nav { display: grid; } }
.lf-gallery__nav:hover { background: var(--lf-surface-raised); }

/* ===== Tarjetas =================================================== */
.lf-card {
  position: relative;
  background: var(--lf-surface-raised);
  border: 1px solid var(--lf-border);
  border-radius: var(--lf-radius-md);
  padding: clamp(18px, 2.4vw, 28px);
  transition: transform .25s var(--lf-ease), box-shadow .25s var(--lf-ease), border-color .25s;
  ${theme.glass ? 'backdrop-filter: blur(14px) saturate(1.2);' : ''}
}
.lf-card:hover { transform: translateY(-4px); box-shadow: var(--lf-shadow-lg); border-color: color-mix(in srgb, var(--lf-accent) 45%, var(--lf-border)); }
.lf-card--flat { box-shadow: none; }
.lf-card--pad0 { padding: 0; overflow: hidden; }
.lf-card__icon {
  display: grid; place-items: center; width: 46px; height: 46px; margin-bottom: 16px;
  border-radius: var(--lf-radius-sm);
  background: var(--lf-accent-soft); color: var(--lf-accent);
}
${theme.dark ? '.lf-card__icon { background: rgba(255,255,255,.06); }' : ''}
.lf-card h3 { margin-bottom: .4em; }
.lf-card p { color: var(--lf-text-muted); font-size: .95rem; }

/* número grande como acento */
.lf-num {
  font-family: var(--lf-font-heading); font-weight: 700;
  font-size: clamp(2.6rem, 2rem + 3vw, 4.4rem); line-height: .85; letter-spacing: -.045em;
  color: transparent;
  -webkit-text-stroke: 1.5px color-mix(in srgb, var(--lf-text) 26%, transparent);
  display: block; margin-bottom: .18em;
}
.lf-num--solid { color: var(--lf-accent); -webkit-text-stroke: 0; }

/* ===== Marquee ==================================================== */
.lf-marquee {
  overflow: hidden; background: var(--lf-primary); color: var(--lf-on-primary);
  padding-block: 14px; white-space: nowrap;
  --lf-marquee-dur: 26s;
}
.lf-marquee--accent { background: var(--lf-accent); color: var(--lf-on-accent); }
.lf-marquee__track { display: inline-flex; align-items: center; gap: 0; animation: lf-marquee var(--lf-marquee-dur) linear infinite; }
.lf-marquee__group { display: inline-flex; align-items: center; gap: 0; }
.lf-marquee__item {
  display: inline-flex; align-items: center; gap: 9px;
  padding-inline: 26px; font-size: .86rem; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
}
.lf-marquee__item svg { width: 17px; height: 17px; opacity: .8; }
.lf-marquee__item::after { content: '·'; margin-left: 26px; opacity: .45; }
@keyframes lf-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.lf-marquee:hover .lf-marquee__track { animation-play-state: paused; }

/* ===== Lista de beneficios ======================================== */
.lf-checks { display: grid; gap: 11px; }
.lf-check { display: flex; align-items: flex-start; gap: 11px; font-size: 1rem; line-height: 1.45; }
.lf-check > svg {
  flex: 0 0 auto; width: 22px; height: 22px; margin-top: 1px;
  padding: 3px; border-radius: 50%;
  background: color-mix(in srgb, var(--lf-success) 15%, transparent); color: var(--lf-success);
}
.lf-check--accent > svg { background: var(--lf-accent-soft); color: var(--lf-accent); }
.lf-check--cross > svg { background: color-mix(in srgb, var(--lf-danger) 13%, transparent); color: var(--lf-danger); }

/* ===== Paquetes =================================================== */
.lf-bundles { display: grid; gap: 14px; }
@media (min-width: 820px) { .lf-bundles { grid-template-columns: repeat(3, 1fr); align-items: stretch; } }
.lf-bundle {
  position: relative; display: block; cursor: pointer;
  background: var(--lf-surface-raised);
  border: 2px solid var(--lf-border); border-radius: var(--lf-radius-md);
  padding: 22px 20px 20px;
  transition: border-color .2s, transform .2s var(--lf-ease), box-shadow .2s;
}
.lf-bundle:hover { transform: translateY(-3px); box-shadow: var(--lf-shadow-md); }
.lf-bundle input { position: absolute; opacity: 0; pointer-events: none; }
.lf-bundle__top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.lf-bundle__qty { font-family: var(--lf-font-heading); font-size: 1.22rem; font-weight: 700; }
.lf-bundle__radio {
  flex: 0 0 auto; width: 22px; height: 22px; border-radius: 50%;
  border: 2px solid var(--lf-border); display: grid; place-items: center; transition: all .2s;
}
.lf-bundle__radio::after { content: ''; width: 10px; height: 10px; border-radius: 50%; background: transparent; transition: background .2s; }
.lf-bundle__price { font-family: var(--lf-font-heading); font-size: 1.75rem; font-weight: 700; line-height: 1; letter-spacing: -.03em; }
.lf-bundle__unit { font-size: .82rem; color: var(--lf-text-muted); margin-top: 6px; }
.lf-bundle__tag {
  position: absolute; top: -11px; left: 50%; transform: translateX(-50%);
  padding: 4px 14px; border-radius: var(--lf-radius-pill); white-space: nowrap;
  background: var(--lf-accent); color: var(--lf-on-accent);
  font-size: .68rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase;
}
.lf-bundle.is-active { border-color: var(--lf-primary); box-shadow: var(--lf-shadow-md); }
.lf-bundle.is-active .lf-bundle__radio { border-color: var(--lf-primary); }
.lf-bundle.is-active .lf-bundle__radio::after { background: var(--lf-primary); }
.lf-bundle.is-best { border-color: color-mix(in srgb, var(--lf-accent) 60%, var(--lf-border)); }

/* ===== Reseñas ==================================================== */
.lf-reviews { display: grid; gap: 16px; }
@media (min-width: 760px) { .lf-reviews { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1040px) { .lf-reviews { grid-template-columns: repeat(3, 1fr); } }
.lf-review__stars { display: flex; gap: 2px; color: var(--lf-accent); margin-bottom: 12px; }
.lf-review__stars svg { width: 17px; height: 17px; }
.lf-review p { font-size: .97rem; line-height: 1.6; color: var(--lf-text); }
.lf-review__who { display: flex; align-items: center; gap: 11px; margin-top: 16px; }
.lf-review__avatar {
  width: 40px; height: 40px; border-radius: 50%; overflow: hidden; flex: 0 0 auto;
  background: var(--lf-accent-soft); color: var(--lf-accent);
  display: grid; place-items: center; font-weight: 700; font-size: .95rem;
}
.lf-review__avatar img { width: 100%; height: 100%; object-fit: cover; }
.lf-review__name { font-weight: 650; font-size: .92rem; line-height: 1.2; }
.lf-rating-big { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.lf-rating-big__score { font-family: var(--lf-font-heading); font-size: 2.6rem; font-weight: 700; line-height: 1; }

/* ===== Acordeón =================================================== */
.lf-acc { border-top: 1px solid var(--lf-border); }
.lf-acc__item { border-bottom: 1px solid var(--lf-border); }
.lf-acc__btn {
  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 18px;
  padding: 20px 0; background: none; border: 0; cursor: pointer; text-align: left;
  font-family: var(--lf-font-heading); font-size: 1.04rem; font-weight: 650; line-height: 1.3;
  color: var(--lf-text);
}
.lf-acc__btn:hover { color: var(--lf-accent); }
.lf-acc__btn svg { flex: 0 0 auto; width: 20px; height: 20px; transition: transform .28s var(--lf-ease); color: var(--lf-text-muted); }
.lf-acc__item.is-open .lf-acc__btn svg { transform: rotate(180deg); }
.lf-acc__panel { overflow: hidden; height: 0; transition: height .3s var(--lf-ease); }
.lf-acc__inner { padding-bottom: 22px; color: var(--lf-text-muted); font-size: .97rem; max-width: 62ch; }

/* ===== Formulario ================================================= */
.lf-form { display: grid; gap: 15px; }
.lf-field { display: grid; gap: 7px; }
.lf-field--half { grid-column: span 1; }
@media (min-width: 640px) { .lf-form--2col { grid-template-columns: 1fr 1fr; } .lf-field--full { grid-column: 1 / -1; } }
.lf-label { font-size: .84rem; font-weight: 650; letter-spacing: .01em; }
.lf-label span { color: var(--lf-danger); }
.lf-input, .lf-select, .lf-textarea {
  width: 100%; min-height: 52px; padding: 13px 15px;
  background: var(--lf-surface-raised); color: var(--lf-text);
  border: 1.5px solid var(--lf-border); border-radius: var(--lf-radius-sm);
  font-size: 16px; /* evita el zoom de iOS */
  transition: border-color .18s, box-shadow .18s;
  appearance: none;
}
.lf-textarea { min-height: 86px; resize: vertical; line-height: 1.5; }
.lf-select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 13px center; padding-right: 42px;
}
.lf-input:focus, .lf-select:focus, .lf-textarea:focus {
  outline: none; border-color: var(--lf-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lf-primary) 18%, transparent);
}
.lf-input[aria-invalid="true"], .lf-select[aria-invalid="true"] { border-color: var(--lf-danger); }
.lf-error { font-size: .78rem; color: var(--lf-danger); min-height: 0; }
.lf-error:empty { display: none; }
.lf-input::placeholder, .lf-textarea::placeholder { color: color-mix(in srgb, var(--lf-text-muted) 75%, transparent); }

.lf-summary {
  background: var(--lf-surface); border: 1px solid var(--lf-border);
  border-radius: var(--lf-radius-md); padding: 18px 20px;
}
.lf-summary__row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding-block: 7px; font-size: .94rem; }
.lf-summary__row--total { border-top: 1px solid var(--lf-border); margin-top: 7px; padding-top: 13px; font-size: 1.12rem; font-weight: 700; }
.lf-summary__row--total strong { font-family: var(--lf-font-heading); font-size: 1.4rem; letter-spacing: -.02em; }

/* ===== Gracias ==================================================== */
.lf-thanks { display: none; text-align: center; padding-block: 22px; }
.lf-thanks.is-visible { display: block; animation: lf-pop .45s var(--lf-ease); }
.lf-thanks__icon {
  width: 72px; height: 72px; margin: 0 auto 20px; display: grid; place-items: center; border-radius: 50%;
  background: color-mix(in srgb, var(--lf-success) 15%, transparent); color: var(--lf-success);
}
.lf-thanks__icon svg { width: 36px; height: 36px; }
@keyframes lf-pop { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: scale(1); } }

/* ===== Sticky CTA + WhatsApp ====================================== */
.lf-sticky {
  position: fixed; inset: auto 0 0 0; z-index: 60;
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  background: color-mix(in srgb, var(--lf-bg) 93%, transparent);
  backdrop-filter: blur(16px) saturate(1.3);
  border-top: 1px solid var(--lf-border);
  transform: translateY(110%); transition: transform .3s var(--lf-ease);
  box-shadow: 0 -8px 30px -14px rgba(0,0,0,.35);
}
.lf-sticky.is-visible { transform: translateY(0); }
.lf-sticky__info { flex: 1 1 auto; min-width: 0; }
.lf-sticky__name { font-size: .78rem; color: var(--lf-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lf-sticky__price { font-family: var(--lf-font-heading); font-size: 1.22rem; font-weight: 700; line-height: 1.1; letter-spacing: -.02em; }
.lf-sticky__price s { font-family: var(--lf-font-body); font-size: .82rem; font-weight: 400; color: var(--lf-text-muted); margin-left: 6px; }
.lf-sticky .lf-btn { width: auto; min-height: 50px; padding: 12px 22px; font-size: .95rem; flex: 0 0 auto; box-shadow: none; }

.lf-wa-float {
  position: fixed; right: 16px; z-index: 55;
  bottom: calc(16px + env(safe-area-inset-bottom));
  width: 56px; height: 56px; border-radius: 50%;
  display: grid; place-items: center;
  background: #25D366; color: #fff;
  box-shadow: 0 10px 28px -8px rgba(37,211,102,.7);
  transition: transform .25s var(--lf-ease), bottom .3s var(--lf-ease);
}
.lf-wa-float svg { width: 29px; height: 29px; }
.lf-wa-float:hover { transform: scale(1.07); }
.lf-wa-float.is-raised { bottom: calc(86px + env(safe-area-inset-bottom)); }
body.has-sticky { padding-bottom: 84px; }
@media (min-width: 900px) { body.has-sticky { padding-bottom: 0; } .lf-sticky { display: none; } .lf-wa-float.is-raised { bottom: calc(16px + env(safe-area-inset-bottom)); } }

/* ===== Barra superior ============================================= */
.lf-topbar {
  position: sticky; top: 0; z-index: 50;
  background: var(--lf-primary); color: var(--lf-on-primary);
  font-size: .8rem; font-weight: 600; letter-spacing: .02em;
  text-align: center; padding: 9px 14px; line-height: 1.35;
}
.lf-topbar--accent { background: var(--lf-accent); color: var(--lf-on-accent); }
.lf-topbar__inner { display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; }
.lf-topbar svg { width: 15px; height: 15px; vertical-align: -2px; }

/* ===== Cuenta regresiva (fecha real) ============================== */
.lf-countdown { display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; }
.lf-cd-unit {
  min-width: 56px; padding: 9px 10px; border-radius: var(--lf-radius-sm);
  background: var(--lf-surface-raised); border: 1px solid var(--lf-border); text-align: center;
}
.lf-cd-unit b { display: block; font-family: var(--lf-font-heading); font-size: 1.5rem; font-weight: 700; line-height: 1; letter-spacing: -.02em; }
.lf-cd-unit span { font-size: .64rem; text-transform: uppercase; letter-spacing: .1em; color: var(--lf-text-muted); }

/* ===== Artículo (advertorial) ===================================== */
.lf-article { max-width: 68ch; margin-inline: auto; }
.lf-article__kicker {
  display: inline-block; padding: 4px 11px; border-radius: 3px;
  background: var(--lf-danger); color: #fff;
  font-size: .68rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 16px;
}
.lf-article h1 { font-size: clamp(1.8rem, 1.2rem + 2.8vw, 3.1rem); margin-bottom: .45em; }
.lf-article__standfirst { font-size: clamp(1.05rem, 1rem + .45vw, 1.28rem); color: var(--lf-text-muted); line-height: 1.55; margin-bottom: 26px; }
.lf-article__meta { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding-block: 16px; border-block: 1px solid var(--lf-border); font-size: .84rem; color: var(--lf-text-muted); margin-bottom: 30px; }
.lf-article__meta b { color: var(--lf-text); font-weight: 650; }
.lf-article__body p { font-size: 1.07rem; line-height: 1.75; margin-bottom: 1.25em; }
.lf-article__body p:first-of-type::first-letter {
  float: left; font-family: var(--lf-font-heading); font-size: 3.4em; line-height: .82;
  padding: .04em .1em 0 0; font-weight: 700; color: var(--lf-accent);
}
.lf-article__pull {
  margin: 34px 0; padding: 22px 26px;
  border-left: 3px solid var(--lf-accent); background: var(--lf-surface);
  border-radius: 0 var(--lf-radius-md) var(--lf-radius-md) 0;
  font-family: var(--lf-font-heading); font-size: 1.22rem; line-height: 1.35; font-weight: 600;
}
.lf-listicle { counter-reset: lf-li; display: grid; gap: 26px; }
.lf-listicle__item { counter-increment: lf-li; display: grid; gap: 14px; grid-template-columns: auto 1fr; align-items: start; }
.lf-listicle__item::before {
  content: counter(lf-li, decimal-leading-zero);
  font-family: var(--lf-font-heading); font-size: 2rem; font-weight: 700; line-height: 1;
  color: var(--lf-accent); letter-spacing: -.04em;
}

/* ===== Marcos de dispositivo (digitales) ========================== */
.lf-device { position: relative; margin-inline: auto; max-width: 100%; }
.lf-laptop { width: min(560px, 100%); }
.lf-laptop__screen {
  position: relative; aspect-ratio: 16 / 10; overflow: hidden;
  background: #0b0b12; border: 10px solid #1b1c26; border-bottom-width: 12px;
  border-radius: 14px 14px 4px 4px;
  box-shadow: var(--lf-shadow-lg), inset 0 0 0 1px rgba(255,255,255,.07);
}
.lf-laptop__screen img { width: 100%; height: 100%; object-fit: cover; }
.lf-laptop__screen::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(118deg, rgba(255,255,255,.14) 0%, transparent 42%);
  pointer-events: none;
}
.lf-laptop__base {
  height: 13px; margin-inline: -7%; border-radius: 0 0 13px 13px;
  background: linear-gradient(180deg, #23242f, #14151d);
  box-shadow: 0 16px 28px -14px rgba(0,0,0,.65);
  position: relative;
}
.lf-laptop__base::after {
  content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  width: 90px; height: 5px; border-radius: 0 0 6px 6px; background: #2d2e3a;
}
.lf-phone { width: min(260px, 72vw); }
.lf-phone__body {
  position: relative; aspect-ratio: 9 / 19.5; overflow: hidden;
  background: #0b0b12; border: 9px solid #1b1c26; border-radius: 38px;
  box-shadow: var(--lf-shadow-lg), inset 0 0 0 1px rgba(255,255,255,.08);
}
.lf-phone__body img { width: 100%; height: 100%; object-fit: cover; }
.lf-phone__notch {
  position: absolute; top: 9px; left: 50%; transform: translateX(-50%); z-index: 3;
  width: 78px; height: 20px; border-radius: 12px; background: #0b0b12;
}
.lf-device-duo { display: grid; place-items: end center; }
.lf-device-duo .lf-phone { position: absolute; right: -2%; bottom: -6%; width: min(150px, 30%); }
@media (min-width: 640px) { .lf-device-duo .lf-phone { right: 2%; } }

/* ===== Hero ======================================================= */
.lf-hero { padding-block: clamp(26px, 4vw, 60px) clamp(40px, 6vw, 84px); position: relative; }
.lf-hero__content > * + * { margin-top: 18px; }
.lf-hero__title { margin-bottom: 0; }
.lf-hero__rating { display: flex; align-items: center; gap: 9px; font-size: .88rem; color: var(--lf-text-muted); }
.lf-hero__rating .lf-stars { display: flex; gap: 1px; color: var(--lf-accent); }
.lf-hero__rating svg { width: 16px; height: 16px; }
${theme.gradients
      ? `.lf-hero::before {
  content: ''; position: absolute; inset: -20% -10% auto -10%; height: 70%; z-index: -1;
  background: radial-gradient(50% 60% at 22% 20%, color-mix(in srgb, var(--lf-primary) ${theme.dark ? '26' : '10'}%, transparent), transparent 70%),
              radial-gradient(45% 55% at 82% 10%, color-mix(in srgb, var(--lf-accent) ${theme.dark ? '20' : '12'}%, transparent), transparent 70%);
  pointer-events: none; filter: blur(12px);
}`
      : ''}
${theme.organicShapes
      ? `.lf-blob { position: absolute; z-index: 0; pointer-events: none; opacity: .5; }
.lf-blob--1 { top: -8%; right: -12%; width: 46%; max-width: 420px; color: var(--lf-accent); }
.lf-blob--2 { bottom: -14%; left: -14%; width: 40%; max-width: 360px; color: var(--lf-primary); opacity: .12; }
.lf-section > .lf-wrap { position: relative; z-index: 1; }`
      : ''}

/* ===== Relacionados =============================================== */
.lf-related { display: grid; gap: 14px; grid-template-columns: repeat(2, 1fr); }
@media (min-width: 860px) { .lf-related { grid-template-columns: repeat(4, 1fr); } }
.lf-related__name { font-size: .88rem; font-weight: 600; line-height: 1.3; margin-top: 11px; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.lf-related__price { font-family: var(--lf-font-heading); font-weight: 700; margin-top: 5px; }

/* ===== Footer ===================================================== */
.lf-footer { background: var(--lf-surface); border-top: 1px solid var(--lf-border); padding-block: 44px 34px; }
.lf-footer__grid { display: grid; gap: 26px; }
@media (min-width: 760px) { .lf-footer__grid { grid-template-columns: 2fr 1fr 1fr; } }
.lf-footer__brand { font-family: var(--lf-font-heading); font-size: 1.22rem; font-weight: 700; }
.lf-footer a:hover { color: var(--lf-accent); }
.lf-footer__links { display: grid; gap: 9px; font-size: .88rem; color: var(--lf-text-muted); }
.lf-footer__bottom { margin-top: 30px; padding-top: 20px; border-top: 1px solid var(--lf-border); font-size: .78rem; color: var(--lf-text-muted); display: flex; flex-wrap: wrap; gap: 10px 20px; justify-content: space-between; }

/* ===== Divisores ================================================== */
.lf-rule { height: 1px; background: var(--lf-border); border: 0; margin: 0; }

/* ===== Aparición al hacer scroll ================================== */
.lf-reveal { opacity: 0; transform: translateY(22px); transition: opacity .6s var(--lf-ease), transform .6s var(--lf-ease); will-change: opacity, transform; }
.lf-reveal.is-in { opacity: 1; transform: none; }
.lf-reveal[data-d="1"] { transition-delay: .07s; }
.lf-reveal[data-d="2"] { transition-delay: .14s; }
.lf-reveal[data-d="3"] { transition-delay: .21s; }
.lf-reveal[data-d="4"] { transition-delay: .28s; }
.lf-reveal[data-d="5"] { transition-delay: .35s; }

/* ===== Accesibilidad ============================================== */
.lf-sr {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
:focus-visible { outline: 3px solid var(--lf-accent); outline-offset: 2px; border-radius: 4px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .001ms !important; animation-iteration-count: 1 !important;
    transition-duration: .001ms !important; scroll-behavior: auto !important;
  }
  .lf-reveal { opacity: 1; transform: none; }
  .lf-marquee__track { animation: none; }
  .lf-btn--shine::after { display: none; }
}

@media print {
  .lf-sticky, .lf-wa-float, .lf-topbar { display: none !important; }
}
`.trim();
}
