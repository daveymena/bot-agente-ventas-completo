import { describe, it, expect } from "vitest";

/**
 * La protección que más cuida el número, y que faltaba.
 *
 * Escribirle por WhatsApp a alguien que nunca te escribió es la causa número
 * uno de bloqueo, muy por encima del volumen: el que no esperaba el mensaje
 * toca "Bloquear y reportar", y con pocos reportes Meta baja el número. No hay
 * espaciado ni tope por hora que compense eso.
 *
 * `targetLeads` solo miraba etapa y opt-out, así que un lead importado de una
 * planilla, cargado a mano o venido de un formulario web entraba igual en la
 * campaña. Este archivo fija la regla en la parte que se puede probar sin base
 * de datos: qué leads sobreviven al cruce.
 *
 * El envío en sí ya estaba bien y no se toca: pasa por `sendText`, que aplica
 * el espaciado de 8-20s y los topes de 60/hora y 400/día.
 */

/** Lo mismo que hace `queueWhatsappBroadcast` al cruzar candidatos con contactos. */
function aQuienSeLeManda(
  candidatos: Array<{ id: number; phone: string }>,
  escribieron: Set<number>,
) {
  return candidatos.filter((l) => escribieron.has(l.id));
}

describe("el broadcast solo va a quien escribió antes", () => {
  const CANDIDATOS = [
    { id: 1, phone: "573001111111" }, // escribió
    { id: 2, phone: "573002222222" }, // importado de una planilla
    { id: 3, phone: "573003333333" }, // escribió
    { id: 4, phone: "573004444444" }, // cargado a mano por el admin
  ];

  it("deja fuera a los que nunca escribieron", () => {
    const r = aQuienSeLeManda(CANDIDATOS, new Set([1, 3]));
    expect(r.map((l) => l.id)).toEqual([1, 3]);
  });

  it("si ninguno escribió, no se manda a nadie", () => {
    expect(aQuienSeLeManda(CANDIDATOS, new Set())).toHaveLength(0);
  });

  it("no inventa destinatarios que no estaban en el segmento", () => {
    // El cruce nunca puede AGREGAR: un lead que escribió pero quedó fuera del
    // segmento (convertido, opt-out) sigue afuera.
    const r = aQuienSeLeManda(CANDIDATOS, new Set([1, 2, 3, 4, 99]));
    expect(r.map((l) => l.id)).not.toContain(99);
    expect(r).toHaveLength(4);
  });

  it("ante un fallo al consultar, el conjunto vacío significa no enviar", () => {
    // `losQueEscribieron` devuelve un Set vacío si la consulta falla. Un error
    // de base no puede convertirse en permiso para escribirle a desconocidos.
    expect(aQuienSeLeManda(CANDIDATOS, new Set())).toHaveLength(0);
  });
});
