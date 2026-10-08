/**
 * Cómo termina un turno de Atlas, contra los tres turnos REALES del
 * 07-10-2026 (02:42–02:44 UTC) sobre la landing 1. Ver
 * lib/atlas-cierre-del-turno.ts.
 */
import { describe, it, expect } from "vitest";
import {
  anotarTrabajoReal, contarTurnoDeSesion, trabajoRealReciente, debeAvisarQueNoEjecuto,
  debePedirLaPropuesta, pedidoDePropuesta, unSoloCierre, terminaEnPregunta, medirRespuesta,
  MARGEN_PARA_PEDIR_PROPUESTA_MS, type SituacionDelCierre,
} from "../atlas-cierre-del-turno";
import { afirmaHaberloHecho } from "../afirma-haberlo-hecho";
import { resumirTurnos } from "../diagnostico-de-turnos";

/** Lo que el modelo contó después de que la edición aprobada terminó en segundo plano. */
const CUENTA_LO_HECHO = "✅ La landing 1 quedó actualizada con el título nuevo. Ya podés verla en la URL de siempre.";
/** El tercer turno: pide confirmar algo que nunca propuso. */
const PREGUNTA_SIN_PLAN = "⚠️ La actualización todavía no se ejecutó.\n\n¿Confirmás que actualice la landing 1 con el título nuevo?";

let sesion = 0;
const nuevaSesion = () => `s-test-${Date.now()}-${++sesion}`;

describe("el candado de 'ya lo hice' sabe lo que se ejecutó de verdad (casos 1 y 2)", () => {
  it("el texto real SÍ afirma algo hecho (por eso saltaba el candado)", () => {
    expect(afirmaHaberloHecho(CUENTA_LO_HECHO)).toBe(true);
  });

  it("con la edición aprobada en el turno anterior, NO se desmiente al modelo", () => {
    const s = nuevaSesion();
    anotarTrabajoReal(1, s, ["landing_forge_editar"]);
    contarTurnoDeSesion(1, s); // el turno siguiente arranca
    expect(debeAvisarQueNoEjecuto(afirmaHaberloHecho(CUENTA_LO_HECHO), trabajoRealReciente(1, s))).toBe(false);
  });

  it("sigue sin desmentirlo en el segundo turno seguido (el log lo mostró dos veces)", () => {
    const s = nuevaSesion();
    anotarTrabajoReal(1, s, ["landing_forge_editar"]);
    contarTurnoDeSesion(1, s);
    contarTurnoDeSesion(1, s);
    expect(trabajoRealReciente(1, s)).toContain("landing_forge_editar");
  });

  it("sin nada ejecutado, el candado sigue funcionando como siempre", () => {
    const s = nuevaSesion();
    expect(debeAvisarQueNoEjecuto(afirmaHaberloHecho("✅ Borrador 89 subido a Meta en pausa"), trabajoRealReciente(1, s))).toBe(true);
  });

  it("lo ejecutado no excusa para siempre: después de 3 turnos vuelve a avisar", () => {
    const s = nuevaSesion();
    anotarTrabajoReal(1, s, ["landing_forge_editar"]);
    for (let i = 0; i < 4; i++) contarTurnoDeSesion(1, s);
    expect(trabajoRealReciente(1, s)).toEqual([]);
  });

  it("no se mezcla entre sesiones ni entre negocios", () => {
    const s = nuevaSesion();
    anotarTrabajoReal(1, s, ["landing_publicar"]);
    expect(trabajoRealReciente(2, s)).toEqual([]);
    expect(trabajoRealReciente(1, nuevaSesion())).toEqual([]);
  });

  it("un plan que falló entero no anota nada", () => {
    const s = nuevaSesion();
    anotarTrabajoReal(1, s, []);
    expect(trabajoRealReciente(1, s)).toEqual([]);
  });
});

const base: SituacionDelCierre = {
  plan: 0,
  textoFinal: PREGUNTA_SIN_PLAN,
  pideUnDato: false,
  avisarQueNoEjecuto: false,
  yaSeInsistio: false,
  enRutaGuiada: false,
  quedaMs: 60_000,
};

