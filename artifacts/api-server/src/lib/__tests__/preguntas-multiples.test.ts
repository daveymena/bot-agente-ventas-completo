import { describe, it, expect } from "vitest";
import { preguntasSueltas, preguntaSinResponder } from "../estado-cognitivo";
import { supervisarRespuesta } from "../supervisor";

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
