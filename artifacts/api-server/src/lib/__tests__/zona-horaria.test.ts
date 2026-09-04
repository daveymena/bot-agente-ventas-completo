import { describe, it, expect } from "vitest";
import {
  desfaseEnMinutos,
  instanteEnZona,
  horaLocal,
  proximoDiaYHora,
  zonaValida,
} from "../zona-horaria";

/**
 * La hora del negocio.
 *
 * Se prueba con números concretos y verificables, no con "que devuelva algo":
 * el error que esto previene no rompe nada ni aparece en un log. Un negocio en
 * Colombia que pide apagar los anuncios a la 1am, con la cuenta mal hecha los
 * apaga a las 8pm --la mejor hora de venta-- y nadie se entera nunca.
 */

describe("el desfase de cada zona", () => {
  it("Bogotá está 5 horas atrás de UTC, todo el año", () => {
    // Colombia no tiene horario de verano: es el caso de control.
    expect(desfaseEnMinutos("America/Bogota", new Date("2026-01-15T12:00:00Z"))).toBe(-300);
    expect(desfaseEnMinutos("America/Bogota", new Date("2026-07-15T12:00:00Z"))).toBe(-300);
  });

  it("Madrid cambia con el horario de verano", () => {
    // El caso que obliga a pedir un INSTANTE y no solo la zona.
    expect(desfaseEnMinutos("Europe/Madrid", new Date("2026-01-15T12:00:00Z"))).toBe(60);
    expect(desfaseEnMinutos("Europe/Madrid", new Date("2026-07-15T12:00:00Z"))).toBe(120);
  });
});

describe("de hora local a instante real", () => {
  it("las 19:00 de Bogotá son las 00:00 UTC del día siguiente", () => {
    const t = instanteEnZona("America/Bogota", 2026, 9, 1, 19, 0);
    expect(t.toISOString()).toBe("2026-09-02T00:00:00.000Z");
  });

  it("la 1:00 de la mañana en México no se confunde con la tarde", () => {
    // El caso del apagado nocturno: si esto sale mal, se apaga en plena venta.
    const t = instanteEnZona("America/Mexico_City", 2026, 9, 1, 1, 0);
    expect(t.toISOString()).toBe("2026-09-01T07:00:00.000Z");
  });

  it("ida y vuelta: lo que se agenda es lo que se lee", () => {
    for (const zona of ["America/Bogota", "America/Mexico_City", "Europe/Madrid", "America/Argentina/Buenos_Aires"]) {
      for (const hora of [0, 1, 8, 13, 19, 23]) {
        const t = instanteEnZona(zona, 2026, 7, 15, hora, 30);
        const leido = horaLocal(zona, t);
        expect(leido.hora, `${zona} ${hora}h`).toBe(hora);
        expect(leido.minuto, `${zona} ${hora}h`).toBe(30);
        expect(leido.dia, `${zona} ${hora}h`).toBe(15);
      }
    }
  });

  it("la medianoche local cae en el día correcto", () => {
    // `hour` puede venir como "24" según la versión de ICU: si no se
    // normaliza, la medianoche se agenda con un día de corrimiento.
    const t = instanteEnZona("America/Bogota", 2026, 9, 10, 0, 0);
    const leido = horaLocal("America/Bogota", t);
    expect(leido.hora).toBe(0);
    expect(leido.dia).toBe(10);
  });
});

describe("el próximo día y hora", () => {
  it("si hoy es lunes y se pide el miércoles, faltan dos días", () => {
    // 2026-09-07 es lunes.
    const desde = instanteEnZona("America/Bogota", 2026, 9, 7, 10, 0);
    const t = proximoDiaYHora("America/Bogota", 3, 19, 0, desde);
    const l = horaLocal("America/Bogota", t);
    expect(l.dia).toBe(9);
    expect(l.diaSemana).toBe(3);
    expect(l.hora).toBe(19);
  });

  it("si la hora de hoy YA pasó, se va a la semana siguiente", () => {
    // Lunes 20:00, se pide "lunes a las 19": ya pasó, va al lunes que viene.
    // Sin esto, agendar la semana un lunes por la noche publicaría al
    // instante todo lo del lunes.
    const desde = instanteEnZona("America/Bogota", 2026, 9, 7, 20, 0);
    const t = proximoDiaYHora("America/Bogota", 1, 19, 0, desde);
    const l = horaLocal("America/Bogota", t);
    expect(l.dia).toBe(14);
    expect(l.diaSemana).toBe(1);
  });

  it("si la hora de hoy todavía no llegó, es hoy mismo", () => {
    const desde = instanteEnZona("America/Bogota", 2026, 9, 7, 10, 0);
    const t = proximoDiaYHora("America/Bogota", 1, 19, 0, desde);
    expect(horaLocal("America/Bogota", t).dia).toBe(7);
  });

  it("cruzando el cambio de horario, la hora local se mantiene", () => {
    // Madrid cambia el 25/10/2026. Lo que se agenda "a las 19" tiene que
    // seguir siendo las 19 del otro lado del cambio, no las 18 ni las 20.
    const desde = instanteEnZona("Europe/Madrid", 2026, 10, 22, 10, 0);
    const t = proximoDiaYHora("Europe/Madrid", 1, 19, 0, desde);
    const l = horaLocal("Europe/Madrid", t);
    expect(l.hora).toBe(19);
    expect(l.dia).toBe(26);
  });
});

describe("la zona del negocio", () => {
  it("una zona válida se respeta", () => {
    expect(zonaValida("America/Bogota")).toBe("America/Bogota");
  });

  it("una inválida o vacía NO cae en una zona inventada", () => {
    // Un default escrito a mano le acierta al negocio que vio nacer el código
    // y le erra a todos los demás.
    for (const mala of ["", null, undefined, "Marte/Olympus"]) {
      const z = zonaValida(mala as any);
      expect(() => new Intl.DateTimeFormat("en-US", { timeZone: z })).not.toThrow();
    }
  });
});
