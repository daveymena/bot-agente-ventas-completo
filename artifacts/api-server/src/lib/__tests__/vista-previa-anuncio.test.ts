import { describe, it, expect } from "vitest";
import { construirVistaPreviaAnuncio, sanearHtmlVistaPrevia, urlSegura } from "../vista-previa-anuncio";

describe("sanearHtmlVistaPrevia", () => {
  it("quita scripts, iframes y objetos", () => {
    const s = sanearHtmlVistaPrevia(
      `<h1>Hola</h1><script>alert(1)</script><iframe src="https://evil"></iframe><embed src="x"><object data="y"></object>`,
    )!;
    expect(s).toContain("<h1>Hola</h1>");
    expect(s).not.toMatch(/script|iframe|embed|object/i);
  });

  it("quita manejadores on* y URLs javascript:", () => {
    const s = sanearHtmlVistaPrevia(`<a href="javascript:alert(1)" onclick="x()">ir</a><img src="a.jpg" onerror='y()'>`)!;
    expect(s).not.toMatch(/onclick|onerror|javascript:/i);
    expect(s).toContain('href="#"');
    expect(s).toContain('src="a.jpg"');
  });

  it("devuelve null para vacío o no textual", () => {
    expect(sanearHtmlVistaPrevia("   ")).toBeNull();
    expect(sanearHtmlVistaPrevia(42)).toBeNull();
  });
});

describe("urlSegura", () => {
  it("acepta http(s) y rutas relativas", () => {
    expect(urlSegura("https://ventasproia.com/a.jpg")).toBe("https://ventasproia.com/a.jpg");
    expect(urlSegura("/l/corrector")).toBe("/l/corrector");
  });
  it("rechaza esquemas peligrosos y rutas de protocolo relativo", () => {
    expect(urlSegura("javascript:alert(1)")).toBeNull();
    expect(urlSegura("data:text/html,hola")).toBeNull();
    expect(urlSegura("//evil.com/x")).toBeNull();
    expect(urlSegura(undefined)).toBeNull();
  });
});

describe("construirVistaPreviaAnuncio", () => {
  it("aplica límites de longitud y valores por defecto", () => {
    const v = construirVistaPreviaAnuncio({ titulo: "x".repeat(500), copy: "y".repeat(2000) });
    expect(v.titulo.length).toBe(120);
    expect(v.copy.length).toBe(600);
    expect(v.cta).toBe("Más información");
    expect(v.pagina).toBe("Tu negocio");
    expect(v.formato).toBe("feed");
  });

  it("no deja pasar una imagen peligrosa aunque venga del modelo", () => {
    const v = construirVistaPreviaAnuncio({ imagenUrl: "javascript:0", paginaUrl: "https://ventasproia.com/l/x" });
    expect(v.imagenUrl).toBeNull();
    expect(v.paginaUrl).toBe("https://ventasproia.com/l/x");
  });

  it("entrega el HTML ya saneado", () => {
    const v = construirVistaPreviaAnuncio({ html: `<p>ok</p><script>bad()</script>` });
    expect(v.html).toBe("<p>ok</p>");
  });
});
