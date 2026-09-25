/**
 * Prueba en producción (25-09-2026), curso de piano:
 *   cliente: bueno dale, cómo pago?
 *   bot:     Hola, ¿en qué te puedo ayudar hoy? 😊   + [tarjeta de pago]
 * La tarjeta estaba bien; el texto volvía a saludar en pleno cierre.
 */
import { describe, test, expect } from "vitest";
import { estadoInicial } from "../estado-conversacion";
import type { Producto } from "../herramientas";
import { guionDelNegocio } from "../nicho";
import { responder, esSaludoGenerico } from "../motor";
import { clienteFalso } from "../cliente-llm";

const piano: Producto[] = [
  { id: 123, name: "Curso de Piano", description: "", price: 60000, currency: "COP", kind: "digital", disponible: true },
];
const guion = () => guionDelNegocio({ catalogo: piano, negocio: { nombre: "T" }, medios: [{ etiqueta: "Nequi", tipo: "transferencia" }] });
const VOZ = { nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "T" };

describe("no volver a saludar en mitad de la venta", () => {
  test("reconoce el saludo de arranque", () => {
    expect(esSaludoGenerico("Hola, ¿en qué te puedo ayudar hoy? 😊")).toBe(true);
    expect(esSaludoGenerico("¡Hola! ¿Qué estás buscando?")).toBe(true);
    expect(esSaludoGenerico("Hola, te dejo los medios de pago del curso de piano 🎹")).toBe(false);
  });

  test('"cómo pago?" con tarjeta de pago: el saludo no sale', async () => {
    const e = estadoInicial(224);
    e.productoEnFoco = 123;
    e.seccionesEnviadas = { ...(e as any).seccionesEnviadas, 123: ["precio"] } as any;
    const llm = clienteFalso([
      { content: "", toolCalls: [{ id: "1", name: "mostrar", arguments: JSON.stringify({ productoId: 123, seccion: "pago" }) }] },
      { content: "Hola, ¿en qué te puedo ayudar hoy? 😊" },
    ]);
    const historial = [
      { role: "customer" as const, content: "cuánto vale", createdAt: new Date() },
      { role: "agent" as const, content: "Acá te dejo el valor del curso.", createdAt: new Date() },
      { role: "customer" as const, content: "bueno dale, cómo pago?", createdAt: new Date() },
    ];
    const r = await responder({ llm, estado: e, historial, catalogo: piano, conocimiento: [], guion: guion(), voz: VOZ });
    const textos = r.partes.filter((p: any) => p.kind === "text").map((p: any) => p.content).join(" ");
    expect(textos).not.toMatch(/en qué te puedo ayudar/i);
  });

  test("en el primer mensaje, saludar está bien", async () => {
    const llm = clienteFalso([{ content: "Hola, ¿en qué te puedo ayudar hoy? 😊" }]);
    const r = await responder({ llm, estado: estadoInicial(1), historial: [{ role: "customer", content: "hola", createdAt: new Date() }], catalogo: piano, conocimiento: [], guion: guion(), voz: VOZ });
    expect((r.partes[0] as any).content).toMatch(/Hola/);
  });
});

import { emojiDelFinal } from "../motor";

describe("el mismo emoji al final de cada mensaje", () => {
  test("detecta el emoji final", () => {
    expect(emojiDelFinal("¿Te gustaría pedirlo? 😊")).toBe("😊");
    expect(emojiDelFinal("Sin emoji.")).toBe("");
  });

  test("si el mensaje anterior cerró con 🎹, este va sin él", async () => {
    const llm = clienteFalso([{ content: "Tenés 7 días de garantía. ¿Te animás a probarlo? 🎹" }]);
    const historial = [
      { role: "customer" as const, content: "está caro", createdAt: new Date() },
      { role: "agent" as const, content: "Entiendo. El acceso es de por vida. 🎹", createdAt: new Date() },
      { role: "customer" as const, content: "y si no me gusta?", createdAt: new Date() },
    ];
    const r = await responder({ llm, estado: estadoInicial(1), historial, catalogo: piano, conocimiento: [], guion: guion(), voz: VOZ });
    expect((r.partes[0] as any).content).toBe("Tenés 7 días de garantía. ¿Te animás a probarlo?");
  });
});
