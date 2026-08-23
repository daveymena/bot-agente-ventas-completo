/**
 * RECUPERACIÓN DE VENTAS ABANDONADAS.
 *
 * El caso que resuelve: alguien llegó de un anuncio pago, pidió el precio,
 * pidió la forma de pago — y no pagó. Hoy ese lead se queda quieto en la base
 * hasta que le toque un seguimiento genérico de su etapa: "¡Hola! 😊 ¿Cómo va
 * el proceso?". El clic ya se pagó y se pierde entero.
 *
 * Dos piezas, las dos de lógica pura para poder probarlas:
 *  1. Reconocer que ES un abandono y no otra cosa.
 *  2. Escribir un mensaje que se note que sabe de qué habla.
 *
 * Lo que NO hace, y es deliberado: no inventa descuentos, ni cupos, ni
 * urgencia. Es la misma regla del resto del motor. Un "última oportunidad" que
 * no existe cierra una venta y quema al cliente para siempre.
 */

export interface EstadoDelLead {
  /** Etapa de la conversación: closing/negotiating son las de intención alta. */
  etapa: string | null;
  /** pending | confirmed | rejected | null */
  estadoDePago: string | null;
  /** Horas desde el último mensaje del cliente. */
  horasSinEscribir: number;
  /** ¿El agente le llegó a mostrar precio o medios de pago? */
  vioPrecioOPago: boolean;
}

/**
 * Ventana para considerar abandonada una intención de compra.
 *
 * Menos de 3 horas es apurar a alguien que puede estar cocinando. Más de 7
 * días ya no es recuperar una venta caliente: es escribirle a un desconocido,
 * y ahí el mensaje molesta y arriesga el número.
 */
export const HORAS_MINIMAS = 3;
export const HORAS_MAXIMAS = 7 * 24;

/** Etapas donde el cliente ya mostró que quería comprar. */
const ETAPAS_DE_INTENCION = new Set(["closing", "negotiating", "qualified", "objection_handling"]);

export function esAbandonoDeCompra(e: EstadoDelLead): boolean {
  // Si ya pagó no hay nada que recuperar; si el pago fue rechazado, eso es
  // otro problema (y otro mensaje) que no es este.
  if (e.estadoDePago === "confirmed") return false;

  // Tiene que haber llegado lejos: alguien que solo saludó no "abandonó" nada.
  const llegoLejos = ETAPAS_DE_INTENCION.has(String(e.etapa || "")) || e.vioPrecioOPago;
  if (!llegoLejos) return false;

  return e.horasSinEscribir >= HORAS_MINIMAS && e.horasSinEscribir <= HORAS_MAXIMAS;
}

export interface ContextoDeRecuperacion {
  /** Nombre real del producto que estaba mirando. Sin esto no se escribe. */
  producto?: string | null;
  /** Tipo de objeción que ya había puesto, si la hubo. */
  objecion?: string | null;
  /** Para variar el texto entre contactos y no repetir el mismo string. */
  semilla?: string;
}

/**
 * Mensaje de recuperación con contexto.
 *
 * Devuelve null a propósito cuando no se sabe qué producto estaba mirando: sin
 * eso, lo único que sale es "¿sigues interesado?", que es exactamente el
 * mensaje que el spec prohíbe y el que hace que la gente bloquee el número.
 * Mejor no escribir que escribir vacío.
 */
export function mensajeDeRecuperacion(ctx: ContextoDeRecuperacion): string | null {
  const producto = String(ctx.producto || "").trim();
  if (!producto) return null;

  // Si ya había puesto una objeción, el mensaje la toma en vez de ignorarla:
  // volver con el mismo argumento que no funcionó no funciona la segunda vez.
  const porObjecion: Record<string, string[]> = {
    price: [
      `Quedamos con ${producto} pendiente por el precio. Si querés lo vemos de nuevo con calma, sin compromiso.`,
      `Sé que el precio de ${producto} te hizo dudar. ¿Te sirve si te cuento bien qué incluye para que decidas?`,
    ],
    trust: [
      `Quedó pendiente ${producto}. Si te quedó alguna duda de cómo funciona, preguntame lo que sea.`,
      `Sobre ${producto}: cualquier cosa que quieras verificar antes de decidir, decime y te la muestro.`,
    ],
    timing: [
      `Me quedó ${producto} pendiente de tu lado. ¿Lo retomamos ahora o preferís más adelante?`,
      `¿Seguimos con ${producto} o lo dejamos para otro momento? Cualquiera de las dos me sirve.`,
    ],
  };

  const generales = [
    `Quedamos a mitad de camino con ${producto} 😊 ¿Te ayudo a terminarlo?`,
    `Vi que quedó pendiente ${producto}. Si te falta algún dato para decidir, preguntame.`,
    `¿Seguimos con ${producto}? Si algo no te cerró, contame qué fue.`,
    `Te escribo por ${producto}, que quedó a medias. ¿Lo retomamos?`,
    `Quedó ${producto} sin cerrar. ¿Hay algo puntual que te frene?`,
    `Sobre ${producto}: quedé esperando tu respuesta. ¿Lo vemos?`,
  ];

  const opciones = (ctx.objecion && porObjecion[ctx.objecion]) || generales;

  // Derivado de la semilla y no al azar: dos contactos distintos casi nunca
  // reciben el mismo texto, que es lo que hace que WhatsApp bloquee el número.
  const semilla = String(ctx.semilla || "");
  if (!semilla) return opciones[0]!;
  let h = 0;
  for (let i = 0; i < semilla.length; i++) h = (h * 31 + semilla.charCodeAt(i)) >>> 0;
  return opciones[h % opciones.length]!;
}
