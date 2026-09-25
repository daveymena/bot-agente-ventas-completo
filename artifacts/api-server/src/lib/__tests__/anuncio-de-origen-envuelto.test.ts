/**
 * Conv 219 (23-09-2026): la clienta llegó del anuncio del corrector y quedó
 * como lead "whatsapp". El dato del anuncio se buscaba un solo nivel adentro
 * del mensaje; con mensajes temporales viene envuelto un nivel más.
 */
import { describe, test, expect } from "vitest";
import { extraerContextoDeAnuncio } from "../whatsapp";

const ad = { title: "Corrector de Hombros y Clavícula", body: "Endereza tu espalda", sourceUrl: "https://fb.me/x", sourceId: "120249677239240097", ctwaClid: "clid" };

describe("anuncio de origen", () => {
  test("mensaje normal", () => {
    const r = extraerContextoDeAnuncio({ extendedTextMessage: { text: "Hola", contextInfo: { externalAdReply: ad } } });
    expect(r?.anuncioId).toBe("120249677239240097");
  });

  test("envuelto en mensaje temporal (ephemeralMessage)", () => {
    const r = extraerContextoDeAnuncio({
      ephemeralMessage: { message: { extendedTextMessage: { text: "Hola me interesa el corrector de postura", contextInfo: { externalAdReply: ad } } } },
    });
    expect(r?.titulo).toBe("Corrector de Hombros y Clavícula");
  });

  test("sin externalAdReply pero con la marca de origen de WhatsApp", () => {
    const r = extraerContextoDeAnuncio({ extendedTextMessage: { text: "Hola", contextInfo: { entryPointConversionSource: "ctwa_ad", entryPointConversionApp: "facebook" } } });
    expect(r).not.toBeNull();
    expect(r?.origen).toMatch(/ctwa_ad/);
  });

  test("un mensaje común no es de anuncio", () => {
    expect(extraerContextoDeAnuncio({ conversation: "hola" })).toBeNull();
    expect(extraerContextoDeAnuncio({ extendedTextMessage: { text: "hola", contextInfo: { quotedMessage: { conversation: "x" } } } })).toBeNull();
  });
});
