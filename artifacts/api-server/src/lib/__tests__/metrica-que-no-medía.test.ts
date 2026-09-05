/**
 * La métrica de tiempo de respuesta, que nunca midió nada.
 *
 * ⚠️ Comparaba `msg.role === "assistant"`, pero el bot guarda sus respuestas
 * con `role: "agent"` --ver `saveAgentMessage` en conversation-engine.ts--.
 * Nunca coincidió con UNA sola respuesta del bot, así que
 * `averageResponseTime` fue siempre 0. Y un 0 en el panel no se lee como "no
 * hay datos": se lee como "contestamos al instante", que es lo contrario de
 * la verdad.
 *
 * Ocultó una respuesta real de 85 minutos.
 *
 * El segundo error es más sutil y más grave: descartaba como "outlier" todo lo
 * que pasara de 30 minutos. O sea que el promedio salía lindo JUSTO porque los
 * peores casos --los que pierden la venta-- eran los únicos que no entraban.
 * Un promedio que excluye los fracasos no mide calidad, la disimula.
 *
 * Se prueba sobre el código y no ejecutando la consulta porque el cálculo vive
 * dentro de un método que arma una query a Postgres; lo que se quiere fijar es
 * la decisión --qué roles cuentan y qué se hace con los lentos--, no el SQL.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ANALYTICS = readFileSync(join(__dirname, "..", "analytics.ts"), "utf8");

/**
 * El código sin comentarios.
 *
 * Hace falta porque los comentarios de este repo CITAN el bug que explican, y
 * una prueba que busca "esto ya no está" se encuentra a sí misma en la
 * explicación. Pasó cuatro veces en un mismo día --con recordSendFailure, con
 * el 503 del health, y acá-- así que se resuelve la clase entera en vez de
 * parchear cada caso.
 */
const SIN_COMENTARIOS = ANALYTICS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ENGINE = readFileSync(join(__dirname, "..", "conversation-engine.ts"), "utf8");

describe("mide el rol con el que el bot GUARDA de verdad", () => {
  /** La comprobación que ata la métrica a la realidad del guardado. */
  it("el bot guarda sus respuestas como \"agent\"", () => {
    const fn = ENGINE.slice(ENGINE.indexOf("export async function saveAgentMessage"));
    expect(fn.slice(0, 400)).toContain('role: "agent"');
  });

  it("y la métrica cuenta ese rol, no solo \"assistant\"", () => {
    expect(ANALYTICS).toContain("RESPUESTAS_DEL_BOT");
    const set = ANALYTICS.slice(ANALYTICS.indexOf("RESPUESTAS_DEL_BOT"), ANALYTICS.indexOf("RESPUESTAS_DEL_BOT") + 120);
    expect(set).toContain('"agent"');
    expect(set).toContain('"assistant"');
  });

  /** Lo que estaba: una comparación directa que nunca daba verdadero. */
  it("ya no compara solo contra \"assistant\"", () => {
    expect(SIN_COMENTARIOS).not.toContain('msg.role === "assistant"');
  });
});

describe("los casos malos se ven, no se descartan", () => {
  it("las respuestas lentas se cuentan aparte en vez de tirarse", () => {
    expect(ANALYTICS).toContain("respuestasLentas");
    expect(ANALYTICS).toContain("peorRespuestaMs");
  });

  /** El cliente que escribió y nadie contestó: la peor métrica de todas. */
  it("se cuenta a quien quedó sin respuesta", () => {
    expect(ANALYTICS).toContain("sinResponder");
  });

  it("los tres números salen en el resultado, no solo en el cálculo", () => {
    // Se normalizan los saltos de linea antes de buscar: git los convierte a
    // CRLF al hacer checkout en Windows, y un ancla escrita con salto de linea
    // deja de encontrarse despues de un rebase. Esta prueba fallo por eso, no
    // por el codigo que verifica.
    const plano = ANALYTICS.split("\r\n").join("\n");
    const retorno = plano.slice(plano.indexOf("return {\n        averageResponseTime"));
    for (const campo of ["respuestasLentas", "peorRespuestaMs", "sinResponder"]) {
      expect(retorno.slice(0, 400), `${campo} se calcula pero no se devuelve`).toContain(campo);
    }
  });

  it("y están en el tipo, para que el panel pueda mostrarlos", () => {
    const tipo = ANALYTICS.slice(ANALYTICS.indexOf("export interface PerformanceMetrics"), ANALYTICS.indexOf("messageVolume"));
    for (const campo of ["respuestasLentas", "peorRespuestaMs", "sinResponder"]) {
      expect(tipo).toContain(campo);
    }
  });
});

describe("detalles del cálculo que cambian el número", () => {
  /**
   * Dos mensajes seguidos del cliente: el reloj arranca en el PRIMERO, que es
   * cuando empezó a esperar. Medir desde el último regala minutos gratis.
   */
  it("mide desde el primer mensaje del cliente, no el último", () => {
    expect(ANALYTICS).toContain("if (!pendingCustomerMsgAt) pendingCustomerMsgAt = msg.createdAt");
  });
});
