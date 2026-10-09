/**
 * 09-10-2026: con la app cerrada el servidor seguía pidiendo tramos, pero
 * gpt-5.6-luna (el único vivo) se cortaba a los 30 s porque su "respondió hace
 * poco" vive en RAM y se pierde con cada deploy. El resto de la cadena estaba
 * muerta, así que el turno terminaba sin nada.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { anotarExito, convieneCortarloATiempo, olvidarFallos, type Candidato } from "../cadena-modelos";

const luna: Candidato = { providerID: "opencode", modelID: "gpt-5.6-luna" } as Candidato;
const mistral: Candidato = { providerID: "mistral", modelID: "mistral-small-latest" } as Candidato;
const pickle: Candidato = { providerID: "opencode", modelID: "big-pickle" } as Candidato;

describe("cortar a los 30 s solo si hay otro que venga contestando", () => {
  beforeEach(() => olvidarFallos());

  it("recién desplegado (nadie con evidencia): el primero NO se corta", () => {
    expect(convieneCortarloATiempo([luna, mistral, pickle], 0)).toBe(false);
  });

  it("si un respaldo viene contestando, el primero sí se corta para dejarle tiempo", () => {
    anotarExito(mistral);
    expect(convieneCortarloATiempo([luna, mistral, pickle], 0)).toBe(true);
  });

  it("el que viene contestando no se corta aunque haya otros vivos", () => {
    anotarExito(luna);
    anotarExito(mistral);
    expect(convieneCortarloATiempo([luna, mistral, pickle], 0)).toBe(false);
  });

  it("un éxito viejo (más de 30 min) no cuenta como evidencia", () => {
    const hace = Date.now() - 31 * 60_000;
    anotarExito(mistral, hace);
    expect(convieneCortarloATiempo([luna, mistral, pickle], 0)).toBe(false);
  });
});
