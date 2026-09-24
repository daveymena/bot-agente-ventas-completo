/**
 * EL MISMO MOTOR, TRES NEGOCIOS QUE NO SE PARECEN EN NADA
 * =======================================================
 *
 * Esta prueba existe por una pregunta concreta del dueño: "¿y esto funciona
 * para un negocio que no sea el mío?". El motor viejo contestaba que sí y
 * después le prometía a un gimnasio "acceso de por vida por Google Drive",
 * porque los datos del negocio del dueño estaban escritos en el código.
 *
 * Acá el mismo motor atiende, en la misma corrida:
 *
 *   · una escuela de cursos digitales,
 *   · un local de repuestos de moto que despacha por transportadora,
 *   · un adiestrador canino que trabaja con turnos.
 *
 * Y lo que se verifica no es el estilo: es que el sistema le diga a cada uno lo
 * que le corresponde, que no le mienta a ninguno, y que no pase datos de un
 * negocio al otro.
 */

import { test, describe, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db, conversations, messages, tenants } from "@workspace/db";

const assert = {
  equal: (a: any, b: any, m?: string) => expect(a, m).toBe(b),
  ok: (a: any, m?: string) => expect(!!a, m).toBe(true),
  match: (a: string, re: RegExp, m?: string) => expect(a, m).toMatch(re),
  doesNotMatch: (a: string, re: RegExp, m?: string) => expect(a, m).not.toMatch(re),
};

import { estadoInicial, crearRepositorioDrizzle, type EstadoConversacion } from "../estado-conversacion";
import { guionDelNegocio, type GuionDelNegocio, type NegocioParaNicho, type ProductoParaNicho } from "../nicho";
import { construirPromptDeSistema } from "../motor";
import type { ItemDeConocimiento, Producto } from "../herramientas";
import { responder } from "../motor";
import { ETAPA_A_STAGE, cargarHistorial } from "../adaptador";
import { clienteFalso } from "../cliente-llm";

/* ────────────────────────────────────────────────────────────────────────────
 * LOS TRES NEGOCIOS
 * ──────────────────────────────────────────────────────────────────────────── */

const CURSOS: { catalogo: Producto[]; negocio: NegocioParaNicho } = {
  catalogo: [
    { id: 1, name: "Curso de piano", description: "Piano desde cero, 40 lecciones", price: 60000, currency: "COP", kind: "digital", disponible: true, videoUrl: "https://v/piano.mp4" },
    { id: 2, name: "Curso de IA", description: "IA aplicada al trabajo", price: 80000, currency: "COP", kind: "digital", disponible: true },
  ],
  negocio: {
    nombre: "Cursos Ya",
    nicho: "educación online",
    entrega: { metodo: "Google Drive", plazo: "inmediato", detalle: "El enlace sale apenas se confirma el pago." },
    garantia: { dias: 7, descripcion: "7 días de garantía" },
    acceso: { tipo: "de por vida" },
    loQueDebeSaber: ["Cursos 100% digitales", "No hay clases en vivo"],
  },
};

const REPUESTOS: { catalogo: Producto[]; negocio: NegocioParaNicho } = {
  catalogo: [
    { id: 11, name: "Pastillas de freno", description: "Para moto, juego completo", price: 45000, currency: "COP", kind: "physical", opciones: ["Delantera", "Trasera"], disponible: true },
    { id: 12, name: "Kit de arrastre", description: "Cadena, corona y piñón", price: 180000, currency: "COP", kind: "physical", disponible: true },
  ],
  negocio: {
    nombre: "Repuestos JJ",
    nicho: "repuestos de moto",
    entrega: { metodo: "transportadora", plazo: "2 a 4 días hábiles" },
    cobertura: "Colombia",
    condiciones: { pais: "Colombia", envio: { plazo: "2 a 4 días hábiles", cobertura: "nacional" }, pagoEnvio: "contraentrega" },
    noPuede: ["instalar el repuesto"],
  },
};

