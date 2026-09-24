import { describe, it, expect, afterEach } from "vitest";
import { modelosDe, candidatosDeOllama, REPARTO } from "../modelos-por-tarea";
import { modelosDeVision } from "../media-entrante";

/**
 * El reparto de tareas entre modelos (24-09-2026). Se prueba lo que no puede
 * romperse: que cada tarea tenga el modelo medido, que se pueda apagar sin
 * código, y que sin Ollama configurado no cambie nada.
 */
const ENV = ["OLLAMA_LOCAL_URL", "IA_VENDEDOR", "IA_VISION", "IA_REDACCION"];
const antes: Record<string, string | undefined> = {};
for (const k of ENV) antes[k] = process.env[k];
afterEach(() => { for (const k of ENV) { if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k]; } });

describe("qué modelo hace qué", () => {
  it("el reparto medido: vendedor y visión con gemma4, redacción con gpt-oss:120b primero", () => {
    expect(REPARTO.vendedor).toEqual(["gemma4:31b-cloud"]);
    expect(REPARTO.vision).toEqual(["gemma4:31b-cloud"]);
    expect(REPARTO.redaccion[0]).toBe("gpt-oss:120b-cloud");
  });
  it("gpt-oss:120b NO atiende ventas: se colgó en el bucle de herramientas", () => {
    expect(REPARTO.vendedor).not.toContain("gpt-oss:120b-cloud");
  });
  it("IA_VENDEDOR=off vuelve el vendedor a DeepSeek sin tocar código", () => {
    process.env.OLLAMA_LOCAL_URL = "http://tecnoia_ollama:11434";
    process.env.IA_VENDEDOR = "off";
    expect(candidatosDeOllama("vendedor")).toEqual([]);
  });
  it("los candidatos van como proveedor ollama_local (tope de 5 s, no el de 3 s por defecto)", () => {
    process.env.OLLAMA_LOCAL_URL = "http://tecnoia_ollama:11434";
    delete process.env.IA_VENDEDOR;
    const [c] = candidatosDeOllama("vendedor");
    expect(c!.source).toBe("ollama_local/gemma4:31b-cloud");
    expect(c!.config.baseUrl).toBe("http://tecnoia_ollama:11434/v1");
  });
  it("sin Ollama configurado no se agrega nada", () => {
    delete process.env.OLLAMA_LOCAL_URL;
    expect(candidatosDeOllama("redaccion")).toEqual([]);
  });
  it("la visión pone gemma4 PRIMERO y conserva el respaldo de siempre", () => {
    process.env.OLLAMA_LOCAL_URL = "http://tecnoia_ollama:11434";
    delete process.env.IA_VISION;
    const lista = modelosDeVision();
    expect(lista[0]).toEqual({ proveedor: "ollama_local", modelo: "gemma4:31b-cloud" });
    expect(lista.some((p) => p.proveedor === "deepseek")).toBe(true);
  });
  it("una lista propia por variable reemplaza el reparto", () => {
    process.env.IA_REDACCION = "gemma4:31b-cloud";
    expect(modelosDe("redaccion")).toEqual(["gemma4:31b-cloud"]);
  });
});
