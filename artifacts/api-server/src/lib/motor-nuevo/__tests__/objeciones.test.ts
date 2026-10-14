/**
 * LAS OBJECIONES COMO HECHO — no como consejo del prompt.
 *
 * Qué se está probando: que cuando el cliente pone una objeción, el motor la
 * REGISTRE con su tipo y le diga al turno siguiente qué se intentó. Antes eso
 * vivía en un párrafo de `nicho.ts` que el modelo leía y hacía lo que quería.
 *
 * Los casos salen de chats reales de dropshipping (el bolso para gatos del
 * análisis del 2026-10-14): las tres objeciones que más ventas pierden.
 */
import { describe, test, expect } from "vitest";
import { estadoInicial } from "../estado-conversacion";
import {
  clasificarObjecion,
  caminoDeObjecion,
  registrarObjecion,
  describirObjecion,
  marcoDiagnosticoPedido,
  anotarCausaReal,
  resolverObjecion,
} from "../objeciones";

describe("clasificar una objeción: cada una tiene un camino distinto", () => {
  test("el dinero es 'precio', no 'duda propia'", () => {
    expect(clasificarObjecion("está muy caro")).toBe("precio");
    expect(clasificarObjecion("se me sale del presupuesto")).toBe("precio");
    expect(clasificarObjecion("¿no me lo dejas más barato?")).toBe("precio");
  });

  test("la desconfianza es 'confianza' y gana al precio", () => {
    // "¿por qué tan barato, es estafa?" tiene las dos señales: manda la
    // confianza, porque defenderse de una estafa no se hace con precio.
    expect(clasificarObjecion("¿es estafa?")).toBe("confianza");
    expect(clasificarObjecion("no los conozco, ¿tienen página?")).toBe("confianza");
    expect(clasificarObjecion("¿por qué tan barato, es estafa?")).toBe("confianza");
  });

  test("'lo voy a pensar' es duda propia: no sabe nombrar qué le frena", () => {
    expect(clasificarObjecion("lo voy a pensar")).toBe("duda_propia");
    expect(clasificarObjecion("déjame consultarlo con mi esposo")).toBe("duda_propia");
    expect(clasificarObjecion("no sé, déjame ver")).toBe("duda_propia");
  });

  test("el encaje del producto es 'producto', no una duda de venta", () => {
    expect(clasificarObjecion("¿le sirve a mi gato de 5 kg?")).toBe("producto");
    expect(clasificarObjecion("¿aguanta el peso?")).toBe("producto");
    expect(clasificarObjecion("¿de qué material es?")).toBe("producto");
  });

  test("el envío es 'entrega' y el timing es 'momento'", () => {
    expect(clasificarObjecion("¿hacen envíos a Pasto?")).toBe("entrega");
    expect(clasificarObjecion("¿cuánto demora?")).toBe("entrega");
    expect(clasificarObjecion("ahorita no, en otro momento")).toBe("momento");
    expect(clasificarObjecion("la otra semana te digo")).toBe("momento");
  });

  test("sin señal clara es 'otra', que también se diagnostica", () => {
    expect(clasificarObjecion("hola")).toBe("otra");
    expect(clasificarObjecion("")).toBe("otra");
  });
});

describe("el camino de cada objeción prohíbe lo que arruina la venta", () => {
  test("'está caro' prohíbe bajar el precio y obliga a diagnosticar", () => {
    const c = caminoDeObjecion("precio", { intentos: 1, yaPregunto: false });
    expect(c.instruccion).toMatch(/no bajes el precio/i);
    expect(c.instruccion).toMatch(/descuento/i);
    expect(c.exigeDiagnostico).toBe(true);
  });

  test("'es estafa' prohíbe defenderse con adjetivos", () => {
    const c = caminoDeObjecion("confianza", { intentos: 1, yaPregunto: false });
    expect(c.instruccion).toMatch(/no te defiendas/i);
    expect(c.instruccion).toMatch(/testimonios/i);
    // No exige diagnóstico: acá hay que ACTUAR (eliminar el riesgo), no preguntar.
    expect(c.exigeDiagnostico).toBe(false);
  });

  test("'lo voy a pensar' prohíbe despedirse", () => {
    const c = caminoDeObjecion("duda_propia", { intentos: 1, yaPregunto: false });
    expect(c.instruccion).toMatch(/no te despidas/i);
    expect(c.instruccion).toMatch(/cualquier cosa me avisas/i);
    expect(c.exigeDiagnostico).toBe(true);
  });

  test("'¿me sirve?' exige el dato real, no tranquilizar", () => {
    const c = caminoDeObjecion("producto", { intentos: 1, yaPregunto: false });
    expect(c.instruccion).toMatch(/dato real/i);
    expect(c.instruccion).toMatch(/nunca tranquilices/i);
  });

  test("ya diagnosticado: no vuelve a exigir la misma pregunta", () => {
    const primero = caminoDeObjecion("duda_propia", { intentos: 1, yaPregunto: false });
    const segundo = caminoDeObjecion("duda_propia", { intentos: 2, yaPregunto: true });
    expect(primero.exigeDiagnostico).toBe(true);
    expect(segundo.exigeDiagnostico).toBe(false);
  });
});

