/**
 * LA VENTA FÍSICA SE CULMINA: DATOS → RESUMEN → "SÍ" → PEDIDO
 *
 * Simulación con la IA real del 23-09-2026: el cliente dio todos sus datos,
 * dijo "confirmo el pedido" y el agente contestó "Quedó anotado tu pedido"
 * con CERO herramientas. El motor v2 no tenía cómo crear un pedido: desde
 * que es el vendedor por defecto (22-09), ninguna venta física de WhatsApp
 * llegó a Dropi.
 */
import { describe, test, expect } from "vitest";
import { estadoInicial } from "../estado-conversacion";
import { ejecutores, type ContextoHerramientas, type Producto, type ServicioDePedidos, type DatosDelPedido } from "../herramientas";
import { guionDelNegocio } from "../nicho";
import { responder } from "../motor";
import { clienteFalso } from "../cliente-llm";

const CORRECTOR: Producto = { id: 7, name: "Corrector de postura", description: "", price: 45000, currency: "COP", kind: "physical", disponible: true };
const CURSO: Producto = { id: 8, name: "Curso de piano", description: "", price: 60000, currency: "COP", kind: "digital", disponible: true };
const CAT = [CORRECTOR, CURSO];
const guion = () => guionDelNegocio({ catalogo: CAT, negocio: { nombre: "T" }, medios: [] });

/** Un servicio falso que se comporta como dropshipping.ts: exige 5 datos (la cédula ya no, 24-09-2026). */
function servicioFalso() {
  const guardado: DatosDelPedido = {};
  const llamadas = { tomar: 0, confirmar: 0 };
  const s: ServicioDePedidos = {
    async tomar({ datos }) {
      llamadas.tomar++;
      Object.assign(guardado, datos);
      const requeridos = ["nombre", "telefono", "direccion", "ciudad", "departamento"] as const;
      const faltan = requeridos.filter((k) => !guardado[k]);
      if (faltan.length) return { estado: "faltan", faltan: [...faltan], yaTiene: requeridos.filter((k) => guardado[k]) };
      return { estado: "listo", resumen: `📦 Corrector de postura × 1\n👤 ${guardado.nombre}\n🏠 ${guardado.direccion}` };
    },
    async confirmar() {
      llamadas.confirmar++;
      return { estado: "creado", numero: "90133857", confirmacion: "Llega en 3 a 5 días." };
    },
  };
  return { s, llamadas, guardado };
}

function ctxCon(pedidos?: ServicioDePedidos, precioYaDado = true): ContextoHerramientas {
  const e = estadoInicial(1);
  e.productoEnFoco = 7;
  if (precioYaDado) e.seccionesEnviadas = { 7: { precio: new Date().toISOString() } };
  // El cliente ya dijo que compra (ver "interesarse no es comprar" abajo).
  e.compraConfirmada = 7;
  return { estado: e, catalogo: CAT, partes: [], conocimiento: [], guion: guion(), mensajeDelCliente: "", efectos: [], pedidos };
}

describe("tomar_pedido", () => {
  test("sin servicio de pedidos (SQLite / negocio sin Dropi) NO finge que registró algo", async () => {
    const r = await ejecutores.tomar_pedido(ctxCon(undefined), { nombre: "Ana" });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/No digas que el pedido quedó registrado/);
  });

  test("antes del precio, no se piden datos", async () => {
    const { s } = servicioFalso();
    const r = await ejecutores.tomar_pedido(ctxCon(s, false), { nombre: "Ana" });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/precio/);
  });

  test("un producto digital no lleva pedido de envío", async () => {
    const { s } = servicioFalso();
    const r = await ejecutores.tomar_pedido(ctxCon(s), { productoId: 8 });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/no es un producto físico/);
  });

  test("con datos a medias dice qué falta, y no manda resumen", async () => {
    const { s } = servicioFalso();
    const ctx = ctxCon(s);
    const r = await ejecutores.tomar_pedido(ctx, { nombre: "Ana Pérez", ciudad: "Bogotá" });
    expect(r.mensaje).toMatch(/telefono, direccion, departamento/);
    expect(r.mensaje).not.toMatch(/documento/);
    expect(r.mensaje).toMatch(/Ya tenés: nombre, ciudad/);
    // La lista la pega el SISTEMA, toda junta y sin cédula (dueño, 24-09-2026).
    expect(ctx.partes).toHaveLength(1);
    expect((ctx.partes[0] as any).content).toMatch(/Para enviarte tu pedido necesito/);
    expect((ctx.partes[0] as any).content).not.toMatch(/[Cc]édula|documento/);
    expect(ctx.estado.pedidoPorConfirmarEnTurno).toBeNull();
  });

  test("con todos los datos, el SISTEMA manda el resumen y queda esperando el sí", async () => {
    const { s } = servicioFalso();
    const ctx = ctxCon(s);
    await ejecutores.tomar_pedido(ctx, { nombre: "Ana Pérez", documento: "1020304050", telefono: "3001234567", direccion: "Calle 45 # 12-30", ciudad: "Bogotá", departamento: "Bogotá D.C." });
    expect(ctx.partes[0]).toMatchObject({ kind: "text" });
    expect((ctx.partes[0] as any).content).toMatch(/Ana Pérez[\s\S]*¿Confirmas el pedido/);
    expect(ctx.estado.pedidoPorConfirmarEnTurno).toBe(ctx.estado.turnos);
  });
});

