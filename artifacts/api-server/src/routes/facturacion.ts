/**
 * Rutas de facturación (montadas en /api/facturacion, CON sesión).
 * Cada negocio conecta SU sistema; ver lib/facturacion/tipos.ts.
 */
import { Router, type Request, type Response } from "express";
import { db, payments } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  leerConfigFacturacion, guardarConfigFacturacion, borrarConfigFacturacion,
  resumenSinSecretos, probarConexion, facturarPago,
} from "../lib/facturacion";

export const facturacionRouter = Router();

function tenantId(req: Request): number | null {
  return Number((req as any).tenant?.id) || null;
}
const sinTenant = (res: Response) => res.status(401).json({ success: false, error: "Sin sesión" });

/** GET /api/facturacion — qué sistema está conectado (sin secretos). */
facturacionRouter.get("/", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  return res.json({ success: true, facturacion: resumenSinSecretos(await leerConfigFacturacion(t)) });
});

/**
 * PUT /api/facturacion — conectar o cambiar. Se PRUEBA antes de dejarla
 * activa: guardar sin probar es lo que hacía que el panel dijera "conectada"
 * con claves que el otro lado rechazaba (pasó con AliExpress).
 */
facturacionRouter.put("/", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  const b = req.body || {};
  try {
    await guardarConfigFacturacion(t, {
      proveedor: b.proveedor,
      activa: false,
      alegra: b.alegra,
      webhook: b.webhook,
    });
    const config = await leerConfigFacturacion(t);
    if (!config) throw new Error("Elegí un sistema de facturación.");
    let prueba: string;
    try {
      prueba = await probarConexion(config);
    } catch (e: any) {
      return res.status(400).json({ success: false, error: `Quedó guardado pero APAGADO: la prueba falló. ${e?.message || e}` });
    }
    await guardarConfigFacturacion(t, { activa: b.activa !== false });
    return res.json({ success: true, prueba, facturacion: resumenSinSecretos(await leerConfigFacturacion(t)) });
  } catch (e: any) {
    return res.status(400).json({ success: false, error: String(e?.message || e) });
  }
});

/** POST /api/facturacion/probar — vuelve a probar lo guardado. */
facturacionRouter.post("/probar", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  const config = await leerConfigFacturacion(t);
  if (!config) return res.status(400).json({ success: false, error: "No hay ningún sistema de facturación conectado." });
  try {
    return res.json({ success: true, prueba: await probarConexion(config) });
  } catch (e: any) {
    return res.status(400).json({ success: false, error: String(e?.message || e) });
  }
});

/** DELETE /api/facturacion — desconectar (del lado nuestro). */
facturacionRouter.delete("/", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  await borrarConfigFacturacion(t);
  return res.json({ success: true });
});

/** POST /api/facturacion/pagos/:id — facturar a mano un pago ya confirmado (ej. si falló el automático). */
facturacionRouter.post("/pagos/:id", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ success: false, error: "Id de pago inválido." });
  // El pago tiene que ser de ESTE negocio: el id viene de afuera.
  const [p] = await db.select({ id: payments.id }).from(payments).where(and(eq(payments.id, id), eq(payments.tenantId, t))).limit(1);
  if (!p) return res.status(404).json({ success: false, error: "No existe ese pago en tu negocio." });
  const r = await facturarPago(id);
  return r.ok ? res.json({ success: true, ...r }) : res.status(400).json({ success: false, error: r.error });
});
