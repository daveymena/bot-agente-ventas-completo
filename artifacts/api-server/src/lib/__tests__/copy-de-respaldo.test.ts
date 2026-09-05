/**
 * El anuncio sale igual aunque el modelo no escriba.
 *
 * El patrón viene del Landing Agent que otra IA construyó en este repo: su
 * `normalizeSections()` cae a `fallbackSections(product)` y siempre devuelve
 * algo usable. Atlas hacía lo contrario en `crear_anuncio` --se rendía con "El
 * modelo no devolvió un copy utilizable"--, un fallo medido en vivo el
 * 2026-08-19 (388 ms, instantáneo, con la clave paga cargada) y repetido el
 * 04-09: "duró más de un minuto y nunca lo entregó".
 *
 * Lo que se prueba acá es sobre todo lo que el respaldo NO puede hacer:
 * inventar. Un respaldo que rellena con frases de venta genéricas sería peor
 * que el error, porque publicaría afirmaciones que el negocio no sostiene.
 */
import { describe, it, expect } from "vitest";
import { copyDeRespaldo, avisoDeCopyDeRespaldo } from "../copy-de-respaldo";
import { revisarCopy } from "../publicidad-persuasiva";

const CURSO = {
  name: "Curso de piano desde cero",
  description: "Aprendé a tu ritmo con clases en video.",
  features: ["19 horas de contenido en HD", "Clásico, blues, jazz y pop", "157 recursos descargables"],
  price: 60000,
  currency: "COP",
  kind: "digital",
};

describe("arma un anuncio con lo que el producto ya dice", () => {
  it("usa el nombre, las características y el precio reales", () => {
    const c = copyDeRespaldo(CURSO);
    expect(c.primaryText).toContain("19 horas de contenido en HD");
    expect(c.primaryText).toContain("157 recursos descargables");
    expect(c.primaryText).toContain("$60.000 COP");
    expect(c.headline).toContain("Curso de piano");
  });

  it("respeta la forma que se le pide al modelo: bloques separados", () => {
    const c = copyDeRespaldo(CURSO);
    expect(c.primaryText.split("\n\n").length).toBeGreaterThanOrEqual(4);
    expect(c.primaryText).toMatch(/🔥/);
    expect(c.primaryText).toMatch(/👉/);
  });

  /** Se marca SIEMPRE: hacerlo pasar por copy del modelo sería mentirle al admin. */
  it("se declara respaldo", () => {
    expect(copyDeRespaldo(CURSO).esRespaldo).toBe(true);
    expect(avisoDeCopyDeRespaldo()).toMatch(/borrador base/i);
    expect(avisoDeCopyDeRespaldo()).toMatch(/revisalo|pedímelo/i);
  });

  /**
   * El emoji que el dueño cargó para un ítem se respeta. Misma regla que el
   * copy del modelo: ✅ es solo para los que no traen ninguno.
   */
  it("conserva el emoji del catálogo cuando la característica lo trae", () => {
    const c = copyDeRespaldo({ ...CURSO, features: ["🎹 Clásico y jazz", "Sin experiencia previa"] });
    expect(c.primaryText).toContain("🎹 Clásico y jazz");
    expect(c.primaryText).toContain("✅ Sin experiencia previa");
    expect(c.primaryText).not.toContain("✅ 🎹");
  });
});

describe("NO INVENTA NADA — que es lo que lo hace publicable", () => {
  /**
   * Lo mismo que bloquea al modelo tiene que bloquear al respaldo. Si algo de
   * acá no pasara el validador, es un bug de este módulo, no una excepción.
   */
  it("pasa el mismo validador que el copy del modelo", () => {
    for (const prod of [
      CURSO,
      { name: "Termo de acero", price: 89000, currency: "COP", kind: "physical", features: ["Mantiene el frío 24h"] },
      { name: "Producto sin datos" },
    ]) {
      const { bloquea } = revisarCopy(copyDeRespaldo(prod).primaryText);
      expect(bloquea, `bloqueado para ${prod.name}: ${JSON.stringify(bloquea)}`).toHaveLength(0);
    }
  });

  it("sin características, la lista sale corta en vez de inventada", () => {
    const c = copyDeRespaldo({ name: "Producto sin datos", price: 10000, currency: "COP" });
    expect(c.primaryText).toContain("Producto sin datos".toLowerCase());
    expect(c.primaryText).not.toMatch(/garant[ií]a|env[ií]o gratis|el mejor|m[aá]s vendido|miles de/i);
  });

  it("no promete una forma de entrega que no sabe", () => {
    const fisico = copyDeRespaldo({ name: "Termo", kind: "physical", price: 1, currency: "COP" });
    expect(fisico.primaryText).not.toMatch(/enlace|descarg|inmediat/i);
  });

  it("no inventa precio cuando no hay", () => {
    const c = copyDeRespaldo({ name: "Producto sin precio" });
    expect(c.primaryText).not.toContain("🔥");
    expect(c.primaryText).not.toMatch(/\$0\b/);
  });
});

describe("no se rompe con datos sucios, que es de donde viene", () => {
  it.each([
    [{}, "producto vacío"],
    [{ name: null, features: null, price: null }, "todo en null"],
    [{ name: "X", features: "no soy un array" }, "features que no es lista"],
    [{ name: "X", features: [null, "", "  ", "Real"] }, "features con basura"],
    [{ name: "X", price: "no es un numero" }, "precio no numérico"],
  ])("%#: %s", (prod) => {
    const c = copyDeRespaldo(prod as any);
    expect(c.primaryText.length).toBeGreaterThan(20);
    expect(c.headline.length).toBeGreaterThan(0);
    expect(c.primaryText).not.toContain("undefined");
    expect(c.primaryText).not.toContain("null");
    expect(c.primaryText).not.toContain("NaN");
  });

  it("recorta el titular al límite de Meta sin partir palabras", () => {
    const c = copyDeRespaldo({ name: "Un nombre de producto larguísimo que jamás entraría en un titular de Facebook Ads" });
    expect(c.headline.length).toBeLessThanOrEqual(40);
    expect(c.headline).not.toMatch(/\s$/);
  });
});
