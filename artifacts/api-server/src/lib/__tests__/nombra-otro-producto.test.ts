/**
 * Chat real del dueño, 12-09-2026, con el piano en foco:
 *
 *   cliente: "¿cuánto vale el curso de Excel?"   (Excel NO está en el catálogo)
 *   bot:     "¡Claro que sí! Mira 👇" + precio del PIANO ($60.000)
 *
 * El modelo había escrito "no lo tengo". El servidor, al ver que pedía
 * "precio" y no había ficha, cayó a `memory.currentProductId`, forzó la
 * sección de precio del piano y reemplazó la negación. Cuando el cliente
 * nombra OTRA cosa, el producto en foco no es la respuesta.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nombraOtraCosaQueElFoco } from "../conversation-engine";

const PIANO = "Curso de Piano Online";

describe("nombraOtraCosaQueElFoco", () => {
  it("Excel con el piano en foco: nombró otra cosa", () => {
    expect(nombraOtraCosaQueElFoco(PIANO, "¿cuánto vale el curso de Excel?")).toBe(true);
    expect(nombraOtraCosaQueElFoco(PIANO, "y el Renovador de baterías cuánto está")).toBe(true);
  });
  it("preguntas sobre lo que se viene hablando NO cuentan", () => {
    expect(nombraOtraCosaQueElFoco(PIANO, "¿cuánto vale?")).toBe(false);
    expect(nombraOtraCosaQueElFoco(PIANO, "¿y ese cuánto cuesta?")).toBe(false);
    expect(nombraOtraCosaQueElFoco(PIANO, "¿el de piano cuánto vale?")).toBe(false);
    expect(nombraOtraCosaQueElFoco(PIANO, "¿tienes página web?")).toBe(false);
    expect(nombraOtraCosaQueElFoco(PIANO, "cómo pago")).toBe(false);
  });
});

describe("agent.ts no cae al producto en foco si nombró otro", () => {
  const src = readFileSync(join(__dirname, "..", "agent.ts"), "utf8");
  it("la sección forzada respeta nombraOtroProducto", () => {
    expect(src).toMatch(/decision\.productoDelMensaje\?\.id \?\? decision\.productToShow\?\.id \?\? \(decision\.nombraOtroProducto \? null : memory\.currentProductId\)/);
  });
  it("la corrección de tarjeta al foco también", () => {
    expect(src).toMatch(/&& !decision\.nombraOtroProducto\n\s*\) \{/);
  });
});

import { preguntaPorVarios } from "../ficha-parcial";

const NOMBRES = ["Curso de Piano Completo: De Cero a Nivel Avanzado", "Pack Contabilidad", "Curso de Idiomas", "Marketing Digital"];

describe("preguntaPorVarios: la sección de UN producto no contesta una suma", () => {
  it("piano + contabilidad + idiomas, total", () => {
    expect(preguntaPorVarios("si me llevo piano, contabilidad e idiomas juntos cuanto seria en total?", NOMBRES)).toBe(true);
    expect(preguntaPorVarios("¿cuánto me salen los dos?", NOMBRES)).toBe(true);
    expect(preguntaPorVarios("el de piano y el de contabilidad cuánto valen", NOMBRES)).toBe(true);
  });
  it("uno solo sigue siendo uno solo", () => {
    expect(preguntaPorVarios("¿cuánto vale el de piano?", NOMBRES)).toBe(false);
    expect(preguntaPorVarios("¿cuánto vale?", NOMBRES)).toBe(false);
    expect(preguntaPorVarios("cuanto vale el curso de Excel?", NOMBRES)).toBe(false);
  });
});

describe("el parser descarta la tarjeta del foco en los tres casos del chat real", () => {
  const src = readFileSync(join(__dirname, "..", "agent.ts"), "utf8");
  it("nombró otra cosa / varios / ya pagó", () => {
    expect(src).toMatch(/decision\.nombraOtroProducto && resolvedId === memory\.currentProductId/);
    expect(src).toMatch(/else if \(preguntaPorVarios\(String\(lastText \|\| ""\), nombres\)\)/);
    expect(src).toMatch(/else if \(isPaymentProofIntent\(String\(lastText \|\| ""\)\)\)/);
  });
  it("la sección forzada tampoco sale con varios ni tras 'ya pagué'", () => {
    expect(src).toMatch(/pideAlgoEntregable\(String\(lastText \|\| ""\)\)\n\s*&& !preguntaPorVarios\(/);
  });
});

import { verificarPrecios, sumasDe } from "../precio-verificado";

describe("la suma de los que pidió juntos es un monto real", () => {
  const P = [
    { id: 123, name: "Curso de Piano Completo", price: 60000 },
    { id: 130, name: "Pack Contabilidad", price: 60000 },
    { id: 117, name: "Pack Idiomas", price: 60000 },
    { id: 124, name: "Inteligencia Artificial 2026", price: 34900 },
  ];
  it("$180.000 por los tres no se borra", () => {
    const texto = "Los tres te salen en $180.000 COP, Duvier — son $60.000 cada uno, pago único.";
    const sin = verificarPrecios(texto, P as any, [123]);
    expect(sin.inventados).toContain("$180.000");
    const con = verificarPrecios(texto, P as any, [123], P.slice(0, 3) as any);
    expect(con.inventados).toEqual([]);
    expect(con.texto).toContain("$180.000");
  });
  it("pero un combo inventado sigue sin pasar", () => {
    const r = verificarPrecios("Los tres a $85.000 en combo.", P as any, [123], P.slice(0, 3) as any);
    expect(r.inventados).toContain("$85.000");
  });
  it("sumasDe: de 2 a 4 productos", () => {
    const s = sumasDe(P as any);
    expect(s.has(120000)).toBe(true);
    expect(s.has(180000)).toBe(true);
    expect(s.has(94900)).toBe(true);
    expect(s.has(85000)).toBe(false);
  });
});

describe("13-09: lo medido en producción con el diagnóstico", () => {
  const src = readFileSync(join(__dirname, "..", "agent.ts"), "utf8");
  it("la sección forzada prefiere productToShow (EXCEL) antes que el foco (piano)", () => {
    expect(src).toMatch(/decision\.productoDelMensaje\?\.id \?\? decision\.productToShow\?\.id \?\? \(decision\.nombraOtroProducto \? null : memory\.currentProductId\)/);
  });
  it("nombrar algo que no tenemos cuenta como búsqueda fallida para el candado de invento", () => {
    expect(src).toMatch(/const noLoTenemos = decision\.productSearchFailed \|\| decision\.nombraOtroProducto === true;/);
  });
  it("si el texto queda vacío y nombró otra cosa, se le dice que no está", () => {
    expect(src).toMatch(/Ese producto no lo tengo en el catálogo/);
  });
});

describe("13-09: el conocimiento del producto en foco no contesta por otro", () => {
  const src = readFileSync(join(__dirname, "..", "agent.ts"), "utf8");
  it("con nombraOtroProducto no se usa la respuesta escrita del foco", () => {
    expect(src).toMatch(/const conocidas = decision\.nombraOtroProducto \? \[\] : responderPreguntas\(/);
  });
});

import { sanitizeResponse } from "../conversation-engine";

describe("los IDs del catálogo no salen al cliente", () => {
  it("(ID 87) y ID 42 se quitan", () => {
    const t = sanitizeResponse("es el *Pack Contabilidad* (ID 87), y el de idiomas es el *Pack Idiomas* (ID: 42). Piano ID 123 igual.", "product_query" as any);
    expect(t).not.toMatch(/ID/);
    expect(t).toContain("*Pack Contabilidad*,");
  });
});

import { mensajeNombraProducto } from "../conversation-engine";

describe("lead de Instagram 12-09 21:19: 'Para mi' no cambia de agente ni inventa", () => {
  it("'Para mi' / 'Listo' no nombran producto: el router no los mira", () => {
    for (const m of ["Para mi", "Listo", "si", "para mí"]) expect(mensajeNombraProducto(m), m).toBe(false);
    expect(mensajeNombraProducto("me interesa la rodillera")).toBe(true);
  });
  it("el router solo enruta por producto si el mensaje lo nombra", () => {
    const src = readFileSync(join(__dirname, "..", "agent-router.ts"), "utf8");
    expect(src).toMatch(/mensajeNombraProducto\(messageText\) \? await findBestProductMatch\(/);
  });
  it("'te enseña' con un producto real en foco no es un invento", () => {
    const src = readFileSync(join(__dirname, "..", "agent.ts"), "utf8");
    expect(src).toMatch(/const inventoPorFrase = !hayProductoRealEnJuego\n\s*&& \//);
  });
});

describe("13-09 conversación 90 (cliente en EE.UU.)", () => {
  it("'¿Tienes disponible?' no es otro producto", () => {
    expect(nombraOtraCosaQueElFoco("INTELIGENCIA ARTIFICIAL 2026", "Tienes disponible")).toBe(false);
    expect(nombraOtraCosaQueElFoco("INTELIGENCIA ARTIFICIAL 2026", "tiene garantía?")).toBe(false);
    expect(nombraOtraCosaQueElFoco("INTELIGENCIA ARTIFICIAL 2026", "y el de piano?")).toBe(true);
  });
  it("una sección que entrega algo nunca cuenta como ficha repetida", () => {
    const src = readFileSync(join(__dirname, "..", "agent.ts"), "utf8");
    expect(src).toMatch(/memory\.sentProductIds\?\.has\(p\.productId\) && !ENTREGA_ALGO\.has\(String\(p\.seccion \|\| ""\)\)/);
  });
});

import { nombraAlgoConcreto } from "../conversation-engine";

describe("13-09 evaluador sobre chats de agosto: 'no tengo ese producto' a quien no nombró ninguno", () => {
  it("preguntas sin producto no son 'búsqueda fallida'", () => {
    for (const m of ["como lo puedo adquirir.\nGracias.", "Hay clases presenciales?", "215814204608627@lid", "Donde es la academia.\nGracias.", "Metodología y precio por favor"]) {
      expect(nombraAlgoConcreto(m), m).toBe(false);
    }
  });
  it("nombrar algo sí cuenta", () => {
    for (const m of ["tienes saxofón?", "Deseo aprender teclado", "el renovador negro"]) expect(nombraAlgoConcreto(m), m).toBe(true);
  });
});

describe("13-09: sin producto nombrado atiende la especialidad con más productos", () => {
  it("el router elige por tamaño del catálogo cuando la conversación no tiene agente", () => {
    const src = readFileSync(join(__dirname, "..", "agent-router.ts"), "utf8");
    expect(src).toMatch(/const tipo = digitales >= fisicos \? "digital" : "dropshipping";/);
  });
  it("'key' no nombra nada", () => {
    expect(nombraAlgoConcreto("key")).toBe(false);
    expect(nombraAlgoConcreto("ok")).toBe(false);
  });
});

import { seccionQueCorresponde } from "../ficha-parcial";

describe("13-09: un 'sí' a una pregunta que no ofrecía nada no manda ficha ni pago", () => {
  it("'dale' con intent payment_intent y sin oferta previa → ninguna", () => {
    expect(seccionQueCorresponde({ mensaje: "dale", intent: "payment_intent", fichaYaEnviada: true } as any)).toBe("ninguna");
    expect(seccionQueCorresponde({ mensaje: "si", intent: "confirmation", fichaYaEnviada: true } as any)).toBe("ninguna");
  });
  it("pero si el bot ofreció contenido o precio, el sí es para eso", () => {
    expect(seccionQueCorresponde({ mensaje: "si", intent: "confirmation", fichaYaEnviada: true, ofrecimosContenido: true } as any)).toBe("info");
    expect(seccionQueCorresponde({ mensaje: "dale", intent: "confirmation", fichaYaEnviada: true, ofrecimosPrecio: true } as any)).toBe("precio");
  });
  it("y '¿cómo pago?' sigue siendo pago", () => {
    expect(seccionQueCorresponde({ mensaje: "sí, cómo pago?", intent: "payment_intent", fichaYaEnviada: true } as any)).toBe("pago");
  });
  it("el parser corrige la ficha al producto que el cliente nombró", () => {
    const src = readFileSync(join(__dirname, "..", "agent.ts"), "utf8");
    expect(src).toMatch(/y el cliente nombró .*: se corrige la ficha/);
    expect(src).toMatch(/const notaDelSi = /);
  });
});

describe("13-09 tarde: 'curso de inglés' no es 'varios productos'; $60.000 no se parte", () => {
  it("dos productos que casan por la misma palabra son uno", () => {
    expect(preguntaPorVarios("Hola, tienen curso de ingles?", ["INGLES", "CURSO INGLES OXFORD", "PACK IDIOMAS"])).toBe(false);
    expect(preguntaPorVarios("el renovador negro cuanto vale", ["Renovador Negro Perfecto"])).toBe(false);
    expect(preguntaPorVarios("ingles y piano juntos", ["INGLES", "Curso de Piano"])).toBe(true);
  });
});
