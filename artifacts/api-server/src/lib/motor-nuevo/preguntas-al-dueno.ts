/**
 * Preguntas del cliente que el vendedor no pudo responder y le pasó al dueño
 * (herramienta preguntar_al_dueno). Quedan en product_knowledge con
 * respuesta NULL; el dueño las responde una vez y el vendedor las usa siempre.
 *
 * Lo único que vive acá es lo que se puede probar sin base: no avisar dos
 * veces la misma pregunta y armar los disparadores con los que
 * consultar_conocimiento la va a encontrar la próxima vez.
 */
import type { ItemDeConocimiento } from "./herramientas";

const N = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const VACIAS = new Set(
  "que como cual cuando donde quien por para con sin los las del una uno unos unas este esta eso esa hay tiene tienen puedo pueden ustedes usted ellos ser son mas muy tambien".split(" "),
);

/** Palabras con contenido de la pregunta (las que la distinguen). */
export function palabrasDe(pregunta: string): string[] {
  return [...new Set(N(pregunta).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2 && !VACIAS.has(w)))];
}

/** Disparadores separados por coma, como los carga el dueño (nunca regex). */
export function disparadoresDe(pregunta: string): string {
  return palabrasDe(pregunta).slice(0, 6).join(", ");
}

/** ¿Ya está registrada (con o sin respuesta) una pregunta equivalente? */
export function esPreguntaRepetida(pregunta: string, existentes: ItemDeConocimiento[]): boolean {
  const nuevas = palabrasDe(pregunta);
  if (!nuevas.length) return true;
  return existentes.some((k) => {
    const suyas = new Set(palabrasDe(`${k.pregunta} ${k.disparadores.join(" ")}`));
    const comunes = nuevas.filter((w) => suyas.has(w)).length;
    return comunes / nuevas.length >= 0.7;
  });
}
