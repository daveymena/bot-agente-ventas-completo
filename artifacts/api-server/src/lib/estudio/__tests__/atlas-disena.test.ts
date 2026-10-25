import { describe, expect, it } from "vitest";
import { aplicarOperaciones, describirEscena } from "../operaciones-escena";
import { normalizarEscena } from "../escena";
import { aplicarOperacionesLanding, describirLanding, disenoDesdeNombre } from "../../landing/operaciones-landing";
import { instruccionDeCritica } from "../ojo-de-disenador";

/**
 * Atlas diseña (23-10-2026): el dueño pidió que Atlas no elija una plantilla
 * sino que cree, edite y manipule. Estas pruebas cuidan las manos (que cada
 * operación haga lo que dice) y los límites (fotos del producto y ninguna
 * cifra inventada), y que lo rechazado vuelva con motivo para corregirlo.
 */

const FOTO = "https://cdn.x.com/mochila.jpg";
const reglas = { fotosPermitidas: [FOTO], inventaCifras: (t: string) => /\d/.test(t) && !t.includes("89.900") };
const vacia = () => normalizarEscena({ formato: "4:5", fondo: "#ffffff", capas: [] });

describe("creativos: las manos", () => {
  it("compone desde cero: foto, degradado, gancho con cartel y botón", () => {
    const r = aplicarOperaciones(vacia(), [
      { op: "agregar", capa: { tipo: "imagen", nombre: "Foto", src: FOTO, x: 0, y: 0, w: 100, h: 70 } },
      { op: "agregar", capa: { tipo: "degradado", x: 0, y: 40, w: 100, h: 60, desde: "rgba(0,0,0,0)", hasta: "#000000" } },
      { op: "agregar", capa: { tipo: "texto", nombre: "Gancho", texto: "Nadie abre tu mochila", x: 6, y: 72, w: 88, h: 14, tam: 8, peso: 900, color: "#ffffff" } },
      { op: "agregar", capa: { tipo: "forma", nombre: "Botón", forma: "pastilla", relleno: "#FFC928", x: 6, y: 88, w: 50, h: 7 } },
      { op: "fondo", color: "#18222B" },
    ], reglas);
    expect(r.rechazadas).toEqual([]);
    expect(r.escena.capas.map((c) => c.tipo)).toEqual(["imagen", "degradado", "texto", "forma"]);
    expect(r.escena.fondo).toBe("#18222B");
  });

  it("cambia por id o por nombre, sin tocar id ni tipo", () => {
    const base = aplicarOperaciones(vacia(), [{ op: "agregar", capa: { tipo: "texto", nombre: "Gancho", texto: "Hola", x: 6, y: 6, w: 80, h: 10, tam: 6 } }], reglas).escena;
    const id = base.capas[0]!.id;
    const r = aplicarOperaciones(base, [{ op: "cambiar", capa: "gancho", props: { tam: 9, color: "#FFC928", tipo: "imagen", id: "otro" } }], reglas);
    expect(r.escena.capas[0]).toMatchObject({ id, tipo: "texto", tam: 9, color: "#FFC928" });
  });

  it("alinear al centro, ordenar, duplicar y borrar", () => {
    let e = aplicarOperaciones(vacia(), [
      { op: "agregar", capa: { tipo: "forma", nombre: "A", forma: "rect", relleno: "#000000", x: 0, y: 0, w: 40, h: 10 } },
      { op: "agregar", capa: { tipo: "forma", nombre: "B", forma: "rect", relleno: "#ff0000", x: 0, y: 20, w: 20, h: 10 } },
    ], reglas).escena;
    e = aplicarOperaciones(e, [{ op: "alinear", capas: ["B"], eje: "centro" }, { op: "orden", capa: "B", a: "fondo" }, { op: "duplicar", capa: "A" }], reglas).escena;
    expect(e.capas[0]).toMatchObject({ nombre: "B", x: 40 });
    expect(e.capas).toHaveLength(3);
    e = aplicarOperaciones(e, [{ op: "borrar", capa: "B" }], reglas).escena;
    expect(e.capas.map((c) => c.nombre)).toEqual(["A", "A"]);
  });

  it("lo que no se puede vuelve RECHAZADO con su motivo, y lo demás se aplica", () => {
    const r = aplicarOperaciones(vacia(), [
      { op: "agregar", capa: { tipo: "imagen", src: "https://otra-tienda.com/foto.jpg", x: 0, y: 0, w: 50, h: 50 } },
      { op: "agregar", capa: { tipo: "texto", texto: "50% OFF solo hoy", x: 0, y: 0, w: 50, h: 10 } },
      { op: "agregar", capa: { tipo: "texto", texto: "Solo $89.900", x: 0, y: 0, w: 50, h: 10 } },
      { op: "cambiar", capa: "no-existe", props: { tam: 9 } },
      { op: "volar" },
    ], reglas);
    expect(r.aplicadas).toHaveLength(1);
    expect(r.rechazadas.join(" ")).toMatch(/fotos del producto/);
    expect(r.rechazadas.join(" ")).toMatch(/cifra/);
    expect(r.rechazadas.join(" ")).toMatch(/no existe la capa/);
    expect(r.rechazadas.join(" ")).toMatch(/no existe \(agregar/);
  });

  it("valores fuera de rango se recortan; el color inválido se rechaza", () => {
    const r = aplicarOperaciones(vacia(), [
      { op: "agregar", capa: { tipo: "texto", texto: "Hola", x: 0, y: 0, w: 50, h: 10, tam: 500, opacidad: 9 } },
      { op: "fondo", color: "url(javascript:alert(1))" },
    ], reglas);
    const t = r.escena.capas[0] as any;
    expect(t.tam).toBe(40);
    expect(t.opacidad).toBe(1);
    expect(r.rechazadas.join(" ")).toMatch(/fondo/);
  });

  it("la descripción nombra cada capa con su id y medidas, para que el modelo la opere", () => {
    const e = aplicarOperaciones(vacia(), [{ op: "agregar", capa: { tipo: "texto", nombre: "Gancho", texto: "Hola", x: 6, y: 8, w: 80, h: 10, tam: 8 } }], reglas).escena;
    const d = describirEscena(e);
    expect(d).toContain(`[${e.capas[0]!.id}]`);
    expect(d).toMatch(/x6 y8 w80 h10/);
    expect(d).toContain("1080×1350");
  });
});

describe("landings: las manos", () => {
  const landing = () => ({
    sections: [
      { id: "hero", type: "hero", title: "Mochila antirrobo", subtitle: "Cierre oculto" },
      { id: "ben", type: "benefits", title: "Por qué", body: "Cierre oculto\nUSB" },
    ],
    design: { renderer: "premium" },
  });

  it("cambia, agrega, mueve, oculta y borra secciones", () => {
    const r = aplicarOperacionesLanding(landing(), [
      { op: "seccion_cambiar", seccion: "hero", props: { title: "Viaja tranquilo", cta: "La quiero" } },
      { op: "seccion_agregar", tipo: "faq", title: "Antes de pedir", body: "¿Trae batería? | No, trae el cable" },
      { op: "seccion_mover", seccion: "faq", a: "inicio" },
      { op: "seccion_cambiar", seccion: "ben", props: { hidden: true } },
    ], reglas);
    expect(r.rechazadas).toEqual([]);
    expect(r.landing.sections.map((s) => s.type)).toEqual(["faq", "hero", "benefits"]);
    expect(r.landing.sections[1]).toMatchObject({ title: "Viaja tranquilo", cta: "La quiero" });
    expect(r.landing.sections[2]!.hidden).toBe(true);
  });

  it("tema y diseño exactos; 'premium' a secas sigue siendo la familia v3", () => {
    const r = aplicarOperacionesLanding(landing(), [{ op: "tema", acento: "#2F6690", titulos: "playfair" }, { op: "diseno", diseno: "estilo:urgencia" }], reglas);
    expect(r.landing.design).toMatchObject({ renderer: "estilo", style: "urgencia", retoque: { acento: "#2f6690", titulos: "playfair" } });
    expect(disenoDesdeNombre("premium", {})).toMatchObject({ familia: "premium", renderer: null });
    expect(disenoDesdeNombre("premium-ventaspro", {})).toMatchObject({ renderer: "premium" });
  });

  it("no escribe testimonios ni garantías, ni fotos ajenas, ni cifras inventadas", () => {
    const r = aplicarOperacionesLanding(landing(), [
      { op: "seccion_agregar", tipo: "testimonials", body: "Excelente | Ana" },
      { op: "seccion_cambiar", seccion: "hero", props: { image: "https://otra.com/x.jpg" } },
      { op: "seccion_cambiar", seccion: "hero", props: { title: "Ahorra 40% hoy" } },
      { op: "diseno", diseno: "no-existe" },
    ], reglas);
    expect(r.aplicadas).toEqual([]);
    expect(r.rechazadas).toHaveLength(4);
  });

  it("la descripción lista las secciones con id para operarlas", () => {
    expect(describirLanding(landing())).toMatch(/1\. \[hero\] hero: título "Mochila antirrobo"/);
    expect(describirLanding(landing())).toContain("Diseño: premium-ventaspro");
  });
});

describe("los ojos", () => {
  it("la instrucción pide nota, cambios concretos con ids y no inventar datos", () => {
    const t = instruccionDeCritica({ tipo: "creativo", formato: "9:16", estructura: "0. [g1] texto \"Gancho\"" });
    expect(t).toContain("NOTA");
    expect(t).toContain("[g1]");
    expect(t).toMatch(/Zonas seguras/);
    expect(t).toMatch(/No inventes datos/);
    expect(instruccionDeCritica({ tipo: "landing" })).toMatch(/Primera pantalla del celular/);
  });
});
