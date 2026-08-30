import { describe, it, expect } from "vitest";
import { defenderElPrecio } from "../precio-verificado";
import { supervisarRespuesta } from "../supervisor";

/**
 * El precio no se rebaja: se defiende.
 *
 * El admin lo planteó así, y es doctrina de venta correcta: "el precio no
 * tiene rebaja, no es negociable. Solo debe mostrar POR QUÉ debería comprarlo
 * y por qué es una gran oportunidad. Si rebajas, le pierde el valor al precio
 * y a todo".
 *
 * Lo que contestaba antes:
 *
 *   "El precio es $60.000 y es fijo 🙏 No manejo descuentos, pero es pago
 *    único y el acceso te queda de por vida."
 *
 * Niega DOS veces y no da una sola razón para comprarlo. Al que pide rebaja no
 * lo convence un "no": lo convence ver que lo vale.
 */
const CURSO = {
  id: 124,
  name: "IA 2026",
  price: "60000.00",
  currency: "COP",
  features: ["3 cursos en uno", "n8n sin código", "Claude Code y Design"],
} as any;

describe("Defender el precio en vez de negarlo", () => {
  it("dice el precio UNA vez y da una razón real para pagarlo", () => {
    const t = defenderElPrecio(CURSO);
    expect(t).toContain("$60.000 COP");
    // La razón sale de las características REALES, no de un adjetivo.
    expect(t).toContain("3 cursos en uno");
    expect(t).toMatch(/valga lo que cuesta/);
  });

  it("no se disculpa ni niega dos veces", () => {
    const t = defenderElPrecio(CURSO);
    expect(t).not.toMatch(/no manejo descuentos/i);
    expect(t).not.toMatch(/lo siento|disculp/i);
  });

  it("NO inventa lo que cobran otros", () => {
    // El sistema no sabe qué cobra la competencia, y el detector de invenciones
    // ya rechaza esas frases. Compararse con un precio inventado es la mentira
    // más fácil de desmentir.
    const t = defenderElPrecio(CURSO);
    expect(t).not.toMatch(/otros?\s|competencia|en otro lado|academia/i);
  });

  it("sin características cargadas sostiene el precio igual, sin adornarlo", () => {
    const t = defenderElPrecio({ name: "X", price: 60000, currency: "COP" });
    expect(t).toContain("$60.000 COP");
    expect(t).toMatch(/el mismo para todos/);
  });
});

describe("Y el supervisor lo usa cuando le piden rebaja", () => {
  it("bloquea el 'claro que sí' y responde defendiendo", () => {
    const r = supervisarRespuesta({
      respuesta: "¡Claro que sí! Te lo dejo en 30 mil 😊",
      mensajeCliente: "me lo dejas en 30 mil?",
      productos: [CURSO],
      idsEnContexto: [124],
      llevaCard: false,
    });
    expect(r.bloquear).toBe(true);
    expect(r.hallazgos.map((h) => h.regla)).toContain("descuento-aceptado");
    expect(r.reemplazoSugerido).toContain("$60.000 COP");
    expect(r.reemplazoSugerido).toMatch(/3 cursos en uno/);
  });
});
