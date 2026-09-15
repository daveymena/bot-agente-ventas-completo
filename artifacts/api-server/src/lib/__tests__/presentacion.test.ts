/**
 * "Las respuestas salen en texto plano, sin separación, sin negritas ni
 * emojis: da pereza leer" (dueño, 14-09-2026). Esto garantiza que lo que
 * llega al celular se lea de un vistazo, pase lo que pase con el modelo.
 */
import { describe, it, expect } from "vitest";
import { presentarParaWhatsApp, presentarParaPanel } from "../presentacion";
import { toEmojiStyle } from "../conversation-engine";

describe("presentación para WhatsApp", () => {
  it("conserva las negritas y pasa el markdown al formato de WhatsApp", () => {
    expect(presentarParaWhatsApp("El **Corrector de postura** es *ajustable*.")).toBe("El *Corrector de postura* es *ajustable*.");
  });

  it("pone el precio en negrita, una sola vez", () => {
    const t = presentarParaWhatsApp("Vale $45.999 COP y llega en 3 días. Antes costaba *$60.000*.");
    expect(t).toContain("*$45.999 COP*");
    expect(t).toContain("*$60.000*");
    expect(t).not.toContain("**");
  });

  it("le pone a cada viñeta un emoji con sentido y respeta las que ya lo traen", () => {
    const t = presentarParaWhatsApp("Esto incluye:\n- Envío gratis a todo el país\n- Pago contra entrega\n- Garantía de 6 meses\n🎁 Bono sorpresa");
    expect(t).toContain("🚚 Envío gratis a todo el país");
    expect(t).toContain("💳 Pago contra entrega");
    expect(t).toContain("🛡️ Garantía de 6 meses");
    expect(t).toContain("🎁 Bono sorpresa");
  });

  it("un bloque largo sin aire se parte en párrafos de dos frases", () => {
    const largo = "Hola, gracias por escribir. El corrector se usa debajo de la ropa y no se nota. Está hecho en material transpirable para que lo uses todo el día. Viene en tallas de la S a la XL y se ajusta con velcro. Llega en tres a cinco días hábiles a todo el país. Pagás cuando lo recibís.";
    const t = presentarParaWhatsApp(largo);
    expect(t.split("\n\n").length).toBe(3);
    expect(t).toContain("Hola, gracias por escribir. El corrector se usa debajo de la ropa y no se nota.\n\n");
  });

  it("no toca la ficha ni un texto ya organizado por el dueño", () => {
    const ficha = "🎹 Curso de piano\n💰 $60.000\n📦 Incluye todo el material\n🎓 100+ horas de contenido";
    expect(presentarParaWhatsApp(ficha)).toBe("🎹 Curso de piano\n💰 *$60.000*\n📦 Incluye todo el material\n🎓 100+ horas de contenido");
  });

  it("quita el asterisco suelto sin romper las negritas", () => {
    expect(presentarParaWhatsApp("Calidad 5* con *garantía*")).toBe("Calidad 5 con *garantía*");
  });
});

describe("toEmojiStyle ya no borra las negritas (panel y Messenger)", () => {
  it("conserva **negrita** para el Markdown del panel", () => {
    expect(toEmojiStyle("**Paso 1** listo\n- item")).toBe("**Paso 1** listo\n\n✅ item".replace("\n\n", "\n"));
  });
  it("presentarParaPanel deja el Markdown y quita separadores robóticos", () => {
    expect(presentarParaPanel("**Título**\n---\ntexto")).toBe("**Título**\n\ntexto");
  });
});
