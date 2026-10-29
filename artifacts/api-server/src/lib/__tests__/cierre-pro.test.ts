import { describe, it, expect } from "vitest";
import { ESTILO_POR_DEFECTO, PERFILES, estiloDelNegocio } from "../estilo-de-venta";
import { debeDispararDrip, SECUENCIAS, programarDripPro, cancelarDripPro } from "../whatsapp/followup-pro";

describe("Cierre Pro — default anti-fantasma (2026-10-12)", () => {
  it("el default responde primero y pregunta solo si hace falta (2026-10-22)", () => {
    expect(ESTILO_POR_DEFECTO.calificacion).toBe("salvo_si_pidio_dato");
    expect(ESTILO_POR_DEFECTO.anteLaDuda).toBe("preguntar_que_frena");
  });
  it("Equilibrado es el recomendado (2026-10-22: responder primero) y coincide con el default", () => {
    const cons = PERFILES.find((p) => p.id === "consultivo")!;
    const eq = PERFILES.find((p) => p.id === "equilibrado")!;
    expect(eq.recomendado).toBe(true);
    expect(cons.recomendado).toBeFalsy();
    expect(eq.estilo).toEqual(ESTILO_POR_DEFECTO);
  });
  it("sin config cae al default pro", () => {
    expect(estiloDelNegocio(null)).toEqual(ESTILO_POR_DEFECTO);
    expect(estiloDelNegocio({})).toEqual(ESTILO_POR_DEFECTO);
  });
});

describe("Prompt lleva bloque CIERRE PRO", () => {
  it("motor.ts responde primero: sin pregunta obligatoria antes del pitch", async () => {
    const { readFileSync } = await import("fs");
    const tryPaths = ["artifacts/api-server/src/lib/motor-nuevo/motor.ts", "src/lib/motor-nuevo/motor.ts"];
    let txt = "";
    for (const p of tryPaths) { try { txt = readFileSync(p, "utf-8"); if (txt) break; } catch {} }
    expect(txt).not.toMatch(/1 PREGUNTA ANTES DEL PITCH/);
    expect(txt).toMatch(/RESPUESTA DIRECTA/);
    expect(txt).toMatch(/Responde PRIMERO/);
  });
});

describe("Drip anti-fantasma", () => {
  it("precio dispara drip precio_enviado, pago dispara pago_enviado, entrega no", () => {
    expect(debeDispararDrip("precio")).toBe("precio_enviado");
    expect(debeDispararDrip("pago")).toBe("pago_enviado");
    expect(debeDispararDrip("pago_transferencia")).toBe("pago_enviado");
    expect(debeDispararDrip("info")).toBeNull();
    expect(debeDispararDrip("video")).toBeNull();
  });
  it("secuencia precio: 15m + 2h + 24h + 72h, cada mensaje pregunta cerrada", () => {
    const pasos = SECUENCIAS["precio_enviado"];
    expect(pasos.map((p) => p.delayMin)).toEqual([15, 120, 60 * 24, 60 * 72]);
    expect(pasos[0].texto({ nombre: "Ana", producto: "Corrector", precio: "$50.000" })).toMatch(/duda/);
  });
  it("programarDripPro no revienta sin DB (tests sin DB)", async () => {
    const ids = await programarDripPro(99999, "precio_enviado", { nombre: "Test", producto: "X", precio: "$1" }, 1);
    expect(Array.isArray(ids)).toBe(true);
  });
  it("cancelarDripPro no revienta sin DB", async () => {
    await expect(cancelarDripPro(99999)).resolves.toBeUndefined();
  });
});

describe("Herramienta mostrar dispara followup_pro (estructura)", () => {
  it("herramientas.ts registra followup_pro para precio/completa/pago", async () => {
    const { readFileSync } = await import("fs");
    const tryPaths = ["artifacts/api-server/src/lib/motor-nuevo/herramientas.ts", "src/lib/motor-nuevo/herramientas.ts"];
    let txt = "";
    for (const p of tryPaths) { try { txt = readFileSync(p, "utf-8"); if (txt) break; } catch {} }
    expect(txt).toMatch(/followup_pro/);
    expect(txt).toMatch(/precio_enviado/);
    expect(txt).toMatch(/pago_enviado/);
    expect(txt).toMatch(/datos_pedido_incompletos/);
  });
  it("adaptador cancela drip al recibir mensaje y programa al enviar precio/pago", async () => {
    const { readFileSync } = await import("fs");
    const tryPaths = ["artifacts/api-server/src/lib/motor-nuevo/adaptador.ts", "src/lib/motor-nuevo/adaptador.ts"];
    let txt = "";
    for (const p of tryPaths) { try { txt = readFileSync(p, "utf-8"); if (txt) break; } catch {} }
    expect(txt).toMatch(/cancelarDripPro/);
    expect(txt).toMatch(/programarDripPro/);
    expect(txt).toMatch(/followup_pro/);
  });
});
