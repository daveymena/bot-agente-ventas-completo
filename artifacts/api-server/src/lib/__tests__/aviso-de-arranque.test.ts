/**
 * El primer mensaje de Atlas tiene que decir lo que va a hacer.
 *
 * Pedido del dueño (2026-09-24). El aviso viejo era siempre el mismo y prometía
 * "por etapas" hasta en un "¿cuántos productos tengo?", que no tiene etapas.
 */
import { describe, it, expect } from "vitest";
import { avisoDeArranque } from "../aviso-de-arranque";

describe("el aviso menciona lo que de verdad se pidió", () => {
  it("una pregunta de catálogo no promete etapas", () => {
    const a = avisoDeArranque("¿cuántos productos tengo?");
    expect(a).not.toBeNull();
    expect(a!.toLowerCase()).toContain("catálogo");
    expect(a!.toLowerCase()).not.toContain("etapa");
  });

  it("investigar la competencia", () => {
    const a = avisoDeArranque("investigá qué hace la competencia del curso de piano");
    expect(a).not.toBeNull();
    expect(a!.toLowerCase()).toContain("competencia");
  });

  it("crear un anuncio", () => {
    const a = avisoDeArranque("creame un anuncio para el curso de piano");
    expect(a).not.toBeNull();
    expect(a!.toLowerCase()).toContain("anuncio");
  });

  it("mirar cómo van las campañas", () => {
    const a = avisoDeArranque("cómo van mis campañas de facebook");
    expect(a).not.toBeNull();
    expect(a!.toLowerCase()).toContain("campañas");
    expect(a!.toLowerCase()).not.toContain("preparo el anuncio");
  });

  it("pausar una campaña es un cambio, no una creación", () => {
    const a = avisoDeArranque("pausá la campaña 123 que gasta mucho");
    expect(a).not.toBeNull();
    expect(a!.toLowerCase()).toContain("cambio");
  });

  it("una imagen habla de la imagen", () => {
    const a = avisoDeArranque("generame una imagen para el producto 5");
    expect(a).not.toBeNull();
    expect(a!.toLowerCase()).toContain("imagen");
  });

  it("el agente de WhatsApp", () => {
    const a = avisoDeArranque("revisá mi agente de whatsapp");
    expect(a).not.toBeNull();
    expect(a!.toLowerCase()).toContain("whatsapp");
  });
});

describe("solo promete 'por etapas' cuando de verdad hay varias cosas", () => {
  it("un pedido enumerado sí lleva la nota de partes", () => {
    const a = avisoDeArranque("mostrame el copy, la estrategia, la segmentacion y el presupuesto");
    expect(a).not.toBeNull();
    expect(a!.toLowerCase()).toContain("varias cosas");
  });

  it("un pedido de una sola cosa NO la lleva", () => {
    const a = avisoDeArranque("mostrame el copy del anuncio");
    expect(a).not.toBeNull();
    expect(a!.toLowerCase()).not.toContain("varias cosas");
  });
});

describe("ante la duda, no se manda nada", () => {
  it("un saludo no anuncia nada", () => {
    expect(avisoDeArranque("hola")).toBeNull();
    expect(avisoDeArranque("gracias!")).toBeNull();
  });

  it("un pedido que no cae en ninguna familia no inventa un aviso", () => {
    expect(avisoDeArranque("cambiame la vida")).toBeNull();
  });

  it("lo citado entre comillas es un ejemplo, no un pedido", () => {
    expect(avisoDeArranque('pegué "quiero vender un producto nuevo" para preguntarte por qué se ve así')).toBeNull();
  });

  it("no rompe con vacío", () => {
    expect(avisoDeArranque("")).toBeNull();
    expect(avisoDeArranque(undefined as any)).toBeNull();
  });
});
