import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Los relojes NO tocan la base antes de que exista.
 *
 * Log real de producción (07-10-2026), todo antes de "[DB] Lista para usar":
 *   [FollowUpScheduler] Failed to process due follow-ups error: {}
 *   [RemarketingScheduler] Error en tick inicial ... reading 'select'
 *   [MarketingExecutor] no se pudo agendar el barrido ... reading 'select'
 * El tercero quedaba muerto para siempre: el barrido no se reintentaba.
 *
 * Acá `db` es undefined hasta que `ensureDbReady` resuelve, igual que en
 * producción; si un reloj la toca antes, revienta exactamente como allá.
 */
const estado = vi.hoisted(() => ({
  lista: false,
  // vitest.setup.js también llama a ensureDbReady en su beforeAll: mientras la
  // prueba no "arme" la trampa, la base responde de inmediato.
  armado: false,
  liberar: (() => undefined) as () => void,
  selects: 0,
  programados: [] as any[],
}));

vi.mock("@workspace/db", () => {
  const promesa = new Promise<void>((r) => { estado.liberar = () => { estado.lista = true; r(); }; });
  const consulta: any = {
    from: () => consulta, where: () => consulta, orderBy: () => consulta, limit: () => consulta,
    then: (ok: any) => Promise.resolve([]).then(ok),
  };
  const dbFalsa = { select: () => { estado.selects++; return consulta; } };
  return {
    get db() { return !estado.armado || estado.lista ? dbFalsa : undefined; },
    ensureDbReady: () => (estado.armado ? promesa : Promise.resolve()).then(() => ({ db: dbFalsa })),
    remarketingCampaigns: { status: "status" }, leads: {}, followUps: { completed: "c", scheduledFor: "s" },
    conversations: {}, messages: {}, activityEvents: {}, marketingTasks: {}, trabajosProgramados: {},
  };
});
vi.mock("../programador", () => ({
  registrarManejador: () => undefined,
  programar: async (t: any) => { estado.programados.push(t); return { creado: true, id: 1 }; },
}));
vi.mock("../marketing-team/audit", () => ({ writeAuditLog: async () => undefined }));
vi.mock("../whatsapp-factory", () => ({ getWhatsAppForTenant: () => ({ isConnected: () => false }) }));
vi.mock("../facebook-messenger", () => ({ facebookMessengerService: {}, FacebookMessengerService: class {} }));
vi.mock("../leadScoring", () => ({ leadScoringEngine: {} }));
vi.mock("../tenant-email", () => ({ enviarComoNegocio: async () => true }));
vi.mock("../remarketing", () => ({ buildUnsubscribeToken: () => "t" }));

const unRato = () => new Promise((r) => setTimeout(r, 30));

describe("arranque: los relojes esperan a la base", () => {
  beforeEach(() => { estado.selects = 0; });

  it("remarketing, seguimientos y el barrido de aprobadas no corren hasta que la base está lista", async () => {
    estado.armado = true;
    const { RemarketingScheduler } = await import("../remarketing-scheduler");
    const { FollowUpScheduler } = await import("../followUpScheduler");
    const { iniciarEjecutorDeTareas } = await import("../marketing-team/task-executor");

    const remarketing = new RemarketingScheduler();
    const seguimientos = new FollowUpScheduler();
    remarketing.start(60 * 60 * 1000);
    seguimientos.start(60);
    const barrido = iniciarEjecutorDeTareas();

    await unRato();
    // Antes del arreglo esto ya había reventado con "reading 'select'".
    expect(estado.selects).toBe(0);
    expect(estado.programados).toHaveLength(0);

    estado.liberar();
    await barrido;
    await unRato();

    expect(estado.selects).toBeGreaterThanOrEqual(2); // primera vuelta de remarketing y de seguimientos
    expect(estado.programados.map((t) => t.tipo)).toContain("marketing:barrido_aprobadas");

    remarketing.stop();
    seguimientos.stop();
  });

  it("importar followUpScheduler ya no enciende un reloj por su cuenta", async () => {
    const fuente = (await import("node:fs")).readFileSync(
      new URL("../followUpScheduler.ts", import.meta.url), "utf8",
    );
    expect(fuente).not.toMatch(/^followUpScheduler\.start\(/m);
    const app = (await import("node:fs")).readFileSync(new URL("../../app.ts", import.meta.url), "utf8");
    expect(app).toMatch(/followUpScheduler\.start\(/);
  });
});
