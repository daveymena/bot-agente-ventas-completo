import { describe, expect, it } from "vitest";
import { operarBloque, operarCapa, resumenDeBloques, resumenDeCapas } from "../control";
import { MAQUETAS } from "../maquetas-creativo";
import { normalizarEscena } from "../escena";

const secciones = [
  { id: "hero", type: "hero", title: "Hola" },
  { id: "benefits-1", type: "benefits", title: "Por qué", body: "A\nB" },
  { id: "faq-1", type: "faq", title: "Dudas" },
];

describe("Atlas controla bloques de landing con exactitud", () => {
  it("mueve, oculta, duplica, quita y cambia texto/foto", () => {
    const m = operarBloque(secciones, { op: "mover", id: "faq-1", a: "arriba" });
    expect(m.ok && m.secciones.map((s) => s.id)).toEqual(["hero", "faq-1", "benefits-1"]);
    const o = operarBloque(secciones, { op: "ocultar", id: "benefits-1" });
    expect(o.ok && o.secciones[1]!.hidden).toBe(true);
    const d = operarBloque(secciones, { op: "duplicar", id: "faq-1" });
    expect(d.ok && d.secciones.map((s) => s.id)).toEqual(["hero", "benefits-1", "faq-1", "faq-1-2"]);
    const q = operarBloque(secciones, { op: "quitar", id: "faq-1" });
    expect(q.ok && q.secciones).toHaveLength(2);
    const t = operarBloque(secciones, { op: "texto", id: "hero", campo: "title", valor: "<b>Nuevo</b> título" });
    expect(t.ok && t.secciones[0]!.title).toBe("Nuevo título");
    const f = operarBloque(secciones, { op: "foto", id: "hero", url: "javascript:alert(1)" });
    expect(f.ok).toBe(false);
  });

  it("protege la portada y dice qué bloques hay si el id no existe", () => {
    expect(operarBloque(secciones, { op: "quitar", id: "hero" }).ok).toBe(false);
    expect(operarBloque(secciones, { op: "mover", id: "benefits-1", a: 0 }).ok).toBe(false);
    const r = operarBloque(secciones, { op: "ocultar", id: "nada" });
    expect(!r.ok && r.error).toContain("faq-1");
  });

  it("el resumen deja ver ids, tipos y textos", () => {
    expect(resumenDeBloques(secciones)).toContain("[benefits-1] benefits");
  });
});

describe("Atlas controla capas de creativo con exactitud", () => {
  const e = normalizarEscena(MAQUETAS[0]!.armar({ nombre: "X", gancho: "Gancho", cta: "Comprar", fotos: ["https://ej.com/a.jpg"], acento: "#123456", sobreAcento: "#ffffff" }, "4:5"));

  it("encuentra la capa por nombre y cambia solo lo pedido", () => {
    const r = operarCapa(e, { op: "cambiar", id: "Gancho", cambios: { texto: "Otro gancho", color: "#ff0000", y: 10 } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const g = r.escena.capas.find((c) => c.nombre === "Gancho") as any;
      expect(g.texto).toBe("Otro gancho");
      expect(g.color).toBe("#ff0000");
      expect(g.y).toBe(10);
    }
  });

  it("rechaza colores, fuentes y fotos inválidos sin romper la escena", () => {
    expect(operarCapa(e, { op: "cambiar", id: "Gancho", cambios: { color: "rojo" } }).ok).toBe(false);
    expect(operarCapa(e, { op: "cambiar", id: "Gancho", cambios: { fuente: "comic-sans" } }).ok).toBe(false);
    expect(operarCapa(e, { op: "cambiar", id: "Foto de fondo", cambios: { src: "javascript:x" } }).ok).toBe(false);
  });

  it("oculta, borra y reordena", () => {
    const o = operarCapa(e, { op: "ocultar", id: "Gancho" });
    expect(o.ok && o.escena.capas.find((c) => c.nombre === "Gancho")!.oculta).toBe(true);
    const b = operarCapa(e, { op: "borrar", id: "Gancho" });
    expect(b.ok && b.escena.capas.some((c) => c.nombre === "Gancho")).toBe(false);
    expect(resumenDeCapas(e)).toContain("Gancho");
  });
});
