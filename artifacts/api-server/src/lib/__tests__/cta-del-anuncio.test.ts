import { describe, it, expect } from "vitest";
import { puntuarCopy } from "../anuncio-inteligente";

/**
 * "No hay llamado a la acción" sobre un anuncio que SÍ lo tenía.
 *
 * En vivo el 2026-08-30: el copy cerraba con "👉 Empezá a automatizar hoy" — un
 * llamado a la acción perfecto — y el sistema le reportó al admin que el
 * anuncio "no pide nada". "Empezá" no estaba en la lista de verbos.
 *
 * Es la misma trampa que este proyecto ya documentó cuatro veces: enumerar
 * palabras siempre deja afuera un caso obvio. Por eso ahora, además de una
 * lista más completa, vale el renglón que abre con 👉 — que en un anuncio es,
 * por convención de este mismo sistema, el que pide la acción.
 */
const COPY_REAL = `🤖 ¿Todavía perdés horas con tareas que una IA podría hacer sola?

Dominá las herramientas de IA que ya están transformando el trabajo.

✅ Agentes IA, Claude AI completo y Gemini
✅ n8n sin código: agentes, APIs, webhooks y RAG

🔥 $60.000 COP

👉 Empezá a automatizar hoy`;

describe("Reconocer el llamado a la acción", () => {
  it("el caso real ya no se reporta como si no pidiera nada", () => {
    const n = puntuarCopy({ primaryText: COPY_REAL, headline: "IA 2026: herramientas" });
    expect(n.notas.join(" ")).not.toMatch(/No hay llamado a la acción/);
  });

  it("los verbos que faltaban ahora cuentan", () => {
    for (const cta of ["Empezá hoy", "Probá gratis", "Aprovechá la oferta", "Agendá tu clase", "Unite ahora"]) {
      const n = puntuarCopy({ primaryText: `Curso completo de piano.\n\n${cta}`, headline: "Piano" });
      expect(n.notas.join(" "), cta).not.toMatch(/No hay llamado a la acción/);
    }
  });

  it("el renglón con 👉 alcanza aunque el verbo no esté en ninguna lista", () => {
    // El seguro contra la próxima palabra que se nos escape.
    const n = puntuarCopy({ primaryText: "Curso de piano.\n\n👉 Tu turno de tocar", headline: "Piano" });
    expect(n.notas.join(" ")).not.toMatch(/No hay llamado a la acción/);
  });

  it("un copy que de verdad no pide nada SÍ se marca", () => {
    // El aviso tiene que seguir sirviendo: si no, sobra.
    const n = puntuarCopy({ primaryText: "Curso completo de piano. Tiene 40 lecciones y dura 20 horas.", headline: "Piano" });
    expect(n.notas.join(" ")).toMatch(/No hay llamado a la acción/);
  });
});
