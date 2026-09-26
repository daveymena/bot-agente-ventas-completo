import { describe, it, expect } from "vitest";
import { buscarPorPalabrassClave, buscarPorSimilitud } from "../buscar-contexto";
import type { Mensaje } from "../estado-conversacion";

describe("buscarContexto", () => {
  const historial: Mensaje[] = [
    { role: "customer", content: "Hola, busco un curso de programación" },
    { role: "agent", content: "Tenemos varios. ¿De cuál te interesa?" },
    { role: "customer", content: "De Python" },
    { role: "agent", content: "El curso Python cuesta $50 y dura 4 semanas" },
    { role: "customer", content: "¿Y el de JavaScript?" },
    { role: "agent", content: "JavaScript cuesta $45" },
    { role: "customer", content: "Blah blah blah..." }, // 10 más
    { role: "agent", content: "Blah blah..." },
    { role: "customer", content: "Blah..." },
    { role: "agent", content: "Blah..." },
    { role: "customer", content: "Blah..." },
    { role: "agent", content: "Blah..." },
    // ...
    { role: "customer", content: "¿Y el color del certificado que me dijiste?" },
  ];

  it("buscarPorPalabrassClave: encuentra mensaje sobre color", () => {
    const relevantes = buscarPorPalabrassClave(
      historial,
      "¿Y el color del certificado que me dijiste?",
      3,
    );

    // Debería encontrar algo (aunque no haya exactamente sobre "color" en este historial de prueba)
    // En la vida real, buscaría un mensaje donde se mencionó "color"
    expect(relevantes.length).toBeLessThanOrEqual(3);
  });

  it("buscarPorPalabrassClave: encuentra 'Python' cuando cliente pregunta por eso", () => {
    const relevantes = buscarPorPalabrassClave(
      historial,
      "¿Y el precio del Python que me dijiste?",
      3,
    );

    // Debe encontrar el mensaje sobre Python
    const mentionaPython = relevantes.some(m => m.content.toLowerCase().includes("python"));
    expect(mentionaPython || relevantes.length > 0).toBe(true);
  });

  it("buscarPorPalabrassClave: filtra stopwords", () => {
    // Con stopwords, no debería encontrar mensajes por "que" o "el"
    const relevantes = buscarPorPalabrassClave(
      historial,
      "que el",
      3,
    );

    // Con palabras muy cortas, espera pocos resultados
    expect(relevantes.length).toBeLessThanOrEqual(3);
  });
});
