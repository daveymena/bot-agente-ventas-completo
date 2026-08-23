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
import { detectarInventos, quitarInventos, quitarMuletillaDeApertura } from "../sales-playbook";

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

describe("Precio ajeno inventado sin decir el monto", () => {
  it("caza la comparación por equivalencia que se coló en la segunda prueba", () => {
    // Frase real del bot, 2026-08-22: no dice "$", así que la primera versión
    // del detector la dejó pasar. Igual está afirmando lo que cobra un tercero.
    const r = detectarInventos(
      "Es el precio de unas 3-4 clases particulares presenciales y te llevas 19 módulos completos.",
    );
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]!.motivo).toMatch(/competencia/i);
  });

  it("caza otras formas de la misma invención", () => {
    expect(detectarInventos("Equivale a dos meses de clases con un profesor.").length).toBeGreaterThan(0);
    expect(detectarInventos("Por lo que pagarías en una academia, acá tenés todo.").length).toBeGreaterThan(0);
  });

  it("pero no molesta si compara contra el PROPIO producto", () => {
    expect(detectarInventos("Es un pago único de $60.000, no una mensualidad.")).toEqual([]);
    expect(detectarInventos("Tenés 19 módulos y acceso de por vida.")).toEqual([]);
  });
});

describe("Muletillas de apertura que delatan al bot", () => {
  it("saca el arranque vacío y deja el mensaje en pie", () => {
    // Frases reales del bot, 2026-08-22.
    expect(quitarMuletillaDeApertura("¡Perfecto! Los enlaces de pago del Curso de Piano están listos abajo 🎹"))
      .toBe("Los enlaces de pago del Curso de Piano están listos abajo 🎹");
    expect(quitarMuletillaDeApertura("¡Excelente! El curso está pensado para principiantes absolutos."))
      .toBe("El curso está pensado para principiantes absolutos.");
  });

  it("no toca un mensaje que arranca con contenido", () => {
    const bueno = "Entiendo que 60.000 pesos se sientan altos si lo ves como un gasto único.";
    expect(quitarMuletillaDeApertura(bueno)).toBe(bueno);
  });

  it("si la muletilla ERA el mensaje, no lo deja vacío", () => {
    expect(quitarMuletillaDeApertura("¡Perfecto!")).toBe("¡Perfecto!");
    expect(quitarMuletillaDeApertura("Dale 👍")).toBe("Dale 👍");
  });

  it("no rompe una palabra que empieza igual", () => {
    const t = "Claramente te sirve: arranca desde cero y no necesitás saber nada.";
    expect(quitarMuletillaDeApertura(t)).toBe(t);
  });
});

describe("La muletilla no puede comerse el arranque de la frase", () => {
  it("NO toca 'Buenísimo que preguntes' — es la oración, no una muletilla", () => {
    // Caso real, en vivo, minutos después de desplegar la primera versión:
    // al cliente le llegó "Que preguntes por el de piano!" — sin sujeto.
    const t = "¡Buenísimo que preguntes por el de piano! Te lo dejo acá para que lo veas con calma.";
    expect(quitarMuletillaDeApertura(t)).toBe(t);
  });

  it("NO toca otras muletillas que arrancan una oración", () => {
    for (const t of [
      "Claro que sí, el curso arranca desde cero y no necesitás saber nada.",
      "Perfecto para lo que buscás: son 19 módulos desde cero hasta avanzado.",
      "Listo para empezar cuando quieras, el acceso llega apenas confirmás.",
      "Dale una mirada a la ficha y me contás qué te parece.",
    ]) {
      expect(quitarMuletillaDeApertura(t), `no debería tocar: ${t}`).toBe(t);
    }
  });

  it("SÍ saca la exclamación suelta, que era el problema original", () => {
    expect(quitarMuletillaDeApertura("¡Perfecto! Los enlaces de pago están listos abajo 🎹"))
      .toBe("Los enlaces de pago están listos abajo 🎹");
    expect(quitarMuletillaDeApertura("¡Excelente! El curso está pensado para principiantes."))
      .toBe("El curso está pensado para principiantes.");
  });
});
