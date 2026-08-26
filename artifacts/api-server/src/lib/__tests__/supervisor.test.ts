import { describe, it, expect } from "vitest";
import { supervisarRespuesta, esPregunta, necesitaCriterio } from "../supervisor";

/**
 * Todos los casos de abajo son TEXTOS REALES de produccion, con el numero de
 * mensaje al lado para poder volver a la conversacion y verificarlos:
 *   - conversacion 1  (pruebas del usuario, 16-25 ago 2026)
 *   - conversacion 19 (Leonel, cliente real perdido el 25 ago 2026)
 */
const CATALOGO = [
  { id: 123, name: "Curso de Piano Completo", price: 20000, kind: "digital" },
  { id: 200, name: "Curso de Excel", price: 20000, kind: "digital" },
  { id: 201, name: "PACK IDIOMAS", price: 20000, kind: "digital" },
  { id: 115, name: "Curso de Diseño Gráfico", price: 20000, kind: "digital" },
  { id: 202, name: "Pack Programación", price: 60000, kind: "digital" },
  { id: 128, name: "Renovador Negro Perfecto x 200ml", price: 33000, kind: "physical" },
];

const rev = (respuesta: string, mensajeCliente: string, idsEnContexto: number[] = []) =>
  supervisarRespuesta({ respuesta, mensajeCliente, productos: CATALOGO, idsEnContexto });

// ─── R1 · precios ────────────────────────────────────────────────────────────

describe("R1 · ningún monto sale si no es de un producto real", () => {
  it("bloquea el combo de $85.000 que no existe (msg 264)", () => {
    const r = rev("El combo de los 3 está a $85.000 COP y ahí sí te llegan Piano + Excel + Idiomas.", "pasame el link del combo");
    expect(r.hallazgos.map((h) => h.regla)).toContain("precio-inventado");
    expect(r.texto).not.toContain("85.000");
  });

  it("bloquea cotizar Excel a $45.000 cuando vale $20.000 (msg 258)", () => {
    const r = rev("Curso de Excel: $45.000 COP", "cuanto vale excel", [200]);
    expect(r.texto).not.toContain("45.000");
  });

  it("deja pasar el precio correcto", () => {
    const t = "El curso de Excel tiene un valor de $20.000, pago único.";
    expect(rev(t, "cuanto vale excel", [200]).texto).toBe(t);
  });
});

// ─── R2 · producto cruzado ───────────────────────────────────────────────────

describe("R2 · no responde sobre un producto que nadie pidió", () => {
  it("pide idiomas y le contestan piano (msg 12 -> 13)", () => {
    const r = rev("El curso de piano completo desde cero a nivel avanzado es el que buscás.", "Me interesa el curso de idiomas");
    expect(r.bloquear).toBe(true);
    expect(r.hallazgos.map((h) => h.regla)).toContain("producto-cruzado");
  });

  it("con Diseño Gráfico en contexto le hablan de Excel (msg 101 -> 102)", () => {
    const r = rev(
      "El curso de Excel te lleva desde lo básico hasta un nivel avanzado: fórmulas, tablas dinámicas y macros.",
      "Que trae el producto que contenido ?",
      [115],
    );
    expect(r.bloquear).toBe(true);
  });

  it("dice que sí al Pack Idiomas y recibe la ficha de piano (msg 85 -> 86)", () => {
    const r = rev("Te dejo la ficha del Curso de Piano Completo para que lo tengas a la mano.", "Si", [201]);
    expect(r.bloquear).toBe(true);
  });

  it("NO molesta cuando responde del producto correcto", () => {
    const r = rev("El curso de piano es desde cero, no necesitás experiencia previa.", "info del curso de piano", [123]);
    expect(r.bloquear).toBe(false);
  });

  it("NO molesta al enumerar el catálogo (msg 134)", () => {
    const r = rev(
      "Tenemos: Piano Completo, Diseño Gráfico, Excel y Pack Programación. ¿Alguno te llama la atención?",
      "Que cursos tienes disponibles?",
    );
    expect(r.bloquear).toBe(false);
  });

  it("NO molesta si nombra otro producto de paso pero habla del correcto", () => {
    const r = rev("A diferencia del de piano, el de Excel es más práctico para tu trabajo.", "cuentame del de excel", [200]);
    expect(r.bloquear).toBe(false);
  });
});

// ─── R3 · preguntas sin responder ────────────────────────────────────────────

