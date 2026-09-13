/**
 * El candado que avisa "todavía no se guardó nada", contra el chat REAL.
 *
 * Los dos primeros casos son texto copiado del chat de producción del
 * 2026-09-03 que trajo el admin. En los dos salió el aviso, y en los dos
 * estaba de más.
 */
import { describe, it, expect } from "vitest";
import { afirmaHaberloHecho } from "../afirma-haberlo-hecho";

describe("cuando Atlas dice que ya hizo algo", () => {
  it("lo caza: '✅ Borrador 89 subido a Meta en pausa'", () => {
    expect(afirmaHaberloHecho("✅ Borrador 89 subido a Meta en pausa. 📂 La campaña quedó pausada")).toBe(true);
  });

  it("lo caza: 'Campos guardados y valores'", () => {
    expect(afirmaHaberloHecho("✅ Campos guardados y valores: Presupuesto diario: $10.000")).toBe(true);
  });

  it("lo caza: 'la campaña fue publicada'", () => {
    expect(afirmaHaberloHecho("La campaña fue publicada en tu cuenta de Meta.")).toBe(true);
  });

  it("lo caza: 'el anuncio ya está actualizado'", () => {
    expect(afirmaHaberloHecho("El anuncio ya está actualizado con el presupuesto nuevo.")).toBe(true);
  });
});

describe("cuando NO afirma nada (chat real del 2026-09-03)", () => {
  /**
   * Respuesta puramente conversacional. Salió con el aviso encima diciéndole
   * al admin que "pidiera de nuevo" algo que nunca se pidió guardar.
   *
   * Casaba por "copy + estado": `estado` termina en -ado.
   */
  it("una respuesta de charla no dispara el aviso", () => {
    const real =
      "Tenés razón, y te soy honesto: me estoy colgando porque intento entregarte todo el " +
      "paquete completo (estrategia + copy + estado del embudo) en una sola respuesta larga, " +
      "y eso hace que el turno se corte a mitad de camino antes de que pueda ejecutar lo importante.";
    expect(afirmaHaberloHecho(real)).toBe(false);
  });

  /**
   * Diagnóstico con viñetas de ✅. Describe el problema, no afirma trabajo
   * hecho -- y encima el mensaje TENÍA plan y terminaba en "¿Confirmás?", así
   * que el aviso lo contradecía: "no quedó ninguna acción pendiente".
   */
  it("un diagnóstico con ✅ no dispara el aviso", () => {
    const real =
      "📌 Estado actual del funnel\n" +
      "✅ Problema identificado: 71 conversaciones en WhatsApp → 0 ventas.\n" +
      "✅ Causa: el agente no cierra ventas; la gente llega pero no compra.";
    expect(afirmaHaberloHecho(real)).toBe(false);
  });

  /**
   * REGRESIÓN CARA: "pedido" está en el latido de progreso que escribe el
   * SERVIDOR cada 15s. El candado podía dispararse por texto que el modelo ni
   * siquiera escribió.
   */
  it("'Sigo trabajando en tu pedido' no dispara el aviso", () => {
    expect(afirmaHaberloHecho("✅ Sigo trabajando en tu pedido, ya casi termino.")).toBe(false);
  });

  it("'encontré estos productos relacionados' no dispara el aviso", () => {
    expect(afirmaHaberloHecho("Listo, encontré estos productos relacionados. ¿Cuál querés?")).toBe(false);
  });

  it("hablar del mercado o del resultado no dispara el aviso", () => {
    expect(afirmaHaberloHecho("✅ El mercado colombiano tiene un resultado parecido en ese sentido.")).toBe(false);
  });

  it("un texto vacío no dispara nada", () => {
    expect(afirmaHaberloHecho("")).toBe(false);
    expect(afirmaHaberloHecho(undefined as any)).toBe(false);
  });
});

describe("los sustantivos no tapan a un participio de verdad", () => {
  /**
   * Lo que NO puede pasar: que agregar la lista de sustantivos apague el
   * candado. Si el mismo mensaje trae uno de cada, gana el que afirma.
   */
  it("'estado' primero y 'guardado' después: igual avisa", () => {
    expect(afirmaHaberloHecho("✅ El estado del embudo y el borrador quedó guardado en el sistema.")).toBe(true);
  });

  it("con acentos también compara bien", () => {
    // "está" acentuado en el patrón 2, con un participio real detrás.
    expect(afirmaHaberloHecho("La campaña está publicada.")).toBe(true);
  });
});

/**
 * Las regex son /g y viven a nivel de módulo: `lastIndex` sobrevive entre
 * llamadas. Sin reiniciarlo, la segunda consulta arranca a mitad del texto
 * anterior y se saltea coincidencias -- el candado quedaría mudo de a ratos,
 * que es la peor forma de fallar: intermitente.
 */
describe("llamarlo dos veces da lo mismo", () => {
  it("no se contagia el estado de la llamada anterior", () => {
    const afirma = "✅ Borrador 89 subido a Meta.";
    expect(afirmaHaberloHecho(afirma)).toBe(true);
    expect(afirmaHaberloHecho(afirma)).toBe(true);
    expect(afirmaHaberloHecho(afirma)).toBe(true);
  });
});

describe("13-09: leer un estado o negar no es afirmar trabajo hecho", () => {
  it("estados leídos con herramientas", () => {
    expect(afirmaHaberloHecho("📱 WhatsApp: conectado, número 573042748687.\n❌ Instagram: NO autorizado.\n🤖 Sofía: sigue figura como activa.")).toBe(false);
    expect(afirmaHaberloHecho("Así que si lo que hiciste fue dejarla apagada, no quedó guardado: desde el sistema me sigue apareciendo activa.")).toBe(false);
  });
  it("pero un trabajo afirmado sigue detectándose", () => {
    expect(afirmaHaberloHecho("✅ Listo, el anuncio quedó creado y guardado como borrador.")).toBe(true);
  });
});
