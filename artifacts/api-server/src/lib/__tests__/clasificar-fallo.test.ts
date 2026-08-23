/**
 * Un proveedor sin crédito no se arregla en 5 segundos.
 *
 * Todos los mensajes de error de acá abajo son REALES: salieron de probar los
 * proveedores de producción el 2026-08-22. El cooldown era de 5 segundos y
 * recién después de 2 fallos, así que el bot reintentaba en CADA mensaje uno
 * que estaba sin saldo y otro con la cuota agotada hasta dentro de 21 horas.
 * Cada reintento se lleva su timeout con un cliente esperando.
 */
import { describe, it, expect } from "vitest";
import { clasificarFallo } from "../optimized-rotation";

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

describe("Clasificar por qué falló un proveedor", () => {
  it("sin medio de pago: se aparta de una y por horas", () => {
    const r = clasificarFallo("CreditsError: No payment method. Add a payment method here: https://opencode.ai/...");
    expect(r.clase).toBe("sin_credito");
    expect(r.inmediato).toBe(true);
    expect(r.cooldownMs).toBeGreaterThanOrEqual(6 * HORA);
  });

  it("cuota gratuita agotada: se aparta de una, no se reintenta cada mensaje", () => {
    for (const e of [
      "Error from provider (Console): Rate limit exceeded. Please try again later.",
      "FreeUsageLimitError: Rate limit exceeded",
      "429 Too Many Requests",
    ]) {
      const r = clasificarFallo(e);
      expect(r.clase).toBe("cuota_agotada");
      expect(r.inmediato).toBe(true);
      expect(r.cooldownMs).toBeGreaterThanOrEqual(1 * HORA);
    }
  });

  it("credencial inválida o vencida: se aparta por horas", () => {
    const r = clasificarFallo('{"message":"Bad credentials","status":"401"}');
    expect(r.clase).toBe("sin_clave");
    expect(r.inmediato).toBe(true);
  });

  it("un MODELO caído NO aparta al proveedor entero", () => {
    // opencode_zen tiene 64 modelos: que uno esté muerto no lo deja inútil.
    for (const e of [
      "400 Error from provider (Console): Upstream request failed: Model is unavailable.",
      "401 Model ling-3.0-flash-free is not supported",
      "The model `llama-3.1-8b-instant` does not exist or you do not have access to it",
    ]) {
      const r = clasificarFallo(e);
      expect(r.clase).toBe("modelo_caido");
      expect(r.inmediato).toBe(false);
      expect(r.cooldownMs).toBeLessThan(2 * MINUTO);
    }
  });

  it("timeout y red son transitorios de verdad: cooldown corto", () => {
    for (const e of [
      "Request timed out.",
      "Connection error.: fetch failed: getaddrinfo ENOTFOUND models.inference.ai.azure.com",
    ]) {
      const r = clasificarFallo(e);
      expect(r.clase).toBe("lento");
      expect(r.cooldownMs).toBeLessThanOrEqual(5 * MINUTO);
    }
  });

  it("lo que no se reconoce no se castiga de más", () => {
    const r = clasificarFallo("algo raro pasó");
    expect(r.clase).toBe("desconocido");
    expect(r.inmediato).toBe(false);
    expect(r.cooldownMs).toBeLessThanOrEqual(1 * MINUTO);
  });

  it("sin mensaje de error tampoco explota", () => {
    expect(clasificarFallo(undefined).clase).toBe("desconocido");
    expect(clasificarFallo("").clase).toBe("desconocido");
  });

  it("un proveedor sin crédito espera MUCHO más que uno lento", () => {
    const sinCredito = clasificarFallo("No payment method");
    const lento = clasificarFallo("Request timed out.");
    expect(sinCredito.cooldownMs).toBeGreaterThan(lento.cooldownMs * 50);
  });
});
