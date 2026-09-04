import { describe, it, expect } from "vitest";
import { verificarPrecios, montoANumero } from "../precio-verificado";

/**
 * Los montos son los REALES de la prueba en vivo del 2026-08-25 sobre el bot
 * +57 304 2748687 (conversacion 1, mensajes 249-264).
 */
const CATALOGO = [
  { id: 123, name: "Curso de Piano Completo", price: 20000 },
  { id: 200, name: "Curso de Excel", price: 20000 },
  { id: 201, name: "PACK IDIOMAS", price: 20000 },
  { id: 202, name: "Pack Programacion", price: 60000 },
];

describe("lee montos en formato colombiano", () => {
  it("punto y coma son separador de miles", () => {
    expect(montoANumero("$20.000")).toBe(20000);
    expect(montoANumero("$20,000")).toBe(20000);
    expect(montoANumero("85.000 COP")).toBe(85000);
    expect(montoANumero("$ 100.000")).toBe(100000);
  });
});

describe("ningun monto sale si no es de un producto real", () => {
  it("el combo de $85.000 que no existe no puede salir", () => {
    // Mensaje 264 real: ofrecio un combo inexistente, sin link ni forma de
    // entregarlo.
    const r = verificarPrecios(
      "El combo de los 3 está a $85.000 COP y ahí sí te llegan Piano + Excel + Idiomas.",
      CATALOGO);
    expect(r.inventados.length).toBeGreaterThan(0);
    expect(r.texto).not.toContain("85.000");
  });

  it("el ahorro inventado tampoco sale", () => {
    const r = verificarPrecios("Combo de los 3: $100.000 COP (ahorrás $25.000)", CATALOGO);
    expect(r.texto).not.toContain("100.000");
    expect(r.texto).not.toContain("25.000");
  });

  it("cotizar Excel a $45.000 cuando vale $20.000 no pasa", () => {
    const r = verificarPrecios("- Curso de Excel: $45.000 COP", CATALOGO, [200]);
    expect(r.inventados).toContain("$45.000");
    expect(r.texto).not.toContain("45.000");
  });

  it("un precio que es de OTRO producto tampoco pasa para el del contexto", () => {
    // $60.000 existe en el catalogo (Pack Programacion), pero el producto en
    // contexto es el piano, que vale $20.000. Este es el caso que se colaba:
    // el monto era "razonable" y ademas real, solo que de otro producto.
    const r = verificarPrecios(
      "💰 $60.000 COP\nCurso de Piano Completo: De Cero a Nivel Avanzado.",
      CATALOGO, [123]);
    expect(r.inventados).toContain("$60.000");
    expect(r.texto).not.toContain("60.000");
  });
});

describe("no molesta cuando el precio es correcto", () => {
  it("el precio real del producto en contexto sale intacto", () => {
    const t = "El curso de Excel tiene un valor de $20.000, pago único y acceso de por vida.";
    const r = verificarPrecios(t, CATALOGO, [200]);
    expect(r.inventados).toHaveLength(0);
    expect(r.texto).toBe(t);
  });

  it("sin producto en contexto vale cualquier precio del catalogo", () => {
    const r = verificarPrecios("El Pack Programación está a $60.000 COP.", CATALOGO);
    expect(r.inventados).toHaveLength(0);
  });

  it("un mensaje sin montos no se toca", () => {
    const t = "El curso te lleva desde cero hasta nivel avanzado, a tu ritmo.";
    expect(verificarPrecios(t, CATALOGO, [200]).texto).toBe(t);
  });

  it("saca solo la oracion del monto malo y conserva el resto", () => {
    const r = verificarPrecios(
      "El curso de Excel es completo y práctico. Vale $45.000 COP. Incluye macros y tablas dinámicas.",
      CATALOGO, [200]);
    expect(r.texto).toContain("completo y práctico");
    expect(r.texto).toContain("macros y tablas dinámicas");
    expect(r.texto).not.toContain("45.000");
  });

  it("si al sacar los montos no queda nada, remite a la ficha", () => {
    const r = verificarPrecios("💰 $85.000 COP", CATALOGO, [123]);
    expect(r.texto).toMatch(/ficha/i);
    expect(r.texto).not.toContain("85.000");
  });

  it("sin catalogo no bloquea nada (no se puede verificar)", () => {
    const t = "El curso vale $85.000.";
    expect(verificarPrecios(t, []).texto).toBe(t);
  });
});
