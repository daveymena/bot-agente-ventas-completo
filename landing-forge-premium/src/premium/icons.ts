/**
 * Set de íconos de línea (estilo Lucide), inline SVG.
 * Un solo set para todo el motor: nada de mezclar emojis dentro del diseño.
 */

type IconName =
  | 'check'
  | 'check-circle'
  | 'shield'
  | 'truck'
  | 'banknote'
  | 'package'
  | 'clock'
  | 'star'
  | 'star-filled'
  | 'heart'
  | 'zap'
  | 'target'
  | 'trending-up'
  | 'award'
  | 'sparkles'
  | 'whatsapp'
  | 'arrow-right'
  | 'arrow-down'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'play'
  | 'download'
  | 'smartphone'
  | 'monitor'
  | 'laptop'
  | 'graduation'
  | 'book'
  | 'infinity'
  | 'lock'
  | 'map-pin'
  | 'phone'
  | 'user'
  | 'home'
  | 'repeat'
  | 'gift'
  | 'thumbs-up'
  | 'message-circle'
  | 'credit-card'
  | 'calendar'
  | 'dumbbell'
  | 'leaf'
  | 'headphones'
  | 'settings'
  | 'layers'
  | 'list-checks'
  | 'quote'
  | 'plus'
  | 'minus'
  | 'x';

const PATHS: Record<IconName, string> = {
  check: '<path d="m20 6-11 11-5-5"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  shield: '<path d="M12 3 5 6v6c0 4.2 2.9 7.8 7 9 4.1-1.2 7-4.8 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  truck: '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  banknote: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  package: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9L12 3.5Z"/>',
  'star-filled': '<path fill="currentColor" stroke="none" d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9L12 3.5Z"/>',
  heart: '<path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20Z"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  'trending-up': '<path d="m3 17 6-6 4 4 7-7"/><path d="M15 8h5v5"/>',
  award: '<circle cx="12" cy="9" r="5.5"/><path d="m8.5 13.5-1.5 7 5-2.5 5 2.5-1.5-7"/>',
  sparkles: '<path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z"/><path d="M18.5 15.5 19.4 18l2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9.9-2.5Z"/>',
  whatsapp:
    '<path d="M20.5 11.6a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.6-4.5A8.4 8.4 0 1 1 20.5 11.6Z"/><path d="M9 9.3c.2-.6.5-.6.8-.6h.6c.2 0 .4 0 .6.5l.7 1.6c.1.3 0 .5-.1.7l-.4.5c-.1.2-.2.3 0 .6a6 6 0 0 0 2.7 2.3c.3.1.5.1.6 0l.6-.7c.2-.2.4-.2.6-.1l1.6.8c.3.1.4.3.4.5a1.9 1.9 0 0 1-1.3 1.6c-.5.2-1.2.3-3.4-.7a9.3 9.3 0 0 1-4-4c-.9-1.9-.6-2.6-.4-3Z"/>',
  'arrow-right': '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
  'arrow-down': '<path d="M12 4v15"/><path d="m6 13 6 6 6-6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 6 3.5-6 3.5v-7Z" fill="currentColor" stroke="none"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
  smartphone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  monitor: '<rect x="2.5" y="4" width="19" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>',
  laptop: '<rect x="4" y="5" width="16" height="10" rx="1.5"/><path d="M2 19h20"/>',
  graduation: '<path d="M12 4 2.5 9 12 14l9.5-5L12 4Z"/><path d="M6.5 11v4.5c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V11"/>',
  book: '<path d="M4 4.5A2 2 0 0 1 6 3h13v16H6a2 2 0 0 0-2 2V4.5Z"/><path d="M19 15H6a2 2 0 0 0-2 2"/>',
  infinity: '<path d="M8.5 9.5a3.5 3.5 0 1 0 0 5c1.6-1.4 2.3-2.5 3.5-2.5s1.9 1.1 3.5 2.5a3.5 3.5 0 1 0 0-5c-1.6 1.4-2.3 2.5-3.5 2.5s-1.9-1.1-3.5-2.5Z"/>',
  lock: '<rect x="4.5" y="10" width="15" height="10" rx="2"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
  'map-pin': '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  phone: '<path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5L17 13l4 1.5v3a2.5 2.5 0 0 1-2.7 2.5A16.5 16.5 0 0 1 3.5 5.7 2.5 2.5 0 0 1 6 3Z"/>',
  user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  home: '<path d="m3 11 9-7 9 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
  repeat: '<path d="M4 9a4 4 0 0 1 4-4h9"/><path d="m14 2 3 3-3 3"/><path d="M20 15a4 4 0 0 1-4 4H7"/><path d="m10 22-3-3 3-3"/>',
  gift: '<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v7h14v-7M12 8v12"/><path d="M12 8C9.5 8 7 7 7.5 5.2A2 2 0 0 1 11 4.4L12 8l1-3.6a2 2 0 0 1 3.5.8C17 7 14.5 8 12 8Z"/>',
  'thumbs-up': '<path d="M7 10v10H4V10h3Z"/><path d="M7 10.5 11 3a2.2 2.2 0 0 1 2.2 2.6L12.5 9H18a2 2 0 0 1 2 2.4l-1.3 6A2 2 0 0 1 16.7 19H7"/>',
  'message-circle': '<path d="M20.5 11.8a8 8 0 0 1-11.9 7L3.5 20.5l1.7-5A8 8 0 1 1 20.5 11.8Z"/>',
  'credit-card': '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  dumbbell: '<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>',
  leaf: '<path d="M20 4C9 4 4 9 4 15a5 5 0 0 0 5 5c6 0 11-5 11-16Z"/><path d="M4 20 14 10"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="2.5" y="14" width="4.5" height="6" rx="2"/><rect x="17" y="14" width="4.5" height="6" rx="2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M4.2 7.3 6.1 8.4M17.9 15.6l1.9 1.1M4.2 16.7l1.9-1.1M17.9 8.4l1.9-1.1"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  'list-checks': '<path d="M10 7h11M10 12h11M10 17h11"/><path d="m3 6.5 1.5 1.5L7 5.5M3 16.5 4.5 18 7 15.5"/>',
  quote: '<path d="M9.5 6C6.5 7.5 5 10 5 13v5h6v-6H8c0-2 .6-3.4 2.4-4.4L9.5 6Z" fill="currentColor" stroke="none"/><path d="M19 6c-3 1.5-4.5 4-4.5 7v5h6v-6h-3c0-2 .6-3.4 2.4-4.4L19 6Z" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6 18 18M18 6 6 18"/>',
};

