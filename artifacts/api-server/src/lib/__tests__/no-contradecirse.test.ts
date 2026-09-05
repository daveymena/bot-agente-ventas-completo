/**
 * Atlas no puede afirmar algo y desmentirse en el mismo mensaje.
 *
 * El admin lo describió con precisión: *"la respuesta mezcla tres estados
 * incompatibles: 'Busqué en la Biblioteca de Anuncios… hoy mismo' y después
 * 'En este mensaje NO se hizo ninguna búsqueda web real'. Nunca debe afirmar
 * que ejecutó una consulta, creó algo o modificó algo y luego desmentirse
 * dentro del mismo mensaje."*
 *
 * ⚠️ El detector funcionaba: SÍ se daba cuenta de que el modelo había afirmado
 * una búsqueda que no ocurrió. Lo que estaba mal era DÓNDE ponía la
 * corrección: al final. Así que el mensaje decía "busqué hoy mismo", treinta
 * líneas de supuestos hallazgos, y recién al final "no se buscó nada".
 *
 * Y este repo YA había aprendido la lección en el aviso gemelo --el de
 * "todavía no se guardó nada"-- donde el comentario dice, textual: *"la
 * corrección va ARRIBA y no al final porque puesta abajo el mensaje se
 * contradecía solo, y el admin lee de arriba hacia abajo y se queda con lo
 * primero"*.
 *
 * Se arregló un aviso y el gemelo quedó igual. Es el mismo patrón que ya pasó
 * con el emoji del piano (dos prompts, se arregló uno) y con el botón de
 * Copilot (dos flujos, se arregló uno). Por eso esta prueba mira LOS DOS.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RUTA = readFileSync(join(__dirname, "..", "..", "routes", "operator-opencode.ts"), "utf8");
/** Sin comentarios: los de este repo CITAN el código que corrigen. */
const CODIGO = RUTA.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("las correcciones van ANTES del texto, nunca después", () => {
  /**
   * La forma de anteponer en este archivo es `aviso + "\n\n---\n\n" + texto`.
   * La de agregar al final es `texto + "\n\n" + aviso`, que es justo lo que
   * produce el mensaje que se contradice a sí mismo.
   */
  it("el aviso de que NO se buscó se antepone", () => {
    const i = CODIGO.indexOf("NO consulté la Biblioteca de Anuncios");
    expect(i, "no encontré el aviso de búsqueda").toBeGreaterThan(-1);
    // Desde el inicio de la asignación hasta el aviso no puede aparecer la
    // variable: si apareciera, el texto viejo iría PRIMERO.
    const desde = CODIGO.lastIndexOf("finalReplyVerificado =", i);
    expect(CODIGO.slice(desde, i)).not.toContain("${finalReplyVerificado}");
    // Y el texto original tiene que quedar DESPUÉS del aviso.
    expect(CODIGO.slice(i)).toContain("${finalReplyVerificado}");
  });

  it("el aviso de que NO se guardó también se antepone", () => {
    const i = CODIGO.indexOf("Todavía no se guardó nada");
    expect(i).toBeGreaterThan(-1);
    const desde = CODIGO.lastIndexOf("finalReplyVerificado =", i);
    expect(CODIGO.slice(desde, i)).not.toContain("${finalReplyVerificado}");
  });

  /** El separador deja claro dónde termina la aclaración y empieza la propuesta. */
  it("los dos separan la aclaración del contenido", () => {
    for (const marca of ["NO consulté la Biblioteca de Anuncios", "Todavía no se guardó nada"]) {
      const i = CODIGO.indexOf(marca);
      expect(CODIGO.slice(i, i + 900), `falta el separador después de "${marca}"`).toContain("---");
    }
  });
});

describe("el aviso dice qué NO pasó, en concreto", () => {
  const aviso = (() => {
    const i = RUTA.indexOf("NO consulté la Biblioteca de Anuncios");
    return RUTA.slice(i - 120, i + 700);
  })();

  /**
   * "No se hizo una búsqueda web" era vago. El admin necesita saber que lo de
   * abajo es una PROPUESTA y no una observación de lo que está al aire hoy --
   * esa es la diferencia entre usarlo como borrador y creerle un dato de
   * mercado que nadie verificó.
   */
  it("dice que es propuesta, no observación verificada", () => {
    expect(aviso).toMatch(/propuesta/i);
    expect(aviso).toMatch(/no.*(verificad|al aire hoy)/i);
  });

  /** Y ofrece la salida: pedirlo y que lo consulte de verdad. */
  it("ofrece consultarlo de verdad si hace falta", () => {
    expect(aviso).toMatch(/ped[ií]melo|pedime/i);
  });
});
