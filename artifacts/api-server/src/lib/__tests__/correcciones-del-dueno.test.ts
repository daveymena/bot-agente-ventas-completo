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

describe("correcciones del dueño — a dónde va cada corrección", () => {
  it("una regla de cómo vender (lo que escribió el dueño en producción) va como regla", async () => {
    const { leerClasificacion } = await import("../correcciones-del-dueno");
    const r = leerClasificacion({ tipo: "forma", texto: "No vuelvas a ofrecer el video si ya se lo enviaste." }, "No debe enviar video ya lo envío");
    expect(r).toEqual({ tipo: "forma", texto: "No vuelvas a ofrecer el video si ya se lo enviaste." });
  });

  it("un dato sin tema no se guarda como dato (no se sabría cuándo decirlo): queda como regla", async () => {
    const { leerClasificacion } = await import("../correcciones-del-dueno");
    expect(leerClasificacion({ tipo: "dato", texto: "30 días" }, "tiene garantía de 30 días").tipo).toBe("forma");
  });

  it("si el modelo no responde algo legible, queda como regla con el texto del dueño", async () => {
    const { leerClasificacion } = await import("../correcciones-del-dueno");
    expect(leerClasificacion(null, "Primero el precio y después la pregunta")).toEqual({ tipo: "forma", texto: "Primero el precio y después la pregunta" });
  });

  it("un dato con tema va como dato", async () => {
    const { leerClasificacion } = await import("../correcciones-del-dueno");
    expect(leerClasificacion({ tipo: "dato", pregunta: "Tiene garantía", texto: "Sí, 30 días por defectos de fábrica." }, "x"))
      .toEqual({ tipo: "dato", pregunta: "Tiene garantía", texto: "Sí, 30 días por defectos de fábrica." });
  });
});

describe("correcciones del dueño — editar sin salirse de los parámetros", () => {
  it("editarDato rechaza id inválido y texto vacío sin tocar la base", async () => {
    const { editarDato } = await import("../correcciones-del-dueno");
    expect(await editarDato(1, 0, "algo")).toEqual({ ok: false, mensaje: "id inválido" });
    expect(await editarDato(1, 5, "   ")).toEqual({ ok: false, mensaje: "Escribe qué debe responder." });
    expect(await editarDato(1, 5, "x".repeat(501))).toEqual({ ok: false, mensaje: "La respuesta es muy larga (máximo 500 caracteres)." });
  });

  it("editarIndicacion rechaza índice inválido y texto vacío sin tocar la base", async () => {
    const { editarIndicacion } = await import("../correcciones-del-dueno");
    expect(await editarIndicacion(1, -1, "algo")).toEqual({ ok: false, mensaje: "índice inválido" });
    expect(await editarIndicacion(1, 0, "   ")).toEqual({ ok: false, mensaje: "Escribe cómo debe hablar el vendedor." });
    expect(await editarIndicacion(1, 0, "x".repeat(501))).toEqual({ ok: false, mensaje: "La indicación es muy larga (máximo 500 caracteres)." });
  });

  it("la firma de la presentación cambia cuando cambia una indicación (Corregir sí mueve la ficha)", async () => {
    const { firmaDePresentacion } = await import("../presentacion-de-producto");
    const p = { name: "Licuadora", description: "Potente", features: ["1L"] };
    const a = firmaDePresentacion(p, ["Sé breve."]);
    const b = firmaDePresentacion(p, ["Sé breve.", "Separa los renglones."]);
    expect(a).not.toBe(b);
  });

  it("la IA no puede colar precio ni envío en la presentación (lo pone el sistema)", async () => {
    const { leerPresentacion } = await import("../presentacion-de-producto");
    expect(leerPresentacion(JSON.stringify({ gancho: "Te cuesta $ 60.000 solo hoy, aprovecha", beneficios: ["A", "B", "C"] }))).toBeNull();
    const ok = leerPresentacion(JSON.stringify({
      gancho: "Si se te riega el jugo cada mañana, esta licuadora te deja todo listo sin reguero",
      beneficios: ["Preparas jugos sin reguero en las mañanas", "Lavas menos trastes después de cocinar", "La guardas fácil en cocinas pequeñas"],
    }));
    expect(ok?.beneficios).toHaveLength(3);
  });

  it("la ficha editable sale en 3 burbujas separadas", async () => {
    const { burbujasDePresentacion } = await import("../presentacion-de-producto");
    const b = burbujasDePresentacion(
      { gancho: "gancho de prueba para ver el formato", beneficios: ["uno", "dos", "tres"] },
      { nombre: "Licuadora", emoji: "🥤", precio: "$ 60.000 COP", envio: "Envío gratis. Llega en 3 días.", pago: "Pagas al recibir", tallas: null, conCierre: true },
    );
    expect(b).toHaveLength(3);
    expect(b[2]).toContain("$ 60.000 COP");
  });
});
