import { describe, it, expect } from "vitest";
import { buildContextBlock } from "../conversation-engine";

/**
 * El bloque del catálogo le decía al modelo, textual:
 *
 *   "REGLA ABSOLUTA: ... Si el producto no aparece en esta lista, NO EXISTE."
 *
 * ...y la lista se recortaba a 3.500 caracteres. Medido con el catálogo real
 * de 140 productos: entraban 16. El 11%. O sea que la regla marcada como
 * ABSOLUTA le estaba afirmando al modelo que el 89% del catálogo no existe, y
 * qué 11% entraba cambiaba según el producto en foco de ese turno.
 *
 * Eso produjo, el 2026-08-25:
 *   - dos listas de productos distintas con un minuto de diferencia;
 *   - "Hmm, creo que no tengo ese producto 😅" sobre el Renovador Negro
 *     Perfecto, que el mismo bot había cotizado una hora antes.
 *
 * Ahora el índice lleva los 140 (solo id y nombre: 4.414 caracteres medidos) y
 * va PRIMERO, porque el prompt se recorta por el final.
 */
const memoria: any = {
  history: [], hasGreeted: true, currentStage: "presentation",
  currentProductId: null, currentProductName: null, sentProductIds: new Set<number>(),
};

// 140 productos, con nombres del largo real del catálogo (~31 caracteres).
const CATALOGO = Array.from({ length: 140 }, (_, i) => ({
  id: 100 + i,
  name: `Curso Completo de Materia ${i}`,
  price: 20000 + i,
  currency: "COP",
  description: "Una descripcion de producto suficientemente larga como para llenar el presupuesto de caracteres del bloque detallado, igual que en el catalogo real.",
  features: [],
  category: "Cursos",
  kind: i % 3 === 0 ? "physical" : "digital",
}));

const bloque = (foco: any = null) =>
  buildContextBlock(memoria, "product_query" as any, "presentation" as any, foco, true,
    null, false, "hola", CATALOGO);

describe("el modelo ve el catálogo entero, no el 11%", () => {
  it("los 140 productos aparecen en el bloque", () => {
    const b = bloque();
    const faltantes = CATALOGO.filter((p) => !b.includes(`[${p.id}] ${p.name}`));
    expect(faltantes).toHaveLength(0);
  });

  it("el producto que el bot negó estando a la venta ahora está", () => {
    const conRenovador = [...CATALOGO, {
      id: 128, name: "Renovador Negro Perfecto x 200ml", price: 33000, currency: "COP",
      description: "Devuelve el negro a plasticos y cauchos.", features: [], category: "Vehículos", kind: "physical",
    }];
    const b = buildContextBlock(memoria, "product_query" as any, "presentation" as any, null, true,
      null, false, "tienes el renovador?", conRenovador);
    expect(b).toContain("[128] Renovador Negro Perfecto x 200ml");
  });

  it("ya no afirma que lo ausente de la lista detallada no existe", () => {
    expect(bloque()).not.toMatch(/no aparece en esta lista, NO EXISTE/i);
  });

  it("el índice va ANTES de las fichas detalladas, porque el recorte come el final", () => {
    const b = bloque();
    const posIndice = b.indexOf("TODO LO QUE VENDE ESTE NEGOCIO");
    const posFin = b.indexOf("FIN DEL CATÁLOGO");
    expect(posIndice).toBeGreaterThan(-1);
    expect(posIndice).toBeLessThan(posFin);
  });

  it("el índice de 140 cuesta lo medido: menos de 6.000 caracteres", () => {
    // Si esto se dispara, el prompt entero se va de tope y el recorte empieza
    // a comerse cosas que sí importan.
    const b = bloque();
    const ini = b.indexOf("TODO LO QUE VENDE ESTE NEGOCIO");
    const fin = b.indexOf("Si el cliente nombra algo que NO está acá");
    expect(fin - ini).toBeLessThan(6000);
  });

  it("sigue diciendo cómo mandar la ficha", () => {
    expect(bloque()).toMatch(/\[CARD: ID\]/);
  });
});
