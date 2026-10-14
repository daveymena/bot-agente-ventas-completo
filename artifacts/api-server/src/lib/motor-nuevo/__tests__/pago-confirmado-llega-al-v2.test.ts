/**
 * REGRESIÓN — el pago confirmado por una persona tiene que llegar al motor.
 *
 * El fallo (auditoría 2026-10-13): `estado.pagoConfirmadoPorHumano` es la
 * bandera que habilita decir "puedes entregar el acceso", y **no tenía ningún
 * escritor**. El dueño confirmaba la transferencia desde el panel
 * (`confirm_transfer_payment` → `conversations.paymentStatus = "confirmed"`),
 * pero el motor v2 nunca leía esa columna. El cliente que YA PAGÓ seguía
 * leyendo "está en verificación" para siempre: la venta se cerraba y la
 * postventa se rompía.
 *
 * Se arregla en `conPagoConfirmadoPorLaBase`, aplicado al cargar el estado.
 */
import { describe, test, expect } from "vitest";
import {
  conPagoConfirmadoPorLaBase,
  describirEstado,
  estadoInicial,
} from "../estado-conversacion";

describe("el pago confirmado por una persona llega al estado del motor", () => {
  test("paymentStatus=confirmed enciende la bandera", () => {
    const estado = estadoInicial(7);
    expect(estado.pagoConfirmadoPorHumano).toBe(false);
    const r = conPagoConfirmadoPorLaBase(estado, { paymentStatus: "confirmed" });
    expect(r.pagoConfirmadoPorHumano).toBe(true);
  });

  test("paymentStatus=approved también (lo usa la pasarela)", () => {
    const r = conPagoConfirmadoPorLaBase(estadoInicial(7), { paymentStatus: "approved" });
    expect(r.pagoConfirmadoPorHumano).toBe(true);
  });

  test("tolera mayúsculas y espacios del panel", () => {
    const r = conPagoConfirmadoPorLaBase(estadoInicial(7), { paymentStatus: "  Confirmed  " });
    expect(r.pagoConfirmadoPorHumano).toBe(true);
  });

  test("un pago sin confirmar NO enciende nada", () => {
    for (const marca of ["pending", "rejected", "refunded", "", null, undefined]) {
      const r = conPagoConfirmadoPorLaBase(estadoInicial(7), { paymentStatus: marca });
      expect(r.pagoConfirmadoPorHumano).toBe(false);
    }
  });

  test("fila ausente o columna que no existe no rompe", () => {
    expect(conPagoConfirmadoPorLaBase(estadoInicial(7), null).pagoConfirmadoPorHumano).toBe(false);
    expect(conPagoConfirmadoPorLaBase(estadoInicial(7), {}).pagoConfirmadoPorHumano).toBe(false);
  });

  test("dirección única: la base enciende, nunca apaga", () => {
    // Si una persona ya confirmó, un estado viejo del motor no lo deshace.
    const yaConfirmado = { ...estadoInicial(7), pagoConfirmadoPorHumano: true };
    const r = conPagoConfirmadoPorLaBase(yaConfirmado, { paymentStatus: "pending" });
    expect(r.pagoConfirmadoPorHumano).toBe(true);
  });

  test("no muta el estado que recibe", () => {
    const estado = estadoInicial(7);
    conPagoConfirmadoPorLaBase(estado, { paymentStatus: "confirmed" });
    expect(estado.pagoConfirmadoPorHumano).toBe(false);
  });
});

describe("lo que el vendedor LEE según el pago", () => {
  test("cliente que dice que pagó y nadie verificó: no entrega, avisa que verifican", () => {
    const estado = { ...estadoInicial(7), comprobanteRecibido: true, pagoConfirmadoPorHumano: false };
    const texto = describirEstado(estado);
    expect(texto).toMatch(/NINGUNA persona lo verificó/i);
    expect(texto).not.toMatch(/Puedes entregar el acceso/);
  });

  test("pago confirmado por el equipo: puede entregar", () => {
    const estado = { ...estadoInicial(7), comprobanteRecibido: true, pagoConfirmadoPorHumano: true };
    const texto = describirEstado(estado);
    expect(texto).toMatch(/Puedes entregar el acceso/);
    // Ya no debe decir que falta verificación.
    expect(texto).not.toMatch(/NINGUNA persona lo verificó/i);
  });

  test("el camino completo: panel confirma → el vendedor ya puede entregar", () => {
    // 1. El cliente manda el comprobante y el motor lo registra.
    const trasComprobante = { ...estadoInicial(7), comprobanteRecibido: true };
    expect(describirEstado(trasComprobante)).toMatch(/NINGUNA persona lo verificó/i);

    // 2. El dueño confirma en el panel (conversations.paymentStatus = "confirmed").
    const cargadoDeLaBase = conPagoConfirmadoPorLaBase(trasComprobante, {
      paymentStatus: "confirmed",
    });

    // 3. El siguiente turno ya entrega. ESTE es el eslabón que faltaba.
    expect(describirEstado(cargadoDeLaBase)).toMatch(/Puedes entregar el acceso/);
  });
});
