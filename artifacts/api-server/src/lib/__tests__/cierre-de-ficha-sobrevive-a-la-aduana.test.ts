import { describe, it, expect } from "vitest";
import { invitacionesDe } from "../ficha-parcial";
import { prepararTextoWhatsApp } from "../salida-segura-whatsapp";

/**
 * Producción, 12-09-2026, "Hola me interesa el bolso antirobo":
 *
 *   bot: 👜 BOLSO ANTIRROBO IMPERMEABLE GH07
 *        • Formación práctica para llevar tus habilidades al siguiente nivel.
 *   bot: Déjame confirmarte ese dato exacto y te respondo enseguida. 🙏
 *
 * La ficha cerraba con "¿Te paso el precio? 💰" y la aduana de salida borra
 * esa pregunta a propósito (OFERTA_PRECIO_SIN_DATO): quedaba "💰", que no
 * dice nada, y salía el respaldo. Dos módulos con reglas opuestas sobre la
 * misma frase. Regla del repo: si el sistema imprime una frase, un test la
 * lee de vuelta por el mismo camino por el que sale.
 */
const SECCIONES = ["precio", "info", "entrega", "pago", "video", "completa"] as const;

describe("cada cierre de ficha sobrevive a la aduana de salida", () => {
  for (const s of SECCIONES) {
    for (const esFisico of [true, false]) {
      for (const tieneVideo of [true, false]) {
        for (const yaVio of [true, false]) {
          for (const yaSabe of [true, false]) {
            const cierres = invitacionesDe(s as any, esFisico, tieneVideo, yaVio, yaSabe);
            for (const c of cierres) {
              it(`${s} · ${esFisico ? "físico" : "digital"} · video=${tieneVideo} · vio=${yaVio} · sabe=${yaSabe} · "${c}"`, () => {
                const salida = prepararTextoWhatsApp(c);
                expect(salida).not.toContain("confirmarte ese dato exacto");
                expect(salida.replace(/[^\p{L}]/gu, "").length).toBeGreaterThan(5);
              });
            }
          }
        }
      }
    }
  }

  it("un físico no cierra ofreciendo 'qué incluye'", () => {
    for (const s of ["completa", "info", "precio"] as const) {
      for (const c of invitacionesDe(s, true, false, false, false)) {
        expect(c, `${s}: ${c}`).not.toMatch(/incluye|trae|adentro/i);
      }
    }
  });
});
