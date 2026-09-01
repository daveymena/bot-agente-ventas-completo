import { describe, it, expect } from "vitest";
import { seccionQueCorresponde, invitacionDe } from "../ficha-parcial";

/**
 * Los mensajes de abajo son REALES, sacados de las conversaciones 1 y 19 de
 * producción. A todos, el bot les contestaba con la ficha entera.
 */
const sec = (mensaje: string, intent?: string, fichaYaEnviada = false) =>
  seccionQueCorresponde({ mensaje, intent, fichaYaEnviada });

describe("preguntó el precio → va el precio, no el folleto", () => {
  it("mensajes reales de producción", () => {
    expect(sec("cual es el valor  o precio ?")).toBe("precio");
    expect(sec("y el precio cual es?")).toBe("precio");
    expect(sec("cuanto cuesta")).toBe("precio");
    expect(sec("cuanto vale el curso de Excel?")).toBe("precio");
    expect(sec("a como lo tienes")).toBe("precio");
  });

  it("si preguntó precio Y cómo pagar, va el pago (que ya trae el precio)", () => {
    expect(sec("cuanto vale y como pago?")).toBe("pago");
  });
});

describe("preguntó por un medio concreto → solo ese medio", () => {
  it("Nequi es lo que quiere, no el catálogo de medios", () => {
    expect(sec("Como pago por nequi")).toBe("pago_transferencia");
    expect(sec("me pasas el daviplata?")).toBe("pago_transferencia");
    expect(sec("puedo hacer transferencia?")).toBe("pago_transferencia");
  });

  it("tarjeta o PSE van por el link", () => {
    expect(sec("puedo pagar con tarjeta?")).toBe("pago_link");
    expect(sec("aceptan PSE?")).toBe("pago_link");
    expect(sec("tienen paypal")).toBe("pago_link");
  });

  it("el medio concreto le gana a la pregunta genérica", () => {
    // "cómo pago por Nequi" cumple los dos patrones: quiere el número.
    expect(sec("como pago por nequi")).toBe("pago_transferencia");
  });
});

describe("preguntó cómo pagar, sin nombrar medio → los medios", () => {
  it("mensajes reales", () => {
    expect(sec("Cual es la forma de pago")).toBe("pago");
    expect(sec("como lo puedo adquirir.")).toBe("pago");
    expect(sec("como puedo pagar?")).toBe("pago");
  });

  it("por intención, cuando el texto no lo dice", () => {
    expect(sec("listo lo quiero", "payment_intent")).toBe("pago");
    expect(sec("dale", "confirmation")).toBe("pago");
  });
});

describe("preguntó qué es → info, y SIN precio", () => {
  it("el precio queda para la pregunta siguiente", () => {
    expect(sec("Que trae el producto que contenido ?")).toBe("info");
    expect(sec("de que trata el curso")).toBe("info");
    expect(sec("me cuentas del pack?")).toBe("info");
    expect(sec("para que sirve el Renovador Negro Perfecto?")).toBe("info");
  });
});

describe("preguntó por la entrega → entrega", () => {
  it("mensajes reales", () => {
    expect(sec("como lo voy a recibir ?")).toBe("entrega");
    expect(sec("cuantos dias tarda en llegarme?")).toBe("entrega");
    expect(sec("me lo mandan a mi casa?")).toBe("entrega");
  });
});

describe("no vuelve a volcar la ficha entera", () => {
  it("con la ficha ya enviada, una pregunta suelta no la repite", () => {
    expect(sec("y eso como es?", undefined, true)).not.toBe("completa");
  });

  it("primer contacto con el producto: ahí sí se presenta", () => {
    expect(sec("me interesa el curso de piano")).toBe("completa");
  });
});

describe("cada respuesta apunta a algo que el cliente todavía no vio", () => {
  it("tras el precio, invita a ver qué incluye", () => {
    // La curiosidad sale de que quede algo concreto por saber, no de
    // adjetivos ni de urgencia inventada.
    expect(invitacionDe("precio", false)).toMatch(/incluye|trae|adentro/i);
  });

  it("tras la info, ofrece el video para ampliar", () => {
    // Antes invitaba a preguntar el precio. Ahora el video: es lo que de
    // verdad amplia, y es el momento en que el cliente pidio mas detalle.
    expect(invitacionDe("info", false)).toMatch(/video/i);
  });

  it("tras dar el medio de pago, pide el comprobante", () => {
    // Acá no se genera curiosidad: se cierra, y se dice el paso exacto.
    expect(invitacionDe("pago_transferencia", false)).toMatch(/comprobante|soporte/i);
  });

  it("la invitación de entrega cambia según sea físico o digital", () => {
    expect(invitacionDe("entrega", true)).toMatch(/pedido|pedimos/i);
    expect(invitacionDe("entrega", false)).toMatch(/acceso|arrancamos/i);
  });

  it("ninguna sección se queda sin invitación", () => {
    for (const s of ["precio", "pago", "pago_transferencia", "pago_link", "info", "entrega", "completa"] as const) {
      expect(invitacionDe(s, false).length, s).toBeGreaterThan(0);
    }
  });

  it("NO promete nada que el bot no pueda saber", () => {
    // "te va a encantar" / "el más vendido" son inventos: ya hubo que sacarlos
    // de las respuestas (ver supervisor.ts).
    const prohibido = /te va a encantar|el m[aá]s vendido|no te lo pierdas|[uú]ltima oportunidad|garantizado/i;
    for (const s of ["precio", "pago", "pago_transferencia", "pago_link", "info", "entrega", "completa"] as const) {
      for (const fisico of [true, false]) {
        for (const semilla of ["573001", "573002", "573003", ""]) {
          expect(invitacionDe(s, fisico, semilla), s).not.toMatch(prohibido);
        }
      }
    }
  });

  it("dos clientes distintos no reciben siempre el mismo guion", () => {
    const vistos = new Set(
      ["573001", "573002", "573003", "573004", "573005", "573006"].map((t) => invitacionDe("precio", false, t)),
    );
    expect(vistos.size).toBeGreaterThan(1);
  });

  it("el mismo cliente recibe siempre el mismo, para no sonar inestable", () => {
    expect(invitacionDe("info", false, "573136174267")).toBe(invitacionDe("info", false, "573136174267"));
  });
});

