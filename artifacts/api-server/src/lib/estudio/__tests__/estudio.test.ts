import { describe, expect, it } from "vitest";
import { aplicarRetoque, cssDeRetoque, normalizarRetoque, admiteRetoque, tintaSobre } from "../retoque";
import { capasAHtml, escenaADocumento, normalizarEscena, revisarEscena, FORMATOS, type Formato } from "../escena";
import { MAQUETAS, type DatosCreativo } from "../maquetas-creativo";
import { enlaceDeFuentes, pilaDe } from "../fuentes";
import { aplicarOperaciones } from "../../landing/editar";

describe("tema de la landing (retoque)", () => {
  it("descarta lo que no se puede aplicar en vez de ensuciar el CSS", () => {
    expect(normalizarRetoque({ acento: "rojito", titulos: "comic-sans", radio: "x" })).toBeNull();
    expect(normalizarRetoque({ acento: "0a0", radio: 99 })).toEqual({ acento: "#00aa00", radio: 40 });
  });

  it("redefine las variables de LOS DOS renderers (v3 y estilo)", () => {
    const css = cssDeRetoque({ acento: "#16a34a" });
    expect(css).toContain("--accent:#16a34a"); // renderer-v3
    expect(css).toContain("--a:#16a34a"); // renderer-estilo
    expect(css).toContain("--on-accent:");
  });

  it("se inserta al final del <head> y re-aplicar no duplica", () => {
    const html = "<html><head><style>body{}</style></head><body></body></html>";
    const una = aplicarRetoque(html, { acento: "#111111", titulos: "playfair" });
    const dos = aplicarRetoque(una, { acento: "#222222", titulos: "playfair" });
    expect(una.indexOf("vp-retoque")).toBeGreaterThan(una.indexOf("body{}"));
    expect(dos.match(/vp-retoque/g)).toHaveLength(1);
    expect(dos.match(/fonts\.googleapis/g)).toHaveLength(1);
    expect(dos).toContain("#222222");
  });

  it("sin retoque devuelve el HTML intacto", () => {
    expect(aplicarRetoque("<html><head></head></html>", null)).toBe("<html><head></head></html>");
  });

  it("quitar el tema quita el bloque que ya estaba horneado", () => {
    const con = aplicarRetoque("<html><head></head><body></body></html>", { acento: "#123456", texto: "poppins" });
    const sin = aplicarRetoque(con, {});
    expect(sin).not.toContain("vp-retoque");
    expect(sin).not.toContain("fonts.googleapis");
  });

  it("no toca las copias HTML de otros sitios", () => {
    expect(admiteRetoque({ source: { tipo: "html" } })).toBe(false);
    expect(admiteRetoque({ design: { renderer: "estilo" } })).toBe(true);
    expect(admiteRetoque({ design: { familia: "premium" } })).toBe(true);
  });

  it("la tinta sobre el acento se lee", () => {
    expect(tintaSobre("#ffff00")).toBe("#111827");
    expect(tintaSobre("#1d4ed8")).toBe("#ffffff");
  });
});

describe("editar: el tema se cambia con una operación que se puede probar", () => {
  const base = { name: "L", sections: [{ id: "hero", type: "hero", title: "Hola" }], design: { renderer: "estilo", style: "cleanhome" } };

  it("update_theme guarda un retoque válido", () => {
    const r = aplicarOperaciones(base, [{ op: "update_theme", patch: { acento: "#ff0000", titulos: "anton" } }]);
    expect(r.design.retoque).toEqual({ acento: "#ff0000", titulos: "anton" });
    expect(r.design.renderer).toBe("estilo");
  });

  it("update_design ya no deja escribir cualquier clave de design", () => {
    const r = aplicarOperaciones(base, [{ op: "update_design", patch: { familia: "premium", html: "<script>", renderer: "x" } as any }]);
    expect(r.design.familia).toBe("premium");
    expect(r.design.html).toBeUndefined();
    expect(r.design.renderer).toBeNull();
  });
});

