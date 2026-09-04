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
    // El precio sale como "pesos" a propósito: ver el bloque de abajo sobre lo
    // que se escuchó mal en producción.
    expect(paraLeerEnVoz("El **curso de piano** cuesta $60.000")).toBe("El curso de piano cuesta 60.000 pesos");
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
});

/**
 * Lo que el admin ESCUCHÓ y reportó el 2026-09-03, con sus palabras: "lee las
 * barras y los diagonales, y los valores los lee en dólares".
 *
 * Los tres son el mismo tipo de defecto: símbolos que en la pantalla se
 * entienden solos, y hablados salen como palabras que nadie dijo.
 */
describe("lo que se escuchó mal en producción", () => {
  /**
   * Las barras de los extremos quedaban como comas sueltas al principio y al
   * final de cada fila: ", Producto , Precio ,".
   */
  it("una fila de tabla se escucha como enumeración, sin comas de sobra", () => {
    const r = paraLeerEnVoz("| Producto | Precio |\n|---|---|\n| Piano | $60.000 |");
    expect(r).not.toContain("|");
    expect(r.startsWith(",")).toBe(false);
    expect(r).toContain("Producto, Precio");
  });

  /** Una `/` entre palabras la voz la pronuncia "barra". */
  it("las diagonales no se pronuncian", () => {
    const r = paraLeerEnVoz("Atendemos de lunes/viernes.");
    expect(r).not.toContain("/");
    expect(r).toContain("lunes, viernes");
  });

  /** 24/7 no es una enumeración: "veinticuatro, siete" no se entiende. */
  it("24/7 se dice como se dice", () => {
    expect(paraLeerEnVoz("Atendemos 24/7.")).toContain("24 horas, los 7 días");
  });

  /**
   * EL MÁS CARO DE LOS TRES. La voz pronuncia `$` como "dólares" y acá los
   * precios son PESOS: "sesenta mil dólares" por un curso de $60.000 no es un
   * problema de pronunciación, es un precio equivocado dicho con total
   * naturalidad, que el admin puede repetirle a un cliente.
   */
  it("los pesos se dicen pesos, no dólares", () => {
    const r = paraLeerEnVoz("El curso vale $60.000");
    expect(r).toContain("60.000 pesos");
    expect(r).not.toContain("$");
    expect(r).not.toContain("dólares");
  });

  /** Y el dólar de verdad sigue siendo dólar. */
  it("los dólares de verdad se dicen dólares", () => {
    expect(paraLeerEnVoz("El envío cuesta US$12")).toContain("12 dólares");
    expect(paraLeerEnVoz("Son $50 USD")).toContain("50 dólares");
  });

  /**
   * REGRESIÓN: con un patrón flojo (`[\d.,]+`) el número se llevaba puesto el
   * punto de la FRASE -- "US$12." salía "doce punto dólares", con la pausa en
   * el lugar equivocado.
   */
  it("el punto final de la frase no se mete adentro del número", () => {
    const r = paraLeerEnVoz("El envío US$12. Total $1.250.000.");
    expect(r).toContain("12 dólares.");
    expect(r).toContain("1.250.000 pesos.");
  });

  /**
   * REGRESIÓN DE ORDEN: una URL está llena de `/`. Si las diagonales se
   * convierten en comas primero, el enlace queda hecho pedazos
   * ("https:, , ventasproia.com, p, 41") y ya no hay nada que reconocer como
   * dirección.
   */
  it("la URL se reemplaza antes de tocar sus diagonales", () => {
    const r = paraLeerEnVoz("Entrá a https://ventasproia.com/p/41 y fijate.");
    expect(r).toContain("el enlace que te dejé");
    expect(r).not.toContain("ventasproia");
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
