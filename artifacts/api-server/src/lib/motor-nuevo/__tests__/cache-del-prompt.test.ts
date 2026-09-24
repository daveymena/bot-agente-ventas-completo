/**
 * EL PROMPT ORDENADO PARA EL CACHÉ DEL PROVEEDOR
 *
 * Medido el 23-09-2026 (simulación de venta con DeepSeek): con el estado del
 * turno adentro del primer mensaje del sistema, solo el 76% de la entrada
 * salía del caché y el historial se cobraba entero en cada mensaje. El
 * proveedor cachea PREFIJOS: todo lo que va antes de lo que cambia tiene que
 * ser idéntico entre un turno y el siguiente.
 */
import { describe, test, expect } from "vitest";
import { estadoInicial } from "../estado-conversacion";
import type { Producto } from "../herramientas";
import { guionDelNegocio } from "../nicho";
import { responder } from "../motor";
import { clienteFalso } from "../cliente-llm";

const P: Producto[] = [{ id: 1, name: "Curso de piano", description: "", price: 60000, currency: "COP", kind: "digital", disponible: true }];
const VOZ = { nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "T" };

describe("prefijo estable entre turnos", () => {
  test("el primer mensaje del sistema NO cambia aunque cambie el estado", async () => {
    const guion = guionDelNegocio({ catalogo: P, negocio: { nombre: "T" }, medios: [] });
    const llm1 = clienteFalso([{ content: "hola" }]);
    const e1 = estadoInicial(1);
    await responder({ llm: llm1, estado: e1, historial: [{ role: "customer", content: "hola", createdAt: new Date() }], catalogo: P, conocimiento: [], guion, voz: VOZ });

    const llm2 = clienteFalso([{ content: "ok" }]);
    const e2 = estadoInicial(1);
    e2.productoEnFoco = 1;
    e2.ultimaPreguntaAgente = "¿Te cuento cuánto vale?";
    e2.turnos = 4;
    await responder({
      llm: llm2, estado: e2,
      historial: [
        { role: "customer", content: "hola", createdAt: new Date() },
        { role: "agent", content: "hola", createdAt: new Date() },
        { role: "customer", content: "sí", createdAt: new Date() },
      ],
      catalogo: P, conocimiento: [], guion, voz: VOZ,
    });

    const m1 = (llm1 as any).llamadas[0].messages;
    const m2 = (llm2 as any).llamadas[0].messages;
    expect(m1[0].content).toBe(m2[0].content);
    // Y el historial viejo sigue en el mismo lugar: el turno 2 empieza con el
    // mismo prefijo que el turno 1.
    expect(m2[1]).toEqual(m1[1]);
  });

  test("el estado del turno va DESPUÉS del historial", async () => {
    const llm = clienteFalso([{ content: "ok" }]);
    const e = estadoInicial(1);
    e.productoEnFoco = 1;
    await responder({ llm, estado: e, historial: [{ role: "customer", content: "cuánto vale?", createdAt: new Date() }], catalogo: P, conocimiento: [], guion: guionDelNegocio({ catalogo: P, negocio: { nombre: "T" }, medios: [] }), voz: VOZ });
    const m = (llm as any).llamadas[0].messages as { role: string; content: string }[];
    expect(m[0].content).not.toMatch(/LO QUE YA PASÓ EN ESTA CONVERSACIÓN/);
    expect(m.at(-1)!.role).toBe("system");
    expect(m.at(-1)!.content).toMatch(/LO QUE YA PASÓ EN ESTA CONVERSACIÓN[\s\S]*Producto en foco: Curso de piano/);
  });
});
