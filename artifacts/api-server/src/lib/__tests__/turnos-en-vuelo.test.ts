/**
 * Parar a Atlas.
 *
 * Reportado el 2026-09-03: "no hay forma de detener a Atlas, se queda
 * trabajando y si uno quiere detenerlo no se puede porque no hay cómo".
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  claveDeTurno,
  empezarTurno,
  terminarTurno,
  pedirDetener,
  hayTurnoEnVuelo,
  fueDetenido,
  olvidarTurnos,
} from "../turnos-en-vuelo";

beforeEach(() => olvidarTurnos());

describe("detener el turno de Atlas", () => {
  it("un turno recién empezado no está detenido", () => {
    const senal = empezarTurno(claveDeTurno("t1", "default"));
    expect(fueDetenido(senal)).toBe(false);
    expect(hayTurnoEnVuelo(claveDeTurno("t1", "default"))).toBe(true);
  });

  it("pedir detener aborta la señal del turno", () => {
    const clave = claveDeTurno("t1", "default");
    const senal = empezarTurno(clave);
    expect(pedirDetener(clave)).toBe(true);
    expect(fueDetenido(senal)).toBe(true);
  });

  /**
   * La ruta contesta con esto, así que tiene que ser la verdad: si el turno
   * terminó justo antes de que llegara el pedido, no se cortó nada.
   */
  it("dice que no había nada que detener cuando el turno ya terminó", () => {
    const clave = claveDeTurno("t1", "default");
    empezarTurno(clave);
    terminarTurno(clave);
    expect(pedirDetener(clave)).toBe(false);
  });

  it("detener algo que nunca existió no rompe", () => {
    expect(pedirDetener(claveDeTurno("t1", "jamas"))).toBe(false);
  });

  /**
   * REGRESIÓN. La clave lleva el tenant además de la sesión: `default` es el
   * id por defecto y lo tienen TODOS los negocios a la vez. Con la sesión
   * sola, el botón de parar de un cliente cortaba el turno de otro.
   */
  it("parar el turno de un negocio no toca el del otro", () => {
    const senalA = empezarTurno(claveDeTurno("negocio-A", "default"));
    const senalB = empezarTurno(claveDeTurno("negocio-B", "default"));

    pedirDetener(claveDeTurno("negocio-A", "default"));

    expect(fueDetenido(senalA)).toBe(true);
    expect(fueDetenido(senalB)).toBe(false);
  });

  /**
   * Dos turnos vivos sobre la MISMA charla se pisan el historial, así que
   * mandar un pedido nuevo sin esperar corta el anterior.
   */
  it("empezar un turno nuevo en la misma charla aborta el anterior", () => {
    const clave = claveDeTurno("t1", "default");
    const viejo = empezarTurno(clave);
    const nuevo = empezarTurno(clave);

    expect(fueDetenido(viejo)).toBe(true);
    expect(fueDetenido(nuevo)).toBe(false);
  });

  /** Sesiones distintas del mismo negocio son turnos distintos. */
  it("separa dos charlas del mismo negocio", () => {
    const senal1 = empezarTurno(claveDeTurno("t1", "charla-1"));
    const senal2 = empezarTurno(claveDeTurno("t1", "charla-2"));

    pedirDetener(claveDeTurno("t1", "charla-1"));

    expect(fueDetenido(senal1)).toBe(true);
    expect(fueDetenido(senal2)).toBe(false);
  });

  it("sin señal, nada está detenido", () => {
    expect(fueDetenido(undefined)).toBe(false);
  });
});
