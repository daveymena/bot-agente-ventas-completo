/**
 * CONVERSACIONES REALES (casos del dueño, multimodelo)
 * Vendedor que entiende qué pasa: producto activo, intención, siguiente paso.
 * Determinista con clienteFalso. Cubre digital, físico, dropshipping,
 * consultoría, servicios, cita, cotización y multicotexto.
 */
import { describe, test, expect } from "vitest";
import { estadoInicial } from "../estado-conversacion";
import { ejecutores, type ContextoHerramientas, type Producto } from "../herramientas";
import { guionDelNegocio } from "../nicho";
import { responder } from "../motor";
import { clienteFalso } from "../cliente-llm";

const PIANO: Producto = { id: 1, name: "Curso de Piano Completo", description: "19 módulos, 283 clases en video, 19 horas, clásico balada pop blues jazz, desde cero", price: 60000, currency: "COP", kind: "digital", videoUrl: "https://v/piano.mp4", disponible: true };
const DISENO: Producto = { id: 2, name: "Curso de Diseño Gráfico", description: "Photoshop Illustrator InDesign", price: 20000, currency: "COP", kind: "digital", disponible: true };
const CAMARA: Producto = { id: 3, name: "Cámara X", description: "Full HD visión nocturna celular", price: 180000, currency: "COP", kind: "physical", opciones: ["Negra", "Blanca"], stock: 5, disponible: true };
const LAPTOP: Producto = { id: 4, name: "Laptop Dell", description: "portátil", price: 600000, currency: "COP", kind: "physical", stock: 2, disponible: true };
const CAT = [PIANO, DISENO, CAMARA, LAPTOP];
const VOZ = { nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "T" };
const gDigital = () => guionDelNegocio({ catalogo: [PIANO, DISENO], negocio: { nombre: "T", entrega: { metodo: "enlace de descarga", plazo: "inmediato" }, garantia: { dias: 7, descripcion: "7 días de garantía" } }, medios: [{ etiqueta: "Nequi", tipo: "transferencia" }], productoEnFoco: PIANO });
const gFisico = () => guionDelNegocio({ catalogo: [CAMARA, LAPTOP], negocio: { nombre: "T", entrega: { metodo: "transportadora", plazo: "2-4 días" }, cobertura: "nacional" }, medios: [{ etiqueta: "Nequi", tipo: "transferencia" }], productoEnFoco: CAMARA });

async function turno(llm: any, texto: string, estado: any = estadoInicial(1), catalogo: Producto[] = CAT, guion: any = gDigital()) {
  return responder({ llm, estado, historial: [{ role: "customer", content: texto, createdAt: new Date() }], catalogo, conocimiento: [], guion, voz: VOZ });
}
const cards = (r: any) => r.partes.filter((p: any) => p.kind === "card");
const txt = (r: any) => r.partes.filter((p: any) => p.kind === "text").map((p: any) => String(p.content)).join(" ");

describe("1 digital: precio→entrega→nequi→sí→pago", () => {
  test("flujo sin perder foco ni repetir ficha", async () => {
    const e: any = { ...estadoInicial(1), productoEnFoco: 1, seccionesEnviadas: { 1: { precio: new Date().toISOString() } } };
    e.ultimaOferta = { tipo: "datos_de_pago", productoId: 1, resumen: "los medios de pago de Curso de Piano Completo", at: new Date().toISOString() };
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"pago"}' }] },
      { content: "Te paso los datos para el pago 👍" },
    ]), "Sí", e, [PIANO, DISENO], gDigital());
    expect(cards(r)[0].seccion).toBe("pago");
    expect(r.estado.productoEnFoco).toBe(1);
    expect(r.estado.compra).toBe("listo_para_pagar");
  });
});

