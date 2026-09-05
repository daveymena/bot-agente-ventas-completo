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

  // Decisión de 782e115: pedir permiso para dar el precio no entrega nada y
  // obliga al cliente a contestar "sí" para recibir un dato que ya tenemos.
  it("elimina la pregunta del precio aunque el precio todavía no viaje", () => {
    const r = reconciliarPromesas([
      { kind: "text", content: "¿Te paso el precio? 💰" },
      { kind: "card", productId: 123, seccion: "info" },
    ]);
    expect(r.parts).toHaveLength(1);
    expect(r.parts[0].kind).toBe("card");
  });

  it("no deja al cliente esperando un dato que el envío no trae", () => {
    const r = reconciliarPromesas([
      { kind: "text", content: "💰 El valor es de $60.000 COP (pago único)\n\nLos medios de pago te los dejo acá abajo para que elijas." },
    ]);
    expect(r.parts[0].content).toContain("$60.000");
    expect(r.parts[0].content).not.toMatch(/medios de pago/i);
    expect(r.removed.join(" ")).toContain("prometido sin enviar");
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
