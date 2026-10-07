/**
 * 07-10 02:42 UTC, producción: Ollama Cloud contestó 429 "you have reached your
 * monthly usage limit" y TODOS los turnos de Atlas cayeron al puente OpenCode
 * (14–25 s por turno), aunque el panel tenía otra IA activa andando y DeepSeek
 * con saldo: configDirecta() elegía una sola opción fija.
 */
import { describe, it, expect } from "vitest";
import {
  apartarPor, candidatosDirectos, correrTurnoDirectoConRotacion, proveedorApartado,
  type OpcionesDeTurnoDirecto, type ResultadoDirecto,
} from "../atlas-directo";

const CUPO_AGOTADO = '{"error":{"message":"you (duvier) have reached your monthly usage limit, upgrade for higher limits"}}';
const env = { OLLAMA_CLOUD_API_KEY: "k-ollama", DEEPSEEK_API_KEY: "k-ds" } as any;
const base = { system: "s", herramientas: [], mensaje: "hola", ctx: { tenantId: 1 } as any, presupuestoMs: 30_000 };

describe("apartarPor", () => {
  it("cupo mensual agotado: horas, no el próximo mensaje", () => {
    expect(apartarPor(429, CUPO_AGOTADO)).toBe(6 * 3_600_000);
  });
  it("429 de ritmo: un par de minutos", () => {
    expect(apartarPor(429, "rate limit, slow down")).toBe(2 * 60_000);
  });
  it("clave mala: horas; caída del servidor: un minuto", () => {
    expect(apartarPor(401)).toBe(6 * 3_600_000);
    expect(apartarPor(503)).toBe(60_000);
  });
});

describe("candidatosDirectos", () => {
  it("la IA activa del panel va primero, después Ollama y DeepSeek", () => {
    const c = candidatosDirectos({ proveedor: "openai", modelo: "gpt-5.6-luna", baseUrl: "https://api.openai.com/v1", apiKey: "k-oa" }, env, 0);
    expect(c.map((x) => x.proveedor)).toEqual(["openai", "ollama_cloud", "deepseek"]);
    expect(c[0].baseUrl).toBe("https://api.openai.com/v1/chat/completions");
  });
  it("una IA del panel sin clave no entra", () => {
    const c = candidatosDirectos({ proveedor: "openai", modelo: "x", baseUrl: "u", apiKey: "" }, env, 0);
    expect(c[0].proveedor).toBe("ollama_cloud");
  });
});

describe("correrTurnoDirectoConRotacion", () => {
  it("Ollama sin cupo → atiende el siguiente, y Ollama queda apartado", async () => {
    const llamados: string[] = [];
    const correr = async (o: OpcionesDeTurnoDirecto): Promise<ResultadoDirecto> => {
      llamados.push(o.proveedor!);
      if (o.proveedor === "ollama_cloud") return { texto: "", error: "el modelo respondió 429", status: 429, detalle: CUPO_AGOTADO, vueltas: 0, herramientasUsadas: [], ms: 300 };
      return { texto: "Listo.", vueltas: 1, herramientasUsadas: [], ms: 900 };
    };
    const cands = candidatosDirectos(null, { OLLAMA_CLOUD_API_KEY: "k", DEEPSEEK_API_KEY: "k2" } as any);
    const r = await correrTurnoDirectoConRotacion(base, cands, correr);
    expect(r.texto).toBe("Listo.");
    expect(r.proveedor).toBe("deepseek");
    expect(llamados).toEqual(["ollama_cloud", "deepseek"]);
    expect(proveedorApartado("ollama_cloud")).toBe(true);
    // El turno siguiente ni lo intenta: no paga los 360 ms del 429 otra vez.
    expect(candidatosDirectos(null, { OLLAMA_CLOUD_API_KEY: "k", DEEPSEEK_API_KEY: "k2" } as any).map((c) => c.proveedor)).toEqual(["deepseek"]);
  });

  it("si el modelo ya ejecutó herramientas y después falló, NO se repite con otro (duplicaría acciones)", async () => {
    const llamados: string[] = [];
    const correr = async (o: OpcionesDeTurnoDirecto): Promise<ResultadoDirecto> => {
      llamados.push(o.proveedor!);
      return { texto: "", error: "el modelo respondió 500", status: 500, vueltas: 2, herramientasUsadas: ["crear_anuncio"], ms: 5000 };
    };
    const cands = [
      { proveedor: "deepseek", apiKey: "a", baseUrl: "u", modelo: "m" },
      { proveedor: "groq", apiKey: "b", baseUrl: "u", modelo: "m" },
    ];
    const r = await correrTurnoDirectoConRotacion(base, cands, correr);
    expect(llamados).toEqual(["deepseek"]);
    expect(r.error).toContain("500");
  });
});
