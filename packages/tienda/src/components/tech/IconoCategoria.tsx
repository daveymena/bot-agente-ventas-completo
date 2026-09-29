import {
  Laptop, Printer, BookOpen, Package, Cpu, Headphones, Camera, Gamepad2,
  Smartphone, Tv, Watch, Speaker, Keyboard, Wrench, ShoppingBag,
} from 'lucide-react';

/**
 * Icono por categoría, por palabra clave del nombre.
 *
 * Las categorías las crea el dueño con texto libre ("Computadores",
 * "Impresoras POS", "Cursos"), así que no hay ids estables: se busca por
 * palabra. Si nada coincide, un paquete genérico — nunca se deja sin icono.
 */
const REGLAS: Array<[RegExp, typeof Laptop]> = [
  [/portatil|laptop|comput|pc\b|todo en uno|escritorio/i, Laptop],
  [/impresora|impresi|tinta|laser|pos\b|multifunc/i, Printer],
  [/curso|academia|clase|ingles|piano|idioma|marketing/i, BookOpen],
  [/celular|smartphone|telefono|tablet|iphone/i, Smartphone],
  [/audifono|headphone|audio|parlante|bocina|jbl|microfono/i, Headphones],
  [/camara|fotograf|cam\b|gopro/i, Camera],
  [/gaming|juego|consola|playstation|control|gamer/i, Gamepad2],
  [/reloj|smartwatch|watch|wearable/i, Watch],
  [/tv|televisor|pantalla|monitor/i, Tv],
  [/procesador|cpu|ram|disco|ssd|tarjeta|board|fuente/i, Cpu],
  [/parlante|speaker|sonido/i, Speaker],
  [/mouse|raton|teclado|keyboard/i, Keyboard],
  [/repuesto|herramienta|cable|cargador|tinta|toner/i, Wrench],
];

export function iconoDeCategoria(nombre: string): typeof Laptop {
  const n = String(nombre || '');
  for (const [re, Icono] of REGLAS) {
    if (re.test(n)) return Icono;
  }
  return Package;
}

/** Icono suelto para "ver todo" / accesorios. */
export { ShoppingBag };
