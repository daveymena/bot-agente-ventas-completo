import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PROVEEDORES_RAPIDOS } from "../cadena-modelos";
import { getProviderConfigConClave } from "@workspace/integrations-openai-ai-server";
import { ollamaImageBase64 } from "@workspace/integrations-openai-ai-server";
import { generarImagenConOllama } from "../app-operator";
import { armarCadena } from "../motor-nuevo/cliente-llm";

/**
 * 2026-10-02 (orden del dueño): Ollama primero en todo — cadena de Atlas,
 * cadena del vendedor, visión e imágenes — con la clave que el admin cargó
 * en Configuración. Si Ollama no está, todo cae a lo de siempre sin romperse.
 */
const ENV_KEYS = ["OLLAMA_LOCAL_URL", "OLLAMA_CLOUD_API_KEY", "OLLAMA_CLOUD_MODEL", "OLLAMA_IMAGE_MODEL", "DEEPSEEK_API_KEY"];
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of ENV_KEYS) saved[k] = process.env[k]; });
afterEach(() => {
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

describe("Ollama primero", () => {
  it("encabeza los proveedores rápidos de Atlas", () => {
    expect(PROVEEDORES_RAPIDOS[0]).toBe("ollama");
  });

  it("la clave guardada en Configuración resuelve (antes caía a null)", () => {
    const cfg = getProviderConfigConClave("ollama_cloud", "sk-test", "gemma3:27b");
    expect(cfg?.apiKey).toBe("sk-test");
    expect(cfg?.model).toBe("gemma3:27b");
    expect(cfg?.baseUrl).toContain("ollama.com");
  });

  it("imagen sin servidor no cuelga: devuelve null rapidito", async () => {
    delete process.env.OLLAMA_LOCAL_URL;
    delete process.env.OLLAMA_CLOUD_API_KEY;
    const r = await ollamaImageBase64("un gato", { base: "http://127.0.0.1:1", timeoutMs: 5000 });
    expect(r).toBeNull();
  }, 15000);

  it("generarImagenConOllama sin nada configurado devuelve null", async () => {
    delete process.env.OLLAMA_LOCAL_URL;
    delete process.env.OLLAMA_CLOUD_API_KEY;
    await expect(generarImagenConOllama("un gato")).resolves.toBeNull();
  }, 15000);

  it("proveedor elegido (ollama_cloud) va al frente aunque haya DeepSeek", async () => {
    process.env.OLLAMA_CLOUD_API_KEY = "sk-test";
    process.env.DEEPSEEK_API_KEY = "sk-test";
    delete process.env.OLLAMA_LOCAL_URL;
    const cadena = await armarCadena({ tenantId: null, appSettings: { aiProvider: "ollama_cloud" } as any });
    expect(cadena.length).toBeGreaterThan(0);
    expect(String(cadena[0]!.source)).toMatch(/^ollama_cloud/);
  }, 30000);
});

describe("Ollama nunca cuelga un turno", () => {
  it("servidor que acepta y se queda mudo: aborta por timeout", async () => {
    const { createServer } = await import("node:http");
    const srv = createServer(() => { /* acepta y no responde */ });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as any).port;
    const t0 = Date.now();
    const r = await ollamaImageBase64("un gato", { base: `http://127.0.0.1:${port}`, timeoutMs: 1500 });
    const ms = Date.now() - t0;
    await new Promise((r2) => srv.close(r2));
    expect(r).toBeNull();
    expect(ms).toBeLessThan(10000);
  }, 15000);
});
