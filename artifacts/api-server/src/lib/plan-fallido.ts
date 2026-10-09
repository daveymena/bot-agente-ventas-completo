/**
 * Un plan aprobado que FALLA no termina en "no quedó".
 *
 * El dueño (08-10): "Atlas que no se me pegue, que sea versátil, que no
 * simplemente venga a decirme que no quedó sino que lo esté solucionando, y
 * que sea real". Hasta hoy el cierre era "⚠️ El plan terminó con errores" y
 * ahí moría el turno: el dueño tenía que adivinar qué pasó y volver a pedir.
 *
 * Ahora, si la falla es de las que Atlas puede arreglar (un dato mal pasado,
 * una ciudad que Meta no reconoce, una foto que no descarga), el turno sigue
 * solo: diagnostica con lecturas y trae la corrección (que, si toca algo
 * real, vuelve a pasar por el sí del dueño). Si la falla depende del DUEÑO
 * (Facebook desconectado, sin saldo, permisos), insistir es girar en vacío:
 * se le dice qué tiene que hacer él.
 */

const DEPENDE_DEL_DUENO =
  /(no est[aá] conectad|desconectad|token|sesi[oó]n (venci|expir)|permis|permission|sin saldo|sin cr[eé]dito|m[eé]todo de pago|payment method|cuenta (publicitaria )?(deshabilitada|restringida|bloqueada)|account (disabled|restricted)|verific(a|ar) tu (cuenta|negocio))/i;

export interface FallaDePlan {
  /** true = Atlas sigue solo a diagnosticar y corregir. */
  seResuelveSolo: boolean;
  /** Lo que se le muestra al dueño debajo del resultado. */
  linea: string;
}

export function queHacerConLaFalla(errores: string[]): FallaDePlan {
  const texto = errores.join(" | ");
  if (DEPENDE_DEL_DUENO.test(texto)) {
    return {
      seResuelveSolo: false,
      linea: "🔑 Esto depende de algo de tu cuenta (conexión, permisos o saldo): arreglando eso lo vuelvo a hacer de una. Arriba está el motivo exacto.",
    };
  }
  return {
    seResuelveSolo: true,
    linea: "🔧 No lo dejo así: estoy revisando la causa y te traigo la corrección en un momento.",
  };
}
