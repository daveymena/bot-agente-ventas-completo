/**
 * El Design System, probado contra la regla que lo justifica.
 *
 * El dueño lo dijo así: *"cada familia debe modificar realmente la
 * composición. NO solamente color = diferente"*. Esa frase es verificable, y
 * acá se verifica -- porque es exactamente el atajo que un sistema de estilos
 * toma solo cuando nadie mira: doce paletas sobre la misma plantilla.
 */
import { describe, it, expect } from "vitest";
import { FAMILIAS, TOKENS, tokensDe, esFamilia, elegirFamilia, layoutDe } from "../design-system";

describe("las familias son de verdad distintas", () => {
  it("están las 16 y cada una se declara a sí misma", () => {
    expect(FAMILIAS).toHaveLength(16);
    for (const f of FAMILIAS) expect(TOKENS[f].familia).toBe(f);
  });

  /**
   * LA PRUEBA QUE IMPORTA. Si dos familias comparten ritmo, alineación,
   * tratamiento de imagen y CTA, son la misma plantilla repintada -- y una de
   * las dos sobra.
   */
  it("ninguna pareja comparte la misma composición", () => {
    const huella = (f: (typeof FAMILIAS)[number]) => {
      const t = TOKENS[f];
      return [t.ritmo.anchoContenido, t.ritmo.padSeccionY, t.alineacion, t.imagen, t.cta, t.fondos].join("|");
    };
    const vistas = new Map<string, string>();
    for (const f of FAMILIAS) {
      const h = huella(f);
      const gemela = vistas.get(h);
      expect(gemela, `${f} y ${gemela} tienen la MISMA composición: son la misma plantilla con otro color`).toBeUndefined();
      vistas.set(h, f);
    }
  });

  /** Y tampoco pueden coincidir en el layout favorito de TODAS las secciones. */
  it("ninguna pareja prefiere exactamente los mismos layouts", () => {
    const favoritos = (f: (typeof FAMILIAS)[number]) =>
      Object.keys(TOKENS[f].layoutsPreferidos).sort().map((s) => `${s}:${TOKENS[f].layoutsPreferidos[s][0]}`).join(",");
    const vistas = new Map<string, string>();
    for (const f of FAMILIAS) {
      const k = favoritos(f);
      expect(vistas.get(k), `${f} elige los mismos layouts que ${vistas.get(k)}`).toBeUndefined();
      vistas.set(k, f);
    }
  });

  it("se usan las cinco alineaciones/tratamientos, no una sola repetida", () => {
    expect(new Set(FAMILIAS.map((f) => TOKENS[f].alineacion)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(FAMILIAS.map((f) => TOKENS[f].imagen)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(FAMILIAS.map((f) => TOKENS[f].cta)).size).toBeGreaterThanOrEqual(4);
  });
});

describe("los colores tienen que ser legibles, no solo bonitos", () => {
  /**
   * Un CTA cuyo texto no contrasta con su fondo es un botón que no se lee, y
   * es el error de color que más caro sale en una landing.
   */
  it("el texto del CTA contrasta con el acento", () => {
    for (const f of FAMILIAS) {
      const { acento, sobreAcento } = TOKENS[f].color;
      expect(acento.toLowerCase(), `en ${f} el CTA es invisible`).not.toBe(sobreAcento.toLowerCase());
      expect(luminancia(sobreAcento) - luminancia(acento), `en ${f} el CTA casi no contrasta`).not.toBeCloseTo(0, 1);
    }
  });

  it("las familias oscuras tienen fondo oscuro y texto claro", () => {
    for (const f of FAMILIAS) {
      if (TOKENS[f].fondos !== "oscuro") continue;
      expect(luminancia(TOKENS[f].color.fondo), `${f} dice ser oscura`).toBeLessThan(0.35);
      expect(luminancia(TOKENS[f].color.texto), `${f} es oscura pero su texto no se lee`).toBeGreaterThan(0.6);
    }
  });

  it("todos los colores son hex válidos", () => {
    for (const f of FAMILIAS) {
      for (const [clave, valor] of Object.entries(TOKENS[f].color)) {
        expect(valor, `${f}.${clave} no es un hex`).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });
});

/** Luminancia aproximada 0..1. Alcanza para decidir claro contra oscuro. */
function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

describe("elegir el estilo solo (Sorpréndeme)", () => {
  it.each([
    [{ nombre: "Serum facial con vitamina C" }, "belleza"],
    [{ nombre: "Rutina de entrenamiento en casa" }, "fitness"],
    [{ nombre: "Curso de piano desde cero" }, "educacion"],
    [{ categoria: "Software", nombre: "Plataforma de automatización" }, "tecnologia"],
    [{ nombre: "Organizador de cocina" }, "familiar"],
  ])("lee el rubro: %o", (pistas, esperada) => {
    expect(elegirFamilia(pistas).familia).toBe(esperada);
  });

  it("sin rubro claro, lo caro va a premium", () => {
    expect(elegirFamilia({ nombre: "Pieza única artesanal", precio: 1_200_000 }).familia).toBe("premium");
  });

  it("sin rubro ni precio alto, decide el tipo de producto", () => {
    expect(elegirFamilia({ nombre: "Pack de recursos", tipo: "digital" }).familia).toBe("educacion");
    expect(elegirFamilia({ nombre: "Termo de acero", tipo: "physical" }).familia).toBe("ecommerce");
  });

  /** Elegir sin poder explicar por qué es una caja negra imposible de corregir. */
  it("siempre explica su elección", () => {
    for (const p of [{ nombre: "Serum facial" }, { nombre: "x", precio: 900_000 }, { nombre: "y", tipo: "physical" }]) {
      expect(elegirFamilia(p).porque.length).toBeGreaterThan(20);
    }
  });

  it("no se rompe con un producto vacío", () => {
    expect(FAMILIAS).toContain(elegirFamilia({}).familia);
  });

  /** Los catálogos reales tienen acentos y mayúsculas. */
  it("le da igual el acento y la mayúscula", () => {
    expect(elegirFamilia({ nombre: "CURSO de Formación" }).familia).toBe("educacion");
    expect(elegirFamilia({ categoria: "Nutrición y Músculo" }).familia).toBe("fitness");
  });
});

describe("nada de lo que devuelva un modelo puede romper esto", () => {
  it("una familia inventada cae a una segura en vez de lanzar", () => {
    expect(tokensDe("hiperespacial").familia).toBe("ecommerce");
    expect(tokensDe(null).familia).toBe("ecommerce");
    expect(tokensDe(42).familia).toBe("ecommerce");
  });

  it("esFamilia distingue lo válido de lo inventado", () => {
    expect(esFamilia("premium")).toBe(true);
    expect(esFamilia("Premium")).toBe(false);
    expect(esFamilia(undefined)).toBe(false);
  });

  it("una sección desconocida devuelve un layout por defecto, no undefined", () => {
    expect(layoutDe("premium", "seccion-que-no-existe").preferido).toBe("seccion-que-no-existe_default");
  });

  it("y una conocida devuelve el favorito de esa familia", () => {
    expect(layoutDe("oscura", "hero").preferido).toBe("hero_dark");
    expect(layoutDe("minimal", "hero").preferido).toBe("hero_left");
    expect(layoutDe("premium", "hero").alternativas.length).toBeGreaterThan(0);
  });
});
