import { describe, it, expect } from "vitest";
import { armarCadena, elegirModelo, type Candidato } from "../cadena-modelos";

const CURADOS: Candidato[] = [
  { providerID: "deepseek", modelID: "deepseek-chat" },
  { providerID: "mistral", modelID: "mistral-large-latest" },
  { providerID: "openrouter", modelID: "nvidia/nemotron-3-nano-30b-a3b:free" },
  { providerID: "openrouter", modelID: "poolside/laguna-xs-2.1:free" },
];
const RESPALDO: Candidato = { providerID: "opencode", modelID: "big-pickle" };

const armar = (opts: {
  conectados?: string[];
  claves?: string[];
  catalogo?: Record<string, unknown>;
}) =>
  armarCadena({
    curados: CURADOS,
    conectados: new Set(opts.conectados || []),
    tenemosClave: (p) => (opts.claves || []).includes(p),
    modelosPorProveedor: new Map(Object.entries(opts.catalogo || {})),
    respaldo: RESPALDO,
  });

describe("elegir un modelo del catálogo, sin inventar ids", () => {
  it("acepta el catálogo como array de objetos", () => {
    expect(elegirModelo([{ id: "llama-3.3-70b" }, { id: "otro" }])).toBe("llama-3.3-70b");
  });

  it("acepta array de strings", () => {
    expect(elegirModelo(["gpt-4o-mini"])).toBe("gpt-4o-mini");
  });

  /** El shape cambió entre versiones de OpenCode y no se puede verificar
   *  desde acá: se aceptan las tres formas en vez de asumir una. */
  it("acepta mapa id → definición", () => {
    expect(elegirModelo({ "kimi-k2": { tool_call: true } })).toBe("kimi-k2");
  });

  it("descarta los que no pueden llamar herramientas", () => {
    expect(elegirModelo([{ id: "sin-tools", tool_call: false }])).toBeNull();
  });

  /** Un campo ausente no puede dejar fuera a un proveedor entero. */
  it("si el catálogo no dice nada de herramientas, asume que sí", () => {
    expect(elegirModelo([{ id: "modelo-x" }])).toBe("modelo-x");
  });

  it.each(["text-embedding-3", "whisper-large", "flux-image", "deepseek-reasoner"])(
    'descarta "%s": no sirve para conversar con herramientas',
    (id) => {
      expect(elegirModelo([{ id }])).toBeNull();
    },
  );

  it("ante varios prefiere el chico, que suele ser el rápido", () => {
    expect(elegirModelo([{ id: "modelo-grande-405b" }, { id: "modelo-mini" }])).toBe("modelo-mini");
  });

  it("null si el catálogo viene vacío o inservible", () => {
    expect(elegirModelo(undefined)).toBeNull();
    expect(elegirModelo([])).toBeNull();
    expect(elegirModelo("no es un catálogo")).toBeNull();
  });
});