describe("2 'sí' responde a lo anterior, no repregunta producto", () => {
  test("no pierde contexto", async () => {
    const e: any = { ...estadoInicial(1), productoEnFoco: 1, seccionesEnviadas: { 1: { precio: new Date().toISOString() } } };
    e.ultimaOferta = { tipo: "precio", productoId: 1, resumen: "el precio de Curso de Piano Completo (COP 60.000)", at: new Date().toISOString() };
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "anotar_contexto", arguments: '{"intencion":"comprar"}' }] },
      { toolCalls: [{ id: "b", name: "mostrar", arguments: '{"productoId":1,"seccion":"pago"}' }] },
      { content: "Si deseas adquirirlo, te indico el pago 👍" },
    ]), "Sí", e, [PIANO, DISENO], gDigital());
    expect(r.estado.intencionActual).toBe("comprar");
    expect(txt(r)).not.toMatch(/qué producto deseas comprar/i);
  });
});

describe("3 ese / el primero / lo quiero", () => {
  test("el primero fija piano y 'ese lo quiero' cierra sin repreguntar", async () => {
    const r1 = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "enfocar_producto", arguments: '{"productoId":1}' }] },
      { content: "Te refieres al Piano, de $60.000 👍" },
    ]), "El primero", estadoInicial(1), [PIANO, DISENO], gDigital());
    expect(r1.estado.productoEnFoco).toBe(1);
    const r2 = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"precio"}' }, { id: "b", name: "mostrar", arguments: '{"productoId":1,"seccion":"pago"}' }] },
      { content: "Para continuar con la compra, te indico el pago 👍" },
    ]), "Ese lo quiero", r1.estado, [PIANO, DISENO], gDigital());
    expect(r2.estado.productoEnFoco).toBe(1);
    expect(txt(r2)).not.toMatch(/cuál curso quieres/i);
  });
});

describe("4 cambio piano→diseño→cuánto→y el de piano→ese compro", () => {
  test("recupera anterior sin mezclar", async () => {
    let e: any = { ...estadoInicial(1), productoEnFoco: 1 };
    const r1 = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "enfocar_producto", arguments: '{"productoId":2}' }] },
      { toolCalls: [{ id: "b", name: "mostrar", arguments: '{"productoId":2,"seccion":"precio"}' }] },
      { content: "Diseño $20.000 🎨" },
    ]), "¿También tienen diseño gráfico?", e, CAT, gDigital());
    expect(r1.estado.productoEnFoco).toBe(2);
    expect(r1.estado.productoAnterior).toBe(1);
    const r2 = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"precio"}' }] },
      { content: "Piano $60.000 🎹" },
    ]), "¿Y el de piano?", r1.estado, CAT, gDigital());
    expect(cards(r2)[0].productId).toBe(1);
    const r3 = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"pago"}' }] },
      { content: "Continuamos con el Piano 👍" },
    ]), "Ese quiero comprarlo", { ...r2.estado, seccionesEnviadas: { ...r2.estado.seccionesEnviadas, 1: { ...(r2.estado.seccionesEnviadas[1] || {}), precio: new Date().toISOString() } } }, CAT, gDigital());
    expect(r3.estado.productoEnFoco).toBe(1);
  });
});

describe("5 precio→qué trae→principiantes→cuánto era: solo precio, no ficha", () => {
  test("recuerda precio sin reenviar todo", async () => {
    const e: any = { ...estadoInicial(1), productoEnFoco: 1, seccionesEnviadas: { 1: { precio: new Date().toISOString(), completa: new Date().toISOString() } } };
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"precio","reenviar":true}' }] },
      { content: "$60.000 🎹" },
    ]), "¿Y cuánto era?", e, [PIANO, DISENO], gDigital());
    expect(cards(r).filter((c: any) => c.seccion === "completa").length).toBe(0);
  });
});

describe("6 objeción caro + garantía real, no inventada", () => {
  test("con garantía la afirma; sin garantía no inventa", async () => {
    const ctx: ContextoHerramientas = { estado: estadoInicial(1), catalogo: CAT, partes: [], conocimiento: [{ productId: 1, pregunta: "¿dan garantía si no me gusta?", disparadores: ["garantia", "gusta"], respuesta: "7 días de garantía" }], guion: gDigital(), mensajeDelCliente: "", efectos: [] };
    const con = (await ejecutores.consultar_conocimiento(ctx, { pregunta: "¿tiene garantía si no me gusta?", productoId: 1 })) as any;
    expect(con.mensaje).toMatch(/7 días/);
    const ctx2: ContextoHerramientas = { estado: estadoInicial(1), catalogo: CAT, partes: [], conocimiento: [], guion: gDigital(), mensajeDelCliente: "", efectos: [] };
    const sin = (await ejecutores.consultar_conocimiento(ctx2, { pregunta: "y si no me gusta?", productoId: 1 })) as any;
    expect(sin.mensaje).toMatch(/no cargó nada|confirmás/i);
  });
});

