import { describe, it, expect } from "vitest";
import { fotosDe } from "../dropi-directo";

const CDN = "https://d39ru7awumhhs2.cloudfront.net";

describe("fotosDe: trae TODAS las fotos del producto de Dropi, sin repetir", () => {
  it("galería (principal primero) + variaciones + descripción", () => {
    const fotos = fotosDe({
      id: 1, name: "Bolso",
      gallery: [
        { url: null, main: false, urlS3: "colombia/products/1/b.jpg" },
        { url: null, main: true, urlS3: "colombia/products/1/a.jpg" },
      ],
      variations: [
        { id: 10, gallery: [{ urlS3: "colombia/products/1/negro.webp" }], attribute_values: [{ value: "NEGRO", image: "colombia/products/1/swatch-negro.png" }] },
        { id: 11, gallery: [{ urlS3: "colombia/products/1/a.jpg" }] }, // repetida por URL
      ],
      description: '<p>Hola</p><img src="https://cdn.otro.com/desc.jpg"><img src="https://cdn.otro.com/desc.jpg">',
      user: { id: 5, store_name: "X", avatar: "colombia/users/5/avatar.jpg" }, // NO es foto del producto
    } as any);
    expect(fotos[0]).toBe(`${CDN}/colombia/products/1/a.jpg`);
    expect(fotos).toEqual([
      `${CDN}/colombia/products/1/a.jpg`,
      `${CDN}/colombia/products/1/b.jpg`,
      `${CDN}/colombia/products/1/negro.webp`,
      `${CDN}/colombia/products/1/swatch-negro.png`,
      "https://cdn.otro.com/desc.jpg",
    ]);
  });

  it("ignora strings que no son imágenes", () => {
    expect(fotosDe({ id: 2, name: "x", gallery: [{ urlS3: "colombia/products/2/ficha.pdf" }], sku: "ABC-1.png" } as any)).toEqual([]);
  });
});
