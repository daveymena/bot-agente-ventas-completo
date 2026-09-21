/**
 * RETIRAR CON EL V1 — Este módulo pertenece al motor de ventas anterior.
 *
 * Sigue vivo porque es el camino por defecto (`MOTOR_VENDEDOR=v1`). Cuando el
 * motor de `lib/motor-nuevo/` atienda a todos los negocios y el diagnóstico
 * salga limpio, esto se va. Mientras el negocio esté en v1, no se le agregan
 * capas nuevas: los arreglos van en el v2. Ver TRASPASO_2026-09-21.md.
 */
/**
 * ============================================================
 * LAS OBJECIONES QUE FRENAN LA VENTA
 * ============================================================
 *
 * Del precio ya se ocupa `defenderElPrecio`. Faltaban las otras cuatro, que
 * son las que aparecen en toda conversación de venta y donde hoy el modelo
 * improvisa cada vez:
 *
 *   · "lo voy a pensar"      — la más común y la peor manejada
 *   · "¿es confiable?"       — miedo a que sea una estafa
 *   · "¿me sirve a mí?"      — no se ve reflejado
 *   · "ahora no tengo tiempo"
 *
 * ── La regla que las gobierna a todas ────────────────────────────────────
 *
 * Ninguna se contesta con adjetivos. "Somos serios", "es la mejor inversión",
 * "miles de alumnos" son exactamente lo que dice un estafador, y además esta
 * app ya rechaza la prueba social inventada (ver `detectarInventos`).
 *
 * Se contestan con HECHOS del negocio: cómo se entrega, qué garantía hay, qué
 * incluye. Si el negocio no cargó esos datos, la función devuelve `null` en vez
 * de rellenar -- prometer una garantía que no existe es peor que no tenerla.
 *
 * ── Y ninguna presiona ───────────────────────────────────────────────────
 *
 * "Últimos cupos", "solo por hoy" y la urgencia inventada están prohibidas en
 * este sistema desde antes (`ESCASEZ` en sales-playbook.ts). A quien dice "lo
 * voy a pensar", apurarlo lo pierde: ya dijo que no está listo. Lo que sí
 * funciona es dejarle algo concreto para pensar y la puerta abierta.
 */

export type TipoDeObjecion = "lo_pienso" | "desconfia" | "no_se_si_me_sirve" | "sin_tiempo";

export interface DatosParaResponder {
  producto?: { name?: string | null; features?: string[] | null; kind?: string | null } | null;
  /** La garantía REAL del negocio, si la cargó. Nunca se inventa. */
  garantia?: string | null;
  /** Cómo se entrega de verdad. */
  entrega?: string | null;
  /** Si este producto tiene video de muestra cargado. */
  tieneVideo?: boolean;
}

/**
 * ⚠️ Los patrones van SIN acentos, y el mensaje se normaliza antes de comparar.
 *
 * En JavaScript `\w` y `\b` son ASCII: "déjame" no matchea `deja\w*` porque la
 * é no es carácter de palabra, y `me servirá\b` falla porque después de la á no
 * hay borde de palabra.
 *
 * Es la CUARTA vez que este proyecto tropieza con lo mismo en un solo día: el
 * detector de llamado a la acción, el de afirmación suelta y dos de acá. En vez
 * de escaparlo caso por caso, se le saca el acento al texto UNA vez y los
 * patrones se escriben planos. Un error que vuelve cuatro veces no se arregla
 * con cuidado: se arregla quitándole el lugar donde aparecer.
 */
const sinAcentos = (t: string) =>
  String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const PATRONES: Array<{ tipo: TipoDeObjecion; patron: RegExp }> = [
  {
    tipo: "lo_pienso",
    // "lo voy a pensar" tiene mil formas y casi ninguna dice "pensar" sola.
    patron:
      /(lo (voy a |vo a )?pensar|dejame pensar|dejeme pensar|me lo pienso|lo pienso|lo consulto|tengo que (verlo|pensarlo|consultarlo)|despues te (digo|escribo|aviso)|luego te (digo|escribo)|mas adelante|ahorita no|por ahora no|tal vez despues|lo tengo en cuenta)/,
  },
  {
    tipo: "desconfia",
    patron:
      /(es (real|confiable|seguro|de verdad|verdad)|sera (real|confiable|seguro)|no sera (estafa|robo)|estafa|scam|como se que|como confio|desconfio|desconfianza|me da (miedo|cosa)|y si no me llega|no me van a robar|son (serios|legales))/,
  },
  {
    tipo: "no_se_si_me_sirve",
    patron:
      /(me servira|me sirve|sera para mi|es para mi|yo no se nada|soy (principiante|nuevo|nueva)|desde cero puedo|nunca he|no tengo (experiencia|conocimiento)|a mi edad|servira en mi caso)/,
  },
  {
    tipo: "sin_tiempo",
    patron:
      /(no tengo tiempo|ando (corto|ocupado|ocupada)|estoy muy (ocupado|ocupada)|cuando lo (haria|voy a ver)|no me alcanza el tiempo|trabajo todo el dia)/,
  },
];

