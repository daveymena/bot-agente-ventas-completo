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

/**
 * ============================================================
 * EL HUECO DE PLANTILLA QUE LLEGO A UN CLIENTE
 * ============================================================
 *
 * Produccion, 2026-09-05 11:58. El dueno lo reenvio desde su propio WhatsApp.
 */
describe("un marcador sin llenar no puede salir", () => {
  it("el $X.XXX que recibio un cliente real", () => {
    // El texto es TEXTUAL del mensaje que salio.
    const r = verificarPrecios("💰 El valor es de $X.XXX COP (pago único)", CATALOGO);
    expect(r.inventados.length).toBeGreaterThan(0);
    expect(r.texto).not.toContain("X.XXX");
  });

  it("se cae solo la linea del hueco, no el mensaje entero", () => {
    // Lo que importa: el cliente igual recibe la informacion buena.
    const r = verificarPrecios(
      "El Curso de Piano te lleva de cero a avanzado.\n💰 El valor es de $X.XXX COP\nAcceso de por vida.",
      CATALOGO,
    );
    expect(r.texto).toContain("de cero a avanzado");
    expect(r.texto).toContain("Acceso de por vida");
    expect(r.texto).not.toContain("X.XXX");
  });

  it.each([
    "El valor es de $XXX COP",
    "Cuesta $XX.XXX pesos",
    "El precio es [PRECIO] COP",
    "Sale {{precio}} pesos",
    "El valor es <PRECIO> COP",
    "Cuesta $___ COP",
  ])("tambien atrapa: %s", (t) => {
    expect(verificarPrecios(t, CATALOGO).inventados.length).toBeGreaterThan(0);
  });

  it("si NO queda nada, se le promete la ficha en vez de dejarlo sin precio", () => {
    const r = verificarPrecios("El valor es de $X.XXX COP", CATALOGO);
    expect(r.texto).toContain("precio exacto");
  });

  it("un precio REAL sigue pasando: el candado no puede volverse paranoico", () => {
    const r = verificarPrecios("El Curso de Piano está en $20.000 COP.", CATALOGO);
    expect(r.inventados).toHaveLength(0);
    expect(r.texto).toContain("$20.000");
  });

  it("la ficha real del piano pasa entera", () => {
    // Texto TEXTUAL de la ficha que manda el servidor. Si el detector de
    // marcadores mordiera acá, el cliente se quedaria sin la ficha.
    const ficha = `🎹 CURSO DE PIANO COMPLETO: DE CERO A NIVEL AVANZADO

Aprende a tocar piano paso a paso, desde los fundamentos hasta las técnicas avanzadas, a tu propio ritmo. Ideal para principiantes, intermedios y avanzados, para todas las edades.

🎬 19 módulos en video con teoría y lenguaje musical, lectura rítmica, fraseo y expresión.
🎵 Repertorio: 5 valses de Alberto Martínez, baladas, pop, blues y jazz.
📱 Estudia desde tu celular o computador, donde quieras.`;
    const r = verificarPrecios(ficha, CATALOGO);
    expect(r.inventados).toHaveLength(0);
    expect(r.texto).toContain("19 módulos");
    expect(r.texto).toContain("Alberto Martínez");
  });
});
