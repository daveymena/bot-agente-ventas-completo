/**
 * Ningún plan puede costar más de lo que cobra.
 *
 * ⚠️ Enterprise PERDÍA $31 en cada venta: $299 por 100.000 mensajes, que a
 * $0,0033 cuestan $330. Y el margen se derrumbaba a medida que el plan subía
 * --67%, 56%, 24%, negativo-- o sea al revés de lo que tiene que pasar.
 *
 * El costo sale de la factura REAL del dueño (2026-09-05):
 *   $13,03 USD · 3.915 pedidos · 748.346.644 tokens = $0,0033 por mensaje.
 *
 * Esta prueba existe porque un plan mal calculado no falla: se vende, y la
 * pérdida aparece en la factura del mes siguiente.
 */
import { describe, it, expect } from "vitest";
import { SAAS_PLANS } from "../../middleware/saasValidation";

/** Costo real por mensaje, medido contra la factura de DeepSeek. */
const COSTO_POR_MENSAJE = 0.0033;

/** Solo los que se cobran: los gratuitos no tienen margen que cuidar. */
const DE_PAGO = Object.entries(SAAS_PLANS).filter(([, p]) => p.price > 0);

describe("los planes de pago dejan margen", () => {
  it("hay planes de pago para revisar", () => {
    expect(DE_PAGO.length).toBeGreaterThan(0);
  });

  /** LA PRUEBA QUE IMPORTA: la que Enterprise no pasaba. */
  it.each(DE_PAGO)("%s no cuesta más de lo que cobra", (nombre, plan) => {
    const costo = plan.monthlyMessages * COSTO_POR_MENSAJE;
    expect(costo, `${nombre} cuesta $${costo.toFixed(2)} y se vende a $${plan.price}`).toBeLessThan(plan.price);
  });

  /**
   * Y con margen de verdad, no al filo. 60% es el piso: por debajo, un mes con
   * clientes que usan su cupo entero se come la ganancia.
   */
  it.each(DE_PAGO)("%s deja al menos 60% de margen", (nombre, plan) => {
    const margen = 1 - (plan.monthlyMessages * COSTO_POR_MENSAJE) / plan.price;
    expect(margen, `${nombre} deja ${(margen * 100).toFixed(0)}%`).toBeGreaterThanOrEqual(0.6);
  });

  /**
   * El margen NO puede empeorar al subir de plan. Era el pedido textual del
   * dueño: "si el básico gasta eso, al duplicarlo a un plan más alto debe ser
   * más caro para ganarle".
   */
  it("el margen no se derrumba en los planes grandes", () => {
    const porPrecio = [...DE_PAGO].sort((a, b) => a[1].price - b[1].price);
    const margenes = porPrecio.map(([, p]) => 1 - (p.monthlyMessages * COSTO_POR_MENSAJE) / p.price);
    const peor = Math.min(...margenes);
    const mejor = Math.max(...margenes);
    // Todos dentro de 20 puntos: parejo, no una escalera hacia abajo.
    expect(mejor - peor, `van de ${(peor * 100).toFixed(0)}% a ${(mejor * 100).toFixed(0)}%`).toBeLessThan(0.2);
  });

  /** Un plan más caro tiene que dar más mensajes, o no hay razón para subir. */
  it("más precio, más mensajes", () => {
    const porPrecio = [...DE_PAGO].sort((a, b) => a[1].price - b[1].price);
    for (let i = 1; i < porPrecio.length; i++) {
      expect(porPrecio[i][1].monthlyMessages).toBeGreaterThan(porPrecio[i - 1][1].monthlyMessages);
    }
  });
});
