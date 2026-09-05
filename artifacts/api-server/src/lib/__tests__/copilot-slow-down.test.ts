/**
 * "Sincronizando con GitHub..." para siempre.
 *
 * El admin lo reportó el 2026-09-05 con una captura: el código de vinculación
 * en pantalla, la ruedita girando, y la autorización de GitHub ya hecha.
 *
 * La causa no estaba en el protocolo --se probó contra github.com ese mismo
 * día y responde exactamente lo que el código espera-- sino en UNA rama:
 * `slow_down` se trataba igual que `authorization_pending`.
 *
 * Medido en vivo contra https://github.com/login/oauth/access_token con un
 * código de dispositivo real:
 *
 *   pregunta 1 -> {"error":"authorization_pending"}
 *   pregunta 2 -> {"error":"slow_down","interval":10}
 *   pregunta 3 -> {"error":"slow_down","interval":15}
 *
 * GitHub SUBE el intervalo exigido con cada `slow_down`. El panel preguntaba
 * cada 5 s fijos y `pollCopilotToken` tiraba el `interval` a la basura, así
 * que una vez adentro no se salía nunca: toda respuesta era `slow_down`, o
 * sea "pending", y la pantalla nunca confirmaba la vinculación.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { pollCopilotToken } from "../copilot";

function responde(cuerpo: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => cuerpo,
  } as any);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("el device flow obedece lo que GitHub pide esperar", () => {
  it("authorization_pending sigue siendo esperar, sin pedir más tiempo", async () => {
    vi.stubGlobal("fetch", responde({ error: "authorization_pending" }));
    const r = await pollCopilotToken("dc");
    expect(r.status).toBe("pending");
    expect(r.intervalS).toBeUndefined();
  });

  /** El caso que rompía todo: seguir esperando, pero MÁS. */
  it("slow_down devuelve el intervalo nuevo en vez de descartarlo", async () => {
    vi.stubGlobal("fetch", responde({ error: "slow_down", interval: 10 }));
    const r = await pollCopilotToken("dc");
    expect(r.status).toBe("pending");
    expect(r.intervalS).toBe(10);
  });

  it("y lo sigue devolviendo cuando GitHub lo vuelve a subir", async () => {
    vi.stubGlobal("fetch", responde({ error: "slow_down", interval: 15 }));
    expect((await pollCopilotToken("dc")).intervalS).toBe(15);
  });

  /** Sin `interval` no se inventa uno: el que llama usa el suyo. */
  it("slow_down sin interval no devuelve un número inventado", async () => {
    vi.stubGlobal("fetch", responde({ error: "slow_down" }));
    const r = await pollCopilotToken("dc");
    expect(r.status).toBe("pending");
    expect(r.intervalS).toBeUndefined();
  });

  it("un código vencido es error, no espera eterna", async () => {
    vi.stubGlobal("fetch", responde({ error: "expired_token" }));
    const r = await pollCopilotToken("dc");
    expect(r.status).toBe("error");
    expect(r.error).toBe("expired_token");
  });

  it("cuando GitHub autoriza, devuelve el token", async () => {
    vi.stubGlobal("fetch", responde({ access_token: "gho_xxx" }));
    const r = await pollCopilotToken("dc");
    expect(r.status).toBe("authorized");
    expect(r.accessToken).toBe("gho_xxx");
  });
});
