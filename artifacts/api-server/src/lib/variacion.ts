/**
 * Variación de textos fijos.
 *
 * Por qué existe: WhatsApp marca como spam las cuentas que mandan el mismo
 * texto una y otra vez, y eso es lo que más rápido hace que bloqueen un
 * número. Una plantilla fija -- mismo saludo, mismo cierre, mismos
 * encabezados en cada ficha -- es exactamente ese patrón.
 *
 * Vivía suelto dentro de whatsapp.ts; se sacó acá porque los saludos
 * hardcodeados del agente sufren el mismo problema y no pueden importar
 * whatsapp.ts sin crear un ciclo (whatsapp -> orquestador -> agent).
 */

/**
 * Elige una variante de forma ESTABLE para una misma semilla.
 *
 * Estable y no aleatoria a propósito: dentro de una misma conversación el
 * texto no debe bailar entre mensajes (quedaría raro), pero SÍ tiene que
 * diferir entre clientes.
 */
export function variante(opciones: string[], semilla: string): string {
  if (opciones.length === 0) return "";
  // FNV-1a con mezcla final, en vez del clásico h*31.
  //
  // Con h*31 los teléfonos reales caían casi todos en la misma opción: los
  // números de un mismo país comparten prefijo y largo, 31 ≡ 3 (mod 4) y los
  // últimos caracteres dominan el resultado -- medido con 5 clientes reales,
  // 4 recibieron el mismo texto. La variación existía pero no se notaba, que
  // para el caso es lo mismo que no tenerla.
  let h = 0x811c9dc5;
  for (let i = 0; i < semilla.length; i++) {
    h ^= semilla.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Mezcla final (avalancha): reparte los bits altos hacia los bajos, que son
  // los únicos que sobreviven al módulo.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return opciones[Math.abs(h) % opciones.length]!;
}

/**
 * Como `variante`, pero garantiza no repetir un texto ya usado.
 *
 * Para el saludo de retorno la semilla sola no alcanza: el mismo cliente
 * vuelve varias veces y la semilla (su teléfono) no cambia, así que recibía
 * SIEMPRE la misma frase. Visto en producción el 17-08-2026: "¡Hey Duvier
 * Mena! Qué bueno verte de nuevo 😊" idéntica a las 13:40 y a las 15:51.
 *
 * `evitar` es el último texto que se le mandó: si la variante elegida coincide,
 * se pasa a la siguiente.
 */
export function varianteDistintaDe(opciones: string[], semilla: string, evitar?: string | null): string {
  if (opciones.length === 0) return "";
  const elegida = variante(opciones, semilla);
  const previo = (evitar || "").trim();
  if (!previo || elegida.trim() !== previo) return elegida;
  const i = opciones.indexOf(elegida);
  return opciones[(i + 1) % opciones.length]!;
}
