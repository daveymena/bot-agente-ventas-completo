/**
 * Distinguir nuestro propio eco de lo que contestó otro es lo único que hace
 * posible observar sin duplicar. Si esto falla, o se pierde lo que dijo Meta,
 * o el historial se llena de mensajes repetidos.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  anotarMensajePropio,
  cuantosAnotados,
  loMandamosNosotros,
  olvidarTodo,
} from "../mensajes-propios";

beforeEach(() => olvidarTodo());

describe("lo nuestro se reconoce", () => {
  it("un id anotado es nuestro", () => {
    anotarMensajePropio("ABC123");
    expect(loMandamosNosotros("ABC123")).toBe(true);
  });

  it("un id que nunca anotamos NO es nuestro", () => {
    // Es el mensaje de la IA de Meta o del dueño desde el celular: se guarda.
    anotarMensajePropio("ABC123");
    expect(loMandamosNosotros("META-999")).toBe(false);
  });

  it("anotar dos veces el mismo no lo duplica", () => {
    anotarMensajePropio("X");
    anotarMensajePropio("X");
    expect(cuantosAnotados()).toBe(1);
  });
});

describe("ante la duda, se guarda", () => {
  it.each([null, undefined, "", "   "])("un id vacío (%s) NO cuenta como nuestro", (v) => {
    // Preferimos un mensaje repetido en el historial antes que perder lo que
    // le dijeron al cliente, que es justo lo que se está arreglando.
    expect(loMandamosNosotros(v as any)).toBe(false);
  });

  it("un id vacío tampoco se anota", () => {
    anotarMensajePropio("");
    anotarMensajePropio(null);
    anotarMensajePropio(undefined);
    expect(cuantosAnotados()).toBe(0);
  });
});

describe("no crece para siempre", () => {
  it("se queda con los últimos y suelta los viejos", () => {
    // Un Set que solo crece es una fuga de memoria en un proceso que vive
    // semanas. El eco propio vuelve en segundos, así que la ventana sobra.
    for (let i = 0; i < 600; i++) anotarMensajePropio(`id-${i}`);
    expect(cuantosAnotados()).toBeLessThanOrEqual(500);
    // El más reciente sigue estando: es el que puede volver por el socket.
    expect(loMandamosNosotros("id-599")).toBe(true);
    // El más viejo ya no, y está bien: ese eco llegó hace rato.
    expect(loMandamosNosotros("id-0")).toBe(false);
  });

  it("recordar el tope completo sigue funcionando", () => {
    for (let i = 0; i < 500; i++) anotarMensajePropio(`k${i}`);
    expect(loMandamosNosotros("k0")).toBe(true);
    expect(loMandamosNosotros("k499")).toBe(true);
  });
});
