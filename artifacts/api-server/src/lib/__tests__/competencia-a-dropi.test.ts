/**
 * De la página de la competencia al mismo producto en Dropi (pedido 06-10:
 * "muchos de ellos se encuentran en Dropi"). La búsqueda en Dropi es por
 * subcadena: con la marca de la otra tienda en la consulta no aparece nada.
 */
import { describe, it, expect } from "vitest";
import { palabrasClave, consultasParaDropi, coincidenciaTexto } from "../competencia-a-dropi";

const MARCAS = ["Baby Koala", "babykoala"];

describe("palabrasClave", () => {
  it("saca la marca de la otra tienda, relleno y números", () => {
    const k = palabrasClave("Almohada Baby Koala Antiplagiocefalia para Bebé 2 unidades Oferta", MARCAS);
    expect(k).toEqual(["almohada", "antiplagiocefalia", "bebe"]);
  });
  it("con el dominio pegado (babykoala) también la saca", () => {
    expect(palabrasClave("Almohada BabyKoala", ["babykoala"])).toEqual(["almohada"]);
  });
});

describe("consultasParaDropi", () => {
  it("de más específica a más amplia, sin la marca", () => {
    const q = consultasParaDropi("Almohada Baby Koala Antiplagiocefalia para Bebé", MARCAS);
    expect(q[0]).toBe("almohada antiplagiocefalia");
    expect(q).toContain("almohada");
    expect(q.join(" ")).not.toMatch(/koala|baby/);
  });
});

describe("coincidenciaTexto", () => {
  const clave = palabrasClave("Almohada Antiplagiocefalia para Bebé", []);
  it("el mismo producto con otro nombre de proveedor puntúa alto", () => {
    expect(coincidenciaTexto(clave, "ALMOHADA ANTIPLAGIOCEFALIA BEBE")).toBe(1);
    expect(coincidenciaTexto(clave, "Almohada cabeza plana bebé")).toBeGreaterThanOrEqual(0.6);
  });
  it("otro producto puntúa bajo", () => {
    expect(coincidenciaTexto(clave, "Corrector de postura en X")).toBe(0);
  });
});
