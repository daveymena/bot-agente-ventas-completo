import { safeISO } from "../lib/date-utils";
import { Router, type IRouter } from "express";
import { and, desc, eq, ne } from "drizzle-orm";
import {
  CreateAgentBody,
  ListAgentsResponse,
  UpdateAgentBody,
  UpdateAgentParams,
  UpdateAgentResponse,
  DeleteAgentParams,
  DeleteAgentResponse,
  ActivateAgentParams,
  ActivateAgentResponse,
} from "@workspace/api-zod";
import { db, agents } from "@workspace/db";
import { getAllTemplates, getTemplateByType } from "../lib/agent-templates";

const router: IRouter = Router();

/**
 * Los agentes llevan el prompt de ventas de cada negocio. Sin filtrar por
 * tenant, un cliente veía y editaba la estrategia comercial de otro.
 *
 * El caso más grave estaba en activar: se ponía isActive=false sobre TODOS los
 * agentes de la tabla, así que activar el propio apagaba el bot de las demás
 * cuentas. Toda operación de exclusividad debe acotarse al tenant.
 */
function tenantIdOf(req: any): number | null {
  const id = req?.tenant?.id;
  return typeof id === "number" ? id : null;
}

// GET /api/agents/templates - Obtener todos los templates
router.get("/templates", async (_req, res, next) => {
  try {
    const templates = getAllTemplates();
    return res.json(templates);
  } catch (e) {
    return next(e);
  }
});

// GET /api/agents/templates/:type - Obtener template por tipo
router.get("/templates/:type", async (req, res, next) => {
  try {
    const template = getTemplateByType(req.params.type);
    if (!template) {
      return res.status(404).json({ message: "Template no encontrado" });
    }
    return res.json(template);
  } catch (e) {
    return next(e);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const rows = await db
      .select()
      .from(agents)
      .where(eq(agents.tenantId, tenantId))
      .orderBy(desc(agents.createdAt));
    return res.json(ListAgentsResponse.parse(rows.map(serialize)));
  } catch (e) {
    return next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const body = CreateAgentBody.parse(req.body);

    // Si se proporciona un templateType, usar el template
    let agentData: any = {
      tenantId,
      name: body.name,
      role: body.personality || "sales_agent",
      tone: body.personality || "professional",
      language: "es",
      model: "gpt-4o-mini",
      systemPrompt: body.systemPrompt || "Eres un agente de ventas profesional",
      stages: [],
      // Mismo motivo que en PATCH: nada sin nombre queda atendiendo clientes.
      // Si viene sin nombre se crea igual, pero desactivado.
      isActive: String(body.name || "").trim() ? ((body as any).isActive ?? false) : false,
    };
    
    // Si hay un templateType, sobrescribir con datos del template
    if ((body as any).templateType) {
      const template = getTemplateByType((body as any).templateType);
      if (template) {
        agentData = {
          ...agentData,
          name: template.name,
          role: template.role,
          tone: template.tone,
          systemPrompt: template.systemPrompt,
          stages: template.stages,
        };
      }
    }
    
    // Un agente sin nombre queda como una tarjeta en blanco en la lista, sin
    // forma de saber cual es cual. Reportado: el agente id 3 no tiene nombre.
    // Se corta aca en vez de dejar entrar el vacio.
    if (!String((agentData as any).name || "").trim()) {
      return res.status(400).json({ message: "El agente necesita un nombre para poder distinguirlo del resto." });
    }

    const [created] = await db
      .insert(agents)
      .values(agentData)
      .returning();
      
    if (created && (body as any).isActive) {
      await db
        .update(agents)
        .set({ isActive: false })
        .where(and(eq(agents.tenantId, tenantId), eq(agents.isActive, true), ne(agents.id, created.id)));
    }
    
    return res.json(serialize(created!));
  } catch (e) {
    return next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const id = Number(req.params.id);
    const [row] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, id), eq(agents.tenantId, tenantId)))
      .limit(1);
    if (!row) return res.status(404).json({ message: "Agente no encontrado" });
    return res.json(serialize(row));
  } catch (e) {
    return next(e);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const { id } = UpdateAgentParams.parse(req.params);
    const body = UpdateAgentBody.parse(req.body);

    // Un agente sin nombre NO puede quedar atendiendo clientes.
    //
    // Se encontró uno operando así (auditoría del 16-08-2026): sin nombre y
    // sin etapas de conversación. Si el enrutador lo elige, le contesta al
    // cliente sin persona ni flujo, y no hay forma de saber quién respondió
    // qué. El nombre no es decorativo: es con lo que el agente se presenta.
    if ((body as any).isActive) {
      const [actual] = await db
        .select({ name: agents.name })
        .from(agents)
        .where(and(eq(agents.id, id), eq(agents.tenantId, tenantId)))
        .limit(1);
      const nombreFinal = String((body as any).name ?? actual?.name ?? "").trim();
      if (!nombreFinal) {
        return res.status(400).json({
          message: "Este agente no tiene nombre, así que no se puede activar. Ponele un nombre y volvé a intentarlo.",
        });
      }
    }

    const [updated] = await db
      .update(agents)
      .set(body as any)
      .where(and(eq(agents.id, id), eq(agents.tenantId, tenantId)))
      .returning();
    if (!updated) return res.status(404).json({ message: "Agente no encontrado" });
    if ((body as any).isActive) {
      await db
        .update(agents)
        .set({ isActive: false })
        .where(and(eq(agents.tenantId, tenantId), eq(agents.isActive, true), ne(agents.id, id)));
    }
    return res.json(UpdateAgentResponse.parse(serialize(updated)));
  } catch (e) {
    return next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const { id } = DeleteAgentParams.parse(req.params);
    await db.delete(agents).where(and(eq(agents.id, id), eq(agents.tenantId, tenantId)));
    // El esquema de respuesta pide `success`, no `ok`. Con `ok` el parse
     // tiraba DESPUES de que el DELETE ya se habia ejecutado: el agente se
     // borraba y al admin le llegaba un 400 "Datos invalidos". Trabajo hecho
     // y reportado como fallido -- el mismo patron que ya mordio en otros
     // puntos de este proyecto. Verificado en vivo el 2026-08-22 borrando 9
     // agentes: los 9 devolvieron 400 y los 9 desaparecieron.
    return res.json(DeleteAgentResponse.parse({ success: true }));
  } catch (e) {
    return next(e);
  }
});

router.post("/:id/activate", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const { id } = ActivateAgentParams.parse(req.params);

    // Se desactiva solo DENTRO del tenant. Sin este filtro, activar un agente
    // apagaba el agente activo de todas las demás cuentas del SaaS.
    await db
      .update(agents)
      .set({ isActive: false })
      .where(and(eq(agents.tenantId, tenantId), eq(agents.isActive, true)));

    const [updated] = await db
      .update(agents)
      .set({ isActive: true })
      .where(and(eq(agents.id, id), eq(agents.tenantId, tenantId)))
      .returning();
    if (!updated) return res.status(404).json({ message: "Agente no encontrado" });
    return res.json(ActivateAgentResponse.parse(serialize(updated)));
  } catch (e) {
    return next(e);
  }
});

function serialize(row: typeof agents.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    tone: row.tone,
    language: row.language,
    model: row.model,
    systemPrompt: row.systemPrompt,
    stages: row.stages ?? [],
    isActive: row.isActive,
    createdAt: safeISO(row.createdAt),
  };
}

export default router;
