import { describe, it, expect, beforeEach } from "vitest";
import {
  registrarTurnoAtendido,
  registrarProveedorCastigado,
  saludDeLaCadena,
  _reiniciarSaludDeLaCadena,
} from "../monitoring";

/**
 * Todo lo que se rompió el 2026-08-29 lo hizo EN SILENCIO.
 *
 *   · GROQ_MODEL apuntaba a llama-3.1-8b-instant, dado de baja
 *   · el filtro de herramientas del puente MCP estaba anulado por un spread
 *   · Advantage+ Audience estaba apagado en TODAS las campañas
 *   · oc-groq pedía un modelo que Groq retiró
 *   · el bot de ventas contestaba con el modelo chico teniendo el grande
 *   · un 429 de un minuto apartaba al proveedor una hora entera
 *
 * Ninguno devolvió un error. Todos devolvieron una respuesta peor, más lenta o
 * más barata, y el admin lo descubrió por el resultado -- o no lo descubrió.
 *
 * `monitoring.ts` llevaba 345 líneas sin que nadie lo importara, mientras
 * `analytics.ts` decía en un comentario que "no existe infraestructura de
 * monitoreo" y devolvía `errorRate = 0 // not tracked`.
 *
 * Esto es lo que le faltaba: registrar QUÉ contestó de verdad y QUIÉN está
 * castigado.
 */

beforeEach(() => _reiniciarSaludDeLaCadena());

describe("Salud de la cadena de IA", () => {
  it("sin turnos, lo dice en vez de inventar un número", () => {
    const s = saludDeLaCadena();
    expect(s.estado).toBe("bien");
    expect(s.turnosUltimaHora).toBe(0);
    expect(s.resumen).toContain("no hay nada que medir");
  });

  it("si contesta siempre el primero de la cadena, está bien", () => {
    for (let i = 0; i < 10; i++) registrarTurnoAtendido("groq", "openai/gpt-oss-120b", false);
    const s = saludDeLaCadena();
    expect(s.estado).toBe("bien");
    expect(s.porcentajeConRespaldo).toBe(0);
    expect(s.modeloMasUsado).toBe("groq/openai/gpt-oss-120b");
    expect(s.resumen).toContain("Nadie apartado");
  });

  it("si la mayoría la atiende un respaldo, es crítico", () => {
    // El caso real: Groq apartado y todo cayendo al modelo chico. Que la
    // mitad de los turnos los atienda un respaldo ya no es un pico -- es el
    // estado normal, y el proveedor principal no está sirviendo.
    for (let i = 0; i < 3; i++) registrarTurnoAtendido("groq", "openai/gpt-oss-120b", false);
    for (let i = 0; i < 7; i++) registrarTurnoAtendido("groq", "openai/gpt-oss-20b", true);
    const s = saludDeLaCadena();
    expect(s.estado).toBe("critico");
    expect(s.porcentajeConRespaldo).toBe(70);
    expect(s.resumen).toContain("respaldo");
  });

  it("un respaldo suelto es ruido, no una degradación", () => {
    // 1 de 10 pasa: un pico puntual no tiene que encender una alarma, o el
    // panel se vuelve ruido y el admin deja de mirarlo.
    for (let i = 0; i < 9; i++) registrarTurnoAtendido("groq", "openai/gpt-oss-120b", false);
    registrarTurnoAtendido("groq", "qwen/qwen3.8-27b", true);
    expect(saludDeLaCadena().estado).toBe("bien");
  });

  it("pero tres de cada diez ya es una degradación", () => {
    for (let i = 0; i < 7; i++) registrarTurnoAtendido("groq", "openai/gpt-oss-120b", false);
    for (let i = 0; i < 3; i++) registrarTurnoAtendido("groq", "qwen/qwen3.8-27b", true);
    expect(saludDeLaCadena().estado).toBe("degradado");
  });

  it("cero turnos CON castigos no es 'no hay nada que medir'", () => {
    // Lo encontró esta misma prueba. El resumen decía "no hay nada que medir
    // todavía" e ignoraba los proveedores apartados -- justo el silencio que
    // este módulo existe para romper. Y es el peor escenario posible: cero
    // turnos con todo apartado puede significar que no contesta NADIE.
    registrarProveedorCastigado("groq", "cuota_agotada", 90_000, "429");
    const s = saludDeLaCadena();
    expect(s.resumen).toContain("apartados");
    expect(s.resumen).toContain("groq");
    expect(s.resumen).not.toContain("no hay nada que medir");
  });

  it("dice QUIÉN está apartado y por cuánto -- ese es el dato útil", () => {
    // Sin esto, "el bot anda lento" no tiene explicación. Con esto, la tiene.
    registrarProveedorCastigado("groq", "cuota_agotada", 90_000, "429 tokens per minute");
    const s = saludDeLaCadena();
    expect(s.estado).toBe("degradado");
    expect(s.castigadosAhora).toHaveLength(1);
    expect(s.castigadosAhora[0].proveedor).toBe("groq");
    expect(s.castigadosAhora[0].clase).toBe("cuota_agotada");
    expect(s.castigadosAhora[0].motivo).toContain("tokens per minute");
    expect(s.resumen).toContain("groq");
  });

  it("un castigo vencido ya no cuenta", () => {
    // Se registra con cooldown negativo: ya pasó. No tiene que aparecer como
    // problema actual, o el panel mostraría alarmas viejas para siempre.
    registrarProveedorCastigado("mistral", "sin_credito", -1000, "402");
    expect(saludDeLaCadena().castigadosAhora).toHaveLength(0);
  });

  it("tres proveedores caídos a la vez es crítico aunque conteste el primero", () => {
    // La cadena puede estar respondiendo bien HOY y estar a un fallo de
    // quedarse muda. Eso también hay que verlo.
    for (let i = 0; i < 10; i++) registrarTurnoAtendido("groq", "openai/gpt-oss-120b", false);
    for (const p of ["openrouter", "deepseek", "mistral"]) {
      registrarProveedorCastigado(p, "sin_credito", 6 * 60 * 60 * 1000, "402 sin saldo");
    }
    const s = saludDeLaCadena();
    expect(s.estado).toBe("critico");
    expect(s.castigadosAhora).toHaveLength(3);
  });

  it("del mismo proveedor se queda el castigo más largo, no el último", () => {
    // Si se apartó 90 s por límite por minuto y después 6 h por falta de
    // saldo, lo que importa es que faltan 6 h.
    registrarProveedorCastigado("groq", "cuota_agotada", 90_000, "429");
    registrarProveedorCastigado("groq", "sin_credito", 6 * 60 * 60 * 1000, "402");
    const s = saludDeLaCadena();
    expect(s.castigadosAhora).toHaveLength(1);
    expect(s.castigadosAhora[0].minutosRestantes).toBeGreaterThan(300);
  });
});
