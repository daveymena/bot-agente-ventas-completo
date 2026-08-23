import { describe, it, expect } from "vitest";
import { evaluarCobrabilidad, enlaceDePagoValido, resumenDeCobrabilidad } from "../cobrabilidad";
import type { CredencialesDePago } from "../tenant-payment-credentials";

const SIN_NADA: CredencialesDePago = {
  mercadopago: { accessToken: "", enabled: false },
  paypal: { clientId: "", clientSecret: "", mode: "live", enabled: false },
  transfer: { enabled: false, accounts: [] },
  propias: true,
};

const CON_MP: CredencialesDePago = {
  ...SIN_NADA,
  mercadopago: { accessToken: "APP_USR-xxx", enabled: true },
};

const digital = { id: 1, name: "Curso de Piano", kind: "digital", price: "60000" };
const fisico = { id: 2, name: "Cojín Moto", kind: "physical", price: "89000" };

describe("un producto sin forma de cobro no se puede pautar", () => {
  it("digital sin ninguna pasarela no es cobrable", () => {
    const r = evaluarCobrabilidad(digital, SIN_NADA);
    expect(r.cobrable).toBe(false);
    expect(r.problemas.join(" ")).toContain("ninguna pasarela");
  });

  it("digital con MercadoPago sí es cobrable", () => {
    const r = evaluarCobrabilidad(digital, CON_MP);
    expect(r.cobrable).toBe(true);
    expect(r.vias).toContain("mercadopago");
  });

  it("sin precio no es cobrable aunque haya pasarela", () => {
    expect(evaluarCobrabilidad({ ...digital, price: "0" }, CON_MP).cobrable).toBe(false);
    expect(evaluarCobrabilidad({ ...digital, price: null }, CON_MP).problemas.join(" "))
      .toContain("No tiene precio");
  });

  it("un físico se cobra contra entrega aunque no haya pasarela: al mensajero", () => {
    const r = evaluarCobrabilidad(fisico, SIN_NADA);
    expect(r.cobrable).toBe(true);
    expect(r.vias).toContain("contraentrega");
  });
});

describe("el enlace de pago cargado a mano", () => {
  it.each(["https://mpago.la/abc", "http://pago.test/x"])('acepta "%s"', (l) => {
    expect(enlaceDePagoValido(l)).toBe(true);
  });

  it.each(["", "   ", "mpago.la/abc", "javascript:alert(1)", "no es un link"])(
    'rechaza "%s"',
    (l) => {
      expect(enlaceDePagoValido(l)).toBe(false);
    },
  );

  /**
   * Un enlace mal cargado es peor que ninguno: el bot lo manda igual y el
   * cliente cae en una página rota justo cuando iba a pagar.
   */
  it("avisa cuando el enlace está mal escrito, en vez de dejarlo pasar", () => {
    const r = evaluarCobrabilidad({ ...digital, paymentLink: "mpago.la/sin-protocolo" }, SIN_NADA);
    expect(r.problemas.join(" ")).toContain("no es una dirección web válida");
    expect(r.vias).not.toContain("enlace_propio");
  });

  it("un enlace propio válido alcanza para cobrar sin pasarela", () => {
    const r = evaluarCobrabilidad({ ...digital, paymentLink: "https://mpago.la/abc" }, SIN_NADA);
    expect(r.cobrable).toBe(true);
    expect(r.vias).toEqual(["enlace_propio"]);
  });
});

describe("avisos que no bloquean", () => {
  it("advierte si cobra con las credenciales del servidor y no las suyas", () => {
    const r = evaluarCobrabilidad(digital, { ...CON_MP, propias: false });
    expect(r.cobrable).toBe(true);
    expect(r.problemas.join(" ")).toContain("credenciales por defecto del servidor");
  });
});

describe("resumen para el dueño antes de pautar", () => {
  it("lista solo lo que NO podría cobrar", () => {
    const r = resumenDeCobrabilidad([
      { producto: digital, resultado: evaluarCobrabilidad(digital, CON_MP) },
      { producto: { id: 3, name: "Pack sin precio", kind: "digital", price: "0" }, resultado: evaluarCobrabilidad({ id: 3, name: "Pack sin precio", kind: "digital", price: "0" }, CON_MP) },
    ]);
    expect(r.total).toBe(2);
    expect(r.cobrables).toBe(1);
    expect(r.noCobrables).toHaveLength(1);
    expect(r.noCobrables[0]!.name).toBe("Pack sin precio");
  });
});
