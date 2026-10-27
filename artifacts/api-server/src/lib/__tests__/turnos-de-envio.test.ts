/**
 * La agenda de envíos de un número: espacia a los destinatarios distintos sin
 * que dos envíos en paralelo salgan juntos.
 */
import { describe, it, expect } from "vitest";
import { TurnosDeEnvio } from "../turnos-de-envio";

/** Reloj manual y azar fijo: espaciado de 8000 + 0.5 × 12000 = 14000 ms. */
function agenda() {
  let ahora = 1_000_000;
  const t = new TurnosDeEnvio(() => ahora, () => 0.5);
  return { t, avanzar: (ms: number) => { ahora += ms; } };
}

describe("TurnosDeEnvio", () => {
  it("el primer envío sale ya y el siguiente cliente espera el espaciado", () => {
    const { t } = agenda();
    expect(t.antesDeEnviar("a@s")).toBe(0);
    expect(t.reservar("b@s")).toBe(14_000);
  });

  it("dos reservas a la vez no comparten turno: la segunda va detrás de la primera", () => {
    const { t } = agenda();
    t.antesDeEnviar("a@s");
    expect(t.reservar("b@s")).toBe(14_000);
    expect(t.reservar("c@s")).toBe(28_000);
  });

  it("pedir el turno otra vez devuelve el mismo, no uno nuevo al final", () => {
    const { t, avanzar } = agenda();
    t.antesDeEnviar("a@s");
    t.reservar("b@s");
    avanzar(10_000);
    expect(t.reservar("b@s")).toBe(4_000);
  });

  it("al llegar su hora, el envío reservado sale sin volver a esperar", () => {
    const { t, avanzar } = agenda();
    t.antesDeEnviar("a@s");
    t.reservar("b@s");
    avanzar(14_000);
    expect(t.antesDeEnviar("b@s")).toBe(0);
  });

  it("seguirle escribiendo a la misma persona no espera", () => {
    const { t } = agenda();
    t.antesDeEnviar("a@s");
    expect(t.antesDeEnviar("a@s")).toBe(0);
    expect(t.reservar("a@s")).toBe(0);
  });

  it("un envío sin reserva previa también respeta la agenda", () => {
    const { t } = agenda();
    t.antesDeEnviar("a@s");
    t.reservar("b@s");
    expect(t.antesDeEnviar("c@s")).toBe(28_000);
  });

  it("consultar el turno no lo aparta", () => {
    const { t } = agenda();
    t.antesDeEnviar("a@s");
    expect(t.libreEn("b@s")).toBe(14_000);
    expect(t.libreEn("b@s")).toBe(14_000);
    expect(t.reservar("b@s")).toBe(14_000);
    expect(t.libreEn("c@s")).toBe(28_000);
    expect(t.libreEn("a@s")).toBe(0);
  });
});
