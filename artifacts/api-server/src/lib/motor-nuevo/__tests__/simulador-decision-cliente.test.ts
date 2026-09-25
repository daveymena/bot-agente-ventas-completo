import { describe, it, expect } from "vitest";
import { leerDecisionDelCliente } from "../simulador-agente";

describe("simulador — decisión del cliente simulado", () => {
  it("un 'sí' o un 'ok' sueltos no terminan la simulación como compra", () => {
    expect(leerDecisionDelCliente("Sí, ok, pero ¿cuánto dura el curso?").senoal).toBe("continua");
  });

  it("un 'no' suelto no es abandono", () => {
    expect(leerDecisionDelCliente("No sé si me alcanza el tiempo, ¿es a mi ritmo?").senoal).toBe("continua");
  });

  it("la marca explícita de compra cierra en compra y se quita del mensaje", () => {
    const r = leerDecisionDelCliente("Listo, me lo llevo. ¿A qué cuenta pago? [CLIENTE_COMPRA]");
    expect(r.senoal).toBe("compra");
    expect(r.mensaje).toBe("Listo, me lo llevo. ¿A qué cuenta pago?");
  });

  it("la marca explícita de abandono cierra en abandono", () => {
    expect(leerDecisionDelCliente("Gracias, lo dejo así. [CLIENTE_ABANDONA]").senoal).toBe("abandona");
  });
});
