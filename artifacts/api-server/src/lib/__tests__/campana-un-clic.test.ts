/**
 * CAMPAÑA EN UN CLIC — pruebas del encadenado
 * ==========================================
 *
 * El ejecutor y el investigador se inyectan, así que esto prueba el ORDEN y las
 * decisiones sin base de datos, sin Meta, sin Chromium y sin gastar un peso.
 * Lo que fija:
 *   · que la INVESTIGACIÓN corra antes del anuncio (es lo que separa "el copy
 *     de Atlas" de "un anuncio por defecto");
 *   · que se llamen las herramientas correctas con los argumentos correctos;
 *   · que si algo falla no se invente un resultado.
 */

import { describe, test, expect } from "vitest";
import {
  generarCampana,
  type EjecutorDeAccion,
  type InvestigadorDeMercado,
  type ResultadoHerramienta,
} from "../campana-un-clic";

/** Registra las llamadas y devuelve lo que se le pida por herramienta. */
function ejecutorFalso(porHerramienta: Record<string, ResultadoHerramienta>) {
  const llamadas: { tool: string; args: any; ctx: any }[] = [];
  const ejecutar: EjecutorDeAccion = async (tool, args, ctx) => {
    llamadas.push({ tool, args, ctx });
    return porHerramienta[tool] ?? { ok: true, summary: `${tool} ok`, data: {} };
  };
  return { ejecutar, llamadas };
}

/** Investigación falsa: deja constancia de que se pidió y con qué producto. */
function investigadorFalso(r: { ok: boolean; texto?: string; motivo?: string } = { ok: true, texto: "Anuncios reales de la competencia…" }) {
  const pedidos: string[] = [];
  const investigar: InvestigadorDeMercado = async (producto) => {
    pedidos.push(producto);
    return r;
  };
  return { investigar, pedidos };
}

const ANUNCIO_OK: ResultadoHerramienta = {
  ok: true,
  summary: "✅ Anuncio creado para \"Corrector\" (id 7) — borrador 42",
  data: { draftId: 42, productId: 7, copy: { headline: "¿Te duele la espalda?", primaryText: "Corrector de postura..." } },
};

