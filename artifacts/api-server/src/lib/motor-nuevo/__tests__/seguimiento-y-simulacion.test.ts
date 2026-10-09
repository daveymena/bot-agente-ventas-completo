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

import { responder, esListaDeProductosAMano } from "../motor";
import { clienteFalso } from "../cliente-llm";
import { esParaLeer, decideSiMandaVoz } from "../../cuando-va-la-voz";

const correctores = [
  { id: 201, name: "Corrector de Hombros y Clavícula", description: "", price: 45000, currency: "COP", kind: "physical", disponible: true },
  { id: 203, name: "Corrector Postural con Placa Rígida", description: "", price: 45000, currency: "COP", kind: "physical", disponible: true },
  { id: 200, name: "Corrector Espalda Completa Malla Negro", description: "", price: 55000, currency: "COP", kind: "physical", disponible: true },
] as any;

describe("conv 218 (25-09-2026): lista vieja escrita a mano, leída en audio", () => {
  const LISTA = "Te vuelvo a pasar los modelos:\n\nCorrector de postura = $45.000\nCorrector de postura trenza = $50.000\nCorrector de postura unisex = $55.000";

  test("se detecta la lista a mano", () => {
    expect(esListaDeProductosAMano(LISTA)).toBe(true);
    expect(esListaDeProductosAMano("Llega en 3 a 5 días.")).toBe(false);
  });

  test("la lista sale del texto y van las fichas reales del catálogo", async () => {
    const llm = clienteFalso([{ content: LISTA }]);
    const r = await responder({ llm, estado: estadoInicial(218), historial: [{ role: "customer", content: "tienes corrector de postura", createdAt: new Date() }], catalogo: correctores, conocimiento: [], guion: guionDelNegocio({ catalogo: correctores, negocio: { nombre: "T" }, medios: [] }), voz: { nombreAgente: "S", rolAgente: "a", nombreNegocio: "T" } });
    const texto = r.partes.filter((p: any) => p.kind === "text").map((p: any) => p.content).join(" ");
    expect(texto).not.toMatch(/trenza|\$50\.000/);
    expect(r.partes.filter((p: any) => p.kind === "card").length).toBeGreaterThanOrEqual(2);
  });

  test("una lista o un precio nunca van en audio", () => {
    expect(esParaLeer(LISTA)).toBe(true);
    expect(decideSiMandaVoz({ tieneFicha: false, texto: LISTA + " ".repeat(200), activo: true, azar: () => 0 })).toBe(false);
    expect(decideSiMandaVoz({ tieneFicha: false, texto: "Entiendo la duda. Es un accesorio de apoyo para mantener la postura mientras lo usas; no es un tratamiento médico y la comodidad depende del ajuste de cada persona.", activo: true, azar: () => 0 })).toBe(true);
  });
});

// Venta perdida real (conv 2, Elkin, 06→08-10): Dropi rechazó por "BOGOTA D C",
// el cliente preguntó dos días después, el bot leyó el error y dijo "el equipo
// lo está gestionando" (nadie lo hacía) y el cliente canceló.
describe("pedido frenado: se reintenta cuando el cliente pregunta", () => {
  const elkin = {
    id: 1, estado: "rechazado_dropi", dropi_estado: "error", dropi_order_id: null, telefono: "3146241530", notas: "",
    dropi_error: "Dropi rechazó el pedido directo: El departamento no existe o está deshabilitado por los momentos, por favor contactar al area de atención al cliente BOGOTA D C",
    created_at: "2026-10-06T16:11:46.212Z",
  };
  const dosDiasDespues = new Date("2026-10-08T13:52:35Z").getTime();

  test("el caso de Elkin SÍ se reintenta (era un dato nuestro: el departamento)", async () => {
    const { debeReintentarAlPreguntar } = await import("../adaptador");
    expect(await debeReintentarAlPreguntar(elkin, dosDiasDespues)).toBe(true);
  });
  test("el departamento que Dropi rechazó ahora sale bien", async () => {
    const { destinoParaDropi } = await import("../../dropi-directo");
    expect(destinoParaDropi("Bogotá", "Bogotá D.C.")).toEqual({ city: "BOGOTA", state: "CUNDINAMARCA" });
  });
  test("cancelado, ya en Dropi, simulación o sin stock: NO se reintenta", async () => {
    const { debeReintentarAlPreguntar } = await import("../adaptador");
    expect(await debeReintentarAlPreguntar({ ...elkin, estado: "cancelado" }, dosDiasDespues)).toBe(false);
    expect(await debeReintentarAlPreguntar({ ...elkin, dropi_order_id: "999" }, dosDiasDespues)).toBe(false);
    expect(await debeReintentarAlPreguntar({ ...elkin, telefono: "sim-1" }, dosDiasDespues)).toBe(false);
    expect(await debeReintentarAlPreguntar({ ...elkin, dropi_error: "Producto sin stock" }, dosDiasDespues)).toBe(false);
  });
  test("cancelar: llama al servicio de verdad y repite lo que pasó", async () => {
    const r = await ejecutores.cancelar_mi_pedido(ctxCon({ cancelar: async () => ({ ok: true, texto: "Pedido #1 CANCELADO en el sistema" }) }), {});
    expect(r.ok).toBe(true);
    expect(r.mensaje).toMatch(/CANCELADO/);
  });
  test("cancelar sin servicio: escala y NO dice que quedó cancelado", async () => {
    const r = await ejecutores.cancelar_mi_pedido(ctxCon(undefined), {});
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/No digas que ya quedó cancelado/);
  });
});
