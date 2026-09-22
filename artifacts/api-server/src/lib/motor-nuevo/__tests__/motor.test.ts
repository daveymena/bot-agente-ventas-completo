/**
 * LOS BUGS REALES DEL ÚLTIMO MES, COMO PRUEBAS
 * ============================================
 *
 * Cada caso de acá salió de un commit real del repo entre agosto y el 13-09.
 * Lo importante no es que pasen: es POR QUÉ pasan. Ninguno depende de que el
 * modelo "entienda" bien. Son garantías estructurales de las herramientas y
 * del estado, así que no se pueden romper con una redacción nueva del cliente.
 *
 * Estas pruebas son las que escribió la reconstrucción de septiembre y se
 * MIGRARON al motor terminado: los nombres de las herramientas cambiaron
 * (`enviar_ficha`/`dar_precio`/`enviar_video` pasaron a ser una sola,
 * `mostrar`), pero los defectos que cubren son los mismos y siguen vivos.
 */

import { test, describe, expect } from "vitest";
const assert = {
  equal: (a: any, b: any, m?: string) => expect(a, m).toBe(b),
  ok: (a: any, m?: string) => expect(!!a, m).toBe(true),
  deepEqual: (a: any, b: any, m?: string) => expect(a, m).toEqual(b),
  notEqual: (a: any, b: any, m?: string) => expect(a, m).not.toBe(b),
  match: (a: string, re: RegExp, m?: string) => expect(a, m).toMatch(re),
  doesNotMatch: (a: string, re: RegExp, m?: string) => expect(a, m).not.toMatch(re),
};

import { estadoInicial, describirEstado, type EstadoConversacion } from "../estado-conversacion";
import { ejecutores, type ContextoHerramientas, type Producto } from "../herramientas";
import { guionDelNegocio } from "../nicho";
import { responder, montosInventados, type Mensaje } from "../motor";
import { clienteFalso, type ClienteLLM } from "../cliente-llm";

const CATALOGO: Producto[] = [
  {
    id: 1,
    name: "Curso de piano",
    description: "Curso completo de piano desde cero",
    price: 60000,
    currency: "COP",
    kind: "digital",
    videoUrl: "https://video.example/piano.mp4",
    disponible: true,
  },
  {
    id: 2,
    name: "Curso de inglés",
    description: "Inglés conversacional",
    price: 20000,
    currency: "COP",
    kind: "digital",
    videoUrl: null,
    disponible: true,
  },
  {
    id: 3,
    name: "Producto sin precio",
    description: "Todavía sin precio cargado",
    price: null,
    currency: "COP",
    kind: "digital",
    disponible: true,
  },
];

const GUION_DIGITAL = guionDelNegocio({
  catalogo: CATALOGO,
  negocio: {
    nombre: "TecnoIA",
    entrega: { metodo: "enlace de descarga", plazo: "inmediato" },
    garantia: { dias: 7, descripcion: "7 días de garantía" },
  },
  medios: [{ etiqueta: "Nequi", tipo: "transferencia" }],
});

function ctxNuevo(estado?: Partial<EstadoConversacion>): ContextoHerramientas {
  return {
    estado: { ...estadoInicial(1), ...estado },
    catalogo: CATALOGO,
    partes: [],
    conocimiento: [],
    guion: GUION_DIGITAL,
    mensajeDelCliente: "",
    efectos: [],
  };
}

/* ═══════════════════════════════════════════════════════════════════
 * 1. LA FICHA Y EL VIDEO NO SE REPITEN
 *    Commit a2e0099 (13-09): el dueño escribió "Hola" al día siguiente y
 *    recibió la ficha ENTERA y el video otra vez. Antes esto dependía de
 *    elVideoYaSalio() escaneando el historial buscando el enlace y el emoji 🎬.
 * ═══════════════════════════════════════════════════════════════════ */

