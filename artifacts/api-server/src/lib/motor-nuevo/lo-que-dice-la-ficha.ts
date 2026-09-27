/**
 * ============================================================
 * LO QUE LA FICHA LE MOSTRÓ AL CLIENTE
 * ============================================================
 *
 * Chat real del dueño (27-09-2026), curso de piano, motor v2:
 *
 *   cliente: tienes curso de piano
 *   bot:     [ficha info] "🎼 CURSO DE PIANO COMPLETO… 19 módulos con 283
 *             clases en video HD · cerca de 19 horas de contenido ·
 *             partituras y ejercicios descargables…"
 *   cliente: que viene en el contenido del curso?
 *   bot:     "Lo que sí quiero confirmarte con el equipo es el detalle
 *             exacto de los módulos y las horas, para no darte un dato a
 *             medias."
 *
 * El bot desmintió su propia ficha de dos mensajes antes. Y, visto desde
 * adentro, tenía razón en dudar: ÉL no escribió esa ficha. La arma el
 * servidor leyendo la descripción del producto (ver `construirSeccion` en
 * whatsapp.ts), y de ese contenido el modelo no veía NADA:
 *
 *   · el CATÁLOGO del prompt es compacto a propósito (`#id · nombre ·
 *     precio`): con 200 productos, mandar las descripciones enteras empuja
 *     la conversación fuera del contexto;
 *   · y en el historial la ficha quedaba guardada como
 *     `[ficha info de Curso de Piano]` — una marca de que algo salió, sin
 *     un solo dato de lo que decía.
 *
 * O sea: el modelo sabía que había mandado una ficha y no sabía qué decía.
 * Con esa información, dudar es la conducta correcta. El defecto no es que
 * el modelo sea tímido: es que le falta el dato.
 *
 * Este módulo saca de la descripción del producto los MISMOS puntos que la
 * ficha le puso al cliente —con `leerFicha`, el lector que usa el render, no
 * un parser paralelo que se desincronice— y los deja en dos lugares:
 *
 *   1. el bloque del turno, para el producto en foco: así el modelo puede
 *      contestar "¿qué trae?" sin inventar y sin desdecirse;
 *   2. lo que se guarda en el historial cuando sale una ficha, para que el
 *      turno siguiente —y el panel del dueño— vean qué se le mostró.
 *
 * No inventa nada. Si la descripción está vacía, devuelve vacío y el agente
 * sigue como antes: diciendo con honestidad que lo confirma.
 */
import { leerFicha } from "../ficha-del-producto";
import type { Producto } from "./herramientas";

/** Tope de puntos. Más de 8 renglones no es un recordatorio: es la ficha otra vez. */
const MAX_PUNTOS = 8;
/** Tope de caracteres del resumen que va al historial. */
const MAX_RESUMEN = 700;

/**
 * Los puntos que la ficha muestra, en el orden en que el dueño los escribió.
 * Primero la frase de presentación y después cada línea con su emoji propio,
 * sin el emoji (acá son datos, no maqueta).
 */
export function puntosDeLaFicha(p: Pick<Producto, "name" | "description">): string[] {
  const ficha = leerFicha(p.description, String(p.name || ""));
  const puntos: string[] = [];
  if (ficha.intro) puntos.push(ficha.intro.trim());
  for (const punto of ficha.puntos) {
    const texto = String(punto.texto || "").trim();
    if (texto) puntos.push(texto);
  }
  // Una descripción de un solo párrafo largo entra como intro y ya: no se
  // parte en frases a la fuerza. El dueño escribió un párrafo, no una lista.
  return puntos.filter((t, i, arr) => arr.indexOf(t) === i).slice(0, MAX_PUNTOS);
}

/**
 * Los hechos de la ficha en UNA línea, para el historial.
 *
 * Va pegado a la marca `[ficha …]` que el adaptador ya guardaba. El destino
 * es doble y los dos importan: el modelo lo relee en el turno siguiente, y
 * el dueño lo ve en el panel (antes veía "Acá te dejo el valor" sin ningún
 * número y creía que el bot había fallado).
 */
export function resumenDeLaFicha(p: Pick<Producto, "name" | "description">): string {
  const puntos = puntosDeLaFicha(p);
  if (!puntos.length) return "";
  let texto = puntos.join(" · ").replace(/\s+/g, " ").trim();
  if (texto.length > MAX_RESUMEN) {
    const corte = texto.lastIndexOf(" · ", MAX_RESUMEN);
    texto = (corte > 120 ? texto.slice(0, corte) : texto.slice(0, MAX_RESUMEN)).trim() + "…";
  }
  return texto;
}

/**
 * ¿Esta sección le puso al cliente el CONTENIDO del producto delante?
 *
 * Es el mismo criterio que usa el render (`estaFichaMuestraContenido` en
 * whatsapp.ts): si los dos lados no coinciden, lo guardado miente sobre lo
 * que el cliente leyó. "precio" o "pago" no muestran contenido; la ficha sí.
 */
export function laSeccionMuestraContenido(seccion: string): boolean {
  return seccion === "completa" || seccion === "info";
}

/**
 * El bloque del prompt con la ficha del producto EN FOCO.
 *
 * Va en la parte del turno (después del historial), no en el prefijo fijo:
 * cambia con el foco y no puede romperle el caché al proveedor (ver
 * `partesDelPrompt`).
 *
 * Dice tres cosas, y las tres hacen falta:
 *   · estos datos son REALES (para que no los desmienta);
 *   · explícalos con tus palabras, no los pegues (para que no repita la
 *     ficha que el cliente ya tiene arriba);
 *   · lo que NO esté acá sigue sin poder afirmarse (para que el dato nuevo
 *     no se convierta en permiso para inventar el resto).
 */
export function bloqueDeLaFichaEnFoco(p: Pick<Producto, "name" | "description"> | null | undefined): string {
  if (!p) return "";
  const puntos = puntosDeLaFicha(p);
  if (!puntos.length) return "";
  return (
    `LO QUE DICE LA FICHA DE "${p.name}" (datos reales del catálogo, los mismos que el sistema le muestra al cliente):\n` +
    puntos.map((t) => `• ${t}`).join("\n") +
    `\nEsto lo puedes afirmar y explicar con tus palabras: es información del negocio, no tuya. ` +
    `Si te pregunta qué incluye o de qué trata, contéstale con esto en 2-4 frases; no lo pegues entero ni lo repitas como lista. ` +
    `NUNCA digas que tienes que confirmar algo que esté en esta lista. ` +
    `Lo que NO esté acá (garantía, plazos, certificados, acceso de por vida, soporte) sigue sin poder afirmarse.`
  );
}
