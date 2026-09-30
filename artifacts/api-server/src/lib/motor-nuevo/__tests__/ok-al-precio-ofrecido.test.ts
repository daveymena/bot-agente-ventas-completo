/**
 * EL CLIENTE PASIVO DICE "OK" Y RECIBE EL PRECIO
 * ===============================================
 *
 * Chat de prueba del dueño (30-09-2026), rueda abdominal, cliente pasivo:
 *
 *   cliente: la rueda
 *   bot:     [ficha de información, sin precio]
 *   cliente: ok
 *   bot:     "¿Te gustaría que te cuente cuánto vale? 😊"
 *   cliente: y cuanto
 *   bot:     "El valor es de $105.900"
 *
 * Un turno perdido con el cliente que menos empuja: el que más fácil se va.
 * La ficha de información no trae el precio a propósito y queda ofreciéndolo;
 * si el cliente acepta con un "ok", "sí" o "dale", lo que está aceptando es
 * el precio. Se lee del ESTADO (qué fichas salieron), no del texto.
 */
import { describe, expect, test } from "vitest";
import { estadoInicial, registrarEnvio, yaSeEnvio } from "../estado-conversacion";
import { type Producto } from "../herramientas";
import { guionDelNegocio } from "../nicho";
import { responder } from "../motor";
import { clienteFalso } from "../cliente-llm";

const RUEDA: Producto = {
  id: 9, name: "Rueda Abdominal Retráctil", description: "Rueda para ejercicios de core",
  price: 105900, currency: "COP", kind: "physical", disponible: true,
} as any;

async function correr(mensaje: string, conInfo: boolean, respuestaDelModelo = "¿Te gustaría que te cuente cuánto vale? 😊") {
  const estado = { ...estadoInicial(1), productoEnFoco: RUEDA.id };
  if (conInfo) registrarEnvio(estado, RUEDA.id, "info");
  const r = await responder({
    llm: clienteFalso([{ content: respuestaDelModelo }]),
    estado,
    historial: [{ role: "customer" as const, content: mensaje, createdAt: new Date() }],
    catalogo: [RUEDA],
    conocimiento: [],
    guion: guionDelNegocio({ catalogo: [RUEDA as any], negocio: {} }),
    voz: { nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "Tienda" },
  });
  const texto = r.partes.filter((p: any) => p.kind === "text").map((p: any) => p.content).join("\n");
  return { texto, estado: r.estado ?? estado };
}

describe("aceptar el precio ofrecido", () => {
  test("'ok' después de la ficha de información trae el precio, no otra pregunta", async () => {
    const { texto, estado } = await correr("ok", true);
    expect(texto).toMatch(/\$105\.900/);
    expect(texto).not.toMatch(/te cuente cu[aá]nto vale/i);
    expect(yaSeEnvio(estado, RUEDA.id, "precio")).toBe(true);
  });

  test("'dale' y 'sí' también", async () => {
    expect((await correr("dale", true)).texto).toMatch(/\$105\.900/);
    expect((await correr("sí", true)).texto).toMatch(/\$105\.900/);
  });

  test("sin ficha de información previa, un 'ok' no inventa que se ofreció el precio", async () => {
    const { texto } = await correr("ok", false, "Perfecto, ¿para qué lo vas a usar?");
    expect(texto).not.toMatch(/\$105\.900/);
  });

  test("una duda no es aceptar: '¿es resistente?' no suelta el precio a la fuerza", async () => {
    const { texto } = await correr("¿es resistente?", true, "Sí, es de acero con agarre de goma.");
    expect(texto).not.toMatch(/\$105\.900/);
  });
});

/**
 * Chat de prueba ya desplegado (30-09-2026): la ficha COMPLETA de la rueda
 * (con precio) cierra con "¿Te lo enviamos?"; el cliente contesta "ok" y el
 * vendedor preguntaba "¿Te gustaría llevarla?". La última pregunta que se
 * guardaba era la del texto del modelo, no la de la ficha, que sale DESPUÉS
 * y es lo último que el cliente ve.
 */