describe("registrar la objeción en el estado", () => {
  test("la primera vez queda vigente con turno e intento 1", () => {
    const e = estadoInicial(1);
    e.turnos = 3;
    const o = registrarObjecion(e, "está caro");
    expect(o.tipo).toBe("precio");
    expect(o.intentos).toBe(1);
    expect(o.turno).toBe(3);
    expect(e.objecion?.tipo).toBe("precio");
  });

  test("la MISMA objeción repetida suma intento, no duplica", () => {
    const e = estadoInicial(1);
    registrarObjecion(e, "está caro");
    registrarObjecion(e, "muy caro la verdad");
    expect(e.objecion?.intentos).toBe(2);
    expect(e.objecionesTrabajadas.length).toBe(0);
  });

  test("una objeción DISTINTA archiva la anterior en el historial", () => {
    const e = estadoInicial(1);
    registrarObjecion(e, "está caro");
    registrarObjecion(e, "lo voy a pensar");
    expect(e.objecion?.tipo).toBe("duda_propia");
    expect(e.objecionesTrabajadas.length).toBe(1);
    expect(e.objecionesTrabajadas[0].tipo).toBe("precio");
  });

  test("resolver deja de tenerla vigente sin perder el historial", () => {
    const e = estadoInicial(1);
    registrarObjecion(e, "está caro");
    resolverObjecion(e);
    expect(e.objecion).toBeNull();
    expect(e.objecionesTrabajadas[0].tipo).toBe("precio");
  });
});

describe("lo que el vendedor LEE de la objeción", () => {
  test("sin objeción no hay bloque", () => {
    expect(describirObjecion(estadoInicial(1))).toBeNull();
  });

  test("la primera vez: dice el tipo y la instrucción, y exige diagnóstico", () => {
    const e = estadoInicial(1);
    registrarObjecion(e, "lo voy a pensar");
    const d = describirObjecion(e)!;
    expect(d).toMatch(/objeción de duda propia/i);
    expect(d).toMatch(/no te despidas/i);
    expect(d).toMatch(/no cierres ni te despidas/i);
  });

  test("repetida: avisa que lo anterior NO funcionó", () => {
    const e = estadoInicial(1);
    registrarObjecion(e, "está caro");
    registrarObjecion(e, "sigue muy caro");
    const d = describirObjecion(e)!;
    expect(d).toMatch(/ya intentaste responderla 2 veces/i);
    expect(d).toMatch(/cambiá de ángulo/i);
  });

  test("ya diagnosticada: no pide la misma pregunta otra vez", () => {
    const e = estadoInicial(1);
    registrarObjecion(e, "lo voy a pensar");
    marcoDiagnosticoPedido(e);
    const d = describirObjecion(e)!;
    expect(d).toMatch(/ya le preguntaste qué le frena/i);
    expect(d).not.toMatch(/no cierres ni te despidas/i);
  });

  test("con causa real: ataca la causa, no la objeción de superficie", () => {
    const e = estadoInicial(1);
    registrarObjecion(e, "está caro");
    anotarCausaReal(e, "no sé si le va a servir a mi gato");
    // Al anotar la causa, la objeción se cierra y queda en el historial.
    expect(e.objecion).toBeNull();
    expect(e.objecionesTrabajadas[0].causaReal).toMatch(/no sé si le va a servir/i);
  });
});

describe("el caso completo del bolso para gatos", () => {
  test("'está caro' → diagnóstico → la causa real es otra cosa", () => {
    const e = estadoInicial(1);

    // Turno 1: el cliente dice que está caro (probablemente no es el precio).
    registrarObjecion(e, "uy está caro");
    expect(e.objecion?.tipo).toBe("precio");
    const turno1 = describirObjecion(e)!;
    expect(turno1).toMatch(/no bajes el precio/i);
    expect(turno1).toMatch(/¿lo comparó con otro más barato|viste otro más barato/i);

    // El vendedor pregunta: queda marcado para no repetir.
    marcoDiagnosticoPedido(e);

    // Turno 2: el cliente revela la causa real. Ya no es el precio.
    anotarCausaReal(e, "es que no sé si mi gato de 7 kilos quepa");
    expect(e.objecion).toBeNull();

    // La conversación sabe que la objeción real era de PRODUCTO, no de dinero.
    const guardada = e.objecionesTrabajadas[0];
    expect(guardada.tipo).toBe("precio");
    expect(guardada.causaReal).toMatch(/quepa/i);
  });

  test("'¿es estafa?' no se responde con precio ni con adjetivos", () => {
    const e = estadoInicial(1);
    registrarObjecion(e, "¿esto no será una estafa?");
    const d = describirObjecion(e)!;
    expect(d).toMatch(/no te defiendas/i);
    expect(d).toMatch(/verificables/i);
    // No debe empujar a bajar el precio, que es lo que no corresponde acá.
    expect(d).not.toMatch(/no bajes el precio/i);
  });
});
