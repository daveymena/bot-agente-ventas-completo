/**
 * Venta real perdida (conversación 2, 06-10): pedido confirmado en Bogotá que
 * Dropi rechazó por el departamento. Se mandaba "BOGOTA D C"; Dropi nombra a
 * Bogotá ciudad "BOGOTA", departamento "CUNDINAMARCA" (verificado 07-10 contra
 * su cotizador con el token del negocio).
 */
import { describe, it, expect } from "vitest";
import { destinoParaDropi } from "../dropi-directo";

describe("destinoParaDropi", () => {
  it("el caso real: Bogotá / Bogotá D.C.", () => {
    expect(destinoParaDropi("Bogotá", "Bogotá D.C.")).toEqual({ city: "BOGOTA", state: "CUNDINAMARCA" });
  });
  it("variantes de Bogotá en la ciudad o en el departamento", () => {
    for (const [c, d] of [["Bogota D.C", ""], ["BOGOTÁ DC", "Cundinamarca"], ["Bogotá", "Distrito Capital"], ["Santa Fe de Bogotá", ""]]) {
      expect(destinoParaDropi(c, d)).toEqual({ city: "BOGOTA", state: "CUNDINAMARCA" });
    }
  });
  it("otras ciudades no se tocan (salvo el nombre completo del Valle)", () => {
    expect(destinoParaDropi("Cali", "Valle")).toEqual({ city: "CALI", state: "VALLE DEL CAUCA" });
    expect(destinoParaDropi("Medellín", "Antioquia")).toEqual({ city: "MEDELLIN", state: "ANTIOQUIA" });
    expect(destinoParaDropi("Soacha", "Cundinamarca")).toEqual({ city: "SOACHA", state: "CUNDINAMARCA" });
  });
});
