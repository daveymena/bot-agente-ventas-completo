import { describe, it, expect } from "vitest";
import { extraerJSON } from "../respuesta-json";

const BUENO = '{ "reply": "listo", "actions": [{ "tool": "fb_ad_draft" }], "done": true }';

describe("rescatar el JSON de lo que devuelve el modelo", () => {
  it("el caso normal: JSON limpio", () => {
    expect(extraerJSON(BUENO).actions[0].tool).toBe("fb_ad_draft");
  });

  it("envuelto en vallas de markdown", () => {
    expect(extraerJSON("```json\n" + BUENO + "\n```").done).toBe(true);
  });

  /**
   * El caso que rompía la publicación: el modelo antepone una frase. Antes
   * costaba un paso entero del turno pidiéndole reformatear, y con un modelo
   * que SIEMPRE lo hace, el anuncio nunca llegaba a publicarse.
   */
  it("con preámbulo antes del JSON", () => {
    expect(extraerJSON("Claro, aquí tienes el borrador:\n" + BUENO).actions).toHaveLength(1);
  });

  it("con epílogo después del JSON", () => {
    expect(extraerJSON(BUENO + "\n\n¿Querés que lo suba a Meta?").reply).toBe("listo");
  });

  it("con preámbulo Y epílogo, dentro de vallas", () => {
    const r = extraerJSON("Perfecto 👍\n```json\n" + BUENO + "\n```\nAvisame si lo publico.");
    expect(r.actions[0].tool).toBe("fb_ad_draft");
  });

  it("conserva el objeto completo, no solo el primer campo", () => {
    const r = extraerJSON('texto {"reply":"a","actions":[],"done":false} más texto');
    expect(r).toEqual({ reply: "a", actions: [], done: false });
  });
});

describe("cuándo NO hay nada que rescatar", () => {
  it.each(["", "   ", "no pude hacerlo", "```json\n```"])('devuelve null con "%s"', (t) => {
    expect(extraerJSON(t)).toBeNull();
  });

  /** Un JSON roto de verdad no se puede adivinar: null y que reintente. */
  it("null si el JSON está truncado", () => {
    expect(extraerJSON('{ "reply": "a", "actions": [')).toBeNull();
  });

  /**
   * `"texto"` y `123` son JSON válidos pero no la respuesta que se pidió.
   * Devolverlos haría que `parsed.actions` fuera undefined y el turno
   * terminara en silencio, sin publicar y sin avisar.
   */
  it.each(['"solo un string"', "123", "true", "null"])('null con el JSON no-objeto %s', (t) => {
    expect(extraerJSON(t)).toBeNull();
  });

  it("null con un array en la raíz", () => {
    expect(extraerJSON('[{"tool":"fb_ad_draft"}]')).toBeNull();
  });
});
