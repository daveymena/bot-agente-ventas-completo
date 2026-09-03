/**
 * Lo que el admin PAGA tiene que probarse primero.
 *
 * El 2026-08-22 se midió en producción: un mensaje tardaba hasta 52 segundos
 * porque la primera fase recorría 6 proveedores muertos antes de llegar al de
 * pago. DeepSeek estaba pago y configurado, `agent.ts` lo ponía primero en su
 * cola de RESPALDO — pero `optimized-rotation.ts` ni siquiera lo tenía
 * registrado, así que la fase 1 no lo miraba nunca.
 *
 * Es el mismo bug que dejó afuera a groq en agosto, repetido con los dos
 * proveedores de pago del sistema.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getOptimizedProviderOrder, reportProviderResult, resetProviderRotation } from "../optimized-rotation";

// vi.stubEnv y no mutar process.env a mano: este archivo corre junto a otros
// que leen el entorno, y borrarles GITHUB_TOKEN de abajo les rompia pruebas
// que no tenian nada que ver.
beforeEach(() => {
  vi.stubEnv("DEEPSEEK_API_KEY", "");
  vi.stubEnv("COPILOT_SESSION_TOKEN", "");
  vi.stubEnv("GITHUB_TOKEN", "");
  resetProviderRotation();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetProviderRotation();
});

describe("Orden de proveedores de IA", () => {
  it("con DeepSeek pago, va PRIMERO aunque no esté en AI_FALLBACK_ORDER", () => {
    // Exactamente la variable que había en producción: solo gratuitos.
    vi.stubEnv("AI_FALLBACK_ORDER", "opencode_go,groq,openrouter,opencode,nvidia,github");
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-de-mentira");

    const orden = getOptimizedProviderOrder();
    expect(orden[0]).toBe("deepseek");
  });

  it("sin clave de DeepSeek, no se lo ofrece de primero", () => {
    vi.stubEnv("AI_FALLBACK_ORDER", "groq,opencode");
    const orden = getOptimizedProviderOrder();
    expect(orden[0]).not.toBe("deepseek");
  });

  it("Copilot entra cuando hay token, detrás de DeepSeek", () => {
    vi.stubEnv("AI_FALLBACK_ORDER", "groq");
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-de-mentira");
    vi.stubEnv("GITHUB_TOKEN", "ghp_de-mentira");

    const orden = getOptimizedProviderOrder();
    expect(orden.slice(0, 2)).toEqual(["deepseek", "github_copilot_internal"]);
  });

  it("no se pierde ningún proveedor que el admin configuró", () => {
    vi.stubEnv("AI_FALLBACK_ORDER", "opencode_go,groq,openrouter,opencode,nvidia,github");
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-de-mentira");

    const orden = getOptimizedProviderOrder();
    for (const p of ["opencode_go", "groq", "openrouter", "opencode", "nvidia", "github"]) {
      expect(orden).toContain(p);
    }
  });

  /**
   * El gratuito que contesta una vez se quedaba con la cabeza de la cola.
   *
   * `getAvailableProviders` ponía a `lastSuccessfulProvider` ANTES que a los de
   * pago, y cada éxito suyo lo volvía a poner ahí: bastaba UN acierto de un
   * gratuito para que DeepSeek --lo que el admin paga-- quedara segundo en
   * todos los turnos siguientes. Sin error, sin log y sin nada que fallara,
   * que es por qué nadie lo veía: el cliente simplemente esperaba al lento.
   *
   * Reportado el 2026-09-03: "no está respondiendo como debería cuando
   * tenemos una IA de paga".
   */
  it("un gratuito que acertó no le gana el primer puesto a DeepSeek", () => {
    vi.stubEnv("AI_FALLBACK_ORDER", "deepseek,groq,opencode");
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-de-mentira");

    reportProviderResult("groq", true, 800);

    const orden = getOptimizedProviderOrder();
    expect(orden[0]).toBe("deepseek");
  });

  /** Pero entre los que NO son de pago sigue mandando el último que acertó:
   *  esa preferencia es útil, lo que estaba mal era dónde se aplicaba. */
  it("el último que acertó sigue ganándole al resto de la lista", () => {
    vi.stubEnv("AI_FALLBACK_ORDER", "opencode,openrouter,groq");

    reportProviderResult("groq", true, 800);

    const orden = getOptimizedProviderOrder();
    expect(orden[0]).toBe("groq");
  });

  it("no repite proveedores", () => {
    vi.stubEnv("AI_FALLBACK_ORDER", "deepseek,groq,deepseek");
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-de-mentira");

    const orden = getOptimizedProviderOrder();
    expect(orden.length).toBe(new Set(orden).size);
  });
});
