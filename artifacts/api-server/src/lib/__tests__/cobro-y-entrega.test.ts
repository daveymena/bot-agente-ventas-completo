import { describe, it, expect } from "vitest";
import {
  avisoDePagoParaElAdmin,
  esperaParaElCliente,
  leerRespuestaDelAdmin,
  reciboDeVenta,
  numeroDeRecibo,
} from "../cobro-y-entrega";

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
const PAGO = {
  cliente: "Duvier Mena",
  telefono: "573042748687",
  producto: { id: 124, name: "IA 2026" },
  monto: 60000,
  moneda: "COP",
  conversationId: 42,
};

describe("El aviso que le llega al admin", () => {
  it("trae todo lo que necesita para decidir sin abrir la app", () => {
    const t = avisoDePagoParaElAdmin({ ...PAGO, mandoComprobante: true });
    expect(t).toContain("Duvier Mena");
    expect(t).toContain("573042748687");
    expect(t).toContain("IA 2026");
    expect(t).toContain("$60.000 COP");
    expect(t).toMatch(/sí 42/);
  });

  it("es inequívoco en que NO se entregó nada", () => {
    // El error opuesto —que el admin crea que ya se entregó— es igual de caro.
    const t = avisoDePagoParaElAdmin(PAGO);
    expect(t).toMatch(/No le entregué nada/);
    expect(t).not.toMatch(/confirmad|entregad|listo/i);
  });

  it("avisa cuando NO mandó comprobante", () => {
    expect(avisoDePagoParaElAdmin({ ...PAGO, mandoComprobante: false })).toMatch(/NO\* mandó comprobante/);
  });
});

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

describe("La confirmación del admin exige decir CUÁL", () => {
  it("lee el sí y el no con su número", () => {
    expect(leerRespuestaDelAdmin("si 42")).toEqual({ decision: "confirma", conversationId: 42 });
    expect(leerRespuestaDelAdmin("sí #42")).toEqual({ decision: "confirma", conversationId: 42 });
    expect(leerRespuestaDelAdmin("no 42")).toEqual({ decision: "rechaza", conversationId: 42 });
  });

  it("un 'sí' suelto NO confirma nada", () => {
    // Confirmar el pago equivocado entrega un producto sin cobrar. El admin
    // puede estar contestando cualquier otra cosa en su chat.
    for (const m of ["si", "sí", "dale", "ok", "confirmo", "si claro"]) {
      expect(leerRespuestaDelAdmin(m), m).toBeNull();
    }
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
    expect(t).toMatch(/RECIBO/);
    expect(t).not.toMatch(/factura/i);
  });

  it("el número es reproducible: el mismo pago da el mismo número", () => {
    const f = new Date(2026, 7, 30);
    expect(numeroDeRecibo(42, f)).toBe("202608-00042");
    expect(numeroDeRecibo(42, f)).toBe(numeroDeRecibo(42, f));
  });
});

import { avisarAlAdminDelPago } from "../cobro-y-entrega";

describe("Avisarle al admin de verdad", () => {
  it("le manda el aviso a su teléfono", async () => {
    const enviados: Array<{ tel: string; txt: string }> = [];
    const r = await avisarAlAdminDelPago(1, { ...PAGO, mandoComprobante: true }, {
      telefonoDelAdmin: async () => "573001112233",
      enviar: async (tel, txt) => { enviados.push({ tel, txt }); },
    });
    expect(r.avisado).toBe(true);
    expect(enviados[0]!.tel).toBe("573001112233");
    expect(enviados[0]!.txt).toContain("Duvier Mena");
  });

  it("si NO se pudo avisar lo dice, en vez de callarse", () => {
    // Es lo que importa: si el admin no se enteró, el cliente quedaría
    // esperando una confirmación que nunca va a llegar.
    return avisarAlAdminDelPago(1, PAGO, {
      telefonoDelAdmin: async () => null,
      enviar: async () => {},
    }).then((r) => {
      expect(r.avisado).toBe(false);
      expect(r.motivo).toMatch(/teléfono de administrador/);
    });
  });

  it("un error al enviar tampoco se traga", async () => {
    const r = await avisarAlAdminDelPago(1, PAGO, {
      telefonoDelAdmin: async () => "573001112233",
      enviar: async () => { throw new Error("whatsapp desconectado"); },
    });
    expect(r.avisado).toBe(false);
    expect(r.motivo).toMatch(/desconectado/);
  });
});
