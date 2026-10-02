/**
 * CONSULTAR_TRANSPORTADORAS: nombres reales para la ciudad, sin flete.
 *
 * Si el cliente quiere elegir quién lleva el envío, el bot lista las que
 * llegan a su ciudad (las que dice Dropi, no inventadas) y la elegida viaja
 * en tomar_pedido(transportadora=…).
 */
import { describe, test, expect } from "vitest";
import { estadoInicial } from "../estado-conversacion";
import { ejecutores, type ContextoHerramientas, type Producto, type ServicioDePedidos } from "../herramientas";
import { guionDelNegocio } from "../nicho";
import { servicioDePedidosDePrueba } from "../adaptador";
import { CONDICIONES_DE_RESPALDO } from "../../modelo-de-negocio";

const CORRECTOR: Producto = { id: 7, name: "Corrector de postura", description: "", price: 45000, currency: "COP", kind: "physical", disponible: true };
const CAT = [CORRECTOR];
const guion = () => guionDelNegocio({ catalogo: CAT, negocio: { nombre: "T" }, medios: [] });

function ctxCon(pedidos: ServicioDePedidos): ContextoHerramientas {
  const e = estadoInicial(1);
  e.productoEnFoco = 7;
  e.seccionesEnviadas = { 7: { precio: new Date().toISOString() } };
  e.compraConfirmada = 7;
  return { estado: e, catalogo: CAT, partes: [], conocimiento: [], guion: guion(), mensajeDelCliente: "", efectos: [], pedidos } as ContextoHerramientas;
}

const prueba = () => servicioDePedidosDePrueba({ condiciones: CONDICIONES_DE_RESPALDO }).servicio;

describe("consultar_transportadoras", () => {
  test("lista nombres reales para la ciudad, sin precios", async () => {
    const c = ctxCon(prueba());
    c.estado.datos.ciudad = "Cali";
    const r = await ejecutores.consultar_transportadoras(c, {});
    expect(r.ok).toBe(true);
    expect(r.mensaje).toMatch(/SERVIENTREGA/);
    expect(r.mensaje).not.toMatch(/\$\d/);
  });

  test("sin ciudad no inventa: la pide", async () => {
    const r = await ejecutores.consultar_transportadoras(ctxCon(prueba()), {});
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/ciudad/);
  });

  test("sin servicio de pedidos no finge la lista", async () => {
    const c = ctxCon(prueba());
    (c as any).pedidos = { tomar: async () => ({ estado: "error" as const, motivo: "x" }), confirmar: async () => ({ estado: "error" as const, motivo: "x" }) };
    const r = await ejecutores.consultar_transportadoras(c, { ciudad: "Cali" });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/no inventes/i);
  });
});

describe("tomar_pedido con transportadora", () => {
  const DATOS = { nombre: "Pedro Pérez", telefono: "3001234567", direccion: "Calle 10 # 20-30", ciudad: "Cali", departamento: "Valle" };

  test("la elegida viaja al servicio y queda en el estado", async () => {
    let recibido: any = null;
    const s: ServicioDePedidos = {
      async tomar(p) { recibido = p; return { estado: "listo", resumen: "📦 resumen" }; },
      async confirmar() { return { estado: "creado", numero: "1", confirmacion: "ok" }; },
    };
    const c = ctxCon(s);
    await ejecutores.tomar_pedido(c, { ...DATOS, variante: "M", transportadora: "SERVIENTREGA" });
    expect(recibido.variante).toBe("M");
    expect(recibido.transportadora).toEqual({ nombre: "SERVIENTREGA" });
    expect(c.estado.datos.transportadora).toBe("SERVIENTREGA");
  });

  test("sin elección no se manda transportadora", async () => {
    let recibido: any = null;
    const s: ServicioDePedidos = {
      async tomar(p) { recibido = p; return { estado: "listo", resumen: "📦 resumen" }; },
      async confirmar() { return { estado: "creado", numero: "1", confirmacion: "ok" }; },
    };
    await ejecutores.tomar_pedido(ctxCon(s), DATOS);
    expect(recibido.transportadora).toBeNull();
  });
});
