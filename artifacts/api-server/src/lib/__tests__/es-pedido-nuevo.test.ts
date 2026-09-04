/**
 * "Atlas solo entiende sí".
 *
 * Los mensajes de abajo son TEXTUALES del chat que trajo el admin el
 * 2026-09-04. Con un plan esperando confirmación, pidió tres veces ver el copy
 * y las tres recibió "🤔 No me quedó claro si querés que lo haga".
 *
 * La causa: la lista de verbos exigía `\b` delante, y en castellano el verbo
 * viene con prefijo y con el pronombre pegado -- "DEmuéstrale", "muéstraME".
 * `\bmuestra` no casa dentro de "demuestrale", así que un pedido clarísimo se
 * leyó como un "sí" mal escrito.
 */
import { describe, it, expect } from "vitest";
import { arrancaPedidoNuevo } from "../es-pedido-nuevo";

describe("pedidos reales que Atlas leyó como intentos de decir 'sí'", () => {
  it.each([
    "Demuéstrale el copi",
    "Entregamos el copi completo para ver q vas a publicar ?",
    "Preparar el ponzo y dejar lista la muestra del copo.",
    "muéstrame el texto",
    "pasámelo antes de publicar",
    "dame el copy",
  ])("reconoce: %s", (msg) => {
    expect(arrancaPedidoNuevo(msg)).toBe(true);
  });

  /** Una pregunta no es una confirmación, por corta que sea. */
  it.each(["¿y el copy?", "que vas a publicar", "cual es el texto"])(
    "una pregunta no es un sí: %s",
    (msg) => {
      expect(arrancaPedidoNuevo(msg)).toBe(true);
    },
  );
});

describe("lo que SÍ es un intento de confirmar", () => {
  /**
   * REGRESIÓN CARA (2026-08-12): antes, cualquier cosa que no fuera una
   * aprobación exacta borraba el plan en silencio y Atlas volvía a proponer lo
   * mismo. El admin confirmó tres veces sin que se ejecutara nada. Estas
   * TIENEN que seguir manteniendo el plan vivo.
   */
  it.each(["oka", "sale", "dale", "hazlo pues", "listo", "sí", "si", "ok", "va", "perfecto"])(
    "no arranca un pedido nuevo: %s",
    (msg) => {
      expect(arrancaPedidoNuevo(msg)).toBe(false);
    },
  );

  /** Un dictado que salió mal tampoco: ahí se pregunta, que es lo correcto. */
  it("un audio mal transcrito no se toma como pedido", () => {
    expect(arrancaPedidoNuevo("A taladrímic.")).toBe(false);
  });

  it("vacío no rompe", () => {
    expect(arrancaPedidoNuevo("")).toBe(false);
    expect(arrancaPedidoNuevo(undefined as any)).toBe(false);
  });

  /**
   * `cre` es corto y por eso se comprueba con límite de palabra: sin eso
   * casaría dentro de palabras comunes y cualquier mensaje pasaría por pedido.
   */
  it("no casa dentro de palabras que solo contienen la raíz", () => {
    expect(arrancaPedidoNuevo("increible")).toBe(false);
    expect(arrancaPedidoNuevo("creo que si")).toBe(false);
  });
});

/**
 * Auditoría del propio módulo, el mismo día que se escribió.
 *
 * Buscaba las raíces en CUALQUIER parte de la palabra, y con eso cinco de nueve
 * confirmaciones reales se leían como pedido nuevo -- o sea que el plan se
 * descartaba, que es la regresión de agosto que este archivo dice proteger.
 *
 * La respuesta correcta no era ni buscar suelto (demasiado flojo) ni exigir
 * límite de palabra al principio (demasiado duro: ese era el bug original con
 * "DEmuéstrale"). Es la morfología: la raíz lleva su vocal temática y solo
 * admite terminaciones de verbo, con el pronombre pegado si lo hay.
 */
describe("la raíz tiene que terminar como un verbo", () => {
  it.each([
    ["dale, que quede bien creativo", "creativo no es del verbo crear"],
    ["ok generalmente si", "generalmente no es del verbo generar"],
  ])("%s — %s", (msg) => {
    expect(arrancaPedidoNuevo(msg)).toBe(false);
  });

  it.each(["creame otro anuncio", "generame el copy", "Demuéstrale el copi", "pasámelo"])(
    "pero el verbo de verdad sigue contando: %s",
    (msg) => {
      expect(arrancaPedidoNuevo(msg)).toBe(true);
    },
  );
});
