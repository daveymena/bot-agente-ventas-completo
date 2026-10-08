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
  primero?: Candidato;
}) =>
  armarCadena({
    curados: CURADOS,
    conectados: new Set(opts.conectados || []),
    tenemosClave: (p) => (opts.claves || []).includes(p),
    modelosPorProveedor: new Map(Object.entries(opts.catalogo || {})),
    respaldo: RESPALDO,
    primero: opts.primero,
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
   * El caso reportado: había proveedores con la clave cargada que no estaban
   * en la lista curada, así que Atlas NUNCA los intentaba.
   */
  it("incluye un proveedor del que tenemos clave aunque no esté en la lista curada", () => {
    const c = armar({ claves: ["cerebras"], catalogo: { cerebras: [{ id: "gpt-oss-20b" }] } });
    expect(c.some((x) => x.providerID === "cerebras" && x.modelID === "gpt-oss-20b")).toBe(true);
  });

  /**
   * Copilot es la cuenta de PAGO del admin y la de mejor calidad del resto. La
   * cadena del bot de ventas ya lo tenía segundo; la de Atlas no lo tenía.
   * El id real depende de cómo lo nombre OpenCode, por eso se aceptan varias.
   */
  it.each(["github-copilot", "github_copilot", "copilot"])(
    'intenta Copilot cuando OpenCode lo expone como "%s"',
    (id) => {
      const c = armar({ claves: [id], catalogo: { [id]: [{ id: "gpt-4o" }] } });
      expect(c.some((x) => x.providerID === id)).toBe(true);
    },
  );

  /**
   * GitHub Models NO: GitHub lo está retirando (404 en el endpoint viejo, 410
   * "retirement brownout" en el nuevo, verificado el 2026-08-19; y el
   * 2026-08-24 `github/gpt-4o-mini` dio error de conexión). Intentarlo es
   * quemar un candidato en cada turno para nada. Copilot, que SÍ funciona, es
   * otro proveedor distinto.
   */
  it("NO intenta GitHub Models aunque la clave esté cargada: está retirado", () => {
    const c = armar({ claves: ["github"], catalogo: { github: [{ id: "gpt-4o-mini" }] } });
    expect(c.some((x) => x.providerID === "github")).toBe(false);
  });

  /**
   * Lo importante no es solo que entren, sino DÓNDE: si un rápido queda
   * después de los dos gratis que se comen 55s cada uno, no llega a
   * intentarse nunca.
   */
  it("pone los rápidos ANTES de los gratis lentos", () => {
    const c = armar({
      claves: ["deepseek", "openrouter", "cerebras"],
      catalogo: { cerebras: [{ id: "llama-3.3-70b-versatile" }] },
    });
    const iCerebras = c.findIndex((x) => x.providerID === "cerebras");
    const iLento = c.findIndex((x) => /:free$/.test(x.modelID));
    expect(iCerebras).toBeGreaterThan(-1);
    expect(iCerebras).toBeLessThan(iLento);
  });

  it("el pago sigue primero de todo", () => {
    const c = armar({ claves: ["deepseek", "cerebras"], catalogo: { cerebras: [{ id: "x" }] } });
    expect(c[0]!.providerID).toBe("deepseek");
  });

  it("el respaldo gratis siempre va último", () => {
    const c = armar({ claves: ["cerebras"], catalogo: { cerebras: [{ id: "x" }] } });
    expect(c[c.length - 1]).toEqual(RESPALDO);
  });

  it("no duplica un proveedor que ya estaba en la lista curada", () => {
    const c = armar({ claves: ["deepseek"], catalogo: { deepseek: [{ id: "otro-modelo" }] } });
    expect(c.filter((x) => x.providerID === "deepseek")).toHaveLength(1);
  });

  it("no agrega un proveedor sin clave ni conexión", () => {
    const c = armar({ catalogo: { cerebras: [{ id: "x" }] } });
    expect(c.some((x) => x.providerID === "cerebras")).toBe(false);
  });

  /** Si el catálogo no trae nada usable, no se inventa un id. */
  it("no agrega un proveedor cuyo catálogo no sirve", () => {
    const c = armar({ claves: ["cerebras"], catalogo: { cerebras: [{ id: "solo-embeddings-embed" }] } });
    expect(c.some((x) => x.providerID === "cerebras")).toBe(false);
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

import { anotarFallo, filtrarEnfriados, olvidarFallos, diagnosticarRapidos } from "../cadena-modelos";

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

/**
 * El modelo que se queda sin tiempo NO se puede reintentar para siempre.
 *
 * Trace real del admin (2026-08-24), pidiéndole a Atlas crear un anuncio: el
 * turno se cortó a los 135 s sin crear nada, DOS veces seguidas. De esos 135 s,
 * 131 se fueron en tres modelos gratis que agotaron su ventana sin devolver una
 * letra (55 s + 51 s + 25 s). Los dos que se descartaron por saldo costaron
 * 1,6 s entre los dos.
 *
 * La causa: `anotarFallo` hacía `if (!inmediato) return;` — no registraba nada.
 * El enfriamiento de los fallos no terminales se calculaba y se tiraba, así que
 * un modelo colgado volvía a intentarse en cada mensaje, para siempre. El fallo
 * MÁS caro era el único que no se recordaba.
 */
describe("Memoria de los modelos que se cuelgan", () => {
  const LENTO = { providerID: "openrouter", modelID: "poolside/laguna-xs-2.1:free" };
  const OTRO = { providerID: "openrouter", modelID: "nvidia/nemotron-3-ultra:free" };

  // El mismo clasificador real, en lo que importa acá.
  const clasificarReal = (e?: string) =>
    /timeout|timed out/i.test(String(e))
      ? { cooldownMs: 15 * 60_000, inmediato: false }
      : { cooldownMs: 6 * 3600_000, inmediato: true };

  it("al SEGUNDO plantón lo aparta (antes no lo apartaba nunca)", () => {
    olvidarFallos();
    const t = Date.now();

    anotarFallo(LENTO, "timeout", clasificarReal, t);
    expect(filtrarEnfriados([LENTO, OTRO], t)).toHaveLength(2); // el primero se perdona

    anotarFallo(LENTO, "timeout", clasificarReal, t + 1000);
    const vivos = filtrarEnfriados([LENTO, OTRO], t + 2000);
    expect(vivos).toHaveLength(1);
    expect(vivos[0]!.modelID).toBe(OTRO.modelID);
  });

  it("dos plantones lejanos en el tiempo no son una racha", () => {
    olvidarFallos();
    const t = Date.now();
    anotarFallo(LENTO, "timeout", clasificarReal, t);
    // 20 minutos después: mala suerte, no reincidencia.
    anotarFallo(LENTO, "timeout", clasificarReal, t + 20 * 60_000);
    expect(filtrarEnfriados([LENTO, OTRO], t + 20 * 60_000)).toHaveLength(2);
  });

  it("lo vuelve a intentar cuando pasó el enfriamiento", () => {
    olvidarFallos();
    const t = Date.now();
    anotarFallo(LENTO, "timeout", clasificarReal, t);
    anotarFallo(LENTO, "timeout", clasificarReal, t + 1000);
    expect(filtrarEnfriados([LENTO, OTRO], t + 15 * 60_000 + 2000)).toHaveLength(2);
  });

  // La red de seguridad: el enfriamiento cambia el ORDEN, nunca deja a Atlas
  // sin nada que intentar.
  it("si TODOS están apartados, los intenta igual", () => {
    olvidarFallos();
    const t = Date.now();
    for (const m of [LENTO, OTRO]) {
      anotarFallo(m, "timeout", clasificarReal, t);
      anotarFallo(m, "timeout", clasificarReal, t + 1000);
    }
    expect(filtrarEnfriados([LENTO, OTRO], t + 2000)).toHaveLength(2);
  });
});

/**
 * Un proveedor rápido configurado que queda afuera tiene que DECIRSE.
 *
 * El admin objetó dos veces lo mismo: "tenemos github, tenemos opencode zen,
 * tenemos nvidia, imposible que ninguno sirva". Y las dos veces tenía razón:
 * el candidato se descartaba en silencio. No había forma de distinguir "no lo
 * tengo configurado" de "lo configuré y el sistema no lo ve", que son dos
 * problemas con arreglos distintos.
 */
describe("Por qué un proveedor rápido no entró", () => {
  it("avisa cuando tenemos la credencial pero OpenCode no lista el proveedor", () => {
    const fuera = diagnosticarRapidos({
      conectados: new Set<string>(),
      tenemosClave: (p) => p === "cerebras",
      modelosPorProveedor: new Map(), // OpenCode no devolvió cerebras
    });
    expect(fuera).toHaveLength(1);
    expect(fuera[0]!.providerID).toBe("cerebras");
    expect(fuera[0]!.motivo).toContain("no lista");
  });

  it("avisa cuando el proveedor está pero ninguno de sus modelos sirve", () => {
    const fuera = diagnosticarRapidos({
      conectados: new Set(["cerebras"]),
      tenemosClave: () => false,
      // Solo modelos que no conversan: embeddings.
      modelosPorProveedor: new Map([["cerebras", ["text-embedding-3", "whisper-large"]]]),
    });
    expect(fuera).toHaveLength(1);
    expect(fuera[0]!.motivo).toContain("ninguno de sus modelos sirve");
  });

  // Lo que NO está configurado no es una sorpresa y no se reporta: llenar el
  // log de proveedores que el admin nunca conectó es ruido, y el ruido tapa.
  it("no se queja de lo que el admin nunca configuró", () => {
    expect(
      diagnosticarRapidos({
        conectados: new Set<string>(),
        tenemosClave: () => false,
        modelosPorProveedor: new Map(),
      }),
    ).toHaveLength(0);
  });

  it("si entra bien, no reporta nada", () => {
    const fuera = diagnosticarRapidos({
      conectados: new Set(["cerebras"]),
      tenemosClave: () => false,
      modelosPorProveedor: new Map([["cerebras", ["llama-3.3-70b-versatile"]]]),
    });
    expect(fuera).toHaveLength(0);
  });
});

/**
 * Qué modelo se elige de cada proveedor, contra el catálogo REAL.
 *
 * Los ids de abajo se leyeron del `/provider` de producción el 2026-08-25
 * (solo nombres de modelos: no hay nada secreto acá). Importa que sean los de
 * verdad, porque el bug que esto fija solo aparece con el catálogo real: en uno
 * inventado uno pone tres modelos plausibles y la elección siempre parece bien.
 */
describe("Qué modelo se elige del catálogo real de Groq", () => {
  // Tal cual los devuelve OpenCode, en su orden real.
  const GROQ_REAL = [
    "whisper-large-v3",
    "llama-3.3-70b-versatile",
    "allam-2-7b",
    "llama-3.1-8b-instant",
    "whisper-large-v3-turbo",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-safeguard-20b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.6-27b",
    "meta-llama/llama-prompt-guard-2-86m",
    "meta-llama/llama-prompt-guard-2-22m",
    "groq/compound-mini",
    "groq/compound",
    "canopylabs/orpheus-arabic-saudi",
    "canopylabs/orpheus-v1-english",
  ];

  /**
   * REGRESIÓN. La regla anterior era una sola lista donde "7b" pesaba igual que
   * "instant", y ganaba el primero que apareciera en el catálogo. Con estos ids
   * reales el turno de Groq se lo llevaba `allam-2-7b` --un modelo en árabe--
   * mientras `llama-3.1-8b-instant` quedaba sin usar.
   *
   * Groq es justo el proveedor que se agregó para tener algo que conteste en
   * segundos: gastarle el turno a un modelo que no sirve deja al admin
   * esperando los 135s igual.
   */
  it("elige el rápido de verdad, no el que solo tiene un número chico", () => {
    expect(elegirModelo(GROQ_REAL)).toBe("llama-3.1-8b-instant");
  });

  it("descarta lo que no conversa: audio, whisper y los guard", () => {
    const elegido = elegirModelo(GROQ_REAL)!;
    expect(elegido).not.toMatch(/whisper|orpheus|guard/i);
  });

  // Si no hay ninguno que anuncie velocidad, el tamaño sigue sirviendo como
  // segunda pista: es mejor que quedarse con el primero de la lista.
  it("sin marcas de velocidad, cae al más chico", () => {
    expect(elegirModelo(["llama-3.3-70b-versatile", "allam-2-7b"])).toBe("allam-2-7b");
  });

  /**
   * REGRESIÓN. Los ids de PROVEEDORES_RAPIDOS son los del CATÁLOGO de OpenCode,
   * no los que usa esta app: OpenCode escribe "github-copilot" con guion,
   * mientras este código nombra a sus proveedores con guion bajo. Un id que no
   * coincide no falla con error: simplemente no aparece en el catálogo y el
   * proveedor no se descubre NUNCA, aunque el admin tenga la clave cargada.
   *
   * El ejemplo original era "opencode-go", pero esa cuenta se dio de baja
   * (2026-08-28) y salió de la lista. La lección no cambia, así que se prueba
   * con el otro id con guion que sigue vivo en la lista.
   */
  it("usa los ids con los que OpenCode nombra a los proveedores", () => {
    const cadena = armarCadena({
      curados: [],
      conectados: new Set<string>(),
      tenemosClave: (p) => p === "github-copilot",
      modelosPorProveedor: new Map([["github-copilot", ["gpt-4o"]]]),
      respaldo: { providerID: "opencode", modelID: "big-pickle" },
    });
    expect(cadena.map((c) => c.providerID)).toContain("github-copilot");
  });

  /**
   * La otra mitad de lo mismo: un proveedor que SÍ tiene clave pero que está
   * apagado no debe encabezar --ni integrar-- la cadena, porque cada intento
   * cuesta una llamada real antes de descubrir que no responde.
   *
   * Medido el 2026-08-28: `nvidia` devuelve 410 (modelo retirado) y la cuenta
   * de `opencode-go` se dio de baja. Los dos tenían clave cargada, así que se
   * intentaban en cada turno.
   */
  it("no intenta los proveedores que se comprobó que están apagados", () => {
    for (const muerto of ["nvidia", "opencode-go"]) {
      const cadena = armarCadena({
        curados: [],
        conectados: new Set<string>(),
        tenemosClave: (p) => p === muerto,
        modelosPorProveedor: new Map([[muerto, ["cualquiera"]]]),
        respaldo: { providerID: "opencode", modelID: "big-pickle" },
      });
      expect(cadena.map((c) => c.providerID), muerto).not.toContain(muerto);
    }
  });

  /**
   * Y Groq NO entra, aunque la clave esté cargada y OpenCode lo liste.
   *
   * Encabezó la cadena desde el 2026-08-28, cuando era el único que respondía
   * (442ms). Remedido el 2026-09-03 contra el mismo contenedor: ya no
   * responde -- la conexión se queda colgada y el curl corta a los 45s sin
   * recibir una letra. Ese es el fallo más caro de todos: cuesta los 30s
   * enteros de TECHO_POR_CANDIDATO_MS, y los cuesta en CADA tramo del turno,
   * no una vez.
   *
   * Es distinto de Copilot, que sigue listado a propósito: sin credencial se
   * saltea gratis, y con un 401 cuesta un segundo.
   */
  it("Groq NO entra a la cadena aunque esté configurado: se cuelga 30s por tramo", () => {
    const cadena = armarCadena({
      curados: [],
      conectados: new Set(["groq"]),
      tenemosClave: (p) => p === "groq" || p === "copilot",
      modelosPorProveedor: new Map([
        ["groq", ["openai/gpt-oss-120b"]],
        ["copilot", ["gpt-4o"]],
      ]),
      respaldo: { providerID: "opencode", modelID: "big-pickle" },
    });
    expect(cadena.map((c) => c.providerID)).not.toContain("groq");
  });
});

/**
 * El id del modelo curado tampoco se cree de palabra.
 *
 * El primer candidato de Atlas es `deepseek/deepseek-v4-flash`, y el comentario
 * que lo puso ahí admite que no está verificado contra el servidor. Si ese id
 * no existe en esta build de OpenCode, cada turno arranca quemando un 500 y cae
 * en `deepseek-v4-pro`, medido en 55s y fallando: medio turno perdido, en todos
 * los turnos.
 *
 * El catálogo real ya llegaba en la misma respuesta de `/provider`. Solo se
 * usaba para los proveedores descubiertos; la lista curada --la que corre
 * primero-- no se validaba contra nada.
 */
describe("un id curado que no existe no se intenta", () => {
  const respaldo = { providerID: "opencode", modelID: "big-pickle" };
  const conectados = new Set<string>(["deepseek"]);
  const tenemosClave = () => false;

  it("si el id existe en el catálogo, se usa tal cual", () => {
    const cadena = armarCadena({
      curados: [{ providerID: "deepseek", modelID: "deepseek-v4-flash" }],
      conectados,
      tenemosClave,
      modelosPorProveedor: new Map([["deepseek", ["deepseek-v4-flash", "deepseek-v4-pro"]]]),
      respaldo,
    });
    expect(cadena[0]).toEqual({ providerID: "deepseek", modelID: "deepseek-v4-flash" });
  });

  it("si NO existe, se reemplaza por el mejor real del mismo proveedor", () => {
    const cadena = armarCadena({
      curados: [{ providerID: "deepseek", modelID: "deepseek-v4-flash" }],
      conectados,
      tenemosClave,
      modelosPorProveedor: new Map([["deepseek", ["deepseek-v4-pro"]]]),
      respaldo,
    });
    expect(cadena[0]).toEqual({ providerID: "deepseek", modelID: "deepseek-v4-pro" });
    expect(cadena.some((c) => c.modelID === "deepseek-v4-flash")).toBe(false);
  });

  it("dos curados del mismo proveedor no colapsan en el mismo modelo dos veces", () => {
    const cadena = armarCadena({
      curados: [
        { providerID: "deepseek", modelID: "deepseek-v4-flash" },
        { providerID: "deepseek", modelID: "deepseek-v4-pro" },
      ],
      conectados,
      tenemosClave,
      modelosPorProveedor: new Map([["deepseek", ["deepseek-v4-pro"]]]),
      respaldo,
    });
    const deepseeks = cadena.filter((c) => c.providerID === "deepseek");
    expect(deepseeks).toHaveLength(1);
  });

  it("si el proveedor no tiene NINGÚN modelo servible, el candidato se cae", () => {
    const cadena = armarCadena({
      curados: [{ providerID: "deepseek", modelID: "deepseek-v4-flash" }],
      conectados,
      tenemosClave,
      // Solo modelos de razonamiento y embeddings: ninguno conversa.
      modelosPorProveedor: new Map([["deepseek", ["deepseek-reasoner", "text-embedding-3"]]]),
      respaldo,
    });
    expect(cadena.some((c) => c.providerID === "deepseek")).toBe(false);
    expect(cadena).toContainEqual(respaldo);
  });

  it("⚠️ SIN catálogo no se descarta nada: no saber no es motivo para apagar la cadena", () => {
    // Si OpenCode cambia el shape de /provider, el mapa queda vacío. Descartar
    // ahí dejaría a Atlas con el respaldo gratis y nadie se enteraría.
    const cadena = armarCadena({
      curados: [{ providerID: "deepseek", modelID: "deepseek-v4-flash" }],
      conectados,
      tenemosClave,
      modelosPorProveedor: new Map(),
      respaldo,
    });
    expect(cadena[0]).toEqual({ providerID: "deepseek", modelID: "deepseek-v4-flash" });
  });

  it("un catálogo vacío se trata como falta de información, no como “no tiene nada”", () => {
    const cadena = armarCadena({
      curados: [{ providerID: "deepseek", modelID: "deepseek-v4-flash" }],
      conectados,
      tenemosClave,
      modelosPorProveedor: new Map([["deepseek", []]]),
      respaldo,
    });
    expect(cadena[0]).toEqual({ providerID: "deepseek", modelID: "deepseek-v4-flash" });
  });
});


describe("la IA activa del panel (botón \"Usar para Atlas\")", () => {
  const OPENAI: Candidato = { providerID: "openai", modelID: "gpt-5.6-luna" };

  it("va PRIMERA, antes que la lista curada", () => {
    const cadena = armar({
      conectados: ["deepseek"],
      claves: ["openai"],
      catalogo: { openai: [{ id: "gpt-5.6-luna" }] },
      primero: OPENAI,
    });
    expect(cadena[0]).toEqual(OPENAI);
    expect(cadena.slice(1).map((c) => c.providerID)).toContain("deepseek");
  });

  it("si pidió un modelo que OpenCode no lista, usa el mejor real de ese proveedor", () => {
    const cadena = armar({
      claves: ["openai"],
      catalogo: { openai: [{ id: "gpt-4o-mini" }, { id: "gpt-5.6-luna" }] },
      primero: { providerID: "openai", modelID: "gpt-5.4-nano-que-no-existe" },
    });
    expect(cadena[0]).toEqual({ providerID: "openai", modelID: "gpt-4o-mini" });
  });

  it("sin proveedor conectado ni clave no entra", () => {
    const cadena = armar({ catalogo: { openai: [{ id: "gpt-5.6-luna" }] }, primero: OPENAI });
    expect(cadena.some((c) => c.providerID === "openai")).toBe(false);
  });

  it("sin nada elegido, la cadena queda igual que siempre", () => {
    const cadena = armar({ conectados: ["deepseek"], claves: ["openai"], catalogo: { openai: [{ id: "gpt-5.6-luna" }] } });
    expect(cadena[0].providerID).toBe("deepseek");
  });
});

// 08-10-2026, error REAL de producción: el respaldo de Copilot fallaba siempre
// porque el catálogo local decía claude-opus-4.7-fast y ya no existe.
describe("modelo retirado: se aprende el vigente del propio error", () => {
  const ERROR = 'The requested model is not available for integrator "opencode". Available models: [gpt-4.1 claude-fable-5.1 claude-fable-5 claude-haiku-5.5 claude-opus-4.8-fast claude-opus-4.8 claude-opus-5.5 claude-opus-5 claude-sonnet-5.5 claude-sonnet-5 copilot-search-a copilot-search-b copilot-search-c exec-age';
  const copilot: Candidato = { providerID: "github-copilot", modelID: "claude-opus-4.7-fast" };

  it("lee la lista aunque el mensaje venga cortado", async () => {
    const { modelosDisponiblesDelError } = await import("../cadena-modelos");
    const lista = modelosDisponiblesDelError(ERROR);
    expect(lista).toContain("claude-opus-4.8-fast");
    expect(lista).toContain("gpt-4.1");
  });

  it("elige el de la MISMA familia (opus-*-fast), no cualquiera", async () => {
    const { reemplazoVigente, modelosDisponiblesDelError } = await import("../cadena-modelos");
    expect(reemplazoVigente("claude-opus-4.7-fast", modelosDisponiblesDelError(ERROR))).toBe("claude-opus-4.8-fast");
  });

  it("el turno siguiente ya llama al vigente", async () => {
    const { aprenderModeloVigente, conNombresVigentes, olvidarFallos } = await import("../cadena-modelos");
    olvidarFallos();
    expect(aprenderModeloVigente(copilot, ERROR)).toBe("claude-opus-4.8-fast");
    const [c] = conNombresVigentes([copilot]);
    expect(c).toEqual({ providerID: "github-copilot", modelID: "claude-opus-4.8-fast" });
    olvidarFallos();
  });

  // Error REAL de producción, 08-10 20:33: el vigente aprendido tampoco servía.
  it("'not supported' sin lista: pasa al siguiente de la última lista, no se queda en el mismo", async () => {
    const { aprenderModeloVigente, conNombresVigentes, olvidarFallos } = await import("../cadena-modelos");
    olvidarFallos();
    expect(aprenderModeloVigente(copilot, ERROR)).toBe("claude-opus-4.8-fast");
    const [llamado] = conNombresVigentes([copilot]);
    const otro = aprenderModeloVigente(llamado!, "The requested model is not supported.");
    expect(otro).toBeTruthy();
    expect(otro).not.toBe("claude-opus-4.8-fast");
    expect(otro).not.toMatch(/search|exec/);
    const [siguiente] = conNombresVigentes([copilot]);
    expect(siguiente!.modelID).toBe(otro);
    // y si ese también se rechaza, no vuelve a uno ya rechazado
    const tercero = aprenderModeloVigente(siguiente!, "The requested model is not supported.");
    expect([ "claude-opus-4.8-fast", otro ]).not.toContain(tercero);
    olvidarFallos();
  });

  it("'not supported' sin ninguna lista conocida no inventa nada", async () => {
    const { aprenderModeloVigente, olvidarFallos } = await import("../cadena-modelos");
    olvidarFallos();
    expect(aprenderModeloVigente(copilot, "The requested model is not supported.")).toBeNull();
  });

  it("quien contestó hace poco se recuerda 30 min (no se le corta a los 30 s)", async () => {
    const { anotarExito, respondioHacePoco, olvidarFallos } = await import("../cadena-modelos");
    olvidarFallos();
    const luna: Candidato = { providerID: "opencode", modelID: "gpt-5.6-luna" };
    expect(respondioHacePoco(luna)).toBe(false);
    anotarExito(luna, 1_000_000);
    expect(respondioHacePoco(luna, 1_000_000 + 29 * 60_000)).toBe(true);
    expect(respondioHacePoco(luna, 1_000_000 + 31 * 60_000)).toBe(false);
    expect(respondioHacePoco(copilot, 1_000_000)).toBe(false);
    olvidarFallos();
  });

  it("un error que no es 'modelo retirado' no cambia nada", async () => {
    const { aprenderModeloVigente } = await import("../cadena-modelos");
    expect(aprenderModeloVigente(copilot, "Rate limit exceeded")).toBeNull();
  });
});
