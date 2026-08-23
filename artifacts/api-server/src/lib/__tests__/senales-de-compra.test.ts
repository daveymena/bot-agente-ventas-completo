import { describe, it, expect } from "vitest";
import { construirPlaybook } from "../sales-playbook";

/**
 * Qué jugada elige el manual de venta ante cada momento de una venta real.
 *
 * El motivo: el 2026-08-23 el panel de producción mostraba 10 conversaciones
 * y 0 tratos ganados. Antes de reescribir prompts hay que saber si el sistema
 * siquiera está RECONOCIENDO los momentos — porque si clasifica mal el turno,
 * le manda al modelo las instrucciones del turno equivocado y da igual lo bien
 * escritas que estén.
 */

const base = {
  historial: [{ role: "customer", content: "hola, vi el curso de piano" }],
  mensajesDelCliente: 3,
  productoEnFoco: "Curso de Piano",
  fichaEnviada: true,
  intencion: "question",
  negocio: null,
};

const jugadaDe = (mensaje: string) => construirPlaybook({ ...base, mensaje });

describe("señales de compra → jugada de cierre", () => {
  // Estas dos ya funcionaban.
  it.each(["lo quiero", "listo, lo llevo"])(
    'cierra con "%s"',
    (mensaje) => {
      expect(jugadaDe(mensaje).jugada).toBe("cierre");
    },
  );

  /**
   * Acá está el agujero. "¿Cómo pago?" es la señal de compra más fuerte que
   * existe: el cliente ya decidió y solo pregunta el medio.
   *
   * quiereComprar() la reconoce ("cómo pago" está en su lista), pero
   * tienePreguntaAbierta() TAMBIÉN da true, porque su lista incluye la
   * palabra suelta "cómo". Y la jugada de cierre exige
   * `cerrando && !preguntaAbierta`, así que no dispara.
   *
   * El resultado es el peor posible: cae en el bloque de pregunta abierta,
   * que le dice al modelo "NO empujes el pago en el mismo mensaje". Justo
   * cuando el cliente está pidiendo pagar.
   */
  it.each([
    "¿cómo pago?",
    "como hago para pagarlo",
    "¿dónde pago?",
    "listo, ¿cómo hago?",
  ])('cierra con "%s" (pregunta el MEDIO de pago, no una duda)', (mensaje) => {
    const r = jugadaDe(mensaje);
    expect(r.jugada).toBe("cierre");
    expect(r.bloque).not.toContain("NO empujes el pago");
  });
});

describe("evasivas → aislar la objeción", () => {
  it.each(["lo voy a pensar y te aviso", "déjame pensarlo"])(
    'aísla con "%s"',
    (mensaje) => {
      expect(jugadaDe(mensaje).jugada).toBe("aislar_objecion");
    },
  );

  /**
   * "Después" está en la lista de evasivas como subcadena suelta, así que
   * cualquier mensaje que la contenga se trata como largas -- incluso cuando
   * el cliente está coordinando la entrega, que es lo contrario de evadir.
   */
  it("no confunde coordinar un horario con dar largas", () => {
    expect(jugadaDe("¿me lo puedes enviar después de las 5?").jugada).not.toBe(
      "aislar_objecion",
    );
  });
});

describe("preguntas genuinas → contestar antes de cerrar", () => {
  it.each(["¿sirve si nunca toqué un piano?", "¿qué incluye?"])(
    'no cierra encima de "%s"',
    (mensaje) => {
      expect(jugadaDe(mensaje).bloque).toContain("NO empujes el pago");
    },
  );
});

/**
 * Medido en producción el 2026-08-23: las 10 conversaciones del panel estaban
 * en warm/discovery/presentation/details y NINGUNA en cierre, con 0 tratos
 * ganados. La causa en el código: `fichaEnviada` y `productoEnFoco` llegaban
 * a construirPlaybook y no se leían en ninguna parte, así que después de
 * mostrar el producto el manual no daba ninguna instrucción de avanzar.
 */
describe("después de mandar la ficha hay que avanzar, no repetir", () => {
  const conFicha = (mensaje: string, historial = base.historial) =>
    construirPlaybook({ ...base, mensaje, historial, fichaEnviada: true });

  it("manda avanzar cuando la ficha ya se envió y el cliente sigue conversando", () => {
    const r = conFicha("ah ok, se ve bien");
    expect(r.jugada).toBe("avanzar_tras_ficha");
    expect(r.bloque).toContain("Mostrar no es vender");
    expect(r.bloque).toContain("CURSO DE PIANO");
  });

  it("si no sabe para qué lo quiere, manda preguntarlo", () => {
    expect(conFicha("ah ok, se ve bien").bloque).toContain(
      "Todavía no sabés para qué lo quiere",
    );
  });

  it("si ya sabe para qué lo quiere, manda proponer el paso siguiente", () => {
    const r = conFicha("ah ok, se ve bien", [
      { role: "customer", content: "quiero aprender para tocar en la iglesia" },
    ]);
    expect(r.bloque).toContain("proponé el paso siguiente");
  });

  it("no pisa el cierre cuando el cliente ya está comprando", () => {
    expect(conFicha("lo quiero").jugada).toBe("cierre");
  });

  it("no pisa la evasiva: ahí la jugada es aislar la duda", () => {
    expect(conFicha("lo voy a pensar").jugada).toBe("aislar_objecion");
  });

  it("no avanza por encima de una pregunta sin responder", () => {
    expect(conFicha("¿sirve si nunca toqué?").jugada).not.toBe("avanzar_tras_ficha");
  });

  it("no se activa si la ficha todavía no salió", () => {
    expect(
      construirPlaybook({ ...base, mensaje: "ah ok", fichaEnviada: false }).jugada,
    ).not.toBe("avanzar_tras_ficha");
  });
});

/**
 * Anti-bloqueo de WhatsApp. Medido el 2026-08-23: las 10 conversaciones de
 * producción abrían con la misma frase, porque el anti-repetición solo miraba
 * la conversación actual y el primer mensaje a cada cliente nuevo no tenía
 * nada que evitar. Muchos contactos distintos recibiendo el mismo texto es la
 * firma del envío masivo -- el admin ya reportó "whatsapp me estaba botando
 * los clientes".
 */
describe("no repetir la apertura con otros clientes", () => {
  it("avisa cuando el negocio ya abrió igual con otra gente", () => {
    const r = construirPlaybook({
      ...base,
      mensaje: "hola, quiero info del curso",
      aperturasDelNegocio: ["Hola Claro con", "Buenísimo que preguntes"],
    });
    expect(r.bloque).toContain("CON OTROS CLIENTES YA ABRISTE ASÍ");
    expect(r.bloque).toContain("Hola Claro con");
    expect(r.bloque).toContain("bloquea el número");
  });

  it("no repite una apertura que ya se listó por la conversación actual", () => {
    const r = construirPlaybook({
      ...base,
      mensaje: "dale",
      historial: [{ role: "agent", content: "¡Hola! Claro, con gusto te cuento." }],
      aperturasDelNegocio: ["Hola Claro con"],
    });
    // Aparece una sola vez, en el bloque de la conversación actual.
    expect(r.bloque).not.toContain("CON OTROS CLIENTES YA ABRISTE ASÍ");
  });

  it("no dice nada si el negocio todavía no tiene historial", () => {
    expect(
      construirPlaybook({ ...base, mensaje: "hola", aperturasDelNegocio: [] }).bloque,
    ).not.toContain("CON OTROS CLIENTES");
  });
});
