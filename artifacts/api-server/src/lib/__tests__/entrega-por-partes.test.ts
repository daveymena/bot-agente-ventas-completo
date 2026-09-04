/**
 * Entregar por partes: que no se repita lo ya entregado, y que no se trague
 * un aviso.
 *
 * Las dos formas de fallar acá tienen costos muy distintos, y por eso hay
 * pruebas de las dos: repetir texto es feo; tragarse un aviso de los candados
 * ("todavía no se guardó nada", "no se hizo ninguna búsqueda real") le deja al
 * admin una respuesta que parece verificada y no lo está.
 */
import { describe, it, expect } from "vitest";
import { quitarPartesYaEntregadas, mensajeDeCierre, CIERRE_SIN_NOVEDAD } from "../entrega-por-partes";

describe("restar lo que ya se entregó", () => {
  it("saca la parte que ya vio el admin", () => {
    const completo = "Primera parte.\n\nSegunda parte.\n\nTercera parte.";
    expect(quitarPartesYaEntregadas(completo, ["Segunda parte."]))
      .toBe("Primera parte.\n\nTercera parte.");
  });

  it("saca varias partes y deja lo demás", () => {
    const completo = "Uno.\n\nDos.\n\nTres.";
    expect(quitarPartesYaEntregadas(completo, ["Dos.", "Tres."])).toBe("Uno.");
  });

  it("sin partes entregadas devuelve el texto entero", () => {
    expect(quitarPartesYaEntregadas("Todo junto.", [])).toBe("Todo junto.");
  });

  /**
   * LO QUE NO PUEDE PASAR. El candado de "todavía no se guardó nada" se
   * ANTEPONE al texto: por eso esto resta el texto exacto de cada parte y no
   * corta por longitud. Cortando por largo, el aviso se perdería.
   */
  it("el aviso que un candado antepone SIEMPRE llega", () => {
    const parte = "El copy del anuncio dice tal cosa.";
    const completo = `⚠️ **Todavía no se guardó nada.**\n\n---\n\n${parte}`;
    const resto = quitarPartesYaEntregadas(completo, [parte]);
    expect(resto).toContain("Todavía no se guardó nada");
    expect(resto).not.toContain("El copy del anuncio");
  });

  it("el aviso que un candado agrega abajo también llega", () => {
    const parte = "Acá va la estrategia.";
    const completo = `${parte}\n\n⚠️ Aviso automático: no se hizo ninguna búsqueda web real.`;
    const resto = quitarPartesYaEntregadas(completo, [parte]);
    expect(resto).toContain("no se hizo ninguna búsqueda web real");
    expect(resto).not.toContain("Acá va la estrategia");
  });

  /**
   * Si un candado REESCRIBIÓ la parte, el texto exacto ya no está. Ahí se deja
   * y se repite: repetir es feo, tragarse una corrección es peligroso.
   */
  it("si la parte fue reescrita, no se borra a medias", () => {
    const completo = "El copy corregido dice otra cosa.";
    expect(quitarPartesYaEntregadas(completo, ["El copy original decía esto."]))
      .toBe("El copy corregido dice otra cosa.");
  });

  it("un párrafo repetido se quita una vez por parte entregada", () => {
    const completo = "Igual.\n\nIgual.";
    expect(quitarPartesYaEntregadas(completo, ["Igual."])).toBe("Igual.");
  });

  it("no deja renglones en blanco de más al sacar del medio", () => {
    const completo = "Uno.\n\nDos.\n\nTres.";
    expect(quitarPartesYaEntregadas(completo, ["Dos."])).toBe("Uno.\n\nTres.");
  });
});

describe("el mensaje de cierre", () => {
  it("es lo que quedó después de restar", () => {
    expect(mensajeDeCierre("Uno.\n\nDos.", ["Uno."])).toBe("Dos.");
  });

  /**
   * Un `result` vacío deja la pantalla con el indicador prendido y sin
   * mensaje: se lee como que se colgó, que es justo lo que este cambio viene a
   * evitar. Si ya se entregó todo, el cierre lo dice.
   */
  it("si ya se entregó todo, cierra igual con una línea", () => {
    expect(mensajeDeCierre("Uno.\n\nDos.", ["Uno.", "Dos."])).toBe(CIERRE_SIN_NOVEDAD);
  });

  /** Sin partes entregadas no hay nada que cerrar: es un turno normal. */
  it("sin partes entregadas y sin texto, no inventa un cierre", () => {
    expect(mensajeDeCierre("", [])).toBe("");
  });
});
