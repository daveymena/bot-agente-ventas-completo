import { describe, expect, it } from "vitest";
import { generarPropuestaDeCampana } from "../propuesta-campana";

const CURSO = {
  id: 14,
  name: "Inteligencia Artificial 2026: Herramientas + Agentes Autónomos",
  description: "Curso digital sobre herramientas de inteligencia artificial y agentes autónomos.",
  features: ["🤖 Herramientas de IA", "🔗 Agentes autónomos", "📚 Contenido digital"],
  price: 60000,
  currency: "COP",
  kind: "digital",
};

describe("generarPropuestaDeCampana", () => {
  it("entrega una propuesta completa sin crear ni prometer una campaña", () => {
    const propuesta = generarPropuestaDeCampana(CURSO, "trafico");

    expect(propuesta.variantes).toHaveLength(3);
    expect(propuesta.texto).toContain("Propuesta de campaña");
    expect(propuesta.texto).toContain("$60.000 COP");
    expect(propuesta.texto).toContain("No se creó ningún borrador ni campaña");
    expect(propuesta.destino).toContain("Web");
  });

  it("conserva las características reales y no inventa urgencia o prueba social", () => {
    const propuesta = generarPropuestaDeCampana(CURSO);

    expect(propuesta.texto).toContain("🤖 Herramientas de IA");
    expect(propuesta.texto).not.toMatch(/cupos|últimos|descuento|miles de|garantizado/i);
  });

  it("adapta el destino y la acción cuando el objetivo son mensajes", () => {
    const propuesta = generarPropuestaDeCampana(CURSO, "mensajes");

    expect(propuesta.destino).toContain("WhatsApp");
    expect(propuesta.variantes[0]?.cta).toContain("WhatsApp");
  });
});

/**
 * Lo que el dueño rechazó al ver la primera versión, convertido en pruebas.
 *
 * Sus palabras: *"esos chulitos dobles no los quiero, necesito que use los
 * emoji que tenemos en los productos, los reales, los que se parecen a cada
 * ítem... necesitamos que lo que Atlas entregue sea de calidad y profesional,
 * no cosas a medias, y el tiempo de respuesta más rápido"*.
 */

const NOMBRE_LARGO = {
  id: 14,
  name: "INTELIGENCIA ARTIFICIAL 2026: HERRAMIENTAS + AGENTES AUTÓNOMOS",
  description: "3 cursos completos de IA con agentes autónomos y n8n sin código.",
  features: ["🤖 3 cursos: Agentes IA y Gemini", "🔗 n8n sin código", "🎨 Claude Design", "Sin conocimientos previos"],
  price: 60000,
  currency: "COP",
  kind: "digital",
};

describe("los emoji son los del catálogo, no chulitos", () => {
  /** El bug exacto: `✅ 🤖 3 cursos...`, dos emoji apilados. */
  it("no apila un ✅ delante del emoji del producto", () => {
    const t = generarPropuestaDeCampana(NOMBRE_LARGO).texto;
    expect(t).not.toMatch(/✅\s*\p{Extended_Pictographic}/u);
    expect(t).toContain("🤖 3 cursos: Agentes IA y Gemini");
    expect(t).toContain("🔗 n8n sin código");
  });

  /** Y el ✅ sigue existiendo SOLO para las que no traen emoji propio. */
  it("usa ✅ únicamente donde el catálogo no puso emoji", () => {
    expect(generarPropuestaDeCampana(NOMBRE_LARGO).texto).toContain("✅ Sin conocimientos previos");
  });
});

describe("tres ángulos de verdad, no tres encabezados", () => {
  const p = generarPropuestaDeCampana(NOMBRE_LARGO, "ventas");

  /**
   * LA PRUEBA QUE IMPORTA. Antes las tres compartían cuerpo: misma bajada,
   * misma lista, mismo precio, mismo CTA. Comparar eso no enseña nada, porque
   * lo único que cambia es la primera línea.
   */
  it("los cuerpos son distintos entre sí", () => {
    const [a, b, c] = p.variantes.map((v) => v.textoPrincipal);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });

  /** Y distintos en ESTRUCTURA, no solo en el gancho. */
  it("cambian de estructura y de largo, que es lo que hace útil la prueba", () => {
    const [a, b, c] = p.variantes.map((v) => v.textoPrincipal);
    // B abre con la lista; A la usa como respaldo después del problema.
    expect(b.indexOf("🤖")).toBeLessThan(a.indexOf("🤖"));
    // C es deliberadamente corta y sin lista: si gana, dice algo real sobre
    // este público y cambia todos los anuncios siguientes.
    expect(c).not.toContain("🤖");
    expect(c.length).toBeLessThan(a.length / 2);
  });

  it("cada variante declara qué está probando", () => {
    for (const v of p.variantes) expect(v.hipotesis.length).toBeGreaterThan(30);
  });
});

describe("el titular entra completo, no cortado", () => {
  /** Lo que salía: "Conocé INTELIGENCIA ARTIFICIAL 2026: HER". */
  it("nunca parte una palabra por la mitad", () => {
    for (const v of generarPropuestaDeCampana(NOMBRE_LARGO).variantes) {
      expect(v.titular.length).toBeLessThanOrEqual(40);
      expect(v.titular).not.toMatch(/[\s:,;+-]$/);
    }
  });

  /**
   * Y tampoco deja una frase incompleta: "¿Por dónde empezar con Inteligencia"
   * no parte una palabra y se lee igual de rota. Si la frase con el nombre no
   * entra, se usa otra que sí.
   */
  it("prefiere una frase más corta antes que una recortada", () => {
    const titulares = generarPropuestaDeCampana(NOMBRE_LARGO).variantes.map((v) => v.titular);
    expect(titulares).toContain("¿Por dónde empezar?");
  });

  /** Con un nombre corto sí se usa entero: el respaldo es solo para cuando no entra. */
  it("con un nombre corto usa el titular completo", () => {
    const p = generarPropuestaDeCampana({ ...NOMBRE_LARGO, name: "Curso de piano" });
    expect(p.variantes[0].titular).toBe("¿Por dónde empezar con Curso de piano?");
  });
});

describe("el nombre del catálogo no se mete crudo en una frase", () => {
  /** 62 caracteres EN MAYÚSCULAS dentro de un gancho: grita y no se termina de leer. */
  it("no grita ni arrastra el nombre entero en el gancho", () => {
    const a = generarPropuestaDeCampana(NOMBRE_LARGO).variantes[0].textoPrincipal;
    expect(a).not.toContain("INTELIGENCIA ARTIFICIAL 2026: HERRAMIENTAS");
    expect(a).toContain("Inteligencia artificial 2026");
  });

  /** Un nombre que ya viene bien escrito se respeta tal cual. */
  it("no toca un nombre que ya está bien", () => {
    const p = generarPropuestaDeCampana({ ...NOMBRE_LARGO, name: "Curso de piano" });
    expect(p.variantes[2].textoPrincipal).toContain("Curso de piano");
  });
});