export interface IconOptions {
  size?: number;
  stroke?: number;
  className?: string;
}

/** Devuelve el SVG inline del ícono. */
export function icon(name: IconName | string, options: IconOptions = {}): string {
  const path = PATHS[name as IconName];
  if (!path) return '';
  const size = options.size ?? 24;
  const stroke = options.stroke ?? 1.6;
  const cls = options.className ? ` class="${options.className}"` : '';
  return (
    `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true" focusable="false">${path}</svg>`
  );
}

export function hasIcon(name: string): boolean {
  return Boolean(PATHS[name as IconName]);
}

export const ICON_NAMES = Object.keys(PATHS) as IconName[];

/**
 * Elige un ícono coherente según el texto del beneficio.
 * Evita que todas las tarjetas tengan el mismo check.
 */
export function pickIconForText(text: string, index = 0): IconName {
  const t = (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const rules: Array<[RegExp, IconName]> = [
    [/envio|entrega|domicilio|llega|despacho/, 'truck'],
    [/pago|contra ?entrega|paga|efectivo|dinero|precio|cuota|addi|siste/, 'banknote'],
    [/garanti|devoluc|cambio|seguro|protec/, 'shield'],
    [/rapid|veloz|instant|inmediat|minuto|segundo/, 'zap'],
    [/resisten|durader|robust|calidad|material|acero|refor/, 'award'],
    [/comod|suave|ergonom|antidesliz|agarre|confort/, 'heart'],
    [/musculo|abdomen|fuerza|entren|ejercicio|fitness|gym|gimnasio|tonific/, 'dumbbell'],
    [/salud|bienestar|natural|relaj|descans|postura|espalda/, 'leaf'],
    [/celular|movil|telefono|smartphone|app/, 'smartphone'],
    [/computador|pc|laptop|portatil|escritorio/, 'laptop'],
    [/video|clase|modulo|leccion|curso|aprend/, 'graduation'],
    [/descarg|archivo|pdf|material/, 'download'],
    [/de por vida|ilimitad|permanente|siempre/, 'infinity'],
    [/soporte|asesor|whatsapp|chat|escrib/, 'message-circle'],
    [/tiempo|hora|dia|habil|rapidez|24|48/, 'clock'],
    [/compact|guardar|almacen|espacio|portatil|liviano/, 'package'],
    [/casa|hogar|sala|cocina|habitacion/, 'home'],
    [/regalo|obsequi|bono|gratis/, 'gift'],
    [/resultado|mejora|progreso|aumenta|crece/, 'trending-up'],
    [/facil|simple|sencillo|paso/, 'check-circle'],
    [/diseno|estilo|elegante|moderno|premium/, 'sparkles'],
    [/audio|sonido|musica|escuch/, 'headphones'],
    [/ajust|regul|configur|opcion|talla|color/, 'settings'],
  ];

  for (const [re, name] of rules) if (re.test(t)) return name;

  const fallback: IconName[] = ['check-circle', 'sparkles', 'target', 'award', 'zap', 'layers'];
  return fallback[index % fallback.length];
}
