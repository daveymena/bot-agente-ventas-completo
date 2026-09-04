/**
 * "Ya está pago y activado": la mentira más cara que sabe decir el bot.
 *
 * Medido el 2026-09-04 reproduciendo la conversación del admin, con el arreglo
 * de "el pago no tapa la venta" ya puesto:
 *
 *   cliente: "listo ya pagué"          -> bien: pide el comprobante
 *   cliente: "Tenés el curso de IA?"   -> "El curso de IA 2026 ya ESTÁ PAGO
 *                                         y activado."
 *
 * Nadie había verificado nada. Al dejar pasar la pregunta --que es lo correcto,
 * el bot no puede dejar de vender-- el modelo afirmó lo único que tiene
 * prohibido afirmar.
 *
 * El supervisor YA tenía la regla, y no se activó: el patrón anticipaba
 * "ya QUEDÓ pago" y no "ya ESTÁ pago". Es la misma clase de fallo que este
 * archivo documenta dos veces -- una lista de formas que no incluye la que la
 * gente usa.
 */
import { describe, it, expect } from "vitest";
import { supervisarRespuesta } from "../supervisor";

const revisar = (respuesta: string) =>
  supervisarRespuesta({
    respuesta,
    mensajeCliente: "Tenés el curso de inteligencia artificial",
    productos: [{ id: 84, name: "INTELIGENCIA ARTIFICIAL 2026", price: 60000 } as any],
    idsEnContexto: [84],
  } as any);

describe("el modelo no confirma pagos", () => {
  /** EL CASO, textual de la reproducción. */
  it("bloquea 'ya está pago y activado'", () => {
    const r = revisar("El curso de IA 2026 ya está pago y activado. Si tenés el comprobante mandámelo.");
    expect(r.bloquear).toBe(true);
    expect(r.reemplazoSugerido).toContain("comprobante");
  });

  it("bloquea las formas que ya cubría", () => {
    for (const t of ["Ya confirmé tu pago, te libero el acceso.", "Tu pago ya está confirmado.", "ya quedó pagado"]) {
      expect(revisar(t).bloquear, t).toBe(true);
    }
  });

  /** En Colombia "cancelado" y "abonado" significan pagado. */
  it("bloquea los sinónimos del rubro", () => {
    expect(revisar("Perfecto, ya está cancelado el valor del curso.").bloquear).toBe(true);
    expect(revisar("Listo, ya está abonado.").bloquear).toBe(true);
  });

  /**
   * LO QUE NO PUEDE PASAR: bloquear lo correcto. Pedir el comprobante es
   * justamente la respuesta buena, y "el curso está activo" habla del catálogo,
   * no del dinero.
   */
  it("deja pasar lo que sí se puede decir", () => {
    for (const t of [
      "Para activarte el acceso necesito el comprobante de la transferencia 🙏",
      "¿Ya pudiste hacer la transferencia?",
      "El curso está activo en el catálogo, te paso la ficha.",
    ]) {
      expect(revisar(t).bloquear, t).toBe(false);
    }
  });
});
