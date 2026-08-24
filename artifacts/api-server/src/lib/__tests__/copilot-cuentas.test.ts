import { describe, it, expect } from "vitest";
import { normalizarTokensDeCopilot, expandirPorCuenta } from "../copilot-cuentas";

const BASE: any = { baseUrl: "https://api.githubcopilot.com", apiKey: "viejo", model: "gpt-4o" };

describe("leer las cuentas configuradas", () => {
  /** Formato viejo: un solo token en `githubToken`. Romperlo dejaría al admin
   *  sin Copilot justo al actualizar. */
  it("acepta un token suelto", () => {
    expect(normalizarTokensDeCopilot("tok1")).toEqual(["tok1"]);
  });

  it("acepta una lista de tokens", () => {
    expect(normalizarTokensDeCopilot(["tok1", "tok2"])).toEqual(["tok1", "tok2"]);
  });

  it("acepta objetos con la cuenta de origen", () => {
    expect(normalizarTokensDeCopilot([{ token: "tok1", cuenta: "a@b.com" }, { token: "tok2" }]))
      .toEqual(["tok1", "tok2"]);
  });

  /** Dos veces el mismo token no es más cuota: es el mismo límite pegándole
   *  dos veces a la misma cuenta. */
  it("no cuenta dos veces el mismo token", () => {
    expect(normalizarTokensDeCopilot(["tok1", "tok1", " tok1 "])).toEqual(["tok1"]);
  });

  it.each([null, undefined, "", "   ", [], [{}], [null], 42])(
    "devuelve lista vacía con %s",
    (v) => {
      expect(normalizarTokensDeCopilot(v as unknown)).toEqual([]);
    },
  );
});

describe("una cuenta = un candidato de la cadena", () => {
  it("crea un candidato por cuenta, cada uno con SU clave", () => {
    const c = expandirPorCuenta(BASE, ["tokA", "tokB", "tokC"]);
    expect(c).toHaveLength(3);
    expect(c.map((x) => x.config.apiKey)).toEqual(["tokA", "tokB", "tokC"]);
  });

  it("conserva el resto de la configuración", () => {
    const [uno] = expandirPorCuenta(BASE, ["tokA"]);
    expect(uno!.config.baseUrl).toBe("https://api.githubcopilot.com");
    expect(uno!.config.model).toBe("gpt-4o");
  });

  /** "copilot" a secas no le sirve al admin cuando tiene tres cuentas: el
   *  desglose tiene que decir CUÁL se quedó sin cuota. */
  it("numera las cuentas para que el desglose diga cuál falló", () => {
    const c = expandirPorCuenta(BASE, ["tokA", "tokB"]);
    expect(c.map((x) => x.source)).toEqual(["copilot#1/gpt-4o", "copilot#2/gpt-4o"]);
  });

  /** El token es una credencial: no puede terminar en un log ni en el
   *  desglose que se le muestra al admin. */
  it("nunca pone el token en la etiqueta", () => {
    for (const x of expandirPorCuenta(BASE, ["ghp_secretisimo"])) {
      expect(x.source).not.toContain("ghp_secretisimo");
    }
  });

  /** Un candidato sin clave es un intento fallido garantizado que igual se
   *  paga en segundos. */
  it("sin cuentas no agrega ningún candidato", () => {
    expect(expandirPorCuenta(BASE, [])).toEqual([]);
  });
});
