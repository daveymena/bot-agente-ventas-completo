/**
 * La voz de Atlas: lo que se puede probar sin abrir un socket.
 *
 * Las respuestas de Atlas son markdown pensado para la PANTALLA. Leído tal
 * cual, `**` se pronuncia "asterisco asterisco" y un enlace se convierte en la
 * lectura de una URL entera. Acá se prueba que lo que se manda a hablar sea
 * algo que una persona quiera escuchar.
 */
import { describe, it, expect } from "vitest";
import { paraLeerEnVoz, armarSsml, recortarParaHablar, VOZ_POR_DEFECTO } from "../voz-de-atlas";

describe("dejar el texto listo para hablarlo", () => {
  it("saca las negritas y deja las palabras", () => {
    expect(paraLeerEnVoz("El **curso de piano** cuesta $60.000")).toBe("El curso de piano cuesta $60.000");
  });

  /** Un enlace se lee por su TEXTO. La dirección leída en voz alta es tortura. */
  it("de un enlace lee el texto, no la dirección", () => {
    expect(paraLeerEnVoz("Mirá [la ficha](https://ventasproia.com/p/41) del curso"))
      .toBe("Mirá la ficha del curso");
  });

  it("una URL suelta no se deletrea", () => {
    const r = paraLeerEnVoz("Entrá a https://ventasproia.com/p/41 y fijate");
    expect(r).not.toContain("https");
    expect(r).toContain("el enlace que te dejé");
  });

  it("los emojis no se leen", () => {
    const r = paraLeerEnVoz("✅ Listo. ⚠️ Ojo con el precio.");
    expect(r).not.toMatch(/[\u{1F000}-\u{1FAFF}]/u);
    expect(r).toContain("Listo");
    expect(r).toContain("Ojo con el precio");
  });

  it("las viñetas y los títulos se leen como frases", () => {
    const r = paraLeerEnVoz("## Resumen\n- uno\n- dos");
    expect(r).not.toContain("#");
    expect(r).not.toMatch(/^\s*-/m);
    expect(r).toContain("uno");
    expect(r).toContain("dos");
  });

  it("un bloque de código se anuncia, no se lee", () => {
    const r = paraLeerEnVoz("Mirá esto:\n```js\nconst x = 1;\n```");
    expect(r).not.toContain("const x");
    expect(r).toContain("bloque de código");
  });

  it("una tabla no se lee con sus rayas", () => {
    const r = paraLeerEnVoz("| Producto | Precio |\n|---|---|\n| Piano | 60000 |");
    expect(r).not.toContain("---");
    expect(r).toContain("Piano");
  });

  it("texto vacío no rompe", () => {
    expect(paraLeerEnVoz("")).toBe("");
    expect(paraLeerEnVoz(undefined as any)).toBe("");
  });
});

describe("el SSML del pedido", () => {
  it("usa la voz que se le pasa y su idioma", () => {
    const x = armarSsml("hola", "es-CO-GonzaloNeural");
    expect(x).toContain("es-CO-GonzaloNeural");
    expect(x).toContain("xml:lang='es-CO'");
  });

  it("por defecto habla la voz colombiana", () => {
    expect(armarSsml("hola")).toContain(VOZ_POR_DEFECTO);
  });

  /**
   * LO QUE NO PUEDE PASAR: un `&` o un `<` en el texto rompe el XML y el
   * servicio rechaza el mensaje entero -- no se escucha NADA. Y las respuestas
   * de Atlas traen precios y comparaciones todo el tiempo.
   */
  it("escapa lo que rompería el XML", () => {
    const x = armarSsml('Ryan & Co dijo <esto> y "aquello"');
    expect(x).toContain("&amp;");
    expect(x).toContain("&lt;esto&gt;");
    expect(x).not.toMatch(/<esto>/);
  });
});

describe("cuánto se habla de una vez", () => {
  it("un texto corto se dice entero", () => {
    expect(recortarParaHablar("Hola, todo listo.")).toBe("Hola, todo listo.");
  });

  /** Una respuesta larga hablada entera son minutos que nadie escucha. */
  it("una respuesta larga se corta y avisa que sigue en pantalla", () => {
    const largo = "Esta es una frase completa. ".repeat(120);
    const r = recortarParaHablar(largo);
    expect(r.length).toBeLessThan(largo.length);
    expect(r).toContain("en pantalla");
  });

  /** Cortar a mitad de palabra suena a que se colgó. */
  it("corta en un punto, no en cualquier lado", () => {
    const largo = "Esta es una frase completa. ".repeat(120);
    const r = recortarParaHablar(largo);
    const antes = r.replace(" El resto te lo dejé escrito en pantalla.", "");
    expect(antes.trim().endsWith(".")).toBe(true);
  });
});
