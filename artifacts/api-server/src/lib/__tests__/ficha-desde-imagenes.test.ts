import { describe, it, expect } from "vitest";
import { descripcionVacia, imagenesDelProducto } from "../ficha-desde-imagenes";

describe("qué descripción cuenta como vacía", () => {
  it("el título repetido, un número o nada", () => {
    expect(descripcionVacia({ name: "BOLSO ANTIRROBO IMPERMEABLE GH07", description: "BOLSO ANTIRROBO IMPERMEABLE GH07" })).toBe(true);
    expect(descripcionVacia({ name: "X", description: "<p>53569</p>" })).toBe(true);
    expect(descripcionVacia({ name: "X", description: "" })).toBe(true);
    expect(descripcionVacia({ name: "Piano", description: "Aprende a tocar piano paso a paso, desde cero hasta nivel avanzado." })).toBe(false);
  });
});

describe("de dónde salen las imágenes", () => {
  // Desde 13-09-2026 la lista sale de lib/fotos-de-producto: la principal
  // primero (es la que el dueño eligió), después la galería y las de Dropi/Woo.
  it("la principal primero, luego las del proveedor, sin repetidas ni más de 5", () => {
    const urls = imagenesDelProducto({
      imageUrl: "/images/products/178.jpg",
      metadata: JSON.stringify({ woocommerce: { imageUrls: ["https://cdn/a.jpg", "https://cdn/b.png", "https://cdn/a.jpg", "https://cdn/c.WEBP", "https://cdn/d.jpg", "https://cdn/e.jpg", "https://cdn/f.jpg"] } }),
    }, "https://ventasproia.com/");
    expect(urls[0]).toBe("https://ventasproia.com/images/products/178.jpg");
    expect(urls[1]).toBe("https://cdn/a.jpg");
    expect(urls).toHaveLength(5);
    expect(new Set(urls).size).toBe(5);
  });
  it("sin metadata usa la imagen propia absoluta", () => {
    expect(imagenesDelProducto({ imageUrl: "/images/products/1.jpg", metadata: null }, "https://ventasproia.com")).toEqual(["https://ventasproia.com/images/products/1.jpg"]);
  });
});
