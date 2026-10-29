import { describe, it, expect } from "vitest";
import { isApproval, isRejection, decisionSinContextoEstudio } from "../architect-store";
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

describe("compatibilidad del servidor con pestañas antiguas de Studio", () => {
  it.each(["Sí, hacelo", "sí", "dale", "ok", "hazlo"])("ejecuta la decisión explícita %s sin el prefijo visual", (respuesta) => {
    const recibido = `${contexto}\n\n${respuesta}`;
    expect(isApproval(recibido)).toBe(false);
    const decision = decisionSinContextoEstudio(recibido);
    expect(decision).toBe(respuesta); expect(isApproval(decision)).toBe(true);
  });
  it("un no conserva su sentido aunque el contexto mencione confirmar", () => {
    expect(isRejection(decisionSinContextoEstudio(`${contexto} Confirmar sí.\n\nNo, dejalo así`))).toBe(true);
  });
  it.each(["Sí, pero cambia el título", "Dale pero antes muéstrame el precio", "Crea otra pieza\n\nSí", "Enséñame el diseño", "Cambia el título de la pieza", "No, mejor prepara otra pieza"])("no convierte el pedido %s en una aprobación", (pedido) => {
    const recibido = `${contexto}\n\n${pedido}`;
    expect(decisionSinContextoEstudio(recibido)).toBe(recibido);
    expect(isApproval(decisionSinContextoEstudio(recibido))).toBe(false);
  });
  it("no elimina texto libre ni interpreta un sí incrustado como aprobación", () => {
    const recibido = `Mi nota: ${contexto}\n\nSí, hacelo`;
    expect(decisionSinContextoEstudio(recibido)).toBe(recibido);
    expect(decisionSinContextoEstudio("Sí, hacelo")).toBe("Sí, hacelo");
  });
});