describe("la ficha y el video no se repiten", () => {
  test("la segunda vez que se pide la ficha, no se envía", async () => {
    const ctx = ctxNuevo();

    const primera = (await ejecutores.mostrar(ctx, { productoId: 1, seccion: "completa" })) as any;
    assert.equal(primera.ok, true);
    assert.equal(ctx.partes.filter((p) => p.kind === "card").length, 1);

    const segunda = (await ejecutores.mostrar(ctx, { productoId: 1, seccion: "completa" })) as any;
    assert.equal(segunda.ok, false);
    assert.match(segunda.mensaje, /ya le mandaste/i);
    assert.equal(ctx.partes.filter((p) => p.kind === "card").length, 1, "no se agregó una segunda ficha");
  });

  test("el video tampoco, y no depende de encontrar el enlace en el historial", async () => {
    const ctx = ctxNuevo();

    assert.equal(((await ejecutores.mostrar(ctx, { productoId: 1, seccion: "video" })) as any).ok, true);
    const repetido = (await ejecutores.mostrar(ctx, { productoId: 1, seccion: "video" })) as any;

    assert.equal(repetido.ok, false);
    assert.equal(ctx.partes.filter((p) => p.kind === "card").length, 1);
  });

  test("si el cliente la pide de nuevo explícitamente, sí se reenvía", async () => {
    const ctx = ctxNuevo();
    await ejecutores.mostrar(ctx, { productoId: 1, seccion: "completa" });

    const reenvio = (await ejecutores.mostrar(ctx, { productoId: 1, seccion: "completa", reenviar: true })) as any;

    assert.equal(reenvio.ok, true);
    assert.equal(ctx.partes.filter((p) => p.kind === "card").length, 2);
  });

  test("al volver al día siguiente el estado sigue ahí (no hay ventana de 4 horas)", async () => {
    // El bug era VENTANA_SESION_MS = 4h en conversation-engine.ts: pasadas 4
    // horas se consideraba "sesión nueva" y se repetía todo. El estado explícito
    // no caduca por tiempo, así que esto no puede volver a pasar.
    const ayer = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
    const ctx = ctxNuevo({
      seccionesEnviadas: { 1: { completa: ayer, video: ayer } },
      productoEnFoco: 1,
    });

    assert.equal(((await ejecutores.mostrar(ctx, { productoId: 1, seccion: "completa" })) as any).ok, false);
    assert.equal(((await ejecutores.mostrar(ctx, { productoId: 1, seccion: "video" })) as any).ok, false);
    assert.equal(ctx.partes.length, 0, "no se le reenvió nada al cliente que volvió");
  });

  test("un producto que no tiene video cargado no ofrece video", async () => {
    const ctx = ctxNuevo();
    const r = (await ejecutores.mostrar(ctx, { productoId: 2, seccion: "video" })) as any;
    assert.equal(r.ok, false);
    assert.match(r.mensaje, /no tiene video/i);
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
  test("dar el precio deja registrado a qué contestaría un 'sí'", async () => {
    const ctx = ctxNuevo();
    await ejecutores.mostrar(ctx, { productoId: 1, seccion: "precio" });

    assert.equal(ctx.estado.ultimaOferta?.tipo, "precio");
    assert.equal(ctx.estado.ultimaOferta?.productoId, 1);
    assert.match(String(ctx.estado.ultimaOferta?.resumen), /60\.000/);
  });

  test("el bloque de contexto le dice al modelo exactamente qué se ofreció", async () => {
    const ctx = ctxNuevo();
    await ejecutores.mostrar(ctx, { productoId: 1, seccion: "completa" });

    const texto = describirEstado(ctx.estado, (id) => CATALOGO.find((p) => p.id === id)!.name);

    assert.match(texto, /LO ÚLTIMO QUE LE OFRECISTE: la ficha completa de Curso de piano/);
    // Y no hay ninguna lista de formas de decir que sí: cualquier afirmación sirve.
    assert.match(texto, /"sí", "dale", "listo", "obvio"/);
  });

  test("la última oferta se pisa con la más reciente, no se acumulan", async () => {
    const ctx = ctxNuevo();
    await ejecutores.mostrar(ctx, { productoId: 1, seccion: "completa" });
    await ejecutores.mostrar(ctx, { productoId: 1, seccion: "precio" });

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
  test("el agente no puede confirmar un pago: el aviso no lo confirma", () => {
    const ctx = ctxNuevo();
    const r = ejecutores.registrar_pago_reportado(ctx, {}) as any;

    assert.equal(r.ok, true);
    assert.equal(ctx.estado.comprobanteRecibido, true);
    assert.equal(ctx.estado.pagoConfirmadoPorHumano, false, "solo una persona puede confirmarlo");
    assert.match(r.mensaje, /no le digas que el pago está confirmado/i);
    assert.equal(ctx.efectos.filter((e) => e.tipo === "pago_reportado").length, 1);
  });

  test("mientras no lo verifique una persona, el contexto se lo dice al modelo", () => {
    const ctx = ctxNuevo({ comprobanteRecibido: true });
    const texto = describirEstado(ctx.estado, (id) => CATALOGO.find((p) => p.id === id)!.name);

    assert.match(texto, /NINGUNA persona lo verificó/);
    assert.match(texto, /No afirmes que el pago está confirmado/);
  });

  test("no se mandan datos de pago si antes no se dio el precio", async () => {
    // "sin oferta previa no hay ficha ni pago" — commit 9c18d99.
    const ctx = ctxNuevo();
    const r = (await ejecutores.mostrar(ctx, { productoId: 1, seccion: "pago" })) as any;

    assert.equal(r.ok, false);
    assert.match(r.mensaje, /todavía no le dijiste cuánto cuesta/i);
    assert.equal(ctx.partes.length, 0);
  });

  test("con el precio dado, sí se mandan", async () => {
    const ctx = ctxNuevo();
    await ejecutores.mostrar(ctx, { productoId: 1, seccion: "precio" });
    const r = (await ejecutores.mostrar(ctx, { productoId: 1, seccion: "pago" })) as any;

    assert.equal(r.ok, true);
    assert.equal(ctx.partes.filter((p) => p.kind === "card" && (p as any).seccion === "pago").length, 1);
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 4. EL PRECIO NUNCA SE INVENTA
 *    Era el trabajo de precio-verificado.ts (309 líneas) revisando a posteriori
 *    que el número del texto coincidiera con la base. Ahora el número sale de
 *    una herramienta; lo único que queda es detectar la cifra escrita a mano.
 * ═══════════════════════════════════════════════════════════════════ */

describe("el precio", () => {
  test("el precio se manda como tarjeta, con el valor de la base", async () => {
    const ctx = ctxNuevo();
    await ejecutores.mostrar(ctx, { productoId: 1, seccion: "precio" });

    const tarjeta = ctx.partes.find((p) => p.kind === "card") as any;
    assert.equal(tarjeta.seccion, "precio");
    assert.equal(tarjeta.productId, 1);
    assert.equal(ctx.estado.seccionesEnviadas[1].precio !== undefined, true);
  });

  test("una cifra que no está en el catálogo se detecta como inventada", () => {
    assert.deepEqual(montosInventados("te sale $185.000 y listo", CATALOGO), [185000]);
  });

  test("un precio real del catálogo NO se marca como inventado", () => {
    assert.deepEqual(montosInventados("el curso vale $60.000", CATALOGO), []);
  });

  test("la suma de dos productos no se marca como inventada", () => {
    assert.deepEqual(montosInventados("los dos salen 80.000", CATALOGO), []);
  });

  test("'hace 3 días' y un número de teléfono NO son cifras de plata", () => {
    // El falso positivo era el riesgo de poner una red: perseguir cualquier
    // número convertía cada respuesta en un reintento.
    assert.deepEqual(montosInventados("escribime al 3001234567, llevo 3 días esperando", CATALOGO), []);
  });

  test("si el negocio no cargó la entrega, la sección entrega no se manda", async () => {
    const sinEntrega = guionDelNegocio({ catalogo: CATALOGO, negocio: { nombre: "Sin Datos" } });
    const ctx = ctxNuevo();
    ctx.guion = sinEntrega;

    const r = (await ejecutores.mostrar(ctx, { productoId: 1, seccion: "entrega" })) as any;
    assert.equal(r.ok, false);
    assert.match(r.mensaje, /no cargó cómo entrega/i);
    assert.equal(ctx.partes.length, 0);
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 5. EL CONOCIMIENTO DEL DUEÑO
 * ═══════════════════════════════════════════════════════════════════ */

describe("el conocimiento del dueño", () => {
  test("responde con lo que el dueño cargó", () => {
    const ctx = ctxNuevo();
    ctx.conocimiento = [
      { productId: 1, pregunta: "¿qué incluye?", disparadores: ["incluye", "temario", "módulos"], respuesta: "40 lecciones y 3 libros en PDF" },
    ];

    const r = ejecutores.consultar_conocimiento(ctx, { pregunta: "qué incluye el curso?", productoId: 1 }) as any;
    assert.equal(r.ok, true);
    assert.match(r.mensaje, /40 lecciones/);
  });

  test("si el dueño lo dejó sin respuesta, el sistema lo dice: no se inventa", () => {
    const ctx = ctxNuevo();
    ctx.conocimiento = [
      { productId: 1, pregunta: "¿dan certificado?", disparadores: ["certificado", "diploma"], respuesta: null },
    ];

    const r = ejecutores.consultar_conocimiento(ctx, { pregunta: "dan certificado?", productoId: 1 }) as any;
    assert.equal(r.ok, true);
    assert.match(r.mensaje, /NO dejó respuesta/);
    assert.match(r.mensaje, /No inventes/);
  });

  test("lo que no está cargado se dice sin rodeos", () => {
    const ctx = ctxNuevo();
    const r = ejecutores.consultar_conocimiento(ctx, { pregunta: "¿hay clases en vivo?" }) as any;
    assert.match(r.mensaje, /no cargó nada/i);
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 6. LOS DATOS DEL CLIENTE Y EL CIERRE
 * ═══════════════════════════════════════════════════════════════════ */

describe("los datos del cliente", () => {
  test("se guardan y dejan efecto pendiente para la base", () => {
    const ctx = ctxNuevo();
    const r = ejecutores.registrar_dato(ctx, { campo: "ciudad", valor: "Cali" }) as any;

    assert.equal(r.ok, true);
    assert.equal(ctx.estado.datos.ciudad, "Cali");
    assert.equal(ctx.efectos[0].tipo, "dato");
  });

  test("un valor vacío no se guarda", () => {
    const ctx = ctxNuevo();
    assert.equal((ejecutores.registrar_dato(ctx, { campo: "ciudad", valor: "  " }) as any).ok, false);
  });

  test("'qué me falta para cerrar' devuelve solo lo que falta", () => {
    const ctx = ctxNuevo();
    ctx.estado.datos.nombre = "Duvier";

    const r = ejecutores.que_falta_para_cerrar(ctx, {}) as any;
    assert.match(r.mensaje, /Pedí UNO por mensaje/);
    assert.doesNotMatch(r.mensaje, /nombre/);
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 7. EL BUCLE COMPLETO
 * ═══════════════════════════════════════════════════════════════════ */

const VOZ = { nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "TecnoIA" };

async function correr(params: {
  llm: ClienteLLM;
  estado?: EstadoConversacion;
  historial?: Mensaje[];
  catalogo?: Producto[];
  guion?: any;
}) {
  return responder({
    llm: params.llm,
    estado: params.estado ?? estadoInicial(1),
    historial: params.historial ?? [{ role: "customer" as const, content: "hola", createdAt: new Date() }],
    catalogo: params.catalogo ?? CATALOGO,
    conocimiento: [],
    guion: params.guion ?? GUION_DIGITAL,
    voz: VOZ,
  });
}

describe("el bucle completo", () => {
  test("texto del modelo + partes de las herramientas, en orden", async () => {
    const r = await correr({
      llm: clienteFalso([
        { toolCalls: [{ id: "a", name: "enfocar_producto", arguments: '{"productoId":1}' }] },
        { toolCalls: [{ id: "b", name: "mostrar", arguments: '{"productoId":1,"seccion":"completa"}' }] },
        { content: "¡Claro! Te paso los detalles 👇" },
      ]),
      historial: [{ role: "customer", content: "hola, tienen curso de piano?", createdAt: new Date() }],
    });

    assert.equal(r.partes[0].kind, "text");
    assert.equal(r.partes[1].kind, "card");
    assert.equal(r.estado.productoEnFoco, 1);
    assert.equal(r.traza.length, 2);
  });

  test("cuando una herramienta se niega, el modelo recibe el motivo y no se envía nada de más", async () => {
    const estado = estadoInicial(1);
    estado.seccionesEnviadas[1] = { completa: new Date().toISOString() };

    const r = await correr({
      llm: clienteFalso([
        { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"completa"}' }] },
        { content: "¿Seguimos con el curso de piano?" },
      ]),
      estado,
    });

    assert.equal(r.partes.length, 1);
    assert.equal(r.partes[0].kind, "text");
    assert.match(r.traza[0].resultado, /ya le mandaste/i);
  });

  test("una herramienta que explota no tumba la respuesta al cliente", async () => {
    const original = ejecutores.mostrar;
    ejecutores.mostrar = () => {
      throw new Error("base de datos caída");
    };

    try {
      const r = await correr({
        llm: clienteFalso([
          { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"precio"}' }] },
          { content: "Dame un segundo." },
        ]),
        historial: [{ role: "customer", content: "cuánto vale?", createdAt: new Date() }],
      });

      assert.equal(r.partes[0].kind, "text");
      assert.match(r.traza[0].resultado, /Falló/);
    } finally {
      ejecutores.mostrar = original;
    }
  });

  test("nunca se manda un mensaje vacío", async () => {
    const r = await correr({
      llm: clienteFalso([{ content: "" }]),
      historial: [{ role: "customer", content: "??", createdAt: new Date() }],
    });

    assert.equal(r.partes.length, 1);
    assert.ok((r.partes[0] as any).content.length > 0);
  });

  test("el bucle corta aunque el modelo pida herramientas sin parar", async () => {
    const infinito = clienteFalso([
      { toolCalls: [{ id: "x", name: "buscar_en_catalogo", arguments: '{"consulta":"piano"}' }] },
    ]);

    const r = await correr({ llm: infinito });

    assert.ok(r.traza.length <= 6, "se respetó el tope de vueltas");
    assert.ok(r.partes.length >= 1, "igual le contestó algo al cliente");
  });

  test("si el modelo escribe una cifra inventada, se le pide que la reescriba", async () => {
    const r = await correr({
      llm: clienteFalso([
        { content: "Te lo dejo en $99.000, súper barato" },
        { content: "Te paso el precio exacto en un momento 👇" },
      ]),
      historial: [{ role: "customer", content: "cuánto cuesta?", createdAt: new Date() }],
    });

    assert.equal(r.corregido, true);
    assert.doesNotMatch(String((r.partes[0] as any).content), /99\.000/);
  });

  test("si el modelo insiste con la cifra inventada, la respuesta sale sin ese número", async () => {
    const r = await correr({
      llm: clienteFalso([
        { content: "Vale $450.000. Y el envío son 12.000." },
        { content: "Vale $450.000. Y el envío son 12.000." },
      ]),
      historial: [{ role: "customer", content: "precio?", createdAt: new Date() }],
    });

    assert.equal(r.corregido, false, "no alcanzó con la corrección");
    assert.doesNotMatch(String((r.partes[0] as any).content), /450\.000/);
  });

  test("no se mandan dos tarjetas iguales en el mismo turno", async () => {
    const r = await correr({
      llm: clienteFalso([
        { toolCalls: [
          { id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"precio"}' },
          { id: "b", name: "mostrar", arguments: '{"productoId":1,"seccion":"precio"}' },
        ] },
        { content: "Ahí va el precio" },
      ]),
      historial: [{ role: "customer", content: "precio del curso de piano?", createdAt: new Date() }],
    });

    assert.equal(r.partes.filter((p) => p.kind === "card").length, 1);
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 8. EL CATÁLOGO
 * ═══════════════════════════════════════════════════════════════════ */

describe("el catálogo", () => {
  test("encuentra por palabra clave", () => {
    const ctx = ctxNuevo();
    const r = ejecutores.buscar_en_catalogo(ctx, { consulta: "quiero aprender piano" }) as any;

    assert.equal(r.ok, true);
    assert.match(r.mensaje, /Curso de piano/);
  });

  test("cuando no hay nada, se lo dice al modelo y le muestra lo que sí hay", () => {
    const ctx = ctxNuevo();
    const r = ejecutores.buscar_en_catalogo(ctx, { consulta: "curso de soldadura" }) as any;

    assert.match(r.mensaje, /No hay nada en el catálogo/);
    assert.match(r.mensaje, /Lo que SÍ hay/);
    assert.match(r.mensaje, /Nunca inventes/);
  });

  test("sin tildes también encuentra ('ingles' → 'inglés')", () => {
    const ctx = ctxNuevo();
    const r = ejecutores.buscar_en_catalogo(ctx, { consulta: "ingles" }) as any;
    assert.match(r.mensaje, /Curso de inglés/);
  });

  test("con un catálogo diminuto no se suprime la palabra distintiva", () => {
    const ctx: ContextoHerramientas = { ...ctxNuevo(), catalogo: CATALOGO.slice(0, 2) };
    const r = ejecutores.buscar_en_catalogo(ctx, { consulta: "piano" }) as any;
    assert.match(r.mensaje, /Curso de piano/);
    assert.doesNotMatch(r.mensaje, /inglés/);
  });

  test("no ofrece un producto no disponible", () => {
    const ctx: ContextoHerramientas = { ...ctxNuevo(), catalogo: [{ ...CATALOGO[0], disponible: false }] };
    const r = ejecutores.buscar_en_catalogo(ctx, { consulta: "piano" }) as any;
    assert.match(r.mensaje, /No hay nada en el catálogo/);
  });

  test("'curso' no distingue nada: pedir soldadura no devuelve piano", () => {
    // Medido el 13-09: la búsqueda devolvía "Curso de piano" cuando el cliente
    // pedía un curso de soldadura, porque compartían la palabra "curso".
    const ctx: ContextoHerramientas = {
      ...ctxNuevo(),
      catalogo: [
        { id: 1, name: "Curso de piano", description: "Piano desde cero", price: 60000, currency: "COP", kind: "digital", disponible: true },
        { id: 2, name: "Curso de inglés", description: "Inglés", price: 20000, currency: "COP", kind: "digital", disponible: true },
        { id: 3, name: "Curso de guitarra", description: "Guitarra", price: 30000, currency: "COP", kind: "digital", disponible: true },
      ],
    };
    // Lo que se garantiza es que NO lo presenta como una coincidencia. La
    // lista de "lo que sí hay" va aparte y sirve para que el modelo ofrezca
    // algo real en vez de quedarse en blanco.
    const r = ejecutores.buscar_en_catalogo(ctx, { consulta: "curso de soldadura" }) as any;
    assert.match(r.mensaje, /^No hay nada en el catálogo/);
    assert.doesNotMatch(r.mensaje.split("Lo que SÍ hay")[0], /Curso de piano/);
  });

  test("'taladro' en una tienda chica SÍ se encuentra (regresión del 22-09)", () => {
    // 3 taladros en un catálogo de 5: frecuencia 60%. Con el umbral viejo (0.5)
    // "taladro" se trataba como palabra de categoría, la búsqueda volvía vacía
    // y el bot decía "no manejo taladros" a un producto que sí estaba.
    const ctx = ctxNuevo();
    ctx.catalogo = [
      { id: 1, name: "Kit Taladro Percutor Inalámbrico 24V", description: "", price: 150000, currency: "COP", kind: "physical", disponible: true },
      { id: 2, name: "Taladro inalámbrico 36V", description: "", price: 180000, currency: "COP", kind: "physical", disponible: true },
      { id: 3, name: "Taladro Brushless con polichador", description: "", price: 180000, currency: "COP", kind: "physical", disponible: true },
      { id: 4, name: "Destornillador", description: "", price: 20000, currency: "COP", kind: "physical", disponible: true },
      { id: 5, name: "Cinta métrica", description: "", price: 15000, currency: "COP", kind: "physical", disponible: true },
    ];

    const r = ejecutores.buscar_en_catalogo(ctx, { consulta: "me interesa un taladro" }) as any;

    assert.match(r.mensaje, /Taladro/);
    assert.doesNotMatch(r.mensaje, /No hay nada en el catálogo/);
  });

  test("mostrar con id vacío guía a buscar primero, no falla en seco", async () => {
    const ctx = ctxNuevo();
    const r = (await ejecutores.mostrar(ctx, { productoId: undefined, seccion: "completa" })) as any;

    assert.equal(r.ok, false);
    assert.match(r.mensaje, /buscar_en_catalogo/i);
  });
});
