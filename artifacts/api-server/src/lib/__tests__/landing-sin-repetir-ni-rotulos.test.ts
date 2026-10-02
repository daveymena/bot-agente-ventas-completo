import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { huellaVisual, distanciaVisual, MISMA_FOTO_MAX_BITS } from "../fotos-de-producto";
import { sinRotulosInternos, sanearHtmlDeLanding } from "../landing/sanear-html";

/**
 * Landing publicada de la mochila con canguro (30-09-2026): la misma foto
 * salía dos veces (copia local .jpg + .webp de Dropi, bytes distintos) y los
 * rótulos del método ("El problema", "La solución") se veían en la página.
 */
async function foto(formato: "jpeg" | "webp", ancho: number, invertida = false): Promise<Buffer> {
  // Una "foto" con estructura: degradado horizontal + un bloque oscuro.
  const w = 120, h = 90;
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = Math.round((x / w) * 255);
    if (x > 30 && x < 70 && y > 20 && y < 60) v = 20;
    if (invertida) v = 255 - v;
    px.set([v, v, v], (y * w + x) * 3);
  }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } }).resize(ancho)[formato]({ quality: 70 }).toBuffer();
}

describe("fotos repetidas por contenido visual", () => {
  it("la misma foto en JPG y en WebP, de otro tamaño, es la MISMA foto", async () => {
    const a = await huellaVisual(await foto("jpeg", 375));
    const b = await huellaVisual(await foto("webp", 200));
    expect(a).not.toBeNull();
    expect(distanciaVisual(a!, b!)).toBeLessThanOrEqual(MISMA_FOTO_MAX_BITS);
  });

  it("una foto distinta no se confunde", async () => {
    const a = await huellaVisual(await foto("jpeg", 375));
    const c = await huellaVisual(await foto("jpeg", 375, true));
    expect(distanciaVisual(a!, c!)).toBeGreaterThan(MISMA_FOTO_MAX_BITS);
  });
});

describe("rótulos internos del método", () => {
  it("quita 'El problema' y 'La solución' pero deja los títulos reales", () => {
    const html = `<section><p class="eyebrow" style="text-align:center">El problema</p><h2>Cargar todo por separado cansa</h2></section>` +
      `<section><p class="eyebrow">La solución</p><h2>Una sola mochila para todo</h2></section>` +
      `<section><span>ATENCIÓN:</span><p>¿Te suena familiar?</p><h2>Oferta</h2></section>`;
    const r = sinRotulosInternos(html);
    expect(r.html).not.toMatch(/El problema|La solución|ATENCIÓN/);
    expect(r.html).toContain("Cargar todo por separado cansa");
    expect(r.html).toContain("Una sola mochila para todo");
    expect(r.html).toContain("¿Te suena familiar?");
    expect(r.html).toContain("<h2>Oferta</h2>"); // un encabezado real sin clase de rótulo se respeta
  });

  it("el saneador general de landings también lo aplica", () => {
    const r = sanearHtmlDeLanding(`<!doctype html><html><body><p class="kicker">Interés</p><h2>Así se usa</h2></body></html>`);
    expect(r.html).not.toContain("Interés");
    expect(r.html).toContain("Así se usa");
  });
});

describe("landing de imágenes: cada foto una sola vez", () => {
  it("con más paneles que fotos no vuelve a empezar", async () => {
    const { renderizarLandingImagenes } = await import("../landing/renderer-imagenes");
    const paneles = ["portada", "solucion", "beneficios", "para-quien", "cierre"].map((clave) => ({ type: "panel", clave, titulo: clave, texto: "x" }));
    const html = renderizarLandingImagenes({
      nombre: "Mochila",
      producto: { name: "Mochila", price: 100000, imageUrl: "https://cdn.test/a.jpg", images: ["https://cdn.test/b.jpg"] } as any,
      secciones: paneles as any,
    } as any);
    const usos = (u: string) => html.split(u).length - 1;
    expect(usos("https://cdn.test/a.jpg")).toBeLessThanOrEqual(2); // hero + og:image como máximo
    expect(usos("https://cdn.test/b.jpg")).toBe(1);
  });
});
