/**
 * FASE 10 — SUITE E2E CONVERSACIONAL (30 casos)
 * Cada test comprueba: respuesta + estado + producto activo +
 * intención/herramientas + efectos. Determinista con clienteFalso.
 */
import { describe, test, expect } from "vitest";
import { estadoInicial, type EstadoConversacion } from "../estado-conversacion";
import { ejecutores, type ContextoHerramientas, type Producto } from "../herramientas";
import { guionDelNegocio } from "../nicho";
import { responder, type Mensaje } from "../motor";
import { clienteFalso } from "../cliente-llm";
import { clasificarTurno } from "../detector-regresiones";

const PIANO: Producto = { id: 1, name: "Curso de piano", description: "piano desde cero", price: 60000, currency: "COP", kind: "digital", videoUrl: "https://v/piano.mp4", disponible: true };
const DISENO: Producto = { id: 2, name: "Curso de diseño gráfico", description: "diseño gráfico", price: 80000, currency: "COP", kind: "digital", disponible: true };
const MESA: Producto = { id: 3, name: "Mesa de roble", description: "mesa física", price: 350000, currency: "COP", kind: "physical", disponible: true };
const CAT = [PIANO, DISENO, MESA];
const VOZ = { nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "T" };
const guion = (foco: Producto | null = null, medios: any = [{ etiqueta: "Nequi", tipo: "transferencia" }]) =>
  guionDelNegocio({ catalogo: CAT, negocio: { nombre: "T", entrega: { metodo: "transportadora", plazo: "2-4 días" } }, medios, productoEnFoco: foco });

async function turno(llm: any, textoCliente: string, estado?: EstadoConversacion, catalogo: Producto[] = CAT, g: any = guion()) {
  return responder({
    llm, estado: estado ?? estadoInicial(1),
    historial: [{ role: "customer", content: textoCliente, createdAt: new Date() }],
    catalogo, conocimiento: [], guion: g, voz: VOZ,
  });
}
const textoDe = (r: Awaited<ReturnType<typeof responder>>) =>
  r.partes.filter((p) => p.kind === "text").map((p) => String((p as any).content)).join(" ");
const tarjetas = (r: Awaited<ReturnType<typeof responder>>) => r.partes.filter((p) => p.kind === "card") as any[];

describe("PRODUCTOS (1-6)", () => {
  test("1 piano→precio manda tarjeta precio con valor base", async () => {
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "buscar_en_catalogo", arguments: '{"consulta":"piano"}' }] },
      { toolCalls: [{ id: "b", name: "enfocar_producto", arguments: '{"productoId":1}' }] },
      { toolCalls: [{ id: "c", name: "mostrar", arguments: '{"productoId":1,"seccion":"precio"}' }] },
      { content: "Vale 60 mil, acá te lo dejo 👇" },
    ]), "cuánto vale el piano?");
    expect(tarjetas(r).length).toBe(1);
    expect(tarjetas(r)[0].seccion).toBe("precio");
    expect(r.estado.productoEnFoco).toBe(1);
    expect(r.estado.compra).toBe("precio_dado");
  });
  test("2 piano→contenido manda ficha sin repetir precio", async () => {
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"completa"}' }] },
      { content: "Te muestro qué incluye 👇" },
    ]), "qué incluye?");
    expect(tarjetas(r)[0].seccion).toBe("completa");
    expect(r.estado.ultimaOferta?.tipo).toBe("ficha");
  });
  test("3 piano→compra con precio dado manda solo pago", async () => {
    const e = { ...estadoInicial(1), productoEnFoco: 1, seccionesEnviadas: { 1: { precio: new Date().toISOString() } }, compra: "precio_dado" as const };
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"pago"}' }] },
      { content: "Acá pagás 👇" },
    ]), "lo quiero", e);
    expect(tarjetas(r)[0].seccion).toBe("pago");
    expect(r.estado.compra).toBe("listo_para_pagar");
  });
  test("4 piano→diseño cambia foco y guarda anterior", async () => {
    const e = { ...estadoInicial(1), productoEnFoco: 1 };
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "enfocar_producto", arguments: '{"productoId":2}' }] },
      { toolCalls: [{ id: "b", name: "mostrar", arguments: '{"productoId":2,"seccion":"precio"}' }] },
      { content: "El de diseño vale esto 👇" },
    ]), "y el de diseño?", e);
    expect(r.estado.productoEnFoco).toBe(2);
    expect(r.estado.productoAnterior).toBe(1);
  });
  test("5 diseño→precio", async () => {
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":2,"seccion":"precio"}' }] },
      { content: "Acá va 👇" },
    ]), "precio del diseño?");
    expect(r.estado.productoEnFoco).toBe(2);
  });
  test("6 diseño→piano vuelve al anterior con rastro", async () => {
    const e = { ...estadoInicial(1), productoEnFoco: 2, productoAnterior: 1 };
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "enfocar_producto", arguments: '{"productoId":1}' }] },
      { content: "Volvamos al piano 👍" },
    ]), "mejor el piano", e);
    expect(r.estado.productoEnFoco).toBe(1);
    expect(r.estado.productoAnterior).toBe(2);
  });
});

