/**
 * EL CAMINO DEL MODELO
 * ====================
 *
 * Dos cosas se prueban acá, y las dos decidieron el diseño:
 *
 * 1. Que DeepSeek encabece la cola cuando hay clave (orden del dueño, y es la
 *    regla que ya existía en `deepseek-al-frente.ts`: no se reinventa).
 * 2. Que un modelo SIN tool calling no deje al cliente sin respuesta: el
 *    servidor le pide el plan en JSON y ejecuta las herramientas igual.
 *
 * Lo segundo es lo que permite que el motor nuevo funcione con los modelos
 * gratis de la rotación, que es con los queReally atiende cuando se acaba la
 * cuota de los de pago.
 */

import { test, describe, expect, beforeEach, afterEach } from "vitest";
const assert = {
  equal: (a: any, b: any, m?: string) => expect(a, m).toBe(b),
  ok: (a: any, m?: string) => expect(!!a, m).toBe(true),
  match: (a: string, re: RegExp, m?: string) => expect(a, m).toMatch(re),
};

import { extraerPlan, INSTRUCCION_DE_PLAN, crearClienteLLM, armarCadena, type Candidato } from "../cliente-llm";

const CFG = { baseUrl: "https://api.ejemplo.com/v1", apiKey: "clave-de-prueba", model: "modelo-de-prueba" };

/* ═══════════════════════════════════════════════════════════════════
 * 1. EL MODO PLAN: EL JSON QUE ESCRIBE EL MODELO
 * ═══════════════════════════════════════════════════════════════════ */

