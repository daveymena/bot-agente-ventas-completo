/**
 * FASE 1 — Estado conversacional raíz.
 *
 * Sin regex nuevas, sin keywords, sin supervisores, sin prompts extra.
 * Solo hechos registrados: foco anterior, oferta invalidada, guion
 * recargado y timestamp real del cliente.
 */
import { describe, test, expect } from "vitest";
import { estadoInicial, normalizarEstado, describirEstado } from "../estado-conversacion";
import { ejecutores, type ContextoHerramientas, type Producto } from "../herramientas";
import { guionDelNegocio } from "../nicho";
import { responder, type Mensaje } from "../motor";
import { clienteFalso } from "../cliente-llm";

const CATALOGO: Producto[] = [
  { id: 10, name: "Curso de piano", description: "piano", price: 60000, currency: "COP", kind: "digital", disponible: true },
  { id: 20, name: "Curso de diseño gráfico", description: "diseño", price: 80000, currency: "COP", kind: "digital", disponible: true },
];

const guionPara = (foco: number | null) =>
  guionDelNegocio({
    catalogo: CATALOGO,
    negocio: { nombre: "T", entrega: { metodo: "enlace", plazo: "inmediato" } },
    medios: [{ etiqueta: "Nequi", tipo: "transferencia" }],
    productoEnFoco: CATALOGO.find((p) => p.id === foco) ?? null,
  });

function ctxNuevo(estado?: any): ContextoHerramientas {
  return {
    estado: { ...estadoInicial(1), ...estado },
    catalogo: CATALOGO,
    partes: [],
    conocimiento: [],
    guion: guionPara((estado as any)?.productoEnFoco ?? null),
    mensajeDelCliente: "",
    efectos: [],
  };
}

describe("fase 1: cambio de producto a nivel de estado", () => {
  test("enfocar otro producto guarda el anterior", async () => {
    const ctx = ctxNuevo({ productoEnFoco: 10 });
    const r = (await ejecutores.enfocar_producto(ctx, { productoId: 20 })) as any;
    expect(r.ok).toBe(true);
    expect(ctx.estado.productoEnFoco).toBe(20);
    expect(ctx.estado.productoAnterior).toBe(10);
  });

  test("cambiar de foco invalida la oferta del producto anterior", async () => {
    const ctx = ctxNuevo({
      productoEnFoco: 10,
      ultimaOferta: { tipo: "precio", productoId: 10, resumen: "el precio del piano", at: new Date().toISOString() },
    });
    await ejecutores.enfocar_producto(ctx, { productoId: 20 });
    expect(ctx.estado.ultimaOferta).toBeNull();
  });

  test("volver al anterior restaura el foco y deja rastro", async () => {
    const ctx = ctxNuevo({ productoEnFoco: 20, productoAnterior: 10 });
    await ejecutores.enfocar_producto(ctx, { productoId: 10 });
    expect(ctx.estado.productoEnFoco).toBe(10);
    expect(ctx.estado.productoAnterior).toBe(20);
  });

  test("mostrar de otro producto también mueve anterior (el modelo a veces muestra sin enfocar)", async () => {
    const ctx = ctxNuevo({ productoEnFoco: 10 });
    const r = (await ejecutores.mostrar(ctx, { productoId: 20, seccion: "precio" })) as any;
    expect(r.ok).toBe(true);
    expect(ctx.estado.productoEnFoco).toBe(20);
    expect(ctx.estado.productoAnterior).toBe(10);
  });

  test("el guion se recarga en el acto al cambiar de foco (no queda el del producto viejo)", async () => {
    const ctx = ctxNuevo({ productoEnFoco: 10 });
    let recargadoCon: number | null = null;
    ctx.alCambiarFoco = async (id: number) => {
      recargadoCon = id;
      Object.assign(ctx.guion, guionPara(id));
    };
    await ejecutores.enfocar_producto(ctx, { productoId: 20 });
    expect(recargadoCon).toBe(20);
  });

  test("estados viejos sin productoAnterior normalizan a null (sin migración)", () => {
    const n = normalizarEstado({ productoEnFoco: 10 } as any, 7);
    expect(n.productoAnterior).toBeNull();
    expect(n.productoEnFoco).toBe(10);
  });

  test("describirEstado menciona el anterior sin mezclarlo con el actual", () => {
    const e = { ...estadoInicial(1), productoEnFoco: 20, productoAnterior: 10 };
    const t = describirEstado(e, (id) => (id === 10 ? "piano" : "diseño"));
    expect(t).toMatch(/diseño/);
    expect(t).toMatch(/anterior/);
  });

  test("ultimoMensajeCliente no se pisa con la hora del agente (retomada detectable)", async () => {
    const hace26h = new Date(Date.now() - 26 * 3600 * 1000);
    const estado = { ...estadoInicial(1), ultimoMensajeCliente: hace26h.toISOString() };
    const historial: Mensaje[] = [
      { role: "customer", content: "hola", createdAt: hace26h },
      { role: "agent", content: "hola", createdAt: hace26h },
    ];
    const llm = clienteFalso([{ content: "Hola, ¿en qué te ayudo?" }]);
    const r = await responder({
      llm,
      estado,
      historial,
      catalogo: CATALOGO,
      conocimiento: [],
      guion: guionPara(null),
      voz: { nombreAgente: "A", rolAgente: "asesor", nombreNegocio: "N" },
    });
    // El turno del agente no debe rejuvenecer el último mensaje del CLIENTE.
    expect(r.estado.ultimoMensajeCliente).toBe(hace26h.toISOString());
    expect(r.estado.ultimoMensajeAgente).not.toBeNull();
  });
});