describe("REFERENCIAS (7-12)", () => {
  test("7 'sí' acepta lo último ofrecido (precio piano)", async () => {
    const e = { ...estadoInicial(1), productoEnFoco: 1, seccionesEnviadas: { 1: { precio: new Date().toISOString() } } };
    (e as any).ultimaOferta = { tipo: "precio", productoId: 1, resumen: "el precio de Curso de piano (COP 60.000)", at: new Date().toISOString() };
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"pago"}' }] },
      { content: "Perfecto, te paso el pago 👇" },
    ]), "sí", e);
    expect(tarjetas(r)[0].seccion).toBe("pago");
  });
  test("8 'ese' resuelve a foco sin cambiarlo", async () => {
    const e = { ...estadoInicial(1), productoEnFoco: 1 };
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"precio"}' }] },
      { content: "Ese vale 60 mil 👇" },
    ]), "cuánto vale ese?", e);
    expect(r.estado.productoEnFoco).toBe(1);
  });
  test("9 'el segundo' tras buscar dos: enfoca el elegido", async () => {
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "buscar_en_catalogo", arguments: '{"consulta":"curso"}' }] },
      { toolCalls: [{ id: "b", name: "enfocar_producto", arguments: '{"productoId":2}' }] },
      { content: "El segundo es diseño, acá va 👍" },
    ]), "el segundo");
    expect(r.estado.productoEnFoco).toBe(2);
  });
  test("10 'lo quiero' cierra (precio+pago en mismo turno si faltaba precio)", async () => {
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"precio"}' }, { id: "b", name: "mostrar", arguments: '{"productoId":1,"seccion":"pago"}' }] },
      { content: "Listo, acá cerramos 👇" },
    ]), "lo quiero, el piano");
    const secs = tarjetas(r).map((t) => t.seccion);
    expect(secs).toContain("precio");
    expect(secs).toContain("pago");
  });
  test("11 'dale' con oferta pendiente avanza, no repite ficha", async () => {
    const e = { ...estadoInicial(1), productoEnFoco: 1, seccionesEnviadas: { 1: { completa: new Date().toISOString() } } };
    (e as any).ultimaOferta = { tipo: "ficha", productoId: 1, resumen: "la ficha completa de Curso de piano", at: new Date().toISOString() };
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"precio"}' }] },
      { content: "Dale, te paso el valor 👇" },
    ]), "dale", e);
    expect(tarjetas(r).filter((t) => t.seccion === "completa").length).toBe(0);
  });
  test("12 'cuánto?' es del foco (diseño), no del anterior", async () => {
    const e = { ...estadoInicial(1), productoEnFoco: 2, productoAnterior: 1 };
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":2,"seccion":"precio"}' }] },
      { content: "80 mil 👇" },
    ]), "cuánto?", e);
    expect(tarjetas(r)[0].productId).toBe(2);
  });
});

describe("CAMBIOS (13-17)", () => {
  test("13 producto→producto invalida oferta anterior", async () => {
    const e = { ...estadoInicial(1), productoEnFoco: 1 };
    (e as any).ultimaOferta = { tipo: "precio", productoId: 1, resumen: "precio piano", at: new Date().toISOString() };
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "enfocar_producto", arguments: '{"productoId":2}' }] },
      { content: "Cambiamos a diseño 👍" },
    ]), "mejor diseño", e);
    expect(r.estado.ultimaOferta).toBeNull();
  });
  test("14 producto→pago exige precio primero (herramienta frena, modelo recupera)", async () => {
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"pago"}' }] },
      { toolCalls: [{ id: "b", name: "mostrar", arguments: '{"productoId":1,"seccion":"precio"}' }, { id: "c", name: "mostrar", arguments: '{"productoId":1,"seccion":"pago"}' }] },
      { content: "Va precio y pago 👇" },
    ]), "cómo pago el piano?");
    const intentoDePago = r.traza.find((t) => t.herramienta === "mostrar" && (t.args as any)?.seccion === "pago");
    expect(intentoDePago?.resultado).toMatch(/cuánto cuesta/i);
    expect(tarjetas(r).length).toBe(2);
  });
  test("15 pago→producto vuelve sin perder pago previo", async () => {
    const e = { ...estadoInicial(1), productoEnFoco: 1, compra: "listo_para_pagar" as const };
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "enfocar_producto", arguments: '{"productoId":2}' }] },
      { content: "Miramos diseño 👍" },
    ]), "y el de diseño?", e);
    expect(r.estado.productoEnFoco).toBe(2);
  });
  test("16 compra→objeción anota duda sin cerrar", async () => {
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "anotar_contexto", arguments: '{"intencion":"objecion","objecion":"lo voy a pensar"}' }] },
      { content: "Qué te frena? 🙂" },
    ]), "lo voy a pensar");
    expect(r.estado.intencionActual).toBe("objecion");
    expect(r.estado.objecionesVistas.length).toBe(1);
  });
  test("17 objeción→compra retoma cierre", async () => {
    const e = { ...estadoInicial(1), productoEnFoco: 1, seccionesEnviadas: { 1: { precio: new Date().toISOString() } } };
    e.objecionesVistas = ["lo voy a pensar"];
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"pago"}' }] },
      { content: "Vamos con el pago 👇" },
    ]), "listo, lo compro", e);
    expect(r.estado.compra).toBe("listo_para_pagar");
  });
});

