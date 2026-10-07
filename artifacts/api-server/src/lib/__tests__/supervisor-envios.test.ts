/**
 * El supervisor anti-baneo de 73664ac era UNO para toda la plataforma, sumaba
 * +10 por cualquier excepción del socket (un corte en un deploy contaba como
 * "baneo"), restaba 1 por éxito y lo guardaba entre reinicios: unos fallos de
 * conexión dejaban a todos los negocios en modo x4 y con la IA reescribiendo
 * los mensajes. Estas pruebas fijan el comportamiento corregido.
 */
import { describe, it, expect } from "vitest";
import { SupervisorEnvios, clasificarFallo, pausaGrabacionMs } from "../supervisor-envios";

const reloj = (t0 = 1_000_000) => {
  let t = t0;
  return { ahora: () => t, avanzarHoras: (h: number) => { t += h * 3_600_000; } };
};

describe("clasificarFallo", () => {
  it("un corte de conexión NO es restricción de la cuenta", () => {
    expect(clasificarFallo(new Error("Connection Closed"))).toBe("conexion");
    expect(clasificarFallo(new Error("Timed Out"))).toBe("conexion");
    expect(clasificarFallo({ message: "x", output: { statusCode: 428 } })).toBe("conexion");
  });
  it("401/403/bloqueo sí es restricción", () => {
    expect(clasificarFallo({ message: "x", output: { statusCode: 401 } })).toBe("restriccion");
    expect(clasificarFallo(new Error("account suspended"))).toBe("restriccion");
    expect(clasificarFallo(new Error("rate-overlimit"))).toBe("restriccion");
  });
});

describe("SupervisorEnvios", () => {
  it("10 cortes de conexión seguidos (un deploy) no frenan el bot", () => {
    const s = new SupervisorEnvios();
    for (let i = 0; i < 10; i++) s.fallo(new Error("Connection Closed"));
    expect(s.riesgo).toBe(0);
    expect(s.multiplicador).toBe(1);
  });

  it("restricciones reales sí frenan, y el freno es acotado (nunca x4)", () => {
    const s = new SupervisorEnvios();
    s.fallo(new Error("403 forbidden"));
    s.fallo(new Error("403 forbidden"));
    expect(s.riesgo).toBe(60);
    expect(s.multiplicador).toBe(2.5);
  });

  it("el riesgo se desvanece solo con el tiempo, sin pagar con cientos de envíos", () => {
    const r = reloj();
    const s = new SupervisorEnvios(r.ahora);
    s.fallo(new Error("403 forbidden"));
    s.fallo(new Error("403 forbidden"));
    r.avanzarHoras(2);
    expect(s.riesgo).toBe(30);
    r.avanzarHoras(2);
    expect(s.riesgo).toBe(0);
    expect(s.multiplicador).toBe(1);
  });

  it("cada negocio tiene su propio supervisor: el estado no se comparte", () => {
    const a = new SupervisorEnvios();
    const b = new SupervisorEnvios();
    a.fallo(new Error("account blocked"));
    expect(a.riesgo).toBeGreaterThan(0);
    expect(b.riesgo).toBe(0);
  });

  it("restaurar un estado viejo aplica el decaimiento desde el último fallo", () => {
    const r = reloj(10 * 3_600_000);
    const s = new SupervisorEnvios(r.ahora);
    s.restaurar({ riesgo: 60, ultimoFalloAt: r.ahora() - 3 * 3_600_000 });
    expect(s.riesgo).toBe(15);
  });
});

describe("pausaGrabacionMs", () => {
  it("una nota corta no espera 15 segundos", () => {
    // 20 KB ≈ 7 s de audio: antes 20000*8 → tope de 15 s (x4 = 60 s)
    expect(pausaGrabacionMs(20_000, 1, 0.5)).toBeLessThan(3500);
    expect(pausaGrabacionMs(20_000, 2.5, 1)).toBeLessThan(9000);
  });
  it("siempre hay una pausa mínima humana", () => {
    expect(pausaGrabacionMs(100, 1, 0)).toBeGreaterThanOrEqual(1000);
  });
});