describe("confirmar_pedido", () => {
  test("sin resumen mostrado, no despacha nada", async () => {
    const { s, llamadas } = servicioFalso();
    const r = await ejecutores.confirmar_pedido(ctxCon(s), {});
    expect(r.ok).toBe(false);
    expect(llamadas.confirmar).toBe(0);
  });

  test("en el MISMO turno del resumen, no despacha: el cliente todavía no lo leyó", async () => {
    const { s, llamadas } = servicioFalso();
    const ctx = ctxCon(s);
    ctx.estado.pedidoPorConfirmarEnTurno = ctx.estado.turnos;
    const r = await ejecutores.confirmar_pedido(ctx, {});
    expect(r.ok).toBe(false);
    expect(llamadas.confirmar).toBe(0);
  });

  test("con el resumen de un turno anterior, crea el pedido y lo dice con su número", async () => {
    const { s, llamadas } = servicioFalso();
    const ctx = ctxCon(s);
    ctx.estado.turnos = 5;
    ctx.estado.pedidoPorConfirmarEnTurno = 4;
    const r = await ejecutores.confirmar_pedido(ctx, {});
    expect(r.ok).toBe(true);
    expect(r.mensaje).toMatch(/PEDIDO REGISTRADO \(#90133857\)/);
    expect(llamadas.confirmar).toBe(1);
    expect(ctx.estado.compra).toBe("pedido_creado");
  });

  test("si Dropi no puede despachar, no se le promete nada al cliente", async () => {
    const ctx = ctxCon({
      tomar: async () => ({ estado: "error", motivo: "x" }),
      confirmar: async () => ({ estado: "no_disponible", mensajeAlCliente: "Justo ese se agotó con el proveedor." }),
    });
    ctx.estado.turnos = 3;
    ctx.estado.pedidoPorConfirmarEnTurno = 2;
    const r = await ejecutores.confirmar_pedido(ctx, {});
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/NO SE TOMÓ EL PEDIDO/);
    expect(ctx.estado.compra).not.toBe("pedido_creado");
  });
});

describe("de punta a punta con el motor", () => {
  test("datos → resumen (turno 1) → 'sí, confirmo' (turno 2) → pedido creado", async () => {
    const { s, llamadas } = servicioFalso();
    const VOZ = { nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "T" };
    const e = estadoInicial(1);
    e.productoEnFoco = 7;
    e.seccionesEnviadas = { 7: { precio: new Date().toISOString() } };
    e.compraConfirmada = 7;

    const t1 = await responder({
      llm: clienteFalso([
        { toolCalls: [{ id: "a", name: "tomar_pedido", arguments: JSON.stringify({ nombre: "Ana Pérez", documento: "1020304050", telefono: "3001234567", direccion: "Calle 45 # 12-30", ciudad: "Bogotá", departamento: "Bogotá D.C." }) }] },
        { content: "Te dejo el resumen para que lo revises:" },
      ]),
      estado: e, historial: [{ role: "customer", content: "Ana Pérez, 1020304050, calle 45 # 12-30 Bogotá, 3001234567", createdAt: new Date() }],
      catalogo: CAT, conocimiento: [], guion: guion(), voz: VOZ, pedidos: s,
    });
    expect(t1.partes.map((p: any) => p.content).join("\n")).toMatch(/¿Confirmas el pedido/);
    expect(llamadas.confirmar).toBe(0);

    const t2 = await responder({
      llm: clienteFalso([
        { toolCalls: [{ id: "b", name: "confirmar_pedido", arguments: "{}" }] },
        { content: "¡Listo, Ana! Tu pedido #90133857 quedó registrado. Te llega en 3 a 5 días." },
      ]),
      estado: t1.estado, historial: [{ role: "customer", content: "sí, confirmo", createdAt: new Date() }],
      catalogo: CAT, conocimiento: [], guion: guion(), voz: VOZ, pedidos: s,
    });
    expect(llamadas.confirmar).toBe(1);
    expect(t2.estado.compra).toBe("pedido_creado");
  });
});

describe("interesarse no es comprar (pedido del dueño, 25-09-2026)", () => {
  const sinConfirmar = (mensaje: string) => {
    const ctx = ctxCon(servicioFalso().s);
    ctx.estado.compraConfirmada = null;
    ctx.mensajeDelCliente = mensaje;
    return ctx;
  };

  test('"Me interesa este" no abre el pedido: pide preguntar si lo quiere', async () => {
    const ctx = sinConfirmar("Me interesa este");
    const r = await ejecutores.tomar_pedido(ctx, {});
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/NO dijo que compra/);
    expect(ctx.estado.preguntoSiCompra?.productoId).toBe(7);
  });

  test('"sí" a "¿Te lo enviamos?" del turno anterior sí abre el pedido', async () => {
    const ctx = sinConfirmar("sí");
    ctx.estado.ultimaPreguntaAgente = "Va en $45.000 con envío contraentrega. ¿Te lo enviamos?";
    const r = await ejecutores.tomar_pedido(ctx, {});
    expect(ctx.estado.compraConfirmada).toBe(7);
    expect(r.mensaje).not.toMatch(/NO dijo que compra/);
  });

  test('"lo quiero" explícito abre el pedido sin preguntar otra vez', async () => {
    const ctx = sinConfirmar("dale, lo quiero");
    await ejecutores.tomar_pedido(ctx, {});
    expect(ctx.estado.compraConfirmada).toBe(7);
  });

  test("una duda después de la pregunta no es un sí", async () => {
    const ctx = sinConfirmar("¿y cuánto demora en llegar?");
    ctx.estado.ultimaPreguntaAgente = "¿Te lo enviamos?";
    const r = await ejecutores.tomar_pedido(ctx, {});
    expect(r.ok).toBe(false);
  });
});

