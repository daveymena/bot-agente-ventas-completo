import { describe, it, expect } from "vitest";
import { medirEmojis } from "../emojis-con-medida";
import { verificarPrecios } from "../precio-verificado";

const CAT = [{ id: 124, name: "IA 2026", price: 60000 }];

/**
 * Mensajes REALES que recibio un cliente el 2026-09-02:
 *
 *   "¡ Buenisimo que preguntes por el de piano!"
 *   "¿ Listo para empezar?"
 *   "El curso tiene un valor de $60. 000 COP"
 *
 * Ninguno es un error de contenido, y por eso ningun candado los miraba. Pero
 * el cliente los lee, y un bot que escribe "¡ Hola" parece roto.
 */
describe("El signo de apertura va pegado a la palabra", () => {
  it("el emoji se va y el espacio no se queda", () => {
    expect(medirEmojis("¡🎉🎊🎈 Buenisimo!").texto).not.toMatch(/¡\s/);
    expect(medirEmojis("¿🚀🔥🎯 Listo para empezar?").texto).not.toMatch(/¿\s/);
  });

  it("y el texto sigue entero", () => {
    const r = medirEmojis("¿🚀🔥🎯 Listo para empezar?");
    expect(r.texto).toMatch(/Listo para empezar/);
  });

  it("no toca un signo que ya estaba bien", () => {
    expect(medirEmojis("¡Hola! ¿Cómo estás?").texto).toBe("¡Hola! ¿Cómo estás?");
  });
});

describe("Un precio partido por un espacio se repara", () => {
  it("el caso real: «$60. 000» vuelve a ser $60.000", () => {
    const r = verificarPrecios("El curso tiene un valor de $60. 000 COP.", CAT as any, [124]);
    expect(r.texto).toMatch(/\$60\.000/);
    expect(r.inventados).toEqual([]);
  });

  it("y no se borra la frase por leerlo como sesenta pesos", () => {
    // Sin la reparacion, el monto se cortaba en "$60." = 60, que no es el
    // precio de nada, y la oracion entera se daba por inventada.
    const r = verificarPrecios("Vale $60. 000 COP, pago único.", CAT as any, [124]);
    expect(r.texto).toMatch(/pago único/);
  });

  it("también con el espacio del otro lado", () => {
    expect(verificarPrecios("Son $60 .000 COP.", CAT as any, [124]).texto).toMatch(/\$60\.000/);
  });

  it("un precio bien escrito no se toca", () => {
    const t = "El curso cuesta $60.000 COP y el acceso es de por vida.";
    expect(verificarPrecios(t, CAT as any, [124]).texto).toBe(t);
  });

  it("y un precio inventado se sigue sacando aunque venga partido", () => {
    const r = verificarPrecios("Te lo dejo en $45. 000 COP.", CAT as any, [124]);
    expect(r.texto).not.toMatch(/45/);
    expect(r.inventados.length).toBeGreaterThan(0);
  });
});
