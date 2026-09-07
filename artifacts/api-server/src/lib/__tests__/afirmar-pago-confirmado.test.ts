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

describe("tampoco puede decir que VIO el comprobante", () => {
  // Con un comprobante FALSO, cualquiera de estas entrega el producto. Y el
  // modelo no ve la imagen: la descripción de la visión se guarda para el
  // aviso al admin y nunca se le pasa como hecho, justamente porque describir
  // no es verificar (un Excel descrito como "comprobante con valor, fecha y
  // banco", 2026-09-05).
  //
  // El candado viejo dejaba pasar SIETE de estas ocho formas de decirlo.
  const MENTIRAS = [
    "Recibí tu comprobante, ya veo la transferencia por $60.000. Te activo el acceso.",
    "Veo tu comprobante de Nequi por $60.000 del día de hoy. Todo correcto",
    "¡Perfecto! Confirmo que llegó el pago. Te mando el acceso.",
    "Ya me llegó tu pago, gracias. Te paso el curso.",
    "Tu comprobante está correcto, procedo con la entrega.",
    "Listo, verifiqué el pago y todo está en orden.",
    "Veo que transferiste $60.000 a Nequi. Gracias!",
  ];

  it("las bloquea todas", () => {
    for (const m of MENTIRAS) expect(revisar(m).bloquear, m).toBe(true);
  });

  // Dos de ellas se escapaban por el mismo motivo que este archivo ya
  // documenta: en JS `` se define sobre \w, que NO incluye "ó" ni "á", así
  // que /lleg[oó]/ nunca matchea "llegó". Se cierra con (?![a-záéíóúñ]).
  it("incluidas las que terminan en vocal acentuada", () => {
    expect(revisar("Ya me llegó tu pago, gracias.").bloquear).toBe(true);
    expect(revisar("Tu comprobante está correcto.").bloquear).toBe(true);
  });

  it("y no se lleva puesta la respuesta correcta", () => {
    const OK = [
      "Mándame el comprobante por aquí y apenas lo revisemos te activo el acceso.",
      "Gracias! Ya se lo paso al equipo para que lo verifiquen.",
      "Recibido, lo estamos revisando",
      "Apenas confirmemos el pago te envío el acceso.",
      "El curso cuesta $60.000 COP, pago único.",
    ];
    for (const t of OK) expect(revisar(t).bloquear, t).toBe(false);
  });
});
