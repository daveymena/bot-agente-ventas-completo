/**
 * Utilidades de formato — español de Colombia, moneda COP.
 */

/** `60000` -> `$60.000` */
export function cop(value: number | string | null | undefined): string {
  const n = toNumber(value);
  if (n === null) return '';
  const rounded = Math.round(n);
  return '$' + rounded.toLocaleString('es-CO', { maximumFractionDigits: 0 }).replace(/,/g, '.');
}

/** `"60000.00"` -> `60000`. Tolera `"$ 60.000"`, `"60,000"`, number, null. */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  // "60000.00" (formato API) vs "60.000" (formato CO)
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  let normalized = cleaned;
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  if (lastDot > -1 && lastComma > -1) {
    // el último separador es el decimal
    normalized = lastDot > lastComma
      ? cleaned.replace(/,/g, '')
      : cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastComma > -1) {
    const decimals = cleaned.length - lastComma - 1;
    normalized = decimals === 3 ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
  } else if (lastDot > -1) {
    const decimals = cleaned.length - lastDot - 1;
    // "60.000" en Colombia son 60 mil, no 60 con 3 decimales
    if (decimals === 3) normalized = cleaned.replace(/\./g, '');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function toNumberOr(value: unknown, fallback: number): number {
  const n = toNumber(value);
  return n === null ? fallback : n;
}

/** Porcentaje de ahorro redondeado hacia abajo. */
export function discountPercent(price: number, compareAt?: number | null): number {
  if (!compareAt || compareAt <= price) return 0;
  return Math.floor(((compareAt - price) / compareAt) * 100);
}

/** Redondea a múltiplos de mil "bonitos": 71.400 -> 71.900 */
export function prettyPrice(value: number): number {
  if (value <= 0) return 0;
  if (value < 10000) return Math.round(value / 100) * 100;
  const thousands = Math.floor(value / 1000);
  return thousands * 1000 + 900;
}

export function slugify(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'landing';
}

/** Escapa texto para insertarlo en HTML. */
export function esc(input: unknown): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapa para atributos de JS embebido en HTML (JSON.stringify seguro). */
export function jsonForScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Quita emojis del inicio y del texto (para los diseños sin emoji). */
export function stripEmoji(text: string): string {
  return (text || '')
    .replace(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{E0020}-\u{E007F}\u{1F1E6}-\u{1F1FF}]/gu,
      ''
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Devuelve el primer emoji del texto, si lo hay. */
export function leadingEmoji(text: string): string | null {
  const m = (text || '').match(
    /^\s*([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}][\u{FE0F}\u{200D}\u{1F300}-\u{1FAFF}]*)/u
  );
  return m ? m[1] : null;
}

/** Primera letra en mayúscula respetando el resto. */
export function capitalize(text: string): string {
  const t = (text || '').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Corta un texto en N caracteres sin partir palabras. */
export function truncate(text: string, max: number): string {
  const t = (text || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:\s]+$/, '') + '…';
}

/** Parte una descripción larga en frases limpias. */
export function sentences(text: string): string[] {
  return (text || '')
    .replace(/\r/g, '')
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

/** Título legible: convierte GRITOS EN MAYÚSCULA a Capital Normal. */
export function humanTitle(name: string): string {
  const raw = (name || '').trim();
  if (!raw) return '';
  const letters = raw.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
  const uppers = letters.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '').length;
  if (letters.length > 3 && uppers / letters.length > 0.8) {
    return raw
      .toLowerCase()
      .split(/\s+/)
      .map((w) => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(' ');
  }
  return raw;
}

/** Fecha larga en español: "1 de octubre de 2026". */
export function longDate(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
}

/** `+2.355` */
export function compactNumber(n: number): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: 0 }).replace(/,/g, '.');
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}
