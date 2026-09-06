import { describe, it, expect } from "vitest";
import {
  leerCorreoDePago,
  bancoDelRemitente,
  dominioDe,
  montoDeTexto,
  cruzarConElComprobante,
  loQueSeLeDiceAlDueno,
} from "../pagos-por-correo";

/**
 * Los cuerpos de acá son COPIADOS de la bandeja real (daveymena16@gmail.com,
 * leída el 2026-09-06), no inventados. Si Nequi cambia la redacción, estas
 * pruebas caen y hay que mirar un correo nuevo — que es exactamente lo que se
 * quiere que pase antes de que falle un cobro.
 */

const RECIBIDO = {
  remitente: "notificaciones@nequi.com.co",
  asunto: "¡Recibiste plata por Bre-B!",
  cuerpo:
    "NEQUI\n\n| |\n| ¡Recibiste plata por Bre-B! |\n| ¡Hola, DUVIER DAVEY MENA MOSQUERA! |\n" +
    "| Recibiste 130.000 de LIZ MONTOYA el 29 de agosto de 2026 a las 4:39 p.m, desde el banco Bco Bogotá. " +
    "Revisa el detalle en los movimientos de tu app o descarga el comprobante si lo necesitas. |",
  fecha: new Date("2026-08-29T21:39:28Z"),
};

const ENVIADO = {
  remitente: "notificaciones@nequi.com.co",
  asunto: "¡Enviaste plata por Bre-B!",
  cuerpo:
    "¡Realizaste un envío por Bre-B y todo salió bien! ¡Hola, DUVIER DAVEY MENA MOSQUERA! " +
    "Enviaste de manera exitosa 11.600 a la llave @arias7285 de JAIME ARIAS el 2 de septiembre de 2026 a las 9:56 pm",
  fecha: new Date("2026-09-03T02:56:12Z"),
};

describe("Leer el aviso del banco", () => {
  it("saca todo del correo real de plata recibida", () => {
    const p = leerCorreoDePago(RECIBIDO)!;
    expect(p).not.toBe(null);
    expect(p.banco).toBe("nequi");
    expect(p.monto).toBe(130000);
    expect(p.remitente).toBe("LIZ MONTOYA");
    expect(p.bancoOrigen).toBe("Bco Bogotá");
    expect(p.recibidoEl).toEqual(RECIBIDO.fecha);
  });

  it("⚠️ un aviso de plata ENVIADA no es un cobro", () => {
    // En la bandeja real los envíos son mayoría. Confundirlos daría por
    // cobrado un pago que hizo el propio dueño.
    expect(leerCorreoDePago(ENVIADO)).toBe(null);
  });

  it("la publicidad del banco tampoco", () => {
    expect(leerCorreoDePago({
      remitente: "notificaciones@nequi.com.co",
      asunto: "¡Lista tu Tarjeta Nequi!",
      cuerpo: "Con tu Tarjeta Nequi digital usas lo que tienes disponible ;) Paga tus suscripciones",
      fecha: new Date(),
    })).toBe(null);
  });
});

describe("⚠️ De quién se acepta un aviso de plata", () => {
  it("dominios de banco y sus subdominios", () => {
    expect(bancoDelRemitente("notificaciones@nequi.com.co")).toBe("nequi");
    expect(bancoDelRemitente("somos@notificaciones.nequi.com.co")).toBe("nequi");
    expect(bancoDelRemitente("Nequi <hola@nequi.com.co>")).toBe("nequi");
  });

  it("un dominio que solo CONTIENE el del banco no pasa", () => {
    // Si esto pasara, cualquiera registra nequi.com.co.algo.ru y se lleva
    // productos gratis mandando un correo.
    expect(bancoDelRemitente("aviso@nequi.com.co.fake.ru")).toBe(null);
    expect(bancoDelRemitente("aviso@falsonequi.com.co")).toBe(null);
    expect(bancoDelRemitente("nequi.com.co@gmail.com")).toBe(null);
  });

  it("y un correo cualquiera menos", () => {
    expect(bancoDelRemitente("cliente@gmail.com")).toBe(null);
    expect(bancoDelRemitente("")).toBe(null);
  });

  it("el dominio se saca bien aunque venga con nombre", () => {
    expect(dominioDe('"Nequi" <notificaciones@nequi.com.co>')).toBe("nequi.com.co");
  });

  it("un aviso REAL pero de un remitente falso no se lee", () => {
    expect(leerCorreoDePago({ ...RECIBIDO, remitente: "estafa@gmail.com" })).toBe(null);
  });
});

