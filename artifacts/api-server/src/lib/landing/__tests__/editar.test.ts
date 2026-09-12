import { describe, it, expect } from "vitest";
import { aplicarOperaciones } from "../editar";

/**
 * El editor devolvía operaciones que nadie aplicaba y la pantalla decía
 * "Cambio aplicado" (12-09-2026). Acá se prueba que aplicar aplica.
 */
const base = { name: "Faja", design: { familia: "ecommerce" }, sections: [
  { id: "hero-1", type: "hero", title: "Nueva figura", cta: "¡Quiero la mía!" },
  { id: "benefits-1", type: "benefits", title: "Beneficios", body: "a\nb" },
  { id: "cta-1", type: "cta", title: "Pedí ahora", cta: "Pedir" },
] };

describe("aplicarOperaciones", () => {
  it("edita, agrega, mueve, cambia CTA y diseño", () => {
    const r = aplicarOperaciones(base, [
      { op: "update_section", sectionId: "hero-1", patch: { title: "¿Cansada de la faja que se nota?" } },
      { op: "set_cta", sectionId: "cta-1", cta: "Pedir y pagar al recibir" },
      { op: "add_section", section: { type: "faq", title: "Preguntas", body: "¿Tallas? | S/M y L/XL" } },
      { op: "move_section", sectionId: "benefits-1", direction: "up" },
      { op: "update_design", patch: { familia: "belleza" } },
    ]);
    expect(r.sections[0].type).toBe("benefits");
    expect(r.sections.find((s) => s.id === "hero-1")!.title).toBe("¿Cansada de la faja que se nota?");
    expect(r.sections.find((s) => s.id === "cta-1")!.cta).toBe("Pedir y pagar al recibir");
    expect(r.sections.some((s) => s.type === "faq")).toBe(true);
    expect(r.design.familia).toBe("belleza");
    expect(r.aplicadas).toHaveLength(5);
  });
  it("no quita el hero ni el cierre, y no toca fotos", () => {
    const r = aplicarOperaciones(base, [
      { op: "remove_section", sectionId: "hero-1" },
      { op: "update_section", sectionId: "hero-1", patch: { image: "https://x/y.jpg", imagePrompt: "algo" } },
    ]);
    expect(r.sections.some((s) => s.type === "hero")).toBe(true);
    expect(r.sections[0].image).toBeUndefined();
    expect(r.ignoradas.length).toBeGreaterThan(0);
  });
  it("un patch con JSON de editor entra como texto", () => {
    const r = aplicarOperaciones(base, [{ op: "update_section", sectionId: "hero-1", patch: { title: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hola" }] }] } } }]);
    expect(r.sections.find((s) => s.id === "hero-1")!.title).toBe("Hola");
  });
});

describe("límites del editor (rueda abdominal, 12-09-2026)", () => {
  it("no agrega prueba social inventada ni cuatro secciones iguales", () => {
    const r = aplicarOperaciones(base, [
      { op: "add_section", section: { type: "testimonials", title: "Lo que dicen", body: "Increíble | Juan" } },
      { op: "add_section", section: { type: "benefits", title: "Dolor", body: "a" } },
      { op: "add_section", section: { type: "benefits", title: "Cómo funciona", body: "b" } },
      { op: "add_section", section: { type: "benefits", title: "Más", body: "c" } },
    ]);
    expect(r.sections.some((s) => s.type === "testimonials")).toBe(false);
    expect(r.sections.filter((s) => s.type === "benefits")).toHaveLength(2);
    expect(r.ignoradas.length).toBe(3);
  });
});
