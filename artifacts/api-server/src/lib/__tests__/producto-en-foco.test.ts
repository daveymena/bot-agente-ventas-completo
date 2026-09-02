import { describe, it, expect } from "vitest";
import { productoEnFoco, ultimaFichaEnviada } from "../producto-en-foco";

const PIANO = { id: 123, name: "Curso de Piano Completo", kind: "digital" };
const IA = { id: 124, name: "Inteligencia Artificial 2026", kind: "digital" };
const COJIN = { id: 55, name: "Cojín ortopédico para moto", kind: "physical" };
const CATALOGO = [PIANO, IA, COJIN];

const hist = (...ids: Array<number | null>) =>
  ids.map((id) => ({ role: "agent", metadata: id ? { productId: id } : null }));

/**
 * El caso real del 2026-09-02. Cinco mensajes hablando del piano y al
 * "Exelente" del cliente el producto se perdió: como no nombra nada, la cadena
 * `delMensaje ?? aMostrar ?? currentProductId` daba null, y el agente se cayó
 * a la etiqueta del vendedor pidiendo dirección y cédula por un curso.
 */
describe("La conversación no se olvida de qué producto era", () => {
  it("«Exelente» sigue hablando del piano, porque la ficha ya salió", () => {
    const p = productoEnFoco({
      delMensaje: null,
      aMostrar: null,
      idActivo: null,
      historial: hist(123) as any,
      catalogo: CATALOGO,
    });
    expect(p?.id).toBe(123);
  });

  it("la última ficha manda sobre las anteriores", () => {
    expect(ultimaFichaEnviada(hist(123, null, 124) as any)).toBe(124);
  });

  it("sin nada de dónde agarrarse, devuelve null y no inventa", () => {
    expect(productoEnFoco({ historial: [], catalogo: CATALOGO })).toBe(null);
    expect(productoEnFoco({ historial: hist(null) as any, catalogo: CATALOGO })).toBe(null);
  });
});

describe("Pero si el cliente cambia de producto, se le sigue", () => {
  it("lo que nombra AHORA gana sobre la ficha vieja", () => {
    const p = productoEnFoco({
      delMensaje: IA,
      historial: hist(123) as any,
      catalogo: CATALOGO,
    });
    expect(p?.id).toBe(124);
  });

  it("y el que se decidió mostrar gana sobre el activo viejo", () => {
    const p = productoEnFoco({
      aMostrar: COJIN,
      idActivo: 123,
      historial: hist(123) as any,
      catalogo: CATALOGO,
    });
    expect(p?.id).toBe(55);
  });

  it("el id se resuelve contra el catálogo, así viene el producto completo", () => {
    // Importa: quien lo llama necesita el `kind` para saber si se despacha.
    const p = productoEnFoco({ idActivo: 55, catalogo: CATALOGO });
    expect(p?.kind).toBe("physical");
  });
});

// ── La otra mitad de la memoria: lo que NO debe persistir ──────────────────

import { calcularEtapa } from "../estado-cognitivo";

/**
 * Visto el 2026-09-02. El mismo teléfono venía de una conversación de la
 * madrugada que terminó en "mandame el comprobante". Horas después escribió
 * "¿tienes el curso de piano?" y lo primero que recibió fue el pedido del
 * comprobante: caja antes de información, a alguien que solo preguntaba.
 */
describe("«dice que pagó» caduca cuando el cliente vuelve otro día", () => {
  const historial = [
    { role: "customer", content: "ya te hice la transferencia" },
    { role: "agent", content: "mandame el comprobante" },
    { role: "customer", content: "tienes el curso de piano?" },
  ] as any;

  it("dentro de la misma sesión, la etapa se mantiene", () => {
    const r = calcularEtapa({ historial, sesionNueva: false });
    expect(r.etapa).toBe("pago_reportado");
  });

  it("pero si vuelve después de horas, ya no arrastra el pago", () => {
    const r = calcularEtapa({ historial, sesionNueva: true });
    expect(r.etapa).not.toBe("pago_reportado");
  });

  it("un pago verificado de verdad NO caduca", () => {
    // Ese viene de fuera del chat, no de lo que el cliente dice.
    const r = calcularEtapa({ historial, sesionNueva: true, pagoVerificado: true });
    expect(r.etapa).toBe("pago_verificado");
  });
});