const CANINO: { catalogo: Producto[]; negocio: NegocioParaNicho } = {
  catalogo: [
    { id: 21, name: "Adiestramiento básico", description: "10 sesiones de obediencia en tu casa", price: 900000, currency: "COP", kind: "service", disponible: true },
  ],
  negocio: {
    nombre: "K9 Adiestramiento",
    nicho: "adiestramiento canino",
    entrega: { metodo: "sesiones en tu casa", plazo: "a convenir" },
    cobertura: "Cali y alrededores",
    horario: "lunes a sábado, 8:00 a 18:00",
  },
};

const MEDIOS_CURSOS = [{ etiqueta: "Nequi", tipo: "transferencia" as const }];
const MEDIOS_REPUESTOS = [{ etiqueta: "Contraentrega", tipo: "transferencia" as const }];
const MEDIOS_CANINO = [{ etiqueta: "Transferencia bancaria", tipo: "transferencia" as const }];

const guionDe = (n: typeof CURSOS, medios: any[], productoEnFoco?: number | null): GuionDelNegocio =>
  guionDelNegocio({
    catalogo: n.catalogo as unknown as ProductoParaNicho[],
    negocio: n.negocio,
    medios,
    productoEnFoco: productoEnFoco != null ? (n.catalogo.find((p) => p.id === productoEnFoco) as any) : null,
  });

const VOZ = (nombre: string, negocio: string) => ({
  nombreAgente: "Sofía",
  rolAgente: "asesora comercial",
  nombreNegocio: negocio,
  instruccionesExtra: null,
});

/** Corre un turno con un modelo guionado y devuelve partes + estado + traza. */
async function turno(params: {
  negocio: typeof CURSOS;
  medios: any[];
  estado: EstadoConversacion;
  mensaje: string;
  guionado: { content?: string; tools?: { name: string; args: any }[] }[];
  conocimiento?: ItemDeConocimiento[];
}) {
  const catalogo = params.negocio.catalogo;
  const guion = guionDe(params.negocio, params.medios, params.estado.productoEnFoco);
  const historial = [{ role: "customer" as const, content: params.mensaje, createdAt: new Date() }];

  const llm = clienteFalso(
    params.guionado.map((g) => ({
      content: g.content,
      toolCalls: (g.tools || []).map((t, i) => ({ id: `c${i}`, name: t.name, arguments: JSON.stringify(t.args) })),
    })) as any,
  );

  const r = await responder({
    llm,
    estado: params.estado,
    historial,
    catalogo,
    conocimiento: params.conocimiento || [],
    guion,
    voz: VOZ("Sofía", params.negocio.negocio.nombre || ""),
  });

  // El prompt con el que se corrió ESTE turno: el estado viejo todavía estaba
  // ahí, porque el motor lo pisa al final.
  // Lo fijo va primero y el estado del turno al final (caché del proveedor):
  // se juntan todos los mensajes del sistema de la primera llamada.
  (r as any).system = ((llm as any).llamadas[0]?.messages ?? [])
    .filter((m: any) => m.role === "system")
    .map((m: any) => m.content)
    .join("\n\n");
  return r;
}

function systemDe(negocio: typeof CURSOS, medios: any[], estado = estadoInicial(1)) {
  const guion = guionDe(negocio, medios, estado.productoEnFoco);
  return construirPromptDeSistema({
    voz: VOZ("Sofía", negocio.negocio.nombre || ""),
    estado,
    catalogo: negocio.catalogo,
    guion,
    nombrePorProducto: (id) => negocio.catalogo.find((p) => p.id === id)?.name ?? `#${id}`,
  });
}

/* ═══════════════════════════════════════════════════════════════════
 * 1. CADA NEGOCIO RECIBE SU PROPIA VERDAD
 * ═══════════════════════════════════════════════════════════════════ */

