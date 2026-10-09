/**
 * Venta real perdida (06-10): Dropi rechazó por el nombre del departamento y
 * nadie volvió a intentarlo. Lo que es dato nuestro o una caída se reintenta;
 * lo que es del producto o de los datos del cliente, no.
 */
import { describe, it, expect } from "vitest";
import { esReintentable } from "../reintento-pedidos";

describe("esReintentable", () => {
  it("el caso real (departamento) y caídas momentáneas: sí", () => {
    expect(esReintentable("Dropi rechazó el pedido directo: The selected state is invalid.")).toBe(true);
    expect(esReintentable("Dropi rechazó el pedido directo: timeout")).toBe(true);
    expect(esReintentable("")).toBe(true);
  });
  it("producto archivado, sin stock o datos que faltan: no", () => {
    expect(esReintentable("El producto actualmente lo clasifica el proveedor como archivado")).toBe(false);
    expect(esReintentable("Dropi rechazó el pedido directo: sin stock")).toBe(false);
    expect(esReintentable("Faltan datos: dirección")).toBe(false);
  });
});
