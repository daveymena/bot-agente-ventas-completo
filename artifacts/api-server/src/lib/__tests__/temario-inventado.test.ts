import { describe, it, expect } from "vitest";
import { supervisarRespuesta } from "../supervisor";

/**
 * El bot le vendió un temario que no existe.
 *
 * Conversación real del 2026-09-02. El cliente preguntó por el curso de IA y
 * recibió cuatro módulos con nombre propio:
 *
 *   "🤖 Módulo 1 – Fundamentos de IA
 *    🛠️ Módulo 2 – Herramientas esenciales
 *    ⚙️ Módulo 3 – Agentes autónomos
 *    Módulo 4 – Proyectos prácticos"
 *
 * El producto REAL, que llegó en la ficha dos mensajes después, dice otra
 * cosa: 39 módulos de Master en Agentes IA, 13 de Claude AI, n8n, OpenClaw,
 * Gemini. El cliente compra por lo primero y se encuentra lo segundo.
 *
 * Ninguna regla anterior lo tocaba: R1 cuida los precios, R9 la entrega, R5
 * los bonos. El TEMARIO es lo que el cliente de verdad compra, y no lo miraba
 * nadie.
 */

const CURSO_IA = {
  id: 124,
  name: "INTELIGENCIA ARTIFICIAL 2026: HERRAMIENTAS + AGENTES AUTÓNOMOS",
  price: 60000,
  kind: "digital",
  description:
    "3 cursos de IA en uno: domina Claude, automatiza sin código y crea agentes que trabajen por ti 24/7.",
  features: [
    "MASTER EN AGENTES IA — 39 módulos",
    "CURSO COMPLETO DE CLAUDE AI — 13 módulos",
    "n8n sin código: agente IA, APIs, webhooks y RAG",
    "Claude Code y Claude Design (diseño gráfico)",
    "Agentes con OpenClaw, hasta montarlos en un servidor",
  ],
};

const revisar = (respuesta: string, producto: any = CURSO_IA) =>
  supervisarRespuesta({
    respuesta,
    mensajeCliente: "me interesa el curso de inteligencia artificial",
    productos: [producto],
    idsEnContexto: [producto.id],
    llevaCard: false,
  });

describe("no se inventa el temario", () => {
  it("el caso real: cuatro módulos que no existen se bloquean", () => {
    const r = revisar(
      "Te muestro el contenido completo:\n\n" +
      "🤖 Módulo 1 – Fundamentos de IA\n" +
      "🛠️ Módulo 2 – Herramientas esenciales\n" +
      "⚙️ Módulo 3 – Agentes autónomos\n" +
      "Módulo 4 – Proyectos prácticos",
    );
    expect(r.bloquear).toBe(true);
    expect(r.hallazgos.map((h) => h.regla)).toContain("temario-inventado");
  });

  it("y el motivo dice cuál era, para poder discutirlo", () => {
    const r = revisar("Módulo 1 – Fundamentos de IA\nMódulo 2 – Herramientas esenciales");
    const h = r.hallazgos.find((x) => x.regla === "temario-inventado")!;
    expect(h.detalle).toMatch(/Fundamentos|Herramientas/);
  });

  it("un módulo que SÍ está en el catálogo pasa", () => {
    // "Claude Design" y "OpenClaw" están en las características reales.
    const r = revisar("Módulo 3 – Claude Design para diseño gráfico\nMódulo 4 – Agentes con OpenClaw");
    expect(r.hallazgos.map((h) => h.regla)).not.toContain("temario-inventado");
  });

  it("nombrar la CANTIDAD de módulos no es inventar", () => {
    // "39 módulos" sale de la descripción real. Lo que se juzga es el título,
    // no el número.
    const r = revisar("Son 39 módulos en total, con acceso de por vida 🙌");
    expect(r.hallazgos.map((h) => h.regla)).not.toContain("temario-inventado");
  });

  it("una respuesta sin temario no se toca", () => {
    const r = revisar("¡Claro! Es un curso completo de IA. ¿Te paso el precio? 💰");
    expect(r.bloquear).toBe(false);
  });
});

describe("no se promete contraentrega en algo digital", () => {
  it("el caso real: 'pagas cuando recibes' sale del texto", () => {
    const r = revisar("Pago contra entrega: pagas cuando recibes el material en tu WhatsApp\nEntrega inmediata");
    expect(r.hallazgos.map((h) => h.regla)).toContain("contraentrega-en-digital");
    expect(r.texto).not.toMatch(/contra\s*entrega/i);
    // El resto del mensaje sobrevive: quitar la línea alcanza.
    expect(r.texto).toMatch(/Entrega inmediata/);
  });

  it("en un producto FÍSICO la contraentrega es legítima", () => {
    const fisico = { ...CURSO_IA, id: 500, kind: "physical", name: "Cojín viajero" };
    const r = revisar("Es pago contra entrega: pagas cuando lo recibes 📦", fisico);
    expect(r.hallazgos.map((h) => h.regla)).not.toContain("contraentrega-en-digital");
    expect(r.texto).toMatch(/contra entrega/i);
  });
});
