/**
 * El renderer, probado contra lo que el dueño vio y rechazó.
 *
 * Su frase, mirando el resultado del exportador viejo: *"esas landings son
 * solo HTML, no tienen diseño, no adjunta la imagen ni nada"*. Tenía razón, y
 * el código lo confirmaba: la MISMA caja para las once secciones y `imageUrl`
 * usado cero veces -- aparecía una sola vez en el archivo, en la declaración
 * del tipo.
 *
 * Así que lo primero que se prueba acá es justo eso: que la foto llegue, y que
 * dos familias no produzcan la misma página.
 */
import { describe, it, expect } from "vitest";
import { renderizarLanding, esc, urlSegura, LAYOUTS_DISPONIBLES } from "../renderer";
import { FAMILIAS, TOKENS } from "../design-system";

const PRODUCTO = {
  name: "Curso de piano desde cero",
  description: "Aprendé a tu ritmo con clases en video.",
  imageUrl: "https://cdn.ejemplo.com/piano.jpg",
  price: 60000,
  currency: "COP",
  paymentLink: "https://pago.ejemplo.com/piano",
};

const SECCIONES = [
  { id: "hero", type: "hero", title: "Aprendé piano desde cero", subtitle: "Sin experiencia previa.", cta: "Empezá hoy" },
  { id: "benefits", type: "benefits", title: "Lo que incluye", body: "🎹 Clásico y jazz\n19 horas en HD\n157 recursos" },
  { id: "offer", type: "offer", title: "La oferta", cta: "Comprar ahora" },
  { id: "faq", type: "faq", title: "Preguntas", body: "¿Cómo lo recibo?\n¿Sirve para adultos?" },
  { id: "cta", type: "cta", title: "Dale el primer paso", cta: "Empezar" },
];

const render = (familia: string) => renderizarLanding({ nombre: "Landing piano", secciones: SECCIONES, familia, producto: PRODUCTO });

describe("LA FOTO DEL PRODUCTO LLEGA A LA PÁGINA", () => {
  it("aparece en el HTML, que es lo que no pasaba antes", () => {
    for (const f of FAMILIAS) {
      expect(render(f), `en ${f} no se ve la foto`).toContain("https://cdn.ejemplo.com/piano.jpg");
    }
  });

  it("con alt, para que sea accesible y no la penalice Meta", () => {
    expect(render("ecommerce")).toMatch(/alt="Curso de piano desde cero"/);
  });

  it("y sin foto, la página no se rompe ni deja un hueco", () => {
    const html = renderizarLanding({ nombre: "x", secciones: SECCIONES, familia: "premium", producto: { name: "Sin foto" } });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("undefined");
    expect(html).toContain("Aprendé piano desde cero");
  });
});

