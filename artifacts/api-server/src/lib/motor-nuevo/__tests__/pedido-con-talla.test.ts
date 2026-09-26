/**
 * LA TALLA VIAJA CON EL PEDIDO
 *
 * Simulación en producción del 26-09-2026: "…Medellín, 3001234567, talla M"
 * y el resumen salió sin talla. En dropshipping eso es despachar a ciegas.
 */
import { describe, test, expect } from "vitest";
import { estadoInicial } from "../estado-conversacion";
import { ejecutores, type ContextoHerramientas, type Producto, type ServicioDePedidos, type DatosDelPedido } from "../herramientas";
import { guionDelNegocio } from "../nicho";

const CORRECTOR: Producto = { id: 7, name: "Corrector de postura", description: "", price: 45000, currency: "COP", kind: "physical", disponible: true, opciones: ["S", "M", "L", "XL"] };
const CAT = [CORRECTOR];

function ctx(): { c: ContextoHerramientas; guardado: DatosDelPedido } {
  const guardado: DatosDelPedido = {};
  const s: ServicioDePedidos = {
    async tomar({ datos }) {
      Object.assign(guardado, datos);
      return { estado: "listo", resumen: `📦 Corrector × 1${guardado.notas ? `\n📍 ${guardado.notas}` : ""}` };
    },
    async confirmar() { return { estado: "creado", numero: "1", confirmacion: "" }; },
  };
  const e = estadoInicial(1);
  e.productoEnFoco = 7;
  e.seccionesEnviadas = { 7: { precio: new Date().toISOString() } };
  e.compraConfirmada = 7;
  const c = { estado: e, catalogo: CAT, partes: [], conocimiento: [], guion: guionDelNegocio({ catalogo: CAT, negocio: { nombre: "T" }, medios: [] }), mensajeDelCliente: "", efectos: [], pedidos: s } as ContextoHerramientas;
  return { c, guardado };
}

const DATOS = { nombre: "Pedro Pérez", telefono: "3001234567", direccion: "Calle 10 # 20-30", ciudad: "Medellín", departamento: "Antioquia" };

describe("tomar_pedido con talla", () => {
  test("la talla dicha sale en el resumen y en las notas del pedido", async () => {
    const { c, guardado } = ctx();
    await ejecutores.tomar_pedido(c, { ...DATOS, variante: "M" });
    expect(guardado.notas).toMatch(/Talla\/variante: M/);
    expect(c.partes.map((p: any) => p.content).join("\n")).toMatch(/Talla\/variante: M/);
  });

  test("con tallas y sin elegir, pregunta la talla antes del resumen", async () => {
    const { c } = ctx();
    const r = await ejecutores.tomar_pedido(c, DATOS);
    expect(r.mensaje).toMatch(/falta la talla/);
    expect(c.partes.length).toBe(0);
    expect(c.estado.pedidoPorConfirmarEnTurno).toBeNull();
  });
});
