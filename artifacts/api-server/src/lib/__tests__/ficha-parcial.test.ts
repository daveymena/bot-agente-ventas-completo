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

  it("tras la info, invita a preguntar el precio", () => {
    expect(invitacionDe("info", false)).toMatch(/precio|cuesta|cu[aá]nto/i);
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
