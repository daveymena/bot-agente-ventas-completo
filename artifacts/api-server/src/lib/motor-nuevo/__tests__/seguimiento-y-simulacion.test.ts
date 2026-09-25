import { describe, test, expect } from "vitest";
import { estadoInicial } from "../estado-conversacion";
import { ejecutores, type ContextoHerramientas } from "../herramientas";
import { guionDelNegocio } from "../nicho";
import { esConversacionDeSimulacion } from "../adaptador";

const ctxCon = (pedidos: any): ContextoHerramientas => ({
  estado: estadoInicial(1), catalogo: [], partes: [], conocimiento: [],
  guion: guionDelNegocio({ catalogo: [], negocio: { nombre: "T" }, medios: [] }),
  mensajeDelCliente: "¿dónde va mi pedido?", efectos: [], pedidos,
});

describe("seguimiento del pedido", () => {
  test("con pedido: devuelve los hechos reales", async () => {
    const r = await ejecutores.estado_de_mi_pedido(ctxCon({ estado: async () => ({ hay: true, texto: "Pedido #5: Corrector × 1. En Dropi: EN TRANSITO, transportadora Interrapidísimo, guía 123." }) }), {});
    expect(r.mensaje).toMatch(/guía 123/);
  });
  test("sin pedido: no inventa", async () => {
    const r = await ejecutores.estado_de_mi_pedido(ctxCon({ estado: async () => ({ hay: false, texto: "" }) }), {});
    expect(r.mensaje).toMatch(/no tiene ningún pedido/);
  });
  test("sin servicio: escala, no inventa guía", async () => {
    const r = await ejecutores.estado_de_mi_pedido(ctxCon(undefined), {});
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/No inventes guía/);
  });
});

describe("conversación de simulación", () => {
  test("solo el prefijo sim- (un número real de WhatsApp son dígitos)", () => {
    expect(esConversacionDeSimulacion("sim-e2e-1")).toBe(true);
    expect(esConversacionDeSimulacion("573001234567")).toBe(false);
    expect(esConversacionDeSimulacion(null)).toBe(false);
  });
});