/** Qué está frenando al cliente, si es una de las conocidas. */
export function detectarObjecion(mensaje: string): TipoDeObjecion | null {
  const m = sinAcentos(mensaje);
  for (const { tipo, patron } of PATRONES) if (patron.test(m)) return tipo;
  return null;
}

/**
 * Qué contestar, armado con lo que el negocio REALMENTE tiene.
 *
 * Devuelve `null` cuando no hay con qué contestar de verdad: es preferible
 * dejar que el modelo conteste con el contexto normal a mandar una frase hecha
 * que promete lo que no hay.
 */
export function responderObjecion(tipo: TipoDeObjecion, d: DatosParaResponder): string | null {
  const nombre = d.producto?.name?.trim();
  const rasgos = (Array.isArray(d.producto?.features) ? d.producto!.features! : [])
    .map((f) => String(f || "").trim())
    .filter(Boolean);

  switch (tipo) {
    case "lo_pienso": {
      // Nada de apurar. Ya dijo que no está listo: presionarlo lo pierde. Se le
      // deja algo concreto que mirar y se cierra sin pedirle nada.
      if (d.tieneVideo) {
        return (
          "Tranquilo, pensalo con calma 🙏 Te dejo el video para que lo veas por dentro y decidas con más información. " +
          "Cualquier duda que te surja, escribime y te la resuelvo."
        );
      }
      if (rasgos.length) {
        return (
          `Claro, pensalo con calma 🙏 Para que lo tengas presente: ${rasgos.slice(0, 2).join(" y ")}. ` +
          "Si te queda alguna duda puntual, escribime y te la resuelvo."
        );
      }
      return "Tranquilo, pensalo con calma 🙏 Si te surge cualquier duda, escribime y te la resuelvo.";
    }

    case "desconfia": {
      // La desconfianza NO se contesta diciendo "somos serios": eso lo dice
      // igual el que estafa. Se contesta con hechos que el cliente puede
      // verificar, y si no los hay cargados, no se contesta.
      const partes: string[] = [];
      if (d.garantia) partes.push(`la garantía es ${d.garantia}`);
      if (d.entrega) partes.push(`la entrega funciona así: ${d.entrega}`);
      if (!partes.length) return null;
      return (
        `Te entiendo perfecto, y hacés bien en preguntar 🙏 Para que estés tranquilo: ${partes.join(", y ")}. ` +
        "Lo que necesites verificar antes de decidir, preguntámelo."
      );
    }

    case "no_se_si_me_sirve": {
      // La respuesta correcta acá NO es afirmar que le sirve: es averiguar para
      // qué lo quiere. Afirmarlo sin saberlo es prometer un resultado, que es
      // justo lo que produce devoluciones.
      return (
        "Buena pregunta, y prefiero decírtelo con certeza antes que venderte algo que no te sirva 🙏 " +
        `¿Para qué lo querés usar exactamente? Con eso te digo si ${nombre ? `"${nombre}"` : "esto"} te sirve o si te conviene otro.`
      );
    }

    case "sin_tiempo": {
      // Solo se puede afirmar el ritmo propio si el producto es a demanda. Para
      // uno físico esta objeción significa otra cosa y no se fuerza respuesta.
      const esDigital = String(d.producto?.kind || "digital") !== "physical";
      if (!esDigital) return null;
      return (
        "Te entiendo 🙏 Justo por eso queda a tu ritmo: lo ves cuando puedas, en el orden que quieras, " +
        "y no vence. No hay horarios ni clases en vivo que perder."
      );
    }
  }
}
