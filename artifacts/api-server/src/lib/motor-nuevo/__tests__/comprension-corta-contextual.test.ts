import { describe, expect, it, vi } from "vitest";
import { estadoInicial, registrarEnvio } from "../estado-conversacion";
import {
  diceQueCompra,
  esConfirmacionBreve,
  ejecutores,
  type ContextoHerramientas,
  type Producto,
} from "../herramientas";
import { guionDelNegocio } from "../nicho";

const PRODUCTO: Producto = {
  id: 218,
  name: "Faja Deportiva Waist Trainer",
  description: "Faja ajustable",
  price: 65000,
  currency: "COP",
  kind: "physical",
  disponible: true,
  stock: 5,
};

function contexto(mensaje: string) {
  const estado = estadoInicial(1);
  estado.productoEnFoco = PRODUCTO.id;
  estado.ultimaPreguntaAgente = "¿Te la enviamos?";
  estado.preguntoSiCompra = { productoId: PRODUCTO.id, turno: 0 };
  estado.turnos = 1;
  registrarEnvio(estado, PRODUCTO.id, "precio");
  const tomar = vi.fn(async () => ({ estado: "faltan" as const, faltan: ["nombre", "celular"], yaTiene: [] }));
  const ctx: ContextoHerramientas = {
    estado,
    catalogo: [PRODUCTO],
    partes: [],
    conocimiento: [],
    guion: guionDelNegocio({ catalogo: [PRODUCTO], negocio: { nombre: "Tienda" }, medios: [] }),
    mensajeDelCliente: mensaje,
    efectos: [],
    pedidos: { tomar, confirmar: vi.fn(async () => ({ estado: "sin_pedido" as const })) },
  };
  return { ctx, tomar };
}

describe("comprensión de palabras cortas con contexto", () => {
  it.each(["sí", "si", "sii", "s", "sip", "dale", "listo", "de una", "ok", "oki", "va", "hágale"])(
    'entiende "%s" como confirmación cuando responde a una pregunta de compra',
    (texto) => expect(esConfirmacionBreve(texto)).toBe(true),
  );

  it.each(["me interesa", "este", "puede ser", "sí, ¿cuánto demora?", "dale pero cuánto vale?", "no sé", "después"])(
    'no convierte "%s" en autorización de compra',
    (texto) => expect(esConfirmacionBreve(texto)).toBe(false),
  );

  it("un sí corto avanza el pedido usando la pregunta pendiente", async () => {
    const { ctx, tomar } = contexto("sii");
    const resultado = await ejecutores.tomar_pedido(ctx, {});
    expect(resultado.ok).toBe(true);
    expect(ctx.estado.compraConfirmada).toBe(PRODUCTO.id);
    expect(tomar).toHaveBeenCalledOnce();
  });

  it("una pregunta posterior no se confunde con un sí solo por no contener 'no'", async () => {
    const { ctx, tomar } = contexto("cuánto se demora en llegar");
    const resultado = await ejecutores.tomar_pedido(ctx, {});
    expect(resultado.ok).toBe(false);
    expect(ctx.estado.compraConfirmada).toBeNull();
    expect(tomar).not.toHaveBeenCalled();
  });

  it.each(["lo kiero", "quiero uno", "me lo llevo", "mandamelo", "envíamelo", "si queiro realizar el pedido", "quiero realizar el pedido", "realizar pedido", "confirmar el pedido"])(
    'reconoce intención explícita de compra: "%s"',
    (texto) => expect(diceQueCompra(texto)).toBe(true),
  );

  // Chat de prueba del dueño (30-09-2026): "Listo, la quiero. ¿Cómo hago el
  // pedido?" → "¿Te gustaría que hagamos el pedido de una vez?". El "?"
  // bastaba para tomar todo el mensaje como duda.
  it.each(["Listo, la quiero. ¿Cómo hago el pedido?", "¿Cómo hago el pedido?", "me la llevo, ¿cómo la pido?", "dale, ¿cómo pago?"])(
    'una pregunta sobre CÓMO comprar es compra: "%s"',
    (texto) => expect(diceQueCompra(texto)).toBe(true),
  );

  it.each(["la quiero pero ¿la tienen en negro?", "¿cuánto se demora en llegar?", "¿la quiero en azul, hay?", "no, ¿cómo hago el pedido después?", "lo voy a pensar, ¿cómo hago el pedido luego?"])(
    'una duda real o un aplazamiento no es compra: "%s"',
    (texto) => expect(diceQueCompra(texto)).toBe(false),
  );
});