describe("el plan en JSON", () => {
  test("lee herramientas y mensaje de un JSON limpio", () => {
    const plan = extraerPlan('{"herramientas":[{"nombre":"mostrar","args":{"productoId":1,"seccion":"precio"}}],"mensaje":"Te paso el valor"}');
    assert.ok(plan);
    assert.equal(plan!.herramientas.length, 1);
    assert.equal(plan!.herramientas[0].nombre, "mostrar");
    assert.equal(plan!.herramientas[0].args.productoId, 1);
    assert.match(plan!.mensaje, /Te paso el valor/);
  });

  test("aguanta que el modelo lo envuelva en ```json y explique arriba", () => {
    const plan = extraerPlan('Claro, acá va:\n```json\n{"herramientas":[],"mensaje":"Dale, te cuento"}\n```\nEspero sirva.');
    assert.ok(plan);
    assert.equal(plan!.herramientas.length, 0);
    assert.match(plan!.mensaje, /te cuento/);
  });

  test("aguanta un objeto anidado dentro de los argumentos", () => {
    const plan = extraerPlan('{"herramientas":[{"nombre":"mostrar","args":{"productoId":9,"seccion":"pago","reenviar":true}}],"mensaje":"x"}');
    assert.equal(plan!.herramientas[0].args.reenviar, true);
  });

  test("si no es JSON, devuelve null en vez de romper el turno", () => {
    assert.equal(extraerPlan("Listo, te llamo mañana"), null);
    assert.equal(extraerPlan(""), null);
    assert.equal(extraerPlan("{}"), null);
  });

  test("un JSON roto no tumba la respuesta", () => {
    assert.equal(extraerPlan('{"herramientas":[{"nombre":"mostrar",'), null);
  });

  test("la instrucción prohíbe escribir precios y cuentas en el mensaje", () => {
    assert.match(INSTRUCCION_DE_PLAN, /NUNCA escribas precios/);
    assert.match(INSTRUCCION_DE_PLAN, /números de cuenta/);
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 2. LA CADENA DE MODELOS
 * ═══════════════════════════════════════════════════════════════════ */

describe("la cadena de modelos", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ["DEEPSEEK_API_KEY", "MOTOR_VENDEDOR", "OPENCODE_API_KEY"]) original[k] = process.env[k];
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  test("sin ninguna clave no se cae: devuelve una cadena (posiblemente vacía)", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const cadena = await armarCadena({ tenantId: null });
    assert.ok(Array.isArray(cadena));
  });

  test("nunca encola un modelo de razonamiento: en WhatsApp nadie espera 30s", async () => {
    const cadena = await armarCadena({ tenantId: null });
    for (const c of cadena) {
      assert.ok(!/reasoner|thinking|-r1\b|reasoning/i.test(String(c.config.model)), `modelo lento en la cola: ${c.source}`);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 3. CUANDO EL MODELO NO TRAE HERRAMIENTAS
 * ═══════════════════════════════════════════════════════════════════ */

describe("un modelo sin herramientas", () => {
  /** Un proveedor falso: falla con herramientas y contesta en JSON sin ellas. */
  function fabricaQueRechazaHerramientas(respuestas?: { conHerramientas?: "error" | any; plan?: string }) {
    const llamadas: any[] = [];
    return {
      llamadas,
      fabrica: () => ({
        chat: {
          completions: {
            async create(body: any) {
              llamadas.push({ conTools: Array.isArray(body.tools), mensajes: body.messages.length });
              if (Array.isArray(body.tools)) {
                if (respuestas?.conHerramientas === "error") {
                  throw new Error("400 Bad Request: unsupported tool type function");
                }
                return { choices: [{ message: respuestas?.conHerramientas ?? { content: null } }] };
              }
              return { choices: [{ message: { content: respuestas?.plan ?? "hola" } }] };
            },
          },
        },
      }),
    };
  }

  test("si rechaza las herramientas, se le vuelve a preguntar en JSON y el turno sigue", async () => {
    const doble = fabricaQueRechazaHerramientas({
      conHerramientas: "error",
      plan: '{"herramientas":[{"nombre":"mostrar","args":{"productoId":1,"seccion":"precio"}}],"mensaje":"Te paso el valor 👇"}',
    });

    const cliente = crearClienteLLM({
      cadena: [{ config: CFG, source: "gratuito/modelo" }],
      fabrica: doble.fabrica as any,
    });

    const r = await cliente.crear({
      messages: [{ role: "user", content: "cuánto cuesta?" }],
      tools: [{ type: "function", function: { name: "mostrar" } }],
    });

    assert.equal(r.modoPlan, true);
    assert.equal(r.toolCalls.length, 1);
    assert.equal(r.toolCalls[0].name, "mostrar");
    assert.match(String(r.content), /Te paso el valor/);
    assert.equal(doble.llamadas.length, 2, "lo intentó con herramientas y volvió en modo JSON");
    assert.equal(doble.llamadas[0].conTools, true);
    assert.equal(doble.llamadas[1].conTools, false);
  });

  test("se acuerda del modelo que no las soporta y la próxima vez va directo al JSON", async () => {
    const doble = fabricaQueRechazaHerramientas({
      conHerramientas: "error",
      plan: '{"herramientas":[],"mensaje":"Listo"}',
    });

    const cliente = crearClienteLLM({
      cadena: [{ config: { ...CFG, model: "modelo-recordado" }, source: "gratuito/modelo-recordado" }],
      fabrica: doble.fabrica as any,
    });

    await cliente.crear({ messages: [{ role: "user", content: "hola" }], tools: [{ type: "function" }] });
    await cliente.crear({ messages: [{ role: "user", content: "hola de nuevo" }], tools: [{ type: "function" }] });

    // Primera vez: herramientas + reintento. Segunda: solo JSON.
    assert.equal(doble.llamadas.length, 3);
    assert.equal(doble.llamadas[2].conTools, false);
  });

  test("si contesta 200 con las herramientas pero vacío, se pasa al siguiente modelo", async () => {
    let n = 0;
    const fabrica = () => ({
      chat: {
        completions: {
          async create() {
            n++;
            if (n === 1) return { choices: [{ message: { content: "", tool_calls: [] } }] };
            return { choices: [{ message: { content: "Acá estoy" } }] };
          },
        },
      },
    });

    const cliente = crearClienteLLM({
      cadena: [
        { config: { ...CFG, model: "a" }, source: "prov/a" },
        { config: { ...CFG, model: "b" }, source: "prov/b" },
      ],
      fabrica: fabrica as any,
    });

    const r = await cliente.crear({ messages: [{ role: "user", content: "hola" }] });
    assert.match(String(r.content), /Acá estoy/);
    assert.equal(r.proveedor, "prov/b");
  });

  test("la cadena se recorre hasta que alguno contesta", async () => {
    // Tres candidatos: los dos primeros sin clave (fallan) y el tercero
    // apuntando a una URL inválida. El resultado esperado NO es un mensaje:
    // es un error que explique qué se intentó, para poder diagnosticarlo
    // sin leer logs del contenedor.
    const cadena: Candidato[] = [
      { config: { ...CFG, baseUrl: "http://127.0.0.1:1/v1" }, source: "muerto/a" },
      { config: { ...CFG, baseUrl: "http://127.0.0.1:1/v1" }, source: "muerto/b" },
    ];

    const cliente = crearClienteLLM({ cadena });
    let mensaje = "";
    try {
      await cliente.crear({ messages: [{ role: "user", content: "hola" }] });
    } catch (e: any) {
      mensaje = String(e.message);
    }
    assert.match(mensaje, /Ningún modelo respondió/);
    assert.match(mensaje, /muerto\/a/);
  });
});
