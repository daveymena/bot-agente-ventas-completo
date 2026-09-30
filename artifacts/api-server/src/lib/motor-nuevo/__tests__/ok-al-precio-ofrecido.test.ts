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
