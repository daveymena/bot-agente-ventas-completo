import { describe, it, expect } from "vitest";
import {
  nombreDeTransferencia,
  detectChosenPaymentMethod,
  tryPaymentSubIntentAnswer,
} from "../conversation-engine";

/**
 * El SaaS se vende a "cualquier tipo de negocio", y el bot le decía a todos
 * que transfirieran a *Nequi/Daviplata*.
 *
 * Son billeteras COLOMBIANAS. A un negocio mexicano, argentino, peruano o
 * español, el bot le mandaba a sus clientes a una app que en su país no
 * existe -- y lo hacía con el tono seguro de un dato verificado, que es la
 * peor forma de equivocarse frente a alguien que está por pagar.
 *
 * Estaba escrito a mano en tres lugares de `conversation-engine.ts`.
 */

describe("El medio de transferencia sale del negocio, no del país donde se escribió el código", () => {
  it("sin configurar, dice 'transferencia' -- cierto en todos lados", () => {
    // Lo importante es que NO inventa una marca. "Transferencia" es verdad en
    // cualquier país; "Nequi" solo en uno.
    expect(nombreDeTransferencia(undefined)).toBe("transferencia");
    expect(nombreDeTransferencia([])).toBe("transferencia");
    expect(nombreDeTransferencia(["", "  "])).toBe("transferencia");
  });

  it("usa las billeteras que el negocio configuró", () => {
    expect(nombreDeTransferencia(["Yape"])).toBe("Yape");
    expect(nombreDeTransferencia(["Nequi", "Daviplata"])).toBe("Nequi/Daviplata");
    expect(nombreDeTransferencia(["Pix"])).toBe("Pix");
    expect(nombreDeTransferencia(["Bizum"])).toBe("Bizum");
  });

  it("no lista media docena de medios en un mensaje de WhatsApp", () => {
    // Tres es lo que se lee de un vistazo en el teléfono; más es una lista.
    const r = nombreDeTransferencia(["A", "B", "C", "D", "E"]);
    expect(r.split("/")).toHaveLength(3);
  });
});

describe("Entender lo que el cliente eligió, en su país", () => {
  it("reconoce la billetera que el negocio configuró", () => {
    // Un negocio peruano cobra por Yape: "te pago por Yape" tiene que
    // entenderse igual que "por Nequi" en Colombia. Sin esto, el SaaS solo
    // entiende los medios de pago del país donde se escribió el código.
    expect(detectChosenPaymentMethod("te pago por Yape", ["Yape"])).toBe("transferencia");
    expect(detectChosenPaymentMethod("hago el pix ahora", ["Pix"])).toBe("transferencia");
  });

  it("sigue entendiendo los de siempre aunque no estén configurados", () => {
    // No se rompe lo que ya funcionaba para el negocio que existe hoy.
    expect(detectChosenPaymentMethod("pago por nequi")).toBe("nequi");
    expect(detectChosenPaymentMethod("prefiero daviplata")).toBe("daviplata");
  });

  it("un nombre de dos letras no dispara nada", () => {
    // Con billeteras cortas cualquier texto matchearía: "ya" contiene "ya".
    expect(detectChosenPaymentMethod("ya te aviso", ["ya"])).toBeNull();
  });

  it("si no eligió nada, no adivina", () => {
    expect(detectChosenPaymentMethod("hola, cuánto sale?", ["Yape"])).toBeNull();
  });
});

describe("La respuesta de pago que recibe el cliente", () => {
  it("un negocio peruano no manda a sus clientes a Nequi", () => {
    const r = tryPaymentSubIntentAnswer(
      "quiero pagar por transferencia",
      "Ana",
      "Curso de Piano",
      { number: "999888777", owner: "Comercio SAC", billeteras: ["Yape", "Plin"] },
    );
    expect(r?.matched).toBe(true);
    expect(r!.response).toContain("Yape/Plin");
    expect(r!.response).not.toContain("Nequi");
    expect(r!.response).not.toContain("Daviplata");
  });

  it("sin billeteras configuradas no nombra ninguna marca", () => {
    const r = tryPaymentSubIntentAnswer(
      "quiero pagar por transferencia",
      "Ana",
      "Curso de Piano",
      { number: "999888777", owner: "Comercio SAC" },
    );
    expect(r!.response).toContain("transferencia");
    expect(r!.response).not.toContain("Nequi");
  });

  it("pero si el CLIENTE nombra la app, se le contesta con esa", () => {
    // Responderle "transferencia" a alguien que escribió "Nequi" sería peor:
    // parece que no lo entendió.
    const r = tryPaymentSubIntentAnswer(
      "pago por nequi",
      "Ana",
      "Curso de Piano",
      { number: "3001234567", owner: "Duvier" },
    );
    expect(r!.response).toContain("Nequi");
  });
});
