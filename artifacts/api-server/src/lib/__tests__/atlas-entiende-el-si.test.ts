import { describe, it, expect } from "vitest";
import { isApproval, isRejection } from "../architect-store";
import { esUnSiParaEstePlan } from "../es-un-si";

/**
 * El admin: "atlas solo entiende si, pero deberia comprender si, dale, claro,
 * confirmado".
 *
 * Medido antes de tocar nada: de 24 formas reales, reconocia 19. "dale",
 * "confirmado", "ok", "listo", "publica" y "hazlo" YA funcionaban. Lo que
 * faltaba era "claro" -- y un caso que ninguna lista puede cubrir.
 */
describe("Las formas de aprobar que el admin usa de verdad", () => {
  it("las que ya funcionaban siguen funcionando", () => {
    for (const t of ["si", "dale", "confirmado", "ok", "listo", "publica", "hazlo", "adelante", "de una", "hagale"]) {
      expect(isApproval(t), t).toBe(true);
    }
  });

  it("y las que faltaban", () => {
    for (const t of ["claro", "claro que si", "claro que sí", "obvio", "por supuesto"]) {
      expect(isApproval(t), t).toBe(true);
    }
  });

  it("un rechazo o un cambio NO es una aprobación", () => {
    for (const t of ["no", "espera", "cambia el texto", "mejor mañana", "sí pero cambia el título", "hola"]) {
      expect(isApproval(t), t).toBe(false);
    }
  });
});

/**
 * El caso que destapó todo, y que ninguna lista de palabras resuelve:
 *
 *   Atlas: "PUBLICAR en el muro de la página. ¿Confirmas?"
 *   admin: "En el muro"
 *   Atlas: "🤔 No me quedó claro si querés que lo haga."
 *
 * "En el muro" no es una palabra de aprobación: es el admin contestando DÓNDE.
 * Solo significa que sí EN RELACIÓN con lo que se le preguntó, así que hace
 * falta el plan delante. Eso lo lee el modelo.
 */
describe("Lo que la lista no puede: el modelo, y hacia el NO", () => {
  it("un mensaje vacío nunca aprueba, sin preguntarle a nadie", async () => {
    expect(await esUnSiParaEstePlan("", "publicar en el muro")).toBe(false);
    expect(await esUnSiParaEstePlan("   ", "publicar en el muro")).toBe(false);
  });

  it("un mensaje largo no es una confirmación: es una instrucción nueva", async () => {
    const largo =
      "mira, mejor cambiá el título por algo más corto y subí el presupuesto a 40 mil, " +
      "y de paso revisá si la imagen es la del piano o la del otro curso";
    expect(await esUnSiParaEstePlan(largo, "publicar en el muro")).toBe(false);
  });

  it("«En el muro» sigue sin ser aprobación para la lista: por eso hace falta el modelo", () => {
    // Si algún día alguien la mete en el regex, esto avisa -- y ahí habría que
    // revisar, porque "en el muro" fuera de contexto no aprueba nada.
    expect(isApproval("En el muro")).toBe(false);
    expect(isRejection("En el muro")).toBe(false);
  });
});
