import { describe, expect, it } from "vitest";
import { elegirComposicion, varianteDeSeccion, MODELOS, VARIANTES, type BloqueId } from "../composicion";
import { renderizarLanding } from "../renderer-v3";

const producto = {
  name: "Corrector de postura",
  description: "Te ayuda a mantener la espalda recta mientras trabajas.",
  imageUrl: "https://cdn.example.com/hero.webp",
  images: ["https://cdn.example.com/hero.webp", "https://cdn.example.com/a.webp", "https://cdn.example.com/b.webp", "https://cdn.example.com/c.webp", "https://cdn.example.com/d.webp"],
  price: 79900,
  currency: "COP",
};
const negocio = { nombre: "Tienda", modelo: "fisico", whatsapp: "+57 300 000 0000", confianza: ["Pago contra entrega"] };
const secciones = [
  { id: "h", type: "hero", title: "Endereza tu espalda", subtitle: "Discreto bajo la ropa.", cta: "Pedir ahora" },
  { id: "b", type: "benefits", title: "Lo que cambia", body: "Menos dolor al final del día\nPostura recta sin pensar\nSe ajusta a tu talla" },
  { id: "c", type: "how-it-works", title: "Cómo se usa", body: "Te lo pones como una mochila\nAjustas las tiras\nLo usas 2 horas al día" },
  { id: "g", type: "gallery", title: "Míralo" },
  { id: "l", type: "logistics", title: "Envío", body: "Llega en 3 a 5 días\nPagas al recibir" },
  { id: "o", type: "offer", title: "Tu corrector", body: "Una unidad\nTalla ajustable" , cta: "Pedir ahora" },
  { id: "f", type: "faq", title: "Preguntas", body: "¿Se nota? | No, va debajo de la ropa.\n¿Cuánto tarda? | 3 a 5 días." },
  { id: "z", type: "cta", title: "Empieza hoy", cta: "Pedir ahora" },
];

describe("elegirComposicion", () => {
  it("sin modelo ni semilla sale la clásica: lo ya publicado no cambia solo", () => {
    expect(elegirComposicion({ fisico: true }).modelo).toBe("clasica");
  });

  it("la misma semilla da siempre la misma página", () => {
    const a = elegirComposicion({ semilla: "abc123", fisico: true, familia: "dropshipping" });
    const b = elegirComposicion({ semilla: "abc123", fisico: true, familia: "dropshipping" });
    expect(a).toEqual(b);
  });

  it("semillas distintas dan modelos distintos (no siempre lo mismo)", () => {
    const modelos = new Set(Array.from({ length: 40 }, (_, i) => elegirComposicion({ semilla: `s${i}`, fisico: true }).modelo));
    expect(modelos.size).toBeGreaterThanOrEqual(4);
  });

  it("un digital nunca cae en un modelo pensado solo para físico", () => {
    for (let i = 0; i < 60; i++) {
      const m = elegirComposicion({ semilla: `d${i}`, fisico: false }).modelo;
      expect(MODELOS[m].para).toContain("digital");
    }
  });

  it("cada modelo solo usa variantes que el renderer sabe dibujar", () => {
    for (const m of Object.values(MODELOS)) {
      for (const [bloque, lista] of Object.entries(m.bloques)) {
        for (const v of lista) expect(VARIANTES[bloque as BloqueId], `${m.id}.${bloque}.${v}`).toContain(v);
      }
    }
  });

  it("un layout puesto a mano en el editor le gana a la composición", () => {
    const comp = elegirComposicion({ modelo: "minimal", fisico: true });
    expect(varianteDeSeccion("benefits", "zigzag", comp)).toBe("zigzag");
    expect(varianteDeSeccion("benefits", "inventado", comp)).toBe(comp.variantes.benefits);
  });
});

