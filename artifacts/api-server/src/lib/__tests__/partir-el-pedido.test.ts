/**
 * Partir un pedido de varias cosas para entregarlo de a una.
 *
 * Pedido del admin el 2026-09-04: "si le pido un conjunto me debe dar por
 * partes para que no se cuelgue".
 *
 * El mecanismo existía y la entrega por partes se conectó en esa misma sesión,
 * pero medido contra las formas en que se pide de verdad NO SE DISPARABA NUNCA:
 * cuatro de cuatro pedidos reales quedaban sin partir. La regla exigía un verbo
 * de acción en CADA parte, y así no habla nadie -- en una enumeración el verbo
 * se dice una vez y gobierna a todas.
 */
import { describe, it, expect } from "vitest";
import { partirElPedido } from "../partir-el-pedido";

describe("pedidos reales que antes NO se partían", () => {
  it("mostrame el copy, la estrategia, la segmentacion y el presupuesto", () => {
    const r = partirElPedido("mostrame el copy, la estrategia, la segmentacion, el seguimiento y el presupuesto");
    expect(r).not.toBeNull();
    expect(r!.primera).toContain("copy");
    expect(r!.pendientes.length).toBeGreaterThanOrEqual(3);
  });

  it("dame el copy, el publico y las metricas", () => {
    const r = partirElPedido("dame el copy del anuncio, el publico al que apuntar y las metricas que voy a mirar");
    expect(r).not.toBeNull();
    expect(r!.primera).toContain("copy");
  });

  it("necesito el copy, la segmentacion y el plan de seguimiento", () => {
    const r = partirElPedido("necesito el copy para el anuncio, la segmentacion del publico y el plan de seguimiento");
    expect(r).not.toBeNull();
  });

  /** La primera del pedido es la primera que se entrega: es lo que el admin
   *  espera ver primero. */
  it("respeta el orden en que lo pidió", () => {
    const r = partirElPedido("armame la estrategia completa, el copy del anuncio y el presupuesto diario");
    expect(r!.primera).toContain("estrategia");
    expect(r!.pendientes[0]).toContain("copy");
  });
});

describe("lo que NO se parte, y por buenas razones", () => {
  /** Un pedido corto es uno solo: partirlo es inventar trabajo. */
  it("un pedido de una sola cosa", () => {
    expect(partirElPedido("mostrame el copy")).toBeNull();
    expect(partirElPedido("creame un anuncio para el curso de piano")).toBeNull();
  });

  /**
   * REGRESIÓN CARA. Estos son PARÁMETROS de una sola tarea, no tres tareas.
   * Partirlo hacía que Atlas contestara solo el ángulo y dejara "destino
   * WhatsApp" y "presupuesto" como pendientes, que es absurdo (visto en vivo
   * el 2026-08-12).
   */
  it("los parámetros de una sola tarea no son tres tareas", () => {
    const r = partirElPedido("crea el anuncio con angulo de fe, destino WhatsApp, presupuesto 10000");
    // "angulo de fe" y "destino WhatsApp" no son entregables: no llegan a tres.
    expect(r).toBeNull();
  });

  /**
   * REGRESIÓN CARA. Del 16-08-2026: partir por comas producía pedazos de frase
   * que se le mostraban al admin como tareas pendientes. Apareció como
   * pendiente "descripcion y CTA) y crealo como BORRADOR ... NO lo publiques"
   * -- un fragmento cortado dentro de un paréntesis.
   */
  it("un fragmento con paréntesis sin cerrar frena todo", () => {
    const r = partirElPedido("creame el copy (con titulo, descripcion y CTA) y crealo como BORRADOR con la estrategia y el presupuesto");
    // Alguna parte con entregable queda desbalanceada -> no se parte nada.
    expect(r).toBeNull();
  });

  /** "NO lo publiques" es una restricción, no una tarea. */
  it("una negación no se convierte en tarea pendiente", () => {
    const r = partirElPedido("dame el copy, la estrategia, el presupuesto, no publiques el anuncio todavia");
    expect(r).toBeNull();
  });

  /** Sin verbo de pedido al principio no es una enumeración de tareas. */
  it("sin verbo al principio no se parte", () => {
    expect(partirElPedido("el copy, la estrategia y el presupuesto estan bien como estan ahora")).toBeNull();
  });

  it("no rompe con vacío", () => {
    expect(partirElPedido("")).toBeNull();
    expect(partirElPedido(undefined as any)).toBeNull();
  });
});
