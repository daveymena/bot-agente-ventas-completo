/**
 * §8 del playbook: el producto del MENSAJE ACTUAL tiene prioridad.
 *
 * El documento lo define así, en ese orden: el producto del mensaje actual
 * gana sobre el producto del anuncio, sobre el de la conversación anterior y
 * sobre el históricamente preferido. Y agrega el síntoma concreto:
 *
 *   "NO volver a pedir comprobante de pago de un producto que el cliente no
 *    acaba de comprar."
 *
 * ⚠️ `productoEnFoco` ya resolvía esto bien, pero había una TERCERA resolución
 * escrita a mano en agent.ts --la que calcula en qué paso del embudo está la
 * conversación-- y tenía el orden INVERTIDO:
 *
 *     decision.productToShow ?? decision.productoDelMensaje
 *
 * O sea que el producto de la conversación le ganaba al que el cliente acababa
 * de nombrar. El cliente venía de un anuncio de IA, preguntaba por diseño
 * gráfico, y el agente seguía en el embudo del primero.
 *
 * Tres formas de decidir lo mismo es como se llega a que dos digan una cosa y
 * la tercera otra. Esta prueba fija el orden y verifica que agent.ts use la
 * función compartida en vez de resolverlo por su cuenta.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { productoEnFoco } from "../producto-en-foco";

const IA = { id: 124, name: "Curso de Inteligencia Artificial" };
const DISENO = { id: 88, name: "Curso de Diseño Gráfico" };
const CATALOGO = [IA, DISENO];

describe("el orden de prioridad del playbook", () => {
  /** EL CASO DEL DUEÑO: venía de IA y preguntó por diseño gráfico. */
  it("el producto del mensaje le gana al de la conversación", () => {
    const foco = productoEnFoco({
      delMensaje: DISENO as any,
      aMostrar: IA as any,
      idActivo: IA.id,
      historial: [],
      catalogo: CATALOGO as any,
    });
    expect(foco?.id).toBe(DISENO.id);
  });

  it("y también le gana al producto activo de la sesión", () => {
    const foco = productoEnFoco({
      delMensaje: DISENO as any,
      aMostrar: null as any,
      idActivo: IA.id,
      historial: [],
      catalogo: CATALOGO as any,
    });
    expect(foco?.id).toBe(DISENO.id);
  });

  /** Sin producto en el mensaje, la conversación sigue mandando. */
  it("si el mensaje no nombra ninguno, sigue el de la conversación", () => {
    const foco = productoEnFoco({
      delMensaje: null as any,
      aMostrar: IA as any,
      idActivo: null,
      historial: [],
      catalogo: CATALOGO as any,
    });
    expect(foco?.id).toBe(IA.id);
  });

  it("y si tampoco hay, el activo de la sesión", () => {
    const foco = productoEnFoco({
      delMensaje: null as any,
      aMostrar: null as any,
      idActivo: IA.id,
      historial: [],
      catalogo: CATALOGO as any,
    });
    expect(foco?.id).toBe(IA.id);
  });
});

describe("una sola resolución, no tres", () => {
  const AGENTE = readFileSync(join(__dirname, "..", "agent.ts"), "utf8");
  /** Sin comentarios: los comentarios de este repo CITAN el código que arreglan. */
  const CODIGO = AGENTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  /** La línea exacta que tenía el orden al revés. */
  it("ya no resuelve el producto del embudo a mano y al revés", () => {
    expect(CODIGO).not.toContain("decision.productToShow\n      ?? (decision.productoDelMensaje");
    expect(CODIGO).not.toMatch(/productoEstado\s*=\s*decision\.productToShow/);
  });

  /**
   * Y lo resuelve con la función compartida: si mañana cambia el orden del
   * playbook, se cambia en un solo lugar.
   */
  it("usa productoEnFoco para el paso del embudo", () => {
    const i = CODIGO.indexOf("const productoEstado");
    expect(i).toBeGreaterThan(-1);
    expect(CODIGO.slice(i, i + 200)).toContain("productoEnFoco");
  });
});