describe("la pregunta con la que cierra la ficha queda pendiente", () => {
  test("ficha completa de un físico → el próximo 'ok' contesta '¿te lo enviamos?'", async () => {
    const estado = { ...estadoInicial(1), productoEnFoco: RUEDA.id };
    const r = await responder({
      llm: clienteFalso([
        { toolCalls: [{ id: "a", name: "mostrar", arguments: JSON.stringify({ productoId: RUEDA.id, seccion: "completa" }) }] },
        { content: "Mira, acá tienes todo sobre la rueda." },
      ]),
      estado,
      historial: [{ role: "customer" as const, content: "la rueda", createdAt: new Date() }],
      catalogo: [RUEDA],
      conocimiento: [],
      guion: guionDelNegocio({ catalogo: [RUEDA as any], negocio: {} }),
      voz: { nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "Tienda" },
    });
    const fin = r.estado ?? estado;
    expect(fin.ultimaPreguntaAgente || "").toMatch(/env/i);
  });
});

/**
 * Chat de prueba desplegado (30-09-2026), curso de Excel ($20.000):
 *   bot:     [ficha de info] "… ¿Quieres saber cuánto está?"
 *   cliente: me sirve si no sé nada? lo necesito para un trabajo de oficina
 *   bot:     "Te sirve perfectamente… ¿Te cuento cuánto vale?"
 * Dos ofertas seguidas del precio y ninguna cifra. Si ya se ofreció una vez,
 * la segunda oferta se cambia por el precio.
 */
describe("el precio no se ofrece dos veces: la segunda vez se da", () => {
  const EXCEL: Producto = { id: 118, name: "EXCEL", description: "Excel: desde lo básico hasta macros", price: 20000, currency: "COP", kind: "digital", disponible: true } as any;
  test("tras la ficha de info, '¿Te cuento cuánto vale?' se reemplaza por la cifra", async () => {
    const estado = { ...estadoInicial(1), productoEnFoco: EXCEL.id };
    registrarEnvio(estado, EXCEL.id, "info");
    const r = await responder({
      llm: clienteFalso([{ content: "Te sirve perfectamente porque empieza desde lo básico.\n\n¿Te cuento cuánto vale?" }]),
      estado,
      historial: [{ role: "customer" as const, content: "me sirve si no sé nada de excel?", createdAt: new Date() }],
      catalogo: [EXCEL],
      conocimiento: [],
      guion: guionDelNegocio({ catalogo: [EXCEL as any], negocio: {} }),
      voz: { nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "Tienda" },
    });
    const texto = r.partes.filter((p: any) => p.kind === "text").map((p: any) => p.content).join("\n");
    expect(texto).toMatch(/desde lo básico/);
    expect(texto).toMatch(/\$20\.000/);
    expect(texto).not.toMatch(/te cuento cu[aá]nto vale/i);
  });

  // Primer turno del mismo chat: el texto decía "¿Te cuento cuánto vale?" y
  // la ficha de info, que sale en ESE turno, cerraba con "¿Quieres saber
  // cuánto está?". Dos ofertas en un mensaje. Si la ficha va en el turno, el
  // texto no repite la oferta — y tampoco suelta la cifra, que contradiría la
  // pregunta de la ficha.
  test("con la ficha de info en el mismo turno, el texto no repite la oferta ni da la cifra", async () => {
    const estado = { ...estadoInicial(1) };
    const r = await responder({
      llm: clienteFalso([
        { toolCalls: [{ id: "a", name: "enfocar_producto", arguments: JSON.stringify({ productoId: EXCEL.id }) }] },
        { toolCalls: [{ id: "b", name: "mostrar", arguments: JSON.stringify({ productoId: EXCEL.id, seccion: "info" }) }] },
        { content: "Hola, sí tenemos. Mira lo que incluye el curso.\n\n¿Te cuento cuánto vale?" },
      ]),
      estado,
      historial: [{ role: "customer" as const, content: "hola, tienen curso de excel?", createdAt: new Date() }],
      catalogo: [EXCEL],
      conocimiento: [],
      guion: guionDelNegocio({ catalogo: [EXCEL as any], negocio: {} }),
      voz: { nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "Tienda" },
    });
    const texto = r.partes.filter((p: any) => p.kind === "text").map((p: any) => p.content).join("\n");
    expect(r.partes.some((p: any) => p.kind === "card" && p.seccion === "info")).toBe(true);
    expect(texto).toMatch(/Hola, sí tenemos/);
    expect(texto).not.toMatch(/te cuento cu[aá]nto vale/i);
    expect(texto).not.toMatch(/\$20\.000/);
  });
});

