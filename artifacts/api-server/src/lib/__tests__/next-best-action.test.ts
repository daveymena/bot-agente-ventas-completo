import { describe, it, expect } from "vitest";
import { siguienteAccion, type EntradaNBA } from "../next-best-action";

const base: EntradaNBA = {
  etapa: "presentation",
  estadoDePago: null,
  clienteEscribioUltimo: false,
  horasSinEscribir: 1,
  productosVistos: 1,
  objecionAbierta: null,
  seguimientoSinRespuesta: false,
};

describe("qué hacer con cada lead", () => {
  it("si te escribió y no le contestaste, eso gana a todo", () => {
    const r = siguienteAccion({ ...base, clienteEscribioUltimo: true, etapa: "closing" });
    expect(r.accion).toBe("responder");
    expect(r.prioridad).toBe(1);
  });

  it("si pagó, ya no se vende: se entrega", () => {
    const r = siguienteAccion({ ...base, estadoDePago: "confirmed", clienteEscribioUltimo: true });
    expect(r.accion).toBe("entregar");
  });

  it("llegó al cierre y no pagó: cobrarle", () => {
    expect(siguienteAccion({ ...base, etapa: "closing" }).accion).toBe("cobrar");
    expect(siguienteAccion({ ...base, etapa: "negotiating" }).prioridad).toBe(1);
  });

  it("objeción sin resolver: la venta está frenada por algo sabido", () => {
    const r = siguienteAccion({ ...base, objecionAbierta: "price" });
    expect(r.accion).toBe("resolver_objecion");
    expect(r.detalle).toContain("price");
  });

  /**
   * Insistirle a quien ya no contesta es lo que hace que bloqueen el número:
   * esta rama tiene que ganarle a cualquier otra que proponga escribir.
   */
  it("no insiste con quien ya no respondió un seguimiento", () => {
    const r = siguienteAccion({ ...base, seguimientoSinRespuesta: true, horasSinEscribir: 10 });
    expect(r.accion).toBe("esperar");
    expect(r.prioridad).toBe(5);
  });

  it("vio el producto y se enfrió: recuperable", () => {
    expect(siguienteAccion({ ...base, horasSinEscribir: 10 }).accion).toBe("recuperar");
  });

  it("ya no es recuperable pasada la semana", () => {
    expect(siguienteAccion({ ...base, horasSinEscribir: 8 * 24 }).accion).not.toBe("recuperar");
  });

  it("nunca vio una ficha: mostrarle algo", () => {
    expect(siguienteAccion({ ...base, productosVistos: 0 }).accion).toBe("mostrar_producto");
  });

  it("ningún lead se queda sin próxima acción", () => {
    const combinaciones: EntradaNBA[] = [];
    for (const etapa of ["greeting", "discovery", "presentation", "closing", "negotiating", null]) {
      for (const pago of [null, "pending", "confirmed"]) {
        for (const ultimo of [true, false]) {
          for (const horas of [0, 5, 200]) {
            for (const vistos of [0, 3]) {
              combinaciones.push({ ...base, etapa, estadoDePago: pago, clienteEscribioUltimo: ultimo, horasSinEscribir: horas, productosVistos: vistos });
            }
          }
        }
      }
    }
    for (const c of combinaciones) {
      const r = siguienteAccion(c);
      expect(r.accion).toBeTruthy();
      expect(r.detalle.length).toBeGreaterThan(5);
      expect(r.prioridad).toBeGreaterThanOrEqual(1);
      expect(r.prioridad).toBeLessThanOrEqual(5);
    }
  });
});
