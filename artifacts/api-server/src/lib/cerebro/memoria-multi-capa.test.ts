import { describe, it, expect } from "vitest";
import { extraerTagsDelMensaje, buscarEnMemoria, obtenerContextoMemoria } from "./memoria-multi-capa";

describe("memoria-multi-capa", () => {
  it("extrae tags de un mensaje de dolor de espalda", () => {
    const tags = extraerTagsDelMensaje("Tengo dolor en la espalda, ¿me recomendas algo?");

    expect(tags).toContain("dolor");
    expect(tags).toContain("espalda");
  });

  it("extrae tags de un mensaje sobre precio", () => {
    const tags = extraerTagsDelMensaje("¿Cuánto cuesta? Es muy caro para mí.");

    expect(tags).toContain("precio");
  });

  it("extrae tags de un mensaje sobre envío", () => {
    const tags = extraerTagsDelMensaje("¿Cuándo llega? ¿Cuánto cuesta el envío?");

    expect(tags).toContain("envio");
  });

  it("extrae múltiples tags de un mensaje complejo", () => {
    const tags = extraerTagsDelMensaje(
      "Tengo dolor de espalda, ¿cuál es el precio del corrector y cuándo llega?",
    );

    expect(tags).toContain("dolor");
    expect(tags).toContain("espalda");
    expect(tags).toContain("precio");
    expect(tags).toContain("envio");
  });

  it("busca memoria y encuentra patrones relevantes", async () => {
    const resultado = await buscarEnMemoria(
      {
        query: "Tengo mucho dolor de espalda, ¿qué me recomiendas?",
        tenantId: 1,
      },
      null, // db mock
    );

    // Debe encontrar patrón "clientes_dolor_espalda"
    expect(resultado.patrones.length).toBeGreaterThan(0);
    expect(resultado.patrones.some((p) => p.nombre === "clientes_dolor_espalda")).toBe(true);
  });

  it("busca memoria para cliente precio-sensible", async () => {
    const resultado = await buscarEnMemoria(
      {
        query: "¿Cuánto cuesta el corrector? Es para mi presupuesto de...",
        tenantId: 1,
      },
      null,
    );

    expect(resultado.patrones.some((p) => p.nombre === "clientes_precio_sensible")).toBe(true);
  });

  it("detecta cliente con urgencia", async () => {
    const resultado = await buscarEnMemoria(
      {
        query: "Necesito urgentemente el corrector, ¿cuándo me lo traes?",
        tenantId: 1,
      },
      null,
    );

    expect(resultado.patrones.some((p) => p.nombre === "clientes_urgencia")).toBe(true);
  });

  it("retorna razonamiento de búsqueda", async () => {
    const resultado = await buscarEnMemoria(
      {
        query: "Dolor de espalda",
        tenantId: 1,
      },
      null,
    );

    expect(resultado.razonamiento).toContain("Búsqueda:");
    expect(resultado.razonamiento).toContain("Tags:");
    expect(resultado.razonamiento).toContain("Encontrado:");
  });

  it("integración: obtenerContextoMemoria", async () => {
    const contexto = await obtenerContextoMemoria(
      "Tengo dolor de espalda terrible",
      1,
      null,
    );

    expect(contexto.patrones.length).toBeGreaterThan(0);
    expect(contexto.patrones.some((p) => p.dispara.includes("espalda"))).toBe(true);
  });

  it("retorna recomendaciones del patrón de espalda", async () => {
    const resultado = await buscarEnMemoria(
      {
        query: "Tengo dolor de espalda",
        tenantId: 1,
      },
      null,
    );

    const patronEspalda = resultado.patrones.find((p) => p.nombre === "clientes_dolor_espalda");
    expect(patronEspalda?.recomendaciones).toContain("corrector lumbar");
    expect(patronEspalda?.recomendaciones).toContain("almohada ergonómica");
  });

  it("tags no duplicados", () => {
    const tags = extraerTagsDelMensaje("dolor dolor espalda espalda precio precio");

    const uniqueTags = new Set(tags);
    expect(uniqueTags.size).toBe(tags.length);
  });

  it("caso vacío: mensaje sin tags conocidos", () => {
    const tags = extraerTagsDelMensaje("Lorem ipsum dolor sit amet");

    // "dolor" en español lo detecta
    expect(tags).toContain("dolor");
  });
});
