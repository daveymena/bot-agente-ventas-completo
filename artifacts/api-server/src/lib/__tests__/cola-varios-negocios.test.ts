/**
 * LA COLA CON VARIOS NEGOCIOS A LA VEZ
 *
 * Auditoría del 23-09-2026, tres fallos del orquestador que solo aparecen
 * cuando hay más de un negocio:
 *
 *   1. Un negocio con WhatsApp caído trababa la cola de TODOS: su mensaje se
 *      dejaba "no procesando" y `dequeue` lo volvía a sacar primero siempre.
 *   2. Se atendía UNA conversación a la vez para toda la plataforma.
 *   3. Una conversación que tomó una persona (panel → "Humano") la seguía
 *      contestando el bot.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const runAgentReply = vi.fn();
const enviarPartsAlCliente = vi.fn();
const reservarTurnoDeEnvio = vi.fn();
const turnoDeEnvioLibreEn = vi.fn();

vi.mock("../agent", () => ({ runAgentReply: (...a: any[]) => runAgentReply(...a) }));
vi.mock("../transporte-whatsapp", () => ({
  // El negocio 2 tiene el WhatsApp caído.
  transporteConectado: (t: number) => t !== 2,
  enviarPartsAlCliente: (...a: any[]) => enviarPartsAlCliente(...a),
  reservarTurnoDeEnvio: (...a: any[]) => reservarTurnoDeEnvio(...a),
  turnoDeEnvioLibreEn: (...a: any[]) => turnoDeEnvioLibreEn(...a),
}));
vi.mock("../tenantManager", () => ({ tenantManager: { getTenantById: async () => ({ plan: "pro" }) } }));
vi.mock("../../middleware/featureLimits", () => ({ checkMessageLimit: async () => ({ allowed: true }) }));

import { MessageQueue } from "../message-queue";
import { AgentOrchestrator } from "../services/agent-orchestrator";

const msj = (q: MessageQueue, tenantId: string, conversationId: number) =>
  q.enqueue({ tenantId, from: `57${conversationId}@s.whatsapp.net`, to: tenantId, body: "", timestamp: new Date(), messageId: `m${conversationId}`, isGroup: false, conversationId, phone: `57${conversationId}` });

/** Un orquestador con su propia cola y conversaciones falsas. */
function orquestador(estados: Record<number, string> = {}) {
  const o: any = new AgentOrchestrator();
  const q = new MessageQueue();
  o.queue = q;
  o.getConversationById = async (id: number) => ({ id, status: estados[id] || "ai", contactName: "x", contactPhone: `57${id}`, currentStage: null });
  return { o, q };
}

beforeEach(() => {
  runAgentReply.mockReset();
  enviarPartsAlCliente.mockReset();
  reservarTurnoDeEnvio.mockReset();
  reservarTurnoDeEnvio.mockReturnValue(0);
  turnoDeEnvioLibreEn.mockReset();
  turnoDeEnvioLibreEn.mockReturnValue(0);
  runAgentReply.mockResolvedValue({ parts: [{ kind: "text", content: "hola" }] });
});

describe("el espaciado del número no ocupa un lugar del orquestador", () => {
  it("si al número le falta turno, la respuesta se pospone ya redactada", async () => {
    const { o, q } = orquestador();
    reservarTurnoDeEnvio.mockReturnValue(14_000);
    const m = msj(q, "1", 40);
    await o.processMessage(q.dequeue()!);
    expect(enviarPartsAlCliente).not.toHaveBeenCalled();
    expect(m.processed).toBe(false);
    expect(m.parts).toEqual([{ kind: "text", content: "hola" }]);
    expect(m.noAntesDe).toBeGreaterThan(Date.now() + 10_000);
  });

  it("al volver se envía sin pedirle otra respuesta a la IA", async () => {
    const { o, q } = orquestador();
    reservarTurnoDeEnvio.mockReturnValueOnce(14_000).mockReturnValue(0);
    const m = msj(q, "1", 41);
    await o.processMessage(q.dequeue()!);
    m.noAntesDe = Date.now() - 1;
    await o.processMessage(q.dequeue()!);
    expect(runAgentReply).toHaveBeenCalledTimes(1);
    expect(enviarPartsAlCliente).toHaveBeenCalledTimes(1);
    expect(m.processed).toBe(true);
  });

  it("un mensaje nuevo del mismo cliente espera a que salga la respuesta anterior", async () => {
    const { o, q } = orquestador();
    reservarTurnoDeEnvio.mockReturnValue(14_000);
    msj(q, "1", 42);
    await o.processMessage(q.dequeue()!);
    const nuevo = q.enqueue({ tenantId: "1", from: "5742@s.whatsapp.net", to: "1", body: "otra cosa", timestamp: new Date(), messageId: "m42b", isGroup: false, conversationId: 42, phone: "5742" });
    const otroCliente = msj(q, "1", 43);
    const siguiente = q.dequeue((x) => !o.detrasDeUnEnvio(x));
    expect(siguiente?.id).toBe(otroCliente.id);
    expect(nuevo.processing).toBeFalsy();
  });

  it("con el número ocupado no se redacta todavía; el otro negocio sí entra", () => {
    const { o, q } = orquestador();
    turnoDeEnvioLibreEn.mockImplementation((t: number) => (t === 1 ? 60_000 : 0));
    msj(q, "1", 44);
    const otro = msj(q, "3", 45);
    expect(q.dequeue((x) => o.turnoCerca(x))?.id).toBe(otro.id);
  });

  it("aparta el turno del número antes de redactar, no después", async () => {
    const { o, q } = orquestador();
    const orden: string[] = [];
    reservarTurnoDeEnvio.mockImplementation(() => { orden.push("turno"); return 0; });
    runAgentReply.mockImplementation(async () => { orden.push("ia"); return { parts: [{ kind: "text", content: "ok" }] }; });
    msj(q, "1", 47);
    o.processing = true;
    await o.runProcessingLoop();
    o.processing = false;
    clearTimeout(o.intervalId);
    await new Promise((r) => setTimeout(r, 100));
    expect(orden.slice(0, 2)).toEqual(["turno", "ia"]);
  });
});

