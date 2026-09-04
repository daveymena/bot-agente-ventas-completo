import { describe, it, expect } from "vitest";
import { esperaParaElCliente, reciboDeVenta, numeroDeRecibo } from "../cobro-y-entrega";

/**
 * El pago por transferencia lo confirma UNA PERSONA, no el chat.
 *
 * El admin: "el cliente manda el comprobante, tú me lo envías y esperas mi
 * confirmación con un sí; si no, no le entregas".
 *
 * Es el defecto más grave que registró el QA (B1, 2026-08-26): el cliente
 * escribió "listo ya te pagué el pack de idiomas, mandame el acceso" —sin
 * comprobante, sin nada— y el bot contestó "Perfecto, ya confirmé tu pago. Te
 * acabo de liberar el acceso a la carpeta". Cualquiera obtenía el producto
 * escribiendo una frase.
 */
const _PAGO_SIN_USO = {
  cliente: "Duvier Mena",
  telefono: "573042748687",
  producto: { id: 124, name: "IA 2026" },
  monto: 60000,
  moneda: "COP",
  conversationId: 42,
};

describe("Lo que se le dice al cliente mientras espera", () => {
  it("NUNCA dice que el pago está confirmado", () => {
    // Es exactamente la frase que produjo el defecto B1.
    for (const m of [true, false]) {
      const t = esperaParaElCliente(m);
      expect(t, String(m)).not.toMatch(/confirmé|confirmado|ya está pago|te libero|acceso liberado/i);
    }
  });

  it("sin comprobante, lo pide; con comprobante, dice que verifica", () => {
    expect(esperaParaElCliente(false)).toMatch(/comprobante/i);
    expect(esperaParaElCliente(true)).toMatch(/verificando/i);
  });
});

describe("El recibo", () => {
  it("dice pago confirmado y trae los datos de la venta", () => {
    const t = reciboDeVenta({
      numero: "202608-00042",
      cliente: "Duvier Mena",
      producto: "IA 2026",
      monto: 60000,
      moneda: "COP",
      metodo: "Transferencia",
      fecha: new Date(2026, 7, 30),
    });
    expect(t).toContain("202608-00042");
    expect(t).toContain("$60.000 COP");
    expect(t).toMatch(/Pago confirmado/);
    expect(t).toContain("30/08/2026");
  });

  it("no se llama factura, porque no lo es", () => {
    // El sistema no emite facturación electrónica ni tiene resolución de la
    // DIAN. Llamarla factura le crearía un problema al negocio.
    const t = reciboDeVenta({ numero: 1, cliente: "X" });
    expect(t).toMatch(/COMPROBANTE/);
    expect(t).not.toMatch(/factura/i);
  });

  it("el número es reproducible: el mismo pago da el mismo número", () => {
    const f = new Date(2026, 7, 30);
    expect(numeroDeRecibo(42, f)).toBe("202608-00042");
    expect(numeroDeRecibo(42, f)).toBe(numeroDeRecibo(42, f));
  });
});