describe("una pregunta de confirmación sin plan se convierte en propuesta (caso 1)", () => {
  it("el turno real del 07-10 dispara el pedido de propuesta", () => {
    expect(terminaEnPregunta(PREGUNTA_SIN_PLAN)).toBe(true);
    expect(debePedirLaPropuesta(base)).toBe(true);
  });

  it("también cuando dice que lo hizo y no hay plan", () => {
    expect(debePedirLaPropuesta({ ...base, textoFinal: "✅ Precio actualizado a $60.000.", avisarQueNoEjecuto: true })).toBe(true);
  });

  it("con plan ya propuesto no hace falta", () => {
    expect(debePedirLaPropuesta({ ...base, plan: 1 })).toBe(false);
  });

  it("una pregunta por un DATO (cuál producto, cuánto) no es una confirmación", () => {
    expect(debePedirLaPropuesta({ ...base, textoFinal: "¿Para cuál producto querés la landing?", pideUnDato: true })).toBe(false);
  });

  it("en la ruta guiada la pregunta de sí/no es el diseño: no se toca", () => {
    expect(debePedirLaPropuesta({ ...base, enRutaGuiada: true })).toBe(false);
  });

  it("no se insiste dos veces en el mismo turno", () => {
    expect(debePedirLaPropuesta({ ...base, yaSeInsistio: true })).toBe(false);
  });

  it("sin tiempo para otra vuelta no se arriesga el corte del proxy", () => {
    expect(debePedirLaPropuesta({ ...base, quedaMs: MARGEN_PARA_PEDIR_PROPUESTA_MS - 1 })).toBe(false);
  });

  it("una respuesta que termina en afirmación no dispara nada", () => {
    expect(debePedirLaPropuesta({ ...base, textoFinal: "Tenés 3 landings publicadas y 1 en borrador." })).toBe(false);
  });

  it("el pedido al modelo nombra propose_action y deja la salida 'OK' si no era un cambio", () => {
    const t = pedidoDePropuesta({ avisarQueNoEjecuto: false });
    expect(t).toMatch(/propose_action/);
    expect(t).toMatch(/OK/);
    expect(pedidoDePropuesta({ avisarQueNoEjecuto: true })).toMatch(/da por hecho/);
  });
});

describe("con plan, una sola pregunta de cierre (caso 3)", () => {
  it("se quita el '¿Confirmás…?' del modelo: la pregunta la pone el servidor", () => {
    const t = "Te dejo listo el cambio del título de la landing 1.\n\n¿Confirmás que la actualice?";
    expect(unSoloCierre(t)).toBe("Te dejo listo el cambio del título de la landing 1.");
  });

  it("también con emoji después del signo", () => {
    expect(unSoloCierre("Listo el borrador.\n¿Lo subo? 🚀")).toBe("Listo el borrador.");
  });

  it("una pregunta en el medio del texto no se toca", () => {
    const t = "¿Por qué no vende? Porque no tiene precio.\n\nTe propongo cargarle $60.000.";
    expect(unSoloCierre(t)).toBe(t);
  });

  it("un párrafo largo que termina en pregunta no se corta", () => {
    const largo = "Esto ".repeat(60) + "¿sí?";
    expect(unSoloCierre(largo)).toBe(largo);
  });
});

describe("la forma de la respuesta queda medida", () => {
  it("cuenta líneas, preguntas y caracteres", () => {
    const t = "Hola.\n\n¿Seguimos? ¿O paramos?";
    expect(medirRespuesta(t)).toEqual({ lineas: 2, preguntas: 2, caracteres: t.length });
  });

  it("el resumen del diagnóstico lo muestra", () => {
    const r = resumirTurnos([
      { estado: "completo", totalMs: 4000, tramos: [], forma: { lineas: 4, preguntas: 1, caracteres: 200 } },
      { estado: "plan", totalMs: 6000, tramos: [], forma: { lineas: 10, preguntas: 2, caracteres: 600 } },
    ]);
    expect(r).toMatch(/7\.0 líneas en promedio, 1 de 2 con más de una pregunta/);
  });
});