describe("la cadena del turno", () => {
  /**
   * El caso reportado: GitHub no estaba en la lista curada, así que por más
   * que su clave estuviera cargada Atlas NUNCA lo intentaba.
   */
  it("incluye un proveedor del que tenemos clave aunque no esté en la lista curada", () => {
    const c = armar({ claves: ["github"], catalogo: { github: [{ id: "gpt-4o-mini" }] } });
    expect(c.some((x) => x.providerID === "github" && x.modelID === "gpt-4o-mini")).toBe(true);
  });

  /**
   * Lo importante no es solo que entren, sino DÓNDE: si un rápido queda
   * después de los dos gratis que se comen 55s cada uno, no llega a
   * intentarse nunca.
   */
  it("pone los rápidos ANTES de los gratis lentos", () => {
    const c = armar({
      claves: ["deepseek", "openrouter", "groq"],
      catalogo: { groq: [{ id: "llama-3.3-70b-versatile" }] },
    });
    const iGroq = c.findIndex((x) => x.providerID === "groq");
    const iLento = c.findIndex((x) => /:free$/.test(x.modelID));
    expect(iGroq).toBeGreaterThan(-1);
    expect(iGroq).toBeLessThan(iLento);
  });

  it("el pago sigue primero de todo", () => {
    const c = armar({ claves: ["deepseek", "groq"], catalogo: { groq: [{ id: "x" }] } });
    expect(c[0]!.providerID).toBe("deepseek");
  });

  it("el respaldo gratis siempre va último", () => {
    const c = armar({ claves: ["groq"], catalogo: { groq: [{ id: "x" }] } });
    expect(c[c.length - 1]).toEqual(RESPALDO);
  });

  it("no duplica un proveedor que ya estaba en la lista curada", () => {
    const c = armar({ claves: ["deepseek"], catalogo: { deepseek: [{ id: "otro-modelo" }] } });
    expect(c.filter((x) => x.providerID === "deepseek")).toHaveLength(1);
  });

  it("no agrega un proveedor sin clave ni conexión", () => {
    const c = armar({ catalogo: { groq: [{ id: "x" }] } });
    expect(c.some((x) => x.providerID === "groq")).toBe(false);
  });

  /** Si el catálogo no trae nada usable, no se inventa un id. */
  it("no agrega un proveedor cuyo catálogo no sirve", () => {
    const c = armar({ claves: ["groq"], catalogo: { groq: [{ id: "solo-embeddings-embed" }] } });
    expect(c.some((x) => x.providerID === "groq")).toBe(false);
  });

  it("sin nada configurado, queda solo el respaldo", () => {
    expect(armar({})).toEqual([RESPALDO]);
  });

  /** `connected` solo se enciende tras reiniciar el contenedor: una clave
   *  recién cargada tiene que valer igual (ya costó un turno el 19-08). */
  it("vale estar conectado aunque no tengamos la clave", () => {
    const c = armar({ conectados: ["mistral"] });
    expect(c.some((x) => x.providerID === "mistral")).toBe(true);
  });
});

import { anotarFallo, filtrarEnfriados, olvidarFallos } from "../cadena-modelos";

/** Réplica mínima de clasificarFallo (optimized-rotation.ts) para no acoplar
 *  el test a ese módulo: lo que se prueba acá es la MEMORIA, no el clasificador. */
const clasificar = (e?: string) =>
  /402|sin saldo|insufficient/i.test(String(e))
    ? { cooldownMs: 6 * 3600_000, inmediato: true }
    : /429|quota/i.test(String(e))
      ? { cooldownMs: 3600_000, inmediato: true }
      : { cooldownMs: 30_000, inmediato: false };

describe("no reintentar lo que ya se sabe que no anda", () => {
  const A = { providerID: "deepseek", modelID: "deepseek-chat" };
  const B = { providerID: "groq", modelID: "openai/gpt-oss-120b" };

  it("aparta al que se quedó sin saldo", () => {
    olvidarFallos();
    anotarFallo(A, "402 Insufficient Balance", clasificar);
    expect(filtrarEnfriados([A, B]).map((c) => c.providerID)).toEqual(["groq"]);
  });

  /** Un timeout suelto puede ser un mal momento: castigarlo deja a Atlas con
   *  menos opciones de las que tiene. */
  it("NO aparta por un fallo pasajero", () => {
    olvidarFallos();
    anotarFallo(A, "timeout", clasificar);
    expect(filtrarEnfriados([A, B])).toHaveLength(2);
  });

  it("lo vuelve a intentar cuando pasó el enfriamiento", () => {
    olvidarFallos();
    const t = Date.now();
    anotarFallo(A, "402 Insufficient Balance", clasificar, t);
    expect(filtrarEnfriados([A, B], t + 6 * 3600_000 + 1)).toHaveLength(2);
  });

  /** Es una optimización, no un candado: mejor perder segundos reintentando
   *  que dejar al admin sin ninguna respuesta. */
  it("si TODOS están castigados, los intenta igual", () => {
    olvidarFallos();
    anotarFallo(A, "402 sin saldo", clasificar);
    anotarFallo(B, "429 quota", clasificar);
    expect(filtrarEnfriados([A, B])).toHaveLength(2);
  });

  /** Un modelo muerto no significa proveedor muerto: ya costó apartar DeepSeek
   *  entero por culpa de su modelo vision-exp. */
  it("castiga el MODELO, no el proveedor entero", () => {
    olvidarFallos();
    const otroModelo = { providerID: "deepseek", modelID: "deepseek-v4-pro" };
    anotarFallo(A, "402 sin saldo", clasificar);
    expect(filtrarEnfriados([A, otroModelo])).toEqual([otroModelo]);
  });
});
