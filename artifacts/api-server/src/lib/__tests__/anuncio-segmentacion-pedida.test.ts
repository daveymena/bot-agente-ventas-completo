/**
 * Producción 07/08-10: Atlas acordó "carrusel, 25-55 años, Bogotá, Medellín,
 * Cali, Barranquilla, Bucaramanga, Cartagena", crear_anuncio no lo recibía y el
 * anuncio salió de una imagen, 18-65, a todo el país (y las ciudades se
 * mandaban por nombre, junto con el país, que en Meta suma el país entero).
 */
import { describe, it, expect } from "vitest";
import { segmentacionPedida, describirSegmentacion } from "../anuncio-segmentacion-pedida";
import { geoConCiudades, usarAdvantagePlus } from "../facebook";

const SEIS = ["Bogotá", "Medellín", "Cali", "Barranquilla", "Bucaramanga", "Cartagena"];

describe("segmentación pedida por el admin", () => {
  it("el caso real queda guardado tal cual", () => {
    const { estrategia } = segmentacionPedida({ edadMin: 25, edadMax: 55, ciudades: SEIS });
    expect(estrategia).toEqual({ ageMin: 25, ageMax: 55, ciudades: SEIS });
    expect(describirSegmentacion(estrategia)).toBe(`25–55 años · en ${SEIS.join(", ")}`);
  });
  it("ciudades separadas por coma, género y edades invertidas", () => {
    const { estrategia } = segmentacionPedida({ edadMin: 55, edadMax: 25, ciudades: "Bogotá, Cali", generos: "mujeres" });
    expect(estrategia).toEqual({ ageMin: 25, ageMax: 55, ciudades: ["Bogotá", "Cali"], genders: [2] });
  });
  it("sin pedido no se inventa nada", () => {
    expect(segmentacionPedida({}).estrategia).toEqual({});
    expect(describirSegmentacion({})).toBe("");
  });
});

describe("Meta: ciudades", () => {
  it("con ciudades NO va el país (sumaría todo el país) y van por su clave", () => {
    const g = geoConCiudades(["CO"], [{ key: "2673660" }, { key: "2674011" }]);
    expect(g.countries).toBeUndefined();
    expect(g.cities.map((c: any) => c.key)).toEqual(["2673660", "2674011"]);
  });
  it("sin ciudades, el país", () => {
    expect(geoConCiudades(["CO"], [])).toEqual({ countries: ["CO"] });
  });
  it("pedir ciudades apaga Advantage+ (no se ensancha a todo el país)", () => {
    expect(usarAdvantagePlus({ geoLocations: { cities: ["Bogotá"] } })).toBe(false);
    expect(usarAdvantagePlus({})).toBe(true);
  });
});
