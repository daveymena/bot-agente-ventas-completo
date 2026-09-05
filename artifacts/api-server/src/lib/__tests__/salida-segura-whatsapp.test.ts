import { describe, expect, it } from "vitest";
import {
  bloquearPlaceholders,
  limpiarFormato,
  prepararSalidaFinal,
  prepararTextoWhatsApp,
  reconciliarPromesas,
} from "../salida-segura-whatsapp";

describe("salida final de WhatsApp", () => {
  it("bloquea precios placeholder", () => {
    const r = bloquearPlaceholders("💰 El valor es de $X.XXX COP (pago único)");
    expect(r.text).toBe("");
    expect(r.blocked.length).toBeGreaterThan(0);
  });

  it("bloquea marcadores de enlace y producto", () => {
    const r = bloquearPlaceholders("Te dejo el enlace: [LINK]");
    expect(r.text).toBe("");
    expect(r.blocked[0]).toContain("[LINK]");
  });

  it("no bloquea datos reales", () => {
    const r = bloquearPlaceholders("💰 El valor es de $60.000 COP (pago único).");
    expect(r.text).toContain("$60.000");
    expect(r.blocked).toHaveLength(0);
  });

  it("quita la pregunta de información cuando la ficha viaja en el mismo envío", () => {
    const r = reconciliarPromesas([
      { kind: "text", content: "¿Quieres que te pase toda la info por acá?" },
      { kind: "card", productId: 123, seccion: "info" },
    ]);
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0].kind).toBe("card");
  });

  it("conserva la pregunta del precio si el precio todavía no viaja", () => {
    const r = reconciliarPromesas([
      { kind: "text", content: "¿Te paso el precio? 💰" },
      { kind: "card", productId: 123, seccion: "info" },
    ]);
    expect(r.parts[0].content).toContain("¿Te paso el precio?");
  });

  it("quita una promesa de pago si no hay parte de pago", () => {
    const r = reconciliarPromesas([
      { kind: "text", content: "Los medios de pago te los dejo acá abajo." },
      { kind: "text", content: "¿Tienes alguna duda?" },
    ]);
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0].content).toContain("¿Tienes alguna duda?");
  });

  it("no deja espacios después de ¿ o ¡ cuando se elimina un emoji", () => {
    expect(limpiarFormato("¡ Hola!\n¿ 🚀 Listo para empezar?")).toBe("¡Hola!\n¿Listo para empezar?");
  });

  it("elimina duplicados exactos de texto dentro del mismo envío", () => {
    const r = prepararSalidaFinal([
      { kind: "text", content: "Te explico el curso." },
      { kind: "text", content: "Te explico el curso." },
      { kind: "card", productId: 123, seccion: "info" },
    ]);
    expect(r.parts.filter((p) => p.kind === "text")).toHaveLength(1);
  });

  it("nunca devuelve un placeholder como texto de WhatsApp", () => {
    const texto = prepararTextoWhatsApp("$X.XXX");
    expect(texto).not.toMatch(/X\.XXX/i);
    expect(texto).toContain("confirmarte ese dato exacto");
  });
});
