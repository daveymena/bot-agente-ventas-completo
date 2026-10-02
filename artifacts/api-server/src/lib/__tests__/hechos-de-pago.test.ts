import { describe, it, expect } from "vitest";
import { mediosDePago, loQuePidio, renderMediosDePago, noManejamosEse, respuestaMedioNoDisponible } from "../hechos-de-pago";

/** Un negocio con las tres formas: pasarela, PayPal y DOS transferencias. */
const LINKS = {
  mercadopago: { shortUrl: "https://ventasproia.com/p/g3Qk92" },
  paypal: { shortUrl: "https://ventasproia.com/p/Ci9Nb9" },
  transfer: {
    options: [
      { type: "nequi", number: "3136174267", name: "Duvier Mena" },
      { type: "daviplata", number: "3009998877", name: "Duvier Mena" },
    ],
  },
};

const MEDIOS = mediosDePago({ dynamicLinks: LINKS, aceptaPagosLocales: true, esColombia: true });

describe("La hoja: lo que este negocio de verdad tiene", () => {
  it("lista TODAS las cuentas, no solo la primera", () => {
    // Todo el código de pagos usaba `transfer.options[0]`. Con Nequi Y
    // Daviplata cargados, quien pedía Daviplata recibía el número de Nequi.
    const transferencias = MEDIOS.filter((m) => m.tipo === "transferencia");
    expect(transferencias.map((m) => m.etiqueta)).toEqual(["Nequi", "Daviplata"]);
    expect(transferencias[1].numero).toBe("3009998877");
  });

  it("y las pasarelas con su enlace real", () => {
    expect(MEDIOS.find((m) => m.clave === "tarjeta")?.url).toMatch(/g3Qk92/);
    expect(MEDIOS.find((m) => m.clave === "paypal")?.url).toMatch(/Ci9Nb9/);
  });

  it("una cuenta sin número no entra: no se ofrece lo que no se puede cobrar", () => {
    const m = mediosDePago({ dynamicLinks: { transfer: { options: [{ type: "nequi", number: "", name: "X" }] } } });
    expect(m).toEqual([]);
  });
});

describe("Si pide uno concreto, sale solo ese", () => {
  it("«por nequi» → solo Nequi, con su número", () => {
    const r = loQuePidio("por nequi", MEDIOS);
    expect(r.pedidos.map((m) => m.etiqueta)).toEqual(["Nequi"]);
    expect(r.pedidos[0].numero).toBe("3136174267");
  });

  it("«tenés daviplata?» → el número de DAVIPLATA, no el de Nequi", () => {
    const r = loQuePidio("tenés daviplata?", MEDIOS);
    expect(r.pedidos[0].etiqueta).toBe("Daviplata");
    expect(r.pedidos[0].numero).toBe("3009998877");
  });

  it("«con tarjeta» → el enlace, no un número de celular", () => {
    const r = loQuePidio("puedo pagar con tarjeta?", MEDIOS);
    expect(r.pedidos.some((m) => m.tipo === "link")).toBe(true);
    expect(r.pedidos.some((m) => m.tipo === "transferencia")).toBe(false);
  });

  it("«te consigno» → todas las transferencias", () => {
    // Conjugado, que es como lo dice la gente. La primera version de este
    // patron listaba solo infinitivos y se le escapaba.
    for (const frase of ["te consigno hoy mismo", "hago la transferencia ya", "te deposito ahora"]) {
      const r = loQuePidio(frase, MEDIOS);
      expect(r.pedidos.map((m) => m.etiqueta), frase).toEqual(["Nequi", "Daviplata"]);
    }
  });

  it("«cómo pago» no nombra ninguno: eso lo decide quien llama", () => {
    expect(loQuePidio("como pago?", MEDIOS).pedidos).toEqual([]);
  });
});

describe("Lo que NO está configurado no se puede ofrecer", () => {
  const SOLO_NEQUI = mediosDePago({
    dynamicLinks: { transfer: { options: [{ type: "nequi", number: "3136174267", name: "Duvier" }] } },
    aceptaPagosLocales: true,
  });

  it("pide Daviplata y no hay: se dice, y se ofrece lo que sí hay", () => {
    const r = loQuePidio("me queda mejor daviplata", SOLO_NEQUI);
    expect(r.pedidos).toEqual([]);
    expect(r.noConfigurado).toBe("daviplata");
    expect(noManejamosEse(r.noConfigurado!, SOLO_NEQUI)).toMatch(/Nequi/);
  });

  // Chat de prueba (30-09-2026), curso de Excel: "¿cómo pago? ¿tienen nequi?"
  // → "Por Nequi no manejo pagos 🙏 Pero sí por PayPal. ¿Cuál te queda
  // mejor?" — sin el enlace, y "cuál" con una sola opción. El cliente preguntó
  // CÓMO pagar y se quedó sin cómo.
  it("pide un medio que no hay: se dice Y se entregan los datos del que sí hay", () => {
    const SOLO_PAYPAL = mediosDePago({ dynamicLinks: { paypal: { shortUrl: "https://ventasproia.com/p/Ci9Nb9" } }, aceptaPagosLocales: true, esColombia: true });
    const r = loQuePidio("y como pago? tienen nequi?", SOLO_PAYPAL);
    const texto = respuestaMedioNoDisponible(r.noConfigurado!, SOLO_PAYPAL, "$20.000 COP");
    expect(texto).toMatch(/Nequi no/i);
    expect(texto).toMatch(/Ci9Nb9/);
    expect(texto).toMatch(/\$20\.000/);
    expect(texto).not.toMatch(/¿Cuál te queda mejor\?/);
  });

  it("el modelo no puede inventarse un medio: si no está, no hay qué señalar", () => {
    expect(SOLO_NEQUI.some((m) => m.clave === "daviplata")).toBe(false);
    expect(SOLO_NEQUI.some((m) => m.clave === "paypal")).toBe(false);
  });
});

describe("El mensaje lo escribe el servidor", () => {
  it("un emoji por línea y el número tal cual está configurado", () => {
    const r = loQuePidio("por nequi", MEDIOS);
    const texto = renderMediosDePago(r.pedidos, "$60.000 COP", "¿Te ayudo con algo más?");
    expect(texto).toMatch(/💰 \*\$60\.000 COP\*/);
    expect(texto).toMatch(/🔹 \*Nequi:\*/);
    expect(texto).toMatch(/📱 3136174267/);
    expect(texto).toMatch(/👤 Duvier Mena/);
    // Y NO se cuela el otro medio.
    expect(texto).not.toMatch(/Daviplata/);
    expect(texto).not.toMatch(/PayPal/);
  });

  it("«cómo pago» los muestra todos, en orden", () => {
    const texto = renderMediosDePago(MEDIOS, "$60.000 COP");
    for (const esperado of ["Tarjeta / PSE", "PayPal", "Nequi", "Daviplata"]) {
      expect(texto, esperado).toMatch(new RegExp(esperado.replace(/[/]/g, "\\/")));
    }
  });

  it("nunca aparece un «link de pago por Nequi»: Nequi no es un link", () => {
    // Eso fue lo que el modelo se invento en produccion el 2026-09-02.
    const r = loQuePidio("por nequi", MEDIOS);
    const texto = renderMediosDePago(r.pedidos, "$60.000 COP");
    expect(texto).not.toMatch(/https?:\/\//);
  });
});
