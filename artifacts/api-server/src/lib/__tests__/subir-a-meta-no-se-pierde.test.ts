import { describe, it, expect } from "vitest";
import { esErrorTransitorioDeMeta, usarAdvantagePlus } from "../facebook";

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

/**
 * Quién elige el público: el algoritmo o el admin.
 *
 * `advantage_audience` estaba fijo en 0 "para respetar el targeting
 * explícito". La intención era buena y el resultado quedó al revés de la
 * práctica actual:
 *
 *  · Meta trata los intereses como SUGERENCIA, no como filtro, en los 11
 *    objetivos de rendimiento más comunes -- da igual cómo se configure el
 *    conjunto. En junio de 2025 consolidó categorías enteras en grupos
 *    amplios.
 *  · Advantage+ Audience es el motor principal del 65% de los anunciantes de
 *    EE.UU.: se le da el creativo y el objetivo, y su modelo busca a quién
 *    mostrárselo.
 *  · Y desde la API v23.0 el parámetro pasa a ser OBLIGATORIO al crear
 *    conjuntos, así que hay que tenerlo resuelto igual.
 *
 * El problema concreto del 0 fijo: como el sistema pone 18-65 cuando nadie
 * habló de edad, "hay targeting explícito" era SIEMPRE cierto y Advantage+
 * quedaba apagado en todas las campañas.
 */
describe("Advantage+ Audience: gana el algoritmo salvo que el admin pida otra cosa", () => {
  it("sin pedido de público, decide Meta", () => {
    expect(usarAdvantagePlus(undefined)).toBe(true);
    expect(usarAdvantagePlus({})).toBe(true);
  });

  it("el rango por defecto 18-65 NO es un pedido del admin", () => {
    // El bug exacto: es lo que pone el sistema cuando nadie habló de edad.
    // Tomarlo por una decisión suya apagaba Advantage+ en TODAS las campañas.
    expect(usarAdvantagePlus({ ageMin: 18, ageMax: 65 })).toBe(true);
  });

  it("si el admin acota la edad, manda él", () => {
    expect(usarAdvantagePlus({ ageMin: 25, ageMax: 65 })).toBe(false);
    expect(usarAdvantagePlus({ ageMin: 18, ageMax: 40 })).toBe(false);
    expect(usarAdvantagePlus({ ageMin: 25, ageMax: 50 })).toBe(false);
  });

  it("intereses o género explícitos también mandan", () => {
    expect(usarAdvantagePlus({ interests: [{ id: "1", name: "Emprendimiento" }] })).toBe(false);
    expect(usarAdvantagePlus({ genders: [2] })).toBe(false);
  });

  it("las listas vacías no cuentan como pedido", () => {
    // Un array vacío es "no dijo nada", no "no quiero a nadie".
    expect(usarAdvantagePlus({ interests: [], genders: [] })).toBe(true);
  });
});
