/**
 * Landing Forge Premium – Sistema de diseño.
 *
 * 4 temas listos. Cada tema es un set de tokens que se vuelcan como variables
 * CSS en la landing exportada, así el HTML final no depende de Tailwind.
 */

import type { Theme, ThemeId, ThemeTokens } from './types';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const THEMES: Record<ThemeId, Theme> = {
  /* ---------------------------------------------------------------- */
  'clean-luxe': {
    id: 'clean-luxe',
    name: 'Clean Luxe',
    tagline: 'Crema, serif editorial y dorado suave. Moda, accesorios y regalo.',
    dark: false,
    uppercaseHeadings: false,
    organicShapes: false,
    glass: false,
    gradients: false,
    fonts: {
      headingFamily: 'Fraunces',
      bodyFamily: 'Inter',
      headingStack: "'Fraunces', 'Playfair Display', Georgia, 'Times New Roman', serif",
      bodyStack: INTER,
      href: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap',
    },
    tokens: {
      primary: '#1A1714',
      primaryHover: '#000000',
      onPrimary: '#FAF7F2',
      accent: '#B88A3E',
      accentSoft: '#F3E7D2',
      onAccent: '#1A1714',
      bg: '#FAF7F2',
      surface: '#F2EBE1',
      surfaceRaised: '#FFFFFF',
      text: '#1A1714',
      textMuted: '#6E6459',
      border: '#E4D9C9',
      productBg: '#EFE6D8',
      productBgAlt: '#E6DAC7',
      success: '#2F6B4F',
      danger: '#9B2C2C',
      radiusSm: '8px',
      radiusMd: '16px',
      radiusLg: '28px',
      radiusPill: '999px',
      shadowSm: '0 1px 2px rgba(26,23,20,.06)',
      shadowMd: '0 10px 30px -12px rgba(26,23,20,.18)',
      shadowLg: '0 32px 64px -24px rgba(26,23,20,.28)',
      shadowContact: '0 26px 34px -22px rgba(26,23,20,.55)',
      maxWidth: '1180px',
    },
    suggestFor: [
      'moda y accesorios',
      'moda',
      'accesorios',
      'joyeria',
      'joyería',
      'relojes',
      'belleza',
      'belleza y cuidado personal',
      'hogar',
      'hogar y decoracion',
      'hogar y decoración',
      'regalos',
    ],
  },

  /* ---------------------------------------------------------------- */
  'bold-sport': {
    id: 'bold-sport',
    name: 'Bold Sport',
    tagline: 'Blanco, negro intenso y lima eléctrico. Fitness, deporte y herramientas.',
    dark: false,
    uppercaseHeadings: true,
    organicShapes: false,
    glass: false,
    gradients: false,
    fonts: {
      headingFamily: 'Space Grotesk',
      bodyFamily: 'Inter',
      headingStack: "'Space Grotesk', 'Archivo Black', 'Helvetica Neue', Arial, sans-serif",
      bodyStack: INTER,
      href: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700;800&display=swap',
    },
    tokens: {
      primary: '#0A0A0A',
      primaryHover: '#1F1F1F',
      onPrimary: '#FFFFFF',
      accent: '#C8FF2E',
      accentSoft: '#EEFFC2',
      onAccent: '#0A0A0A',
      bg: '#FFFFFF',
      surface: '#F4F4F2',
      surfaceRaised: '#FFFFFF',
      text: '#0A0A0A',
      textMuted: '#5E5E5E',
      border: '#E2E2DF',
      productBg: '#ECECE8',
      productBgAlt: '#0A0A0A',
      success: '#108A4E',
      danger: '#D92D20',
      radiusSm: '4px',
      radiusMd: '10px',
      radiusLg: '18px',
      radiusPill: '999px',
      shadowSm: '0 1px 2px rgba(0,0,0,.08)',
      shadowMd: '0 12px 28px -14px rgba(0,0,0,.30)',
      shadowLg: '0 30px 60px -26px rgba(0,0,0,.40)',
      shadowContact: '0 28px 32px -24px rgba(0,0,0,.65)',
      maxWidth: '1180px',
    },
    suggestFor: [
      'deporte y fitness',
      'deportes',
      'fitness',
      'gimnasio',
      'salud y deporte',
      'herramientas',
      'automotriz',
      'carros y motos',
      'camping',
      'computadores y portátiles',
      'computadores y portatiles',
      'tecnologia',
      'tecnología',
      'electronica',
      'electrónica',
    ],
  },

  /* ---------------------------------------------------------------- */
  'soft-wellness': {
    id: 'soft-wellness',
    name: 'Soft Wellness',
    tagline: 'Salvia y arena, esquinas muy redondeadas y formas orgánicas. Salud y bienestar.',
    dark: false,
    uppercaseHeadings: false,
    organicShapes: true,
    glass: false,
    gradients: true,
    fonts: {
      headingFamily: 'Fraunces',
      bodyFamily: 'Inter',
      headingStack: "'Fraunces', Georgia, serif",
      bodyStack: INTER,
      href: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap',
    },
    tokens: {
      primary: '#2F4F43',
      primaryHover: '#223B32',
      onPrimary: '#F7F4EC',
      accent: '#8FA98A',
      accentSoft: '#DFE8DA',
      onAccent: '#1F3328',
      bg: '#F7F4EC',
      surface: '#EDE7DA',
      surfaceRaised: '#FFFFFF',
      text: '#23302A',
      textMuted: '#61736A',
      border: '#DCD3C2',
      productBg: '#E3EADF',
      productBgAlt: '#EFE4D4',
      success: '#2F6B4F',
      danger: '#A6453C',
      radiusSm: '14px',
      radiusMd: '24px',
      radiusLg: '36px',
      radiusPill: '999px',
      shadowSm: '0 1px 2px rgba(35,48,42,.05)',
      shadowMd: '0 14px 34px -16px rgba(35,48,42,.20)',
      shadowLg: '0 34px 70px -30px rgba(35,48,42,.26)',
      shadowContact: '0 24px 30px -20px rgba(35,48,42,.45)',
      maxWidth: '1140px',
    },
    suggestFor: [
      'salud y bienestar',
      'salud',
      'bienestar',
      'cuidado personal',
      'mascotas',
      'bebes',
      'bebés',
      'bebes y maternidad',
      'cocina',
      'organizacion',
      'organización',
    ],
  },

  /* ---------------------------------------------------------------- */
  'dark-tech': {
    id: 'dark-tech',
    name: 'Dark Tech',
    tagline: 'Fondo casi negro, degradado violeta-azul y tarjetas glass. Cursos y digitales.',
    dark: true,
    uppercaseHeadings: false,
    organicShapes: false,
    glass: true,
    gradients: true,
    fonts: {
      headingFamily: 'Space Grotesk',
      bodyFamily: 'Inter',
      headingStack: "'Space Grotesk', 'Inter', Helvetica, Arial, sans-serif",
      bodyStack: INTER,
      href: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap',
    },
    tokens: {
      primary: '#7C5CFF',
      primaryHover: '#6A48F5',
      onPrimary: '#FFFFFF',
      accent: '#30D5C8',
      accentSoft: 'rgba(124,92,255,.16)',
      onAccent: '#05060F',
      bg: '#0B0B12',
      surface: '#11121C',
      surfaceRaised: 'rgba(255,255,255,.045)',
      text: '#ECEDF5',
      textMuted: '#9A9CB4',
      border: 'rgba(255,255,255,.12)',
      productBg: '#161729',
      productBgAlt: '#1D1B36',
      success: '#2BD48B',
      danger: '#FF6B6B',
      radiusSm: '10px',
      radiusMd: '18px',
      radiusLg: '28px',
      radiusPill: '999px',
      shadowSm: '0 1px 2px rgba(0,0,0,.4)',
      shadowMd: '0 18px 40px -18px rgba(0,0,0,.75)',
      shadowLg: '0 40px 90px -34px rgba(0,0,0,.9)',
      shadowContact: '0 30px 40px -26px rgba(0,0,0,.95)',
      maxWidth: '1160px',
    },
    suggestFor: [
      'cursos',
      'curso',
      'musica',
      'música',
      'programacion',
      'programación',
      'marketing',
      'diseño gráfico',
      'diseno grafico',
      'fotografia',
      'fotografía',
      'idiomas',
      'educacion',
      'educación',
      'megapacks digitales',
      'libros',
      'general',
    ],
  },
};