describe("cada negocio recibe su propia verdad", () => {
  test("la escuela de cursos: entrega por Drive, sin enviós", () => {
    const s = systemDe(CURSOS, MEDIOS_CURSOS);
    assert.match(s, /Google Drive/);
    assert.match(s, /7 días de garantía/);
    assert.match(s, /No hables de envíos/);
    assert.doesNotMatch(s, /Entrega: transportadora/);
    assert.match(s, /Entrega: Google Drive/);
  });

  test("el local de repuestos: transportadora y contraentrega, sin Drive", () => {
    const s = systemDe(REPUESTOS, MEDIOS_REPUESTOS);
    assert.match(s, /transportadora/);
    assert.match(s, /2 a 4 días hábiles/);
    assert.doesNotMatch(s, /Google Drive/);
    assert.doesNotMatch(s, /No hables de envíos/);
  });

  test("el adiestrador: agenda y cobertura, sin paquetes", () => {
    const s = systemDe(CANINO, MEDIOS_CANINO);
    assert.match(s, /sesiones en tu casa/);
    assert.match(s, /Cali y alrededores/);
    assert.match(s, /8:00 a 18:00/);
    assert.match(s, /no se despacha, se agenda/);
  });

  test("lo que el dueño cargó aparece, y lo que no cargó se declara faltante", () => {
    const s = systemDe(CURSOS, MEDIOS_CURSOS);
    assert.match(s, /Cursos 100% digitales/);
    assert.match(s, /NO TENÉS ESTOS DATOS/);
  });

  test("ningún negocio hereda el dato de otro (el bug de TecnoVariedades)", () => {
    const nombres = [systemDe(CURSOS, MEDIOS_CURSOS), systemDe(REPUESTOS, MEDIOS_REPUESTOS), systemDe(CANINO, MEDIOS_CANINO)];
    assert.ok(nombres[0].includes("Google Drive"));
    assert.ok(!nombres[1].includes("Google Drive"));
    assert.ok(!nombres[2].includes("Google Drive"));
    // La contraentrega SÍ puede aparecer en el de cursos, pero como
    // PROHIBICIÓN ("no hables de contraentrega"): lo que no puede pasar es
    // que aparezca como una forma de cobro de ese negocio.
    assert.doesNotMatch(nombres[0], /Se cobra con:[^\n]*contraentrega/i);
    assert.match(nombres[1], /Se cobra con:[^\n]*Contraentrega/i);
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 2. UNA VENTA COMPLETA, NEGOCIO POR NEGOCIO
 * ═══════════════════════════════════════════════════════════════════ */

describe("una venta completa en la escuela de cursos", () => {
  test("presenta, da el precio, cobra y deja el pago en verificación", async () => {
    let estado = estadoInicial(1);

    // 1. El cliente pregunta por el curso.
    let r = await turno({
      negocio: CURSOS,
      medios: MEDIOS_CURSOS,
      estado,
      mensaje: "hola, tienen curso de piano?",
      guionado: [
        { tools: [{ name: "enfocar_producto", args: { productoId: 1 } }, { name: "mostrar", args: { productoId: 1, seccion: "completa" } }] },
        { content: "Sí, justo lo tenemos. Te lo muestro 👇" },
      ],
    });
    assert.equal(r.partes.filter((p) => p.kind === "card").length, 1);
    assert.equal(r.estado.productoEnFoco, 1);
    estado = r.estado;

    // 2. Pregunta el precio: sale de la ficha, no del texto del modelo.
    r = await turno({
      negocio: CURSOS,
      medios: MEDIOS_CURSOS,
      estado,
      mensaje: "cuánto vale?",
      guionado: [{ tools: [{ name: "mostrar", args: { productoId: 1, seccion: "precio" } }] }, { content: "Te paso el valor 👇" }],
    });
    assert.equal((r.partes.find((p) => p.kind === "card") as any).seccion, "precio");
    assert.doesNotMatch(String((r.partes[0] as any).content), /\d{3}/, "el modelo no escribe el precio");
    estado = r.estado;

    // 3. Quiere pagar. Primero intenta sin precio: el sistema ya lo dio, pasa.
    r = await turno({
      negocio: CURSOS,
      medios: MEDIOS_CURSOS,
      estado,
      mensaje: "cómo pago?",
      guionado: [{ tools: [{ name: "mostrar", args: { productoId: 1, seccion: "pago" } }] }, { content: "Te paso los datos 👇" }],
    });
    assert.equal((r.partes.find((p) => p.kind === "card") as any).seccion, "pago");
    assert.equal(r.estado.etapa, "cierre");
    estado = r.estado;

    // 4. Dice que pagó: queda en verificación, NUNCA confirmado.
    r = await turno({
      negocio: CURSOS,
      medios: MEDIOS_CURSOS,
      estado,
      mensaje: "listo, ya te pagué por nequi",
      guionado: [{ tools: [{ name: "registrar_pago_reportado", args: { medio: "nequi" } }] }, { content: "Perfecto, queda en verificación y en cuanto confirmen te llega el acceso 🙌" }],
    });
    assert.equal(r.estado.comprobanteRecibido, true);
    assert.equal(r.estado.pagoConfirmadoPorHumano, false);
    assert.match(String((r.partes[0] as any).content), /verificación/);
    assert.equal(r.efectos.filter((e) => e.tipo === "pago_reportado").length, 1);
  });

  test("no le vuelve a mandar la ficha al día siguiente, aunque el cliente salude de nuevo", async () => {
    let estado = estadoInicial(2);
    const guionado = [
      { tools: [{ name: "mostrar", args: { productoId: 1, seccion: "completa" } }] },
      { content: "Te la mando de nuevo 👇" },
    ];

    const primero = await turno({ negocio: CURSOS, medios: MEDIOS_CURSOS, estado, mensaje: "hola", guionado });
    assert.equal(primero.partes.filter((p) => p.kind === "card").length, 1);

    estado = primero.estado;
    estado.ultimoMensajeCliente = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();

    const segundo = await turno({ negocio: CURSOS, medios: MEDIOS_CURSOS, estado, mensaje: "hola, volví", guionado });
    assert.equal(segundo.partes.filter((p) => p.kind === "card").length, 0, "no la repite");
    assert.match(segundo.traza[0].resultado, /ya le mandaste/i);
    // Y el modelo recibe el aviso de visita nueva: no se presenta, pero
    // tampoco retoma la venta vieja por su cuenta (ver visita-nueva.test.ts).
    // Se lee del prompt con el que corrió el turno: al final del turno el motor
    // actualiza la marca de tiempo, así que reconstruirlo después no lo vería.
    assert.match(String((segundo as any).system), /VISITA NUEVA/);
    assert.match(String((segundo as any).system), /De Curso de piano ya le enviaste/);
  });
});

describe("una venta completa en el local de repuestos", () => {
  test("no cierra sin saber a dónde mandarlo, y lo pide de a uno", async () => {
    let estado = estadoInicial(3);

    let r = await turno({
      negocio: REPUESTOS,
      medios: MEDIOS_REPUESTOS,
      estado,
      mensaje: "hola, soy Duvier, tenés pastillas de freno?",
      guionado: [
        { tools: [
          { name: "registrar_dato", args: { campo: "nombre", valor: "Duvier" } },
          { name: "enfocar_producto", args: { productoId: 11 } },
          { name: "mostrar", args: { productoId: 11, seccion: "completa" } },
        ] },
        { content: "Sí, tengo. Te la muestro 👇" },
      ],
    });
    estado = r.estado;

    // El cliente ya quiere comprar: el sistema le dice al modelo qué falta.
    r = await turno({
      negocio: REPUESTOS,
      medios: MEDIOS_REPUESTOS,
      estado,
      mensaje: "la quiero, cómo hacemos?",
      guionado: [{ tools: [{ name: "que_falta_para_cerrar", args: {} }] }, { content: "Para mandártela necesito saber tu ciudad 👀" }],
    });
    assert.match(r.traza[0].resultado, /direccion/);
    assert.doesNotMatch(r.traza[0].resultado, /nombre/, "el nombre ya lo dio en el saludo");
    assert.match(r.traza[0].resultado, /UNO por mensaje/);
    // Y como hay dos variantes, también hay que saber cuál.
    assert.match(r.traza[0].resultado, /variante/);
    estado = r.estado;

    // Va dando los datos de a uno.
    r = await turno({
      negocio: REPUESTOS,
      medios: MEDIOS_REPUESTOS,
      estado,
      mensaje: "soy de Cali, barrio San Antonio, calle 5 # 15-20",
      guionado: [
        { tools: [{ name: "registrar_dato", args: { campo: "ciudad", valor: "Cali" } }, { name: "registrar_dato", args: { campo: "direccion", valor: "calle 5 # 15-20" } }] },
        { content: "Anotado 👍 ¿delantera o trasera?" },
      ],
    });
    assert.equal(r.estado.datos.ciudad, "Cali");
    assert.equal(r.efectos.filter((e) => e.tipo === "dato").length, 2);
    estado = r.estado;

    r = await turno({
      negocio: REPUESTOS,
      medios: MEDIOS_REPUESTOS,
      estado,
      mensaje: "delantera",
      guionado: [{ tools: [{ name: "registrar_dato", args: { campo: "variante", valor: "delantera" } }, { name: "que_falta_para_cerrar", args: {} }, { name: "mostrar", args: { productoId: 11, seccion: "precio" } }] }, { content: "Listo, te va en 45.000 👇" }],
    });
    assert.match(r.traza[1].resultado, /No falta ningún dato/);
  });
});

describe("una venta completa en el adiestramiento canino", () => {
  test("el cierre es una agenda: qué necesita y cuándo", async () => {
    let estado = estadoInicial(4);

    let r = await turno({
      negocio: CANINO,
      medios: MEDIOS_CANINO,
      estado,
      mensaje: "hola, mi perro no hace caso, qué hacés?",
      guionado: [
        { tools: [{ name: "enfocar_producto", args: { productoId: 21 } }, { name: "mostrar", args: { productoId: 21, seccion: "completa" } }] },
        { content: "Trabajo justo eso. Te cuento cómo es 👇" },
      ],
    });
    estado = r.estado;

    r = await turno({
      negocio: CANINO,
      medios: MEDIOS_CANINO,
      estado,
      mensaje: "quiero agendar",
      guionado: [{ tools: [{ name: "que_falta_para_cerrar", args: {} }] }, { content: "Dale, contame qué necesita y cuándo te sirve 👀" }],
    });
    assert.match(r.traza[0].resultado, /cuando/);
    assert.doesNotMatch(r.traza[0].resultado, /direccion/, "un servicio no pide dirección para cerrar");
    estado = r.estado;

    r = await turno({
      negocio: CANINO,
      medios: MEDIOS_CANINO,
      estado,
      mensaje: "el sábado en la mañana",
      guionado: [
        { tools: [{ name: "registrar_dato", args: { campo: "cuando", valor: "sábado en la mañana" } }, { name: "mostrar", args: { productoId: 21, seccion: "precio" } }] },
        { content: "Anotado. El valor es 👇" },
      ],
    });
    assert.equal(r.estado.datos.cuando, "sábado en la mañana");
    assert.equal((r.partes.find((p) => p.kind === "card") as any).seccion, "precio");
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 3. LA MEMORIA SOBREVIVE AL PROCESO
 *    El estado va a la base: si el contenedor se reinicia, el agente
 *    sigue sabiendo qué le dijo a este cliente.
 * ═══════════════════════════════════════════════════════════════════ */

describe("la memoria del agente", () => {
  test("se guarda y se vuelve a leer tal cual, incluido lo raro", async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: "Negocio de prueba",
        email: `motor-${Date.now()}@test.local`,
        slug: `motor-${Date.now()}`,
        brandName: "Negocio de prueba",
      } as any)
      .returning();

    const [convo] = await db
      .insert(conversations)
      .values({ tenantId: tenant.id, contactName: "Cliente", contactPhone: "573001112233", status: "ai" } as any)
      .returning();

    const repo = crearRepositorioDrizzle({ db, conversations, eq });

    const estado = estadoInicial(convo.id);
    estado.productoEnFoco = 11;
    estado.seccionesEnviadas[11] = { completa: new Date().toISOString(), precio: new Date().toISOString() };
    estado.datos.ciudad = "Cali";
    estado.ultimaOferta = { tipo: "datos_de_pago", productoId: 11, resumen: "los medios de pago", at: new Date().toISOString() };
    estado.objecionesVistas = ["está caro"];
    estado.turnos = 7;

    await repo.guardar(estado);
    const leido = await repo.cargar(convo.id);

    assert.equal(leido.productoEnFoco, 11);
    assert.ok(leido.seccionesEnviadas[11].precio, "se acuerda de que ya le dio el precio");
    assert.equal(leido.datos.ciudad, "Cali");
    assert.equal(leido.ultimaOferta?.tipo, "datos_de_pago");
    assert.equal(leido.objecionesVistas[0], "está caro");
    assert.equal(leido.turnos, 7);
  });

  test("un estado viejo al que le falta un campo no rompe el turno", async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: "Negocio viejo",
        email: `motor-viejo-${Date.now()}@test.local`,
        slug: `motor-viejo-${Date.now()}`,
        brandName: "Negocio viejo",
      } as any)
      .returning();

    const [convo] = await db
      .insert(conversations)
      .values({ tenantId: tenant.id, contactName: "Cliente", contactPhone: "573001112244", status: "ai" } as any)
      .returning();

    // Un estado guardado por una versión anterior del motor.
    await db
      .update(conversations)
      .set({ estadoAgente: JSON.stringify({ conversationId: convo.id, productoEnFoco: 12 }) as any })
      .where(eq(conversations.id, convo.id));

    const repo = crearRepositorioDrizzle({ db, conversations, eq });
    const leido = await repo.cargar(convo.id);

    assert.equal(leido.productoEnFoco, 12);
    assert.equal(leido.turnos, 0, "los campos nuevos arrancan en su valor inicial");
    assert.equal(Array.isArray(leido.objecionesVistas), true);
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 4. LO QUE SE GUARDA TIENE QUE EXISTIR
 * ═══════════════════════════════════════════════════════════════════ */

describe("lo que se guarda en la conversación", () => {
  test("el historial trae el FINAL de la charla, no el principio", async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: "Historia",
        email: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`,
        slug: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        brandName: "Historia",
      } as any)
      .returning();

    const [convo] = await db
      .insert(conversations)
      .values({ tenantId: tenant.id, contactName: "Cliente", contactPhone: `573007${Math.floor(Math.random() * 1e6)}`, status: "ai" } as any)
      .returning();

    // Doce turnos: pedir los últimos 5 tiene que devolver del 8 al 12.
    for (let i = 1; i <= 12; i++) {
      await db.insert(messages).values({ conversationId: convo.id, role: "customer", content: `mensaje ${i}` } as any);
    }

    const historial = await cargarHistorial(convo.id, 5);
    assert.equal(historial.length, 5);
    assert.equal(historial[0].content, "mensaje 8");
    assert.equal(historial[4].content, "mensaje 12", "el último es el más reciente");
  });

  test("las etapas que escribe el motor son las que el panel conoce", () => {
    // `Stage` en conversation-engine.ts. Si alguien inventa una etapa nueva,
    // los filtros del inbox dejan de encontrar esas conversaciones y nadie
    // se entera: el valor se guarda igual porque la columna es texto.
    const validas = ["greeting", "discovery", "presentation", "details", "objection_handling", "closing", "post_sale", "human_handoff"];
    for (const [etapa, stage] of Object.entries(ETAPA_A_STAGE)) {
      assert.ok(validas.includes(stage), `la etapa "${etapa}" escribe un stage que el panel no conoce: ${stage}`);
    }
  });
});
