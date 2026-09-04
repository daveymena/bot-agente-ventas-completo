/**
 * Ningún camino de envío puede saltarse las protecciones del número.
 *
 * ⚠️ Esta prueba existe porque el hueco YA pasó. `sendImage` llamaba a
 * enforceSendLimits() y al espaciado, pero nunca a verificarProteccionesAsync():
 * mandar una imagen se salteaba las TRES protecciones de verdad --envío en
 * frío, calentamiento del número nuevo, y mismo texto a muchos destinatarios--.
 *
 * Y no era un camino raro: las fichas de producto salen como imagen con
 * caption, así que es de lo más frecuente que manda el bot. La protección
 * principal tenía el agujero justo donde pasa el tráfico.
 *
 * Se verifica sobre el CÓDIGO y no ejecutando un envío a propósito: montar el
 * socket de Baileys para probar esto sería frágil y lento, y lo que se quiere
 * garantizar es estructural --que nadie agregue un cuarto camino de salida sin
 * las protecciones--. Mismo criterio que sin-caracteres-corruptos.
 *
 * Baileys es un cliente NO OFICIAL: si Meta restringe el número, el negocio se
 * queda sin su canal de ventas. Por eso esto se prueba y no se confía.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FUENTE = readFileSync(join(__dirname, "..", "whatsapp.ts"), "utf8");

/** El cuerpo de un método, desde su firma hasta el siguiente método del mismo nivel. */
function cuerpoDe(metodo: string): string {
  const i = FUENTE.indexOf(`async ${metodo}(`);
  expect(i, `no encontré el método ${metodo} en whatsapp.ts`).toBeGreaterThan(-1);
  const resto = FUENTE.slice(i);
  const fin = resto.indexOf("\n  async ", 1);
  return fin === -1 ? resto : resto.slice(0, fin);
}

describe("los caminos de envío al cliente llevan las protecciones puestas", () => {
  it.each(["sendText", "sendImage"])("%s consulta el envío en frío, el calentamiento y la repetición", (metodo) => {
    expect(cuerpoDe(metodo)).toContain("verificarProteccionesAsync");
  });

  it.each(["sendText", "sendImage"])("%s respeta el tope por hora y por día", (metodo) => {
    expect(cuerpoDe(metodo)).toContain("enforceSendLimits");
  });

  it.each(["sendText", "sendImage"])("%s espacia los envíos entre personas distintas", (metodo) => {
    expect(cuerpoDe(metodo)).toContain("esperarEspaciadoEntreEnvios");
  });

  /**
   * El orden importa tanto como la presencia: si la verificación quedara
   * DENTRO del try, un bloqueo caería al respaldo de "mando solo el texto" y
   * enviaría igual el mensaje que la protección acaba de prohibir, por otro
   * camino.
   */
  it("en sendImage la verificación va antes del try, no adentro", () => {
    const cuerpo = cuerpoDe("sendImage");
    expect(cuerpo.indexOf("verificarProteccionesAsync")).toBeLessThan(cuerpo.indexOf("try {"));
  });

  /**
   * Todo lo que sale por el socket gasta cupo del número, también el aviso de
   * pago al admin. Antes esos envíos no se contaban, así que los topes de
   * 60/hora y 400/día veían menos tráfico del que el número mandaba de verdad.
   */
  it("el aviso de pago al admin se cuenta contra el cupo", () => {
    const i = FUENTE.indexOf("[PAGO] Aviso enviado al admin");
    expect(i).toBeGreaterThan(-1);
    const alrededor = FUENTE.slice(i - 1200, i + 200);
    expect(alrededor).toContain("recordSendSuccess");
    expect(alrededor).toContain("esperarEspaciadoEntreEnvios");
  });

  /**
   * Pero ese mismo aviso NO alimenta el circuit breaker: un teléfono de admin
   * mal cargado fallaría siempre y, a los 5 fallos, pausaría TODOS los envíos
   * 30 minutos -- dejando a los clientes sin respuesta por un dato de
   * configuración que no tiene nada que ver con ellos.
   */
  it("y un admin mal configurado no puede pausar los envíos a los clientes", () => {
    const i = FUENTE.indexOf("no se pudo avisar al admin por WhatsApp");
    expect(i).toBeGreaterThan(-1);
    // Se busca la LLAMADA y no la palabra: el comentario que explica esta
    // decision nombra recordSendFailure(), y la primera version de esta prueba
    // se encontro a si misma y fallo.
    expect(FUENTE.slice(i - 400, i + 200)).not.toContain("this.recordSendFailure()");
  });

  /**
   * El envío en frío es, según el propio mensaje de error, la causa número uno
   * de bloqueo. Puede desactivarse por env var bajo responsabilidad del dueño,
   * pero el valor por defecto tiene que ser el seguro: un límite que hay que
   * acordarse de encender no es una protección.
   */
  it("el envío en frío está bloqueado por defecto", () => {
    expect(FUENTE).toContain('process.env.WA_PERMITIR_ENVIO_EN_FRIO !== "true"');
  });
});