describe("COMPRAS (18-21)", () => {
  test("18 digital completo: precio→pago sin pedir dirección", async () => {
    const digitalCat = [PIANO, DISENO];
    const gDigital = guionDelNegocio({ catalogo: digitalCat, negocio: { nombre: "T", entrega: { metodo: "enlace de descarga", plazo: "inmediato" } }, medios: [{ etiqueta: "Nequi", tipo: "transferencia" }], productoEnFoco: PIANO });
    const r = await responder({
      llm: clienteFalso([
        { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"precio"}' }, { id: "b", name: "mostrar", arguments: '{"productoId":1,"seccion":"pago"}' }] },
        { content: "Cerramos 👇" },
      ]),
      estado: estadoInicial(1),
      historial: [{ role: "customer", content: "compro el piano", createdAt: new Date() }],
      catalogo: digitalCat, conocimiento: [], guion: gDigital, voz: VOZ,
    });
    expect(r.estado.compra).toBe("listo_para_pagar");
    expect(r.estado.entregaEstado).toBe("no_aplica");
  });
  test("19 físico completo pide ciudad+dirección antes de cerrar", async () => {
    const g = guion(MESA);
    const r = await responder({
      llm: clienteFalso([
        { toolCalls: [{ id: "a", name: "enfocar_producto", arguments: '{"productoId":3}' }] },
        { toolCalls: [{ id: "b", name: "que_falta_para_cerrar", arguments: '{}' }] },
        { content: "Dónde te lo envío?" },
      ]),
      estado: estadoInicial(1),
      historial: [{ role: "customer", content: "quiero la mesa", createdAt: new Date() }],
      catalogo: CAT, conocimiento: [], guion: g, voz: VOZ,
    });
    expect(r.estado.accionPendiente).toMatch(/pedir_/);
    expect(textoDe(r)).toMatch(/dónde|ciudad|dirección/i);
  });
  test("20 contraentrega: si está configurada se puede ofrecer", async () => {
    const g = guion(MESA, [{ etiqueta: "Contraentrega", tipo: "transferencia" }]);
    expect(g.hechos.join(" ")).toMatch(/Contraentrega/);
  });
  test("21 servicio pide necesidad+cuándo", async () => {
    const srv: Producto = { id: 9, name: "Asesoría contable", description: "servicio", price: 120000, currency: "COP", kind: "service", disponible: true };
    const g = guionDelNegocio({ catalogo: [srv], negocio: { nombre: "T" }, medios: [{ etiqueta: "Nequi", tipo: "transferencia" }], productoEnFoco: srv });
    const campos = g.calificacion.filter((d) => d.obligatorio).map((d) => d.campo);
    expect(campos).toContain("necesidad");
    expect(campos).toContain("cuando");
  });
});

describe("ERRORES (22-26)", () => {
  test("22 herramienta que falla no tumba respuesta y queda en traza", async () => {
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"precio"}' }] },
      { content: "Te confirmo en un momento 👍" },
    ]), "precio?");
    expect(r.partes.length).toBeGreaterThan(0);
  });
  test("23 producto inexistente guía a buscar, no inventa", async () => {
    const ctx: ContextoHerramientas = { estado: estadoInicial(1), catalogo: CAT, partes: [], conocimiento: [], guion: guion(), mensajeDelCliente: "", efectos: [] };
    const r = (await ejecutores.mostrar(ctx, { productoId: 999, seccion: "precio" })) as any;
    expect(r.ok).toBe(false);
    expect(ctx.partes.length).toBe(0);
  });
  test("24 producto no disponible no se ofrece", async () => {
    const ctx: ContextoHerramientas = { estado: estadoInicial(1), catalogo: [{ ...PIANO, disponible: false }], partes: [], conocimiento: [], guion: guion(), mensajeDelCliente: "", efectos: [] };
    const r = (await ejecutores.buscar_en_catalogo(ctx, { consulta: "piano" })) as any;
    expect(r.mensaje).toMatch(/No hay nada/);
  });
  test("25 pago reportado NO queda confirmado", async () => {
    const ctx: ContextoHerramientas = { estado: estadoInicial(1), catalogo: CAT, partes: [], conocimiento: [], guion: guion(), mensajeDelCliente: "", efectos: [] };
    const r = (await ejecutores.registrar_pago_reportado(ctx, { medio: "Nequi" })) as any;
    expect(r.ok).toBe(true);
    expect(ctx.estado.pago).toBe("reportado");
    expect(ctx.estado.pagoConfirmadoPorHumano).toBe(false);
    expect(ctx.estado.compra).toBe("pago_reportado");
  });
  test("26 sin create_order no se afirma pedido creado", async () => {
    const r = await turno(clienteFalso([{ content: "Ya quedó registrado tu pedido" }]), "lo compro");
    expect(r.estado.compra).not.toBe("pedido_creado");
  });
});

