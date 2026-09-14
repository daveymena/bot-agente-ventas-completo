/**
 * Atlas hablando con el modelo sin intermediarios.
 *
 * Medido el 2026-09-05, mismo prompt y mismas herramientas:
 *
 *     DeepSeek directo    7.725 tokens    1,7s · 2,0s · 2,6s
 *     por OpenCode       20.674 tokens    13s … +175s
 *
 * Lo que se prueba acá NO es la velocidad --eso se midió contra las APIs
 * reales-- sino que el camino nuevo se comporte IGUAL que el viejo. Esa fue la
 * condición del dueño: *"que todo quede en perfecta sincronía"*.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { correrTurnoDirecto, directoDisponible } from "../atlas-directo";
import { textoDelResultado } from "../opencode-mcp-tools";

const CTX = { tenantId: 1, sessionId: "s1", turnId: "t1" } as any;

/** Una respuesta del modelo, en el formato de OpenAI. */
const respuesta = (msg: any) => ({ ok: true, json: async () => ({ choices: [{ message: msg }] }) });

function conFetch(...respuestas: any[]) {
  const fn = vi.fn();
  for (const r of respuestas) fn.mockImplementationOnce(async () => r);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const base = {
  system: "sos atlas",
  mensaje: "hola",
  ctx: CTX,
  apiKey: "k",
  presupuestoMs: 60_000,
};

describe("el turno más simple", () => {
  it("devuelve el texto cuando el modelo contesta directo", async () => {
    conFetch(respuesta({ content: "Todo bien." }));
    const r = await correrTurnoDirecto({ ...base, herramientas: [] });
    expect(r.texto).toBe("Todo bien.");
    expect(r.error).toBeUndefined();
    expect(r.herramientasUsadas).toEqual([]);
  });

  it("no manda `tools` cuando no hay herramientas", async () => {
    const f = conFetch(respuesta({ content: "ok" }));
    await correrTurnoDirecto({ ...base, herramientas: [] });
    expect(JSON.parse(f.mock.calls[0][1].body)).not.toHaveProperty("tools");
  });
});

describe("ejecutar herramientas: el mismo handler y el mismo formato", () => {
  it("llama al handler con los args y EL MISMO ctx del puente MCP", async () => {
    const handler = vi.fn(async () => ({ ok: true, summary: "3 productos", data: [1, 2, 3] }));
    conFetch(
      respuesta({ tool_calls: [{ id: "c1", function: { name: "list_products", arguments: '{"limite":3}' } }] }),
      respuesta({ content: "Tenés 3." }),
    );
    const r = await correrTurnoDirecto({
      ...base,
      herramientas: [{ name: "list_products", description: "d", inputSchema: {}, handler } as any],
    });
    expect(handler).toHaveBeenCalledWith({ limite: 3 }, CTX);
    expect(r.texto).toBe("Tenés 3.");
    expect(r.herramientasUsadas).toEqual(["list_products"]);
  });

  /**
   * LA PRUEBA DE LA SINCRONÍA. El resultado que ve el modelo tiene que salir
   * de `textoDelResultado`, la misma función que usa el puente. Si cada camino
   * formateara distinto, Atlas se comportaría distinto según por dónde pasó el
   * turno -- y eso es imposible de diagnosticar después.
   */
  it("el resultado se formatea con textoDelResultado", async () => {
    const resultado = { ok: true, summary: "listo", data: { id: 7 } };
    const f = conFetch(
      respuesta({ tool_calls: [{ id: "c1", function: { name: "t", arguments: "{}" } }] }),
      respuesta({ content: "fin" }),
    );
    await correrTurnoDirecto({
      ...base,
      herramientas: [{ name: "t", description: "d", inputSchema: {}, handler: async () => resultado } as any],
    });
    const segundaLlamada = JSON.parse(f.mock.calls[1][1].body);
    const mensajeDeHerramienta = segundaLlamada.messages.find((m: any) => m.role === "tool");
    expect(mensajeDeHerramienta.content).toBe(textoDelResultado(resultado));
  });

  it("encadena varias vueltas de herramientas", async () => {
    const h = vi.fn(async () => ({ ok: true, summary: "ok" }));
    conFetch(
      respuesta({ tool_calls: [{ id: "1", function: { name: "a", arguments: "{}" } }] }),
      respuesta({ tool_calls: [{ id: "2", function: { name: "a", arguments: "{}" } }] }),
      respuesta({ content: "terminado" }),
    );
    const r = await correrTurnoDirecto({
      ...base,
      herramientas: [{ name: "a", description: "d", inputSchema: {}, handler: h } as any],
    });
    expect(h).toHaveBeenCalledTimes(2);
    expect(r.texto).toBe("terminado");
  });
});

describe("nada de lo que salga mal puede tumbar el turno", () => {
  /** Un modelo que escribe mal el JSON recibe el error y lo corrige. */
  it("argumentos que no son JSON válido", async () => {
    const f = conFetch(
      respuesta({ tool_calls: [{ id: "1", function: { name: "a", arguments: "{roto" } }] }),
      respuesta({ content: "reintenté" }),
    );
    const r = await correrTurnoDirecto({
      ...base,
      herramientas: [{ name: "a", description: "d", inputSchema: {}, handler: async () => ({ ok: true, summary: "x" }) } as any],
    });
    const msg = JSON.parse(f.mock.calls[1][1].body).messages.find((m: any) => m.role === "tool");
    expect(msg.content).toContain("no son JSON válido");
    expect(r.texto).toBe("reintenté");
  });

  it("una herramienta que se cae no corta el turno", async () => {
    conFetch(
      respuesta({ tool_calls: [{ id: "1", function: { name: "a", arguments: "{}" } }] }),
      respuesta({ content: "sigo" }),
    );
    const r = await correrTurnoDirecto({
      ...base,
      herramientas: [{ name: "a", description: "d", inputSchema: {}, handler: async () => { throw new Error("boom"); } } as any],
    });
    expect(r.texto).toBe("sigo");
  });

  /**
   * Visto en producción el 14-09-2026: `fb_ad_library` se quedó colgada
   * (Chromium en el contenedor) y el turno entero quedó en "Consultando fb
   * ad library…" durante horas. El presupuesto acotaba las llamadas al
   * modelo, no a las herramientas.
   */
  it("una herramienta que nunca responde se vence y el turno sigue", async () => {
    conFetch(
      respuesta({ tool_calls: [{ id: "1", function: { name: "lenta", arguments: "{}" } }] }),
      respuesta({ content: "seguí sin eso" }),
    );
    const fetchMock = globalThis.fetch as any;
    const t0 = Date.now();
    const r = await correrTurnoDirecto({
      ...base,
      // 9.5s de presupuesto - 8s de reserva = tope de ~1,5s para la herramienta.
      presupuestoMs: 9_500,
      herramientas: [{ name: "lenta", description: "d", inputSchema: {}, handler: () => new Promise(() => {}) } as any],
    });
    expect(Date.now() - t0).toBeLessThan(5_000);
    expect(r.texto).toBe("seguí sin eso");
    // El modelo recibió el vencimiento como error de herramienta, con la instrucción de no insistir.
    const segundaLlamada = JSON.parse(fetchMock.mock.calls[1][1].body);
    const resultadoHerramienta = segundaLlamada.messages.find((m: any) => m.role === "tool");
    expect(resultadoHerramienta.content).toMatch(/lenta tardó más de/);
    expect(resultadoHerramienta.content).toMatch(/No la vuelvas a llamar/);
  });

  it("una herramienta que el modelo inventó", async () => {
    conFetch(
      respuesta({ tool_calls: [{ id: "1", function: { name: "no_existe", arguments: "{}" } }] }),
      respuesta({ content: "ah, no existe" }),
    );
    const r = await correrTurnoDirecto({ ...base, herramientas: [] });
    expect(r.texto).toBe("ah, no existe");
    expect(r.error).toBeUndefined();
  });

  /**
   * ⚠️ Los proveedores compatibles con OpenAI devuelven 200 CON EL ERROR
   * ADENTRO. Medido en vivo: un modelo sin saldo contesta 200 con
   * {"error":{"message":"Insufficient balance"}}. Sin mirar ahí, eso parece
   * una respuesta vacía y se diagnostica mal durante horas.
   */
  it("detecta el 200 con error adentro", async () => {
    conFetch({ ok: true, json: async () => ({ error: { message: "Insufficient balance" } }) });
    const r = await correrTurnoDirecto({ ...base, herramientas: [] });
    expect(r.error).toContain("Insufficient balance");
  });

  it("un error HTTP se reporta, no se traga", async () => {
    conFetch({ ok: false, status: 401, text: async () => "no autorizado" });
    const r = await correrTurnoDirecto({ ...base, herramientas: [] });
    expect(r.error).toContain("401");
  });

  it("y una respuesta sin mensaje tampoco pasa por buena", async () => {
    conFetch({ ok: true, json: async () => ({ choices: [] }) });
    expect((await correrTurnoDirecto({ ...base, herramientas: [] })).error).toBeTruthy();
  });
});

describe("los límites del turno se respetan", () => {
  it("sin tiempo no se llama al modelo", async () => {
    const f = conFetch(respuesta({ content: "no deberia llegar" }));
    const r = await correrTurnoDirecto({ ...base, herramientas: [], presupuestoMs: 1000 });
    expect(f).not.toHaveBeenCalled();
    expect(r.error).toBe("sin tiempo");
  });

  it("el botón de Detener corta antes de empezar", async () => {
    const f = conFetch(respuesta({ content: "x" }));
    const ctrl = new AbortController();
    ctrl.abort();
    const r = await correrTurnoDirecto({ ...base, herramientas: [], cancelSignal: ctrl.signal });
    expect(f).not.toHaveBeenCalled();
    expect(r.error).toBe("detenido");
  });

  /** Un modelo confundido no puede quedarse dando vueltas y comerse el turno. */
  it("corta a las 8 vueltas de herramientas", async () => {
    const muchas = Array.from({ length: 12 }, () =>
      respuesta({ tool_calls: [{ id: "x", function: { name: "a", arguments: "{}" } }] }));
    conFetch(...muchas);
    const r = await correrTurnoDirecto({
      ...base,
      herramientas: [{ name: "a", description: "d", inputSchema: {}, handler: async () => ({ ok: true, summary: "x" }) } as any],
    });
    expect(r.vueltas).toBe(8);
    expect(r.error).toContain("8 vueltas");
  });
});

describe("cuándo se enciende", () => {
  it("hace falta la variable Y la clave", () => {
    expect(directoDisponible({ ATLAS_DIRECTO: "true", DEEPSEEK_API_KEY: "k" } as any)).toBe(true);
    expect(directoDisponible({ ATLAS_DIRECTO: "true" } as any)).toBe(false);
    expect(directoDisponible({ DEEPSEEK_API_KEY: "k" } as any)).toBe(false);
    expect(directoDisponible({} as any)).toBe(false);
  });

  /** Quedarse sin ningún camino es peor que usar el lento. */
  it("sin clave no se enciende aunque la variable diga que sí", () => {
    expect(directoDisponible({ ATLAS_DIRECTO: "true", DEEPSEEK_API_KEY: "" } as any)).toBe(false);
  });
});

/**
 * La sincronía, verificada sobre el código: los dos caminos tienen que sacar
 * las herramientas y el formato del MISMO lugar.
 */
describe("los dos caminos comparten las fuentes", () => {
  const DIRECTO = readFileSync(join(__dirname, "..", "atlas-directo.ts"), "utf8");
  const PUENTE = readFileSync(join(__dirname, "..", "..", "routes", "mcp-bridge.ts"), "utf8");

  it("ambos formatean el resultado con textoDelResultado", () => {
    expect(DIRECTO).toContain("textoDelResultado(resultado)");
    expect(PUENTE).toContain("textoDelResultado(result)");
  });

  it("el directo no reimplementa el formateo", () => {
    const sinComentarios = DIRECTO.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(sinComentarios).not.toContain("`❌ ${result");
    expect(sinComentarios).not.toContain("JSON.stringify(result.data)");
  });

  /** Ejecuta con el handler de la definición, no con una copia propia. */
  it("el directo usa el handler de la herramienta", () => {
    expect(DIRECTO).toContain("def.handler(leidos.args, o.ctx)");
  });
});
