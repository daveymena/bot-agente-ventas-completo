/**
 * 09-10-2026, el probador del vendedor con el Corrector de postura (155). El
 * dueño marcó la respuesta como mentira:
 *
 *   ✅ Logras una postura derecha y evitas encorvarte de manera inmediata
 *   🚚 Envío incluido en el precio. Llega en 3 a 5 días hábiles.
 *
 * El negocio NO tenía el envío configurado (`fuente: "respaldo"`): esos datos
 * eran el relleno del código. Y "de manera inmediata" pasaba porque la ficha
 * se validaba con una lista propia, más corta que la de los anuncios.
 */
import { describe, it, expect } from "vitest";
import { revisarRespuesta } from "../revisar-respuesta";
import { prometeDeMas } from "../presentacion-de-producto";
import {
  CONDICIONES_DE_RESPALDO, condicionesDesdePerfil, envioConfirmado, lineaDeEnvio, plazoDeEntrega,
} from "../modelo-de-negocio";
import { contextoDeDropshipping } from "../dropshipping";

const corrector = {
  name: "Corrector de Postura Zxf 25 Eh",
  description: "Corrector de postura con doble correa ajustable, neopreno acolchado y ligero. Ayuda a la alineación de hombros y espalda.",
  features: ["doble correa ajustable", "neopreno acolchado y ligero", "alineación de hombros y espalda"],
};

const RESPUESTA_REAL = [
  "🦴 Corrector de Postura Zxf 25 Eh\n\nSi pasas mucho tiempo frente al computador y sientes molestias en el cuello y espalda, este corrector te ayuda a recuperar tu alineación natural.",
  "Así te ayuda:\n\n✅ Logras una postura derecha y evitas encorvarte de manera inmediata\n\n✅ Mantienes tus hombros y columna alineados durante todo el día",
  "🚚 Envío incluido en el precio. Llega en 3 a 5 días hábiles.\n💵 Pagas contraentrega, cuando lo recibes\n💰 $55.000 COP",
];

describe("el envío que nadie configuró no se afirma", () => {
  it("el relleno no cuenta como confirmado, y la ficha no imprime la línea de envío", () => {
    expect(envioConfirmado(CONDICIONES_DE_RESPALDO)).toBe(false);
    expect(lineaDeEnvio(CONDICIONES_DE_RESPALDO)).toBeNull();
    expect(plazoDeEntrega(CONDICIONES_DE_RESPALDO)).not.toMatch(/3 a 5/);
  });

  it("con solo el país cargado, el envío sigue sin confirmar", () => {
    expect(envioConfirmado(condicionesDesdePerfil({ pais: "CO" }))).toBe(false);
  });

  it("configurado por el negocio, se dice tal cual", () => {
    const c = condicionesDesdePerfil({ envio: { plazo: "2 a 4 días hábiles", costo: "incluido", pago: "contraentrega" } });
    expect(envioConfirmado(c)).toBe(true);
    expect(lineaDeEnvio(c)).toBe("Envío incluido en el precio. Llega en 2 a 4 días hábiles.");
  });

  it("al vendedor ya no se le dice 'dilo con seguridad' sobre un plazo de relleno", () => {
    const t = contextoDeDropshipping(CONDICIONES_DE_RESPALDO);
    expect(t).not.toMatch(/3 a 5/);
    expect(t).not.toMatch(/INCLUIDO en el precio/);
    expect(t).toMatch(/NO está configurado/);
  });
});

describe("la ficha pasa por el mismo control que los anuncios", () => {
  it("'de manera inmediata' ya no pasa", () => {
    expect(prometeDeMas({ gancho: "Recupera tu postura.", beneficios: ["Evitas encorvarte de manera inmediata", "b", "c"] }, corrector)).toBe(true);
  });

  it("una presentación con lo que dice la ficha sí pasa", () => {
    expect(prometeDeMas({
      gancho: "Si pasas horas sentado, te ayuda con la alineación de hombros y espalda.",
      beneficios: ["Doble correa ajustable a tu medida", "Neopreno acolchado y ligero", "Te recuerda mantener la espalda derecha"],
    }, corrector)).toBe(false);
  });
});

describe("el probador revisa la respuesta solo", () => {
  it("encuentra lo falso de la respuesta real y propone cómo arreglarlo", () => {
    const alertas = revisarRespuesta({ textos: RESPUESTA_REAL, producto: corrector, condiciones: CONDICIONES_DE_RESPALDO });
    const frases = alertas.map((a) => a.frase.toLowerCase()).join(" | ");
    expect(frases).toMatch(/inmediata/);
    expect(frases).toMatch(/env[ií]o incluido/);
    expect(alertas.find((a) => a.tipo === "sin_configurar")?.que).toBe("costo o tiempo de envío");
    expect(alertas.find((a) => a.tipo === "promesa")?.correccion).toMatch(/No digas/);
  });

  it("una respuesta honesta sale limpia", () => {
    const alertas = revisarRespuesta({
      textos: ["Tiene doble correa ajustable y neopreno acolchado y ligero. 💰 $55.000 COP. Te lo enviamos a tu dirección; pagas contraentrega."],
      producto: corrector,
      condiciones: CONDICIONES_DE_RESPALDO,
    });
    expect(alertas).toEqual([]);
  });

  it("con el envío configurado, decir el plazo NO es una alerta", () => {
    const c = condicionesDesdePerfil({ envio: { plazo: "3 a 5 días hábiles", costo: "incluido", pago: "contraentrega" } });
    const alertas = revisarRespuesta({ textos: ["Llega en 3 a 5 días hábiles."], producto: { ...corrector, description: corrector.description + " Llega en 3 a 5 días hábiles." }, condiciones: c });
    expect(alertas.filter((a) => a.tipo === "sin_configurar")).toEqual([]);
  });
});
