import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, coupons, products } from "@workspace/db";
import { sendError } from "../lib/error-handler";
import { ERROR_CODES } from "../lib/error-codes";
import type { TenantRequest } from "../lib/tenantManager";
import { aplicarCupon, normalizarCodigo } from "../lib/cupones";

const router = Router();

function limpio(r: any) {
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    code: normalizarCodigo(r?.code),
    tipo: String(r?.tipo || "porcentaje") === "fijo" ? "fijo" : "porcentaje",
    valor: num(r?.valor),
    minimoCompra: num(r?.minimoCompra),
    usosMax: r?.usosMax != null && r?.usosMax !== "" ? Math.max(0, Math.floor(Number(r?.usosMax))) : null,
    activo: r?.activo !== false,
    vigenciaInicio: r?.vigenciaInicio ? new Date(r.vigenciaInicio) : null,
    vigenciaFin: r?.vigenciaFin ? new Date(r.vigenciaFin) : null,
    productId: r?.productId ? Number(r.productId) : null,
  };
}

router.get("/", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const filas = await db.select().from(coupons).where(eq(coupons.tenantId, tenantId));
    return res.json({ ok: true, cupones: filas });
  } catch (e) { return next(e); }
});

router.post("/", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const c = limpio(req.body);
    if (!c.code || c.valor == null || c.valor <= 0) {
      return res.status(400).json({ ok: false, error: "Faltan el código o un valor de descuento válido." });
    }
    if (c.productId) {
      const [p] = await db.select().from(products).where(and(eq(products.id, c.productId), eq(products.tenantId, tenantId))).limit(1);
      if (!p) return res.status(400).json({ ok: false, error: "El producto no pertenece a este negocio." });
    }
    const [creado] = await db.insert(coupons).values({ tenantId, ...c } as any).returning();
    return res.json({ ok: true, cupon: creado });
  } catch (e) { return next(e); }
});

router.patch("/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);
    const c = limpio(req.body);
    const [actualizado] = await db.update(coupons).set({ ...c, updatedAt: new Date() } as any)
      .where(and(eq(coupons.id, id), eq(coupons.tenantId, tenantId))).returning();
    if (!actualizado) return res.status(404).json({ ok: false, error: "Cupón no encontrado." });
    return res.json({ ok: true, cupon: actualizado });
  } catch (e) { return next(e); }
});

router.delete("/:id", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA);
    const [borrado] = await db.delete(coupons).where(and(eq(coupons.id, id), eq(coupons.tenantId, tenantId))).returning({ id: coupons.id });
    if (!borrado) return res.status(404).json({ ok: false, error: "Cupón no encontrado." });
    return res.json({ ok: true, id: borrado.id });
  } catch (e) { return next(e); }
});

/** Valida un cupón contra un producto/total SIN redimirlo (vista previa del descuento). */
router.post("/validar", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);
    const code = normalizarCodigo(req.body?.code);
    const total = Number(req.body?.total);
    const productId = req.body?.productId ? Number(req.body.productId) : null;
    if (!code) return res.status(400).json({ ok: false, error: "Falta el código del cupón." });

    const [cupon] = await db.select().from(coupons)
      .where(and(eq(coupons.tenantId, tenantId), eq(coupons.code, code))).limit(1);

    const r = aplicarCupon(cupon, { total: Number.isFinite(total) ? total : 0, productId });
    return res.json({ ...r, cupon: cupon ? { id: cupon.id, code: cupon.code, tipo: cupon.tipo, valor: cupon.valor, productId: cupon.productId } : null });
  } catch (e) { return next(e); }
});

export default router;