/**
 * El video es la carnada mas fuerte que hay: una promesa se discute, ver la
 * primera clase no. Por eso se OFRECE en la presentacion y se manda cuando el
 * cliente dice que si -- mandarlo antes lo gasta con quien todavia no mostro
 * interes, y mandarlo dos veces no aporta.
 */
const secV = (mensaje: string, extra: any = {}) =>
  seccionQueCorresponde({ mensaje, ...extra });

describe("el video se manda en el momento preciso, no en cualquiera", () => {
  it("cuando lo piden con sus palabras", () => {
    for (const m of ["tienes algun video?", "muestrame como son las clases", "hay demo?", "me lo enseñas?"]) {
      expect(secV(m), m).toBe("video");
    }
  });

  it("un 'dale' suelto SOLO cuenta si se lo ofrecimos", () => {
    expect(secV("dale", { ofrecimosVideo: true })).toBe("video");
    // Sin la oferta previa, "dale" es otra cosa (confirmar, seguir).
    expect(secV("dale", { ofrecimosVideo: false })).not.toBe("video");
  });

  it("no se remanda si ya se envio", () => {
    expect(secV("tienes video?", { videoYaEnviado: true })).not.toBe("video");
    expect(secV("dale", { ofrecimosVideo: true, videoYaEnviado: true })).not.toBe("video");
  });

  it("la presentacion OFRECE el video, no lo da por hecho", () => {
    expect(invitacionDe("completa", false)).toMatch(/video|clases/i);
  });

  it("pedir detalle lleva al video, que es lo que amplia", () => {
    expect(invitacionDe("info", false)).toMatch(/video/i);
  });

  it("despues de verlo, se pregunta que le parecio", () => {
    expect(invitacionDe("video", false)).toMatch(/pareci/i);
  });
});

describe("no ofrece video en los cursos que no lo tienen", () => {
  it("con video, el cierre lo ofrece", () => {
    expect(invitacionDe("completa", false, "", true)).toMatch(/video|clases/i);
    expect(invitacionDe("info", false, "", true)).toMatch(/video/i);
  });

  it("SIN video, el cierre apunta a otra cosa real", () => {
    // 75 de los 84 cursos no tienen video cargado. Ofrecerlo ahi es prometer
    // algo que no existe -- el mismo error de siempre, pero en el cierre.
    for (const s of ["completa", "info"] as const) {
      expect(invitacionDe(s, false, "", false), s).not.toMatch(/video/i);
      expect(invitacionDe(s, false, "", false).length, s).toBeGreaterThan(0);
    }
  });

  it("las demas secciones no cambian por el video", () => {
    expect(invitacionDe("pago_transferencia", false, "", false)).toMatch(/comprobante|soporte/i);
    expect(invitacionDe("precio", false, "", false)).toMatch(/incluye|trae|adentro/i);
  });
});

/**
 * El cierre no ofrece lo que el cliente ACABA de leer.
 *
 * El admin lo señaló el 2026-09-01: "sigue diciendo qué incluye cuando en la
 * información principal ya lo dijo, y el de piano igual".
 *
 * El parámetro para evitarlo (`yaVioContenido`) ya existía, con un comentario
 * describiendo este mismo defecto -- y `whatsapp.ts` nunca se lo pasaba, así
 * que siempre valía false. Un arreglo escrito a medias: la mitad difícil
 * hecha, la fácil olvidada, y el bug intacto. Esta prueba cubre la mitad que
 * faltaba.
 */
describe("el cierre no repite lo que ya se mostró", () => {
  it("si ya vio las características, el precio NO ofrece contárselas", () => {
    const c = invitacionDe("precio", false, "sem", true, true);
    expect(c).not.toMatch(/qu[eé] (incluye|trae|viene)/i);
  });

  it("y en su lugar ofrece el video, que es lo único que le falta", () => {
    expect(invitacionDe("precio", false, "sem", true, true)).toMatch(/video|por dentro|pedacito/i);
  });

  it("sin video cargado, ofrece resolver dudas en vez de prometer uno", () => {
    // Nunca se ofrece lo que no se puede entregar.
    const c = invitacionDe("precio", false, "sem", false, true);
    expect(c).not.toMatch(/video/i);
    expect(c).toMatch(/duda|puntual/i);
  });

  it("si TODAVÍA no las vio, sí se las ofrece", () => {
    expect(invitacionDe("precio", false, "sem", true, false)).toMatch(/incluye|trae|adentro/i);
  });
});
