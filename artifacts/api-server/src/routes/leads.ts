import { safeISO } from "../lib/date-utils";
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateLeadBody,
  DeleteLeadParams,
  DeleteLeadResponse,
  ListLeadsQueryParams,
  ListLeadsResponse,
  UpdateLeadBody,
  UpdateLeadParams,
  UpdateLeadResponse,
} from "@workspace/api-zod";
import { db, leads, activityEvents } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** Los leads son datos de clientes: nunca deben cruzarse entre cuentas. */
function tenantIdOf(req: any): number | null {
  const id = req?.tenant?.id;
  return typeof id === "number" ? id : null;
}

router.get("/", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const q = ListLeadsQueryParams.parse(req.query);
    const filters = [eq(leads.tenantId, tenantId)];
    if (q.stage) filters.push(eq(leads.stage, q.stage));

    const rows = await db
      .select()
      .from(leads)
      .where(and(...filters))
      .orderBy(desc(leads.createdAt));

    // Etapas viejas guardadas con el vocabulario del puntaje de leads
    // (cold/warm/hot...) en vez del embudo del CRM. El origen ya está
    // corregido (leadScoring.ts traduce antes de escribir), pero las filas
    // que quedaron de antes seguirían rompiendo la lista.
    const EQUIVALENCIAS: Record<string, string> = {
      cold: "new", warm: "contacted", hot: "qualified",
      negotiating: "proposal", closing: "proposal", converted: "proposal",
      greeting: "new", discovery: "contacted", details: "qualified",
      presentation: "qualified", objection_handling: "proposal",
    };

    // Fila por fila: una sola inválida NO puede tumbar la lista entera.
    //
    // Antes era un parse del array completo: con 3 filas en "cold"/"warm",
    // GET /api/leads devolvía 400 y la pantalla de Prospectos quedaba en
    // blanco -- sin filas, sin error, sin "no hay prospectos" -- aunque el
    // panel siguiera contando 5. Se perdían también las 2 filas sanas.
    const validas: any[] = [];
    let descartadas = 0;
    for (const row of rows) {
      const normalizada = serialize({
        ...row,
        stage: EQUIVALENCIAS[String(row.stage || "")] || row.stage,
      });
      const r = ListLeadsResponse.element.safeParse(normalizada);
      if (r.success) validas.push(r.data);
      else descartadas++;
    }
    if (descartadas > 0) {
      logger.warn({ descartadas, total: rows.length, tenantId }, "[Leads] Filas con datos inválidos omitidas de la lista");
    }
    return res.json(validas);
  } catch (e) {
    return next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const body = CreateLeadBody.parse(req.body);
    const [created] = await db
      .insert(leads)
      .values({ 
        ...body, 
        phone: body.phone || body.name,
        value: "0"
      })
      .returning();
    await db.insert(activityEvents).values({
      type: "lead_created",
      title: `Nuevo lead: ${created!.name}`,
      subtitle: created!.phone,
    });
    return res.json(serialize(created!));
  } catch (e) {
    return next(e);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const { id } = UpdateLeadParams.parse(req.params);
    const body = UpdateLeadBody.parse(req.body);
    const update: Record<string, unknown> = { ...body };
    const [updated] = await db
      .update(leads)
      .set(update as any)
      .where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)))
      .returning();
    if (!updated) return res.status(404).json({ message: "Lead no encontrado" });
    if (body.stage === "won") {
      await db.insert(activityEvents).values({
        type: "deal_won",
        title: `Venta cerrada: ${updated.name}`,
        subtitle: `$${updated.value}`,
      });
    } else if (body.stage === "lost") {
      await db.insert(activityEvents).values({
        type: "deal_lost",
        title: `Lead perdido: ${updated.name}`,
        subtitle: updated.phone,
      });
    }
    return res.json(UpdateLeadResponse.parse(serialize(updated)));
  } catch (e) {
    return next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const { id } = DeleteLeadParams.parse(req.params);
    // Acotado al tenant: sin esto, cualquiera borraba leads ajenos por id.
    await db.delete(leads).where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)));
    return res.json(DeleteLeadResponse.parse({ ok: true }));
  } catch (e) {
    return next(e);
  }
});

function serialize(row: typeof leads.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? null,
    stage: row.stage,
    value: Number(row.value),
    notes: row.notes ?? null,
    source: row.source ?? null,
    createdAt: safeISO(row.createdAt),
  };
}

export default router;
