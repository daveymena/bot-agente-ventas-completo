import { describe, it, expect } from "vitest";
import { proximoPaso, pideUnDato, elAgenteYaPregunto, necesidadDeclarada } from "../embudo";
import type { MensajeHist } from "../estado-cognitivo";

/**
 * El embudo.
 *
 * Estas pruebas cuidan las DOS puntas, porque el error de este arreglo tiene
 * dos formas y la segunda es peor que la primera:
 *
 *   · vender demasiado rápido  -- el defecto que se está corrigiendo: el
 *     cliente dice "me interesa" y recibe ficha, precio y medios de pago;
 *   · no vender nunca          -- la sobrecorrección: preguntar en cada turno
 *     y no llegar jamás al precio. Ese error no se ve en una prueba de
 *     "¿calificó?" y hace perder ventas de verdad.
 */

const cliente = (content: string): MensajeHist => ({ role: "customer", content });
const bot = (content: string): MensajeHist => ({ role: "assistant", content });

describe("contestar va antes que vender", () => {
  it("una pregunta sin responder gana a todo lo demás", () => {
    const p = proximoPaso({
      etapa: "interesado",
      historial: [cliente("hola"), bot("¡Hola! ¿En qué te ayudo?"), cliente("tiene garantía?")],
      preguntaPendiente: "tiene garantía?",
    });
    expect(p.movimiento).toBe("responder_pregunta");
    expect(p.instruccion).toContain("garantía");
  });

  it("preguntar el precio se contesta con el precio, NO con otra pregunta", () => {
    // El arreglo que ya se había hecho una vez y que este archivo no puede
    // romper: el cliente preguntaba cuánto vale y recibía otra cosa.
    const p = proximoPaso({
      etapa: "interesado",
      historial: [cliente("cuánto vale el curso de piano?")],
    });
    expect(p.movimiento).toBe("presentar");
    expect(p.instruccion).toMatch(/dato que pidió|directo/i);
  });

  it("las formas de pago también son un dato, no una excusa para calificar", () => {
    const p = proximoPaso({
      etapa: "interesado",
      historial: [cliente("qué formas de pago manejan")],
    });
    expect(p.movimiento).toBe("presentar");
  });
});

describe("califica UNA vez, al principio", () => {
  it("el primer 'me interesa' NO dispara la ficha completa", () => {
    // El caso exacto que reportó el admin: "va de me interesa a caja en dos
    // mensajes".
    const p = proximoPaso({
      etapa: "interesado",
      historial: [cliente("hola, me interesa el curso de piano")],
    });
    expect(p.movimiento).toBe("calificar");
    expect(p.instruccion).toMatch(/UNA sola pregunta/);
  });

  it("y pide UNA pregunta, no un interrogatorio", () => {
    const p = proximoPaso({ etapa: "interesado", historial: [cliente("me interesa")] });
    expect(p.instruccion).toMatch(/Una, no tres/);
  });

  it("si el agente YA preguntó algo, deja de preguntar y presenta", () => {
    // La sobrecorrección que hay que evitar: calificar en cada turno.
    const p = proximoPaso({
      etapa: "interesado",
      historial: [
        cliente("hola"),
        bot("¡Qué gusto verte! 🙌 ¿Qué necesitas?"),
        cliente("me interesa el de piano"),
        bot("¡Buenísimo! ¿Arrancás de cero o ya tocás algo?"),
        cliente("de cero"),
      ],
    });
    expect(p.movimiento).toBe("presentar");
  });

  it("el SALUDO no cuenta como pregunta: si no, no califica nunca", () => {
    // El defecto visto en vivo el 2026-08-31. El primer mensaje del bot siempre
    // pregunta algo --"¿Qué necesitas?"-- así que contarlo dejaba la
    // calificación desactivada en TODAS las conversaciones. "Tienes el curso de
    // piano" recibía ficha, precio y medios de pago de una.
    const p = proximoPaso({
      etapa: "interesado",
      historial: [cliente("hola"), bot("¡Qué gusto verte! 🙌 ¿Qué necesitas?"), cliente("tienes el curso de piano")],
    });
    expect(p.movimiento).toBe("calificar");
  });

  it("si ya se sabe qué necesita, no se vuelve a preguntar", () => {
    const p = proximoPaso({
      etapa: "interesado",
      historial: [cliente("me interesa")],
      necesidad: "quiere aprender para tocar en la iglesia",
    });
    expect(p.movimiento).toBe("presentar");
    expect(p.instruccion).toMatch(/lo que te dijo que necesita/);
  });

  it("presentar conecta con lo que dijo, no recita el producto", () => {
    const p = proximoPaso({
      etapa: "interesado",
      historial: [
        cliente("hola"),
        bot("¡Qué gusto verte! 🙌 ¿Qué necesitas?"),
        cliente("me interesa"),
        bot("¿para qué lo querés?"),
        cliente("para mi trabajo"),
      ],
    });
    expect(p.instruccion).toMatch(/conectándolo|necesita/i);
  });
});

describe("después de la ficha no se repite la ficha", () => {
  it("si ya la vio y sigue ahí, se destraba en vez de reenviarla", () => {
    const p = proximoPaso({
      etapa: "interesado",
      historial: [cliente("me interesa"), bot("Acá va todo 👇"), cliente("mmm")],
      fichaEnviada: true,
    });
    expect(p.movimiento).toBe("destrabar");
    expect(p.instruccion).toMatch(/NO la repitas/);
  });

  it("y no se presiona", () => {
    const p = proximoPaso({
      etapa: "interesado",
      historial: [cliente("ok"), bot("¿te sirve?"), cliente("lo pienso")],
      fichaEnviada: true,
    });
    expect(p.instruccion).toMatch(/sin presionar/);
  });
});

