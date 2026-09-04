/**
 * "¡Buenísimo! 👇" y nada más.
 *
 * Medido contra producción el 2026-09-04, con el agente completo:
 *
 *   cliente: "vi su anuncio del curso de marketing digital, cuanto vale?"
 *   bot:     "¡Buenísimo que te haya llamado la atención!"
 *
 * Sin ficha, sin precio. El cliente preguntó cuánto vale y recibió un saludo.
 *
 * ── Dos candados buenos encadenados mal ──────────────────────────────────
 *
 * 1. El modelo escribió la intro esperando que la ficha saliera sola y NO puso
 *    el marcador `[CARD: 114]`.
 * 2. El forzado de ficha no la puso, porque exige que el texto NOMBRE el
 *    producto -- y "¡Buenísimo!" no lo nombra.
 * 3. El candado de promesas, que hace bien su trabajo, borró el "👇" por
 *    prometer algo que no salía.
 *
 * Cada paso es correcto por separado. Juntos dejan al cliente sin nada.
 *
 * La corrección: apuntar hacia abajo ES anunciar la ficha, y el detector de
 * promesas ya lo reconoce. Si el servidor SABE cuál es el producto, se adjunta
 * en vez de borrar la frase: cumplir la promesa es mejor que taparla.
 */
import { describe, it, expect } from "vitest";
import { promesasDe, promesasIncumplidas, sinLaPromesa } from "../promesas";

describe("el texto anuncia que algo viene abajo", () => {
  /** EL CASO, textual de producción. */
  it("'¡Buenísimo que te haya llamado la atención! 👇' anuncia una ficha", () => {
    expect(promesasDe("¡Buenísimo que te haya llamado la atención! 👇")).toContain("ficha");
  });

  it("las variantes que usa el bot también anuncian", () => {
    for (const t of ["¡Sí! Mirá 👇", "Acá te dejo 👇", "Te dejo la info 👇", "Mira esto 🔥 👇"]) {
      expect(promesasDe(t), t).toContain("ficha");
    }
  });

  /** Sin flecha ni anuncio, no hay nada que forzar: un texto normal no debe
   *  arrastrar una ficha que nadie pidió. */
  it("un texto sin anuncio no promete ficha", () => {
    expect(promesasDe("Contame un poco más qué buscás y te ayudo.")).not.toContain("ficha");
    expect(promesasDe("El curso dura 6 meses.")).not.toContain("ficha");
  });

  it("texto vacío no promete nada", () => {
    expect(promesasDe("")).toEqual([]);
    expect(promesasDe(undefined as any)).toEqual([]);
  });
});

describe("y la promesa se considera cumplida solo si la ficha SALE", () => {
  const texto = "¡Buenísimo que te haya llamado la atención! 👇";

  it("con ficha adjunta, no queda incumplida", () => {
    expect(promesasIncumplidas(texto, { hayFicha: true, seccion: "completa", mensajes: [texto] })).toEqual([]);
  });

  /**
   * Este es el estado que producía el mensaje vacío: la promesa queda
   * incumplida y el candado borra la frase. Con el forzado corregido este caso
   * ya no debería llegar acá -- la ficha se adjunta antes.
   */
  it("sin ficha, queda incumplida y por eso se borraba la frase", () => {
    expect(promesasIncumplidas(texto, { hayFicha: false, seccion: null, mensajes: [texto] })).toContain("ficha");
  });
});

/**
 * "¡ Buenísimo": el signo de apertura suelto.
 *
 * Medido en la misma respuesta de producción del 2026-09-04. Al cliente le
 * llegó "¡ Buenísimo que te haya llamado la atención!" -- con el espacio.
 *
 * La causa: el separador de frases de `sinLaPromesa` cortaba después de `¡` y
 * `¿`, que son signos de APERTURA. Una frase no termina en ellos: empieza.
 * Cortar ahí dejaba el signo como un pedazo aparte, y al volver a unir los
 * pedazos con un espacio quedaba separado de su palabra.
 *
 * Es el mismo defecto que ya se había corregido en `emojis-con-medida.ts` --
 * "un bot que escribe '¡ Hola' parece roto, y es lo primero que el cliente
 * lee" -- reaparecido por otra puerta.
 */
describe("al quitar una promesa no se rompe la puntuación", () => {
  const quitando = (t: string) => sinLaPromesa(t, promesasDe(t) as any);

  it("no deja el signo de apertura separado de su palabra", () => {
    const r = quitando("¡Buenísimo que te haya llamado la atención! 👇");
    expect(r).toBe("¡Buenísimo que te haya llamado la atención!");
    expect(r).not.toMatch(/[¡¿]\s/);
  });

  it("tampoco con el signo de pregunta", () => {
    const r = quitando("¿Querés que te lo muestre? Mirá 👇");
    expect(r).toBe("¿Querés que te lo muestre?");
    expect(r).not.toMatch(/[¡¿]\s/);
  });

  it("conserva las frases que no prometen nada", () => {
    expect(quitando("¡Sí! Te dejo 👇")).toBe("¡Sí!");
  });

  /** Si al quitar la promesa queda un signo de apertura huérfano al final,
   *  tampoco puede salir así. */
  it("no deja un signo de apertura colgando al final", () => {
    expect(quitando("Te dejo la ficha 👇")).toBe("");
  });
});
