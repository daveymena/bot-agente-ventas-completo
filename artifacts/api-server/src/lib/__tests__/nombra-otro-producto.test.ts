/**
 * Chat real del dueño, 12-09-2026, con el piano en foco:
 *
 *   cliente: "¿cuánto vale el curso de Excel?"   (Excel NO está en el catálogo)
 *   bot:     "¡Claro que sí! Mira 👇" + precio del PIANO ($60.000)
 *
 * El modelo había escrito "no lo tengo". El servidor, al ver que pedía
 * "precio" y no había ficha, cayó a `memory.currentProductId`, forzó la
 * sección de precio del piano y reemplazó la negación. Cuando el cliente
 * nombra OTRA cosa, el producto en foco no es la respuesta.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nombraOtraCosaQueElFoco } from "../conversation-engine";

const PIANO = "Curso de Piano Online";

describe("nombraOtraCosaQueElFoco", () => {
  it("Excel con el piano en foco: nombró otra cosa", () => {
    expect(nombraOtraCosaQueElFoco(PIANO, "¿cuánto vale el curso de Excel?")).toBe(true);
    expect(nombraOtraCosaQueElFoco(PIANO, "y el Renovador de baterías cuánto está")).toBe(true);
  });
  it("preguntas sobre lo que se viene hablando NO cuentan", () => {
    expect(nombraOtraCosaQueElFoco(PIANO, "¿cuánto vale?")).toBe(false);
    expect(nombraOtraCosaQueElFoco(PIANO, "¿y ese cuánto cuesta?")).toBe(false);
    expect(nombraOtraCosaQueElFoco(PIANO, "¿el de piano cuánto vale?")).toBe(false);
    expect(nombraOtraCosaQueElFoco(PIANO, "¿tienes página web?")).toBe(false);
    expect(nombraOtraCosaQueElFoco(PIANO, "cómo pago")).toBe(false);
  });
});

describe("agent.ts no cae al producto en foco si nombró otro", () => {
  const src = readFileSync(join(__dirname, "..", "agent.ts"), "utf8");
  it("la sección forzada respeta nombraOtroProducto", () => {
    expect(src).toMatch(/decision\.productoDelMensaje\?\.id \?\? \(decision\.nombraOtroProducto \? null : memory\.currentProductId\)/);
  });
  it("la corrección de tarjeta al foco también", () => {
    expect(src).toMatch(/&& !decision\.nombraOtroProducto\n\s*\) \{/);
  });
});

import { preguntaPorVarios } from "../ficha-parcial";

const NOMBRES = ["Curso de Piano Completo: De Cero a Nivel Avanzado", "Pack Contabilidad", "Curso de Idiomas", "Marketing Digital"];

describe("preguntaPorVarios: la sección de UN producto no contesta una suma", () => {
  it("piano + contabilidad + idiomas, total", () => {
    expect(preguntaPorVarios("si me llevo piano, contabilidad e idiomas juntos cuanto seria en total?", NOMBRES)).toBe(true);
    expect(preguntaPorVarios("¿cuánto me salen los dos?", NOMBRES)).toBe(true);
    expect(preguntaPorVarios("el de piano y el de contabilidad cuánto valen", NOMBRES)).toBe(true);
  });
  it("uno solo sigue siendo uno solo", () => {
    expect(preguntaPorVarios("¿cuánto vale el de piano?", NOMBRES)).toBe(false);
    expect(preguntaPorVarios("¿cuánto vale?", NOMBRES)).toBe(false);
    expect(preguntaPorVarios("cuanto vale el curso de Excel?", NOMBRES)).toBe(false);
  });
});

describe("el parser descarta la tarjeta del foco en los tres casos del chat real", () => {
  const src = readFileSync(join(__dirname, "..", "agent.ts"), "utf8");
  it("nombró otra cosa / varios / ya pagó", () => {
    expect(src).toMatch(/decision\.nombraOtroProducto && resolvedId === memory\.currentProductId/);
    expect(src).toMatch(/else if \(preguntaPorVarios\(String\(lastText \|\| ""\), nombres\)\)/);
    expect(src).toMatch(/else if \(isPaymentProofIntent\(String\(lastText \|\| ""\)\)\)/);
  });
  it("la sección forzada tampoco sale con varios ni tras 'ya pagué'", () => {
    expect(src).toMatch(/pideAlgoEntregable\(String\(lastText \|\| ""\)\)\n\s*&& !preguntaPorVarios\(/);
  });
});

import { verificarPrecios, sumasDe } from "../precio-verificado";

describe("la suma de los que pidió juntos es un monto real", () => {
  const P = [
    { id: 123, name: "Curso de Piano Completo", price: 60000 },
    { id: 130, name: "Pack Contabilidad", price: 60000 },
    { id: 117, name: "Pack Idiomas", price: 60000 },
    { id: 124, name: "Inteligencia Artificial 2026", price: 34900 },
  ];
  it("$180.000 por los tres no se borra", () => {
    const texto = "Los tres te salen en $180.000 COP, Duvier — son $60.000 cada uno, pago único.";
    const sin = verificarPrecios(texto, P as any, [123]);
    expect(sin.inventados).toContain("$180.000");
    const con = verificarPrecios(texto, P as any, [123], P.slice(0, 3) as any);
    expect(con.inventados).toEqual([]);
    expect(con.texto).toContain("$180.000");
  });
  it("pero un combo inventado sigue sin pasar", () => {
    const r = verificarPrecios("Los tres a $85.000 en combo.", P as any, [123], P.slice(0, 3) as any);
    expect(r.inventados).toContain("$85.000");
  });
  it("sumasDe: de 2 a 4 productos", () => {
    const s = sumasDe(P as any);
    expect(s.has(120000)).toBe(true);
    expect(s.has(180000)).toBe(true);
    expect(s.has(94900)).toBe(true);
    expect(s.has(85000)).toBe(false);
  });
});
