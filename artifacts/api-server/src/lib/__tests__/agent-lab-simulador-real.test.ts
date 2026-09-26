import { describe, it, expect } from "vitest";
import { elegirProducto, cantidadPedida, intencionDelLab } from "../../routes/agent-lab";
import { arquetiposDelMensaje } from "../motor-nuevo/cliente-simulado";

// Catálogo como el de producción: SIN producto #1 (26-09-2026 el simulador
// usaba el #1 por defecto y devolvía "0 simulaciones, sin problemas").
const catalogo = [
  { id: 201, name: "Corrector de Hombros y Clavícula", disponible: true },
  { id: 203, name: "Corrector Postural con Placa Rígida", disponible: true },
  { id: 310, name: "Curso de Mecánica de Bicicletas", disponible: true },
];

describe("Agent Lab — qué producto simula", () => {
  it("sin id y sin nombrarlo, usa uno que EXISTE (nunca el #1 fijo)", () => {
    expect(elegirProducto(catalogo, "simula 3 clientes")?.id).toBe(201);
  });
  it("el que nombra el mensaje", () => {
    expect(elegirProducto(catalogo, "simula clientes para el curso de bicicletas")?.id).toBe(310);
    expect(elegirProducto(catalogo, "simula para el corrector con placa rígida")?.id).toBe(203);
  });
  it("el id de la pantalla manda si existe", () => {
    expect(elegirProducto(catalogo, "simula", 203)?.id).toBe(203);
    expect(elegirProducto(catalogo, "simula", 1)?.id).toBe(201);
  });
});

describe("Agent Lab — arquetipos y cantidad", () => {
  it("entiende los nombres de la guía y palabras normales", () => {
    expect(arquetiposDelMensaje("Simula 2 DESCONFIADO y 1 EXPERTO")).toEqual(["CLIENTE_EXPERTO", "DESCONFIADO"]);
    expect(arquetiposDelMensaje("clientes lista para comprar")).toEqual(["LISTO_PARA_COMPRAR"]);
    expect(arquetiposDelMensaje("unos escépticos y precio sensible")).toEqual(["PRECIO_SENSIBLE", "ESCEPTICO"]);
    expect(arquetiposDelMensaje("simula algo")).toEqual([]);
  });
  it("el número pedido llega (antes se leía y se ignoraba), con tope", () => {
    expect(cantidadPedida("simula 2 desconfiados", 1)).toBe(2);
    expect(cantidadPedida("simula 10 clientes", 1)).toBe(3);
    expect(cantidadPedida("simula clientes", 2)).toBe(2);
  });
});

describe("Agent Lab — qué pidió el dueño", () => {
  it.each([
    ["Simula 5 clientes DESCONFIADO", "simular"],
    ["propone mejoras", "mejorar"],
    ["aplica la regla 2", "aplicar_regla"],
    ["aplica todas", "aplicar_regla"],
    ["compara la versión 42", "version"],
    ["Aplica versión 42 al 10% de tráfico", "version"],
    ["hola", "ayuda"],
  ])("%s → %s", (m, esperado) => {
    expect(intencionDelLab(m)).toBe(esperado);
  });
});