describe("escena de creativo", () => {
  it("descarta capas peligrosas o rotas sin tirar la escena", () => {
    const e = normalizarEscena({
      formato: "9:16",
      capas: [
        { tipo: "imagen", src: "javascript:alert(1)" },
        { tipo: "texto", texto: "<b>hola</b>", color: "red;background:url(x)" },
        { tipo: "otra" },
        null,
      ],
    });
    expect(e.formato).toBe("9:16");
    expect(e.capas).toHaveLength(1);
    const html = capasAHtml(e);
    expect(html).toContain("&lt;b&gt;hola&lt;/b&gt;");
    expect(html).not.toContain("url(x)");
  });

  it("el lienzo mide lo que pide Meta para cada formato", () => {
    for (const f of Object.keys(FORMATOS) as Formato[]) {
      const html = capasAHtml({ formato: f, capas: [] });
      expect(html).toContain(`width:${FORMATOS[f].ancho}px;height:${FORMATOS[f].alto}px`);
    }
  });

  it("el documento para Chromium carga solo las fuentes que se usan", () => {
    const doc = escenaADocumento({ formato: "1:1", capas: [{ tipo: "texto", texto: "x", fuente: "anton", x: 0, y: 0, w: 10, h: 10, tam: 5 }] });
    expect(doc).toContain("family=Anton");
    expect(doc).not.toContain("Playfair");
  });

  it("avisa cuando el texto cae donde Meta pone su interfaz en 9:16", () => {
    const avisos = revisarEscena({ formato: "9:16", capas: [{ tipo: "texto", texto: "Compra ya", x: 10, y: 85, w: 80, h: 8, tam: 6 }] });
    expect(avisos.some((a) => /zona segura/.test(a.texto))).toBe(true);
  });
});

describe("maquetas de creativo", () => {
  const datos: DatosCreativo = {
    nombre: "Corrector de postura", gancho: "Adiós al dolor de espalda", apoyo: "Se ajusta en segundos", cta: "Pídelo hoy",
    precio: "$89.900", sellos: ["Paga al recibir", "Envío gratis"], beneficios: ["Ajustable", "Discreto bajo la ropa", "Transpirable"],
    fotos: ["https://ejemplo.com/a.jpg", "https://ejemplo.com/b.jpg"], acento: "#0e9f8a", sobreAcento: "#ffffff",
  };

  it("todas arman una escena válida en los 4 formatos, con la foto y el gancho reales", () => {
    for (const m of MAQUETAS) {
      for (const f of Object.keys(FORMATOS) as Formato[]) {
        const e = normalizarEscena(m.armar(datos, f));
        expect(e.formato, `${m.id} ${f}`).toBe(f);
        const html = capasAHtml(e);
        expect(html, `${m.id} ${f}`).toContain("ejemplo.com/a.jpg");
        expect(html, `${m.id} ${f}`).toContain("Adiós al dolor de espalda");
      }
    }
  });

  it("sin precio no se inventa un cartel de precio", () => {
    for (const m of MAQUETAS) {
      const html = capasAHtml(m.armar({ ...datos, precio: null }, "4:5"));
      expect(html, m.id).not.toContain("$89.900");
    }
  });

  it("sin sellos del negocio no aparece 'Paga al recibir'", () => {
    for (const m of MAQUETAS) {
      const html = capasAHtml(m.armar({ ...datos, sellos: [], cta: "Comprar" }, "1:1"));
      expect(html, m.id).not.toContain("Paga al recibir");
    }
  });
});

describe("fuentes", () => {
  it("un solo enlace para varias familias y respaldo si el id no existe", () => {
    expect(enlaceDeFuentes(["inter", "inter", "playfair"]).match(/family=/g)).toHaveLength(2);
    expect(pilaDe("no-existe")).toContain("Inter");
  });
});
