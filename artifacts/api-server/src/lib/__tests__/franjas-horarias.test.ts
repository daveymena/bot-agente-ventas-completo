import { describe, it, expect } from "vitest";
import {
  analizarFranjas,
  deberiaEstarEncendido,
  agruparPorHora,
  RESULTADOS_MINIMOS,
  MAX_HORAS_APAGADAS,
  type HoraDelDia,
} from "../franjas-horarias";

/**
 * Apagar los anuncios en las horas muertas.
 *
 * Lo que estas pruebas cuidan no es que "funcione": es que NO apague de más.
 * Un dayparting equivocado no rompe nada y no aparece en ningún log -- el
 * gasto baja, el panel se ve más eficiente, y el negocio simplemente vende
 * menos. Por eso la mitad de los casos son sobre cuándo el sistema tiene que
 * abstenerse.
 */

const hora = (h: number, gasto: number, resultados: number): HoraDelDia => ({
  hora: h, gasto, impresiones: gasto * 10, clics: gasto / 10, resultados,
});

/** Un día parejo: todas las horas rinden igual. */
const dia = (fn: (h: number) => [number, number]): HoraDelDia[] =>
  Array.from({ length: 24 }, (_, h) => {
    const [g, r] = fn(h);
    return hora(h, g, r);
  });

describe("sin muestra no se apaga nada", () => {
  it("una cuenta sin historial no autoriza ningún apagado", () => {
    const v = analizarFranjas([]);
    expect(v.suficiente).toBe(false);
    expect(v.muertas).toEqual([]);
    expect(v.porQue).toContain("historial");
  });

  it("con gasto pero sin resultados suficientes, se abstiene", () => {
    // 6 conversiones repartidas en 24 horas: basta una compra de casualidad a
    // las 4am para que la madrugada parezca el momento de oro.
    const v = analizarFranjas(dia((h) => [100, h % 4 === 0 ? 1 : 0]));
    expect(v.suficiente).toBe(false);
    expect(v.porQue).toContain(String(RESULTADOS_MINIMOS));
  });

  it("gasto en cero: no se inventa una conclusión", () => {
    const v = analizarFranjas(dia(() => [0, 0]));
    expect(v.suficiente).toBe(false);
    expect(v.porQue).toContain("gasto");
  });

  it("y mientras no haya datos, TODO sigue encendido", () => {
    const v = analizarFranjas([]);
    for (let h = 0; h < 24; h++) {
      expect(deberiaEstarEncendido(h, v).encendido, `${h}h`).toBe(true);
    }
  });
});

describe("con muestra, encuentra las franjas que solo gastan", () => {
  // Un negocio real: vende de día, la madrugada consume sin devolver.
  const conMadrugadaMuerta = dia((h) => (h >= 2 && h <= 6 ? [200, 0] : [200, 4]));

  it("marca la madrugada como muerta", () => {
    const v = analizarFranjas(conMadrugadaMuerta);
    expect(v.suficiente).toBe(true);
    expect(v.muertas).toEqual([2, 3, 4, 5, 6]);
  });

  it("y esas horas quedan apagadas, con motivo", () => {
    const v = analizarFranjas(conMadrugadaMuerta);
    const r = deberiaEstarEncendido(3, v);
    expect(r.encendido).toBe(false);
    expect(r.porQue).toContain("3h");

    expect(deberiaEstarEncendido(13, v).encendido).toBe(true);
  });

  it("NO apaga la madrugada cuando la madrugada es lo que vende", () => {
    // El caso que justifica todo este archivo: el negocio que le vende a gente
    // que trabaja de noche. Escribir "de 1 a 7 está muerto" le habría cortado
    // su mejor franja sin que nadie se entere.
    const alReves = dia((h) => (h >= 2 && h <= 6 ? [200, 8] : [200, 1]));
    const v = analizarFranjas(alReves);
    expect(v.suficiente).toBe(true);
    for (const h of [2, 3, 4, 5, 6]) {
      expect(v.muertas, `${h}h`).not.toContain(h);
      expect(deberiaEstarEncendido(h, v).encendido, `${h}h`).toBe(true);
    }
    expect(v.pico).toEqual(expect.arrayContaining([2, 3, 4, 5, 6]));
  });

  it("una hora cara pero no el doble de cara se deja tranquila", () => {
    // Por definición la mitad de las horas está peor que el promedio. Apagar
    // la mitad peor del día termina sin ninguna hora encendida.
    const v = analizarFranjas(dia((h) => (h === 10 ? [200, 3] : [200, 4])));
    expect(v.muertas).not.toContain(10);
  });
});

