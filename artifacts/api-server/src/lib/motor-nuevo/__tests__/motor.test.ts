/**
 * LOS BUGS REALES DEL ÚLTIMO MES, COMO PRUEBAS
 * ============================================
 *
 * Cada caso de acá salió de un commit real del repo entre agosto y el 13-09.
 * Lo importante no es que pasen: es POR QUÉ pasan. Ninguno depende de que el
 * modelo "entienda" bien. Son garantías estructurales de las herramientas y
 * del estado, así que no se pueden romper con una redacción nueva del cliente.
 */

import { test, describe, expect } from "vitest";
const assert = {
  equal: (a: any, b: any, m?: string) => expect(a, m).toBe(b),
  ok: (a: any, m?: string) => expect(!!a, m).toBe(true),
  deepEqual: (a: any, b: any, m?: string) => expect(a, m).toEqual(b),
  notEqual: (a: any, b: any, m?: string) => expect(a, m).not.toBe(b),
  match: (a: string, re: RegExp, m?: string) => expect(a, m).toMatch(re),
  doesNotMatch: (a: string, re: RegExp, m?: string) => expect(a, m).not.toMatch(re),
  strictEqual: (a: any, b: any, m?: string) => expect(a, m).toBe(b),
};

import { estadoInicial, describirEstado, type EstadoConversacion } from "../estado-conversacion";
import { ejecutores, type ContextoHerramientas, type Producto } from "../herramientas";
import { responder, type ClienteLLM, type Mensaje } from "../motor";

const CATALOGO: Producto[] = [
  {
    id: 1,
    name: "Curso de piano",
    description: "Curso completo de piano desde cero",
    price: 60000,
    currency: "COP",
    videoUrl: "https://video.example/piano.mp4",
    paymentUrl: "https://pago.example/piano",
    disponible: true,
  },
  {
    id: 2,
    name: "Curso de inglés",
    description: "Inglés conversacional",
    price: 20000,
    currency: "COP",
    videoUrl: null,
    paymentUrl: "https://pago.example/ingles",
    disponible: true,
  },
  {
    id: 3,
    name: "Producto sin precio",
    description: "Todavía sin precio cargado",
    price: null,
    currency: "COP",
    videoUrl: null,
    paymentUrl: null,
    disponible: true,
  },
];

function ctxNuevo(estado?: Partial<EstadoConversacion>): ContextoHerramientas {
  return {
    estado: { ...estadoInicial(1), ...estado },
    catalogo: CATALOGO,
    partes: [],
  };
}

/* ═══════════════════════════════════════════════════════════════════
 * 1. LA FICHA Y EL VIDEO NO SE REPITEN
 *    Commit a2e0099 (13-09): el dueño escribió "Hola" al día siguiente y
 *    recibió la ficha ENTERA y el video otra vez. Antes esto dependía de
 *    elVideoYaSalio() escaneando el historial buscando el enlace y el emoji 🎬.
 * ═══════════════════════════════════════════════════════════════════ */

