import { describe, expect, it } from "vitest";
import { sanearHtmlDeLanding } from "../sanear-html";
import { htmlDesdeRespuesta, textoDeBitacora } from "../agente-landing";

/**
 * Landing 4 "Corrector de Postura", 19-09-2026: el admin pidió "regenerá
 * con formulario" y el modelo devolvió la portada dos veces, el formulario
 * dos veces (mismos campos, mismo total), el precio repetido y las fotos
 * duplicadas. Estas pruebas reproducen esa página en chico.
 */

const FORM = (n: number) => `<form method="POST" action="/api/landing-publica/x/pedido"><input name="nombre"><input name="telefono"><input name="documento"><input name="direccion"><input name="barrio"><select name="departamento"></select><select name="ciudad"></select><button>Hacer mi pedido ${n}</button></form>`;
const HERO = `<section class="hero"><h1>Corrector de Postura Espalda Unisex</h1><p>Mejora tu postura desde el primer día, cómodo y discreto bajo la ropa.</p><img src="https://cdn.test/corrector-1.jpg"><a href="#pedido">Hacer mi pedido</a></section>`;
const PRECIO = `<section class="precio"><h2>Solo $62.000 COP</h2><p>Pago contra entrega en todo el país, sin anticipos ni sorpresas.</p></section>`;

const duplicada = `<!doctype html><html><head><title>x</title></head><body>
<header><img src="https://cdn.test/logo.png"></header>
${HERO}
${HERO}
${PRECIO}
<section class="beneficios"><h2>Beneficios</h2><p>Alivia el dolor de espalda y hombros al corregir la posición durante el día.</p><img src="https://cdn.test/corrector-2.jpg"></section>
${PRECIO}
<section id="pedido"><h2>Completa tus datos y recibe el pedido en tu casa</h2>${FORM(1)}</section>
<section id="pedido2"><h2>Completa tus datos y recibe el pedido en tu casa</h2>${FORM(2)}</section>
<img src="https://cdn.test/corrector-1.jpg">
<footer><img src="https://cdn.test/logo.png"></footer>
</body></html>`;

describe("sanear el HTML que devuelve el modelo", () => {
  const r = sanearHtmlDeLanding(duplicada);

  it("deja UN formulario, UNA portada, UN precio", () => {
    expect((r.html.match(/<form/gi) || []).length).toBe(1);
    expect((r.html.match(/class="hero"/g) || []).length).toBe(1);
    expect((r.html.match(/class="precio"/g) || []).length).toBe(1);
  });

  it("cada foto del producto una vez; el logo puede ir en header y footer", () => {
    expect((r.html.match(/corrector-1\.jpg/g) || []).length).toBe(1);
    expect((r.html.match(/corrector-2\.jpg/g) || []).length).toBe(1);
    expect((r.html.match(/logo\.png/g) || []).length).toBe(2);
  });

  it("cuenta lo que quitó", () => {
    expect(r.quitado.join(" ")).toMatch(/formulario/);
    expect(r.quitado.join(" ")).toMatch(/secci/);
    expect(r.quitado.join(" ")).toMatch(/imagen/);
  });

  it("una página sana no se toca", () => {
    const sana = `<!doctype html><html><body>${HERO}${PRECIO}<section id="pedido"><h2>Pedido</h2>${FORM(1)}</section></body></html>`;
    const s = sanearHtmlDeLanding(sana);
    expect(s.html).toBe(sana);
    expect(s.quitado).toEqual([]);
  });

  it("si el modelo pegó la página vieja y la nueva, queda la última", () => {
    const dos = `<!doctype html><html><body><section class="vieja"><p>Esta es la versión anterior de la landing, con su texto largo de siempre.</p></section></body></html>\n<!doctype html><html><body>${HERO}</body></html>`;
    const s = sanearHtmlDeLanding(dos);
    expect(s.html).not.toContain("vieja");
    expect(s.html).toContain('class="hero"');
    expect(s.html.startsWith("<!doctype html>")).toBe(true);
  });
});

describe("salida del modelo → HTML", () => {
  it("quita el bloque de código y el texto previo, y sanea", () => {
    const r = htmlDesdeRespuesta("Claro, acá va:\n```html\n" + duplicada + "\n```\nListo.");
    expect(r.html.startsWith("<!doctype html>")).toBe(true);
    expect((r.html.match(/<form/gi) || []).length).toBe(1);
  });
});

describe("bitácora de la landing", () => {
  it("se le muestra al modelo lo que ya se pidió, numerado", () => {
    const t = textoDeBitacora([
      { fecha: "2026-09-19T07:50:00Z", instruccion: "agregar formulario de pedido", resultado: "aplicado" },
      { fecha: "2026-09-19T07:58:00Z", instruccion: "una sola foto por sección", resultado: "aplicado (se quitó: 2 imagen(es) repetida(s))" },
    ]);
    expect(t).toContain("BITÁCORA");
    expect(t).toContain("1. [2026-09-19] agregar formulario de pedido");
    expect(t).toContain("2. [2026-09-19] una sola foto por sección");
  });
  it("sin pedidos previos, no agrega nada", () => {
    expect(textoDeBitacora([])).toBe("");
  });
});

describe("video sin fuente", () => {
  it("se quita la sección del reproductor vacío (y con ella el póster repetido)", () => {
    const h = `<!doctype html><html><body>${HERO}<section class="video-section"><h2>Míralo en acción</h2><video controls poster="https://cdn.test/corrector-1.jpg"><source src="" type="video/mp4"></video></section>${PRECIO}</body></html>`;
    const r = sanearHtmlDeLanding(h);
    expect(r.html).not.toContain("<video");
    expect((r.html.match(/corrector-1\.jpg/g) || []).length).toBe(1);
    expect(r.quitado.join(" ")).toMatch(/video/);
  });
  it("un video con fuente real se conserva", () => {
    const h = `<!doctype html><html><body>${HERO}<section><video controls poster="https://cdn.test/p.jpg"><source src="https://cdn.test/demo.mp4" type="video/mp4"></video></section></body></html>`;
    expect(sanearHtmlDeLanding(h).html).toContain("demo.mp4");
  });
});
