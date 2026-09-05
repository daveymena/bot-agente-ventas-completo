/**
 * El emoji de cada ítem sale del catálogo. Tercera vez que se arregla.
 *
 * ⚠️ El dueño lo pidió tres veces, y las dos primeras se arregló el lugar
 * equivocado:
 *
 *   1ª — se corrigió `FORMATO_COPY` (el prompt de crear_anuncio)
 *   2ª — se corrigió `propuesta-campana` y `copy-de-respaldo`
 *   3ª — seguía saliendo mal, porque cuando ATLAS escribe el copy EN EL CHAT
 *        no pasa por ninguno de esos: sigue SU propio diccionario de emojis.
 *
 * Y ese diccionario decía, literal: `✅ beneficio confirmado/hecho`. O sea que
 * se le estaba ORDENANDO usar ✅ para los beneficios. El modelo obedecía
 * perfectamente una regla equivocada, y el resultado era:
 *
 *     ✅ Las herramientas de IA que de verdad importan hoy
 *     ✅ Cómo crear agentes autónomos
 *     ✅ Automatizar procesos
 *
 * ...cuando ese mismo producto tiene 🤖 🔗 🎨 💬 cargados en el catálogo.
 *
 * Peor todavía: el diccionario está DUPLICADO en dos prompts vivos
 * (ATLAS_SYSTEM_PROMPT_V2 y OPERATOR_SYSTEM_PROMPT), y un arreglo anterior
 * --el del emoji de piano apareciendo en cursos de inglés-- se había aplicado
 * a una sola copia. La otra seguía diciendo "🎹 el producto en sí" con un
 * comentario al lado explicando que eso ya estaba resuelto.
 *
 * Por eso esta prueba mira LAS DOS.
 */
import { describe, it, expect } from "vitest";
import { ATLAS_SYSTEM_PROMPT_V2, OPERATOR_SYSTEM_PROMPT } from "../app-operator";

const PROMPTS: Array<[string, string]> = [
  ["ATLAS_SYSTEM_PROMPT_V2", ATLAS_SYSTEM_PROMPT_V2],
  ["OPERATOR_SYSTEM_PROMPT", OPERATOR_SYSTEM_PROMPT],
];

/**
 * La línea del diccionario de emojis, la que causó el bug del piano.
 *
 * Se busca esa línea y no el prompt entero porque el texto CITA el error para
 * enseñarlo ("acá decía 🎹 y el modelo lo tomó al pie de la letra"), y esa cita
 * es documentación útil: la primera versión de esta prueba se encontró a sí
 * misma en esa explicación y falló.
 */
function lineaDelDiccionario(prompt: string): string {
  return prompt
    .split("\n")
    .find((l) => l.includes("objetivo/meta") && l.includes("acceso de por vida")) || "";
}

describe("ningún prompt le ordena poner ✅ a todo", () => {
  /** La línea exacta que causaba el problema. */
  it.each(PROMPTS)("%s ya no define ✅ como 'beneficio'", (_n, prompt) => {
    expect(prompt).not.toContain("✅ beneficio confirmado/hecho");
  });

  it.each(PROMPTS)("%s manda usar el emoji del catálogo", (_n, prompt) => {
    expect(prompt).toContain("EL EMOJI DE CADA ÍTEM SALE DEL CATÁLOGO");
  });

  /** Con un ejemplo de lo mal y lo bien: una regla abstracta no alcanzó dos veces. */
  it.each(PROMPTS)("%s muestra el error concreto y su arreglo", (_n, prompt) => {
    expect(prompt).toContain("❌ MAL:");
    expect(prompt).toContain("✅ BIEN:");
  });

  /** Y prohíbe apilarlos, que fue el resultado del arreglo a medias. */
  it.each(PROMPTS)("%s prohíbe apilar dos emoji", (_n, prompt) => {
    expect(prompt).toMatch(/NUNCA apiles dos emoji/);
  });
});

describe("el bug del piano no puede volver por la copia olvidada", () => {
  /**
   * Un curso de inglés listado con un piano al lado le dice al admin --y peor,
   * al cliente en un anuncio-- que el sistema no sabe qué está vendiendo.
   */
  it.each(PROMPTS)("%s no usa 🎹 como emoji generico de producto", (_n, prompt) => {
    // Se mira la LINEA DEL DICCIONARIO, no cualquier mencion: el prompt cita
    // el bug para explicarlo ("aca decia 🎹 y el modelo lo tomo al pie de la
    // letra"), y esa cita es documentacion util, no una instruccion.
    const diccionario = lineaDelDiccionario(prompt);
    expect(diccionario.length).toBeGreaterThan(80);
    expect(diccionario).not.toContain("🎹");
  });

  it.each(PROMPTS)("%s usa 📦, que sirve para cualquier producto", (_n, prompt) => {
    expect(prompt).toContain("📦 el producto en sí");
  });
});

describe("las dos copias dicen lo mismo", () => {
  /**
   * LA PRUEBA QUE EVITA LA PRÓXIMA VEZ. El diccionario vive duplicado en dos
   * prompts vivos; arreglar uno solo es exactamente lo que ya pasó con el
   * piano. Si vuelven a divergir, esto falla.
   */
  /** La regla nueva, desde el ⛔ hasta el final del bloque. */
  const laRegla = (p: string) => {
    const i = p.indexOf("⛔ EL EMOJI DE CADA");
    if (i < 0) return "";
    // Se corta al final de la ÚLTIMA línea de la regla, no N caracteres
    // después: lo que sigue es distinto en cada prompt y hacía fallar la
    // comparación por texto que no forma parte de la regla.
    const j = p.indexOf("NUNCA apiles dos emoji", i);
    if (j < 0) return "";
    const fin = p.indexOf("\n", j);
    return p.slice(i, fin > j ? fin : p.length);
  };

  it("la regla del emoji es identica en los dos prompts", () => {
    const [a, b] = PROMPTS.map(([, p]) => laRegla(p));
    expect(a.length).toBeGreaterThan(300);
    expect(a).toBe(b);
  });

  /** Y el diccionario tambien, que es de donde vino el bug del piano. */
  it("el diccionario de emojis es identico en los dos", () => {
    expect(lineaDelDiccionario(ATLAS_SYSTEM_PROMPT_V2)).toBe(lineaDelDiccionario(OPERATOR_SYSTEM_PROMPT));
  });
});
