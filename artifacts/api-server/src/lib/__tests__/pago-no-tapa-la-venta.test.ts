/**
 * EL BOT DEJÓ DE VENDER: contestaba "¿ya hiciste la transferencia?" a todo.
 *
 * Conversación real que trajo el admin (4-09-2026):
 *
 *   03/09 20:03  cliente: "ya pagué"
 *   04/09 03:41  cliente: "Hola"
 *   04/09 03:41  cliente: "¿Tenés el curso de inteligencia artificial?"
 *                bot:     "...¿Ya pudiste hacer la transferencia? Apenas me
 *                          pases el comprobante te activo el acceso."
 *   04/09 07:13  cliente: "Contame, ¿tenés curso de diseño gráfico?"
 *                bot:     "...¿Ya pudiste hacer la transferencia?"
 *
 * A cada pregunta le pedía plata. El "ya pagué" tenía SIETE HORAS Y MEDIA, y le
 * pedía el comprobante de una compra a alguien que preguntaba por OTRO
 * producto. El admin lo resumió: "el WhatsApp cada vez peor".
 *
 * ── Dos defectos, no uno ─────────────────────────────────────────────────
 *
 * 1. La caducidad existía pero se apoyaba en `sesionNueva`, que se calcula
 *    entre los DOS ÚLTIMOS mensajes. En cuanto el cliente escribe el segundo
 *    mensaje de la visita nueva vuelve a ser false, y la etapa de pago
 *    resucita. Por eso el "Hola" salió bien y la pregunta siguiente no.
 *    Ahora la vigencia mira CUÁNDO SE DIJO el "ya pagué".
 *
 * 2. Y aunque el pago esté vigente, una PREGUNTA se contesta. La regla dura
 *    --no entregar nada sin comprobante-- se queda; lo que no puede es tapar
 *    la conversación entera.
 */
import { describe, it, expect } from "vitest";
import { calcularEtapa } from "../estado-cognitivo";

const haceHoras = (h: number) => new Date(Date.now() - h * 3_600_000);

describe("un 'ya pagué' viejo no puede tapar la conversación", () => {
  /** EL CASO. Siete horas y media después, preguntando por otro producto. */
  it("caduca a las horas, aunque no sea el primer mensaje de la visita", () => {
    const estado = calcularEtapa({
      historial: [
        { role: "customer", content: "ya pagué", createdAt: haceHoras(7.5) },
        { role: "agent", content: "Pasame el comprobante", createdAt: haceHoras(7.4) },
        { role: "customer", content: "Hola", createdAt: haceHoras(0.2) },
        { role: "customer", content: "tenes curso de diseño grafico?", createdAt: new Date() },
      ],
      // `sesionNueva` es false porque los dos últimos mensajes son seguidos:
      // es justamente el estado en el que el bug aparecía.
      sesionNueva: false,
    } as any);
    expect(estado.etapa).not.toBe("pago_reportado");
  });

  /** Pero un "ya pagué" RECIENTE sigue mandando: es el caso más caro del
   *  sistema (dice que pagó sin haber pagado). */
  it("un 'ya pagué' de hace un rato sigue vigente", () => {
    const estado = calcularEtapa({
      historial: [
        { role: "customer", content: "listo ya pagué", createdAt: haceHoras(0.5) },
        { role: "customer", content: "ahi te mande", createdAt: new Date() },
      ],
      sesionNueva: false,
    } as any);
    expect(estado.etapa).toBe("pago_reportado");
  });

  /** Sin fecha se cuenta como vigente: perder un "ya pagué" de verdad es peor
   *  que arrastrarlo de más. */
  it("sin fecha, se considera vigente", () => {
    const estado = calcularEtapa({
      historial: [{ role: "customer", content: "ya pagué" }],
      sesionNueva: false,
    } as any);
    expect(estado.etapa).toBe("pago_reportado");
  });

  /** Y el pago verificado de verdad manda sobre todo lo demás. */
  it("un pago verificado no vuelve a 'pago_reportado'", () => {
    const estado = calcularEtapa({
      historial: [{ role: "customer", content: "ya pagué", createdAt: new Date() }],
      sesionNueva: false,
      pagoVerificado: true,
    } as any);
    expect(estado.etapa).not.toBe("pago_reportado");
  });
});
