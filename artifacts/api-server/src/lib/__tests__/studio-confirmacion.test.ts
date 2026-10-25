import { describe, it, expect } from "vitest";
import { isApproval, isRejection } from "../architect-store";
import { promptDelEstudio } from "../../../../ventas-pro/src/lib/prompt-estudio";
const contexto = "[CONTEXTO DEL ESTUDIO] Landing abierta: [131] Cámara. Creativo abierto: [abc] Cámara.";

describe("confirmaciones desde Studio", () => {
  it("el botón de aceptar llega al reconocedor real sin contexto interpuesto", () => {
    expect(isApproval(promptDelEstudio(contexto,"Sí, hacelo",true))).toBe(true);
    expect(promptDelEstudio(contexto,"Sí, hacelo",true)).toBe("Sí, hacelo");
  });
  it("el rechazo y las decisiones escritas no se convierten en otro pedido", () => {
    expect(isRejection(promptDelEstudio(contexto,"No, dejalo así",true))).toBe(true);
    expect(isApproval(promptDelEstudio(contexto,"sí"))).toBe(true);
  });
  it("un pedido con cambios conserva el contexto y no se trata como un sí simple", () => {
    const p=promptDelEstudio(contexto,"Sí, pero cambia el título");
    expect(p).toContain(contexto);
    expect(p).toContain("Sí, pero cambia el título");
  });
});