describe("un negocio sin WhatsApp no traba a los demás", () => {
  it("su mensaje se pospone y el del otro negocio sale en la vuelta siguiente", async () => {
    const { o, q } = orquestador();
    const caido = msj(q, "2", 20);
    const sano = msj(q, "1", 10);

    await o.processMessage(q.dequeue()!); // el del negocio caído, que es el primero
    expect(caido.noAntesDe).toBeGreaterThan(Date.now());

    const siguiente = q.dequeue();
    expect(siguiente?.id).toBe(sano.id);
  });

  it("tras 24h caído, el mensaje se descarta en vez de quedar para siempre", async () => {
    const { o, q } = orquestador();
    const viejo = msj(q, "2", 20);
    viejo.createdAt = new Date(Date.now() - 25 * 3600_000);
    await o.processMessage(q.dequeue()!);
    expect(viejo.processed).toBe(true);
  });
});

describe("una conversación que tomó una persona", () => {
  it("el bot NO la contesta", async () => {
    const { o, q } = orquestador({ 30: "human" });
    const m = msj(q, "1", 30);
    await o.processMessage(q.dequeue()!);
    expect(runAgentReply).not.toHaveBeenCalled();
    expect(enviarPartsAlCliente).not.toHaveBeenCalled();
    expect(m.processed).toBe(true);
  });

  it("una en modo IA sí se contesta", async () => {
    const { o, q } = orquestador();
    msj(q, "1", 31);
    await o.processMessage(q.dequeue()!);
    expect(runAgentReply).toHaveBeenCalledWith(31);
    expect(enviarPartsAlCliente).toHaveBeenCalledTimes(1);
  });
});

describe("varias conversaciones en paralelo, pero de a una por conversación", () => {
  it("dequeue salta las conversaciones que ya se están atendiendo", () => {
    const q = new MessageQueue();
    msj(q, "1", 1);
    msj(q, "1", 1);
    const otra = msj(q, "1", 2);
    q.dequeue(); // se toma la conversación 1
    const enCurso = new Set([1]);
    expect(q.dequeue((m) => !enCurso.has(m.conversationId!))?.id).toBe(otra.id);
  });

  it("con 3 clientes esperando, se atienden los 3 a la vez", async () => {
    const { o, q } = orquestador();
    let simultaneos = 0;
    let maximo = 0;
    runAgentReply.mockImplementation(async () => {
      simultaneos++;
      maximo = Math.max(maximo, simultaneos);
      await new Promise((r) => setTimeout(r, 50));
      simultaneos--;
      return { parts: [{ kind: "text", content: "ok" }] };
    });
    msj(q, "1", 1);
    msj(q, "1", 2);
    msj(q, "1", 3);
    o.processing = true;
    await o.runProcessingLoop();
    o.processing = false;
    clearTimeout(o.intervalId);
    await new Promise((r) => setTimeout(r, 200));
    expect(maximo).toBe(3);
  });
});

describe("la memoria de la cola", () => {
  it("los que agotaron los reintentos se limpian", () => {
    const q = new MessageQueue();
    const m = msj(q, "1", 1);
    m.createdAt = new Date(Date.now() - 2 * 3600_000);
    for (let i = 0; i < 3; i++) { q.dequeue(); q.markFailed(m.id); }
    q.cleanup();
    expect(q.getStats().total).toBe(0);
  });
});