describe("las etapas donde ya no se vende", () => {
  it("dijo que lo quiere: se cierra, no se sigue vendiendo", () => {
    const p = proximoPaso({ etapa: "decidido", historial: [cliente("lo quiero")] });
    expect(p.movimiento).toBe("cerrar");
    expect(p.instruccion).toMatch(/no los escribas vos/i);
  });

  it("dice que pagó: NO se confirma ni se entrega", () => {
    const p = proximoPaso({ etapa: "pago_reportado", historial: [cliente("ya te pagué")] });
    expect(p.movimiento).toBe("esperar_pago");
    expect(p.instruccion).toMatch(/no confirmes vos el pago/i);
    expect(p.instruccion).toMatch(/comprobante/i);
  });

  it("pago verificado: se entrega", () => {
    const p = proximoPaso({ etapa: "pago_verificado", historial: [cliente("listo?")] });
    expect(p.movimiento).toBe("entregar");
  });

  it("ya entregado: no se vuelve a vender", () => {
    const p = proximoPaso({ etapa: "entregado", historial: [cliente("gracias")] });
    expect(p.movimiento).toBe("acompanar");
    expect(p.instruccion).toMatch(/No vuelvas a vender/i);
  });

  it("una pregunta pendiente se contesta INCLUSO en pago reportado", () => {
    // Que el cliente esté por pagar no lo vuelve invisible.
    const p = proximoPaso({
      etapa: "pago_reportado",
      historial: [cliente("ya pagué, cuánto tarda?")],
      preguntaPendiente: "cuánto tarda?",
    });
    expect(p.movimiento).toBe("responder_pregunta");
  });
});

describe("explorando", () => {
  it("sin producto definido, ofrece opciones concretas y no una lista entera", () => {
    const p = proximoPaso({
      etapa: "explorando",
      historial: [
        cliente("hola"),
        bot("¡Qué gusto verte! 🙌 ¿Qué necesitas?"),
        cliente("hola de nuevo"),
        bot("¿qué buscás?"),
        cliente("no sé, algo para aprender"),
      ],
    });
    expect(p.movimiento).toBe("presentar");
    expect(p.instruccion).toMatch(/dos opciones|no una lista entera/i);
  });
});

describe("los detectores, con acentos", () => {
  it("'cuánto vale' con tilde se detecta", () => {
    // En JavaScript `\b` y `\w` son ASCII: "cuánto" no matchea `cuant\w+`. Es
    // la quinta vez que este proyecto tropieza con lo mismo.
    expect(pideUnDato("cuánto vale?")).toBe(true);
    expect(pideUnDato("CUÁNTO CUESTA")).toBe(true);
    expect(pideUnDato("qué incluye el pack")).toBe(true);
    expect(pideUnDato("cuánto dura")).toBe(true);
  });

  it("un saludo no es pedir un dato", () => {
    expect(pideUnDato("hola buenas")).toBe(false);
    expect(pideUnDato("me interesa")).toBe(false);
  });

  it("el saludo NO cuenta, la pregunta que viene después SÍ", () => {
    // Solo el primer mensaje del bot queda exento: es el saludo automático.
    expect(elAgenteYaPregunto([cliente("hola"), bot("¡Hola! ¿Qué buscás?")])).toBe(false);
    expect(elAgenteYaPregunto([
      cliente("hola"), bot("¡Hola! ¿Qué buscás?"),
      cliente("piano"), bot("¿Arrancás de cero?"),
    ])).toBe(true);
    expect(elAgenteYaPregunto([cliente("hola?"), bot("Buenas.")])).toBe(false);
    expect(elAgenteYaPregunto([])).toBe(false);
  });
});

describe("la memoria de lo que el cliente dijo que necesita", () => {
  it("toma la respuesta que dio a nuestra pregunta", () => {
    const n = necesidadDeclarada([
      cliente("hola, me interesa el de piano"),
      bot("¡Buenísimo! ¿Arrancás de cero o ya tocás algo?"),
      cliente("de cero, quiero tocar en la iglesia"),
    ]);
    expect(n).toContain("iglesia");
  });

  it("un 'sí' suelto NO es una necesidad", () => {
    // Tomarlo como necesidad haría que el bot crea que ya sabe algo cuando no
    // sabe nada, que es peor que no haber preguntado.
    for (const vacia of ["si", "ok", "dale", "claro", "listo", "sii"]) {
      expect(necesidadDeclarada([cliente("hola"), bot("¿para qué lo querés?"), cliente(vacia)]), vacia).toBeNull();
    }
  });

  it("sin pregunta del agente no hay necesidad declarada", () => {
    expect(necesidadDeclarada([cliente("hola"), bot("Buenas, acá va todo."), cliente("gracias")])).toBeNull();
  });

  it("si preguntamos y no contestó todavía, es null", () => {
    expect(necesidadDeclarada([cliente("hola"), bot("¿qué buscás?")])).toBeNull();
  });

  it("una pregunta del CLIENTE no cuenta como nuestra", () => {
    // Si contara, su propia pregunta convertiría el mensaje siguiente en
    // "necesidad" y el bot se saltearía la calificación sin haber preguntado.
    expect(necesidadDeclarada([cliente("hola, tienen piano?"), cliente("me interesa mucho")])).toBeNull();
  });

  it("y con la necesidad ya conocida, el embudo presenta en vez de preguntar", () => {
    const historial = [
      cliente("me interesa"),
      bot("¿para qué lo querés?"),
      cliente("para mi trabajo, soy principiante"),
    ];
    const p = proximoPaso({
      etapa: "interesado",
      historial,
      necesidad: necesidadDeclarada(historial),
    });
    expect(p.movimiento).toBe("presentar");
  });
});
