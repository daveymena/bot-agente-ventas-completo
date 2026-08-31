/**
 * El agente no puede prometer lo que el negocio no hace.
 *
 * Antes de este módulo, un negocio cualquiera del SaaS recibía las promesas de
 * TecnoVariedades escritas a mano: entrega por Google Drive, acceso de por vida
 * y garantía de 7 días. Peor todavía: la respuesta enlatada de
 * `tryHardcodedAnswer` se le manda al cliente TAL CUAL, sin que la IA la vea.
 *
 * Estas pruebas fijan la regla: lo que no está configurado, no se afirma.
 */
import { describe, it, expect } from "vitest";
import { renderBloqueNegocio, type BusinessContext } from "../business-context";
import { tryHardcodedAnswer } from "../conversation-engine";

const VACIO: BusinessContext = {
  tenantId: 1,
  businessName: "Gimnasio Titán",
  agentName: "Marcos",
  descripcion: null,
  nicho: null,
  cobertura: null,
  horario: null,
  entrega: null,
  garantia: null,
  acceso: null,
  noPuede: [],
  loQueDebeSaber: [],
  fuentes: [],
  modoCatalogo: "mixto" as const,
  tono: null,
  negociaPrecio: false,
  configurado: false,
};

const RESTAURANTE: BusinessContext = {
  ...VACIO,
  businessName: "Sazón del Valle",
  agentName: "Lucía",
  nicho: "restaurante",
  descripcion: "Comida casera colombiana, almuerzos y domicilios",
  cobertura: "Solo Cali, barrios del sur",
  horario: "11:00 a 21:00 (America/Bogota)",
  entrega: { metodo: "domicilio propio", plazo: "30 a 45 minutos" },
  garantia: null,
  acceso: null,
  noPuede: ["prometer envíos fuera de Cali", "aceptar reservas para más de 20 personas"],
  loQueDebeSaber: ["Los domicilios tienen un costo de $5.000"],
  configurado: true,
};

const emojis = { emojis: {} as Record<string, string> };

describe("El agente no inventa datos que el dueño no configuró", () => {
  it("sin datos de entrega, NO responde con una plantilla: manda el mensaje a la IA", () => {
    const r = tryHardcodedAnswer("¿cómo me lo entregan?", "Plan Mensual", emojis, VACIO);
    expect(r).toBeNull();
  });

  it("sin garantía configurada, NO promete devolución de dinero", () => {
    const r = tryHardcodedAnswer("¿tiene garantía?", "Plan Mensual", emojis, VACIO);
    expect(r).toBeNull();
  });

  it("sin datos de acceso, NO promete 'de por vida'", () => {
    const r = tryHardcodedAnswer("¿por cuanto tiempo lo tengo?", "Plan Mensual", emojis, VACIO);
    expect(r).toBeNull();
  });

  it("nunca menciona Google Drive ni 7 días si el negocio no los configuró", () => {
    const preguntas = ["como me lo envias", "hay garantia", "caduca el acceso", "que incluye"];
    for (const q of preguntas) {
      const r = tryHardcodedAnswer(q, "Plan Mensual", emojis, VACIO);
      const texto = r?.response || "";
      expect(texto).not.toMatch(/google drive/i);
      expect(texto).not.toMatch(/7 días de garantía/i);
      expect(texto).not.toMatch(/de por vida/i);
    }
  });

  it("con la entrega real configurada, sí responde — y con los datos del negocio", () => {
    const r = tryHardcodedAnswer("¿cómo me lo entregan?", "Bandeja Paisa", emojis, RESTAURANTE);
    expect(r).not.toBeNull();
    expect(r!.response).toContain("domicilio propio");
    expect(r!.response).not.toMatch(/google drive/i);
  });

  it("el desvío a humano sigue funcionando sin ningún dato de negocio", () => {
    const r = tryHardcodedAnswer("quiero hablar con una persona", null, emojis, VACIO);
    expect(r?.intent).toBe("human_handoff");
  });
});

describe("El bloque de negocio que lee el prompt", () => {
  it("nombra al negocio real, no a TecnoVariedades", () => {
    const bloque = renderBloqueNegocio(RESTAURANTE);
    expect(bloque).toContain("Sazón del Valle");
    expect(bloque).toContain("Lucía");
    expect(bloque).not.toMatch(/tecnovariedades|sofía/i);
  });

  it("incluye el alcance, el horario y lo que el negocio NO hace", () => {
    const bloque = renderBloqueNegocio(RESTAURANTE);
    expect(bloque).toContain("Solo Cali");
    expect(bloque).toContain("11:00 a 21:00");
    expect(bloque).toContain("prometer envíos fuera de Cali");
    expect(bloque).toContain("Los domicilios tienen un costo de $5.000");
  });

  it("convierte cada dato faltante en una prohibición explícita de inventarlo", () => {
    const bloque = renderBloqueNegocio(VACIO);
    expect(bloque).toContain("DATOS QUE NO TENÉS");
    expect(bloque).toContain("cómo se entrega");
    expect(bloque).toContain("si hay garantía");
    expect(bloque).toContain("NO lo inventes");
    // Y sobre todo: no le sugiere ninguna respuesta prestada de otro negocio.
    expect(bloque).not.toMatch(/google drive|de por vida|7 días/i);
  });

  it("un dato configurado se afirma y deja de aparecer entre los que faltan", () => {
    const bloque = renderBloqueNegocio(RESTAURANTE);
    expect(bloque).toContain("domicilio propio — 30 a 45 minutos");
    expect(bloque).not.toContain("cómo se entrega o cuánto tarda");
    // La garantía sigue sin configurarse, así que sigue prohibida.
    expect(bloque).toContain("si hay garantía");
  });
});
