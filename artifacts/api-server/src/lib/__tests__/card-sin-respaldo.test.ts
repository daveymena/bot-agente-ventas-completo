import { describe, it, expect } from "vitest";
import { cardConRespaldo } from "../conversation-engine";

/**
 * La ficha del producto equivocado, en el primer mensaje de un lead PAGO.
 *
 * Dos conversaciones reales, las dos de gente que llegó por un anuncio que se
 * pagó:
 *
 *   cliente: "información"   → el bot le mandó un Cojín Moto Viajero
 *   cliente: "key"           → el bot le mandó [CARD: LIQUID FIBRA]
 *
 * Ninguno de los dos nombró un producto y ninguno tenía uno en la
 * conversación. El parser de `agent.ts` corregía la card cuando el servidor SÍ
 * identificaba un producto, pero cuando no identificaba nada aceptaba el id que
 * escribía el modelo solo por existir en el catálogo. Que un id exista no
 * quiere decir que corresponda.
 *
 * La regla: sin nada que la respalde, no va ficha. Se manda el texto del
 * modelo y listo. Contestar de más es recuperable; mostrarle el producto
 * equivocado a alguien que acaba de hacer clic en un anuncio, no.
 */

const base = {
  nombreElegido: "COJIN MOTO VIAJERO",
  textoDelCliente: "información",
  productoDelMensajeId: null,
  currentProductId: null,
  esFlujoDePago: false,
};

describe("Una ficha necesita algo que la respalde", () => {
  it("los dos casos reales quedan bloqueados", () => {
    expect(cardConRespaldo(base)).toBe(false);
    expect(cardConRespaldo({ ...base, nombreElegido: 'LIQUID FIBRA "DESINTOXICACION"', textoDelCliente: "key" })).toBe(false);
  });

  it("un saludo o una pregunta genérica tampoco alcanzan", () => {
    for (const t of ["hola", "buenas", "info por favor", "cuánto cuesta", "más información", "quiero saber precio"]) {
      expect(cardConRespaldo({ ...base, textoDelCliente: t }), t).toBe(false);
    }
  });

  it("si el servidor identificó el producto, la ficha pasa", () => {
    // Ese caso ya lo cubre el paso 0 del parser, que además IMPONE el id
    // correcto por encima del que eligió el modelo.
    expect(cardConRespaldo({ ...base, productoDelMensajeId: 42 })).toBe(true);
  });

  it("si hay un producto en la conversación, la ficha pasa", () => {
    // "sí, dale", "cuánto vale", "cómo lo recibo" se refieren a ESE producto.
    // Bloquear acá rompería el cierre, que es justo donde se cobra.
    expect(cardConRespaldo({ ...base, textoDelCliente: "sí dale", currentProductId: 42 })).toBe(true);
  });

  it("en el flujo de pago nunca se toca la ficha", () => {
    // La ficha del pago lleva los enlaces de MercadoPago y PayPal. Quitársela
    // a alguien que está por transferir es sacarle el medio de pago de la mano.
    expect(cardConRespaldo({ ...base, textoDelCliente: "ya voy a pagar", esFlujoDePago: true })).toBe(true);
  });

  it("si el cliente nombró algo del producto, pasa aunque el emparejador falle", () => {
    // La salida para apodos y medias palabras: el emparejador exige umbrales,
    // esto solo pide que la palabra esté en el nombre. Sin esto, un typo que el
    // emparejador no alcanza costaría la ficha aunque el modelo acertara.
    expect(cardConRespaldo({ ...base, nombreElegido: "CURSO DE PIANO COMPLETO", textoDelCliente: "quiero el de piano" })).toBe(true);
    expect(cardConRespaldo({ ...base, nombreElegido: "COJIN MOTO VIAJERO", textoDelCliente: "el cojin para la moto" })).toBe(true);
  });

  it("una palabra genérica que aparece en el nombre NO respalda nada", () => {
    // Media docena de productos se llaman "CURSO DE ...". Aceptar "curso"
    // como respaldo es volver al bug: el modelo elige cualquiera y pasa.
    expect(cardConRespaldo({ ...base, nombreElegido: "CURSO DE PIANO COMPLETO", textoDelCliente: "quiero un curso" })).toBe(false);
    expect(cardConRespaldo({ ...base, nombreElegido: "MEGAPACK COMPLETO 81 EN 1", textoDelCliente: "el megapack" })).toBe(false);
  });

  it("una palabra suelta de tres letras no respalda nada", () => {
    // "key" tiene 3 letras y entra en cualquier lado. El umbral es 4.
    expect(cardConRespaldo({ ...base, nombreElegido: "KEYNOTE PRO", textoDelCliente: "key" })).toBe(false);
  });
});

describe("pedir el catálogo SÍ respalda mostrar un producto", () => {
  // El candado mide el respaldo por "¿nombró ESTE producto?", y el que
  // pregunta "¿qué cursos tienen?" no nombra ninguno: quiere ver todos.
  //
  // Medido con el agente entero el 2026-09-06:
  //   cliente: "que cursos tienen?"
  //   motor:   📚 "El cliente pide ver el catálogo - mostrar opciones"
  //   modelo:  "¡Claro, te muestro lo que tenemos! 👇 [CARD: 1]"
  //   cliente recibe: "¡Claro, te muestro lo que tenemos!"   <- sin nada
  //
  // Le anunciaban un catálogo que nunca llegaba, y es de los primeros
  // mensajes que manda cualquier cliente.
  const base = {
    nombreElegido: "DISEÑO GRÁFICO",
    textoDelCliente: "que cursos tienen?",
    productoDelMensajeId: null,
    currentProductId: null,
    esFlujoDePago: false,
  };

  it("con pidioVerCatalogo la ficha viaja", () => {
    expect(cardConRespaldo({ ...base, pidioVerCatalogo: true })).toBe(true);
  });

  it("sin él sigue descartándose, que es lo que evita el producto al azar", () => {
    expect(cardConRespaldo({ ...base, pidioVerCatalogo: false })).toBe(false);
    expect(cardConRespaldo(base as any)).toBe(false);
  });
});
