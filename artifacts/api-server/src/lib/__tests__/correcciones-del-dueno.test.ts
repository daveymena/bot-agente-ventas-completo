import { describe, it, expect } from "vitest";
import { agregarIndicacion, quitarIndicacion, renglonesDeIndicaciones, disparadoresDe } from "../correcciones-del-dueno";

describe("correcciones del dueño — indicaciones", () => {
  it("suma la corrección como un renglón nuevo sin tocar las que había", () => {
    const antes = "Habla de tú.\nSé breve.";
    expect(agregarIndicacion(antes, "No uses más de 2 emojis")).toBe("- Habla de tú.\n- Sé breve.\n- No uses más de 2 emojis");
  });

  it("no repite una indicación que ya estaba", () => {
    expect(renglonesDeIndicaciones(agregarIndicacion("- Sé breve.", "sé breve."))).toEqual(["Sé breve."]);
  });

  it("deshacer quita solo el renglón elegido", () => {
    expect(quitarIndicacion("- A\n- B\n- C", 1)).toBe("- A\n- C");
  });
});

describe("correcciones del dueño — disparadores del dato", () => {
  it("salen del mensaje del cliente, sin tildes ni palabras cortas", () => {
    expect(disparadoresDe("¿El envío a Medellín tiene costo?")).toEqual(["envio", "medellin", "costo"]);
  });

  it("un mensaje de puras palabras cortas no da disparadores (no se guarda algo que coincide con todo)", () => {
    expect(disparadoresDe("y eso?")).toEqual([]);
  });
});

describe("correcciones del dueño — el tema que se guarda", () => {
  it("se queda con la pregunta, no con el saludo que venía antes", async () => {
    const { temaDeLaPregunta } = await import("../correcciones-del-dueno");
    expect(temaDeLaPregunta("Hola, me interesa el curso de bicicletas. ¿Tiene certificado?")).toBe("Tiene certificado");
    expect(temaDeLaPregunta("Pero entonces, ¿me dan certificado al terminar?")).toBe("me dan certificado al terminar");
    expect(temaDeLaPregunta("quiero saber el horario")).toBe("quiero saber el horario");
  });

  it("los disparadores no traen palabras que aparecen en cualquier pregunta", () => {
    expect(disparadoresDe("Tiene certificado")).toEqual(["certificado"]);
  });
});
