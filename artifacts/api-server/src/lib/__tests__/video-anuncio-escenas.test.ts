import { describe, it, expect } from "vitest";
import { rolDeEscena, fotoEsDeTextoSegunVision, htmlDeEscena, type EscenaDeVideo } from "../video-anuncio";

const e = (texto: string): EscenaDeVideo => ({ texto, locucion: "", visual: "producto", duracion: 3 });
const ctx = { foto: "data:image/jpeg;base64,AAAA", color: "#4F46E5", marca: "Marca", precio: "$55.000", cta: "Pídelo en el enlace", modelo: "fisico" };

// 08-10-2026: el video del corrector era la misma diapositiva seis veces.
describe("escenas del video de anuncio", () => {
  it("cada escena tiene su papel: abre, muestra, cobra, cierra", () => {
    const total = 6;
    expect(rolDeEscena(e("¿Tensión en el cuello?"), 0, total)).toBe("gancho");
    expect(rolDeEscena(e("Alinea hombros"), 1, total)).toBe("producto");
    expect(rolDeEscena(e("Solo $55.000"), 2, total)).toBe("precio");
    expect(rolDeEscena(e("Llévalo hoy"), 4, total)).toBe("precio");
    expect(rolDeEscena(e("Pide el tuyo"), 5, total)).toBe("cierre");
  });

  it("el cierre dice lo que hace el anuncio: landing o WhatsApp", () => {
    const web = htmlDeEscena(e("Pide el tuyo"), 5, 6, { ...ctx, destino: "web" });
    const wa = htmlDeEscena(e("Pide el tuyo"), 5, 6, { ...ctx, cta: "Escríbenos por WhatsApp", destino: "whatsapp" });
    expect(web).toContain('class="boton web"');
    expect(web).not.toContain("WhatsApp");
    expect(wa).toContain('class="boton wa"');
  });

  it("ya no lleva el contador '1 / 6' de diapositiva", () => {
    expect(htmlDeEscena(e("Alinea hombros"), 1, 6, { ...ctx, destino: "web" })).not.toMatch(/\d+ \/ 6/);
  });

  it("la visión que dice SI (tabla/afiche) saca la foto; NO la deja", () => {
    expect(fotoEsDeTextoSegunVision("SI, es una tabla de tallas con medidas en inglés")).toBe(true);
    expect(fotoEsDeTextoSegunVision("Sí. Afiche publicitario con mucho texto")).toBe(true);
    expect(fotoEsDeTextoSegunVision("NO, es la foto de una mujer usando un corrector")).toBe(false);
    expect(fotoEsDeTextoSegunVision("Es una guía de tallas del producto")).toBe(true);
    expect(fotoEsDeTextoSegunVision("Foto de producto; no está claro si tiene texto")).toBe(false);
    expect(fotoEsDeTextoSegunVision(null)).toBe(false);
  });
});
