/**
 * "le he pedido mil veces publicar un anuncio con objetivo a la landing page y
 * lo repite a WhatsApp" (dueño, 24-09-2026). Frases reales del chat de Atlas.
 */
import { describe, test, expect } from "vitest";
import { interpretarObjetivo, pedidoDelAdmin } from "../objetivos-campana";
import { leerPreferenciaWeb } from "../landing/destino-del-producto";

describe("la landing se entiende como la escribe el dueño", () => {
  test.each([
    "publica el anuncio con objetivo a la landing page",
    "hazlo para la landipage",
    "que lleve a la landin page",
    "Cual es la de la landipage osea dame el link",
  ])("%s -> web a la landing", (t) => {
    expect(interpretarObjetivo(t)).not.toBe("mensajes");
    expect(leerPreferenciaWeb(pedidoDelAdmin(t))).toBe("landing");
  });

  test("negar WhatsApp no es pedirlo", () => {
    expect(interpretarObjetivo("no lo mandes a whatsapp, a la landipage")).toBe("trafico");
    expect(interpretarObjetivo("campaña sin whatsapp")).not.toBe("mensajes");
  });

  test("si nombra los dos, el admin no decide (cae a la web, no a WhatsApp)", () => {
    expect(interpretarObjetivo("una a whatsapp y otra la landipage")).toBeNull();
  });

  test("WhatsApp solo sigue siendo mensajes", () => {
    expect(interpretarObjetivo("que me escriban por WhatsApp")).toBe("mensajes");
    expect(pedidoDelAdmin("que me escriban por WhatsApp")).toBe("mensajes");
  });

  test("landing con ventas explícito", () => {
    expect(interpretarObjetivo("campaña de ventas a la landing")).toBe("ventas");
  });

  test("un mensaje sin anuncio no inventa pedido", () => {
    expect(pedidoDelAdmin("dame el enlace")).toBeNull();
  });
});