describe("Montos como los escribe el banco", () => {
  it("con puntos de miles", () => {
    expect(montoDeTexto("130.000")).toBe(130000);
    expect(montoDeTexto("1.234.567")).toBe(1234567);
    expect(montoDeTexto("$ 60.000,00")).toBe(60000);
    expect(montoDeTexto("7.000")).toBe(7000);
  });

  it("y lo que no es un monto", () => {
    expect(montoDeTexto("")).toBe(null);
    expect(montoDeTexto("sin plata")).toBe(null);
  });
});

describe("Cruzar el aviso con el comprobante que mandó el cliente", () => {
  const base = new Date("2026-09-06T15:00:00Z");
  const aviso = (min: number, monto: number, quien: string) => ({
    banco: "nequi", monto, remitente: quien, fechaTexto: null, bancoOrigen: null,
    recibidoEl: new Date(base.getTime() - min * 60_000),
  });

  it("el monto exacto manda sobre el más reciente", () => {
    const r = cruzarConElComprobante(
      [aviso(2, 45000, "OTRO"), aviso(20, 60000, "LIZ MONTOYA")],
      { llegoElComprobante: base, montoEsperado: 60000 },
    );
    expect(r[0]!.pago.remitente).toBe("LIZ MONTOYA");
    expect(r[0]!.montoExacto).toBe(true);
    expect(r[0]!.minutosAntes).toBe(20);
  });

  it("lo viejo queda afuera de la ventana", () => {
    const r = cruzarConElComprobante([aviso(500, 60000, "VIEJO")], {
      llegoElComprobante: base, montoEsperado: 60000,
    });
    expect(r).toHaveLength(0);
  });

  it("un aviso POSTERIOR al comprobante no puede ser ese pago", () => {
    const r = cruzarConElComprobante([aviso(-30, 60000, "DESPUES")], {
      llegoElComprobante: base, montoEsperado: 60000,
    });
    expect(r).toHaveLength(0);
  });

  it("si hay dos iguales se muestran los dos: la ambigüedad es real", () => {
    const r = cruzarConElComprobante(
      [aviso(3, 60000, "ANA"), aviso(5, 60000, "PEDRO")],
      { llegoElComprobante: base, montoEsperado: 60000 },
    );
    expect(r).toHaveLength(2);
  });
});

describe("Lo que se le escribe al dueño", () => {
  const base = new Date("2026-09-06T15:00:00Z");

  it("es una pregunta, no un veredicto", () => {
    const r = cruzarConElComprobante(
      [{ banco: "nequi", monto: 60000, remitente: "LIZ MONTOYA", fechaTexto: null, bancoOrigen: null,
         recibidoEl: new Date(base.getTime() - 4 * 60_000) }],
      { llegoElComprobante: base, montoEsperado: 60000 },
    );
    const t = loQueSeLeDiceAlDueno(r, "Leonel");
    expect(t).toMatch(/\$60\.000/);
    expect(t).toMatch(/LIZ MONTOYA/);
    expect(t).toMatch(/hace 4 min/);
    expect(t).toMatch(/¿Ese pago es el de \*Leonel\*\?/);
    // Nunca puede decir que ya está confirmado y listo.
    expect(t).not.toMatch(/pago confirmado/i);
  });

  it("y cuando no hay nada, lo dice sin adornos", () => {
    const t = loQueSeLeDiceAlDueno([], "Leonel");
    expect(t).toMatch(/NO aparece ning[úu]n pago reciente/);
  });
});
