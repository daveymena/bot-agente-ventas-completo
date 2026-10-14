import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  FORMATOS, FORMATOS_LISTA, PLANTILLAS_LISTA, PLANTILLAS, disenoDePlantilla, validarDiseno, escenasAutomaticas, GUIONES_LISTA,
  TEMAS, TEMAS_LISTA, ESTILOS, ESTILOS_BASE, estiloPorId, decoracionesDeTema, resolverEstilo, ANIMACIONES, TRANSICIONES,
  type Capa, type CapaTexto, type Contenido, type Entrada,
} from "../estudio-anuncios/diseno";
import { FUENTES, trazar, medir, envolver, fuentesDisponibles, familiasInstaladas, parrafo } from "../estudio-anuncios/tipografia";
import { buscarElementos, svgDeElemento, existeElemento, resumenDeColecciones } from "../estudio-anuncios/elementos";
import { buscarPlantillas, resolverIdDePlantilla, totalDePlantillas, contenidoDeMuestra, disenoDeCatalogo, desdeFabricJSON, aplicarDisenoAContenido } from "../estudio-anuncios/plantillas";
import { agruparCapas, filtroDeEntrada, transicionDe } from "../estudio-anuncios/video";
import { resolverPlantillas, idDePieza } from "../estudio-anuncios/estudio";
import { HERRAMIENTAS_ESTUDIO } from "../estudio-anuncios/atlas";

/**
 * Plantillas tipo Canva del Estudio: catálogo combinatorio (maqueta × estilo ×
 * tema), tipografías propias (sin fuentes del sistema), elementos abiertos,
 * decoraciones que no pisan el texto, guiones de vídeo y las herramientas de
 * Atlas. Regla de la casa: nada se afirma si no está en el producto.
 */
const C: Contenido = contenidoDeMuestra();
const PROHIBIDO = /garantizado|el mejor|miles de clientes|env[ií]o gratis|-\d+%|\d+% (?:off|dcto|descuento)/i;

const caja = (k: Capa) => ({ x: k.x, y: k.y, w: k.w, h: k.h });
const seTocan = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe("tipografía propia (opentype, sin fuentes del sistema)", () => {
  it("las 20 familias están instaladas en assets/fonts", () => {
    expect(fuentesDisponibles()).toBe(true);
    const inst = familiasInstaladas();
    for (const f of FUENTES) expect(inst, `falta la fuente ${f.id}`).toContain(f.id);
    expect(FUENTES.length).toBeGreaterThanOrEqual(20);
  });

  it("trazar nunca escribe NaN (opentype.js 2 lo hacía con x=216.00000000000003)", () => {
    const x = 216.00000000000003;
    for (const f of FUENTES) for (const peso of [400, 700, 900] as const) {
      const t = trazar("¡Hoy 25% más ñandú! Él es 1º $45.000", x, 300.5, 72, peso, "middle", f.id);
      expect(t.d, `${f.id} ${peso}`).not.toMatch(/NaN|undefined|Infinity/);
      expect(t.d.length).toBeGreaterThan(50);
      expect(t.width).toBeGreaterThan(0);
    }
  });

  it("medir y envolver respetan el ancho máximo con cualquier familia", () => {
    for (const f of ["inter", "montserrat", "bebas-neue", "pacifico", "playfair-display", "caveat"]) {
      const p = parrafo({ texto: "Corrector de postura ajustable con neopreno acolchado y transpirable", x: 0, y: 0, maxWidth: 700, size: 64, peso: 700, familia: f, maxLines: 3 });
      expect(p.lineas.length).toBeLessThanOrEqual(3);
      expect(p.svg).not.toMatch(/NaN/);
      for (const l of p.lineas) expect(medir(l, p.size, 700, f)).toBeLessThanOrEqual(700 + 2);
    }
  });

  it("envolver no deja una viuda de una palabra corta ('1 L' no se parte en 'L' sola)", () => {
    const texto = "Botella térmica Nórdica 1 L";
    // Ancho justo para que quepa "Botella térmica Nórdica 1" pero no la "L": sin la regla quedaría "L" sola.
    const ancho = medir("Botella térmica Nórdica 1", 60, 700, "inter") + 4;
    const lineas = envolver(texto, 60, 700, ancho, 3, "inter");
    expect(lineas.length).toBe(2);
    expect(lineas[1]).toBe("1 L");
    expect(lineas.join(" ")).toBe(texto);
    for (const l of lineas) expect(medir(l, 60, 700, "inter")).toBeLessThanOrEqual(ancho + 2);
  });
});

