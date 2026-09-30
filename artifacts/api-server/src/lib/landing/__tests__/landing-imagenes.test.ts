import { describe, it, expect } from "vitest";
import { sellosDelNegocio, sinPruebaSocialInventada, promptParaImagen, planDeRespaldo, type PanelImagen } from "../plan-imagenes";
import { renderizarLanding } from "../renderer-v3";
import { ofertasValidas } from "../crear-landing-imagenes";

/**
 * Landing de imágenes (29-09-2026), a partir del método de Joel Ortiz: 11
 * paneles verticales; cada uno con la imagen que sube el dueño o compuesto con
 * las fotos reales del producto. Sin prueba social inventada, sellos de las
 * condiciones reales, y el pedido cobra la oferta que definió el dueño.
 */
describe("plan de la landing de imágenes", () => {
  it("los sellos salen de las condiciones reales, no del modelo", () => {
    expect(sellosDelNegocio({ envio: { pago: "contraentrega", costo: "incluido", plazo: "3 a 5 días hábiles", cobertura: "todo el país" } }))
      .toEqual(["Paga al recibir", "Envío gratis", "Llega en 3 a 5 días hábiles", "Envíos a todo el país"]);
    // Con envío cobrado y pago anticipado no se promete ni "gratis" ni "al recibir".
    expect(sellosDelNegocio({ envio: { pago: "anticipado", costo: "$12.000", plazo: "" } })).toEqual([]);
    expect(sellosDelNegocio(null)).toEqual([]);
  });

  it("borra la prueba social inventada (la del video: ⭐ 4.7 | 843 clientes)", () => {
    for (const t of ["⭐ 4.7 | 843 clientes satisfechos", "+5.000 vendidos", "Miles de clientes felices", "El más vendido de Colombia", "4,8/5 estrellas"]) {
      expect(sinPruebaSocialInventada(t, null)).toBe("");
    }
    expect(sinPruebaSocialInventada("Limpia sin agua ni estrés", null)).toBe("Limpia sin agua ni estrés");
    // Si el dueño la cargó de verdad, se respeta.
    expect(sinPruebaSocialInventada("4,8 en 120 reseñas de MercadoLibre", "4,8 en 120 reseñas de MercadoLibre")).toBe("4,8 en 120 reseñas de MercadoLibre");
  });

  it("el prompt para Gemini lleva el texto exacto, 9:16 y prohíbe reseñas y rediseñar el producto", () => {
    const p: PanelImagen = { id: "portada", type: "panel", clave: "portada", titulo: "¿Tu gato odia el agua?", subtitulo: "Báñalo sin estrés", bullets: ["Sin agua"], conceptoVisual: "Una persona cepillando a su gato" };
    const t = promptParaImagen(p, { name: "Cepillo de vapor" }, { sellos: ["Paga al recibir"], paleta: ["verde suave"] });
    expect(t).toMatch(/9:16/);
    expect(t).toContain('"¿Tu gato odia el agua?"');
    expect(t).toMatch(/ATTACHED PRODUCT PHOTO/);
    expect(t).toMatch(/Do NOT add star ratings, reviews/);
    expect(t).toContain('"Paga al recibir"');
  });

  it("sin IA igual hay plan (respaldo con los datos del producto)", () => {
    const r = planDeRespaldo({ name: "Faja", description: "Faja ajustable", features: ["Cómoda", "Transpirable"] }, { ofertas: [], angulo: "", publico: "" });
    expect(r.paneles).toHaveLength(11);
    expect(r.paneles[0]).toMatchObject({ clave: "portada", titulo: "Faja" });
  });

  it("ofertas: solo las del dueño con precio; sin ofertas, 1 unidad al precio del producto", () => {
    expect(ofertasValidas([{ nombre: "2 unidades", cantidad: 2, precio: 49900 }, { nombre: "", precio: 1 }], 29900)).toEqual([{ nombre: "2 unidades", cantidad: 2, precio: 49900 }]);
    expect(ofertasValidas([], 29900)).toEqual([{ nombre: "1 unidad", cantidad: 1, precio: 29900 }]);
  });
});

describe("render de la landing de imágenes", () => {
  const base: any = {
    nombre: "Landing",
    modo: "imagenes",
    producto: { name: "Faja", price: 29900, imageUrl: "https://cdn.test/faja.jpg", images: ["https://cdn.test/faja2.jpg"] },
    negocio: { nombre: "Tienda", whatsapp: "573000000000" },
    cierre: { tipo: "contraentrega" as const, accion: "/api/landing-publica/x/pedido", pais: "CO" },
    ofertas: [{ nombre: "1 unidad", cantidad: 1, precio: 29900 }, { nombre: "2 unidades", cantidad: 2, precio: 49900 }],
    sellos: ["Paga al recibir"],
  };

  it("panel con imagen subida = la imagen; sin imagen = compuesto con la foto real", () => {
    const html = renderizarLanding({
      ...base,
      secciones: [
        { id: "portada", type: "panel", clave: "portada", titulo: "¿Te duele la espalda?", imagen: "/uploads/landings/1-portada.jpg" },
        { id: "beneficios", type: "panel", clave: "beneficios", titulo: "Beneficios", bullets: ["Alivia la espalda"] },
        { id: "dolor", type: "panel", clave: "dolor", titulo: "Oculto", oculto: true },
      ] as any,
    });
    expect(html).toContain('src="/uploads/landings/1-portada.jpg"');
    expect(html).toContain("Alivia la espalda");
    expect(html).toContain("https://cdn.test/faja.jpg");
    expect(html).not.toContain("Oculto");
  });

  it("las ofertas van en el formulario y reemplazan la cantidad libre", () => {
    const html = renderizarLanding({ ...base, secciones: [{ id: "ofertas", type: "panel", clave: "ofertas", titulo: "Elige" }] as any });
    expect(html).toContain('name="oferta"');
    expect(html).toContain("$49.900");
    expect(html).not.toContain('name="cantidad"');
  });

  it("nunca pone una URL peligrosa en la página pública", () => {
    const html = renderizarLanding({ ...base, secciones: [{ id: "portada", type: "panel", clave: "portada", titulo: "x", imagen: "javascript:alert(1)", foto: "data:image/png;base64,AAAA" }] as any });
    expect(html).not.toContain("javascript:alert");
    expect(html).not.toContain("data:image/png");
  });
});
