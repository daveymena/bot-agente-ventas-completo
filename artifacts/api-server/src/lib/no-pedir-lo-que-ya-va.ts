/**
 * ============================================================
 * NO PIDAS PERMISO PARA LO QUE YA VA EN EL MISMO ENVÍO
 * ============================================================
 *
 * ── La conversación que lo destapó ────────────────────────────────────────
 *
 * Producción, 2026-09-05 11:02. Los cuatro mensajes salieron en el MISMO
 * minuto, uno detrás del otro:
 *
 *   cliente: "Hola me interesa el cirso de piano"
 *   bot:     "...arranca desde cero y llega hasta nivel avanzado.
 *             ¿Quieres que te pase toda la info por acá?"     ← pide permiso
 *   bot:     [LA FICHA ENTERA]                                 ← no espera
 *   bot:     "¿Te paso el precio? 💰"                          ← pide permiso
 *   bot:     [EL VIDEO]                                        ← tampoco espera
 *
 * Preguntó dos veces y no respetó ninguna de las dos. El dueño lo describió
 * como "es como si repitieran el mismo trabajo siempre", y es exactamente eso:
 * la rutina *pedir permiso → mandarlo igual*, repetida, con el cliente sin
 * llegar nunca a contestar.
 *
 * ── Por qué pasa ──────────────────────────────────────────────────────────
 *
 * El texto lo escribe el modelo y la entrega la decide el servidor, y no se
 * hablan. El modelo redacta su preámbulo sin saber que la ficha ya está
 * enganchada detrás; el servidor manda la ficha sin leer lo que el modelo
 * acaba de escribir.
 *
 * ── Por qué se borra la pregunta y no se frena la entrega ─────────────────
 *
 * Las dos arreglan la contradicción. Se elige borrar la pregunta porque frenar
 * la entrega reintroduce un bug ya corregido dos veces en este repo --ofrecer
 * el contenido y no mandarlo, dejando al cliente esperando-- y agrega una vuelta
 * de conversación para entregar algo que el sistema ya decidió entregar.
 *
 * Y comercialmente es lo correcto: pedir permiso para algo que vas a mandar de
 * todos modos es teatro. El repo ya tomó esta decisión con el video, que antes
 * se ofrecía y ahora sale directo (ver `whatsapp.ts`, "EL VIDEO CIERRA LA
 * ENTREGA DEL CONTENIDO").
 *
 * ── Lo que NO toca ────────────────────────────────────────────────────────
 *
 * Solo se quita la pregunta que ofrece algo que YA VA en este mismo envío. La
 * pregunta que ofrece el paso SIGUIENTE --"¿Te paso el precio?" cuando el
 * precio no viaja acá-- se queda: es la que mantiene viva la conversación, y
 * sin ella el bot entrega y se calla.
 */

import { queOfrecioElBot, type LoOfrecido } from "./ficha-parcial";

export interface ParteDeEnvio {
  kind?: string | null;
  content?: string | null;
  /** La sección de ficha que va a mandar esta parte, si es una tarjeta. */
  seccion?: string | null;
}

/**
 * Qué va a recibir el cliente en ESTE envío, mirando las partes que salen.
 *
 * Se deriva de la `seccion` que ya lleva cada tarjeta, que es el dato que el
 * agente calculó y el que `construirSeccion` va a obedecer. Adivinar leyendo el
 * texto sería inventar una segunda verdad al lado de la que ya existe.
 */
export function loQueYaVa(partes: ParteDeEnvio[] | null | undefined): Set<LoOfrecido> {
  const va = new Set<LoOfrecido>();
  for (const p of partes || []) {
    if (p?.kind !== "card") continue;
    const s = String(p?.seccion || "");

    // "info" y "completa" entregan qué es y qué trae: eso es el contenido.
    if (s === "info" || s === "completa") {
      va.add("contenido");
      // Y arrastran el video: `estaFichaMuestraContenido` lo engancha al final
      // de esas dos secciones, así que ofrecerlo acá también sobra.
      va.add("video");
    }
    if (s === "video") va.add("video");
    if (s === "tienda") va.add("tienda");
    // La ficha "completa" trae el precio; "info" NO lo lleva a propósito.
    if (s === "precio" || s === "completa") va.add("precio");
    if (s === "pago" || s === "pago_transferencia" || s === "pago_link") va.add("pago");
  }
  return va;
}

/**
 * Corta el texto en frases, conservando el signo que las cierra.
 *
 * ⚠️ Solo por signos que CIERRAN. En español `¿` y `¡` ABREN, y partir por
 * ellos corta justo antes de lo que hay que evaluar: "¿Quieres...?" quedaba
 * como "¿" + "Quieres...?", y ese "¿" huérfano no ofrecía nada, sobrevivía al
 * filtro y se mandaba solo como mensaje. Lo encontró la prueba del texto que
 * queda vacío.
 */
function enFrases(texto: string): string[] {
  return texto.split(/(?<=[.!?…\n])/).filter((f) => f.length > 0);
}

/**
 * Saca del texto las preguntas que ofrecen algo que ya viaja en este envío.
 *
 * Se evalúa frase por frase --no el mensaje entero-- porque el preámbulo suele
 * traer información buena antes de la pregunta sobrante, y tirar el mensaje
 * completo perdería la parte que sí sirve.
 */
export function sinPedirPermiso(texto: string, yaVa: Set<LoOfrecido>): string {
  const original = String(texto || "");
  if (!original.trim() || yaVa.size === 0) return original;

  const quedan: string[] = [];
  for (const frase of enFrases(original)) {
    // Solo se examinan las frases que ofrecen: una afirmación cualquiera pasa
    // derecho. `queOfrecioElBot` ya distingue las dos formas --pregunta y
    // ofrecimiento afirmativo-- y está probada contra conversaciones reales.
    const ofrece = queOfrecioElBot(frase.trim());
    if (ofrece && yaVa.has(ofrece)) continue;
    quedan.push(frase);
  }

  // Los saltos de línea que quedaron colgando al sacar la última frase.
  return quedan.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export interface Revision {
  partes: ParteDeEnvio[];
  /** Cuántas preguntas sobrantes se quitaron. Para el registro. */
  quitadas: number;
}

/**
 * Revisa el envío completo.
 *
 * ⚠️ Una parte de texto que se queda vacía se ELIMINA. Mandar un mensaje en
 * blanco es peor que la pregunta que se quitó, y en WhatsApp además cuenta como
 * un envío más contra los topes anti-bloqueo.
 */
export function sinPreguntarLoQueYaVa(partes: ParteDeEnvio[] | null | undefined): Revision {
  const lista = partes || [];
  const yaVa = loQueYaVa(lista);
  if (yaVa.size === 0) return { partes: [...lista], quitadas: 0 };

  let quitadas = 0;
  const salida: ParteDeEnvio[] = [];

  for (const p of lista) {
    if (p?.kind !== "text" || !String(p?.content || "").trim()) {
      salida.push(p);
      continue;
    }
    const antes = String(p.content);
    const despues = sinPedirPermiso(antes, yaVa);
    if (despues === antes) {
      salida.push(p);
      continue;
    }
    quitadas++;
    if (despues.trim()) salida.push({ ...p, content: despues });
  }

  return { partes: salida, quitadas };
}
