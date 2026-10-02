import { describe, it, expect } from "vitest";
import { TOOLS, isReadOnlyTool, OPERATOR_SYSTEM_PROMPT, ATLAS_SYSTEM_PROMPT_V2 } from "../app-operator";

/**
 * Atlas decía "no puedo ver imágenes" aunque la visión está configurada
 * (gemma4 local + DeepSeek visión). Causa: la imagen adjunta llega como
 * Markdown en texto y no existía ninguna herramienta para mirarla.
 * ver_imagen cierra ese hueco; este test fija el contrato.
 */
const tool = () => TOOLS.find((t: any) => t.name === "ver_imagen") as any;

describe("ver_imagen: los ojos de Atlas", () => {
  it("existe y es de lectura (sin aprobación)", () => {
    expect(tool()).toBeDefined();
    expect(isReadOnlyTool("ver_imagen")).toBe(true);
  });

  it("pide la url si no viene", async () => {
    const r = await tool().run({});
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/url/i);
  });

  it("rechaza esquemas que no son http ni /uploads/", async () => {
    const r = await tool().run({ url: "ftp://ejemplo.com/foto.jpg" });
    expect(r.ok).toBe(false);
  });

  it("rechaza path traversal fuera del almacén", async () => {
    const r = await tool().run({ url: "/uploads/../.env" });
    expect(r.ok).toBe(false);
  });

  it("un archivo inexistente se reporta, no se inventa", async () => {
    const r = await tool().run({ url: "/uploads/manual/no-existe-12345.png" });
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/no encontré/i);
  });

  it("bloquea SSRF a red privada", async () => {
    const r = await tool().run({ url: "http://169.254.169.254/latest/meta-data" });
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/privada/i);
  });

  it("el prompt enseña a usarla y prohíbe declararse ciego", () => {
    for (const prompt of [OPERATOR_SYSTEM_PROMPT, ATLAS_SYSTEM_PROMPT_V2]) {
      expect(prompt).toMatch(/ver_imagen/);
      expect(prompt).toMatch(/PROHIBIDO decir "no puedo ver imágenes"/);
    }
  });
});
