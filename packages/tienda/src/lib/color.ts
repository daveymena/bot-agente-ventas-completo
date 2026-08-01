// La tienda usa un solo color de marca (config.primaryColor) para fondos,
// texto y botones, pero los estados hover necesitan un tono más oscuro.
// En vez de pedir dos colores al dueño de la tienda, se deriva el tono
// hover oscureciendo el primario -- así con un solo picker de color toda
// la tienda queda consistente.
export function darken(hex: string, amount = 0.15): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;

  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);

  const factor = 1 - amount;
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n * factor))).toString(16).padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Contraste automático (texto blanco o negro) sobre el color de marca --
// fórmula de luminancia perceptual estándar (YIQ), evita texto ilegible si
// el dueño elige un color de marca claro.
export function readableTextColor(hex: string): '#ffffff' | '#0f172a' {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#ffffff';

  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;

  return yiq >= 150 ? '#0f172a' : '#ffffff';
}
