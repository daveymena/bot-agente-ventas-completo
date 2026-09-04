import { describe, it, expect } from "vitest";
import { emojiDelProducto, emojiDeCaracteristica } from "../whatsapp";

/**
 * ¿La ficha sirve a un negocio que NO vende cursos?
 *
 * El admin lo preguntó así el 2026-09-01: *"un negocio que no tenga maqueta,
 * ¿no debería la IA reorganizar las cosas, de forma real y racional?"*.
 *
 * La respuesta encontrada al revisar: el ESQUELETO de la ficha ya se adapta
 * --muestra solo lo que el catálogo tiene, distingue físico de digital, no
 * ofrece video si no hay-- pero algunas decisiones estaban escritas mirando UN
 * catálogo. La peor era el emoji que encabeza la ficha:
 *
 *     nombre.includes("PIANO") ? "🎹" : ... : "💻"
 *
 * Cuatro reglas y un respaldo de laptop. Una panadería vendiendo una torta
 * abría su ficha con 💻. Una tienda de ropa, 💻. Un taller, 💻.
 *
 * Estas pruebas son deliberadamente de OTROS rubros: son las que fallan
 * cuando alguien vuelve a escribir una regla pensando solo en este catálogo.
 */

describe("la ficha abre bien en cualquier rubro", () => {
  const CASOS: Array<[string, string]> = [
    ["Torta de chocolate", "🍰"],
    ["Pizza familiar", "🍽️"],
    ["Camisa blanca de lino", "👕"],
    ["Tenis deportivos talla 42", "👟"],
    ["Anillo de plata", "💍"],
    ["Esmalte para uñas", "💅"],
    ["Sofá de tres puestos", "🛋️"],
    ["Repuesto para motor", "🔧"],
    ["Cargador para celular", "📱"],
    ["Juguete para bebé", "🧸"],
    ["Maceta con planta", "🌿"],
  ];

  for (const [producto, esperado] of CASOS) {
    it(`"${producto}" no abre con un ícono de laptop`, () => {
      const e = emojiDelProducto(producto);
      expect(e, producto).not.toBe("💻");
      expect(e, producto).toBe(esperado);
    });
  }

  it("lo que no se reconoce cae en una caja, no en una laptop", () => {
    // 📦 no afirma nada sobre qué se vende. 💻 sí, y para casi cualquier
    // negocio afirma algo falso.
    // "Consultoría empresarial" no contiene ninguna palabra del diccionario
    // --"empresarial" no es "negocio"-- así que cae en la caja. Correcto: es
    // preferible un ícono neutro a uno que afirme de qué se trata.
    expect(emojiDelProducto("Servicio de consultoría empresarial XYZ")).toBe("📦");
    expect(emojiDelProducto("Zxqwv 3000")).toBe("📦");
    expect(emojiDelProducto("")).toBe("📦");
  });

  it("si el nombre no dice nada, la CATEGORÍA decide", () => {
    // El dueño cargó la categoría: es un dato real y hay que usarlo antes de
    // rendirse al respaldo.
    expect(emojiDelProducto("Modelo A-14", "Calzado")).toBe("👟");
    expect(emojiDelProducto("Referencia 220", "Herramientas")).toBe("🔧");
  });

  it("y lo que este catálogo ya resolvía bien, sigue igual", () => {
    // El cambio no puede empeorar al negocio que hoy está vendiendo.
    expect(emojiDelProducto("Curso de Piano Completo")).toBe("🎼");
    expect(emojiDelProducto("Pack de Excel avanzado")).toBe("📊");
    expect(emojiDeCaracteristica("Certificado al finalizar")).toBe("📜");
  });
});
