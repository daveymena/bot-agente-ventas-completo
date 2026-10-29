import { describe, it, expect } from "vitest";
import { payloadProductoCatalogo } from "../catalogo-producto";

const op = { appUrl: "https://ventasproia.com", moneda: "COP", marca: "Tienda Demo" };
const buen = { id: 7, name: "Corrector de postura", description: "Alivio diario", price: 89900, imageUrl: "https://ventasproia.com/img/7.jpg", isActive: true };

describe("payloadProductoCatalogo", () => {
  it("usa los nombres de campo de Meta", () => {
    const r = payloadProductoCatalogo(buen, op);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toMatchObject({
      name: "Corrector de postura",
      retailer_id: "PROD-7",
      image_url: "https://ventasproia.com/img/7.jpg",
      url: "https://ventasproia.com/p/7",
      availability: "in stock",
      condition: "new",
      brand: "Tienda Demo",
    });
    expect(r.payload.title).toBeUndefined();
    expect(r.payload.sku).toBeUndefined();
  });

  it("sin imagen pública no sale, y lo dice", () => {
    const r = payloadProductoCatalogo({ ...buen, imageUrl: "/uploads/7.jpg" }, op);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivos.join(" ")).toMatch(/imagen pública/);
  });

  it("sin APP_URL https no arma el enlace y lo dice", () => {
    const r = payloadProductoCatalogo(buen, { ...op, appUrl: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivos.join(" ")).toMatch(/APP_URL/);
  });

  it("precio cero no sale", () => {
    const r = payloadProductoCatalogo({ ...buen, price: 0 }, op);
    expect(r.ok).toBe(false);
  });

  it("sin descripción usa el nombre, y un producto inactivo queda sin stock", () => {
    const r = payloadProductoCatalogo({ ...buen, description: "", isActive: false }, op);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.description).toBe("Corrector de postura");
      expect(r.payload.availability).toBe("out of stock");
    }
  });

  it("recorta el nombre a 100 caracteres", () => {
    const r = payloadProductoCatalogo({ ...buen, name: "x".repeat(300) }, op);
    expect(r.ok && r.payload.name.length).toBe(100);
  });
});