describe("generarCampana", () => {
  test("INVESTIGA antes de escribir el anuncio (es lo que lo hace como Atlas)", async () => {
    const { ejecutar, llamadas } = ejecutorFalso({ crear_anuncio: ANUNCIO_OK });
    const { investigar, pedidos } = investigadorFalso();

    const r = await generarCampana(1, { producto: "Corrector", dailyBudget: 20000 }, { ejecutar, investigar });

    expect(r.ok).toBe(true);
    expect(r.investigado).toBe(true);
    expect(pedidos).toEqual(["Corrector"]);
    expect(llamadas.map((l) => l.tool)).toEqual(["fb_suggest_audience", "crear_anuncio"]);
    expect(r.resumen).toMatch(/investigación de mercado/i);
  });

  test("conSegmentacion:false solo saltea la sugerencia, NO la investigación", async () => {
    const { ejecutar, llamadas } = ejecutorFalso({ crear_anuncio: ANUNCIO_OK });
    const { investigar, pedidos } = investigadorFalso();

    await generarCampana(1, { producto: "Corrector", dailyBudget: 20000, conSegmentacion: false }, { ejecutar, investigar });

    expect(pedidos).toEqual(["Corrector"]);
    expect(llamadas.map((l) => l.tool)).toEqual(["crear_anuncio"]);
  });

  test("conInvestigacion:false no investiga, y lo DICE en el resumen", async () => {
    const { ejecutar } = ejecutorFalso({ crear_anuncio: ANUNCIO_OK });
    const { investigar, pedidos } = investigadorFalso();

    const r = await generarCampana(
      1,
      { producto: "Corrector", dailyBudget: 20000, conInvestigacion: false },
      { ejecutar, investigar },
    );

    expect(pedidos).toEqual([]);
    expect(r.investigado).toBe(false);
    expect(r.resumen).toMatch(/Sin investigación/i);
  });

  test("si la investigación falla, el anuncio sale igual y se avisa", async () => {
    const { ejecutar, llamadas } = ejecutorFalso({ crear_anuncio: ANUNCIO_OK });
    const { investigar } = investigadorFalso({ ok: false, motivo: "la Biblioteca pidió login" });

    const r = await generarCampana(1, { producto: "Corrector", dailyBudget: 20000 }, { ejecutar, investigar });

    expect(r.ok).toBe(true);
    expect(r.investigado).toBe(false);
    // El anuncio NO se pierde por una investigación que no llegó.
    expect(llamadas.map((l) => l.tool)).toContain("crear_anuncio");
    const paso = r.pasos.find((p) => p.paso === "investigacion")!;
    expect(paso.ok).toBe(false);
    expect(paso.detalle).toMatch(/login/);
  });

  test("si la investigación revienta, no tumba el turno", async () => {
    const { ejecutar } = ejecutorFalso({ crear_anuncio: ANUNCIO_OK });
    const investigar: InvestigadorDeMercado = async () => { throw new Error("se cayó el navegador"); };

    const r = await generarCampana(1, { producto: "Corrector", dailyBudget: 20000 }, { ejecutar, investigar });

    expect(r.ok).toBe(true);
    expect(r.investigado).toBe(false);
    expect(r.pasos.find((p) => p.paso === "investigacion")!.detalle).toMatch(/navegador/);
  });

  test("la investigación va ANTES que la segmentación y el anuncio", async () => {
    const orden: string[] = [];
    const ejecutar: EjecutorDeAccion = async (tool) => {
      orden.push(tool);
      return tool === "crear_anuncio" ? ANUNCIO_OK : { ok: true, summary: "ok", data: {} };
    };
    const investigar: InvestigadorDeMercado = async () => {
      orden.push("investigar");
      return { ok: true, texto: "hallazgos" };
    };

    await generarCampana(1, { producto: "Corrector", dailyBudget: 20000 }, { ejecutar, investigar });

    expect(orden).toEqual(["investigar", "fb_suggest_audience", "crear_anuncio"]);
  });

  test("encadena segmentación y anuncio, y devuelve el borrador real", async () => {
    const { ejecutar, llamadas } = ejecutorFalso({
      fb_suggest_audience: { ok: true, summary: "Audiencia sugerida: mujeres 25-45", data: { edad: "25-45" } },
      crear_anuncio: ANUNCIO_OK,
    });
    const { investigar } = investigadorFalso();

    const r = await generarCampana(1, { producto: "Corrector", dailyBudget: 20000 }, { ejecutar, investigar });

    expect(r.ok).toBe(true);
    expect(llamadas.map((l) => l.tool)).toEqual(["fb_suggest_audience", "crear_anuncio"]);
    expect(r.draftId).toBe(42);
    expect(r.productoId).toBe(7);
    expect(r.copy?.headline).toBe("¿Te duele la espalda?");
    expect(r.resumen).toMatch(/borrador 42/);
  });

  test("le pasa el producto y el presupuesto a crear_anuncio, y el objetivo al contexto", async () => {
    const { ejecutar, llamadas } = ejecutorFalso({ crear_anuncio: ANUNCIO_OK });
    const { investigar } = investigadorFalso();

    await generarCampana(3, { producto: "Cámara", dailyBudget: 15000, objetivo: "mensajes" }, { ejecutar, investigar });

    const anuncio = llamadas.find((l) => l.tool === "crear_anuncio")!;
    expect(anuncio.args.producto).toBe("Cámara");
    expect(anuncio.args.dailyBudget).toBe(15000);
    expect(anuncio.args.objetivo).toBe("mensajes");
    expect(anuncio.ctx.tenantId).toBe(3);
    expect(anuncio.ctx.objetivoDelAdmin).toBe("mensajes");
  });

  test("sin producto no llama a NADA (ni investiga)", async () => {
    const { ejecutar, llamadas } = ejecutorFalso({});
    const { investigar, pedidos } = investigadorFalso();

    const r = await generarCampana(1, { producto: "   ", dailyBudget: 20000 }, { ejecutar, investigar });

    expect(r.ok).toBe(false);
    expect(llamadas.length).toBe(0);
    expect(pedidos.length).toBe(0);
    expect(r.resumen).toMatch(/Falta el producto/);
  });

  test("sin presupuesto no llama a NADA (no se inventa plata)", async () => {
    const { ejecutar, llamadas } = ejecutorFalso({});
    const { investigar, pedidos } = investigadorFalso();

    const r = await generarCampana(1, { producto: "Corrector", dailyBudget: 0 }, { ejecutar, investigar });

    expect(r.ok).toBe(false);
    expect(llamadas.length).toBe(0);
    expect(pedidos.length).toBe(0);
    expect(r.resumen).toMatch(/presupuesto/i);
  });

  test("si el anuncio falla, se corta con el motivo y NO se inventa un borrador", async () => {
    const { ejecutar } = ejecutorFalso({
      crear_anuncio: { ok: false, summary: "Este producto pierde plata por pedido: pausá y revisá el margen." },
    });
    const { investigar } = investigadorFalso();

    const r = await generarCampana(1, { producto: "Corrector", dailyBudget: 20000 }, { ejecutar, investigar });

    expect(r.ok).toBe(false);
    expect(r.draftId).toBeNull();
    expect(r.copy).toBeNull();
    expect(r.resumen).toMatch(/pierde plata/);
    expect(r.pasos.find((p) => p.paso === "anuncio")?.ok).toBe(false);
  });

  test("si la segmentación falla, el anuncio sale igual (es sugerencia, no requisito)", async () => {
    const { ejecutar } = ejecutorFalso({
      fb_suggest_audience: { ok: false, summary: "Meta no respondió" },
      crear_anuncio: ANUNCIO_OK,
    });
    const { investigar } = investigadorFalso();

    const r = await generarCampana(1, { producto: "Corrector", dailyBudget: 20000 }, { ejecutar, investigar });

    expect(r.ok).toBe(true);
    expect(r.pasos.find((p) => p.paso === "segmentacion")?.ok).toBe(false);
    expect(r.pasos.find((p) => p.paso === "anuncio")?.ok).toBe(true);
    expect(r.resumen).not.toMatch(/segmentación sugerida/);
  });

  test("subirAMeta solo cuando se pide explícitamente", async () => {
    const { ejecutar, llamadas } = ejecutorFalso({ crear_anuncio: ANUNCIO_OK });
    const { investigar } = investigadorFalso();
    const argsDelAnuncio = () => llamadas.find((l) => l.tool === "crear_anuncio")!.args;

    await generarCampana(1, { producto: "Corrector", dailyBudget: 20000 }, { ejecutar, investigar });
    expect(argsDelAnuncio().subirAMeta).toBe(false);

    llamadas.length = 0;
    const r = await generarCampana(1, { producto: "Corrector", dailyBudget: 20000, subirAMeta: true }, { ejecutar, investigar });
    expect(argsDelAnuncio().subirAMeta).toBe(true);
    expect(r.resumen).toMatch(/EN PAUSA/);
  });
});
