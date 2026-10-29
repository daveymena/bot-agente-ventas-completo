import { describe, expect, it } from "vitest";
import { aplicarKit, contraste, normalizarKit, paletasDesde, kitComoRetoque } from "../kit";
import { MAQUETAS, armarCreativo, type DatosCreativo } from "../maquetas-creativo";
import { capasAHtml, normalizarEscena, revisarEscena } from "../escena";
import { mascaraDeFondoLiso } from "../../creativos/recorte";

const datos: DatosCreativo = {
  nombre: "Corrector", gancho: "Adiós al dolor de espalda", apoyo: "Se ajusta en segundos", cta: "Pídelo hoy", precio: "$89.900",
  sellos: ["Paga al recibir"], beneficios: ["Ajustable", "Discreto", "Fresco"], fotos: ["https://ej.com/a.jpg"], acento: "#4f46e5", sobreAcento: "#ffffff",
};

describe("kit de marca", () => {
  it("descarta lo inválido", () => {
    expect(normalizarKit({ acento: "verde", titulos: "comic", logo: "javascript:x" })).toEqual({});
    expect(normalizarKit({ acento: "0a0", titulos: "playfair" })).toEqual({ acento: "#00aa00", titulos: "playfair" });
  });

  it("todas las maquetas salen con el acento, los fondos y las letras de la marca", () => {
    const kit = { acento: "#c2410c", oscuro: "#1c1917", claro: "#fff7ed", titulos: "playfair", texto: "dm-sans" };
    for (const m of MAQUETAS) {
      const html = capasAHtml(armarCreativo(m, datos, "4:5", kit));
      expect(html, m.id).not.toContain("#4f46e5"); // el índigo genérico desaparece
      expect(html, m.id).not.toContain("#111827");
      expect(html, m.id).toMatch(/Playfair|DM Sans/);
    }
  });

  it("nunca deja texto ilegible sobre un fondo del kit", () => {
    const kit = { acento: "#fde047", oscuro: "#fef9c3", claro: "#fefce8" }; // todo clarito, a propósito
    for (const m of MAQUETAS) {
      const e = normalizarEscena(armarCreativo(m, datos, "1:1", kit));
      const ilegibles = revisarEscena(e).filter((a) => /poco contraste/.test(a.texto));
      expect(ilegibles, m.id).toEqual([]);
    }
  });

  it("el logo va donde no pisa texto, o no va", () => {
    const e = aplicarKit(MAQUETAS[0]!.armar(datos, "4:5"), { logo: "https://ej.com/logo.png" }, datos.acento);
    const logo = e.capas.find((c) => c.nombre === "Logo");
    if (logo) for (const t of e.capas.filter((c) => c.tipo === "texto")) {
      const solapa = logo.x < t.x + t.w && t.x < logo.x + logo.w && logo.y < t.y + t.h && t.y < logo.y + logo.h;
      expect(solapa).toBe(false);
    }
  });

  it("las paletas sugeridas traen oscuro y claro que contrastan con el acento", () => {
    for (const p of paletasDesde("#16a34a")) {
      expect(contraste(p.oscuro, p.claro)).toBeGreaterThan(7);
    }
    expect(kitComoRetoque({ acento: "#123456", titulos: "anton" })).toEqual({ acento: "#123456", titulos: "anton" });
  });
});

describe("recorte de fondo liso", () => {
  const imagen = (ancho: number, alto: number, pintar: (x: number, y: number) => [number, number, number]) => {
    const d = new Uint8Array(ancho * alto * 4);
    for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) { const [r, g, b] = pintar(x, y); const i = (y * ancho + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
    return d;
  };

  it("quita el fondo blanco y deja el producto", () => {
    const d = imagen(100, 100, (x, y) => (x > 30 && x < 70 && y > 25 && y < 80 ? [20, 90, 200] : [250, 250, 250]));
    const r = mascaraDeFondoLiso(d, 100, 100);
    expect("mascara" in r).toBe(true);
    if ("mascara" in r) {
      expect(r.mascara[50 * 100 + 50]).toBe(1);
      expect(r.mascara[5 * 100 + 5]).toBe(0);
    }
  });

  it("no intenta recortar una foto de ambiente (fondo no liso)", () => {
    const d = imagen(100, 100, (x, y) => [(x * 37) % 255, (y * 53) % 255, ((x + y) * 29) % 255]);
    const r = mascaraDeFondoLiso(d, 100, 100);
    expect("motivo" in r && /no es liso/.test(r.motivo)).toBe(true);
  });

  it("producto claro con huecos de fondo encerrados: no recorta (quedaría sucio)", () => {
    // Un aro blanco-grisáceo con mucho fondo encerrado adentro.
    const d = imagen(100, 100, (x, y) => {
      const r = Math.hypot(x - 50, y - 50);
      return r > 30 && r < 34 ? [120, 120, 120] : [250, 250, 250];
    });
    const r = mascaraDeFondoLiso(d, 100, 100);
    expect("motivo" in r && /manchas/.test(r.motivo)).toBe(true);
  });

  it("no se come un producto blanco por dentro si está cerrado por su borde", () => {
    const d = imagen(100, 100, (x, y) => {
      const borde = (x === 30 || x === 70 || y === 25 || y === 80) && x >= 30 && x <= 70 && y >= 25 && y <= 80;
      return borde ? [30, 30, 30] : [252, 252, 252];
    });
    const r = mascaraDeFondoLiso(d, 100, 100);
    if ("mascara" in r) expect(r.mascara[50 * 100 + 50]).toBe(1);
  });
});
