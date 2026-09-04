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
import { catalogoDeCapacidades } from "../opencode-mcp-tools";
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
  it("le prohíbe decir que no puede, y le dice cómo habilitarla", () => {
    const texto = catalogoDeCapacidades(SIN_NADA);
    expect(texto).toContain("NUNCA digas que NO PODES");
    expect(texto).toContain("NOMBRALA");
  });

  /**
   * El presupuesto del turno es real: 4.197 tokens es el tamaño con el que se
   * colgaba en producción. Este bloque no puede comerse una porción seria de
   * eso, y por eso va agrupado y sin descripciones.
   */
  it("es barato: entra en menos de 1.500 caracteres", () => {
    expect(catalogoDeCapacidades(SIN_NADA).length).toBeLessThan(1500);
  });

  it("cubre los terrenos grandes del sistema", () => {
    const texto = catalogoDeCapacidades(SIN_NADA);
    for (const tema of ["Catalogo", "Ventas", "WhatsApp", "Facebook", "Investigacion"]) {
      expect(texto).toContain(tema);
    }
  });
});
