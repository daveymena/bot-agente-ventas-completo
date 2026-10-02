/**
 * CAMPAÑA EN UN CLIC — pruebas del encadenado
 * ==========================================
 *
 * El ejecutor se inyecta, así que esto prueba el ORDEN y las decisiones sin
 * base de datos, sin Meta y sin gastar un peso. Lo que fija:
 *   · que se llamen las herramientas correctas con los argumentos correctos;
 *   · que si el anuncio falla no se invente un borrador;
 *   · que la segmentación sea una sugerencia y no un requisito.
 */

import { describe, test, expect } from "vitest";
import { generarCampana, type EjecutorDeAccion, type ResultadoHerramienta } from "../campana-un-clic";

/** Registra las llamadas y devuelve lo que se le pida por herramienta. */
function ejecutorFalso(porHerramienta: Record<string, ResultadoHerramienta>) {
  const llamadas: { tool: string; args: any; ctx: any }[] = [];
  const ejecutar: EjecutorDeAccion = async (tool, args, ctx) => {
    llamadas.push({ tool, args, ctx });
    return porHerramienta[tool] ?? { ok: true, summary: `${tool} ok`, data: {} };
  };
  return { ejecutar, llamadas };
}

const ANUNCIO_OK: ResultadoHerramienta = {
  ok: true,
  summary: "✅ Anuncio creado para \"Corrector\" (id 7) — borrador 42",
  data: { draftId: 42, productId: 7, copy: { headline: "¿Te duele la espalda?", primaryText: "Corrector de postura..." } },
};

describe("generarCampana", () => {
  test("encadena segmentación y anuncio, y devuelve el borrador real", async () => {
    const { ejecutar, llamadas } = ejecutorFalso({
      fb_suggest_audience: { ok: true, summary: "Audiencia sugerida: mujeres 25-45", data: { edad: "25-45" } },
      crear_anuncio: ANUNCIO_OK,
    });

    const r = await generarCampana(1, { producto: "Corrector", dailyBudget: 20000 }, { ejecutar });

    expect(r.ok).toBe(true);
    expect(llamadas.map((l) => l.tool)).toEqual(["fb_suggest_audience", "crear_anuncio"]);
    expect(r.draftId).toBe(42);
    expect(r.productoId).toBe(7);
    expect(r.copy?.headline).toBe("¿Te duele la espalda?");
    expect(r.resumen).toMatch(/borrador 42/);
  });

  test("le pasa el producto y el presupuesto a crear_anuncio, y el objetivo al contexto", async () => {
    const { ejecutar, llamadas } = ejecutorFalso({ crear_anuncio: ANUNCIO_OK });

    await generarCampana(3, { producto: "Cámara", dailyBudget: 15000, objetivo: "mensajes" }, { ejecutar });

    const anuncio = llamadas.find((l) => l.tool === "crear_anuncio")!;
    expect(anuncio.args.producto).toBe("Cámara");
    expect(anuncio.args.dailyBudget).toBe(15000);
    expect(anuncio.args.objetivo).toBe("mensajes");
    expect(anuncio.ctx.tenantId).toBe(3);
    // El objetivo también viaja en el contexto: es la red que ya existe para
    // que el destino no dependa de que el modelo se acuerde.
    expect(anuncio.ctx.objetivoDelAdmin).toBe("mensajes");
  });

  test("sin producto no llama a ninguna herramienta", async () => {
    const { ejecutar, llamadas } = ejecutorFalso({});

    const r = await generarCampana(1, { producto: "   ", dailyBudget: 20000 }, { ejecutar });

    expect(r.ok).toBe(false);
    expect(llamadas.length).toBe(0);
    expect(r.resumen).toMatch(/Falta el producto/);
  });

  test("sin presupuesto no llama a ninguna herramienta (no se inventa plata)", async () => {
    const { ejecutar, llamadas } = ejecutorFalso({});

    const r = await generarCampana(1, { producto: "Corrector", dailyBudget: 0 }, { ejecutar });

    expect(r.ok).toBe(false);
    expect(llamadas.length).toBe(0);
    expect(r.resumen).toMatch(/presupuesto/i);
  });

  test("si el anuncio falla, se corta con el motivo y NO se inventa un borrador", async () => {
    const { ejecutar, llamadas } = ejecutorFalso({
      crear_anuncio: { ok: false, summary: "Este producto pierde plata por pedido: pausá y revisá el margen." },
    });

    const r = await generarCampana(1, { producto: "Corrector", dailyBudget: 20000 }, { ejecutar });

    expect(r.ok).toBe(false);
    expect(r.draftId).toBeNull();
    expect(r.copy).toBeNull();
    expect(r.resumen).toMatch(/pierde plata/);
    // El paso quedó registrado con su motivo, para que el panel lo muestre.
    expect(r.pasos.find((p) => p.paso === "anuncio")?.ok).toBe(false);
    expect(llamadas.map((l) => l.tool)).not.toContain("landing_crear");
  });

  test("si la segmentación falla, el anuncio sale igual (es sugerencia, no requisito)", async () => {
    const { ejecutar } = ejecutorFalso({
      fb_suggest_audience: { ok: false, summary: "Meta no respondió" },
      crear_anuncio: ANUNCIO_OK,
    });

    const r = await generarCampana(1, { producto: "Corrector", dailyBudget: 20000 }, { ejecutar });

    expect(r.ok).toBe(true);
    expect(r.pasos.find((p) => p.paso === "segmentacion")?.ok).toBe(false);
    expect(r.pasos.find((p) => p.paso === "anuncio")?.ok).toBe(true);
    expect(r.resumen).not.toMatch(/segmentación sugerida/);
  });

  test("conSegmentacion:false no llama a fb_suggest_audience", async () => {
    const { ejecutar, llamadas } = ejecutorFalso({ crear_anuncio: ANUNCIO_OK });

    await generarCampana(1, { producto: "Corrector", dailyBudget: 20000, conSegmentacion: false }, { ejecutar });

    expect(llamadas.map((l) => l.tool)).toEqual(["crear_anuncio"]);
  });

  test("subirAMeta solo cuando se pide explícitamente", async () => {
    const { ejecutar, llamadas } = ejecutorFalso({ crear_anuncio: ANUNCIO_OK });
    const argsDelAnuncio = () => llamadas.find((l) => l.tool === "crear_anuncio")!.args;

    await generarCampana(1, { producto: "Corrector", dailyBudget: 20000 }, { ejecutar });
    expect(argsDelAnuncio().subirAMeta).toBe(false);

    llamadas.length = 0;
    const r = await generarCampana(1, { producto: "Corrector", dailyBudget: 20000, subirAMeta: true }, { ejecutar });
    expect(argsDelAnuncio().subirAMeta).toBe(true);
    expect(r.resumen).toMatch(/EN PAUSA/);
  });
});