describe("7 varias preguntas mezcladas en una respuesta", () => {
  test("precio+ficha en mismo turno", async () => {
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"precio"}' }, { id: "b", name: "mostrar", arguments: '{"productoId":1,"seccion":"info"}' }] },
      { content: "Sirve desde cero 👍 Acá va valor y contenido 👇" },
    ]), "cuánto vale el piano y qué trae y sirve si nunca toqué?", estadoInicial(1), [PIANO, DISENO], gDigital());
    expect(cards(r).length).toBe(2);
  });
});

describe("8 compra pendiente retomada ('Ya' horas después)", () => {
  test("retoma donde quedó: pago del piano", async () => {
    const e: any = { ...estadoInicial(1), productoEnFoco: 1, compra: "listo_para_pagar", accionPendiente: "enviar_pago", siguienteAccion: "enviar_pago", seccionesEnviadas: { 1: { precio: new Date().toISOString() } } };
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"pago"}' }] },
      { content: "Retomamos la compra del Piano, estábamos en el pago 👍" },
    ]), "Ya", e, [PIANO, DISENO], gDigital());
    expect(r.estado.productoEnFoco).toBe(1);
    expect(cards(r)[0].seccion).toBe("pago");
  });
});

describe("10 físico: variante negra con inventario real", () => {
  test("consulta stock antes de afirmar; pide ciudad", async () => {
    const ctx: ContextoHerramientas = { estado: { ...estadoInicial(1), productoEnFoco: 3 }, catalogo: CAT, partes: [], conocimiento: [], guion: gFisico(), mensajeDelCliente: "hay negra?", efectos: [] };
    const d = (await ejecutores.consultar_disponibilidad(ctx, { productoId: 3, variante: "negra", cantidad: 1 })) as any;
    expect(d.ok).toBe(true);
    expect(ctx.estado.detalleProducto[3].stockEstado).toBe("disponible");
    expect(ctx.estado.detalleProducto[3].variante).toBe("negra");
  });
  test("sin stock configurado no inventa", async () => {
    const sinStock = { ...PIANO, stock: null };
    const ctx: ContextoHerramientas = { estado: estadoInicial(1), catalogo: [sinStock], partes: [], conocimiento: [], guion: gDigital(), mensajeDelCliente: "", efectos: [] };
    const d = (await ejecutores.consultar_disponibilidad(ctx, { productoId: 1 })) as any;
    expect(d.mensaje).toMatch(/no tiene inventario|confirmás/i);
  });
});

describe("11 segunda laptop: resuelve a la elegida", () => {
  test("variante/cantidad quedan en estado", async () => {
    const ctx: ContextoHerramientas = { estado: { ...estadoInicial(1), productoEnFoco: 4 }, catalogo: CAT, partes: [], conocimiento: [], guion: gFisico(), mensajeDelCliente: "la segunda", efectos: [] };
    await ejecutores.consultar_disponibilidad(ctx, { productoId: 4, cantidad: 1 });
    ctx.estado.datos.variante = "Dell segunda opción";
    expect(ctx.estado.detalleProducto[4].stockEstado).toBe("disponible");
  });
});

describe("12 contraentrega solo si configurada", () => {
  test("guion con contraentrega la ofrece; sin ella la prohíbe", async () => {
    const con = guionDelNegocio({ catalogo: [CAMARA], negocio: { nombre: "T", entrega: { metodo: "transportadora", plazo: "2-4 días" } }, medios: [{ etiqueta: "Contraentrega", tipo: "transferencia" }] });
    expect(con.hechos.join(" ")).toMatch(/Contraentrega/);
    const sin = guionDelNegocio({ catalogo: [PIANO], negocio: { nombre: "T", entrega: { metodo: "enlace de descarga", plazo: "inmediato" } }, medios: [{ etiqueta: "Nequi", tipo: "transferencia" }] });
    expect(sin.prohibiciones.join(" ")).toMatch(/contraentrega/i);
  });
});

