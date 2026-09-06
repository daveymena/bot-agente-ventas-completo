import { describe, it, expect } from "vitest";
import {
  normalizarComprobante,
  extraerJsonDelComprobante,
  cotejarComprobante,
  nombreSeParece,
  bloqueDeLectura,
} from "../leer-comprobante";

/**
 * El requisito del admin, el 2026-09-06, en dos frases que son la misma:
 *
 *   "el bot debería poder ver la fecha, el monto, y si la transferencia dice
 *    mi nombre y mis datos, ya que tiene una IA de visión"
 *   "además echa mentira diciendo que los datos son tales cuando ni siquiera
 *    los lee"
 *
 * O sea: que lea, y que NUNCA afirme lo que no leyó. Estas pruebas cuidan lo
 * segundo, que es lo que cuesta plata.
 */

const CUENTAS = [
  { type: "Nequi", number: "3136174267", name: "Duvier Mena" },
  { type: "Daviplata", number: "3136174267", name: "Duvier Mena" },
];

describe("Nada que no se haya leído se da por leído", () => {
  it("un campo ausente queda en null y se anota como no leído", () => {
    const r = normalizarComprobante({ esComprobante: true, monto: 60000 });
    expect(r!.monto).toBe(60000);
    expect(r!.fecha).toBe(null);
    expect(r!.noSeLeyo).toContain("fecha");
    expect(r!.noSeLeyo).toContain("destinatario");
  });

  it("las respuestas de relleno del modelo cuentan como NO leído", () => {
    for (const basura of ["null", "N/A", "no se lee", "desconocido", "-", "  "]) {
      const r = normalizarComprobante({ esComprobante: true, destinatario: basura });
      expect(r!.destinatario, basura).toBe(null);
    }
  });

  it("si no es un comprobante, NINGÚN otro campo se sostiene", () => {
    // Un modelo que ya se equivocó de tipo de imagen no es fuente para el monto.
    const r = normalizarComprobante({
      esComprobante: false, monto: 60000, fecha: "05/09/2026", destinatario: "Duvier Mena",
    });
    expect(r!.monto).toBe(null);
    expect(r!.fecha).toBe(null);
    expect(r!.destinatario).toBe(null);
  });

  it("un monto con símbolos y separadores se lee como número", () => {
    expect(normalizarComprobante({ esComprobante: true, monto: "$ 60.000" })!.monto).toBe(60000);
    expect(normalizarComprobante({ esComprobante: true, monto: 0 })!.monto).toBe(null);
  });

  it("el JSON se saca aunque venga envuelto", () => {
    expect(extraerJsonDelComprobante('```json\n{"esComprobante":true}\n```')?.esComprobante).toBe(true);
    expect(extraerJsonDelComprobante("no hay json acá")).toBe(null);
  });
});

describe("El cotejo lo hace el servidor, no el modelo", () => {
  it("cuando la visión no respondió, lo dice — no da los campos por vacíos", () => {
    const c = cotejarComprobante(null, { cuentas: CUENTAS, monto: 60000 });
    expect(c).toHaveLength(1);
    expect(c[0]!.marca).toBe("❔");
    expect(c[0]!.linea).toMatch(/no se pudo leer/i);
  });

  it("una imagen que no es comprobante se marca, y no se inventa nada más", () => {
    const leido = normalizarComprobante({ esComprobante: false });
    const c = cotejarComprobante(leido, { cuentas: CUENTAS, monto: 60000 });
    expect(c).toHaveLength(1);
    expect(c[0]!.marca).toBe("⚠️");
  });

  it("todo cuadra: cuenta, titular y monto", () => {
    const leido = normalizarComprobante({
      esComprobante: true, cuentaDestino: "3136174267", destinatario: "DUVIER MENA",
      monto: 60000, fecha: "05/09/2026",
    });
    const c = cotejarComprobante(leido, { cuentas: CUENTAS, monto: 60000 });
    expect(c.filter((x) => x.marca === "⚠️")).toHaveLength(0);
  });

  it("cuenta ajena: se avisa, es lo que evita entregar sin cobrar", () => {
    const leido = normalizarComprobante({
      esComprobante: true, cuentaDestino: "3009998877", destinatario: "Otro Nombre", monto: 60000,
    });
    const c = cotejarComprobante(leido, { cuentas: CUENTAS, monto: 60000 });
    const alertas = c.filter((x) => x.marca === "⚠️").map((x) => x.linea).join(" | ");
    expect(alertas).toMatch(/NO es ninguna de las tuyas/);
    expect(alertas).toMatch(/no coincide con el titular/);
  });

  it("monto que no alcanza: dice cuánto falta", () => {
    const leido = normalizarComprobante({ esComprobante: true, monto: 40000, cuentaDestino: "3136174267" });
    const c = cotejarComprobante(leido, { cuentas: CUENTAS, monto: 60000 });
    expect(c.find((x) => /faltan/.test(x.linea))?.linea).toMatch(/\$20\.000/);
  });

  it("sin precio de referencia NO se afirma que el monto está bien", () => {
    const leido = normalizarComprobante({ esComprobante: true, monto: 60000 });
    const c = cotejarComprobante(leido, { cuentas: CUENTAS, monto: null });
    expect(c.find((x) => /Monto/.test(x.linea))!.marca).toBe("❔");
  });

  it("sin cuentas cargadas NO se afirma que la cuenta es la suya", () => {
    const leido = normalizarComprobante({ esComprobante: true, cuentaDestino: "3136174267" });
    const c = cotejarComprobante(leido, { cuentas: [], monto: 60000 });
    expect(c.find((x) => /Cuenta de destino/.test(x.linea))!.marca).toBe("❔");
  });
});

describe("El nombre del titular se compara con tolerancia, pero no con ingenuidad", () => {
  it("mayúsculas, tildes y orden distinto", () => {
    expect(nombreSeParece("DUVIER MENA", "Duvier Mena")).toBe(true);
    expect(nombreSeParece("Mena Duvier", "Duvier Mena")).toBe(true);
    expect(nombreSeParece("Duvier Mena Rodríguez", "Duvier Mena")).toBe(true);
  });

  it("otra persona no pasa", () => {
    expect(nombreSeParece("Carlos Pérez", "Duvier Mena")).toBe(false);
    expect(nombreSeParece("Duvier Restrepo", "Duvier Mena")).toBe(false);
  });

  it("vacío no se parece a nada", () => {
    expect(nombreSeParece(null, "Duvier Mena")).toBe(false);
    expect(nombreSeParece("Duvier Mena", null)).toBe(false);
  });
});

describe("El bloque que ve el admin", () => {
  it("cuenta cuántas cosas no cuadran", () => {
    const leido = normalizarComprobante({
      esComprobante: true, cuentaDestino: "3009998877", destinatario: "Otro", monto: 40000,
    });
    const texto = bloqueDeLectura(cotejarComprobante(leido, { cuentas: CUENTAS, monto: 60000 }));
    expect(texto).toMatch(/3 cosas que no cuadran/);
  });

  it("y cuando todo cuadra no alarma", () => {
    const leido = normalizarComprobante({
      esComprobante: true, cuentaDestino: "3136174267", destinatario: "Duvier Mena",
      monto: 60000, fecha: "05/09/2026",
    });
    const texto = bloqueDeLectura(cotejarComprobante(leido, { cuentas: CUENTAS, monto: 60000 }));
    expect(texto).toMatch(/LO QUE LEÍ/);
    expect(texto).not.toMatch(/no cuadra/);
  });
});
