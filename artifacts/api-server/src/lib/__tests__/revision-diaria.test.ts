import { describe, it, expect } from "vitest";
import { decidir, redactar, accionesElegidas, type Medidas } from "../revision-diaria";

/**
 * La revisión diaria: de números reales a acciones que el servidor sabe
 * hacer, y de la respuesta del dueño ("1", "la 2", "todas") a qué ejecutar.
 * Reemplaza al aviso que decía "decime cuál querés que haga" sin que nadie
 * escuchara la respuesta.
 */
const base: Medidas = {
  dias: 7, leads: 12, ventas: 1, sinRespuesta: [], respuestasLentas: 0, peorRespuestaMin: 0,
  tibios: [], campanas: [], metaConectado: true, sugerenciasPendientes: 0, productoEstrella: { id: 172, name: "FAJA HOT TRIMMER" },
};

describe("decidir: cada hallazgo trae una acción ejecutable", () => {
  it("clientes sin respuesta → contestarles (lo primero que pierde una venta)", () => {
    const r = decidir({ ...base, sinRespuesta: [11, 12, 13] });
    expect(r.acciones[0]).toMatchObject({ n: 1, tool: "contestar_sin_respuesta", args: { conversationIds: [11, 12, 13] } });
    expect(r.estado.join(" ")).toMatch(/3 clientes escribieron y nadie les contestó/);
  });

  it("tibios de 2+ días → seguimiento", () => {
    const r = decidir({ ...base, tibios: [5, 6], campanas: [{ id: "a", nombre: "x", gasto: 1, resultados: 1, costoPorResultado: 1 }] });
    expect(r.acciones.map((a) => a.tool)).toEqual(["seguimiento_tibios"]);
  });

  it("sin campañas activas → un anuncio en borrador (no gasta)", () => {
    const r = decidir({ ...base, campanas: [] });
    expect(r.acciones.map((a) => a.tool)).toEqual(["crear_anuncio"]);
    expect(r.acciones[0].texto).toMatch(/borrador, no gasta/);
  });

  it("con campañas activas cuenta gasto y costo por resultado, y NO propone gastar", () => {
    const r = decidir({ ...base, campanas: [
      { id: "a", nombre: "Faja - mensajes", gasto: 60000, resultados: 12, costoPorResultado: 5000 },
      { id: "b", nombre: "Piano", gasto: 20000, resultados: 0, costoPorResultado: 0 },
    ] });
    const estado = r.estado.join("\n");
    expect(estado).toMatch(/2 campañas activas: \$80\.000 gastados, 12 resultados \(\$6\.667 cada uno\)/);
    expect(estado).toMatch(/Sin resultados con gasto: Piano/);
    expect(r.acciones).toEqual([]);
  });

  it("Meta desconectado se dice, no se inventa", () => {
    const r = decidir({ ...base, metaConectado: false });
    expect(r.estado.join(" ")).toMatch(/Facebook no está conectado/);
    expect(r.acciones).toEqual([]);
  });

  it("las sugerencias del agente de anuncios se mencionan, no se duplican", () => {
    const r = decidir({ ...base, sugerenciasPendientes: 2, campanas: [{ id: "a", nombre: "x", gasto: 1, resultados: 1, costoPorResultado: 1 }] });
    expect(r.estado.join(" ")).toMatch(/2 sugerencias esperando tu sí/);
    expect(r.acciones).toEqual([]);
  });

  it("las acciones van numeradas 1..N en orden de urgencia", () => {
    const r = decidir({ ...base, sinRespuesta: [1], tibios: [2], campanas: [] });
    expect(r.acciones.map((a) => [a.n, a.tool])).toEqual([[1, "contestar_sin_respuesta"], [2, "seguimiento_tibios"], [3, "crear_anuncio"]]);
  });
});

describe("redactar: el texto que lee el dueño", () => {
  it("numera y pide el número", () => {
    const t = redactar(decidir({ ...base, sinRespuesta: [1], tibios: [2] }));
    expect(t).toMatch(/1\. Contestarles ahora/);
    expect(t).toMatch(/2\. Mandarles un seguimiento/);
    expect(t).toMatch(/Respondé con el número \(o "todas"\)/);
  });
  it("sin acciones no pide nada", () => {
    expect(redactar(decidir({ ...base, campanas: [{ id: "a", nombre: "x", gasto: 1, resultados: 1, costoPorResultado: 1 }] }))).toMatch(/Nada urgente para hoy/);
  });
});

describe("accionesElegidas: solo números explícitos", () => {
  it("'1', 'la 2', 'hacé la 1 y la 3', '2,3'", () => {
    expect(accionesElegidas("1", 3)).toEqual([1]);
    expect(accionesElegidas("la 2", 3)).toEqual([2]);
    expect(accionesElegidas("hacé la 1 y la 3", 3)).toEqual([1, 3]);
    expect(accionesElegidas("2,3", 3)).toEqual([2, 3]);
    expect(accionesElegidas("todas", 3)).toEqual([1, 2, 3]);
  });

  it("un 'sí' pelado NO es para acá (es para el agente de anuncios o un comprobante)", () => {
    expect(accionesElegidas("sí", 3)).toEqual([]);
    expect(accionesElegidas("dale", 3)).toEqual([]);
    expect(accionesElegidas("aprobar 47", 3)).toEqual([]);
  });

  it("un número fuera de rango no elige nada", () => {
    expect(accionesElegidas("9", 3)).toEqual([]);
  });
});
