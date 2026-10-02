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

describe("Ollama para todo", () => {
  it("redacción: ollama abre la cadena gratuita", async () => {
    const { ORDEN_GRATUITOS_PRIMERO } = await import("../landing/agente-landing");
    expect(ORDEN_GRATUITOS_PRIMERO[0]).toBe("ollama_local");
    expect(ORDEN_GRATUITOS_PRIMERO[1]).toBe("ollama_cloud");
  });

  it("visión: candidatos con clave resuelta (sin tenant usa entorno)", async () => {
    const { candidatosDeVision } = await import("../media-entrante");
    const lista = await candidatosDeVision();
    expect(Array.isArray(lista)).toBe(true);
    for (const c of lista) expect(c.cfg?.apiKey).toBeTruthy();
  });
});

describe("Atlas no se pega con proveedores muertos", () => {
  it("dos timeouts seguidos enfrían al proveedor", async () => {
    const { optimizedRotation, resetProviderRotation } = await import("../optimized-rotation");
    try {
      expect(optimizedRotation.isInCooldown("ollama_cloud")).toBe(false);
      optimizedRotation.reportFailure("ollama_cloud", "timeout of 15000ms exceeded");
      optimizedRotation.reportFailure("ollama_cloud", "timeout of 15000ms exceeded");
      expect(optimizedRotation.isInCooldown("ollama_cloud")).toBe(true);
    } finally {
      resetProviderRotation();
    }
    expect(optimizedRotation.isInCooldown("ollama_cloud")).toBe(false);
  });
});
describe("fallback sin DeepSeek ni Ollama", () => {
  const saved2: Record<string, string | undefined> = {};
  const keys2 = ["OLLAMA_CLOUD_API_KEY", "OLLAMA_IMAGE_MODEL", "DEEPSEEK_API_KEY", "OLLAMA_LOCAL_URL", "AI_FALLBACK_ORDER"];
  it("la cadena no incluye ollama cuando no hay credencial", async () => {
    for (const k of keys2) saved2[k] = process.env[k];
    try {
      delete process.env.OLLAMA_CLOUD_API_KEY;
      delete process.env.OLLAMA_LOCAL_URL;
      delete process.env.DEEPSEEK_API_KEY;
      process.env.OPENCODE_API_KEY = process.env.OPENCODE_API_KEY || "dummy_for_test";
      const { armarCadena } = await import("../motor-nuevo/cliente-llm");
      const cadena = await armarCadena({ tenantId: null, appSettings: { aiProvider: "ollama_cloud" } as any });
      expect(cadena.map((c) => String(c.source))).not.toContain("ollama_cloud");
    } finally {
      for (const k of keys2) { if (saved2[k] === undefined) delete process.env[k]; else process.env[k] = saved2[k]; }
    }
  });
  it("easypanel fallback empieza con ollama_cloud", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const yaml: string = fs.readFileSync(path.join(process.cwd(), "..", "..", "easypanel.yml"), "utf8");
    expect(yaml).toMatch(/AI_FALLBACK_ORDER.*ollama_cloud/);
  });
});
