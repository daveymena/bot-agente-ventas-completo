/**
 * Pedido del dueño (07-10): "el agente de WhatsApp tiene que tener respuesta
 * para todo: le hacen preguntas que no son directas del tema pero que sí se
 * pueden responder con lógica de negocio, y las omite o no sabe qué decir".
 *
 * Antes, sin respuesta cargada, el vendedor recibía solo la ficha del
 * producto y la orden de NO decir que lo consultaba (nadie recibía la
 * pregunta). Ahora recibe los hechos del negocio para deducir, y si de verdad
 * no hay cómo, se la pasa al dueño (preguntar_al_dueno) y se guarda.
 */
import { describe, expect, test } from "vitest";
import { estadoInicial } from "../estado-conversacion";
import { ejecutores, type ContextoHerramientas, type Producto } from "../herramientas";
import { guionDelNegocio } from "../nicho";
import { disparadoresDe, esPreguntaRepetida } from "../preguntas-al-dueno";

const CORRECTOR: Producto = {
  id: 155, name: "Corrector de Postura Zxf 25 Eh", description: "Alinea hombros y columna.",
  price: 55000, currency: "COP", kind: "physical",
} as any;

function ctx(hechos: string[] = ["Pago contraentrega: pagas cuando lo recibes", "Envío a todo el país en 3 a 5 días hábiles"]): ContextoHerramientas {
  const guion = guionDelNegocio({ catalogo: [CORRECTOR as any], negocio: {} });
  return {
    estado: { ...estadoInicial(1), productoEnFoco: CORRECTOR.id },
    catalogo: [CORRECTOR],
    partes: [],
    conocimiento: [],
    guion: { ...guion, hechos },
    mensajeDelCliente: "¿y si no estoy en la casa cuando llegue?",
    efectos: [],
  };
}

describe("respuesta para todo", () => {
  test("sin respuesta cargada, el vendedor recibe los HECHOS del negocio para deducir", () => {
    const r = ejecutores.consultar_conocimiento(ctx(), { pregunta: "¿y si no estoy en la casa cuando llegue?" }) as any;
    expect(r.mensaje).toMatch(/Hechos del negocio: .*contraentrega/i);
    expect(r.mensaje).toMatch(/consecuencia lógica/i);
    expect(r.mensaje).toMatch(/Nunca lo dejes sin respuesta/i);
  });

  test("preguntar_al_dueno deja el efecto para que la pregunta le llegue al dueño", () => {
    const c = ctx();
    const r = ejecutores.preguntar_al_dueno(c, { pregunta: "¿Tienen tienda física en Medellín?" }) as any;
    expect(r.ok).toBe(true);
    expect(c.efectos).toContainEqual({ tipo: "pregunta_al_dueno", pregunta: "¿Tienen tienda física en Medellín?", productoId: 155 });
    expect(r.mensaje).toMatch(/consultaste con el equipo/i);
  });

  test("no se le avisa dos veces al dueño la misma pregunta (con otras palabras)", () => {
    const existentes = [{ productId: null, pregunta: "¿Tienen tienda física en Medellín?", disparadores: disparadoresDe("¿Tienen tienda física en Medellín?").split(", "), respuesta: null }];
    expect(esPreguntaRepetida("tienen tienda fisica medellin?", existentes)).toBe(true);
    expect(esPreguntaRepetida("¿Hacen factura electrónica?", existentes)).toBe(false);
  });
});
