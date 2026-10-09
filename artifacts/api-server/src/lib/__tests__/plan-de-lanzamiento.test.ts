/**
 * "Armame un plan para lanzar X" devuelve un plan EJECUTABLE: pasos con
 * estado real y las acciones listas para una sola confirmación. Ver
 * lib/plan-de-lanzamiento.ts.
 */
import { describe, it, expect } from "vitest";
import { armarPlanDeLanzamiento, planEnTexto, elegirProducto, type HechosDeLanzamiento } from "../plan-de-lanzamiento";
import { READ_ONLY_TOOLS, TOOLS, ATLAS_NUCLEO } from "../app-operator";
import { buildMcpToolRegistry } from "../opencode-mcp-tools";

const producto = { id: 168, nombre: "Masajeador Cervical 8 Nodos", precio: 89_900, moneda: "COP", tieneFoto: true, esDropi: true };
const nada: HechosDeLanzamiento = {
  producto, landing: null, paqueteListo: false, facebookConectado: false, presupuestoDiario: null,
};

const ACTIVAR = ["fb_resume_campaign", "fb_make_campaign_deliver", "fb_set_ad_status", "fb_set_budget"];

describe("plan desde cero", () => {
  const plan = armarPlanDeLanzamiento(nada);

  it("deja lista UNA acción que arma landing + copies + borrador", () => {
    expect(plan.accionesParaProponer).toEqual([{ tool: "lanzar_producto", args: { productId: 168 } }]);
  });

  it("sin Facebook ni presupuesto, eso queda como decisión del dueño, no se inventa", () => {
    const decide = plan.pasos.filter((p) => p.estado === "decide").map((p) => p.que);
    expect(decide).toEqual(expect.arrayContaining(["Presupuesto de la prueba", "Subir el anuncio a Meta en pausa", "Encender la campaña"]));
  });

  it("con producto de Dropi sugiere leer el margen en el mismo turno", () => {
    expect(plan.lecturasSugeridas).toContainEqual({ tool: "dropi_margen", args: { productId: 168 } });
  });

  it("el texto es un paso por línea con su estado", () => {
    const t = planEnTexto(producto.nombre, plan);
    expect(t.split("\n").filter((l) => /^(✅|🚀|🙋|⏳) \d+\./u.test(l)).length).toBe(plan.pasos.length);
    expect(t).not.toMatch(/\?/); // nada que frene el plan con una pregunta
  });
});

describe("plan con lo que ya existe", () => {
  it("con Facebook y presupuesto, el paquete sube el anuncio EN PAUSA", () => {
    const plan = armarPlanDeLanzamiento({ ...nada, facebookConectado: true, presupuestoDiario: 20_000 });
    expect(plan.accionesParaProponer).toEqual([
      { tool: "lanzar_producto", args: { productId: 168, presupuestoDiario: 20_000, conAnuncio: true } },
    ]);
  });

  it("paquete hecho y landing en borrador: solo publicar la landing", () => {
    const plan = armarPlanDeLanzamiento({ ...nada, paqueteListo: true, landing: { id: 12, publicada: false } });
    expect(plan.accionesParaProponer).toEqual([{ tool: "landing_publicar", args: { id: 12 } }]);
  });

  it("paquete hecho, Facebook y presupuesto: sube el borrador que existe", () => {
    const plan = armarPlanDeLanzamiento({
      ...nada, paqueteListo: true, landing: { id: 12, publicada: true, url: "https://x/l/m" },
      facebookConectado: true, presupuestoDiario: 20_000, borradorSinSubir: 91,
    });
    expect(plan.accionesParaProponer).toEqual([{ tool: "fb_upload_draft_to_meta", args: { draftId: 91 } }]);
    expect(plan.pasos.find((p) => p.que === "Página de venta")?.estado).toBe("hecho");
  });

  it("sin foto ni precio no propone nada: primero la ficha", () => {
    const plan = armarPlanDeLanzamiento({ ...nada, producto: { ...producto, precio: 0, tieneFoto: false } });
    expect(plan.accionesParaProponer).toEqual([]);
    expect(plan.pasos[0]).toMatchObject({ estado: "decide", detalle: expect.stringMatching(/precio y foto/) });
  });

  it("NUNCA propone encender la pauta, en ninguna combinación", () => {
    for (const fb of [true, false]) for (const paq of [true, false]) for (const pres of [null, 20_000]) {
      const plan = armarPlanDeLanzamiento({ ...nada, facebookConectado: fb, paqueteListo: paq, presupuestoDiario: pres, borradorSinSubir: 5 });
      expect(plan.accionesParaProponer.some((a) => ACTIVAR.includes(a.tool))).toBe(false);
    }
  });

  it("cada acción que propone existe y es de CAMBIO (va por propose_action)", () => {
    const nombres = new Set(TOOLS.map((t) => t.name));
    const plan = armarPlanDeLanzamiento({ ...nada, paqueteListo: true, landing: { id: 1, publicada: false }, facebookConectado: true, presupuestoDiario: 1, borradorSinSubir: 2 });
    for (const a of [...plan.accionesParaProponer, ...armarPlanDeLanzamiento(nada).accionesParaProponer]) {
      expect(nombres.has(a.tool), a.tool).toBe(true);
      expect(READ_ONLY_TOOLS.has(a.tool), a.tool).toBe(false);
    }
    for (const l of armarPlanDeLanzamiento(nada).lecturasSugeridas) expect(READ_ONLY_TOOLS.has(l.tool), l.tool).toBe(true);
  });
});

describe("ubicar el producto del que habla", () => {
  const lista = [
    { id: 1, name: "Masajeador Cervical 8 Nodos" },
    { id: 2, name: "Curso de Piano Completo" },
    { id: 3, name: "Curso de Inglés" },
  ];
  it("por palabras compartidas", () => {
    expect(elegirProducto(lista, "el masajeador").elegido?.id).toBe(1);
  });
  it("con empate no elige por el admin", () => {
    const r = elegirProducto(lista, "el curso");
    expect(r.elegido).toBeNull();
    expect(r.candidatos.map((c) => c.id)).toEqual([2, 3]);
  });
  it("sin coincidencias, nada", () => {
    expect(elegirProducto(lista, "zapatos").elegido).toBeNull();
  });
});

describe("Atlas lo tiene a mano", () => {
  it("es de lectura (no pide permiso para armar el plan)", () => {
    expect(READ_ONLY_TOOLS.has("plan_de_lanzamiento")).toBe(true);
    expect(READ_ONLY_TOOLS.has("lanzamiento_estado")).toBe(true);
  });

  it("viaja en el turno cuando el admin pide un plan", () => {
    const nombres = buildMcpToolRegistry("armame un plan para lanzar el masajeador").map((t) => t.name);
    expect(nombres).toContain("plan_de_lanzamiento");
    expect(nombres).toContain("propose_action");
  });

  it("el prompt le dice que lo entregue ejecutable", () => {
    expect(ATLAS_NUCLEO).toMatch(/plan_de_lanzamiento/);
  });
});