export const THEME_LIST: Theme[] = [
  THEMES['clean-luxe'],
  THEMES['bold-sport'],
  THEMES['soft-wellness'],
  THEMES['dark-tech'],
];

export const THEME_IDS: ThemeId[] = THEME_LIST.map((t) => t.id);

function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Sugiere el tema según la categoría y el tipo del producto. */
export function suggestTheme(category: string, kind: string): ThemeId {
  if (kind === 'digital') return 'dark-tech';
  const c = norm(category);
  for (const theme of THEME_LIST) {
    if (theme.suggestFor.some((k) => norm(k) === c)) return theme.id;
  }
  for (const theme of THEME_LIST) {
    if (theme.suggestFor.some((k) => c.includes(norm(k)) || norm(k).includes(c))) return theme.id;
  }
  return 'clean-luxe';
}

/** Mezcla el tema con el acento personalizado elegido en el panel. */
export function resolveTheme(id: ThemeId, accentOverride?: string | null): Theme {
  const base = THEMES[id] ?? THEMES['clean-luxe'];
  if (!accentOverride) return base;
  const accent = accentOverride.trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accent)) return base;
  return {
    ...base,
    tokens: {
      ...base.tokens,
      accent,
      accentSoft: hexToRgba(accent, base.dark ? 0.18 : 0.14),
      onAccent: contrastOn(accent),
      ...(base.dark ? { primary: accent, primaryHover: shade(accent, -12), onPrimary: contrastOn(accent) } : {}),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Utilidades de color                                                 */
/* ------------------------------------------------------------------ */

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Luminancia relativa (WCAG). */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

/** Devuelve negro o blanco según cuál cumple mejor contraste AA. */
export function contrastOn(hex: string): string {
  return luminance(hex) > 0.45 ? '#0A0A0A' : '#FFFFFF';
}

export function shade(hex: string, percent: number): string {
  const { r, g, b } = hexToRgb(hex);
  const f = (v: number) => {
    const out = Math.round(v + (percent / 100) * 255);
    return Math.max(0, Math.min(255, out));
  };
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Variables CSS listas para inyectar en `:root`. */
export function themeCssVars(theme: Theme): string {
  const t: ThemeTokens = theme.tokens;
  const entries: Array<[string, string]> = [
    ['--lf-primary', t.primary],
    ['--lf-primary-hover', t.primaryHover],
    ['--lf-on-primary', t.onPrimary],
    ['--lf-accent', t.accent],
    ['--lf-accent-soft', t.accentSoft],
    ['--lf-on-accent', t.onAccent],
    ['--lf-bg', t.bg],
    ['--lf-surface', t.surface],
    ['--lf-surface-raised', t.surfaceRaised],
    ['--lf-text', t.text],
    ['--lf-text-muted', t.textMuted],
    ['--lf-border', t.border],
    ['--lf-product-bg', t.productBg],
    ['--lf-product-bg-alt', t.productBgAlt],
    ['--lf-success', t.success],
    ['--lf-danger', t.danger],
    ['--lf-radius-sm', t.radiusSm],
    ['--lf-radius-md', t.radiusMd],
    ['--lf-radius-lg', t.radiusLg],
    ['--lf-radius-pill', t.radiusPill],
    ['--lf-shadow-sm', t.shadowSm],
    ['--lf-shadow-md', t.shadowMd],
    ['--lf-shadow-lg', t.shadowLg],
    ['--lf-shadow-contact', t.shadowContact],
    ['--lf-max', t.maxWidth],
    ['--lf-font-heading', theme.fonts.headingStack],
    ['--lf-font-body', theme.fonts.bodyStack],
    ['--lf-heading-transform', theme.uppercaseHeadings ? 'uppercase' : 'none'],
    ['--lf-heading-ls', theme.uppercaseHeadings ? '-0.01em' : '-0.025em'],
  ];
  return entries.map(([k, v]) => `  ${k}: ${v};`).join('\n');
}
