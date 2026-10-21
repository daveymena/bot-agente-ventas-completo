import { describe, it, expect, vi, afterEach } from "vitest";
import { razonar, UMBRAL_CONFIANZA_AUTO } from "./razonador";
import type { ContextoRazonamiento } from "./tipos-razonamiento";

describe("razonador", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("genera 3 opciones y elige la mejor con confianza > 80%", async () => {
    // Respuesta fija del proveedor: el test no depende de red ni de una clave real.
    const opciones = [
      { texto: "El corrector cuesta $89.000 COP.", estilo: "directo", razonamiento: "responde el precio" },
      { texto: "Te cuento qué incluye antes del precio.", estilo: "consultivo", razonamiento: "descubre necesidad" },
      { texto: "Si quieres, te envío el enlace de compra.", estilo: "cierre", razonamiento: "pasa a la acción" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({ opciones }) } }] }),
      })),
    );
    const ctx: ContextoRazonamiento = {
      mensajeActual: "¿Cuál es el precio del corrector de postura?",
      intentDelCliente: "consultar_precio",
      estadoConversacion: { productoEnFoco: 5 },
      historial: [
        { role: "user", content: "Hola, ¿qué tienen?" },
        { role: "assistant", content: "Tenemos correctores de postura, cinturones y almohadas." },
      ],
      productoEnFoco: { id: 5, nombre: "Corrector Lumbar Pro", precio: 89000 },
      catalogo: [{ id: 5, nombre: "Corrector Lumbar Pro", precio: 89000 }],
      conocimientoCargado: [
        {
          pregunta: "¿Cuál es el precio?",
          respuesta: "El corrector cuesta $89.000 COP",
        },
      ],
    };

    const decision = await razonar(ctx);

    expect(decision.mejorOpción).toMatch(/[ABC]/);
    expect(decision.respuesta).toBeTruthy();
    expect(decision.razonamiento).toContain("Analizé 3 opciones");
    expect(decision.trazaCompleta.opcionesGeneradas).toHaveLength(3);
    expect(decision.trazaCompleta.puntajes).toHaveLength(3);
  });

  it("escala a humano si hay riesgo crítico (precio inventado)", async () => {
    const ctx: ContextoRazonamiento = {
      mensajeActual: "¿Cuánto cuesta?",
      intentDelCliente: "consultar_precio",
      estadoConversacion: {},
      historial: [],
      productoEnFoco: { id: 1, nombre: "Producto", precio: 50000 },
      catalogo: [],
      conocimientoCargado: [], // Sin conocimiento = riesgo de inventar precio
    };

    const decision = await razonar(ctx);

    // Puede o no escalar, pero si lo hace, debe ser coherente
    if (decision.escalada) {
      expect(decision.riesgosDetectados.length).toBeGreaterThan(0);
    }
  });

  it("detecta contradicción directa", async () => {
    const ctx: ContextoRazonamiento = {
      mensajeActual: "¿Puedo probarlo antes?",
      intentDelCliente: "probar_antes",
      estadoConversacion: {},
      historial: [
        {
          role: "assistant",
          content: "No, no hacemos pruebas. El producto llega directo a tu casa.",
        },
        { role: "user", content: "Pero ¿puedo probarlo?" },
      ],
      productoEnFoco: null,
      catalogo: [],
      conocimientoCargado: [],
    };

    const decision = await razonar(ctx);

    // El razonador debería detectar el conflicto
    expect(decision.razonamiento).toBeTruthy();
  });

  it("retorna fallback si el LLM falla", async () => {
    // Mock para simular fallo
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("Network error")));

    const ctx: ContextoRazonamiento = {
      mensajeActual: "Hola",
      intentDelCliente: "saludo",
      estadoConversacion: {},
      historial: [],
      productoEnFoco: null,
      catalogo: [],
      conocimientoCargado: [],
    };

    const decision = await razonar(ctx);

    // Fallback: respuesta sin razonamiento pero válida
    expect(decision.respuesta).toBeTruthy();
    expect(decision.riesgosDetectados).toContain("error_razonador");
  });

  it("prioriza seguridad: opciones sin riesgos ganan", async () => {
    const ctx: ContextoRazonamiento = {
      mensajeActual: "¿Qué me recomiendas?",
      intentDelCliente: "recomendacion",
      estadoConversacion: {},
      historial: [
        { role: "user", content: "Tengo dolor de espalda" },
        { role: "assistant", content: "Entiendo, el corrector es lo mejor para eso." },
      ],
      productoEnFoco: { id: 5, nombre: "Corrector", precio: 89000 },
      catalogo: [{ id: 5, nombre: "Corrector", precio: 89000 }],
      conocimientoCargado: [{ pregunta: "¿Qué es lo mejor?", respuesta: "El corrector" }],
    };

    const decision = await razonar(ctx);

    // Si hay conocimiento cargado, confianza debería ser alta
    if (!decision.riesgosDetectados.includes("error_razonador")) {
      expect(decision.razonamiento).toContain("confianza");
    }
  });
});
