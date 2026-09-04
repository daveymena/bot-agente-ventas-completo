import { describe, it, expect } from "vitest";
import { clasificarFallo } from "../optimized-rotation";

/**
 * Apartar UNA HORA a quien se pasó de un límite POR MINUTO es cambiar un
 * minuto malo por una hora mala.
 *
 * El tope de Groq son 8.000 tokens por minuto y se recupera al minuto
 * siguiente. Con una hora de castigo, un pico de tráfico dejaba fuera de juego
 * al único proveedor vivo, y TODOS los turnos de esa hora caían en los modelos
 * muertos de más abajo de la cadena.
 *
 * Es lo que el admin reportó dos veces el 2026-08-29: "poolside/laguna-xs-2.1
 * is temporarily rate-limited upstream". Laguna es el SÉPTIMO candidato de la
 * lista: el turno solo llega ahí si los seis de arriba no contestaron.
 */

const min = (ms: number) => ms / 60_000;

describe("El castigo dura lo que dura el problema", () => {
  it("si el proveedor dice cuánto esperar, se le hace caso", () => {
    // Groq contesta así, con decimales. OpenAI y OpenRouter usan la misma forma.
    const r = clasificarFallo("Rate limit reached. Please try again in 5.3s");
    expect(r.clase).toBe("cuota_agotada");
    // Se respeta el dato, pero nunca menos de 60s: reintentar a los 5s vuelve
    // a golpear la misma ventana de un minuto.
    expect(r.cooldownMs).toBe(60_000);
  });

  it("un tiempo largo que dé el proveedor se respeta hasta un techo", () => {
    expect(clasificarFallo("try again in 4 minutes").cooldownMs).toBe(4 * 60_000);
    // Techo de 10 min por si el número viene raro.
    expect(min(clasificarFallo("try again in 3 hours").cooldownMs)).toBe(10);
  });

  it("un límite POR MINUTO declarado como tal se reintenta pronto", () => {
    // El tope de Groq. Lo dice en el mensaje, así que no hay que adivinarlo.
    for (const e of [
      "Rate limit reached: tokens per minute exceeded",
      "429: TPM limit reached for this organization",
    ]) {
      expect(min(clasificarFallo(e).cooldownMs), e).toBe(1.5);
    }
  });

  it("pero sin NINGUNA pista, se mantiene la hora: es lo conservador", () => {
    // Deliberado, y salió de que esta prueba rompiera una anterior. Las
    // ventanas gratuitas suelen resetear por día --el admin llegó a ver "hasta
    // dentro de 21 horas" en OpenCode Zen-- y reintentar cada 90 s algo que
    // vuelve mañana gasta turnos de un cliente real esperando. El castigo se
    // acorta solo con EVIDENCIA de ventana corta, nunca por sospecha.
    expect(min(clasificarFallo("429 Too Many Requests").cooldownMs)).toBe(60);
    expect(min(clasificarFallo("FreeUsageLimitError: Rate limit exceeded").cooldownMs)).toBe(60);
  });

  it("pero una cuota DIARIA sí se gana la hora", () => {
    // Reintentar cada minuto algo que resetea mañana es gastar turnos al pedo.
    // El admin llegó a ver "hasta dentro de 21 horas" en un proveedor gratis.
    expect(min(clasificarFallo("You exceeded your daily quota").cooldownMs)).toBe(60);
    expect(min(clasificarFallo("quota exceeded, try again tomorrow").cooldownMs)).toBe(60);
    expect(min(clasificarFallo("monthly limit exceeded").cooldownMs)).toBe(60);
  });

  it("lo que NO es cuota sigue como estaba", () => {
    // Sin saldo son 6 horas: no se arregla esperando, se arregla pagando.
    expect(min(clasificarFallo("402 Insufficient Balance").cooldownMs)).toBe(360);
  });

  it('"try again in N" cuenta como límite aunque no diga "rate limit"', () => {
    // Lo encontró esta misma prueba: el patrón solo reconocía
    // `try again (later|tomorrow)`, así que "Please try again in 4 minutes"
    // --literalmente lo que contesta un limitador-- caía en la rama de modelo
    // caído y se reintentaba a los 30 s, DENTRO de la misma ventana que lo
    // acababa de rechazar.
    const r = clasificarFallo("Please try again in 4 minutes");
    expect(r.clase).toBe("cuota_agotada");
    expect(min(r.cooldownMs)).toBe(4);
  });
});
