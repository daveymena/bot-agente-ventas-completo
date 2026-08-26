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

describe("cada respuesta deja una puerta abierta", () => {
  it("el precio invita a saber qué incluye", () => {
    expect(invitacionDe("precio", false)).toMatch(/incluye/i);
  });

  it("la info invita a preguntar el precio", () => {
    expect(invitacionDe("info", false)).toMatch(/precio/i);
  });

  it("después de dar el medio de pago, pide el comprobante", () => {
    expect(invitacionDe("pago_transferencia", false)).toMatch(/comprobante/i);
  });

  it("la invitación de entrega cambia según sea físico o digital", () => {
    expect(invitacionDe("entrega", true)).toMatch(/pedido/i);
    expect(invitacionDe("entrega", false)).toMatch(/acceso/i);
  });

  it("ninguna sección se queda sin invitación", () => {
    for (const s of ["precio", "pago", "pago_transferencia", "pago_link", "info", "entrega", "completa"] as const) {
      expect(invitacionDe(s, false).length).toBeGreaterThan(0);
    }
  });
});
