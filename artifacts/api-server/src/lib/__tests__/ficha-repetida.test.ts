/**
 * "Ya le mandé esa ficha" vale para ESTA sesión, no para siempre.
 *
 * Medido en vivo el 2026-08-22: al admin se le había enviado la ficha del
 * curso de piano el 16 de agosto. Seis días después escribió "hola, quiero
 * info del curso de piano" y recibió SOLO el texto —
 *
 *   "El curso de piano es justo lo que estabas buscando.
 *    Te lo dejo aquí para que lo veas con calma."
 *
 * — sin ninguna ficha abajo. El bot prometió algo que el propio sistema
 * estaba descartando por "repetido", mirando un mensaje de seis días antes.
 *
 * Estas pruebas fijan la regla del corte de sesión (4h, el mismo que define
 * `isNewSession`) sobre la lógica que arma `sentProductIds`.
 */
import { describe, it, expect } from "vitest";

const VENTANA_SESION_MS = 4 * 60 * 60 * 1000;

/** La misma decisión que toma `loadConversationMemory`. */
function fichasDeLaSesion(
  agentMessages: Array<{ productId: number; createdAt: Date }>,
  ultimoMensaje: Date,
): Set<number> {
  const corte = ultimoMensaje.getTime() - VENTANA_SESION_MS;
  const set = new Set<number>();
  for (const m of agentMessages) {
    if (m.createdAt.getTime() >= corte) set.add(m.productId);
  }
  return set;
}

const hace = (horas: number) => new Date(Date.now() - horas * 60 * 60 * 1000);
const AHORA = new Date();

describe("No repetir una ficha, pero solo dentro de la sesión", () => {
  it("una ficha de hace 6 días NO cuenta como enviada", () => {
    // El caso exacto que se rompió en producción.
    const set = fichasDeLaSesion([{ productId: 123, createdAt: hace(24 * 6) }], AHORA);
    expect(set.has(123)).toBe(false);
  });

  it("una ficha de hace 10 minutos SÍ cuenta: no hay que repetirla", () => {
    const set = fichasDeLaSesion([{ productId: 123, createdAt: hace(0.16) }], AHORA);
    expect(set.has(123)).toBe(true);
  });

  it("el corte son 4 horas, igual que isNewSession", () => {
    expect(fichasDeLaSesion([{ productId: 5, createdAt: hace(3.5) }], AHORA).has(5)).toBe(true);
    expect(fichasDeLaSesion([{ productId: 5, createdAt: hace(4.5) }], AHORA).has(5)).toBe(false);
  });

  it("con varias fichas, solo cuentan las de esta visita", () => {
    const set = fichasDeLaSesion(
      [
        { productId: 123, createdAt: hace(24 * 6) },  // piano, la semana pasada
        { productId: 115, createdAt: hace(24 * 5) },  // diseño, la semana pasada
        { productId: 87, createdAt: hace(0.5) },      // contabilidad, recién
      ],
      AHORA,
    );
    expect(set.has(87)).toBe(true);
    expect(set.has(123)).toBe(false);
    expect(set.has(115)).toBe(false);
  });

  it("una conversación sin fichas no rompe nada", () => {
    expect(fichasDeLaSesion([], AHORA).size).toBe(0);
  });
});
