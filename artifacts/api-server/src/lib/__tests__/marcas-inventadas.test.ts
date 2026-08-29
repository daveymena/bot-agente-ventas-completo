import { describe, it, expect } from "vitest";
import { marcasSinRespaldo, respaldoDe } from "../anuncio-inteligente";

/**
 * El anuncio prometía ocho herramientas que el curso no enseña.
 *
 * Caso real, borrador #92 del 19-08-2026. El producto dice:
 *
 *   Claude · n8n · OpenClaw · Gemini · Claude Code · Claude Design
 *
 * y el copy salió publicado diciendo:
 *
 *   ChatGPT · Gemini · Claude · Perplexity · Copilot · Midjourney ·
 *   DALL·E 4 · Leonardo AI · CrewAI · AutoGPT
 *
 * El modelo no las copió de ningún lado: rellenó con lo que "debería" traer un
 * curso de IA. Es la mentira más cara de todas, porque el que compra buscando
 * ChatGPT pide la devolución — y tiene razón.
 *
 * El validador que ya existía cubre PROMESAS (garantía, acceso de por vida,
 * testimonios). Un nombre de herramienta no es una promesa, así que pasaba
 * entero.
 */

const CURSO_IA = respaldoDe({
  name: "INTELIGENCIA ARTIFICIAL 2026: HERRAMIENTAS + AGENTES AUTÓNOMOS",
  description: "3 cursos de IA en uno: domina Claude, automatiza sin código y crea agentes que trabajen por ti 24/7. Claude Code: MCP, apps web, Supabase y Render. n8n: decisiones, ciclos, nodo Agente IA, APIs, webhooks y RAG. OpenClaw: tools, skills, memoria.",
  features: [
    "3 cursos: Agentes IA, Claude AI completo y Gemini",
    "n8n sin código: agente IA, APIs, webhooks y RAG",
    "Conecta WhatsApp, Telegram, Slack y Google",
  ],
});

const COPY_REAL = `🤖 ¿Pierdes horas en tareas que una IA podría hacer por ti?

Aprende a dominar las herramientas de IA de 2026 y a crear agentes autónomos.

✅ ChatGPT, Gemini, Claude, Perplexity y Copilot
✅ Midjourney, DALL·E 4 y Leonardo AI
✅ Agentes autónomos con n8n, CrewAI y AutoGPT

🔥 $60.000 COP · acceso de por vida`;

describe("Nombrar una herramienta que el producto no tiene", () => {
  it("agarra las del caso real", () => {
    const fuera = marcasSinRespaldo(COPY_REAL, CURSO_IA).map((s) => s.toLowerCase());
    // Las que tienen forma de marca (mayúscula interna, número o punto) se
    // detectan aunque abran renglón; las demás, cuando van en medio de la
    // frase. No hace falta cazarlas todas: con que caiga UNA, el copy se
    // rechaza entero y el modelo lo reescribe.
    for (const inventada of ["chatgpt", "perplexity", "copilot", "leonardo", "crewai", "autogpt"]) {
      expect(fuera.some((f) => f.includes(inventada)), `no detectó ${inventada}`).toBe(true);
    }
  });

  it("y NO marca las que el producto sí tiene", () => {
    const fuera = marcasSinRespaldo(COPY_REAL, CURSO_IA).map((s) => s.toLowerCase());
    for (const real of ["claude", "gemini", "n8n"]) {
      expect(fuera.some((f) => f === real), `marcó ${real}, que sí está`).toBe(false);
    }
  });

  it("un copy honesto no dispara nada", () => {
    const limpio = "Aprendé a crear agentes con n8n y Claude. Automatizá WhatsApp y Telegram. $60.000 COP.";
    expect(marcasSinRespaldo(limpio, CURSO_IA)).toEqual([]);
  });

  it("una mayúscula de apertura de frase no es un nombre propio", () => {
    // Si contara, cada renglón del copy sería una marca inventada.
    const copy = "Aprendé rápido.\nDominá la herramienta.\n✅ Práctico y directo\n👉 Escribime";
    expect(marcasSinRespaldo(copy, CURSO_IA)).toEqual([]);
  });

  it("las marcas del sistema siempre pueden nombrarse", () => {
    // WhatsApp, PayPal o Nequi son del canal de venta, no del producto: el
    // anuncio los nombra legítimamente aunque el producto no los liste.
    const copy = "Escribime por WhatsApp y pagá con PayPal o Nequi desde Colombia.";
    expect(marcasSinRespaldo(copy, respaldoDe({ name: "Curso X", description: "un curso" }))).toEqual([]);
  });
});
