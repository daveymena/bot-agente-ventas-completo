import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, notifications } from "@workspace/db";
import type { TenantRequest } from "../lib/tenantManager";

const router = Router();

router.get("/", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const limit = parseInt(req.query.limit as string) || 30;
    const unreadOnly = req.query.unread === "true";
    const where = unreadOnly
      ? and(eq(notifications.tenantId, tenantId), eq(notifications.read, false))
      : eq(notifications.tenantId, tenantId);
    const rows = await db.select().from(notifications).where(where)
      .orderBy(desc(notifications.createdAt)).limit(limit);
    const unreadCount = await db.select({ id: notifications.id }).from(notifications)
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.read, false)));
    return res.json({ notifications: rows.map(n => ({ ...n, metadata: (() => { try { return JSON.parse(n.metadata); } catch { return {}; } })() })), unreadCount: unreadCount.length });
  } catch (e) { return next(e); }
});

router.post("/:id/read", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const id = parseInt(req.params.id);
    await db.update(notifications).set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.tenantId, tenantId)));
    return res.json({ ok: true });
  } catch (e) { return next(e); }
});

router.post("/read-all", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    await db.update(notifications).set({ read: true })
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.read, false)));
    return res.json({ ok: true });
  } catch (e) { return next(e); }
});

export default router;
