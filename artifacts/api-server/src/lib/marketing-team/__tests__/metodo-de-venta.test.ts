import { describe, expect, it } from "vitest";
import {
  METODO, NO_SE_HACE, TEMAS, diagnosticarEmbudo, normalizarTema, precioDeVenta, textoDelTema,
} from "../metodo-de-venta";

describe("precioDeVenta (la calculadora del capítulo 11)", () => {
  it("reproduce el ejemplo del curso: producto de 10 se vende a ~34 y deja ~7", () => {
    // Ecuador, en dólares: producto 10, flete 7, CPA en el administrador 4,5,
    // 70% entregado de lo despachado y 10% cancelado, margen 20%.
    const p = precioDeVenta({ costoProducto: 10, fleteBase: 7, cpaObjetivo: 4.5, entregaPct: 70, canceladosPct: 10, margenPct: 20 });
    expect(p.fleteConDevoluciones).toBe(10);
    expect(p.precioSugerido).toBeGreaterThanOrEqual(33);
    expect(p.precioSugerido).toBeLessThanOrEqual(35);
    expect(p.gananciaPorEntregado).toBeGreaterThanOrEqual(6);
    expect(p.gananciaPorEntregado).toBeLessThanOrEqual(8);
  });

  it("el punto de equilibrio queda por encima del CPA presupuestado (ahí está la ganancia)", () => {
    const p = precioDeVenta({ costoProducto: 25000, fleteBase: 19000, cpaObjetivo: 15000 });
    expect(p.cpaPuntoEquilibrio).toBeGreaterThan(15000);
    expect(p.pedidosParaEntregarDiez).toBeGreaterThan(10);
  });

  it("un digital sin flete no inventa flete ni seguro de devoluciones", () => {
    const p = precioDeVenta({ costoProducto: 0, fleteBase: 0, cpaObjetivo: 8000, entregaPct: 100, canceladosPct: 0 });
    expect(p.fleteConDevoluciones).toBe(0);
    expect(p.cpaCosteado).toBe(8000);
    expect(p.precioSugerido).toBe(10000);
  });
});

describe("diagnosticarEmbudo, con los números reales de la cuenta (01-10-2026)", () => {
  it("59 conversaciones de WhatsApp y ninguna venta: la fuga está en el chat, no en el anuncio", () => {
    const h = diagnosticarEmbudo({ gasto: 75669, conversaciones: 59, ventas: 0 });
    const chat = h.find((x) => x.etapa === "chat");
    expect(chat).toBeTruthy();
    expect(chat!.accion).toMatch(/no subir presupuesto/i);
  });

  it("curso de IA a la web: 22 clics y 5 visitas → la página no carga a tiempo", () => {
    const h = diagnosticarEmbudo({ gasto: 10497, impresiones: 521, clics: 22, visitas: 5, ventas: 0 });
    expect(h.some((x) => x.etapa === "clic" && /23%/.test(x.lectura))).toBe(true);
  });

  it("92 clics a 15 pesos con CTR 7% y ninguna conversación: clics de baja calidad", () => {
    const h = diagnosticarEmbudo({ gasto: 1380, impresiones: 1292, clics: 92, conversaciones: 0, ventas: 0 });
    expect(h.some((x) => x.etapa === "clic" && /baja calidad/.test(x.lectura))).toBe(true);
  });

  it("con pocas visitas no juzga la página todavía", () => {
    const h = diagnosticarEmbudo({ gasto: 5000, visitas: 16, ventas: 0 });
    expect(h.some((x) => x.etapa === "muestra")).toBe(true);
    expect(h.some((x) => x.etapa === "pagina")).toBe(false);
  });

  it("CPA bajo el punto de equilibrio → rentable; por encima → come ganancia", () => {
    const bien = diagnosticarEmbudo({ gasto: 60000, visitas: 400, ventas: 6, puntoEquilibrio: 15000 });
    expect(bien.find((x) => x.etapa === "rentabilidad")!.accion).toMatch(/escalar 20%/);
    const mal = diagnosticarEmbudo({ gasto: 60000, visitas: 400, ventas: 2, puntoEquilibrio: 15000 });
    expect(mal.find((x) => x.etapa === "rentabilidad")!.lectura).toMatch(/por encima/);
  });

  it("el doble del punto de equilibrio sin ventas → cortar", () => {
    const h = diagnosticarEmbudo({ gasto: 40000, visitas: 60, ventas: 0, puntoEquilibrio: 15000 });
    expect(h.some((x) => x.etapa === "rentabilidad" && /cortar/i.test(x.accion))).toBe(true);
  });
});

describe("el método que lee Atlas", () => {
  it("cada regla dice de dónde sale", () => {
    for (const t of Object.values(METODO)) {
      for (const r of t.reglas) {
        expect(["autor", "verificado", "hipotesis"]).toContain(r.fuente);
        expect(r.texto.length).toBeGreaterThan(20);
      }
    }
  });

  it("cada tema entra en un resultado de herramienta sin reventar el tope de Groq", () => {
    for (const t of TEMAS) {
      // ~4 caracteres por token: 4.000 caracteres son ~1.000 tokens.
      expect(textoDelTema(t).length, t).toBeLessThan(4000);
    }
  });

  it("lo que no se hace está escrito y no se cuela como regla", () => {
    expect(NO_SE_HACE.join(" ")).toMatch(/perfiles prestados/);
    expect(NO_SE_HACE.join(" ")).toMatch(/reseñas/);
    const todo = Object.values(METODO).flatMap((t) => t.reglas.map((r) => r.texto)).join(" ");
    expect(todo).not.toMatch(/cuentas infinitas|perfil(es)? prestad|compra(r)? perfiles/i);
  });

  it("la señal de compra se marca como verificada: un Purchase sin pago contamina", () => {
    const pauta = METODO.pauta.reglas.find((r) => /señal de COMPRA/.test(r.texto));
    expect(pauta?.fuente).toBe("verificado");
  });

  it("entiende el tema como lo diría el admin", () => {
    expect(normalizarTema("¿cómo costeo?")).toBe("costeo");
    expect(normalizarTema("Creativos")).toBe("creativos");
    expect(normalizarTema("la página de ventas")).toBe("landing");
    expect(normalizarTema("cpa")).toBe("metricas");
    expect(normalizarTema("")).toBeNull();
  });
});
