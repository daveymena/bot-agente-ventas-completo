import { describe, it, expect } from "vitest";
import { validarDestinoDropi } from "../destino-dropi";

// Muestra con la forma de geografiaDeDropi(): departamentos con sus ciudades.
const geo = [
  { nombre: "VALLE DEL CAUCA", ciudades: ["CALI", "PALMIRA", "TULUA"] },
  { nombre: "CUNDINAMARCA", ciudades: ["BOGOTA", "SOACHA"] },
  { nombre: "ANTIOQUIA", ciudades: ["MEDELLIN", "BELLO"] },
];

describe("validarDestinoDropi", () => {
  it("acepta departamento y ciudad oficiales y devuelve los nombres de Dropi", () => {
    expect(validarDestinoDropi(geo, "Cali", "Valle del Cauca")).toEqual({
      ok: true,
      city: "CALI",
      state: "VALLE DEL CAUCA",
    });
  });

  it("acepta un departamento escrito corto si es único", () => {
    const r = validarDestinoDropi(geo, "Cali", "Valle");
    expect(r).toMatchObject({ ok: true, state: "VALLE DEL CAUCA" });
  });

  it("no adivina cuando el departamento corto es ambiguo", () => {
    const ambiguo = [...geo, { nombre: "VALLE DE SAN JUAN", ciudades: ["ORTEGA"] }];
    const r = validarDestinoDropi(ambiguo, "Cali", "Valle");
    expect(r.ok).toBe(false);
  });

  it("rechaza un departamento que no existe, con sugerencias", () => {
    const r = validarDestinoDropi(geo, "Cali", "Valle del Cuaca");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("no existe en Dropi");
  });

  it("rechaza una ciudad que no está en el departamento indicado", () => {
    const r = validarDestinoDropi(geo, "Medellin", "Valle del Cauca");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("no está en VALLE DEL CAUCA");
  });

  it("pide la ciudad y el departamento cuando faltan (caso del pedido de 16-10)", () => {
    const sinDepto = validarDestinoDropi(geo, "Cali", "");
    const sinCiudad = validarDestinoDropi(geo, "", "Valle del Cauca");
    expect(sinDepto.ok).toBe(false);
    expect(sinCiudad.ok).toBe(false);
    if (!sinDepto.ok) expect(sinDepto.motivo).toContain("Falta el departamento");
    if (!sinCiudad.ok) expect(sinCiudad.motivo).toContain("Falta la ciudad");
  });

  it("ignora tildes y mayúsculas", () => {
    expect(validarDestinoDropi(geo, "tuluá", "VALLE DEL CAUCA")).toMatchObject({ ok: true, city: "TULUA" });
  });
});
