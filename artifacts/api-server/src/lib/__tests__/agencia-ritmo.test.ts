import { describe, it, expect, beforeEach } from "vitest";
import {
  TIPO_DIAGNOSTICO,
  TIPO_PLAN_SEMANAL,
  registrarAgencia,
  accionesDelDiagnostico,
} from "../agencia-ritmo";
import { tiposRegistrados, _limpiarManejadores } from "../programador";

/**
 * El equipo de marketing tiene catorce especialistas que ya funcionan, y hasta
 * ahora solo trabajaban cuando el admin abría el chat y preguntaba. Esto le
 * pone el reloj.
 *
 * Lo que se prueba acá es lo que se puede probar sin red: que el ritmo esté
 * ENGANCHADO (el error que este proyecto ya cometió con cuatro de esos
 * agentes) y que la lectura del diagnóstico no dependa de adivinar nombres de
 * campo.
 */
describe("el ritmo de la agencia está enganchado", () => {
  beforeEach(() => _limpiarManejadores());

  it("el programador sabe quién atiende cada trabajo", () => {
    registrarAgencia();
    expect(tiposRegistrados()).toContain(TIPO_DIAGNOSTICO);
    expect(tiposRegistrados()).toContain(TIPO_PLAN_SEMANAL);
  });

  it("registrar dos veces no rompe nada", () => {
    registrarAgencia();
    registrarAgencia();
    expect(tiposRegistrados().filter((t) => t === TIPO_DIAGNOSTICO)).toHaveLength(1);
  });
});

describe("qué se reporta del diagnóstico", () => {
  it("lee las acciones sin depender del nombre del campo", () => {
    // `accionesInmediatas` es como se llama hoy. Si mañana el equipo devuelve
    // `derivaciones` o `recomendaciones`, se sigue leyendo igual: este
    // proyecto ya se quemó tres veces enumerando campos de a uno.
    const r = {
      diagnostic: {
        data: {
          conclusion: "el costo por venta subió",
          accionesInmediatas: [{ accion: "pausar el conjunto B" }],
          derivaciones: ["revisar el copy del anuncio 3"],
        },
      },
    };
    const a = accionesDelDiagnostico(r);
    expect(a).toContain("pausar el conjunto B");
    expect(a).toContain("revisar el copy del anuncio 3");
  });

  it("sin acciones no hay nada que avisar", () => {
    expect(accionesDelDiagnostico({ diagnostic: { data: { conclusion: "todo estable" } } })).toEqual([]);
    expect(accionesDelDiagnostico({})).toEqual([]);
    expect(accionesDelDiagnostico(null)).toEqual([]);
  });

  it("ignora entradas vacías en vez de mandar viñetas en blanco", () => {
    const r = { data: { acciones: ["", "   ", { accion: "" }, "subir presupuesto 20%"] } };
    expect(accionesDelDiagnostico(r)).toEqual(["subir presupuesto 20%"]);
  });
});
