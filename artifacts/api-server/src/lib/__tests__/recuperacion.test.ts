import { describe, it, expect } from "vitest";
import { esAbandonoDeCompra, mensajeDeRecuperacion, HORAS_MINIMAS, HORAS_MAXIMAS } from "../recuperacion";

const base = { etapa: "closing", estadoDePago: null, horasSinEscribir: 6, vioPrecioOPago: true };

describe("reconocer una venta abandonada", () => {
  it("lo es: llegó al cierre, no pagó y lleva horas sin escribir", () => {
    expect(esAbandonoDeCompra(base)).toBe(true);
  });

  it("no lo es si ya pagó", () => {
    expect(esAbandonoDeCompra({ ...base, estadoDePago: "confirmed" })).toBe(false);
  });

  /** Alguien que solo saludó no abandonó nada. */
  it("no lo es si nunca llegó a ver precio ni pago", () => {
    expect(esAbandonoDeCompra({ ...base, etapa: "greeting", vioPrecioOPago: false })).toBe(false);
  });

  it("vale también si vio el precio aunque la etapa sea otra", () => {
    expect(esAbandonoDeCompra({ ...base, etapa: "presentation", vioPrecioOPago: true })).toBe(true);
  });

  /** Menos de 3h es apurar a alguien que puede estar cocinando. */
  it("no lo es todavía si acaba de escribir", () => {
    expect(esAbandonoDeCompra({ ...base, horasSinEscribir: HORAS_MINIMAS - 1 })).toBe(false);
  });

  /** Más de una semana ya no es recuperar: es escribirle a un desconocido. */
  it("ya no lo es después de una semana", () => {
    expect(esAbandonoDeCompra({ ...base, horasSinEscribir: HORAS_MAXIMAS + 1 })).toBe(false);
  });
});

describe("el mensaje tiene que saber de qué habla", () => {
  it("nombra el producto real", () => {
    const m = mensajeDeRecuperacion({ producto: "Curso de Piano", semilla: "573001112222" });
    expect(m).toContain("Curso de Piano");
  });

  /**
   * Sin producto lo único que sale es "¿sigues interesado?" -- justo el
   * mensaje que hace que la gente bloquee el número. Mejor no escribir.
   */
  it("no escribe nada si no sabe qué estaba mirando", () => {
    expect(mensajeDeRecuperacion({ producto: null })).toBeNull();
    expect(mensajeDeRecuperacion({ producto: "   " })).toBeNull();
  });

  it("si la objeción fue el precio, el mensaje la toma", () => {
    const m = mensajeDeRecuperacion({ producto: "Curso de Piano", objecion: "price", semilla: "x" })!;
    expect(m.toLowerCase()).toContain("precio");
  });

  it("dos contactos distintos no reciben el mismo texto", () => {
    const a = mensajeDeRecuperacion({ producto: "Curso de Piano", semilla: "573001112222" });
    const b = mensajeDeRecuperacion({ producto: "Curso de Piano", semilla: "573001112223" });
    expect(a).not.toBe(b);
  });

  it("el mismo contacto recibe siempre el mismo (reproducible)", () => {
    const s = "573009998888";
    expect(mensajeDeRecuperacion({ producto: "X", semilla: s }))
      .toBe(mensajeDeRecuperacion({ producto: "X", semilla: s }));
  });

  it("nunca inventa descuentos, cupos ni urgencia", () => {
    const textos = Array.from({ length: 40 }, (_, i) =>
      mensajeDeRecuperacion({ producto: "Curso de Piano", semilla: `5730001${i}` })!,
    ).concat(
      ["price", "trust", "timing"].flatMap((o) =>
        Array.from({ length: 10 }, (_, i) =>
          mensajeDeRecuperacion({ producto: "Curso de Piano", objecion: o, semilla: `5731${i}` })!,
        ),
      ),
    );
    for (const t of textos) {
      const l = t.toLowerCase();
      for (const prohibido of ["descuento", "promoción", "promocion", "última oportunidad", "ultima oportunidad", "cupo", "quedan pocos", "solo hoy"]) {
        expect(l).not.toContain(prohibido);
      }
    }
  });
});
