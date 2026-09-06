import { describe, it, expect } from "vitest";
import { unirTextosSeguidos, unirElRestoDeLaFicha } from "../una-sola-burbuja";

/**
 * El turno real que motivó esto (conversación de producción, 2026-09-06):
 *
 *   [13:23] 💰 $60.000 COP  ¿Te muestro cómo es por dentro? 🎬
 *   [13:23] Entonces te comparto los datos del curso de IA...
 *   [13:23] Son 3 cursos, 52 módulos en video 🤖 ...
 *
 * Tres burbujas en el mismo minuto para una sola idea.
 */
const t = (content: string) => ({ kind: "text", content });
const card = (productId: number) => ({ kind: "card", productId });

describe("Varios textos seguidos son un solo mensaje", () => {
  it("el turno de producción queda en una burbuja", () => {
    const r = unirTextosSeguidos([
      t("💰 $60.000 COP"),
      t("Entonces te comparto los datos del curso de IA"),
      t("Son 3 cursos, 52 módulos en video"),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.content).toBe(
      "💰 $60.000 COP\n\nEntonces te comparto los datos del curso de IA\n\nSon 3 cursos, 52 módulos en video",
    );
  });

  it("se pegan con línea en blanco, no pegados", () => {
    // Sin la línea en blanco quedarían dos frases corridas que se leen como una.
    const r = unirTextosSeguidos([t("Sí, es digital."), t("¿Arrancamos?")]);
    expect(r[0]!.content).toContain("\n\n");
  });

  it("una burbuja vacía no es un mensaje", () => {
    const r = unirTextosSeguidos([t("Hola"), t("   "), t("¿Qué buscas?")]);
    expect(r).toHaveLength(1);
    expect(r[0]!.content).toBe("Hola\n\n¿Qué buscas?");
  });

  it("no repite un pedazo que ya está adentro del anterior", () => {
    // Pasa cuando el supervisor reescribe y deja el original al lado.
    const r = unirTextosSeguidos([t("El curso vale $60.000 y es de por vida"), t("vale $60.000")]);
    expect(r).toHaveLength(1);
    expect(r[0]!.content).toBe("El curso vale $60.000 y es de por vida");
  });
});

describe("Lo que NO se junta", () => {
  it("la foto sigue siendo su propia burbuja", () => {
    // Un mensaje de 30 líneas tapa la pantalla del celular: esa razón sigue
    // valiendo, y por eso la ficha no se absorbe.
    const r = unirTextosSeguidos([t("Mira este:"), card(124), t("¿Te sirve?")]);
    expect(r).toHaveLength(3);
    expect(r.map((x) => x.kind)).toEqual(["text", "card", "text"]);
  });

  it("no reordena: el agente decidió ese orden", () => {
    const r = unirTextosSeguidos([card(1), t("a"), t("b"), card(2)]);
    expect(r.map((x) => x.kind)).toEqual(["card", "text", "card"]);
    expect(r[1]!.content).toBe("a\n\nb");
  });

  it("una lista vacía sigue vacía", () => {
    expect(unirTextosSeguidos([])).toEqual([]);
  });
});

describe("La ficha: pie de foto aparte, el resto junto", () => {
  it("cuatro pedazos quedan en dos mensajes", () => {
    const r = unirElRestoDeLaFicha([
      "🎓 CURSO DE IA 2026",
      "Son 3 cursos y 52 módulos.",
      "🤖 Agentes y automatización.",
      "♾️ Acceso de por vida.",
    ]);
    expect(r).toHaveLength(2);
    expect(r[0]).toBe("🎓 CURSO DE IA 2026");
    expect(r[1]).toBe("Son 3 cursos y 52 módulos.\n\n🤖 Agentes y automatización.\n\n♾️ Acceso de por vida.");
  });

  it("con un solo pedazo no inventa un segundo mensaje", () => {
    expect(unirElRestoDeLaFicha(["🎓 CURSO DE IA"])).toEqual(["🎓 CURSO DE IA"]);
  });

  it("los vacíos no generan burbujas", () => {
    expect(unirElRestoDeLaFicha(["A", "", "  ", "B"])).toEqual(["A", "B"]);
    expect(unirElRestoDeLaFicha([])).toEqual([]);
  });
});
