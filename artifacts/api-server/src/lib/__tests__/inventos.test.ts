/**
 * El agente no puede inventar para ganar la venta.
 *
 * Las dos primeras frases de acá abajo las escribió el bot de verdad, el
 * 2026-08-22, apenas se le pusieron instrucciones de venta: se sacó de la
 * manga un precio de la competencia y una tanda de alumnos que no existen.
 * Cuanto mejor argumenta, más tentado está de fabricar el dato que le falta —
 * por eso el freno va en la salida y no solo en el prompt.
 */
import { describe, it, expect } from "vitest";
import { detectarInventos, quitarInventos } from "../sales-playbook";

describe("Frenar lo que el agente inventa", () => {
  it("caza el precio de la competencia que se inventó en producción", () => {
    const r = detectarInventos(
      "Comparado con clases de piano que salen $30.000 mensuales, acá tenés todo en un solo pago.",
    );
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]!.motivo).toMatch(/competencia/i);
  });

  it("caza la prueba social que se inventó en producción", () => {
    const r = detectarInventos(
      "Tenemos alumnos de 50, 60 y hasta 70 años que empezaron igual y hoy tocan sus canciones favoritas.",
    );
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]!.motivo).toMatch(/prueba social/i);
  });

  it("caza escasez inventada", () => {
    expect(detectarInventos("Quedan pocos cupos, aprovechá.").length).toBeGreaterThan(0);
    expect(detectarInventos("Solo por hoy tenés este precio.").length).toBeGreaterThan(0);
  });

  it("caza reseñas y calificaciones inventadas", () => {
    expect(detectarInventos("Mirá las reseñas de nuestros compradores.").length).toBeGreaterThan(0);
  });

  it("NO molesta a un argumento honesto", () => {
    const honestos = [
      "El curso incluye 19 módulos en video y partituras, con acceso de por vida.",
      "Son $60.000 en un pago único. Tenés 7 días de garantía: si no te convence, se devuelve el dinero.",
      "Entiendo que es una decisión. ¿Qué te hace dudar: el precio o no estás seguro de que sea para vos?",
      "Se entrega por Google Drive apenas se confirma el pago.",
    ];
    for (const h of honestos) expect(detectarInventos(h)).toEqual([]);
  });

  it("saca solo la frase inventada y conserva el argumento bueno", () => {
    const texto =
      "Entiendo, $60.000 suena fuerte. Tenemos alumnos de 60 años que empezaron igual. " +
      "El acceso es de por vida y tenés 7 días de garantía.";
    const { limpio, quitadas } = quitarInventos(texto);

    expect(quitadas.length).toBe(1);
    expect(limpio).toContain("$60.000 suena fuerte");
    expect(limpio).toContain("7 días de garantía");
    expect(limpio).not.toMatch(/alumnos de 60/);
  });

  it("si al sacar las mentiras no queda nada útil, deja el original antes que callarse", () => {
    const texto = "Tenemos muchos clientes felices.";
    const { limpio, quitadas } = quitarInventos(texto);
    // Una respuesta imperfecta le gana a dejar al cliente sin respuesta.
    expect(limpio).toBe(texto);
    expect(quitadas).toEqual([]);
  });
});
