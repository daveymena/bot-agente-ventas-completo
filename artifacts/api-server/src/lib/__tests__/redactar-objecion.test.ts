/**
 * La objeción la contesta alguien, no una plantilla -- pero sin poder mentir.
 *
 * Reportado el 2026-09-03 leyendo una conversación real de WhatsApp: "no usa
 * razonamiento ni nada, está respondiendo como por inercia". Era literal: la
 * respuesta a "lo voy a pensar" era una cadena fija y el modelo NO corría.
 *
 * Acá se prueba el contrato que hace que esto sea seguro: sin proveedor, con
 * error o con una redacción que toca un hecho, sale la PLANTILLA. El piso de
 * calidad es exactamente lo que se mandaba antes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const PLANTILLA =
  "Tranquilo, pensalo con calma 🙏 Para que lo tengas presente: acceso de por vida y material descargable. " +
  "Si te queda alguna duda puntual, escribime y te la resuelvo.";

const CTX = { mensajeDelCliente: "lo voy a pensar", producto: "Curso de Piano" };

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe("redactar una objeción", () => {
  /**
   * El caso más importante y el más aburrido: si no hay con qué llamar al
   * modelo, no se rompe nada ni se manda vacío. Sale la plantilla.
   */
  it("sin ningún proveedor configurado, devuelve la plantilla", async () => {
    vi.doMock("@workspace/integrations-openai-ai-server", () => ({
      getProviderConfig: () => null,
      createAIClient: () => { throw new Error("no debería llamarse"); },
    }));
    const { redactarObjecion } = await import("../redactar-objecion");
    expect(await redactarObjecion(PLANTILLA, CTX)).toBe(PLANTILLA);
  });

  it("si el proveedor falla, devuelve la plantilla", async () => {
    vi.doMock("@workspace/integrations-openai-ai-server", () => ({
      getProviderConfig: () => ({ apiKey: "x", model: "m", baseUrl: "https://ejemplo" }),
      createAIClient: () => ({
        chat: { completions: { create: async () => { throw new Error("502"); } } },
      }),
    }));
    const { redactarObjecion } = await import("../redactar-objecion");
    expect(await redactarObjecion(PLANTILLA, CTX)).toBe(PLANTILLA);
  });

  /** Lo que se busca: que la respuesta deje de ser siempre la misma frase. */
  it("una redacción que respeta los hechos SÍ se usa", async () => {
    const propia =
      "Dale, tomate el tiempo que necesites 🙏 Solo para que lo tengas en cuenta cuando decidas: " +
      "es acceso de por vida y te llevás el material descargable. Cualquier duda puntual, me escribís.";
    vi.doMock("@workspace/integrations-openai-ai-server", () => ({
      getProviderConfig: () => ({ apiKey: "x", model: "m", baseUrl: "https://ejemplo" }),
      createAIClient: () => ({
        chat: { completions: { create: async () => ({ choices: [{ message: { content: propia } }] }) } },
      }),
    }));
    const { redactarObjecion } = await import("../redactar-objecion");
    expect(await redactarObjecion(PLANTILLA, CTX)).toBe(propia);
  });

  /**
   * LA RAZÓN POR LA QUE EXISTÍA LA PLANTILLA. Este proyecto ya pagó precios
   * inventados en producción. Si la redacción mete un monto que el servidor no
   * puso, no sale.
   */
  it("si inventa un precio, NO sale: vuelve la plantilla", async () => {
    const conPrecio = PLANTILLA + " Además hoy te lo dejo en $45.000.";
    vi.doMock("@workspace/integrations-openai-ai-server", () => ({
      getProviderConfig: () => ({ apiKey: "x", model: "m", baseUrl: "https://ejemplo" }),
      createAIClient: () => ({
        chat: { completions: { create: async () => ({ choices: [{ message: { content: conPrecio } }] }) } },
      }),
    }));
    const { redactarObjecion } = await import("../redactar-objecion");
    expect(await redactarObjecion(PLANTILLA, CTX)).toBe(PLANTILLA);
  });

  /** Un "Ok" es el modelo que no entendió la tarea, no una respuesta. */
  it("una redacción vacía o ridícula vuelve a la plantilla", async () => {
    vi.doMock("@workspace/integrations-openai-ai-server", () => ({
      getProviderConfig: () => ({ apiKey: "x", model: "m", baseUrl: "https://ejemplo" }),
      createAIClient: () => ({
        chat: { completions: { create: async () => ({ choices: [{ message: { content: "Ok" } }] }) } },
      }),
    }));
    const { redactarObjecion } = await import("../redactar-objecion");
    expect(await redactarObjecion(PLANTILLA, CTX)).toBe(PLANTILLA);
  });

  /**
   * El modelo a veces devuelve el mensaje ENTRE COMILLAS, como si lo citara.
   * Sin sacarlas, al cliente le llegan las comillas.
   */
  it("saca las comillas con las que el modelo a veces envuelve el mensaje", async () => {
    const limpio =
      "Dale, tomate el tiempo que necesites 🙏 Es acceso de por vida y te llevás el material descargable. " +
      "Cualquier duda puntual, me escribís.";
    vi.doMock("@workspace/integrations-openai-ai-server", () => ({
      getProviderConfig: () => ({ apiKey: "x", model: "m", baseUrl: "https://ejemplo" }),
      createAIClient: () => ({
        chat: { completions: { create: async () => ({ choices: [{ message: { content: `"${limpio}"` } }] }) } },
      }),
    }));
    const { redactarObjecion } = await import("../redactar-objecion");
    expect(await redactarObjecion(PLANTILLA, CTX)).toBe(limpio);
  });

  it("una plantilla vacía no llama a nadie", async () => {
    vi.doMock("@workspace/integrations-openai-ai-server", () => ({
      getProviderConfig: () => { throw new Error("no debería llamarse"); },
      createAIClient: () => { throw new Error("no debería llamarse"); },
    }));
    const { redactarObjecion } = await import("../redactar-objecion");
    expect(await redactarObjecion("", CTX)).toBe("");
  });
});
