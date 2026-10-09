/**
 * El dueño (07-10): "siempre que me salgo de la aplicación se cae la señal".
 * El tramo siguiente de un pedido grande lo pedía SOLO la página; con la app
 * cerrada nadie lo pedía. Ahora, si la página no lo pide, lo pide el servidor.
 */
import { describe, it, expect, vi } from "vitest";
import { programarContinuacion, reiniciarRondas, MAX_RONDAS, TEXTO_CONTINUAR } from "../continuacion-servidor";
import { esContinuacionAutomatica } from "../investigacion-previa";

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("continuación del lado del servidor", () => {
  it("el texto es el mismo que reconoce el turno como continuación", () => {
    expect(esContinuacionAutomatica(TEXTO_CONTINUAR)).toBe(true);
  });

  it("app cerrada: el servidor pide el tramo siguiente con la sesión del admin", async () => {
    reiniciarRondas("t1::s");
    const pedir = vi.fn(async () => ({}));
    programarContinuacion({ clave: "t1::s", sessionId: "s", cabeceras: { cookie: "sid=abc" }, base: "http://x", esperaMs: 10, pedir, enVuelo: () => false });
    await esperar(40);
    expect(pedir).toHaveBeenCalledTimes(1);
    const [url, init] = pedir.mock.calls[0] as any;
    expect(url).toBe("http://x/api/code-agent/operator-opencode");
    expect(init.headers.cookie).toBe("sid=abc");
    expect(JSON.parse(init.body)).toMatchObject({ prompt: TEXTO_CONTINUAR, sessionId: "s", stream: false });
  });

  it("app abierta (la página ya pidió el tramo): el servidor no se mete", async () => {
    reiniciarRondas("t2::s");
    const pedir = vi.fn(async () => ({}));
    programarContinuacion({ clave: "t2::s", sessionId: "s", cabeceras: {}, esperaMs: 10, pedir, enVuelo: () => true });
    await esperar(40);
    expect(pedir).not.toHaveBeenCalled();
  });

  it("tope de tramos automáticos, y un pedido nuevo del admin lo reinicia", async () => {
    reiniciarRondas("t3::s");
    const pedir = vi.fn(async () => ({}));
    for (let i = 0; i < MAX_RONDAS; i++) {
      expect(programarContinuacion({ clave: "t3::s", sessionId: "s", cabeceras: {}, esperaMs: 5, pedir, enVuelo: () => false })).toBe(true);
      await esperar(20);
    }
    expect(programarContinuacion({ clave: "t3::s", sessionId: "s", cabeceras: {}, esperaMs: 5, pedir, enVuelo: () => false })).toBe(false);
    reiniciarRondas("t3::s");
    expect(programarContinuacion({ clave: "t3::s", sessionId: "s", cabeceras: {}, esperaMs: 5, pedir, enVuelo: () => false })).toBe(true);
    await esperar(20);
    expect(pedir).toHaveBeenCalledTimes(MAX_RONDAS + 1);
  });
});
