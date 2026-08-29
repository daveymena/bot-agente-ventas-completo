import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, agents, conversations } from "@workspace/db";
import { getActiveAgent, getAgentType } from "../agent-router";

/**
 * El cliente hablaba con Camila y al mensaje siguiente le contestaba Sofía.
 *
 * Con dos agentes activos, quién atendía se recalculaba en CADA mensaje a
 * partir de palabras clave del texto. Nada ataba la conversación a un agente,
 * así que el cliente veía cambiar el nombre, el tono y el conocimiento de lo
 * prometido a mitad de charla -- y ninguno de los dos sabía lo que el otro
 * había dicho.
 *
 * `conversations.agentId` existía en el esquema desde siempre. Nadie lo leía
 * ni lo escribía. Es el mismo patrón del video de producto, del objetivo del
 * anuncio y del targeting: el campo estaba, el dato no llegaba nunca.
 *
 * El único cambio de agente que se permite es por un motivo duro (el cliente
 * pasó de un producto digital a uno físico, y solo uno de los dos sabe pedir
 * la dirección), nunca porque el mensaje de turno traiga cierta palabra.
 */

const TENANT = 1;

describe("Una conversación, un agente", () => {
  let camila: any;
  let sofia: any;
  let convoId: number;

  beforeEach(async () => {
    [camila] = await db.insert(agents).values({
      tenantId: TENANT, name: "Camila", role: "Asesora de ventas", tone: "cercano",
      systemPrompt: "Vendé con calidez.", isActive: true,
    }).returning();
    [sofia] = await db.insert(agents).values({
      tenantId: TENANT, name: "Sofía", role: "Asesora de ventas", tone: "cercano",
      systemPrompt: "Vendé con calidez.", isActive: true,
    }).returning();

    const [c] = await db.insert(conversations).values({
      tenantId: TENANT, contactName: "Mauricio", contactPhone: "573000000001",
      avatarColor: "#10b981", status: "ai",
    }).returning();
    convoId = c.id;
  });

  afterEach(async () => {
    await db.delete(conversations).where(eq(conversations.id, convoId));
    await db.delete(agents).where(eq(agents.id, camila.id));
    await db.delete(agents).where(eq(agents.id, sofia.id));
  });

  it("el que atiende el primer mensaje queda asentado en la conversación", async () => {
    const primero = await getActiveAgent("hola, buenas", convoId, TENANT);
    expect(primero).toBeTruthy();

    const [fila] = await db
      .select({ agentId: conversations.agentId })
      .from(conversations)
      .where(eq(conversations.id, convoId))
      .limit(1);
    expect(fila.agentId).toBe(primero!.id);
  });

  it("los mensajes siguientes los atiende el MISMO, aunque cambien las palabras", async () => {
    // Estos cuatro mensajes puntúan a agentes distintos con el scoring por
    // palabras clave ("envío" tira a dropshipping, "curso" a digitales). Antes
    // eso bastaba para que el cliente cambiara de interlocutor.
    const primero = await getActiveAgent("hola", convoId, TENANT);
    for (const texto of ["cuánto cuesta el envío", "y un curso digital?", "gracias", "me interesa"]) {
      const siguiente = await getActiveAgent(texto, convoId, TENANT);
      expect(siguiente?.id, `cambió de agente en "${texto}"`).toBe(primero!.id);
      expect(siguiente?.name).toBe(primero!.name);
    }
  });

  it("si el agente asignado se desactiva, se reasigna en vez de quedarse mudo", async () => {
    const primero = await getActiveAgent("hola", convoId, TENANT);
    await db.update(agents).set({ isActive: false }).where(eq(agents.id, primero!.id));

    const reemplazo = await getActiveAgent("seguís ahí?", convoId, TENANT);
    expect(reemplazo).toBeTruthy();
    expect(reemplazo!.id).not.toBe(primero!.id);

    // Y el reemplazo queda asentado, para que el próximo mensaje tampoco
    // vuelva a rifar quién contesta.
    const [fila] = await db
      .select({ agentId: conversations.agentId })
      .from(conversations)
      .where(eq(conversations.id, convoId))
      .limit(1);
    expect(fila.agentId).toBe(reemplazo!.id);
  });
});

/**
 * El desempate por defecto estaba escrito a nombre de un solo negocio.
 */
describe("El agente general se reconoce por su rol, no por llamarse Sofía", () => {
  it("un agente sin especialidad es el general, se llame como se llame", () => {
    // `agent.name === "Sofía"` daba el bonus solo en la cuenta de un tenant.
    // En cualquier otro negocio el desempate para el caso más común -- un
    // cliente que escribe "hola" -- no se aplicaba nunca.
    expect(getAgentType("Asesora de ventas", "Camila")).toBe("general");
    expect(getAgentType("Atención al cliente", "Yamile")).toBe("general");
  });

  it("y los especializados siguen reconociéndose por el rol", () => {
    expect(getAgentType("Vendedor de dropshipping", "Ana")).toBe("dropshipping");
    expect(getAgentType("Experto en productos digitales", "Ana")).toBe("digital_products");
  });
});
