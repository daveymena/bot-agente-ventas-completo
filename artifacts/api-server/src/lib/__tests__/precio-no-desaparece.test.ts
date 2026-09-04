import { describe, it, expect } from "vitest";
import { verificarPrecios, montoANumero } from "../precio-verificado";

/**
 * El precio desapareciendo del mensaje.
 *
 * Probado contra producción el 2026-08-30, con el curso de IA ($60.000 COP):
 *
 *   "💰 — pago único."          ← falta el número
 *   "💰 El pago es único, ."    ← coma suelta, texto roto
 *
 * El cliente lee un mensaje mutilado justo cuando está por decidir. Peor que
 * no decir el precio: parece un error del sistema.
 */
const CURSO = [{ id: 124, name: "IA 2026", price: 60000, currency: "COP" }] as any;

describe("El precio REAL no se puede borrar del mensaje", () => {
  it("lee el formato colombiano", () => {
    expect(montoANumero("$60.000")).toBe(60000);
    expect(montoANumero("60.000 COP")).toBe(60000);
    expect(montoANumero("$60,000")).toBe(60000);
  });

  it("deja pasar el precio correcto, escrito de varias formas", () => {
    for (const t of [
      "💰 $60.000 COP — pago único.",
      "El curso cuesta $60.000 COP y es pago único.",
      "Son 60.000 pesos, pago único.",
    ]) {
      const r = verificarPrecios(t, CURSO, [124]);
      expect(r.inventados, t).toEqual([]);
      expect(r.texto, t).toBe(t);
    }
  });

  it("y sigue sacando el precio que NO existe", () => {
    // La regla tiene que seguir sirviendo: un precio inventado es la mentira
    // que el cliente puede verificar solo.
    const r = verificarPrecios("Te lo dejo en $30.000 COP.", CURSO, [124]);
    expect(r.inventados.length).toBeGreaterThan(0);
    expect(r.texto).not.toContain("30.000");
  });
});

describe("Reproducir el caso de produccion", () => {
  it("el precio llega como TEXTO desde Postgres, no como numero", () => {
    // `products.price` es numeric en Postgres: el driver lo devuelve "60000.00".
    // Mi primera prueba lo pasó como número y por eso pasó en verde mientras
    // producción fallaba. La prueba tiene que usar la forma REAL del dato.
    const comoLlega = [{ id: 124, name: "IA 2026", price: "60000.00", currency: "COP" }] as any;
    const r = verificarPrecios("💰 $60.000 COP — pago único.", comoLlega, [124]);
    expect(r.inventados).toEqual([]);
    expect(r.texto).toContain("60.000");
  });

  it("sin producto en contexto tampoco lo borra", () => {
    // Si `idsEnContexto` viene vacío, el precio sigue siendo real: está en el
    // catálogo. Borrarlo ahí sería mutilar un mensaje correcto.
    const cat = [{ id: 124, name: "IA 2026", price: "60000.00", currency: "COP" }] as any;
    const r = verificarPrecios("💰 El pago es único, $60.000 COP.", cat, []);
    expect(r.texto).toContain("60.000");
  });

  it("un precio con centavos escrito por el modelo se reconoce", () => {
    const cat = [{ id: 124, name: "IA 2026", price: "60000.00", currency: "COP" }] as any;
    for (const t of ["Son $60.000,00 COP.", "Cuesta $60000 COP."]) {
      expect(verificarPrecios(t, cat, [124]).inventados, t).toEqual([]);
    }
  });
});