describe("elementos abiertos (emoji, iconos, logos, formas)", () => {
  it("las colecciones declaran licencia y tienen miles de elementos", () => {
    const r = resumenDeColecciones();
    const total = r.reduce((s, c) => s + c.cantidad, 0);
    expect(total).toBeGreaterThan(10000);
    for (const c of r) expect(c.licencia).toMatch(/MIT|CC0|OFL|Apache|ISC|VentasPro/i);
  });

  it("busca en español y cada resultado se puede pintar con sharp", async () => {
    const hits = buscarElementos("regalo navidad", { limite: 6 });
    expect(hits.length).toBeGreaterThan(0);
    for (const e of hits.slice(0, 3)) {
      const s = svgDeElemento(e.ref, "#ff0000");
      expect(s, e.ref).not.toBeNull();
      const png = await sharp(Buffer.from(s!.svg)).resize(64, 64).png().toBuffer();
      expect(png.length).toBeGreaterThan(100);
    }
  });

  it("los iconos de los 23 temas existen de verdad", () => {
    for (const t of TEMAS) for (const d of t.decoraciones) expect(existeElemento(d.icono), `${t.id}: ${d.icono}`).toBe(true);
    expect(existeElemento("emoji:esto-no-existe")).toBe(false);
  });

  it("un svg propio pasa por el saneado (sin scripts ni eventos)", () => {
    const malo = svgDeElemento(`svg:<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>x()</script><rect width="10" height="10"/></svg>`);
    expect(malo?.svg || "").not.toMatch(/script|onload/i);
  });
});

