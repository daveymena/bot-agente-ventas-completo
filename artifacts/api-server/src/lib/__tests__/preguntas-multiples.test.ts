import { describe, it, expect } from "vitest";
import { preguntasSueltas, preguntaSinResponder } from "../estado-cognitivo";
import { supervisarRespuesta } from "../supervisor";
import { buildContextBlock } from "../conversation-engine";

/**
 * Ronda 3 de QA (2026-08-27), defecto S3: de cinco preguntas repartidas en dos
 * mensajes, el bot contestó UNA. Las otras cuatro no las contestó ni dijo que
 * no las iba a contestar -- desaparecieron.
 *
 * Para el cliente es peor que un "no sé": preguntó por el envío a Quibdó dos
 * veces y las dos veces se hizo el desentendido.
 *
 * Y no se detectaba, porque el chequeo miraba el mensaje ENTERO como si fuera
 * una sola pregunta: con que la respuesta tocara una palabra de cualquiera de
 * las tres, lo daba por contestado.
 */

const EL_MENSAJE_REAL =
  "me lo dejas en 30 mil? y si no me gusta me devuelves la plata? y tienes algo fisico con envio a Quibdo?";

describe("un mensaje puede traer varias preguntas", () => {
  it("separa las tres del caso real", () => {
    const qs = preguntasSueltas(EL_MENSAJE_REAL);
    expect(qs).toHaveLength(3);
    expect(qs[0]).toMatch(/30 mil/);
    expect(qs[1]).toMatch(/devuelves la plata/);
    expect(qs[2]).toMatch(/Quibdo/i);
  });

  it("una sola pregunta sigue siendo una", () => {
    expect(preguntasSueltas("cuanto vale el curso de piano?")).toHaveLength(1);
  });

  it("las coletillas no cuentan como pregunta", () => {
    // "no?" y "y?" son muletillas, no preguntas que haya que contestar.
    expect(preguntasSueltas("me sirve para aprender desde cero? no?")).toHaveLength(1);
  });

  it("un mensaje sin signos no se parte a la fuerza", () => {
    expect(preguntasSueltas("hola buenas tardes")).toHaveLength(1);
  });
});

describe("contestar una de tres cuenta como pregunta sin responder", () => {
  it("el caso real: contesta la garantía y calla las otras dos", () => {
    const pendiente = preguntaSinResponder([
      { role: "customer", content: EL_MENSAJE_REAL },
      { role: "agent", content: "Tienes 7 días de garantía. Si no te convence, te devolvemos el 100%." },
    ] as any);
    // La de la garantía SÍ la contestó; lo que devuelve es una de las otras.
    expect(pendiente).not.toBeNull();
    expect(pendiente).not.toMatch(/devuelves la plata/);
  });

  it("si las contesta todas, no marca nada", () => {
    const pendiente = preguntaSinResponder([
      { role: "customer", content: "cuanto vale? y tiene garantia?" },
      { role: "agent", content: "Vale $60.000 y tiene garantía de 7 días." },
    ] as any);
    expect(pendiente).toBeNull();
  });
});

describe("lo que quedó pendiente se dice, no se descarta en silencio", () => {
  const PIANO = { id: 123, name: "Curso de Piano Completo", price: 60000, kind: "digital" };

  it("agrega una línea nombrando la pregunta que no contestó", () => {
    const r = supervisarRespuesta({
      respuesta: "Tienes 7 días de garantía y te devolvemos el 100% si no te convence.",
      mensajeCliente: "tiene garantia? y hacen envios a Quibdo?",
      productos: [PIANO],
      idsEnContexto: [123],
      llevaCard: false,
    });
    expect(r.hallazgos.map((h) => h.regla)).toContain("pregunta-a-medias");
    expect(r.texto).toMatch(/Quibdo/i);
    // Y lo que sí contestó se conserva: no se tira lo bueno.
    expect(r.texto).toMatch(/7 d[ií]as de garant[ií]a/);
  });

  it("si contestó las dos, no agrega nada", () => {
    const r = supervisarRespuesta({
      respuesta: "Tiene garantía de 7 días, y sí hacemos envíos a Quibdó.",
      mensajeCliente: "tiene garantia? y hacen envios a Quibdo?",
      productos: [PIANO],
      idsEnContexto: [123],
      llevaCard: false,
    });
    expect(r.hallazgos.map((h) => h.regla)).not.toContain("pregunta-a-medias");
  });

  it("con una sola pregunta no se mete", () => {
    const r = supervisarRespuesta({
      respuesta: "Son $60.000, pago único.",
      mensajeCliente: "cuanto vale?",
      productos: [PIANO],
      idsEnContexto: [123],
      llevaCard: false,
    });
    expect(r.hallazgos.map((h) => h.regla)).not.toContain("pregunta-a-medias");
  });
});

