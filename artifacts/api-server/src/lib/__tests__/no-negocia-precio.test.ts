import { describe, it, expect } from "vitest";
import { supervisarRespuesta } from "../supervisor";

/**
 * De la ronda 3 de QA (2026-08-27), el único defecto de esa ronda que puede
 * costar plata.
 *
 * El cliente mandó tres cosas en un mensaje:
 *   "me lo dejas en 30 mil? y si no me gusta me devuelves la plata?
 *    y tienes algo físico con envío a Quibdó?"
 *
 * Y el bot contestó:
 *   "Claro que sí 😊 Tienes 7 días de garantía ✅ Si no te convence, te
 *    devolvemos el 100%."
 *
 * Quería contestar lo de la garantía. Pero "Claro que sí" pegado a "me lo
 * dejas en 30 mil" se lee como que le aceptaron el precio. El QA lo confirmó
 * después ("entonces quedamos en 30 mil, cierto?") y el bot NO lo desmintió.
 *
 * Ninguna regla anterior lo agarraba: la de precios inventados mira los montos
 * que escribe el BOT, y acá el monto lo puso el CLIENTE -- el bot solo dijo
 * que sí.
 */

const PIANO = { id: 123, name: "Curso de Piano Completo", price: 60000, kind: "digital" };

const revisar = (respuesta: string, mensajeCliente: string) =>
  supervisarRespuesta({
    respuesta,
    mensajeCliente,
    productos: [PIANO],
    idsEnContexto: [123],
    llevaCard: false,
  });

describe("el bot no negocia el precio", () => {
  it("el caso real: 'Claro que sí' a una rebaja se bloquea", () => {
    const r = revisar(
      "Claro que sí 😊 Tienes 7 días de garantía ✅ Si no te convence, te devolvemos el 100%.",
      "me lo dejas en 30 mil? y si no me gusta me devuelves la plata? y tienes algo fisico con envio a Quibdo?",
    );
    expect(r.bloquear).toBe(true);
    expect(r.hallazgos.map((h) => h.regla)).toContain("descuento-aceptado");
    // Y lo que sale en su lugar dice el precio real, no un "déjame verificar".
    expect(r.reemplazoSugerido).toMatch(/60\.000/);
    expect(r.reemplazoSugerido).toMatch(/fijo|no manejo descuentos/i);
  });

  it("agarra las formas en que se pide rebaja", () => {
    for (const m of [
      "me lo dejas en 30 mil",
      "hay descuento?",
      "me haces una rebaja?",
      "en cuanto me lo dejas",
      "no tienes algo mas barato",
      "me lo das en 40?",
      "cual es el ultimo precio",
    ]) {
      expect(revisar("Claro, dale 😊", m).bloquear, m).toBe(true);
    }
  });

  it("tampoco pasa una respuesta que esquiva el precio", () => {
    // No abre afirmando, pero tampoco dice cuánto vale: el cliente completa
    // el hueco solo, y lo completa a su favor.
    const r = revisar("Déjame consultarlo con el equipo y te confirmo 🙏", "me lo dejas en 30 mil?");
    expect(r.bloquear).toBe(true);
  });

  it("SÍ deja pasar la respuesta que sostiene el precio", () => {
    const r = revisar(
      "El precio es $60.000 y es fijo 🙏 No manejo descuentos, pero es pago único.",
      "me lo dejas en 30 mil?",
    );
    expect(r.bloquear).toBe(false);
    expect(r.hallazgos.map((h) => h.regla)).not.toContain("descuento-aceptado");
  });

  it("una conversación normal no se toca", () => {
    // Sin pedido de rebaja, un "Claro que sí" es perfectamente válido.
    const r = revisar("Claro que sí 😊 Tienes 7 días de garantía.", "tiene garantia?");
    expect(r.bloquear).toBe(false);
  });

  it("preguntar el precio NO es pedir rebaja", () => {
    const r = revisar("Son $60.000, pago único.", "cuanto vale?");
    expect(r.hallazgos.map((h) => h.regla)).not.toContain("descuento-aceptado");
  });
});

/**
 * Ronda 4 (2026-08-27): el MISMO mensaje de la ronda 3 volvió a fallar igual,
 * con R10 ya escrita y desplegada.
 *
 * La regla nunca se ejecutó: `agent.ts` se saltaba el supervisor entero cuando
 * contestaba la base de conocimiento (`if (respondidoDeConocimiento) continue`).
 * El razonamiento era correcto a medias -- la RESPUESTA está verificada -- pero
 * la apertura "Claro que sí" no sale del conocimiento, la elige `aperturaPara`.
 *
 * Una regla que existe y no corre es peor que no tenerla: da por cerrado un
 * defecto que sigue abierto.
 */
describe("una respuesta verificada también se revisa por pertinencia", () => {
  const PIANO2 = { id: 123, name: "Curso de Piano Completo", price: 60000, kind: "digital" };

  it("el caso de la ronda 4: apertura afirmativa sobre una respuesta del conocimiento", () => {
    const r = supervisarRespuesta({
      respuesta: "Claro que sí 😊 Tienes 7 días de garantía ✅ Si no te convence, te devolvemos el 100%.",
      respuestaVerificada: true,
      mensajeCliente: "me lo dejas en 30 mil? y si no me gusta me devuelves la plata?",
      productos: [PIANO2],
      idsEnContexto: [123],
      llevaCard: false,
    });
    expect(r.bloquear).toBe(true);
    expect(r.hallazgos.map((h) => h.regla)).toContain("descuento-aceptado");
  });

  it("pero NO se le revisa la veracidad: el texto del negocio se respeta", () => {
    // Un precio dentro de una respuesta verificada no se toca: lo escribió el
    // negocio, no el modelo.
    const r = supervisarRespuesta({
      respuesta: "El curso vale $60.000 y tiene 7 días de garantía.",
      respuestaVerificada: true,
      mensajeCliente: "cuanto vale y que garantia tiene?",
      productos: [PIANO2],
      idsEnContexto: [123],
      llevaCard: false,
    });
    expect(r.bloquear).toBe(false);
    expect(r.texto).toMatch(/60\.000/);
  });
});
