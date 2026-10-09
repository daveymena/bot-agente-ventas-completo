import { describe, it, expect } from "vitest";
import { presentacionDelNegocio, perfilPublico } from "../presentacion-del-negocio";

// 09-10-2026: "para servicios y abogacía no necesitan tiendas sino otro tipo de páginas".
describe("cómo se presenta el negocio", () => {
  it("un negocio que solo tiene servicios se presenta como servicios", () => {
    expect(presentacionDelNegocio({}, ["servicio", "servicio"])).toBe("servicios");
  });

  it("si mezcla servicios con productos sigue siendo tienda (la vitrina tiene su departamento de servicios)", () => {
    expect(presentacionDelNegocio({}, ["servicio", "fisico"])).toBe("tienda");
  });

  it("lo que eligió el dueño manda, en los dos sentidos", () => {
    expect(presentacionDelNegocio({ presentacion: "tienda" }, ["servicio"])).toBe("tienda");
    expect(presentacionDelNegocio({ presentacion: "servicios" }, ["fisico"])).toBe("servicios");
  });

  it("sin productos activos es tienda (no se adivina)", () => {
    expect(presentacionDelNegocio(null, [])).toBe("tienda");
  });
});

describe("lo que se publica del perfil", () => {
  it("solo campos públicos: nada del tono ni de lo que el agente no puede decir", () => {
    const p = perfilPublico({
      descripcion: "Abogados laboralistas en Cali", tono: "cercano", noPuede: ["prometer resultados"],
      horario: "L-V 8-18", credenciales: ["Tarjeta profesional 123456", "", "10 años en derecho laboral"],
    });
    expect(p).toEqual({
      descripcion: "Abogados laboralistas en Cali", horario: "L-V 8-18",
      credenciales: ["Tarjeta profesional 123456", "10 años en derecho laboral"],
    });
  });

  it("perfil vacío no inventa nada", () => {
    expect(perfilPublico(undefined)).toEqual({});
  });
});
