import { describe, it, expect } from "vitest";
import { esErrorTransitorioDeMeta } from "../facebook";

/**
 * Subir un anuncio a Meta son CUATRO llamadas encadenadas: campaña, conjunto
 * de anuncios, creativo y anuncio. Si falla cualquiera después de la primera,
 * el sistema borra la campaña (bien: no deja restos en Ads Manager) y no queda
 * NADA.
 *
 * El admin lo describió así: "a veces manda el anuncio pero no realiza el
 * conjunto de anuncios, y sin eso no hay nada".
 *
 * Hasta ahora `fbPost` no reintentaba nunca, así que un parpadeo de Meta en el
 * paso 2 tiraba abajo el trabajo de los cuatro. Ahora se reintenta -- pero
 * SOLO lo que puede mejorar reintentando.
 */

describe("Qué error de Meta vale la pena reintentar", () => {
  it("los límites de llamadas son transitorios: se reintentan", () => {
    // Los más comunes en una ráfaga de cuatro llamadas seguidas.
    for (const code of [1, 2, 4, 17, 32, 341, 613]) {
      expect(esErrorTransitorioDeMeta({ code }), `código ${code}`).toBe(true);
    }
  });

  it("un token inválido o un copy rechazado NO se reintentan", () => {
    // Reintentar esto solo hace esperar al admin para darle el mismo error.
    // 190 = token inválido · 100 = parámetro inválido (el copy rechazado y los
    // ids mal puestos caen acá) · 200 = permisos.
    for (const code of [100, 190, 200]) {
      expect(esErrorTransitorioDeMeta({ code }), `código ${code}`).toBe(false);
    }
  });

  it("lo reconoce también cuando el error viene envuelto por fbPost", () => {
    // fbPost tira un Error con el error de Graph pegado en `fbError`, para no
    // tener que adivinar por el texto del mensaje -- que cambia de idioma y de
    // redacción según el endpoint.
    expect(esErrorTransitorioDeMeta({ fbError: { code: 4 } })).toBe(true);
    expect(esErrorTransitorioDeMeta({ fbError: { code: 190 } })).toBe(false);
  });

  it("un timeout de red se reintenta aunque no traiga código", () => {
    // AbortSignal.timeout(20000) no da código de Graq: solo el mensaje.
    expect(esErrorTransitorioDeMeta({ message: "The operation was aborted due to timeout" })).toBe(true);
    expect(esErrorTransitorioDeMeta({ message: "Please retry your request later" })).toBe(true);
  });

  it("un error desconocido NO se reintenta", () => {
    // Ante la duda, no reintentar: una llamada de más a Meta con un cuerpo
    // malo puede crear un objeto duplicado en la cuenta real.
    expect(esErrorTransitorioDeMeta({ message: "Invalid parameter" })).toBe(false);
    expect(esErrorTransitorioDeMeta({})).toBe(false);
    expect(esErrorTransitorioDeMeta(null)).toBe(false);
  });
});