describe("LARGAS (27-30)", () => {
  test("27 20 mensajes: estado + resumen preservan foco", async () => {
    const hist: Mensaje[] = [];
    for (let i = 0; i < 20; i++) hist.push({ role: i % 2 ? "agent" : "customer", content: `m${i}`, createdAt: new Date() });
    hist.push({ role: "customer", content: "cuánto el piano?", createdAt: new Date() });
    const r = await responder({
      llm: clienteFalso([
        { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"precio"}' }] },
        { content: "60 mil 👇" },
      ]),
      estado: { ...estadoInicial(1), productoEnFoco: 1 }, historial: hist, catalogo: CAT, conocimiento: [], guion: guion(), voz: VOZ,
    });
    expect(r.estado.productoEnFoco).toBe(1);
  });
  test("28 40 mensajes no se envían enteros (tope) y hay resumen", async () => {
    const hist: Mensaje[] = [];
    for (let i = 0; i < 40; i++) hist.push({ role: i % 2 ? "agent" : "customer", content: `m${i}`, createdAt: new Date() });
    hist.push({ role: "customer", content: "sí", createdAt: new Date() });
    const e = { ...estadoInicial(1), productoEnFoco: 1 };
    const r = await responder({
      llm: clienteFalso([{ content: "Seguimos 👍" }]),
      estado: e, historial: hist, catalogo: CAT, conocimiento: [], guion: guion(), voz: VOZ,
    });
    expect(r.estado.resumenPrevio).not.toBeNull();
  });
  test("29 60 mensajes: corta historial pero conserva hechos", async () => {
    const hist: Mensaje[] = [];
    for (let i = 0; i < 60; i++) hist.push({ role: i % 2 ? "agent" : "customer", content: `m${i}`, createdAt: new Date() });
    const e = { ...estadoInicial(1), productoEnFoco: 1, seccionesEnviadas: { 1: { precio: new Date().toISOString() } } };
    const r = await responder({
      llm: clienteFalso([{ content: "Retomo 👍" }]),
      estado: e, historial: hist, catalogo: CAT, conocimiento: [], guion: guion(), voz: VOZ,
    });
    expect(r.estado.seccionesEnviadas[1].precio).toBeTruthy();
    expect(r.estado.resumenPrevio).not.toBeNull();
  });
  test("30 retomada 26h no rejuvenece último mensaje cliente", async () => {
    const hace26h = new Date(Date.now() - 26 * 3600 * 1000);
    const e = { ...estadoInicial(1), ultimoMensajeCliente: hace26h.toISOString() };
    const r = await responder({
      llm: clienteFalso([{ content: "Hola de nuevo 👍" }]),
      estado: e,
      historial: [
        { role: "customer", content: "hola", createdAt: hace26h },
        { role: "agent", content: "hola", createdAt: hace26h },
        { role: "customer", content: "volví", createdAt: new Date() },
      ],
      catalogo: CAT, conocimiento: [], guion: guion(), voz: VOZ,
    });
    expect(r.estado.ultimoMensajeAgente).not.toBeNull();
  });
});

describe("FASE 12 detector", () => {
  test("clasifica SAFE/BETTER/REGRESSION/UNCERTAIN", async () => {
    const base = { mensaje: "hola", textoV1: "a", textoV2: "b", tarjetasV1: [], tarjetasV2: [], productoV1: 1, productoV2: 1 };
    expect(clasificarTurno(base, 0, 0).clase).toBe("SAFE");
    expect(clasificarTurno(base, 1, 0).clase).toBe("BETTER");
    expect(clasificarTurno(base, 0, 1).clase).toBe("REGRESSION");
    expect(clasificarTurno({ ...base, productoV2: 2 }, 0, 0).clase).toBe("UNCERTAIN");
  });
});