describe("dos familias no producen la misma página", () => {
  it("el HTML de cada familia es distinto del de las otras", () => {
    const vistas = new Map<string, string>();
    for (const f of FAMILIAS) {
      const html = render(f);
      const gemela = vistas.get(html);
      expect(gemela, `${f} y ${gemela} renderizan EXACTAMENTE lo mismo`).toBeUndefined();
      vistas.set(html, f);
    }
  });

  /** Lo que importa no es que cambie el color: que cambie la ESTRUCTURA. */
  it("y no solo por el color: cambia el marcado", () => {
    const sinColores = (f: string) => render(f).replace(/#[0-9a-fA-F]{3,8}/g, "").replace(/<style>[\s\S]*?<\/style>/, "");
    expect(sinColores("minimal")).not.toBe(sinColores("ecommerce"));
    expect(sinColores("oscura")).not.toBe(sinColores("premium"));
  });

  it("cada familia emite SUS tokens como variables CSS", () => {
    for (const f of FAMILIAS) {
      const html = render(f);
      expect(html).toContain(`--acento:${TOKENS[f].color.acento}`);
      expect(html).toContain(`--ancho:${TOKENS[f].ritmo.anchoContenido}`);
    }
  });
});

describe("es una página de verdad, no un documento", () => {
  const html = render("ecommerce");

  it("trae doctype, viewport y descripción", () => {
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('name="viewport"');
    expect(html).toContain('name="description"');
    expect(html).toContain("og:image");
  });

  it("es responsive: colapsa la grilla y usa escala fluida", () => {
    expect(html).toContain("@media (max-width:860px)");
    expect(html).toContain("grid-template-columns:1fr");
    expect(html).toMatch(/clamp\(/);
  });

  it("respeta a quien pidió menos movimiento", () => {
    expect(html).toContain("prefers-reduced-motion");
  });

  it("no depende de ninguna red ajena para verse bien", () => {
    // Script INLINE sí (el revelado al hacer scroll y el formulario de
    // pedido); lo que no puede haber es nada que se cargue de otro dominio.
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=["']https?:/i);
  });

  /** El botón tiene que llevar a algún lado: antes iba a "#comprar" siempre. */
  it("los CTA apuntan al enlace de pago real", () => {
    expect(html).toContain('href="https://pago.ejemplo.com/piano"');
  });

  it("y si no hay enlace de pago, cae a WhatsApp", () => {
    const h = renderizarLanding({ nombre: "x", secciones: SECCIONES, familia: "ecommerce", producto: { name: "P", whatsapp: "+57 300 123 4567" } });
    expect(h).toContain("https://wa.me/573001234567");
  });
});

describe("el contenido es de un modelo y lo lee un cliente: no puede inyectar", () => {
  it("escapa el HTML que venga en el texto", () => {
    const h = renderizarLanding({
      nombre: '<script>alert(1)</script>',
      secciones: [{ id: "a", type: "hero", title: '<img src=x onerror=alert(1)>', subtitle: "ok\" onmouseover=\"alert(1)" }],
      familia: "minimal",
      producto: { name: "P" },
    });
    // Lo que importa NO es que la cadena "onerror=" desaparezca: puede quedar
    // como TEXTO escapado y ahi es inofensiva. Lo que no puede pasar es que
    // llegue a ser una etiqueta o un atributo de verdad, o sea que el "<" y la
    // comilla sobrevivan sin escapar.
    expect(h).not.toContain("<script>alert");
    expect(h).not.toContain("<img src=x");
    expect(h).not.toContain('" onmouseover="');
    // Y se comprueba que si esta, esta neutralizado.
    expect(h).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("rechaza una URL que no sea http(s)", () => {
    expect(urlSegura("javascript:alert(1)")).toBe("");
    expect(urlSegura("data:text/html,<script>")).toBe("");
    expect(urlSegura("https://ok.com/a.jpg")).toBe("https://ok.com/a.jpg");
    expect(urlSegura("/local.jpg")).toBe("/local.jpg");
  });

  it("un paymentLink con javascript: no llega al href", () => {
    const h = renderizarLanding({
      nombre: "x", secciones: [{ id: "c", type: "cta", title: "T", cta: "Comprar" }],
      familia: "minimal", producto: { name: "P", paymentLink: "javascript:alert(1)" },
    });
    expect(h).not.toContain("javascript:");
    expect(h).toContain('href="#comprar"');
  });

  it("esc cubre comillas simples, que también rompen atributos", () => {
    expect(esc(`a'b"c<d>e&f`)).toBe("a&#39;b&quot;c&lt;d&gt;e&amp;f");
  });
});

describe("aguanta lo que le llegue", () => {
  it.each([
    [[], "sin secciones"],
    [[{ id: "x", type: "loquesea", title: "T" }], "un tipo desconocido"],
    [[{ id: "y", type: "hero", layout: "no_existe", title: "T" }], "un layout inventado"],
    [[{ id: "z", type: "benefits" }], "una sección sin nada"],
  ])("%#: %s", (secciones: any, _descripcion: string) => {
    const h = renderizarLanding({ nombre: "x", secciones, familia: "premium", producto: PRODUCTO });
    expect(h).toMatch(/^<!doctype html>/i);
    expect(h).not.toContain("undefined");
    expect(h).not.toContain("[object Object]");
  });

  it("una familia inventada no deja sin landing al admin", () => {
    expect(renderizarLanding({ nombre: "x", secciones: SECCIONES, familia: "hiperespacial", producto: PRODUCTO })).toContain("Aprendé piano");
  });

  /** Todo layout que una familia prefiera tiene que existir de verdad acá. */
  it("no hay familias apuntando a layouts que nadie dibuja", () => {
    for (const f of FAMILIAS) {
      for (const [seccion, lista] of Object.entries(TOKENS[f].layoutsPreferidos)) {
        for (const layout of lista) {
          expect(LAYOUTS_DISPONIBLES, `${f}.${seccion} prefiere "${layout}", que el renderer no sabe dibujar`).toContain(layout);
        }
      }
    }
  });
});

/**
 * La queja original del dueño, convertida en garantía permanente.
 *
 * No alcanza con que el renderer SEPA poner imágenes: hay que asegurar que
 * cada familia efectivamente muestre alguna. Se descubrió generando la página
 * de muestra: `respuesta-directa` renderizaba CERO --sus tres layouts
 * favoritos (hero_offer, benefits_numbered, offer_urgency) no ponían ninguna--
 * o sea la peor version del problema, en la familia que mas necesita que se
 * vea el producto.
 */
describe("ninguna familia deja la landing sin una sola foto", () => {
  it.each(FAMILIAS)("%s muestra el producto", (familia) => {
    const html = render(familia);
    const fotos = (html.match(/<img|background-image:linear-gradient/g) || []).length;
    expect(fotos, `${familia} no muestra el producto en ninguna sección`).toBeGreaterThan(0);
  });
});
