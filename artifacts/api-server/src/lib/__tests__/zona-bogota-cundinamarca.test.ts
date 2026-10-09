/**
 * El formulario de la landing ofrece los departamentos de Dropi, y Dropi
 * nombra a Bogotá ciudad "BOGOTA", departamento "CUNDINAMARCA". La validación
 * esperaba "Bogotá D.C." y rechazaba con 400 a todo cliente de Bogotá (07-10).
 */
import { describe, it, expect } from "vitest";
import { verificarZona } from "../dropshipping";

const base = { nombre: "Ana", telefono: "3001234567", direccion: "Calle 1 # 2-3" } as any;

describe("verificarZona", () => {
  it("Bogotá con Cundinamarca (como lo da Dropi) se acepta", () => {
    expect(verificarZona({ ...base, ciudad: "BOGOTA", departamento: "CUNDINAMARCA" }, "CO").ok).toBe(true);
    expect(verificarZona({ ...base, ciudad: "Bogotá", departamento: "Cundinamarca" }, "CO").ok).toBe(true);
  });
  it("Bogotá con Bogotá D.C. sigue valiendo", () => {
    expect(verificarZona({ ...base, ciudad: "Bogotá", departamento: "Bogotá D.C." }, "CO").ok).toBe(true);
  });
  it("un error real sigue frenándose (Medellín en Cundinamarca)", () => {
    expect(verificarZona({ ...base, ciudad: "Medellín", departamento: "Cundinamarca" }, "CO").ok).toBe(false);
  });
});