describe("catálogo combinatorio maqueta × estilo × tema", () => {
  it("son decenas de miles de ids y cada id se resuelve a sus tres partes", () => {
    expect(totalDePlantillas()).toBe(PLANTILLAS_LISTA.length * ESTILOS().length * TEMAS_LISTA.length);
    expect(totalDePlantillas()).toBeGreaterThan(30000);
    expect(resolverIdDePlantilla("oferta.pop.navidad")).toEqual({ maqueta: "oferta", estilo: "pop", tema: "navidad" });
    expect(resolverIdDePlantilla("destacado")).toEqual({ maqueta: "destacado", estilo: "marca", tema: "ninguno" });
    expect(resolverIdDePlantilla("minimal.limpio")).toEqual({ maqueta: "minimal", estilo: "limpio", tema: "ninguno" });
    expect(resolverIdDePlantilla("noexiste.pop.navidad")).toBeNull();
    expect(resolverIdDePlantilla("oferta.noexiste")).toBeNull();
  });

  it("busca por palabras en español, categoría, tema y estilo, paginado", () => {
    const nav = buscarPlantillas({ q: "navidad oferta", porPagina: 5 });
    expect(nav.total).toBeGreaterThan(0);
    expect(nav.items.length).toBeLessThanOrEqual(5);
    for (const p of nav.items) expect(p.id).toMatch(/\.navidad$/);
    const cat = buscarPlantillas({ categoria: "beneficios", tema: "fitness", estilo: "pop" });
    expect(cat.total).toBeGreaterThan(0);
    for (const p of cat.items) { expect(p.categoria).toBe("beneficios"); expect(p.id).toMatch(/\.pop\.fitness$/); }
    const p2 = buscarPlantillas({ pagina: 2, porPagina: 10 });
    expect(p2.pagina).toBe(2);
    expect(p2.items[0]?.id).not.toBe(buscarPlantillas({ pagina: 1, porPagina: 10 }).items[0]?.id);
    expect(buscarPlantillas({ q: "xyzzy-nada" }).total).toBe(0);
  });

  it("cada maqueta sale válida en los 3 formatos con una muestra de estilos y temas", () => {
    const estilos = ["marca", "limpio", "nocturno", "pop", "elegante", ESTILOS()[ESTILOS().length - 1]!.id];
    const temas = ["ninguno", "navidad", "amor", "blackfriday", "mascotas", "envios"];
    let n = 0;
    for (const m of PLANTILLAS_LISTA) for (const f of FORMATOS_LISTA) {
      const estilo = estilos[n % estilos.length], tema = temas[(n * 7) % temas.length];
      const d = disenoDePlantilla(m, f, C, { estilo, tema, gancho: n, foto: n });
      expect(validarDiseno(d), `${m}/${f}/${estilo}/${tema}`).toBe(true);
      expect(d.ancho).toBe(FORMATOS[f].ancho);
      expect(d.alto).toBe(FORMATOS[f].alto);
      for (const k of d.capas) {
        expect(k.x + k.w, `${m}/${f} capa ${k.nombre} se sale por la derecha`).toBeLessThanOrEqual(d.ancho + Math.max(40, k.w * 0.35));
        expect(k.x, `${m}/${f} capa ${k.nombre} se sale por la izquierda`).toBeGreaterThanOrEqual(-Math.max(40, k.w * 0.35));
        if (k.tipo === "texto") { expect(k.texto).not.toMatch(PROHIBIDO); expect(k.tam).toBeGreaterThan(14); }
      }
      if (tema !== "ninguno") expect(d.tema).toBe(tema);
      n++;
    }
  });

  it("disenoDeCatalogo pinta por id y marca estilo + tema en el diseño", () => {
    const d = disenoDeCatalogo("destacado.pop.navidad", "historia", C);
    expect(d).not.toBeNull();
    expect(d!.estilo).toBe("pop");
    expect(d!.tema).toBe("navidad");
    expect(d!.capas.some((k) => k.tipo === "icono")).toBe(true);
    expect(disenoDeCatalogo("nada.pop.navidad", "historia", C)).toBeNull();
  });

  it("las decoraciones del tema no pisan los textos ni los botones en ninguna maqueta", () => {
    for (const tema of ["navidad", "halloween", "amor", "madre", "fiesta", "tecnologia"]) for (const m of PLANTILLAS_LISTA) for (const f of FORMATOS_LISTA) {
      const d = disenoDePlantilla(m, f, C, { estilo: "pop", tema });
      const decor = d.capas.filter((k) => k.tipo === "icono" && k.nombre === "Decoración");
      const fijas = d.capas.filter((k) => k.tipo === "texto" || k.tipo === "rect" || k.tipo === "circulo");
      for (const dc of decor) for (const fx of fijas) expect(seTocan(caja(dc), caja(fx)), `${tema}/${m}/${f}: decoración pisa ${fx.nombre}`).toBe(false);
    }
  });

  it("con la foto del producto, casi todas las maquetas conservan algún adorno del tema (recorre el borde si la esquina está ocupada)", () => {
    const conFoto: Contenido = { ...C, fotos: ["/uploads/a.jpg", "/uploads/b.jpg", "/uploads/c.jpg"] };
    const sinAdorno: string[] = [];
    for (const m of PLANTILLAS_LISTA) for (const f of FORMATOS_LISTA) {
      const d = disenoDePlantilla(m, f, conFoto, { estilo: "pop", tema: "navidad" });
      if (!d.capas.some((k) => k.tipo === "icono" && k.nombre === "Decoración")) sinAdorno.push(`${m}/${f}`);
    }
    expect(sinAdorno.length, sinAdorno.join(", ")).toBeLessThanOrEqual(4);
  });

  it("decoracionesDeTema esquiva lo ocupado y se rinde si no cabe", () => {
    const libres = decoracionesDeTema("navidad", "cuadrado", { esquivar: [] });
    expect(libres.length).toBeGreaterThan(0);
    const muro: Capa = { id: "m", tipo: "rect", nombre: "Muro", x: -200, y: -200, w: 1480, h: 1480, relleno: "#000000", radio: 0 };
    expect(decoracionesDeTema("navidad", "cuadrado", { esquivar: [muro] })).toEqual([]);
    expect(decoracionesDeTema("ninguno", "cuadrado")).toEqual([]);
  });

  it("los estilos tienen paletas con contraste y los temas descripción y tags", () => {
    expect(ESTILOS_BASE.length).toBeGreaterThanOrEqual(20);
    expect(ESTILOS().length).toBeGreaterThan(100);
    for (const e of ESTILOS().slice(0, 40)) {
      const E = resolverEstilo(e, { color: "#4F46E5", cta: "Pedir" });
      expect(E.paleta.fondo).toMatch(/^#[0-9a-f]{6}$/i);
      expect(E.paleta.texto.toLowerCase()).not.toBe(E.paleta.fondo.toLowerCase());
      expect(FUENTES.some((f) => f.id === E.fuentes.titular), `${e.id}: ${E.fuentes.titular}`).toBe(true);
      expect(FUENTES.some((f) => f.id === E.fuentes.cuerpo), `${e.id}: ${E.fuentes.cuerpo}`).toBe(true);
    }
    expect(estiloPorId("no-existe").id).toBe("marca");
    for (const t of TEMAS) { expect(t.nombre).toBeTruthy(); expect(Array.isArray(t.tags)).toBe(true); }
  });
});

describe("plantillas propias (editor → plantilla → otro producto)", () => {
  const fabric = {
    version: "6.0.0",
    background: "#111827",
    objects: [
      { type: "Rect", left: 0, top: 0, width: 1080, height: 1350, fill: "#111827" },
      { type: "Image", left: 90, top: 120, width: 900, height: 900, scaleX: 1, scaleY: 1, src: "/uploads/x.jpg" },
      { type: "Textbox", left: 90, top: 1050, width: 900, text: "Título cualquiera", fontSize: 72, fontWeight: 700, fill: "#ffffff", textAlign: "center", fontFamily: "Montserrat" },
      { type: "IText", left: 90, top: 1180, width: 300, text: "$1", fontSize: 60, fontWeight: 900, fill: "#fbbf24" },
      { type: "Rect", left: 640, top: 1180, width: 350, height: 90, fill: "#4F46E5", rx: 45 },
      { type: "Textbox", left: 640, top: 1200, width: 350, text: "Compra ahora", fontSize: 36, fontWeight: 700, fill: "#fff", textAlign: "center" },
    ],
  };

  it("desdeFabricJSON convierte lo que exporta el editor a un diseño válido", () => {
    const d = desdeFabricJSON(fabric, "vertical");
    expect(validarDiseno(d)).toBe(true);
    expect(d.capas.some((k) => k.tipo === "imagen")).toBe(true);
    const gancho = d.capas.find((k) => k.nombre === "Gancho") as CapaTexto;
    expect(gancho?.tipo).toBe("texto");
    expect(gancho.fuente).toBe("montserrat");
    expect(d.capas.find((k) => k.nombre === "Precio")?.tipo).toBe("texto");
  });

  it("aplicarDisenoAContenido reemplaza textos por rol y foto, sin inventar nada", () => {
    const base = desdeFabricJSON(fabric, "vertical");
    const conFoto: Contenido = { ...C, fotos: ["/uploads/producto-real.jpg"] };
    const d = aplicarDisenoAContenido(base, conFoto, "cuadrado");
    expect(validarDiseno(d)).toBe(true);
    expect(d.formato).toBe("cuadrado");
    expect(d.ancho).toBe(1080);
    expect(d.alto).toBe(1080);
    const textos = d.capas.filter((k): k is CapaTexto => k.tipo === "texto").map((k) => [k.nombre, k.texto] as const);
    expect(textos.find(([n]) => n === "Precio")?.[1]).toBe(C.precio);
    expect(textos.find(([n]) => n === "Texto del botón")?.[1]).toBe(C.cta);
    expect(textos.find(([n]) => n === "Gancho")?.[1]).toBe(C.ganchos[0]);
    for (const [, t] of textos) expect(t).not.toMatch(PROHIBIDO);
    const foto = d.capas.find((k) => k.tipo === "imagen") as any;
    expect(foto.src).toBe("/uploads/producto-real.jpg");
    // Sin foto real la capa de imagen no se inventa: desaparece.
    expect(aplicarDisenoAContenido(base, C, "cuadrado").capas.some((k) => k.tipo === "imagen")).toBe(false);
  });
});

describe("guiones y escenas del vídeo", () => {
  it("cada guion arma escenas 9:16 válidas, con transición, entrada animada y locución", () => {
    for (const guion of GUIONES_LISTA) {
      const escenas = escenasAutomaticas(C, { guion, estilo: "pop", tema: "navidad" });
      expect(escenas.length, guion).toBeGreaterThanOrEqual(3);
      let conAnim = 0;
      for (const e of escenas) {
        expect(validarDiseno(e.diseno), `${guion}/${e.id}`).toBe(true);
        expect(e.diseno.formato).toBe("historia");
        expect(e.duracion).toBeGreaterThanOrEqual(1.5);
        if (e.transicion) expect(Object.keys(TRANSICIONES)).toContain(e.transicion);
        for (const k of e.diseno.capas) {
          if (k.anim?.entrada) { conAnim++; expect(Object.keys(ANIMACIONES)).toContain(k.anim.entrada); }
          if (k.tipo === "texto") expect(k.texto).not.toMatch(PROHIBIDO);
        }
      }
      expect(conAnim, `${guion} sin entradas animadas`).toBeGreaterThan(0);
      expect(escenas.some((e) => e.locucion.trim().length > 0)).toBe(true);
    }
  });

  it("el guion 'pregunta' pregunta por el producto en vez de inventar una promesa", () => {
    const sin: Contenido = { ...C, ganchos: C.ganchos.filter((g) => !/\?/.test(g)) };
    const escenas = escenasAutomaticas(sin, { guion: "pregunta" });
    const textos = escenas.flatMap((e) => e.diseno.capas.filter((k): k is CapaTexto => k.tipo === "texto").map((k) => k.texto));
    expect(textos.some((t) => t.startsWith("¿Buscas ") && t.endsWith("?"))).toBe(true);
    for (const t of textos) expect(t).not.toMatch(PROHIBIDO);
  });

  it("agruparCapas separa base y grupos consecutivos; filtroDeEntrada da un filtergraph sano", () => {
    const escenas = escenasAutomaticas(C, { guion: "rapido", estilo: "pop", tema: "navidad" });
    const { base, grupos } = agruparCapas(escenas[0]!.diseno.capas);
    expect(base[0]?.tipo).toBe("fondo");
    expect(grupos.length).toBeGreaterThan(0);
    expect(grupos.length).toBeLessThanOrEqual(14);
    for (const g of grupos) expect(g.capas.length).toBeGreaterThan(0);
    for (const entrada of Object.keys(ANIMACIONES) as Entrada[]) {
      const f = filtroDeEntrada(1, { capas: [], entrada, retraso: 0.3, duracion: 0.5, salida: null }, { x: 100, y: 200, w: 300, h: 80 }, 3, "[b]", "[v]");
      expect(f).toContain("[1:v]");
      expect(f).toContain("[v]");
      expect(f).not.toMatch(/NaN|undefined/);
    }
    expect(transicionDe("circleopen")).toBe("circleopen");
    expect(transicionDe("no-existe" as any)).toBe("fade");
  });
});

describe("resolución de plantillas pedidas por Atlas o el panel", () => {
  it("acepta maqueta sola, maqueta.estilo, id completo e ids basura; el id de pieza es estable", async () => {
    const r = await resolverPlantillas(1, ["oferta.pop.navidad", "destacado", "minimal.limpio", "basura", "personal:no-existe"], { estilo: "nocturno", tema: "amor" });
    expect(r.map((p) => p.id)).toEqual(["oferta.pop.navidad", "destacado.nocturno.amor", "minimal.limpio.amor"]);
    expect(idDePieza(r[0]!, "vertical")).toBe("oferta-pop-navidad-vertical");
    expect(idDePieza({ tipo: "catalogo", id: "destacado", r: { maqueta: "destacado", estilo: "marca", tema: "ninguno" } }, "cuadrado")).toBe("destacado-cuadrado");
    const def = await resolverPlantillas(1, [], {});
    expect(def.map((p) => (p.tipo === "catalogo" ? p.r.maqueta : null))).toEqual(["destacado", "oferta", "beneficios", "minimal"]);
    expect(def.map((p) => idDePieza(p, "cuadrado"))).toEqual(["destacado-cuadrado", "oferta-cuadrado", "beneficios-cuadrado", "minimal-cuadrado"]);
    const muchos = await resolverPlantillas(1, PLANTILLAS_LISTA.flatMap((m) => [m, `${m}.pop`]), {});
    expect(muchos.length).toBe(12);
  });
});

describe("herramientas de Atlas para el Estudio", () => {
  it("existen con nombre, descripción en español y contrato de argumentos; solo dos son de lectura", () => {
    const nombres = HERRAMIENTAS_ESTUDIO.map((h) => h.name);
    expect(nombres).toEqual(["estudio_plantillas", "estudio_generar", "estudio_pieza", "estudio_editar_texto", "estudio_video", "estudio_estado", "estudio_recortar", "estudio_ia_crear"]);
    for (const h of HERRAMIENTAS_ESTUDIO) {
      expect(h.description.length).toBeGreaterThan(40);
      expect(h.args).toContain("{");
      expect(typeof h.run).toBe("function");
    }
    for (const n of ["estudio_generar", "estudio_pieza", "estudio_editar_texto", "estudio_video", "estudio_recortar", "estudio_ia_crear"]) expect(HERRAMIENTAS_ESTUDIO.find((h) => h.name === n)!.description).toMatch(/requiere confirmación/);
  });

  it("estudio_plantillas responde con ids reales y el resumen de temas/estilos/guiones", async () => {
    const r = await HERRAMIENTAS_ESTUDIO.find((h) => h.name === "estudio_plantillas")!.run({ q: "navidad oferta" }, { tenantId: 999999 });
    expect(r.ok).toBe(true);
    expect(r.summary).toMatch(/Temas:/);
    expect(r.summary).toMatch(/navidad=Navidad/);
    expect(r.summary).toMatch(/Guiones de vídeo:/);
    expect(r.data.items.length).toBeGreaterThan(0);
    for (const id of r.data.items) expect(resolverIdDePlantilla(id)).not.toBeNull();
  });

  it("las de escritura validan argumentos antes de tocar nada", async () => {
    const ctx = { tenantId: 999999 };
    expect((await HERRAMIENTAS_ESTUDIO.find((h) => h.name === "estudio_generar")!.run({}, ctx)).ok).toBe(false);
    expect((await HERRAMIENTAS_ESTUDIO.find((h) => h.name === "estudio_pieza")!.run({ productId: 1 }, ctx)).ok).toBe(false);
    expect((await HERRAMIENTAS_ESTUDIO.find((h) => h.name === "estudio_editar_texto")!.run({ productId: 1, piezaId: "x" }, ctx)).ok).toBe(false);
    expect((await HERRAMIENTAS_ESTUDIO.find((h) => h.name === "estudio_video")!.run({}, ctx)).ok).toBe(false);
    expect((await HERRAMIENTAS_ESTUDIO.find((h) => h.name === "estudio_estado")!.run({}, ctx)).ok).toBe(false);
  });
});

describe("render de una pieza con tema (sharp, sin navegador)", () => {
  it("una plantilla temática se pinta con sus iconos y la fuente del estilo", async () => {
    const { renderizarDiseno } = await import("../estudio-anuncios/render");
    const d = disenoDePlantilla("oferta", "cuadrado", C, { estilo: "pop", tema: "navidad" });
    const png = await renderizarDiseno(d, { cargar: async () => null });
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1080);
    // Tiene color de verdad (no un lienzo vacío): la desviación estándar de los canales no es ~0.
    const st = await sharp(png).stats();
    expect(Math.max(...st.channels.map((c) => c.stdev))).toBeGreaterThan(20);
  }, 60_000);
});
