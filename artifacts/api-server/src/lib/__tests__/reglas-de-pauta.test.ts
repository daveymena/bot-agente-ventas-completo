import { describe, it, expect } from "vitest";
import {
  decidirSobreConjunto,
  estaEnAprendizaje,
  siguientePresupuesto,
  planDeEscalada,
  convieneImpulsar,
  revisarCadenciaOrganica,
  MAX_ESCALADA_PORCENTAJE,
  type EstadoConjunto,
} from "../reglas-de-pauta";

/**
 * Las reglas con las que trabaja una agencia de verdad, investigadas el
 * 2026-08-29 y transcritas al código.
 *
 * Lo que había antes no coincidía con la práctica:
 *   · `marketing-strategist.ts` aconsejaba escalar "máx. 30% por paso" -- y un
 *     30% RESETEA la fase de aprendizaje de Meta.
 *   · `scaling-agent.ts` escalaba desde `const current = 50000; // estimado`.
 *   · No existía la noción de fase de aprendizaje, ni espaciado entre cambios,
 *     ni criterio de corte.
 */

const base: EstadoConjunto = {
  conversiones7d: 60,
  presupuestoDiario: 20_000,
  horasDesdeUltimoCambio: 72,
  cpaActual: 1_000,
  cpaObjetivo: 1_200,
  diasConCpaAlto: 0,
  gastoAcumulado: 140_000,
};

describe("El orden de las reglas es la regla", () => {
  it("cortar gana sobre todo lo demás", () => {
    // Aunque esté en aprendizaje y aunque no se haya tocado nunca: cero ventas
    // con el doble del presupuesto no es "todavía aprende", es que no anda.
    const d = decidirSobreConjunto({
      ...base,
      conversiones7d: 0,
      gastoAcumulado: 40_000, // 2x de 20.000
      horasDesdeUltimoCambio: null,
    });
    expect(d.accion).toBe("cortar");
    expect(d.motivo).toContain("sin una sola conversión");
  });

  it("el CPA alto sostenido frena la escalada, no la dispara", () => {
    // El error caro es subirle el presupuesto a algo que ya viene caro.
    const d = decidirSobreConjunto({ ...base, cpaActual: 2_000, cpaObjetivo: 1_200, diasConCpaAlto: 3 });
    expect(d.accion).toBe("revisar");
    expect(d.motivo).toContain("No subir presupuesto");
  });

  it("un solo día de CPA alto es ruido, no tendencia", () => {
    const d = decidirSobreConjunto({ ...base, cpaActual: 2_000, cpaObjetivo: 1_200, diasConCpaAlto: 1 });
    expect(d.accion).not.toBe("revisar");
  });

  it("en fase de aprendizaje NO se toca nada", () => {
    // La regla que más plata ahorra y la que más se rompe: a los dos días
    // todavía no se ve nada, y el impulso es corregir igual.
    const d = decidirSobreConjunto({ ...base, conversiones7d: 20 });
    expect(d.accion).toBe("esperar");
    expect(d.motivo).toContain("fase de aprendizaje");
  });

  it("50 conversiones es el umbral exacto", () => {
    expect(estaEnAprendizaje(49)).toBe(true);
    expect(estaEnAprendizaje(50)).toBe(false);
  });

  it("aunque haya salido de aprendizaje, hay que esperar 48 h entre cambios", () => {
    const d = decidirSobreConjunto({ ...base, horasDesdeUltimoCambio: 12 });
    expect(d.accion).toBe("esperar");
    expect(d.motivo).toContain("48 h entre cambios");
  });

  it("con todo en orden, escala -- y solo hasta el 20%", () => {
    const d = decidirSobreConjunto(base);
    expect(d.accion).toBe("escalar");
    expect(d.presupuestoSugerido).toBeDefined();
    const subida = ((d.presupuestoSugerido! / base.presupuestoDiario) - 1) * 100;
    expect(subida).toBeLessThanOrEqual(MAX_ESCALADA_PORCENTAJE);
    expect(subida).toBeGreaterThan(0);
  });
});