describe("los frenos de seguridad", () => {
  it("nunca apaga más horas de las permitidas", () => {
    // Campaña mala: casi todo el día gasta sin devolver. Eso NO es un problema
    // de horario, y apagar 20 franjas sería una campaña pausada disfrazada de
    // optimización que nadie vuelve a revisar.
    const casiTodoMuerto = dia((h) => (h >= 6 && h <= 8 ? [200, 10] : [200, 0]));
    const v = analizarFranjas(casiTodoMuerto);
    expect(v.muertas.length).toBeLessThanOrEqual(MAX_HORAS_APAGADAS);
    expect(v.porQue).toContain("seguridad");
  });

  it("si ninguna franja rinde mejor que el promedio, no toca nada", () => {
    // Rendimiento idéntico en las 24 horas: no hay nada que optimizar por
    // horario, y fingir que sí sería apagar al azar.
    const v = analizarFranjas(dia(() => [200, 4]));
    expect(v.muertas).toEqual([]);
  });

  it("una hora con gasto ínfimo no se juzga", () => {
    // Se llevó el 0.1% del gasto: no hay con qué afirmar nada sobre ella.
    const horas = dia((h) => (h === 4 ? [1, 0] : [500, 5]));
    const v = analizarFranjas(horas);
    expect(v.muertas).not.toContain(4);
  });
});

describe("lo que devuelve Meta se agrupa bien", () => {
  it("suma todos los días de la misma hora", () => {
    const filas = [
      { hourly_stats_aggregated_by_advertiser_time_zone: "13:00:00 - 13:59:59", spend: "100", impressions: "1000", clicks: "10", actions: [{ action_type: "purchase", value: "2" }] },
      { hourly_stats_aggregated_by_advertiser_time_zone: "13:00:00 - 13:59:59", spend: "50", impressions: "500", clicks: "5", actions: [{ action_type: "purchase", value: "1" }] },
      { hourly_stats_aggregated_by_advertiser_time_zone: "03:00:00 - 03:59:59", spend: "80", impressions: "800", clicks: "2", actions: [] },
    ];
    const r = agruparPorHora(filas);
    expect(r).toHaveLength(2);
    const trece = r.find((h) => h.hora === 13)!;
    expect(trece.gasto).toBe(150);
    expect(trece.resultados).toBe(3);
    expect(r.find((h) => h.hora === 3)!.resultados).toBe(0);
  });

  it("cuenta como resultado lo mismo que el resto del sistema", () => {
    // Que dos partes cuenten distinto el mismo número es peor que no contarlo.
    const filas = [{
      hourly_stats_aggregated_by_advertiser_time_zone: "09:00:00 - 09:59:59",
      spend: "10",
      actions: [
        { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "4" },
        { action_type: "lead", value: "1" },
        { action_type: "post_engagement", value: "99" },
      ],
    }];
    // El engagement NO es un resultado: si contara, cualquier hora con muchos
    // "me gusta" parecería la mejor del día.
    expect(agruparPorHora(filas)[0].resultados).toBe(5);
  });

  it("una fila con etiqueta rara se ignora en vez de romper", () => {
    const r = agruparPorHora([
      { hourly_stats_aggregated_by_advertiser_time_zone: "", spend: "10" },
      { spend: "10" },
      { hourly_stats_aggregated_by_advertiser_time_zone: "07:00:00 - 07:59:59", spend: "10" },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].hora).toBe(7);
  });
});
