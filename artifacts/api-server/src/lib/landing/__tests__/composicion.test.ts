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

  // ── CONTRATO del 03-10-2026 (decisión del dueño) ─────────────────────────
  // Con el concepto único la SEMILLA ya NO cambia el esqueleto: cambia las
  // VARIANTES por bloque (posición del hero, orden del contenido, galería).
  it("semillas distintas dan VARIANTES distintas: el modelo queda tienda-directa", () => {
    const variantes = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const c = elegirComposicion({ semilla: `s${i}`, fisico: true });
      expect(c.modelo).toBe("tienda-directa");
      variantes.add(c.variantes.hero);
    }
    // el sorteo de POSICIÓN sigue vivo: al menos 2 formas de hero distintas
    expect(variantes.size).toBeGreaterThanOrEqual(2);
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

  it("tienda directa pone el producto al frente con la clase de su modelo", () => {
    expect(render("tienda-directa")).toMatch(/lx-prod|lx-hoffer/);
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
    // Los estilos eliminados ya no se leen como pedido de composición:
    // devuelven null y el camino normal de edición sigue.
    expect(pedidoDeComposicion("hazla tipo artículo")?.modelo).toBeUndefined();
    expect(pedidoDeComposicion("hazla tipo tienda")?.modelo).toBe("tienda-directa");
    expect(pedidoDeComposicion("quiero algo más minimalista")).toBeNull();
    expect(pedidoDeComposicion("estilo lanzamiento con portada grande")).toBeNull();
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

  // ── CONTRATO del 03-10-2026 (decisión del dueño) ────────────────────────
  // "los otros estilos y familias no me gustan, elimínalos; manejemos esos
  // conceptos, solo variarían posiciones, imágenes y repeticiones." Quita la
  // variedad de esqueletos: queda el concepto "tienda-directa" (más la
  // clásica para lo ya publicado) y la VARIACIÓN vive en las variantes por
  // bloque — no en elegir otro esqueleto.
  it("TODO tipo de negocio recibe el concepto 'tienda-directa' (los estilos del dueño)", async () => {
    for (const tipo of ["dropshipping", "fisico", "digital", "servicio"] as const) {
      const c = await frecuencia({ tipo });
      expect(Object.keys(c)).toEqual(["tienda-directa"]);
    }
  });

  it("lo que vendió en la tienda pesa, pero solo con visitas suficientes", async () => {
    const { factorPorRendimiento } = await import("../composicion");
    // Dos grupos del mismo pool: el concepto (4%) contra la clásica (1%).
    const r = { "tienda-directa": { visitas: 2000, pedidos: 80 }, clasica: { visitas: 2000, pedidos: 20 } } as any;
    expect(factorPorRendimiento("tienda-directa", r)).toBeGreaterThan(1.2);
    expect(factorPorRendimiento("clasica", r)).toBeLessThan(0.8);
    expect(factorPorRendimiento("tienda-directa", null)).toBe(1);
    // con pocas visitas el dato propio NO pesa (es ruido)
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
    // Los modelos viejos guardados en landings ya publicadas (advertorial,
    // minimal...) ya no existen como tal: agruparPorModelo los agrupa por su
    // TEXTO tal como viene (el dato histórico), y solo "clasica" es el
    // canario del "sin modelo guardado".
    const r = agruparPorModelo([
      { design: { modelo: "advertorial" }, strategy: { metricas: { visitas: 100, pedidos: 4 } } },
      { design: { modelo: "advertorial" }, strategy: { metricas: { visitas: 50, pedidos: 1 } } },
      { design: {}, strategy: { metricas: { visitas: 30, pedidos: 0 } } },
      { design: { modelo: "tienda-directa" }, strategy: {} }, // sin métricas: no entra
    ]);
    expect(r).toEqual({ advertorial: { visitas: 150, pedidos: 5 }, clasica: { visitas: 30, pedidos: 0 } });
  });
});