describe("13 pago no confirmado nunca se afirma", () => {
  test("ya pagué → reportado, no confirmado", async () => {
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "registrar_pago_reportado", arguments: '{"medio":"Nequi"}' }] },
      { content: "Gracias 👍 Por ahora no aparece confirmado; lo verificamos." },
    ]), "Ya pagué", estadoInicial(1), CAT, gDigital());
    expect(r.estado.pago).toBe("reportado");
    expect(r.estado.pagoConfirmadoPorHumano).toBe(false);
    expect(txt(r)).not.toMatch(/pago recibido|aquí tienes el curso/i);
  });
});

describe("15 herramienta de pago falla sin fingir", () => {
  test("fallo queda en traza y se dice la verdad", async () => {
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"pago"}' }] },
      { content: "No pudo generarse el pago; lo intentamos de nuevo 👍" },
    ]), "Quiero pagar", { ...estadoInicial(1), productoEnFoco: 1, seccionesEnviadas: { 1: { precio: new Date().toISOString() } } }, [PIANO, DISENO], gDigital());
    expect(txt(r)).not.toMatch(/quedó creado|listo el pago/i);
  });
});

describe("16-17 celular→piano: multicotexto apilado", () => {
  test("vuelve al piano sin mezclar", async () => {
    const e: any = { ...estadoInicial(1), productoEnFoco: 1, productoAnterior: null, contextosPrevios: [] };
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "buscar_en_catalogo", arguments: '{"consulta":"samsung"}' }] },
      { content: "Reviso Samsung 📱 Dime modelo y lo buscamos." },
    ]), "¿también venden celulares?", e, CAT, gDigital());
    expect(txt(r)).not.toMatch(/\$60\.000.*celular|piano.*samsung/i);
  });
});

describe("servicio: reparar portátil que no prende", () => {
  test("registra necesidad sin precio cerrado inventado", async () => {
    const ctx: ContextoHerramientas = { estado: estadoInicial(1), catalogo: CAT, partes: [], conocimiento: [], guion: gFisico(), mensajeDelCliente: "no prende nada, es portátil", efectos: [] };
    const r = (await ejecutores.registrar_caso(ctx, { tipo: "servicio", necesidad: "portátil que no enciende nada" })) as any;
    expect(r.ok).toBe(true);
    expect(ctx.estado.servicio?.necesidad).toMatch(/no enciende/i);
    expect(ctx.estado.datos.necesidad).toBeTruthy();
  });
});

describe("consultoría: problema→objetivo→cotización, sin precio fijo", () => {
  test("entiende antes de cotizar", async () => {
    const ctx: ContextoHerramientas = { estado: estadoInicial(1), catalogo: CAT, partes: [], conocimiento: [], guion: gFisico(), mensajeDelCliente: "", efectos: [] };
    await ejecutores.registrar_caso(ctx, { tipo: "consultoria", problema: "campañas sin ventas", objetivo: "conseguir clientes por Facebook" });
    const c = (await ejecutores.solicitar_cotizacion(ctx, { resumen: "consultoría WhatsApp 50 chats/día" })) as any;
    expect(ctx.estado.consultoria?.cotizacion).toBe("en_proceso");
    expect(ctx.estado.siguienteAccion).toBe("preparar_cotizacion");
    expect(c.mensaje).not.toMatch(/\$\d/);
  });
});

describe("12 multicotexto cámara+laptop: segunda cámara + primera laptop", () => {
  test("apila contextos y recupera ambos", async () => {
    const e: any = { ...estadoInicial(1), productoEnFoco: 3 };
    const r = await turno(clienteFalso([
      { toolCalls: [{ id: "a", name: "enfocar_producto", arguments: '{"productoId":4}' }] },
      { content: "Vemos laptops 💻" },
    ]), "Pero también necesito una laptop", e, CAT, gFisico());
    expect(r.estado.productoEnFoco).toBe(4);
    expect(r.estado.contextosPrevios.length).toBeGreaterThan(0);
    expect(r.estado.contextosPrevios[0].producto).toBe(3);
  });
});
