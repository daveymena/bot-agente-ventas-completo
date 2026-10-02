/**
 * SEGMENTACIÓN INTELIGENTE — la decisión se prueba sin base ni Dropi
 * ================================================================
 *
 * La decisión de recomendar una ciudad es pura: si una ciudad tiene cobertura
 * o NO es un dato; cuántos pedidos tuyos tuvieron rechazo es un dato; y lo que
 * se recomienda se deduce de eso. Los fallos reales están en lo que lo puede
 * bloquear (Dropi apagado, sin pedidos) — y eso se fija acá también.
 */

import { describe, it, expect } from "vitest";
import { calificarCiudad, ordenarEstudio, estudioATexto, rangoDePublico, interesesDeReferencias } from "../segmentacion-inteligente";

describe("calificarCiudad", () => {
  it("cubierto + ventas sin rechazos = recomendada, con el porqué", () => {
    const c = calificarCiudad({ ciudad: "Cali", departamento: "Valle del Cauca", cubierta: true, pedidos: 6, rechazados: 0 });
    expect(c.recomendada).toBe(true);
    expect(c.tasaRiesgo).toBe(0);
    expect(c.porque).toMatch(/cobertura con contraentrega confirmada/);
    expect(c.porque).toMatch(/6 pedidos/);
  });

  it("sin cobertura se recomienda NO (el pedido se rechaza ahí)", () => {
    const c = calificarCiudad({ ciudad: "Leticia", departamento: null, cubierta: false, pedidos: 2, rechazados: 1 });
    expect(c.recomendada).toBe(false);
    expect(c.porque).toMatch(/NO la tiene en cobertura/);
  });

  it("riesgo alto también la cae, aunque la cubra", () => {
    // 2 de 4 rechazados (50% > 34%): se vendió ahí y NO paga bien.
    const c = calificarCiudad({ ciudad: "Palmira", cubierta: true, pedidos: 4, rechazados: 2 });
    expect(c.recomendada).toBe(false);
    expect(c.tasaRiesgo).toBe(0.5);
    expect(c.porque).toMatch(/2 de 4 pedidos rechazados/);
  });

  it("sin pedidos: riesgo sin medir, y se DICE (no se promete seguro)", () => {
    const c = calificarCiudad({ ciudad: "Bogotá", cubierta: true, pedidos: 0, rechazados: 0 });
    expect(c.recomendada).toBe(true);
    expect(c.tasaRiesgo).toBeNull();
    expect(c.porque).toMatch(/riesgo sin medir/);
  });

  it("cubierto=null (Dropi sin datos): recomendada con el aviso, no con promesa", () => {
    const c = calificarCiudad({ ciudad: "Medellín", cubierta: null, pedidos: 0, rechazados: 0 });
    expect(c.recomendada).toBe(true);
    expect(c.porque).toMatch(/sin confirmar/);
  });
});

describe("ordenarEstudio", () => {
  it("primero las recomendadas; dentro de ellas, las con más ventas", () => {
    const lista = ordenarEstudio([
      calificarCiudad({ ciudad: "Leticia", cubierta: false, pedidos: 1, rechazados: 1 }), // no recomendada
      calificarCiudad({ ciudad: "Cali", cubierta: true, pedidos: 6, rechazados: 0 }),     // recomendada, 6
      calificarCiudad({ ciudad: "Palmira", cubierta: true, pedidos: 2, rechazados: 0 }),  // recomendada, 2
    ]);
    expect(lista.map((c) => c.ciudad)).toEqual(["Cali", "Palmira", "Leticia"]);
  });
});

describe("estudioATexto", () => {
  it("separa recomendadas de las que evitar", () => {
    const t = estudioATexto(ordenarEstudio([
      calificarCiudad({ ciudad: "Cali", cubierta: true, pedidos: 6, rechazados: 0 }),
      calificarCiudad({ ciudad: "Leticia", cubierta: false, pedidos: 2, rechazados: 2 }),
    ]));
    expect(t).toMatch(/recomendadas.*Cali/is);
    expect(t).toMatch(/evitando.*Leticia/is);
  });

  it("sin ciudades, vacío (no inventa texto)", () => {
    expect(estudioATexto([])).toBe("");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * EL QUIÉN COMPRA (y el QUIÉN USA): un producto de bebé/mascota se le anuncia
 * al adulto responsable, no al que lo usa. Y los intereses salen de los
 * anuncios que el mercado está sosteniendo de verdad, no de la plantilla.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("rangoDePublico", () => {
  it("un producto de BEBÉ se anuncia al adulto responsable (24-45), no al bebé", () => {
    const r = rangoDePublico("bebes");
    expect(r.edadMin).toBe(24);
    expect(r.edadMax).toBe(45);
    expect(r.porque).toMatch(/adulto responsable/);
  });

  it("mujer / hombre: se le anuncia a quien lo usa", () => {
    expect(rangoDePublico("mujer").genero).toBe("mujeres");
    expect(rangoDePublico("hombre").genero).toBe("hombres");
    expect(rangoDePublico("unisex").genero).toBe("todos");
  });
});

describe("interesesDeReferencias: del anuncio real al interés que Meta conoce", () => {
  it("extrae los intereses de mascotas cuando los anuncios hablan de perros", () => {
    const refs = [
      { texto: "🐶 Si tu perro destruye todo…" },
      { texto: "para dueños de mascotas responsables" },
    ];
    const i = interesesDeReferencias(refs as any);
    expect(i).toContain("perros");
    expect(i.some((x) => /mascota/.test(x))).toBe(true);
  });

  it("un NOMBRE que Meta no tiene como interés NO se propone (lo ignoraría en silencio)", () => {
    const i = interesesDeReferencias([{ texto: "PosturePro™ es la mejor marca" }] as any);
    expect(i).not.toContain("posturepro");
  });

  it("sin referencias no hay intereses (no inventa de la plantilla)", () => {
    expect(interesesDeReferencias(null)).toEqual([]);
    expect(interesesDeReferencias([])).toEqual([]);
  });
});