/**
 * Al agente solo le llega lo que escribió una persona.
 *
 * El 2026-08-22, en la conversación 4 de producción (Martha Cecilia,
 * 573145632442), pasó esto:
 *
 *   17:06:05  cliente: "¡Hola! Quiero más información"   ← venía del anuncio de PIANO
 *   17:06:07  bot:     "¿Vienes por el Cojín Moto Viajero 3D, cierto?"
 *   17:06:10  cliente: "215814204608627@lid"             ← NADIE escribió esto
 *   17:06:49  bot:     "te muestro el Pack de Contabilidad"
 *
 * El LID (identificador interno de WhatsApp) se guardó como mensaje del
 * cliente porque el rebusque aceptaba cualquier cadena con una letra — y
 * "lid" son letras. El agente le contestó con un producto al azar.
 */
import { describe, it, expect } from "vitest";
import { pareceMensajeDePersona } from "../whatsapp";

describe("Distinguir a una persona de la plomería de WhatsApp", () => {
  it("rechaza el LID exacto que se coló en producción", () => {
    expect(pareceMensajeDePersona("215814204608627@lid")).toBe(false);
  });

  it("rechaza las otras formas de identificador de WhatsApp", () => {
    for (const basura of [
      "573001234567@s.whatsapp.net",
      "120363043211234567@g.us",
      "573001234567@c.us",
      "status@broadcast",
    ]) {
      expect(pareceMensajeDePersona(basura)).toBe(false);
    }
  });

  it("rechaza nombres de campos del protocolo", () => {
    // Ya había pasado antes: una conversación cuyo último mensaje era,
    // literalmente, "messageContextInfo".
    expect(pareceMensajeDePersona("messageContextInfo")).toBe(false);
    expect(pareceMensajeDePersona("deviceListMetadata")).toBe(false);
    expect(pareceMensajeDePersona("senderKeyDistributionMessage")).toBe(false);
  });

  it("rechaza mimetypes, claves y hashes", () => {
    expect(pareceMensajeDePersona("image/jpeg")).toBe(false);
    expect(pareceMensajeDePersona("audio/ogg; codecs=opus")).toBe(false);
    expect(pareceMensajeDePersona("Ci8KIQoUMdKtb3lZ2xQnV0aGVudGljYXRl")).toBe(false);
  });

  it("rechaza cadenas que son casi todo números", () => {
    expect(pareceMensajeDePersona("573145632442")).toBe(false);
    expect(pareceMensajeDePersona("3A1F2E4B7C9D")).toBe(false);
  });

  it("DEJA PASAR lo que sí escribe un cliente", () => {
    for (const real of [
      "¡Hola! Quiero más información",
      "hola",
      "sí",
      "cuanto vale?",
      "Deseo aprender teclado",
      "Hay clases presenciales?",
      "me interesa el curso de piano, cuánto sale?",
      "Ok, ya te transfiero al 3136174267",
      "está muy caro 😅",
    ]) {
      expect(pareceMensajeDePersona(real), `debería aceptar: ${real}`).toBe(true);
    }
  });

  it("no explota con basura de entrada", () => {
    expect(pareceMensajeDePersona(null)).toBe(false);
    expect(pareceMensajeDePersona(undefined)).toBe(false);
    expect(pareceMensajeDePersona(12345)).toBe(false);
    expect(pareceMensajeDePersona("")).toBe(false);
    expect(pareceMensajeDePersona("   ")).toBe(false);
  });
});

/**
 * El marcador de tarjeta escrito como enlace de markdown.
 *
 * Conversación 5 de producción (Mauricio García, 2026-08-22): al cliente le
 * llegó literalmente "**[MEGAPACK 81 EN 1](CARD: 122)** que incluye todos los
 * cursos" — el parser busca corchetes, el modelo escribió paréntesis, y en vez
 * de la ficha del producto salió markdown roto.
 */
describe("Marcador de tarjeta en formato enlace", () => {
  const normalizar = (t: string) => t.replace(/\[([^\]]*)\]\s*\(\s*CARD:\s*(\d+)\s*\)/gi, "[CARD: $2]");

  it("convierte el enlace de markdown en el marcador real", () => {
    expect(normalizar("Tenemos un **[MEGAPACK 81 EN 1](CARD: 122)** que incluye todo."))
      .toBe("Tenemos un **[CARD: 122]** que incluye todo.");
  });

  it("funciona con varios en el mismo mensaje", () => {
    const r = normalizar("[Piano](CARD: 123) y también [Excel](CARD:118)");
    expect(r).toBe("[CARD: 123] y también [CARD: 118]");
  });

  it("no toca el marcador que ya está bien escrito", () => {
    expect(normalizar("Te dejo la ficha [CARD: 123]")).toBe("Te dejo la ficha [CARD: 123]");
  });

  it("no toca enlaces normales", () => {
    const t = "Mirá [la tienda](https://ventasproia.com/p/163)";
    expect(normalizar(t)).toBe(t);
  });
});