describe("simulación 25-09-2026: cierre del pedido", () => {
  test("un 3xxxxxxxxx mandado como documento es el celular, y la cédula no se guarda", async () => {
    const { s } = servicioFalso();
    let recibido: any = null;
    const espia = { ...s, async tomar(p: any) { recibido = p.datos; return s.tomar(p); } };
    const ctx = ctxCon(espia as any);
    ctx.mensajeDelCliente = "Juan Pérez, 3001234567, Calle 10 # 20-30, Cali";
    await ejecutores.tomar_pedido(ctx, { nombre: "Juan Pérez", documento: "3001234567", direccion: "Calle 10 # 20-30", ciudad: "Cali" });
    expect(recibido.telefono).toBe("3001234567");
    expect(recibido.documento).toBeUndefined();
  });

  test("compra confirmada y el modelo pide 'nombre completo y cédula': sale la lista del sistema, sin cédula", async () => {
    const { s } = servicioFalso();
    const e = estadoInicial(1);
    e.productoEnFoco = 7;
    e.seccionesEnviadas = { 7: { precio: new Date().toISOString() } };
    e.compraConfirmada = 7;
    const r = await responder({
      llm: clienteFalso([{ content: "Para coordinar el envío, por favor dime tu nombre completo y tu número de cédula. 😊" }]),
      estado: e, historial: [{ role: "customer", content: "sí, lo quiero", createdAt: new Date() }],
      catalogo: CAT, conocimiento: [], guion: guion(), voz: { nombreAgente: "S", rolAgente: "a", nombreNegocio: "T" }, pedidos: s,
    });
    const texto = r.partes.filter((p: any) => p.kind === "text").map((p: any) => p.content).join("\n");
    expect(texto).not.toMatch(/c[eé]dula/i);
  });
});

describe("tercera ronda de simulación (25-09-2026)", () => {
  const VOZ = { nombreAgente: "S", rolAgente: "a", nombreNegocio: "T" };
  test('"Precio?" después de la ficha: el texto dice el precio', async () => {
    const e = estadoInicial(1); e.productoEnFoco = 7; e.seccionesEnviadas = { 7: { precio: new Date().toISOString() } };
    const r = await responder({ llm: clienteFalso([{ content: "¿Te gustaría pedirlo?" }]), estado: e, historial: [{ role: "customer", content: "Precio?", createdAt: new Date() }], catalogo: CAT, conocimiento: [], guion: guion(), voz: VOZ });
    expect(r.partes.map((p: any) => p.content || "").join(" ")).toMatch(/\$45\.000/);
  });
  test('"Quiero uno" y el modelo solo dice "¡Genial!": sale la lista de datos de envío', async () => {
    const { s } = servicioFalso();
    const e = estadoInicial(1); e.productoEnFoco = 7; e.seccionesEnviadas = { 7: { precio: new Date().toISOString() } };
    const r = await responder({ llm: clienteFalso([{ content: "¡Genial!" }]), estado: e, historial: [{ role: "customer", content: "Quiero uno", createdAt: new Date() }], catalogo: CAT, conocimiento: [], guion: guion(), voz: VOZ, pedidos: s });
    expect(r.partes.map((p: any) => p.content || "").join("\n")).toMatch(/Para enviarte tu pedido necesito/);
  });
  test("el resumen pregunta de tú", async () => {
    const { s } = servicioFalso();
    const ctx = ctxCon(s);
    await ejecutores.tomar_pedido(ctx, { nombre: "Ana Pérez", telefono: "3001234567", direccion: "Calle 1 # 2-3", ciudad: "Bogotá", departamento: "Bogotá D.C." });
    expect((ctx.partes.at(-1) as any).content).toMatch(/¿Confirmas el pedido/);
  });
});
