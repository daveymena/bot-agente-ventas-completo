import { describe, it, expect } from "vitest";
import { lineasDeMediosDePago } from "../medios-de-pago-en-linea";

/**
 * Copiado de una conversación REAL (2026-09-06). Así se veía:
 *
 *   🔹 *Tarjeta / PSE:*
 *   https://ventasproia.com/p/g3Qk92
 *
 *   🔹 *PayPal (Internacional):*
 *   https://ventasproia.com/p/Ci9Nb9
 *
 *   🔹 *Nequi:*
 *   📱 3136174267
 *   👤 Duvier Mena
 *
 * Trece renglones para cuatro medios. En el celular se lee como un formulario.
 */

const MEDIOS = {
  mercadopago: { shortUrl: "https://ventasproia.com/p/g3Qk92", url: "https://mercadopago.com/checkout?pref_id=aaa" },
  paypal: { shortUrl: "https://ventasproia.com/p/Ci9Nb9" },
  transfer: {
    options: [
      { type: "Nequi", number: "3136174267", name: "Duvier Mena" },
      { type: "Daviplata", number: "3136174267", name: "Duvier Mena" },
    ],
  },
};

const CO = { aceptaPagosLocales: true, esColombia: true };

describe("Cada medio de pago entra en UN renglón", () => {
  const l = lineasDeMediosDePago(MEDIOS, CO);

  it("cuatro medios son cuatro líneas, no trece", () => {
    expect(l).toHaveLength(4);
  });

  it("el enlace va DENTRO de la línea, nunca solo", () => {
    // Una línea que es solo una URL es la que el admin pidió eliminar.
    for (const linea of l) {
      expect(linea.trim(), linea).not.toMatch(/^https?:\/\/\S+$/);
      expect(linea).toMatch(/:\s\S/); // etiqueta, dos puntos, y algo detrás
    }
  });

  it("no quedan líneas en blanco entre medios", () => {
    expect(l.filter((x) => !x.trim())).toHaveLength(0);
  });

  it("cada medio lleva su propio emoji, no cuatro rombos iguales", () => {
    const emojis = l.map((x) => x.slice(0, 2));
    expect(new Set(emojis).size).toBeGreaterThan(1);
    expect(l.join("\n")).not.toMatch(/🔹/);
  });

  it("usa el enlace corto, no el checkout crudo", () => {
    expect(l[0]).toContain("/p/g3Qk92");
    expect(l[0]).not.toContain("pref_id");
  });

  it("muestra TODAS las billeteras, no solo la primera", () => {
    const t = l.join("\n");
    expect(t).toContain("Nequi: 3136174267");
    expect(t).toContain("Daviplata: 3136174267");
    expect(t).toContain("Duvier Mena");
  });
});

describe("A quién se le muestra qué", () => {
  it("a un cliente de afuera no se le ofrecen billeteras colombianas", () => {
    // Nequi y Daviplata no existen para él, y MercadoPago Colombia le rechaza
    // la tarjeta: ofrecérselos es hacerle perder el tiempo.
    const l = lineasDeMediosDePago(MEDIOS, { aceptaPagosLocales: false, esColombia: false });
    expect(l.join("\n")).not.toMatch(/Nequi|Daviplata|PSE/);
    expect(l.join("\n")).toMatch(/PayPal|Tarjeta o PayPal/);
  });

  it("en Colombia PayPal se marca como internacional", () => {
    expect(lineasDeMediosDePago(MEDIOS, CO).join("\n")).toMatch(/PayPal \(internacional\)/);
  });
});

describe("Lo que falta no se inventa", () => {
  it("sin medios cargados no hay líneas", () => {
    expect(lineasDeMediosDePago(null, CO)).toEqual([]);
    expect(lineasDeMediosDePago({}, CO)).toEqual([]);
  });

  it("una billetera sin número se salta: media línea no sirve de nada", () => {
    const l = lineasDeMediosDePago(
      { transfer: { options: [{ type: "Nequi", number: "", name: "Duvier" }] } },
      CO,
    );
    expect(l).toEqual([]);
  });

  it("una billetera sin nombre igual se muestra, con el número", () => {
    const l = lineasDeMediosDePago(
      { transfer: { options: [{ type: "Nequi", number: "3136174267" }] } },
      CO,
    );
    expect(l).toEqual(["📱 Nequi: 3136174267"]);
  });
});
