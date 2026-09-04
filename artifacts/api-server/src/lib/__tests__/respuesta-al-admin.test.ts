import { describe, it, expect } from "vitest";
import { esResumenInterno, pareceIngles, avisoDeTurnoIncompleto } from "../respuesta-al-admin";

/** El texto REAL que Atlas le publicó al admin el 2026-09-02, recortado. */
const RESUMEN_REAL = `Goal
The user (admin) wants a market analysis to understand how to successfully advertise and sell their AI course. They want to know what the competition is doing, what market trends exist, and how to position their product effectively.

Instructions
All responses must be in Spanish (VentasPro uses Spanish-language UI and communication)
When researching trends/competition before building an ad, actually search — never fabricate research or data

Discoveries
Product Identified
ID 124: "INTELIGENCIA ARTIFICIAL 2026: HERRAMIENTAS + AGENTES AUTONOMOS"
Price: $60,000 COP

Accomplished
Searched the product catalog — found the AI course (ID 124, $60,000 COP)
Pulled competitor ads from Meta Ad Library (8 active ads, full copy visible)
Market analysis summary was NOT yet delivered to the admin

Remaining Tasks
Deliver the formatted market analysis to the admin in Spanish, structured with:
Competitor landscape (who's advertising, prices, hooks)

Relevant files / directories
No local files — this is a VentasPro cloud application accessed via tool calls

Prompt for next agent
Continue the conversation in Spanish. The admin asked for a market analysis of their AI course.`;

/** Una respuesta BUENA de Atlas: en español, citando copy en ingles. */
const RESPUESTA_BUENA = `Listo, ya miré qué está pagando la competencia en Colombia para "curso inteligencia artificial". Hay 8 anuncios activos ahora mismo.

El más parecido al tuyo es el de PharmaLife Store, que vende un pack de 30 módulos de ChatGPT a unos $6.000. Su gancho es este, y es bueno:

"La IA no te reemplazará… pero alguien que la use SÍ"
"Cada día que pasas sin dominar ChatGPT, pierdes tiempo, oportunidades y dinero"

Digital Academy cobra 49 USD y va por el lado de "sin experiencia, sin programación". Platzi vende suscripción, no curso suelto.

Dónde te conviene pararte: tu curso NO es "aprende ChatGPT". Es herramientas MÁS agentes autónomos, y los agentes autónomos son justo la tendencia número uno para 2026. Ahí no te compara nadie con los de $6.000, porque no es lo mismo.

Tu precio de $60.000 se sostiene si el anuncio habla de resultados --horas que te ahorrás, procesos que se automatizan-- y no de cuántos módulos trae.

Te preparo el borrador del anuncio con ese ángulo? Decime y lo escribo completo para que lo leas antes de publicar nada.`;

/** Y una respuesta en ingles a secas, sin ser resumen interno. */
const RESPUESTA_EN_INGLES = `I looked at what your competitors are advertising in Colombia right now. There are eight active ads for the search term you asked about, and the closest one to your product is a thirty module ChatGPT pack that they are selling for about six thousand pesos. Their hook is strong and it leans on urgency rather than on features, which is what you should be doing as well. Your course is different because it covers autonomous agents and that is the trend for next year, so you should not compete on price with them at all.`;

describe("El resumen de traspaso nunca se publica", () => {
  it("reconoce el documento interno que le llegó al admin", () => {
    expect(esResumenInterno(RESUMEN_REAL)).toBe(true);
  });

  it("no confunde una respuesta buena que cita anuncios en inglés", () => {
    expect(esResumenInterno(RESPUESTA_BUENA)).toBe(false);
    expect(esResumenInterno(RESPUESTA_EN_INGLES)).toBe(false);
  });

  it("no marca mensajes cortos ni vacíos", () => {
    expect(esResumenInterno("")).toBe(false);
    expect(esResumenInterno("Listo, ya quedó.")).toBe(false);
  });
});

describe("Detectar que quedó redactado en inglés", () => {
  it("marca una respuesta escrita en inglés", () => {
    expect(pareceIngles(RESPUESTA_EN_INGLES)).toBe(true);
    expect(pareceIngles(RESUMEN_REAL)).toBe(true);
  });

  it("NO marca una respuesta en español que cita copy en inglés", () => {
    // Este es el falso positivo caro: Atlas cita a la competencia todo el
    // tiempo, y censurarle eso le saca la mitad del análisis de mercado.
    expect(pareceIngles(RESPUESTA_BUENA)).toBe(false);
  });

  it("no decide con textos demasiado cortos", () => {
    expect(pareceIngles("ok")).toBe(false);
    expect(pareceIngles("The ad is ready")).toBe(false);
  });
});

describe("Lo que se publica en su lugar", () => {
  it("está en español, dice qué pasó y no delata el documento interno", () => {
    const a = avisoDeTurnoIncompleto();
    expect(pareceIngles(a)).toBe(false);
    expect(esResumenInterno(a)).toBe(false);
    expect(a).toMatch(/contexto/i);
    // Que el admin sepa qué hacer, no solo que algo falló.
    expect(a).toMatch(/de nuevo/i);
  });
});

/**
 * El cierre vacío, con el caso real que lo motivó.
 *
 * 2026-09-04, 11:19. Había un plan esperando confirmación --reescribir el copy
 * del borrador 109--. El admin contestó "sí pero no estás usando los emoji
 * característicos de cada ítem": un SÍ CON CORRECCIÓN. Se leyó como pedido
 * nuevo (bien), el plan se descartó (bien), el turno nuevo no produjo nada
 * (mal) y el admin terminó sin respuesta Y sin plan.
 */
import { avisoDeCierreVacio } from "../respuesta-al-admin";

describe("cuando el turno no produjo ni una palabra", () => {
  const PLAN = ["✏️ Reemplazar el texto del anuncio (borrador 109)"];

  it("no es un callejón sin salida: dice qué pasó", () => {
    const a = avisoDeCierreVacio([]);
    expect(a).not.toMatch(/No tengo una respuesta para eso/i);
    expect(a.length).toBeGreaterThan(60);
  });

  /** Lo importante: el plan vuelve, y se ve entero. */
  it("devuelve el plan que el turno había descartado", () => {
    const a = avisoDeCierreVacio(PLAN);
    expect(a).toContain("borrador 109");
    expect(a).toMatch(/pendiente/i);
    // Y le dice las DOS salidas: confirmarlo tal cual, o repetir el cambio.
    expect(a).toMatch(/s[ií]/i);
    expect(a).toMatch(/repetime|de nuevo/i);
  });

  /** Sin plan que devolver no puede prometer uno que no existe. */
  it("sin plan, no menciona ninguno", () => {
    const a = avisoDeCierreVacio([]);
    expect(a).not.toContain("borrador");
    expect(a).toMatch(/de nuevo/i);
  });

  /** "se fue en investigar" es accionable; "tardó mucho" no. */
  it("incluye en qué se fue el tiempo cuando se sabe", () => {
    expect(avisoDeCierreVacio(PLAN, "investigar 90.2s · total 134.8s")).toContain("investigar 90.2s");
    expect(avisoDeCierreVacio(PLAN)).not.toContain("⏱️");
  });
});
