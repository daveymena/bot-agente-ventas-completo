import { describe, it, expect } from "vitest";
import { MessageQueue } from "../message-queue";

/**
 * Medido el 2026-08-25 en una tanda de pruebas: tras ~35 mensajes seguidos el
 * bot dejó de responder y no volvió. La cadena era esta:
 *
 *   1. el tope de 60 mensajes/hora de WhatsApp corta el envío y lanza;
 *   2. el orquestador lo trata como un fallo cualquiera y reintenta YA;
 *   3. el tope sigue ahí, así que los tres reintentos se queman en segundos;
 *   4. el mensaje del cliente queda marcado como fallido y no se envía nunca.
 *
 * Y de paso, cada reintento volvía a llamar al agente -- que GUARDA su
 * respuesta antes de enviarla. Resultado: hasta tres respuestas casi idénticas
 * en la base, ninguna entregada. Como el historial alimenta el contexto, en el
 * turno siguiente el agente se veía repitiéndose y volvía a repetir.
 */
const nuevo = (q: MessageQueue) =>
  q.enqueue({ tenantId: "1", from: "57300@s.whatsapp.net", body: "hola", conversationId: 1, phone: "57300" } as any);

describe("un freno temporal no puede perder el mensaje del cliente", () => {
  it("posponer no gasta un reintento", () => {
    const q = new MessageQueue();
    const m = nuevo(q);
    q.dequeue();
    q.posponer(m.id, 60_000);
    expect(m.retryCount).toBe(0);
  });

  it("mientras espera, no se vuelve a tomar", () => {
    const q = new MessageQueue();
    const m = nuevo(q);
    q.dequeue();
    q.posponer(m.id, 60_000);
    expect(q.dequeue()).toBeNull();
  });

  it("cumplida la espera, vuelve a estar disponible", () => {
    const q = new MessageQueue();
    const m = nuevo(q);
    q.dequeue();
    q.posponer(m.id, -1); // ya vencida
    expect(q.dequeue()?.id).toBe(m.id);
  });

  it("posponer diez veces sigue sin matar el mensaje", () => {
    // Este es el caso real: un tope horario dura mucho más que tres intentos.
    const q = new MessageQueue();
    const m = nuevo(q);
    for (let i = 0; i < 10; i++) {
      q.dequeue();
      q.posponer(m.id, -1);
    }
    expect(m.retryCount).toBe(0);
    expect(q.dequeue()?.id).toBe(m.id);
  });

  it("un fallo de verdad SÍ gasta reintentos y termina fallando", () => {
    // El arreglo no puede volver inmortal a un mensaje que falla de verdad.
    const q = new MessageQueue();
    const m = nuevo(q);
    for (let i = 0; i < 3; i++) {
      q.dequeue();
      q.markFailed(m.id);
    }
    expect(m.retryCount).toBe(3);
    expect(q.dequeue()).toBeNull();
  });
});

describe("el reintento reenvía, no vuelve a redactar", () => {
  it("las partes redactadas sobreviven al fallo de envío", () => {
    const q = new MessageQueue();
    const m = nuevo(q);
    q.dequeue();
    q.guardarPartes(m.id, [{ kind: "text", content: "El curso de piano cuesta $20.000" }]);
    q.posponer(m.id, -1);

    const otraVez = q.dequeue();
    expect(otraVez?.parts).toHaveLength(1);
    expect((otraVez?.parts?.[0] as any).content).toContain("piano");
  });

  it("un mensaje nuevo no trae partes: hay que redactarlo", () => {
    const q = new MessageQueue();
    nuevo(q);
    expect(q.dequeue()?.parts).toBeUndefined();
  });
});
