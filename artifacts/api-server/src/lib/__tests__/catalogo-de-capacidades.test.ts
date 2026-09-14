/**
 * Que Atlas sepa TODO lo que puede consultar, no solo lo de este turno.
 *
 * Pedido del admin el 2026-09-04: "hasta que no le pregunto no se da cuenta --
 * no tiene contexto de todo lo que puede y sabe hacer".
 *
 * El recorte de herramientas por pedido está bien y se queda: mandar las 53 de
 * lectura completas es lo que llevaba un pedido simple a 69 segundos. Lo que
 * faltaba es que al recortar no quedaba ningún rastro de las demás -- Atlas no
 * veía una lista más corta, veía un mundo más chico, y contestaba "no tengo
 * acceso" sobre cosas implementadas y funcionando.
 */
import { describe, it, expect } from "vitest";
import { catalogoDeCapacidades, herramientasQuePide, recordarHerramientasPedidas, herramientasPedidasAntes, partesQueDeclara } from "../opencode-mcp-tools";
import { READ_ONLY_TOOLS } from "../app-operator";

const SIN_NADA = new Set<string>();

describe("el catálogo de lo que Atlas puede consultar", () => {
  /**
   * LA PRUEBA QUE MÁS IMPORTA. Este archivo enumera nombres a mano, y un
   * nombre inventado no falla: simplemente no aparece, y la capacidad queda
   * invisible otra vez.
   *
   * Y hay precedente del mismo día: el aviso de "no fue consultado" buscaba
   * `list_leads` y `sales_report`, que no existen en ningún lado. Nadie se
   * enteró durante semanas.
   */
  it("no nombra ninguna herramienta que no exista", () => {
    const texto = catalogoDeCapacidades(SIN_NADA);
    const nombrados = texto
      .split("\n")
      .filter((l) => l.startsWith("• "))
      .flatMap((l) => l.slice(l.indexOf(":") + 1).split(",").map((s) => s.trim().replace(/\*$/, "")))
      .filter(Boolean);

    expect(nombrados.length).toBeGreaterThan(30);
    for (const n of nombrados) {
      expect(READ_ONLY_TOOLS.has(n), `"${n}" no existe en READ_ONLY_TOOLS`).toBe(true);
    }
  });

  it("marca con * solo las que están activas en este turno", () => {
    const texto = catalogoDeCapacidades(new Set(["list_products"]));
    expect(texto).toContain("list_products*");
    expect(texto).toContain("list_categories,");
    expect(texto).not.toContain("list_categories*");
  });

  /**
   * El punto entero del bloque: prohibir el "no puedo" sobre algo que sí sabe
   * hacer, y decirle cómo pedir la herramienta que le falta.
   */
  it("le prohíbe decir que no puede, y le dice cómo pedirla SIN contárselo al admin", () => {
    const texto = catalogoDeCapacidades(SIN_NADA);
    expect(texto).toContain("NUNCA digas que NO PODES");
    expect(texto).toContain("[[herramientas:");
    expect(texto).toMatch(/NO le expliques/);
  });

  /**
   * El presupuesto del turno es real: 4.197 tokens es el tamaño con el que se
   * colgaba en producción. Este bloque no puede comerse una porción seria de
   * eso, y por eso va agrupado y sin descripciones.
   */
  it("es barato: entra en menos de 1.600 caracteres", () => {
    // 1.500 → 1.600 el 14-09-2026: las ~100 letras de más son la regla de que
    // pida herramientas con el marcador en vez de contárselo al admin. Son
    // ~25 tokens; el techo que importa (4.197) sigue lejísimos.
    expect(catalogoDeCapacidades(SIN_NADA).length).toBeLessThan(1600);
  });

  it("cubre los terrenos grandes del sistema", () => {
    const texto = catalogoDeCapacidades(SIN_NADA);
    for (const tema of ["Catalogo", "Ventas", "WhatsApp", "Facebook", "Investigacion"]) {
      expect(texto).toContain(tema);
    }
  });
});

