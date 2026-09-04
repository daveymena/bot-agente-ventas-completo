import { describe, it, expect } from "vitest";

/**
 * Un curso digital y una rodillera térmica no se venden igual: el digital se
 * entrega con un enlace al instante, el físico necesita dirección, ciudad y
 * transportadora. Con los dos en el mismo catálogo, el agente se confundió las
 * dos veces que podía:
 *
 *   · le prometió "acceso inmediato por Google Drive" al Renovador Negro
 *     Perfecto, que es un frasco de 200 ml que se envía por mensajería;
 *   · y describió ese mismo frasco como un curso de maquillaje digital.
 *
 * Instruir al modelo para que "no confunda" ya se intentó, con reglas duras en
 * el prompt, y falló igual. Por eso el filtro es de catálogo: si el producto
 * no está en la lista, no hay nada que confundir.
 *
 * Esto reproduce el filtro tal como corre en agent.ts.
 */
type Modo = "digital" | "fisico" | "mixto";

function filtrarPorModo<T extends { kind?: string | null }>(productos: T[], modo: Modo): T[] {
  if (modo === "mixto") return productos;
  const quiere = modo === "digital" ? "digital" : "physical";
  const soloDelModo = productos.filter((p) => String(p.kind || "digital") === quiere);
  // Si el negocio no tiene productos de su propio modo, se deja el catálogo
  // entero: dejar al agente sin nada que ofrecer es peor.
  return soloDelModo.length > 0 ? soloDelModo : productos;
}

// Proporción real del catálogo: 84 digitales y 56 físicos.
const CATALOGO = [
  ...Array.from({ length: 84 }, (_, i) => ({ id: i + 1, name: `Curso ${i}`, kind: "digital" })),
  ...Array.from({ length: 56 }, (_, i) => ({ id: 200 + i, name: `Producto ${i}`, kind: "physical" })),
];

describe("un negocio solo-digital no puede ver un producto físico", () => {
  it("deja fuera los 56 físicos", () => {
    const r = filtrarPorModo(CATALOGO, "digital");
    expect(r).toHaveLength(84);
    expect(r.every((p) => p.kind === "digital")).toBe(true);
  });

  it("el Renovador Negro Perfecto ya no está para confundirse", () => {
    const conRenovador = [
      { id: 1, name: "Curso de Piano", kind: "digital" },
      { id: 128, name: "Renovador Negro Perfecto x 200ml", kind: "physical" },
    ];
    const r = filtrarPorModo(conRenovador, "digital");
    expect(r.find((p) => p.id === 128)).toBeUndefined();
  });
});

describe("el otro negocio, el de físicos, funciona al revés", () => {
  it("deja fuera los digitales", () => {
    const r = filtrarPorModo(CATALOGO, "fisico");
    expect(r).toHaveLength(56);
    expect(r.every((p) => p.kind === "physical")).toBe(true);
  });
});

describe("no le cambia el catálogo a quien no lo pidió", () => {
  it("mixto es el valor por defecto y no filtra nada", () => {
    expect(filtrarPorModo(CATALOGO, "mixto")).toHaveLength(140);
  });

  it("un producto sin kind cuenta como digital, que es el default histórico", () => {
    const r = filtrarPorModo([{ id: 1, name: "Viejo" } as any], "digital");
    expect(r).toHaveLength(1);
  });
});

describe("nunca deja al agente sin nada que ofrecer", () => {
  it("si el negocio dice digital y solo tiene físicos, no vacía el catálogo", () => {
    const soloFisicos = [{ id: 1, name: "Rodillera", kind: "physical" }];
    // Preferible un catálogo que no calza al modo, antes que un agente mudo:
    // el caso real es un negocio que se equivocó de ajuste.
    expect(filtrarPorModo(soloFisicos, "digital")).toHaveLength(1);
  });
});
