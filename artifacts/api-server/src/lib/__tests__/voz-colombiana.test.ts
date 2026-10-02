import { describe, it, expect } from "vitest";
import { vozColombiana, VOZ_POR_DEFECTO, VOZ_HOMBRE } from "../voz-de-atlas";
import { hablarColombiano } from "../hablar-colombiano";

/**
 * Pedido del dueño (30-09-2026): "los audios hablan en voces de otros países,
 * necesitamos que hable colombiano". La voz ya era colombiana pero (1) leía
 * voseo argentino de Atlas y de los guiones y (2) una variable de entorno o una
 * prueba podía pedir cualquier otra voz de Edge.
 */
describe("los audios hablan colombiano", () => {
  it("solo voces colombianas: cualquier otra cae a Salomé o Gonzalo", () => {
    expect(vozColombiana("es-CO-GonzaloNeural")).toBe(VOZ_HOMBRE);
    expect(vozColombiana("es-MX-DaliaNeural")).toBe(VOZ_POR_DEFECTO);
    expect(vozColombiana("es-AR-TomasNeural")).toBe(VOZ_HOMBRE);
    expect(vozColombiana("es-ES-ElviraNeural")).toBe(VOZ_POR_DEFECTO);
    expect(vozColombiana(undefined)).toBe(VOZ_POR_DEFECTO);
  });

  it("el texto que se lee pasa a tuteo colombiano", () => {
    expect(hablarColombiano("Escribinos por WhatsApp")).toBe("Escríbenos por WhatsApp");
    expect(hablarColombiano("Pedilo hoy, pagás al recibir")).toBe("Pídelo hoy, pagas al recibir");
    expect(hablarColombiano("Contame qué querés lograr")).toBe("Cuéntame qué quieres lograr");
    expect(hablarColombiano("Lo hago con vos, es para vos")).toBe("Lo hago contigo, es para ti");
  });
});