describe("el renderer dibuja cada modelo de verdad distinto", () => {
  const render = (modelo: string, semilla = "x") =>
    renderizarLanding({ nombre: "Demo", familia: "ecommerce", producto, negocio, secciones, modelo, semilla, cierre: { tipo: "contraentrega", accion: "/pedido" } });

  it("cada modelo marca su página y cambia el marcado, no solo el color", () => {
    const paginas = Object.keys(MODELOS).map((m) => render(m));
    for (const [i, m] of Object.keys(MODELOS).entries()) expect(paginas[i]).toContain(`data-modelo="${m}"`);
    // Quitando el CSS (que es el mismo), el cuerpo de cada modelo es distinto.
    const cuerpos = new Set(paginas.map((p) => p.split("</style>")[1].replace(/data-modelo="[^"]+"|lx-[a-z-]+ ?/g, (x) => (x.startsWith("data") ? "" : x))));
    expect(cuerpos.size).toBe(Object.keys(MODELOS).length);
  });

  it("tienda directa pone el producto al frente; artículo usa portada editorial", () => {
    expect(render("tienda-directa")).toMatch(/lx-prod|lx-hoffer/);
    expect(render("advertorial")).toContain("lx-edit");
  });

  it("cada variante de cada bloque se dibuja con contenido (ninguna es un alias vacío)", () => {
    const porBloque: Record<BloqueId, string> = {
      hero: "h", benefits: "b", feature: "c", logistics: "l", offer: "o", faq: "f", cta: "z", gallery: "g",
    };
    for (const [bloque, lista] of Object.entries(VARIANTES) as Array<[BloqueId, readonly string[]]>) {
      const marcas = new Set<string>();
      for (const v of lista) {
        const secs = secciones.map((s) => (s.id === porBloque[bloque] ? { ...s, layout: v } : s));
        const html = renderizarLanding({ nombre: "Demo", familia: "ecommerce", producto, negocio, secciones: secs, cierre: { tipo: "contraentrega", accion: "/pedido" } });
        marcas.add(html.split("</style>")[1]);
      }
      expect(marcas.size, `las variantes de ${bloque} tienen que dar HTML distinto`).toBe(lista.length);
    }
  });

  it("ninguna foto sale dos veces aunque cambie el modelo", () => {
    for (const m of Object.keys(MODELOS)) {
      const cuerpo = render(m).split("</style>")[1];
      for (const f of producto.images.slice(1)) {
        expect(cuerpo.split(`src="${f}"`).length - 1, `${m}: ${f}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("la landing no inventa datos (regla: lo no configurado no se afirma)", () => {
  const html = renderizarLanding({ nombre: "Demo", familia: "dropshipping", producto, negocio, secciones, cierre: { tipo: "contraentrega", accion: "/pedido" } });

  it("sin precio anterior cargado no hay precio tachado ni 'ahorras'", () => {
    expect(html).not.toContain('class="price-old"');
    expect(html).not.toMatch(/Ahorras/);
  });

  it("no aparecen estrellas ni calificación inventadas", () => {
    expect(html).not.toContain("4.9/5");
    expect(html).not.toContain("★★★★★");
  });

  it("la barra superior solo repite condiciones reales del negocio", () => {
    expect(html).not.toContain("Garantía 30 días");
    expect(html).not.toContain("Envío Gratis");
    expect(html).toContain('class="ann-bar">Pago contra entrega<');
  });

  it("con un precio anterior real sí se muestra tachado y el ahorro exacto", () => {
    const con = renderizarLanding({ nombre: "Demo", familia: "dropshipping", producto: { ...producto, precioAntes: 99900 }, negocio, secciones });
    expect(con).toContain('class="price-old"');
    expect(con).toContain("Ahorras $20.000");
  });
});

describe("pedidoDeComposicion: el servidor entiende el pedido de diseño sin preguntarle al modelo", () => {
  it("'otra composición' pide una semilla nueva sin cambiar de modelo", async () => {
    const { pedidoDeComposicion } = await import("../composicion");
    expect(pedidoDeComposicion("dame otra composición")).toEqual({ nueva: true });
    expect(pedidoDeComposicion("cambia el diseño, no me gusta")).toEqual({ nueva: true });
  });
  it("nombra el modelo cuando se lo piden con palabras del dueño", async () => {
    const { pedidoDeComposicion } = await import("../composicion");
    expect(pedidoDeComposicion("hazla tipo artículo")?.modelo).toBe("advertorial");
    expect(pedidoDeComposicion("quiero algo más minimalista")?.modelo).toBe("minimal");
    expect(pedidoDeComposicion("estilo lanzamiento con portada grande")?.modelo).toBe("lanzamiento");
  });
  it("un pedido de texto NO se confunde con uno de diseño", async () => {
    const { pedidoDeComposicion } = await import("../composicion");
    expect(pedidoDeComposicion("haz el título más directo")).toBeNull();
    expect(pedidoDeComposicion("agrega una pregunta sobre el envío")).toBeNull();
    expect(pedidoDeComposicion("pon un título diferente")).toBeNull();
  });
});

describe("el modelo se elige por tipo de negocio, nicho, precio y lo que vende la tienda", () => {
  const frecuencia = async (opts: any, n = 200) => {
    const { elegirComposicion } = await import("../composicion");
    const cuenta: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const m = elegirComposicion({ ...opts, semilla: `q${i}` }).modelo;
      cuenta[m] = (cuenta[m] || 0) + 1;
    }
    return cuenta;
  };

  it("cada modelo de la evidencia sirve para el tipo de negocio donde aparece", async () => {
    const { EVIDENCIA, MODELOS } = await import("../composicion");
    for (const [tipo, lista] of Object.entries(EVIDENCIA)) {
      for (const e of lista) expect(MODELOS[e.modelo].para, `${tipo} → ${e.modelo}`).toContain(tipo);
    }
  });

  it("un servicio sale con modelos de servicio, y el de agenda es el más frecuente", async () => {
    const c = await frecuencia({ tipo: "servicio" });
    expect(Object.keys(c)).not.toContain("tienda-directa");
    expect(Object.keys(c)).not.toContain("catalogo");
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
    expect(top).toBe("servicio-local");
  });

  it("digital barato tiende a página corta; digital caro, a historia o experto", async () => {
    const barato = await frecuencia({ tipo: "digital", precio: 25000 });
    const caro = await frecuencia({ tipo: "digital", precio: 900000 });
    expect(barato["digital-rapida"] || 0).toBeGreaterThan(barato["historia"] || 0);
    expect((caro["historia"] || 0) + (caro["autoridad"] || 0)).toBeGreaterThan(caro["digital-rapida"] || 0);
  });

  it("un suplemento en dropshipping empuja al formato artículo (pre-venta)", async () => {
    const { pesosDeModelos } = await import("../composicion");
    const p = pesosDeModelos({ tipo: "dropshipping", familia: "suplemento" });
    expect(p[0].modelo).toBe("advertorial");
  });

  it("lo que vendió en la tienda pesa, pero solo con visitas suficientes", async () => {
    const { factorPorRendimiento } = await import("../composicion");
    const r = { "tienda-directa": { visitas: 2000, pedidos: 80 }, advertorial: { visitas: 2000, pedidos: 20 } } as any;
    expect(factorPorRendimiento("tienda-directa", r)).toBeGreaterThan(1.2);
    expect(factorPorRendimiento("advertorial", r)).toBeLessThan(0.8);
    expect(factorPorRendimiento("catalogo", r)).toBe(1);
    expect(factorPorRendimiento("tienda-directa", { "tienda-directa": { visitas: 40, pedidos: 10 } } as any)).toBe(1);
  });

  it("traduce lo que guarda la app a un tipo de negocio", async () => {
    const { tipoDeNegocio } = await import("../composicion");
    expect(tipoDeNegocio("dropshipping")).toBe("dropshipping");
    expect(tipoDeNegocio("servicio")).toBe("servicio");
    expect(tipoDeNegocio("cotizacion")).toBe("servicio");
    expect(tipoDeNegocio("fisico")).toBe("fisico");
    expect(tipoDeNegocio("suscripcion")).toBe("digital");
    expect(tipoDeNegocio("", true)).toBe("fisico");
  });

  it("la composición dice por qué eligió ese modelo", async () => {
    const { elegirComposicion } = await import("../composicion");
    expect(elegirComposicion({ tipo: "servicio", semilla: "z" }).porque.length).toBeGreaterThan(20);
  });
});

describe("métricas de landing", () => {
  it("no cuenta robots ni vistas previas de enlaces como visitas", async () => {
    const { esVisitaDePersona } = await import("../metricas");
    expect(esVisitaDePersona("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari")).toBe(true);
    expect(esVisitaDePersona("facebookexternalhit/1.1")).toBe(false);
    expect(esVisitaDePersona("WhatsApp/2.23")).toBe(false);
    expect(esVisitaDePersona("")).toBe(false);
  });
  it("suma por modelo y las landings sin modelo cuentan como clásica", async () => {
    const { agruparPorModelo } = await import("../metricas");
    const r = agruparPorModelo([
      { design: { modelo: "advertorial" }, strategy: { metricas: { visitas: 100, pedidos: 4 } } },
      { design: { modelo: "advertorial" }, strategy: { metricas: { visitas: 50, pedidos: 1 } } },
      { design: {}, strategy: { metricas: { visitas: 30, pedidos: 0 } } },
      { design: { modelo: "minimal" }, strategy: {} },
    ]);
    expect(r).toEqual({ advertorial: { visitas: 150, pedidos: 5 }, clasica: { visitas: 30, pedidos: 0 } });
  });
});
