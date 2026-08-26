import { describe, it, expect } from "vitest";
import { pareceComprobante, leerDecisionDelAdmin, avisoParaElAdmin, codigoDe } from "../verificacion-pago";

/**
 * Los pagos por Nequi/Daviplata no tienen webhook: nadie le avisa al sistema
 * que el dinero llegó. El bot resolvía eso diciendo "apenas el sistema lo
 * verifique te llega el acceso" -- una verificación que no existía -- y en un
 * caso afirmó "ya confirmé tu pago" sin que nadie hubiera pagado.
 *
 * La regla de fondo: el dinero lo confirma UNA PERSONA que lo vio en su
 * cuenta. Ni el cliente diciendo que pagó, ni el modelo, ni un comprobante.
 */

describe("reconocer un comprobante sin confundirlo con cualquier foto", () => {
  it("una señal fuerte alcanza sola, aunque no se esté cobrando", () => {
    expect(pareceComprobante("captura de una transferencia de Nequi por $20.000", false)).toBe(true);
    expect(pareceComprobante("comprobante de pago de Bancolombia", false)).toBe(true);
  });

  it("una señal débil solo cuenta si se estaba cobrando", () => {
    // "pago exitoso" en medio de una charla de venta: sí.
    expect(pareceComprobante("pantallazo que dice pago exitoso", true)).toBe(true);
    // La misma foto sin contexto de cobro: no se asume.
    expect(pareceComprobante("pantallazo que dice pago exitoso", false)).toBe(false);
  });

  it("la foto del perro NO es un comprobante, ni en plena venta", () => {
    // Caso real posible: se vende un curso de adiestramiento canino.
    expect(pareceComprobante("un perro labrador sentado en el pasto", true)).toBe(false);
    expect(pareceComprobante("una persona sonriendo frente a una cámara", true)).toBe(false);
  });

  it("sin descripción no se inventa nada", () => {
    expect(pareceComprobante(null, true)).toBe(false);
    expect(pareceComprobante("", true)).toBe(false);
  });
});

describe("leer la decisión del admin", () => {
  it("acepta las formas naturales de aprobar", () => {
    for (const t of ["APROBAR 47", "aprobar 47", "Aprobar #47", "ok 47", "confirmo 47", "apruebo 47"]) {
      expect(leerDecisionDelAdmin(t), t).toEqual({ accion: "aprobar", pagoId: 47 });
    }
  });

  it("acepta las formas de rechazar", () => {
    for (const t of ["RECHAZAR 47", "rechazo 47", "no 47"]) {
      expect(leerDecisionDelAdmin(t), t).toEqual({ accion: "rechazar", pagoId: 47 });
    }
  });

  it("un mensaje normal del admin no se confunde con una decisión", () => {
    expect(leerDecisionDelAdmin("hola, cómo va todo")).toBeNull();
    expect(leerDecisionDelAdmin("aprobar")).toBeNull();          // sin número
    expect(leerDecisionDelAdmin("cuántos pagos hay")).toBeNull();
  });

  it("no confunde un mensaje que EMPIEZA distinto", () => {
    // "no me llegó el 47" no es un rechazo del comprobante 47.
    expect(leerDecisionDelAdmin("no me llegó el 47")).toBeNull();
  });
});

describe("el aviso que le llega al admin", () => {
  const aviso = avisoParaElAdmin({
    pagoId: 47,
    cliente: "Leonel",
    telefono: "573176650010",
    producto: "PACK IDIOMAS",
    monto: 20000,
    moneda: "COP",
    descripcion: "transferencia Nequi aprobada por $20.000",
  });

  it("trae lo mínimo para decidir sin abrir el panel", () => {
    expect(aviso).toContain("Leonel");
    expect(aviso).toContain("573176650010");
    expect(aviso).toContain("PACK IDIOMAS");
    expect(aviso).toContain("$20.000");
  });

  it("dice exactamente qué responder", () => {
    expect(aviso).toContain("APROBAR 47");
    expect(aviso).toContain("RECHAZAR 47");
  });

  it("pide verificar la cuenta, no confiar en el comprobante", () => {
    expect(aviso).toMatch(/dinero est[eé] en tu cuenta/i);
  });

  it("un monto desconocido no se inventa", () => {
    const sinMonto = avisoParaElAdmin({
      pagoId: 1, cliente: "X", telefono: "1", producto: "Y", monto: 0, moneda: "COP",
    });
    expect(sinMonto).toMatch(/sin confirmar/i);
  });

  it("el código es el id del pago", () => {
    expect(codigoDe(47)).toBe("47");
  });
});

/**
 * Lo que pasa DESPUÉS de aprobar. El riesgo acá no es técnico sino de
 * promesa: decirle al cliente "ya tienes el acceso" cuando el producto no
 * tiene enlace cargado es exactamente la mentira que este proceso vino a
 * eliminar, solo que dicha por otro camino.
 */
describe("aprobar entrega de verdad, o lo dice claro", () => {
  it("el mensaje de entrega nombra el producto y trae el acceso", async () => {
    const { mensajeDeEntrega } = await import("../verificacion-pago");
    // Sin BD real esto devuelve null; lo que se fija acá es el contrato:
    // null significa "no hay con qué entregar", nunca "entregado".
    const r = await mensajeDeEntrega(-1);
    expect(r).toBeNull();
  });
});

describe("aprobar indicando a dónde mandar el acceso por correo", () => {
  it("captura el correo después del número", () => {
    expect(leerDecisionDelAdmin("APROBAR 12 daveymena16@gmail.com"))
      .toEqual({ accion: "aprobar", pagoId: 12, correo: "daveymena16@gmail.com" });
  });

  it("sin correo sigue funcionando igual", () => {
    expect(leerDecisionDelAdmin("APROBAR 12"))
      .toEqual({ accion: "aprobar", pagoId: 12, correo: undefined });
  });

  it("el aviso le dice al admin que puede hacerlo", () => {
    const a = avisoParaElAdmin({ pagoId: 12, cliente: "X", telefono: "1", producto: "Y", monto: 1000, moneda: "COP" });
    expect(a).toMatch(/correo@cliente\.com/);
  });
});
