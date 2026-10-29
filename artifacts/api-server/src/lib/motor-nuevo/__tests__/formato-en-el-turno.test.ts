/**
 * INTEGRACIÓN — el motor mide el formato de la respuesta y pide UNA reescritura.
 *
 * Lo que se prueba: que la regla del prompt ("2 a 4 frases, un emoji suelto, sin
 * listas ni títulos") deje de ser un pedido y pase a tener consecuencia. Antes
 * de esto, un modelo verboso mandaba 12 líneas con 8 emojis y salía igual.
 */
import { describe, test, expect } from "vitest";
import { estadoInicial } from "../estado-conversacion";
import { responder } from "../motor";
import { clienteFalso } from "../cliente-llm";
import { guionDelNegocio } from "../nicho";
import type { Producto } from "../herramientas";

const BOLSO: Producto = {
  id: 1,
  name: "Bolso transportador para gatos",
  description: "Acolchado, correa de seguridad, hasta 8 kg",
  price: 89900,
  currency: "COP",
  kind: "physical",
  disponible: true,
};

async function turno(respuestas: any[]) {
  return responder({
    llm: clienteFalso(respuestas),
    estado: estadoInicial(1),
    historial: [{ role: "customer", content: "cuánto vale?", createdAt: new Date() }],
    catalogo: [BOLSO],
    conocimiento: [],
    guion: guionDelNegocio({ catalogo: [BOLSO], negocio: { nombre: "T" }, medios: [] }),
    voz: { nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "T" },
  });
}

const textoDe = (r: any) =>
  r.partes.filter((p: any) => p.kind === "text").map((p: any) => String(p.content)).join(" ");

describe("el motor mide el formato y pide una reescritura", () => {
  test("una respuesta verbosa se corrige con el reintento", async () => {
    const malo =
      "¡Excelente! 🎉 El bolso es acolchado 🛏️ tiene correa de seguridad 🔒 aguanta 8 kilos 💪 " +
      "viene en dos colores 🎨 se puede lavar 🧼 trae base removible ✨ es ideal para viajes 🚗 " +
      "y te va a encantar 💚 ¿lo llevamos? 😊";
    const bueno = "Aguanta 8 kg y la base se lava fácil. 🐱\n\n¿Te lo llevamos?";

    const r = await turno([{ content: malo }, { content: bueno }]);
    const texto = textoDe(r);

    expect(texto).toBe(bueno);
    expect(texto).not.toMatch(/Excelente/);
  });

  test("una respuesta bien formateada NO gasta un reintento", async () => {
    const bueno = "Aguanta hasta 8 kg y la base se lava fácil. 🐱\n\n¿Te lo llevamos?";
    // El cliente falso solo tiene UNA respuesta: si el motor pidiera un
    // reintento, se quedaría sin nada que devolver.
    const r = await turno([{ content: bueno }]);
    expect(textoDe(r)).toBe(bueno);
  });

  test("si el reintento viene igual de malo, se queda el original (no castiga dos veces)", async () => {
    const malo =
      "¡Perfecto! 🎉 Uno 🚀 Dos 🐱 Tres 🔒 Cuatro 🛏️ Cinco ✨ Seis 💚 Siete 😊 Ocho 🎨";
    const r = await turno([{ content: malo }, { content: malo }]);
    // Sale el texto del modelo: el formato es menos grave que dejarlo sin
    // respuesta.
    expect(textoDe(r).length).toBeGreaterThan(0);
  });

  test("con tarjeta (ficha), el formato del texto no se toca", async () => {
    // La ficha la pega el servidor y tiene su propio formato (un emoji por
    // línea). El texto que la acompaña es una línea corta.
    const r = await turno([
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"precio"}' }] },
      { content: "Acá te dejo el valor 👇" },
    ]);
    expect(r.partes.some((p: any) => p.kind === "card")).toBe(true);
    expect(textoDe(r)).toMatch(/el valor/);
  });
});
