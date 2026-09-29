/**
 * Vistos recientemente — sin backend ni cuenta.
 *
 * Cada ficha de producto que el visitante abre se guarda (id) en
 * localStorage, y la portada los muestra como "Vistos recientemente".
 * Es dato REAL del propio visitante: si no vio nada, la sección no se
 * dibuja (antes que inventar un historial).
 */

const CLAVE = 'tienda:vistos';
const MAX = 8;

export function registrarVisto(id: string | number): void {
  try {
    const idStr = String(id);
    const actual = leerVistos().filter((x) => x !== idStr);
    actual.unshift(idStr);
    localStorage.setItem(CLAVE, JSON.stringify(actual.slice(0, MAX)));
  } catch {
    /* modo privado o sin storage: simplemente no hay historial */
  }
}

export function leerVistos(): string[] {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return [];
    const lista = JSON.parse(crudo);
    return Array.isArray(lista) ? lista.map(String).filter(Boolean).slice(0, MAX) : [];
  } catch {
    return [];
  }
}