describe("la ficha y el video no se repiten", () => {
  test("la segunda vez que se pide la ficha, no se envía", () => {
    const ctx = ctxNuevo();

    const primera = ejecutores.enviar_ficha(ctx, { productoId: 1, seccion: "completa" }) as any;
    assert.equal(primera.ok, true);
    assert.equal(ctx.partes.filter((p) => p.kind === "card").length, 1);

    const segunda = ejecutores.enviar_ficha(ctx, { productoId: 1, seccion: "completa" }) as any;
    assert.equal(segunda.ok, false);
    assert.match(segunda.mensaje, /ya le mandaste la ficha/i);
    assert.equal(ctx.partes.filter((p) => p.kind === "card").length, 1, "no se agregó una segunda ficha");
  });

  test("el video tampoco, y no depende de encontrar el enlace en el historial", () => {
    const ctx = ctxNuevo();

    assert.equal((ejecutores.enviar_video(ctx, { productoId: 1 }) as any).ok, true);
    const repetido = ejecutores.enviar_video(ctx, { productoId: 1 }) as any;

    assert.equal(repetido.ok, false);
    assert.equal(ctx.partes.filter((p) => p.kind === "video").length, 1);
  });

  test("si el cliente la pide de nuevo explícitamente, sí se reenvía", () => {
    const ctx = ctxNuevo();
    ejecutores.enviar_ficha(ctx, { productoId: 1, seccion: "completa" });

    const reenvio = ejecutores.enviar_ficha(ctx, {
      productoId: 1,
      seccion: "completa",
      esReenvioPedido: true,
    }) as any;

    assert.equal(reenvio.ok, true);
    assert.equal(ctx.partes.filter((p) => p.kind === "card").length, 2);
  });

  test("al volver al día siguiente el estado sigue ahí (no hay ventana de 4 horas)", () => {
    // El bug era VENTANA_SESION_MS = 4h en conversation-engine.ts: pasadas 4
    // horas se consideraba "sesión nueva" y se repetía todo. El estado explícito
    // no caduca por tiempo, así que esto no puede volver a pasar.
    const ayer = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
    const ctx = ctxNuevo({
      fichasEnviadas: { 1: { seccion: "completa", at: ayer } },
      videosEnviados: { 1: { url: "https://video.example/piano.mp4", at: ayer } },
      productoEnFoco: 1,
    });

    assert.equal((ejecutores.enviar_ficha(ctx, { productoId: 1, seccion: "completa" }) as any).ok, false);
    assert.equal((ejecutores.enviar_video(ctx, { productoId: 1 }) as any).ok, false);
    assert.equal(ctx.partes.length, 0, "no se le reenvió nada al cliente que volvió");
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 2. EL "SÍ" AMBIGUO
 *    Commits 9c18d99, 27729d0, fc9e43a: "un 'sí' contesta la pregunta
 *    anterior", "el 'sí' es sobre el foco". Antes se resolvía con
 *    esAfirmacionSuelta() + el orden en que se evaluaban ofrecimosPrecio y
 *    ofrecimosContenido — y bastó invertir ese orden para romperlo.
 * ═══════════════════════════════════════════════════════════════════ */

describe("el 'sí' del cliente", () => {
  test("dar_precio deja registrado a qué contestaría un 'sí'", () => {
    const ctx = ctxNuevo();
    ejecutores.dar_precio(ctx, { productoId: 1 });

    assert.equal(ctx.estado.ultimaOferta?.tipo, "precio");
    assert.equal(ctx.estado.ultimaOferta?.productoId, 1);
  });

  test("el bloque de contexto le dice al modelo exactamente qué se ofreció", () => {
    const ctx = ctxNuevo();
    ejecutores.enviar_ficha(ctx, { productoId: 1, seccion: "completa" });

    const texto = describirEstado(ctx.estado, (id) => CATALOGO.find((p) => p.id === id)!.name);

    assert.match(texto, /LO ÚLTIMO QUE LE OFRECISTE: la ficha de Curso de piano/);
    // Y no hay ninguna lista de formas de decir que sí: cualquier afirmación sirve.
    assert.match(texto, /"sí", "dale", "listo", "obvio"/);
  });

  test("la última oferta se pisa con la más reciente, no se acumulan", () => {
    const ctx = ctxNuevo();
    ejecutores.enviar_ficha(ctx, { productoId: 1, seccion: "completa" });
    ejecutores.dar_precio(ctx, { productoId: 1 });

    assert.equal(ctx.estado.ultimaOferta?.tipo, "precio", "lo último ofrecido fue el precio");
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 3. EL PAGO
 *    Commit fc9e43a: la regex AFIRMA_PAGO_CONFIRMADO leía "te llega apenas se
 *    confirme el pago" como un pago confirmado y bloqueaba el mensaje, así que
 *    el cliente recibía "necesito el comprobante". Se arregló agregando un
 *    lookbehind con 9 conectores. La forma #10 lo habría roto otra vez.
 * ═══════════════════════════════════════════════════════════════════ */

describe("el pago", () => {
  test("el agente no puede confirmar un pago: registrar_aviso_de_pago no lo confirma", () => {
    const ctx = ctxNuevo();
    const r = ejecutores.registrar_aviso_de_pago(ctx, {}) as any;

    assert.equal(r.ok, true);
    assert.equal(ctx.estado.comprobanteRecibido, true);
    assert.equal(ctx.estado.pagoConfirmadoPorHumano, false, "solo una persona puede confirmarlo");
    assert.match(r.mensaje, /no le digas que el pago está confirmado/i);
  });

  test("mientras no lo verifique una persona, el contexto se lo dice al modelo", () => {
    const ctx = ctxNuevo({ comprobanteRecibido: true });
    const texto = describirEstado(ctx.estado, (id) => CATALOGO.find((p) => p.id === id)!.name);

    assert.match(texto, /NINGUNA persona lo verificó/);
    assert.match(texto, /No afirmes que el pago está confirmado/);
  });

  test("no se mandan datos de pago si antes no se dio el precio", () => {
    // "sin oferta previa no hay ficha ni pago" — commit 9c18d99.
    const ctx = ctxNuevo();
    const r = ejecutores.enviar_datos_de_pago(ctx, { productoId: 1 }) as any;

    assert.equal(r.ok, false);
    assert.match(r.mensaje, /todavía no le dijiste cuánto cuesta/i);
    assert.equal(ctx.partes.length, 0);
  });

  test("con el precio dado, sí se mandan", () => {
    const ctx = ctxNuevo();
    ejecutores.dar_precio(ctx, { productoId: 1 });
    const r = ejecutores.enviar_datos_de_pago(ctx, { productoId: 1 }) as any;

    assert.equal(r.ok, true);
    assert.equal(ctx.partes.filter((p) => p.kind === "payment").length, 1);
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 4. EL PRECIO NUNCA SE INVENTA
 *    Era el trabajo de precio-verificado.ts (309 líneas) revisando a posteriori
 *    que el número del texto coincidiera con la base. Ahora el número no puede
 *    salir del texto del modelo.
 * ═══════════════════════════════════════════════════════════════════ */

describe("el precio", () => {
  test("sale de la base de datos, con el valor exacto", () => {
    const ctx = ctxNuevo();
    ejecutores.dar_precio(ctx, { productoId: 1 });

    const parte = ctx.partes.find((p) => p.kind === "text") as any;
    assert.match(parte.content, /60\.000/);
    assert.equal(ctx.estado.preciosDados[1].valor, 60000);
  });

  test("si el producto no tiene precio cargado, se niega en vez de inventarlo", () => {
    const ctx = ctxNuevo();
    const r = ejecutores.dar_precio(ctx, { productoId: 3 }) as any;

    assert.equal(r.ok, false);
    assert.match(r.mensaje, /No inventes un valor/i);
    assert.equal(ctx.partes.length, 0);
  });

  test("un producto que no existe no produce nada", () => {
    const ctx = ctxNuevo();
    assert.equal((ejecutores.dar_precio(ctx, { productoId: 999 }) as any).ok, false);
    assert.equal(ctx.partes.length, 0);
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 5. EL BUCLE COMPLETO
 * ═══════════════════════════════════════════════════════════════════ */

/** LLM falso: va devolviendo los turnos que se le programen. */
function llmFalso(turnos: { content?: string; tools?: { name: string; args: any }[] }[]): ClienteLLM {
  let i = 0;
  return {
    async crear() {
      const turno = turnos[i++] || { content: "ok" };
      return {
        content: turno.content ?? null,
        toolCalls: (turno.tools || []).map((t, n) => ({
          id: `call_${i}_${n}`,
          name: t.name,
          arguments: JSON.stringify(t.args),
        })),
      };
    },
  };
}

const VOZ = { nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "TecnoIA" };

describe("el bucle completo", () => {
  test("texto del modelo + partes de las herramientas, en orden", async () => {
    const historial: Mensaje[] = [
      { role: "customer", content: "hola, tienen curso de piano?", createdAt: new Date() },
    ];

    const r = await responder({
      llm: llmFalso([
        { tools: [{ name: "enfocar_producto", args: { productoId: 1 } }] },
        { tools: [{ name: "enviar_ficha", args: { productoId: 1, seccion: "completa" } }] },
        { content: "¡Claro! Te paso los detalles 👇" },
      ]),
      estado: estadoInicial(1),
      historial,
      catalogo: CATALOGO,
      voz: VOZ,
    });

    assert.equal(r.partes[0].kind, "text");
    assert.equal(r.partes[1].kind, "card");
    assert.equal(r.estado.productoEnFoco, 1);
    assert.equal(r.traza.length, 2);
  });

  test("cuando una herramienta se niega, el modelo recibe el motivo y no se envía nada de más", async () => {
    const estado = estadoInicial(1);
    estado.fichasEnviadas[1] = { seccion: "completa", at: new Date().toISOString() };

    const r = await responder({
      llm: llmFalso([
        { tools: [{ name: "enviar_ficha", args: { productoId: 1, seccion: "completa" } }] },
        { content: "¿Seguimos con el curso de piano?" },
      ]),
      estado,
      historial: [{ role: "customer", content: "hola", createdAt: new Date() }],
      catalogo: CATALOGO,
      voz: VOZ,
    });

    assert.equal(r.partes.length, 1);
    assert.equal(r.partes[0].kind, "text");
    assert.match(r.traza[0].resultado, /ya le mandaste la ficha/i);
  });

  test("una herramienta que explota no tumba la respuesta al cliente", async () => {
    const original = ejecutores.dar_precio;
    ejecutores.dar_precio = () => {
      throw new Error("base de datos caída");
    };

    try {
      const r = await responder({
        llm: llmFalso([
          { tools: [{ name: "dar_precio", args: { productoId: 1 } }] },
          { content: "Dame un segundo." },
        ]),
        estado: estadoInicial(1),
        historial: [{ role: "customer", content: "cuánto vale?", createdAt: new Date() }],
        catalogo: CATALOGO,
        voz: VOZ,
      });

      assert.equal(r.partes[0].kind, "text");
      assert.match(r.traza[0].resultado, /Falló/);
    } finally {
      ejecutores.dar_precio = original;
    }
  });

  test("nunca se manda un mensaje vacío", async () => {
    const r = await responder({
      llm: llmFalso([{ content: "" }]),
      estado: estadoInicial(1),
      historial: [{ role: "customer", content: "??", createdAt: new Date() }],
      catalogo: CATALOGO,
      voz: VOZ,
    });

    assert.equal(r.partes.length, 1);
    assert.ok((r.partes[0] as any).content.length > 0);
  });

  test("el bucle corta aunque el modelo pida herramientas sin parar", async () => {
    const infinito: ClienteLLM = {
      async crear() {
        return {
          content: null,
          toolCalls: [{ id: "x", name: "buscar_en_catalogo", arguments: '{"consulta":"piano"}' }],
        };
      },
    };

    const r = await responder({
      llm: infinito,
      estado: estadoInicial(1),
      historial: [{ role: "customer", content: "hola", createdAt: new Date() }],
      catalogo: CATALOGO,
      voz: VOZ,
    });

    assert.ok(r.traza.length <= 6, "se respetó el tope de vueltas");
    assert.ok(r.partes.length >= 1, "igual le contestó algo al cliente");
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 6. EL CATÁLOGO
 *    "no tengo ese producto solo si el cliente nombró algo concreto"
 *    (commit cama12ef) y "sin producto nombrado atiende la especialidad con
 *    más productos" (ae2cead) eran reglas de ruteo escritas a mano.
 * ═══════════════════════════════════════════════════════════════════ */

describe("el catálogo", () => {
  test("encuentra por palabra clave", () => {
    const ctx = ctxNuevo();
    const r = ejecutores.buscar_en_catalogo(ctx, { consulta: "quiero aprender piano" }) as any;

    assert.equal(r.ok, true);
    assert.match(r.mensaje, /Curso de piano/);
  });

  test("cuando no hay nada, se lo dice al modelo sin inventar", () => {
    const ctx = ctxNuevo();
    const r = ejecutores.buscar_en_catalogo(ctx, { consulta: "curso de soldadura" }) as any;

    assert.match(r.mensaje, /No hay nada en el catálogo/);
    assert.match(r.mensaje, /sin inventar/);
  });
});

describe("la búsqueda en casos borde", () => {
  test("sin tildes también encuentra ('ingles' → 'inglés')", () => {
    const ctx = ctxNuevo();
    const r = ejecutores.buscar_en_catalogo(ctx, { consulta: "ingles" }) as any;
    assert.match(r.mensaje, /Curso de inglés/);
  });

  test("con un catálogo diminuto no se suprime la palabra distintiva", () => {
    // Con 2 productos, "piano" está en el 50% — la regla de palabra genérica
    // no debe aplicarse o el catálogo chico quedaría imposible de buscar.
    const ctx: ContextoHerramientas = {
      estado: estadoInicial(1),
      catalogo: CATALOGO.slice(0, 2),
      partes: [],
    };
    const r = ejecutores.buscar_en_catalogo(ctx, { consulta: "piano" }) as any;
    assert.match(r.mensaje, /Curso de piano/);
    assert.doesNotMatch(r.mensaje, /inglés/);
  });

  test("no ofrece un producto no disponible", () => {
    const ctx: ContextoHerramientas = {
      estado: estadoInicial(1),
      catalogo: [{ ...CATALOGO[0], disponible: false }],
      partes: [],
    };
    const r = ejecutores.buscar_en_catalogo(ctx, { consulta: "piano" }) as any;
    assert.match(r.mensaje, /No hay nada en el catálogo/);
  });
});
