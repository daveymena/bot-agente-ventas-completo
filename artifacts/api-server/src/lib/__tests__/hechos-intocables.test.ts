import { describe, it, expect } from "vitest";
import {
  montosDe, enlacesDe, cuentasDe, porcentajesDe,
  discrepancias, respetaLosHechos, entregaFinal,
} from "../hechos-intocables";

/**
 * La aduana entre "la IA redacta" y "el servidor manda los hechos".
 *
 * Los casos de abajo son los que este proyecto ya sufrio en produccion: un
 * precio inventado, una cuenta que no es la del negocio, un enlace cambiado y
 * un porcentaje sacado de la nada.
 */

const PLANTILLA_PAGO = [
  "💰 *$60.000 COP*",
  "",
  "🔹 *Tarjeta / PSE:*",
  "https://ventasproia.com/p/g3Qk92",
  "",
  "🔹 *Nequi/Daviplata:*",
  "📱 3136174267",
  "👤 Duvier Mena",
].join("\n");

describe("Extraer los hechos que la IA no puede tocar", () => {
  it("lee el monto sin importar como este escrito", () => {
    expect(montosDe("$60.000 COP")).toEqual(new Set(["60000"]));
    expect(montosDe("60000")).toEqual(new Set(["60000"]));
    expect(montosDe("$ 60,000 COP")).toEqual(new Set(["60000"]));
  });

  it("no confunde un año con un precio", () => {
    expect(montosDe("el curso se actualizo en 2026")).toEqual(new Set());
  });

  it("lee enlaces, cuentas y porcentajes", () => {
    expect(enlacesDe("mira https://ventasproia.com/p/124 ya")).toEqual(new Set(["ventasproia.com/p/124"]));
    expect(cuentasDe("Nequi 3136174267")).toEqual(new Set(["3136174267"]));
    expect(porcentajesDe("50% de descuento")).toEqual(new Set(["50"]));
  });
});

describe("La redaccion de la IA no puede cambiar un hecho", () => {
  it("deja pasar una redaccion distinta que respeta todo", () => {
    const propuesta = [
      "Te cuento: son $60.000 COP y lo puedes pagar como te quede mejor 🙌",
      "",
      "Con tarjeta o PSE aqui: https://ventasproia.com/p/g3Qk92",
      "O por Nequi/Daviplata al 3136174267, a nombre de Duvier Mena.",
    ].join("\n");
    expect(respetaLosHechos(PLANTILLA_PAGO, propuesta)).toBe(true);
    expect(entregaFinal(PLANTILLA_PAGO, propuesta)).toBe(propuesta);
  });

  it("rechaza el precio inventado (el caso real del 2026-08-26)", () => {
    const propuesta = PLANTILLA_PAGO.replace("$60.000 COP", "$149.000 COP");
    const d = discrepancias(PLANTILLA_PAGO, propuesta);
    expect(d).toContainEqual({ tipo: "monto", valor: "149000", falta: "inventado" });
    expect(d).toContainEqual({ tipo: "monto", valor: "60000", falta: "perdido" });
    expect(entregaFinal(PLANTILLA_PAGO, propuesta)).toBe(PLANTILLA_PAGO);
  });

  it("rechaza una cuenta que no es la del negocio", () => {
    const propuesta = PLANTILLA_PAGO.replace("3136174267", "3001234567");
    expect(entregaFinal(PLANTILLA_PAGO, propuesta)).toBe(PLANTILLA_PAGO);
  });

  it("rechaza un enlace cambiado", () => {
    const propuesta = PLANTILLA_PAGO.replace("g3Qk92", "otroCodigo");
    expect(entregaFinal(PLANTILLA_PAGO, propuesta)).toBe(PLANTILLA_PAGO);
  });

  it("rechaza un descuento inventado", () => {
    const propuesta = PLANTILLA_PAGO + "\n\n¡Y hoy tienes 50% de descuento!";
    expect(entregaFinal(PLANTILLA_PAGO, propuesta)).toBe(PLANTILLA_PAGO);
  });

  it("rechaza que se pierda el enlace de pago", () => {
    // Mas leve que inventar, pero igual de inservible: sin el enlace el
    // cliente no puede pagar.
    const propuesta = "Son $60.000 COP, escribeme y coordinamos 🙌 Nequi 3136174267";
    expect(entregaFinal(PLANTILLA_PAGO, propuesta)).toBe(PLANTILLA_PAGO);
  });
});

describe("Guardas de forma", () => {
  it("descarta una respuesta vacia o de una palabra", () => {
    expect(entregaFinal(PLANTILLA_PAGO, "")).toBe(PLANTILLA_PAGO);
    expect(entregaFinal(PLANTILLA_PAGO, "Ok")).toBe(PLANTILLA_PAGO);
    expect(entregaFinal(PLANTILLA_PAGO, null)).toBe(PLANTILLA_PAGO);
  });

  it("descarta el muro de texto, que es el defecto que se esta corrigiendo", () => {
    const muro = PLANTILLA_PAGO + " bla".repeat(400);
    expect(entregaFinal(PLANTILLA_PAGO, muro)).toBe(PLANTILLA_PAGO);
  });

  it("avisa por que se descarto, para que no falle en silencio", () => {
    const motivos: string[] = [];
    entregaFinal(PLANTILLA_PAGO, PLANTILLA_PAGO.replace("60.000", "999.000"), (m) => motivos.push(m));
    expect(motivos).toEqual(["la redaccion cambio hechos del servidor"]);
  });
});