/**
 * Lo que faltaba: la mitad TEMPRANA, y el cliente que no usa signos.
 *
 * Todo lo de arriba es el parche tardío -- R11 detecta después lo que quedó sin
 * contestar y agrega "y sobre lo otro...". Nunca se le avisaba al modelo ANTES
 * de escribir, así que el bot seguía eligiendo una pregunta y descartando el
 * resto; el parche solo tapaba el hueco.
 *
 * Y había un cliente que ni siquiera llegaba al parche: el que pregunta dos
 * cosas en un renglón, sin signos. `preguntasSueltas` corta por "?", así que
 * devolvía un solo pedazo y para todo el sistema era una sola pregunta.
 *
 * Ese es el caso que costó un lead PAGO: Mauricio escribió "quiero saber la
 * metodología y el precio", lo repitió TRES veces y no recibió ninguna de las
 * dos.
 */
describe("el cliente que pregunta dos cosas sin signos de interrogación", () => {
  it("el caso de Mauricio, que antes contaba como una sola pregunta", () => {
    expect(preguntasSueltas("quiero saber la metodología y el precio")).toEqual([
      "el precio",
      "la metodología",
    ]);
  });

  it("los signos siguen mandando cuando están", () => {
    // El corte por "?" es más fiel que una etiqueta: dice lo que el cliente
    // escribió. Los temas son solo el respaldo para cuando no hay signos.
    const qs = preguntasSueltas(EL_MENSAJE_REAL);
    expect(qs).toHaveLength(3);
    expect(qs[0]).toMatch(/30 mil/);
  });

  it("un solo tema no convierte el mensaje en múltiple", () => {
    for (const t of ["cuanto vale?", "que garantia tiene", "hola buenas tardes"]) {
      expect(preguntasSueltas(t).length, t).toBeLessThanOrEqual(1);
    }
  });
});

describe("y el modelo lo ve ANTES de escribir, no después", () => {
  const memoriaVacia = {
    conversationId: 1, contactName: "Mauricio", contactPhone: "573000000001",
    history: [], stage: "greeting", currentProductId: null, sentProductIds: new Set<number>(),
    paymentStatus: null, paymentMethod: null, paymentAmount: null, paidAt: null,
  } as any;

  it("el prompt lista las preguntas numeradas", () => {
    const ctx = buildContextBlock(
      memoriaVacia, "details_query" as any, "greeting" as any, null, false, null, false,
      "quiero saber la metodología y el precio",
    );
    expect(ctx).toContain("1. el precio");
    expect(ctx).toContain("2. la metodología");
    expect(ctx).toMatch(/Respóndelas TODAS/);
  });

  it("con una sola pregunta el bloque no aparece", () => {
    // Ocupa lugar en el prompt, y el prompt de este proyecto ya no entra en el
    // tope por minuto de Groq. Solo cuando hace falta.
    const ctx = buildContextBlock(
      memoriaVacia, "details_query" as any, "greeting" as any, null, false, null, false,
      "cuánto vale el curso de piano?",
    );
    expect(ctx).not.toContain("EN UN SOLO MENSAJE");
  });
});
