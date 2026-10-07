/**
 * Producción, conversación 3 (07-10): el "cliente" era el bot de menú de otra
 * empresa y nuestro vendedor le contestó cuatro veces.
 */
import { describe, it, expect } from "vitest";
import { pareceUnBot } from "../contraparte-bot";

const CASO_REAL = [
  '{block":"ca37f42d-7fad-4d13-ac6b-f974c57664b8","i":0}"',
  '{block":"5309","i":0,"variable":1010,"exp":1}"',
  "🛒 Compra por WhatsApp",
  '¡Lo siento! No entendí lo que escribiste, puedes seleccionar la opción que necesites tocando el botón "Menú principal"',
  "Parece que no encuentras lo que necesitas.\n\n🛟 ¡Descuida! *Voy a comunicarte con uno de nuestros asesores* para ayudarte con tu solicitud",
];

describe("pareceUnBot", () => {
  it("el caso real es un bot", () => {
    expect(pareceUnBot(CASO_REAL).bot).toBe(true);
  });
  it("ya con los dos primeros mensajes (cargas crudas) se detecta, antes de la segunda respuesta", () => {
    expect(pareceUnBot(CASO_REAL.slice(0, 2)).bot).toBe(true);
  });
  it("un cliente normal no es bot", () => {
    expect(pareceUnBot(["Hola, ¿cuánto vale el corrector?", "¿hacen envíos a Cali?", "lo quiero, ¿cómo pago?"]).bot).toBe(false);
  });
  it("una sola frase rara de un cliente no alcanza", () => {
    expect(pareceUnBot(["hola", "vi el menú principal de su página y quiero el bolso"]).bot).toBe(false);
  });
});
