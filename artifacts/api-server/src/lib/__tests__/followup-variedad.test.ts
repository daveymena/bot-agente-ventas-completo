import { describe, it, expect } from "vitest";
import { leadScoringEngine } from "../leadScoring";

/**
 * Variedad de los seguimientos = protección del número de WhatsApp.
 *
 * Antes había 2 textos por etapa elegidos con Math.random(), y las 12
 * plantillas abrían con "¡Hola! 😊" o "¡Hola! 👋". La mitad de los contactos de
 * una misma etapa recibía el mismo string exacto: la firma del envío masivo,
 * que es por lo que WhatsApp bloquea la línea ("whatsapp me estaba botando los
 * clientes", reportado por el admin).
 */

const ETAPAS = ["cold", "warm", "hot", "qualified", "negotiating", "closing"] as const;
const gen = (etapa: string, semilla: string) =>
  leadScoringEngine.generateFollowUpMessage(etapa as any, "", semilla);

describe("los seguimientos no se repiten entre contactos", () => {
  it.each(ETAPAS)("en la etapa %s, 20 teléfonos distintos usan varios textos", (etapa) => {
    const telefonos = Array.from({ length: 20 }, (_, i) => `57300000${1000 + i * 7}`);
    const textos = new Set(telefonos.map((t) => gen(etapa, t)));
    // Con 6 variantes y 20 contactos, ver menos de 4 distintas significa que el
    // reparto está sesgado y muchos números reciben lo mismo.
    expect(textos.size).toBeGreaterThanOrEqual(4);
  });

  it.each(ETAPAS)("la etapa %s tiene aperturas distintas, no todas '¡Hola!'", (etapa) => {
    const telefonos = Array.from({ length: 30 }, (_, i) => `5731111${2000 + i * 13}`);
    const aperturas = new Set(
      telefonos.map((t) => gen(etapa, t).replace(/^[\s¡!]*/, "").split(/[\s,!?.]+/)[0]!.toLowerCase()),
    );
    expect(aperturas.size).toBeGreaterThanOrEqual(2);
  });

  it("el mismo teléfono siempre recibe el mismo texto (reproducible)", () => {
    expect(gen("warm", "573001234567")).toBe(gen("warm", "573001234567"));
  });

  it("dos teléfonos consecutivos no reciben el mismo texto", () => {
    expect(gen("hot", "573001234567")).not.toBe(gen("hot", "573001234568"));
  });
});

describe("los seguimientos no prometen cosas inventadas", () => {
  const todos = ETAPAS.flatMap((e) =>
    Array.from({ length: 30 }, (_, i) => gen(e, `5732222${3000 + i * 11}`)),
  );

  it("no ofrecen promociones ni novedades que nadie verificó", () => {
    for (const t of todos) {
      expect(t.toLowerCase()).not.toContain("promoción");
      expect(t.toLowerCase()).not.toContain("promocion");
      expect(t.toLowerCase()).not.toContain("novedades");
      expect(t.toLowerCase()).not.toContain("descuento");
    }
  });

  it("no asumen que el negocio vende cursos", () => {
    for (const t of todos) expect(t.toLowerCase()).not.toContain("curso");
  });
});