/**
 * Lo que Atlas pide se le da y sigue solo. Antes le decía a la clienta:
 * "me faltan dos lecturas que hoy no están cargadas: anuncio_datos_expertos y
 * propuesta_campana. Las dejo nombradas para que queden habilitadas en tu
 * próximo mensaje. Escribime una línea y en el siguiente turno te entrego el
 * plan" (producción, 14-09-2026). Nada de eso puede llegar a alguien que no
 * programa.
 */
describe("herramientas que Atlas pide en su respuesta", () => {
  it("lee el marcador, lo saca del texto y devuelve solo las que no tenía", () => {
    const r = herramientasQuePide(
      "Encontré el producto. Un momento, estoy revisando tus datos.\n\n[[herramientas: anuncio_datos_expertos, propuesta_campana, list_products]]",
      ["list_products"],
    );
    expect(r.nombres.sort()).toEqual(["anuncio_datos_expertos", "propuesta_campana"]);
    expect(r.textoLimpio).toBe("Encontré el producto. Un momento, estoy revisando tus datos.");
    expect(r.textoLimpio).not.toContain("[[");
  });

  it("si el modelo no respetó el formato, igual detecta los nombres sueltos y los quita del texto", () => {
    const r = herramientasQuePide(
      "me faltan dos lecturas que hoy no están cargadas: anuncio_datos_expertos y propuesta_campana. Las dejo nombradas.",
      [],
    );
    expect(r.nombres.sort()).toEqual(["anuncio_datos_expertos", "propuesta_campana"]);
    expect(r.textoLimpio).not.toMatch(/anuncio_datos_expertos|propuesta_campana/);
  });

  it("ignora nombres inventados y las que ya estaban activas", () => {
    const r = herramientasQuePide("[[herramientas: sales_report, list_products]]", ["list_products"]);
    expect(r.nombres).toEqual([]);
    expect(r.textoLimpio).toBe("");
  });

  it("un texto normal queda intacto", () => {
    const texto = "Tu plan: 1) gancho de dolor de espalda, 2) video de 15s, 3) $20.000/día.";
    const r = herramientasQuePide(texto, []);
    expect(r.nombres).toEqual([]);
    expect(r.textoLimpio).toBe(texto);
  });

  it("lo que no alcanzó a usar queda para el siguiente turno de ESA sesión, una sola vez", () => {
    recordarHerramientasPedidas(7, "s-1", ["propuesta_campana"]);
    expect(herramientasPedidasAntes(7, "s-2")).toEqual([]);
    expect(herramientasPedidasAntes(7, "s-1")).toEqual(["propuesta_campana"]);
    expect(herramientasPedidasAntes(7, "s-1")).toEqual([]);
  });
});

/**
 * Cuando el trabajo grande lo descubre Atlas (16 productos que investigar),
 * él declara las partes y el servidor las encadena una por turno. Antes lo
 * intentaba todo junto y el turno se colgaba (14-09-2026).
 */
describe("partes que Atlas declara pendientes", () => {
  it("lee el marcador, lo saca del texto y devuelve las partes en orden", () => {
    const r = partesQueDeclara("Canguro para mascotas: 6 anuncios activos en CO, gancho 'manos libres'.\n\n[[partes: Organizador de bolsos; Luz LED solar; Prunex 1]]");
    expect(r.partes).toEqual(["Organizador de bolsos", "Luz LED solar", "Prunex 1"]);
    expect(r.textoLimpio).toBe("Canguro para mascotas: 6 anuncios activos en CO, gancho 'manos libres'.");
  });

  it("tolera viñetas y saltos de línea dentro del marcador, y no repite", () => {
    const r = partesQueDeclara("ok [[partes:\n- a b c\n- a b c\n2) d e f]]");
    expect(r.partes).toEqual(["a b c", "d e f"]);
  });

  it("sin marcador no toca el texto", () => {
    const texto = "Plan listo: gancho, formato y presupuesto.";
    expect(partesQueDeclara(texto)).toEqual({ partes: [], textoLimpio: texto });
  });
});
