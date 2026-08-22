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

/**
 * Un prospecto por id. Faltaba, igual que GET /api/products/:id: quien la
 * llamaba recibía el 404 de Express en HTML y concluía que el prospecto no
 * existía.
 */
router.get("/:id", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Id inválido" });

    const [row] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)))
      .limit(1);
    if (!row) return res.status(404).json({ message: "Prospecto no encontrado" });

    return res.json(serialize(row));
  } catch (e) {
    return next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    // ── El prospecto es de QUIEN lo crea ──────────────────────────────────
    // Este endpoint era el ÚNICO de leads.ts que no resolvía el tenant: el
    // GET, el GET por id, el PATCH y el DELETE sí lo hacen. Resultado
    // reportado y reproducido dos veces: el POST devolvía 200 con un id, y
    // ese registro no aparecía nunca más -- ni en la lista ni por id. No se
    // perdía: quedaba huérfano, sin dueño, y todas las lecturas filtran por
    // dueño. El cliente creía que la app se había tragado su contacto.
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    // ── Un campo vacío llega como null, y el schema pedía string ──────────
    // El formulario manda `null` cuando el admin deja vacío el correo o las
    // notas -- que son OPCIONALES, ni siquiera tienen asterisco. El schema
    // generado los declara `.optional()`, que acepta `undefined` pero NO
    // `null`, así que crear un prospecto con solo nombre y teléfono (el caso
    // más común: un contacto en frío) fallaba con 400.
    //
    // Se normaliza acá y no en el schema generado porque ese archivo se
    // regenera desde la especificación: un arreglo ahí se borra solo la
    // próxima vez.
    const crudo: Record<string, any> = { ...(req.body || {}) };
    for (const campo of ["phone", "email", "notes", "stage"]) {
      if (crudo[campo] === null || crudo[campo] === "") delete crudo[campo];
    }
    const body = CreateLeadBody.parse(crudo);

    // ── "Origen" y "Valor estimado" se estaban tirando ────────────────────
    // El formulario los manda, pero no están en CreateLeadBody, así que zod
    // los descartaba en silencio -- y encima el insert escribía `value: "0"`
    // fijo, pisando lo que el admin hubiera cargado.
    //
    // No son cosméticos: sin `source` no se sabe qué campaña trae a los
    // clientes que SÍ compran, y sin `value` el panel calcula "Ingresos del
    // mes" sobre ceros. Por eso mostraba $0 con oportunidades cargadas.
    const source = typeof crudo.source === "string" && crudo.source.trim() ? crudo.source.trim() : null;
    const valorCrudo = Number(String(crudo.value ?? "").replace(/[^0-9.-]/g, ""));
    const value = Number.isFinite(valorCrudo) && valorCrudo > 0 ? String(valorCrudo) : "0";

    const [created] = await db
      .insert(leads)
      .values({
        ...body,
        tenantId,
        phone: body.phone || body.name,
        source,
        value,
      })
      .returning();

    await db.insert(activityEvents).values({
      tenantId,
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
    // El esquema pide `success`, no `ok`: con `ok` el parse tiraba DESPUES
    // de ejecutar el DELETE, asi que el registro se borraba y al usuario le
    // llegaba un 400 "Datos invalidos". Trabajo hecho y reportado como
    // fallido. Estaba igual en agentes, categorias, prospectos y productos.
    return res.json(DeleteLeadResponse.parse({ success: true }));
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