describe("El escalón de presupuesto", () => {
  it("nunca se pasa del 20%, porque pasarse reinicia el aprendizaje", () => {
    // Se redondea hacia ABAJO justamente para garantizar esto.
    for (const actual of [5_000, 20_000, 50_000, 120_000, 999_999]) {
      const s = siguientePresupuesto(actual);
      expect(s / actual, `desde ${actual}`).toBeLessThanOrEqual(1 + MAX_ESCALADA_PORCENTAJE / 100);
      expect(s, `desde ${actual}`).toBeGreaterThan(actual);
    }
  });

  it("da números que un humano puede leer", () => {
    // Un +20% exacto sobre un número feo da un número más feo, y el admin
    // tiene que poder mirarlo y entenderlo.
    expect(siguientePresupuesto(20_000) % 1_000).toBe(0);
    expect(siguientePresupuesto(200_000) % 5_000).toBe(0);
  });

  it("un presupuesto en cero no rompe nada", () => {
    expect(siguientePresupuesto(0)).toBe(0);
    expect(siguientePresupuesto(-5)).toBe(0);
  });
});

describe("Pasar de un presupuesto a otro es un plan, no un cambio", () => {
  it("de 20.000 a 100.000 son varios pasos con sus esperas", () => {
    // Responder esto por adelantado es lo que evita el salto de golpe.
    const pasos = planDeEscalada(20_000, 100_000);
    expect(pasos.length).toBeGreaterThan(3);
    expect(pasos[pasos.length - 1].presupuesto).toBe(100_000);
    for (const p of pasos) expect(p.esperaHoras).toBe(48);
  });

  it("cada paso respeta el 20%", () => {
    const pasos = planDeEscalada(20_000, 100_000);
    let previo = 20_000;
    for (const p of pasos) {
      expect(p.presupuesto / previo).toBeLessThanOrEqual(1.2001);
      previo = p.presupuesto;
    }
  });

  it("si ya está en el objetivo, no hay pasos", () => {
    expect(planDeEscalada(50_000, 50_000)).toEqual([]);
    expect(planDeEscalada(50_000, 10_000)).toEqual([]);
  });

  it("un objetivo absurdo no cuelga el proceso", () => {
    // Sin el tope, esto seria una lista infinita.
    expect(planDeEscalada(100, 999_999_999).length).toBeLessThanOrEqual(30);
  });
});

describe("Impulsar un post o armar un anuncio", () => {
  it("para vender, el boost no alcanza", () => {
    // Un post impulsado no tiene objetivo de conversión ni segmentación real.
    const r = convieneImpulsar({ interacciones: 500, alcance: 1_000, objetivo: "conversion" });
    expect(r.impulsar).toBe(false);
    expect(r.motivo).toContain("crear_anuncio");
  });

  it("se impulsa lo que YA funciona solo", () => {
    // La regla de 2026: el algoritmo premia primero lo orgánico que rinde.
    const r = convieneImpulsar({ interacciones: 80, alcance: 1_000, objetivo: "reconocimiento" });
    expect(r.impulsar).toBe(true);
    expect(r.motivo).toContain("ya funciona solo");
  });

  it("pagar por distribuir algo que nadie quiso no lo mejora", () => {
    const r = convieneImpulsar({ interacciones: 5, alcance: 1_000, objetivo: "reconocimiento" });
    expect(r.impulsar).toBe(false);
    expect(r.motivo).toContain("no funcionó solo");
  });

  it("con poca muestra no se decide", () => {
    // 10 de 20 es 50% de interacción y no significa nada.
    const r = convieneImpulsar({ interacciones: 10, alcance: 20, objetivo: "reconocimiento" });
    expect(r.impulsar).toBe(false);
    expect(r.motivo).toContain("poca muestra");
  });
});

describe("Cadencia orgánica", () => {
  const reels = (n: number) => Array.from({ length: n }, () => ({ formato: "reel" as const }));
  const textos = (n: number) => Array.from({ length: n }, () => ({ formato: "texto" as const }));

  it("menos de 4 por semana no sostiene el alcance", () => {
    const r = revisarCadenciaOrganica([...reels(1), ...textos(1)]);
    expect(r.alDia).toBe(false);
    expect(r.recomendacion).toContain("constancia");
  });

  it("publicar mucho sin video tampoco alcanza", () => {
    // Reels y video nativo son los formatos de más alcance; texto y enlaces,
    // los de menos.
    const r = revisarCadenciaOrganica(textos(5));
    expect(r.alDia).toBe(false);
    expect(r.recomendacion).toContain("ningún video");
  });

  it("cuatro publicaciones con un video está bien", () => {
    const r = revisarCadenciaOrganica([...reels(1), ...textos(3)]);
    expect(r.alDia).toBe(true);
    expect(r.recomendacion).toContain("Sostenerla");
  });
});