describe("R3 · si preguntaron algo, no se contesta con una fórmula", () => {
  it("reconoce preguntas con y sin signo", () => {
    expect(esPregunta("Donde es la academia.")).toBe(true);
    expect(esPregunta("¿Tiene garantía?")).toBe(true);
    expect(esPregunta("cuanto cuesta")).toBe(true);
    expect(esPregunta("listo lo quiero")).toBe(false);
  });

  it("bloquea la despedida que le costó el cliente a este negocio (msg 241 -> 242)", () => {
    const r = rev("¡Fue un placer atenderte! 😊 Cualquier duda, aquí estoy 🌟", "Donde es la academia.\nGracias.");
    expect(r.bloquear).toBe(true);
    expect(r.hallazgos.map((h) => h.regla)).toContain("pregunta-sin-responder");
  });

  it("no molesta si la despedida responde a una despedida", () => {
    const r = rev("¡Fue un placer atenderte! Cualquier duda, aquí estoy 🌟", "Gracias por ahora no.");
    expect(r.bloquear).toBe(false);
  });

  it("no molesta si la pregunta SÍ se contesta", () => {
    const r = rev("La academia es 100% online: los videos quedan en tu cuenta y los ves cuando quieras.", "Donde es la academia?");
    expect(r.bloquear).toBe(false);
  });
});

// ─── R4 · verificación de pago inventada ─────────────────────────────────────

describe("R4 · no promete una verificación que nadie hace", () => {
  it("corrige el 'apenas el sistema confirme' con Nequi (msg 145 -> 146)", () => {
    const r = rev("🙌 Apenas el sistema confirme el pago, te llega el acceso al curso.", "ya hice la transferencia por Nequi, ya pague");
    expect(r.hallazgos.map((h) => h.regla)).toContain("verificacion-inventada");
    expect(r.texto).not.toMatch(/sistema\s+confirme/i);
    expect(r.texto).toMatch(/comprobante/i);
  });

  it("corrige 'apenas el sistema lo verifique' (msg 147 -> 148)", () => {
    const r = rev("La confirmación tarda unos minutos, apenas el sistema lo verifique te llega el acceso.", "te puedo enviar el comprobante?");
    expect(r.texto).not.toMatch(/sistema\s+lo\s+verifique/i);
  });

  it("no toca el texto si el pago es por pasarela", () => {
    const t = "Apenas el sistema confirme el pago con tarjeta, te llega el acceso.";
    expect(rev(t, "pago con tarjeta por el link").texto).toBe(t);
  });
});

// ─── Escalamiento ────────────────────────────────────────────────────────────

describe("cuándo escalar a un crítico con IA", () => {
  it("escala siempre que algo quede bloqueado", () => {
    const e = { respuesta: "¡Fue un placer atenderte!", mensajeCliente: "Donde es la academia?", productos: CATALOGO, idsEnContexto: [] };
    expect(necesitaCriterio(e, supervisarRespuesta(e))).toBe(true);
  });

  it("escala si contestan una pregunta con cuatro palabras", () => {
    const e = { respuesta: "Sí, claro que sí.", mensajeCliente: "¿Qué incluye el curso?", productos: CATALOGO, idsEnContexto: [123] };
    expect(necesitaCriterio(e, supervisarRespuesta(e))).toBe(true);
  });

  it("no escala una respuesta normal, para no pagar latencia de más", () => {
    const e = {
      respuesta: "El curso de piano incluye 19 módulos en video, desde ejercicios básicos hasta cinco valses completos.",
      mensajeCliente: "¿Qué incluye el curso de piano?",
      productos: CATALOGO,
      idsEnContexto: [123],
    };
    expect(necesitaCriterio(e, supervisarRespuesta(e))).toBe(false);
  });
});

// ─── R5 · entregar contra la palabra del cliente ─────────────────────────────

describe("R5 · no entrega el acceso porque el cliente diga que pagó", () => {
  it("bloquea la entrega sin comprobante (banco de pruebas E2)", () => {
    const r = rev(
      "Entendido, ya hiciste el pago por Nequi. Te lo paso por Google Drive. ¿Me confirmás el número al que querés recibir el enlace?",
      "ya te pagué, mandame el acceso",
      [123],
    );
    expect(r.bloquear).toBe(true);
    expect(r.hallazgos.map((h) => h.regla)).toContain("entrega-sin-verificar");
    expect(r.reemplazoSugerido).toMatch(/comprobante/i);
  });

  it("una promesa CONDICIONADA sí puede salir", () => {
    const r = rev(
      "¡Genial! Apenas confirmemos el pago te mando el acceso al curso 🙌",
      "ya hice la transferencia",
      [123],
    );
    expect(r.bloquear).toBe(false);
  });

  it("pedir el comprobante es la respuesta correcta y no se bloquea", () => {
    const r = rev(
      "¡Gracias! Mandame el comprobante por acá y te lo activo enseguida.",
      "ya pagué",
      [123],
    );
    expect(r.bloquear).toBe(false);
  });

  it("no molesta si el cliente no dijo que pagó", () => {
    const r = rev("Te lo paso por Google Drive apenas se confirme.", "cómo lo recibo?", [123]);
    expect(r.hallazgos.map((h) => h.regla)).not.toContain("entrega-sin-verificar");
  });
});
