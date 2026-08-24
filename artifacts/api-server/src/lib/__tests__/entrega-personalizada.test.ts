import { describe, it, expect } from "vitest";
import { generarClaveDeEntrega, prepararEntrega, textoDeEntrega } from "../entrega-personalizada";

const PRODUCTO = {
  id: 1,
  name: "Curso de Inglés",
  deliveryLink: "https://1024terabox.com/s/FIJO",
  teraboxPath: "/INGLES_TOTAL_DE_PRINCIPIANTE_A_AVANZADO_115HORAS",
};

const shareOk = async () => ({ shorturl: "https://1024terabox.com/s/NUEVO" });

describe("la clave", () => {
  it("tiene los 4 caracteres que pide Terabox", () => {
    for (let i = 0; i < 50; i++) expect(generarClaveDeEntrega()).toHaveLength(4);
  });

  /** Se dicta por WhatsApp y se teclea a mano: 0/O y 1/l se confunden. */
  it("no usa caracteres que se confunden al dictarla", () => {
    const muchas = Array.from({ length: 300 }, () => generarClaveDeEntrega()).join("");
    for (const malo of ["0", "o", "O", "1", "l", "I", "i"]) {
      expect(muchas).not.toContain(malo);
    }
  });

  it("no devuelve siempre la misma", () => {
    const set = new Set(Array.from({ length: 100 }, () => generarClaveDeEntrega()));
    expect(set.size).toBeGreaterThan(50);
  });
});

describe("cada comprador recibe lo suyo", () => {
  it("genera enlace y clave propios", async () => {
    const r = (await prepararEntrega(PRODUCTO, { crearShare: shareOk }))!;
    expect(r.origen).toBe("personalizada");
    expect(r.url).toBe("https://1024terabox.com/s/NUEVO");
    expect(r.clave).toHaveLength(4);
  });

  it("dos compradores no reciben la misma clave", async () => {
    const claves = new Set<string>();
    for (let i = 0; i < 30; i++) {
      claves.add((await prepararEntrega(PRODUCTO, { crearShare: shareOk }))!.clave!);
    }
    expect(claves.size).toBeGreaterThan(15);
  });

  it("le pasa la clave a Terabox, no la inventa después", async () => {
    let recibida: string | null = null;
    await prepararEntrega(PRODUCTO, {
      crearShare: async (_p, clave) => { recibida = clave; return { shorturl: "https://x/s/1" }; },
    });
    expect(recibida).toHaveLength(4);
  });
});

/**
 * Generar el enlace en el momento del pago hace que la entrega dependa de que
 * Terabox responda justo cuando el cliente acaba de pagar -- el peor momento
 * para fallar. Se pierde la clave, nunca la venta.
 */
describe("si Terabox falla, el cliente igual recibe su acceso", () => {
  it("cae al enlace fijo cuando Terabox revienta", async () => {
    const r = (await prepararEntrega(PRODUCTO, {
      crearShare: async () => { throw new Error("ndus vencida"); },
    }))!;
    expect(r.origen).toBe("fija");
    expect(r.url).toBe("https://1024terabox.com/s/FIJO");
    expect(r.clave).toBeNull();
    expect(r.motivo).toContain("ndus vencida");
  });

  it("cae al fijo si Terabox contesta sin enlace", async () => {
    const r = (await prepararEntrega(PRODUCTO, { crearShare: async () => ({ shorturl: "" }) }))!;
    expect(r.origen).toBe("fija");
  });

  it("cae al fijo si el producto no tiene cargada su ruta", async () => {
    const r = (await prepararEntrega({ ...PRODUCTO, teraboxPath: null }, { crearShare: shareOk }))!;
    expect(r.origen).toBe("fija");
    expect(r.motivo).toContain("ruta de Terabox");
  });

  /** Sin fijo ni ruta no hay nada que entregar: mejor avisar que mandar un
   *  mensaje de "pago confirmado" sin enlace adentro. */
  it("devuelve null cuando no hay NINGÚN enlace", async () => {
    const r = await prepararEntrega({ id: 9, name: "X", deliveryLink: null, teraboxPath: null });
    expect(r).toBeNull();
  });
});

describe("el texto que le llega al cliente", () => {
  it("incluye la clave y le dice que la va a necesitar", () => {
    const t = textoDeEntrega({ url: "https://x/s/1", clave: "k7m2", origen: "personalizada" });
    expect(t).toContain("https://x/s/1");
    expect(t).toContain("k7m2");
    expect(t.toLowerCase()).toContain("clave");
  });

  it("sin clave, no menciona ninguna", () => {
    const t = textoDeEntrega({ url: "https://x/s/1", clave: null, origen: "fija" });
    expect(t).toContain("https://x/s/1");
    expect(t.toLowerCase()).not.toContain("clave");
  });
});
