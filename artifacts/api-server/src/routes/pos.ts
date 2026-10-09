/**
 * Rutas del POS de tienda física (montadas en /api/pos, CON sesión).
 * Solo negocios con formato "tienda_fisica"; ver lib/pos.ts.
 */
import { Router, type Request, type Response } from "express";
import {
  activarTiendaFisica, esTiendaFisica, inventarioDelNegocio, registrarEntrada,
  ajustarStock, venderEnTienda, devolverVenta, abrirCaja, cajaAbierta,
  cerrarCaja, reporteVentas, exportarVentas,
} from "../lib/pos";

export const posRouter = Router();

function tenantId(req: Request): number | null {
  return Number((req as any).tenant?.id) || null;
}
const sinTenant = (res: Response) => res.status(401).json({ success: false, error: "Sin sesión" });
const mal = (res: Response, e: unknown) => res.status(400).json({ success: false, error: String((e as any)?.message || e) });

/** POST /api/pos/activar — marca el negocio como tienda física. */
posRouter.post("/activar", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  try {
    await activarTiendaFisica(t);
    return res.json({ success: true, formato: "tienda_fisica" });
  } catch (e) { return mal(res, e); }
});

/** GET /api/pos/inventario — stock, valorizado y alertas de stock bajo. */
posRouter.get("/inventario", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  try {
    const inv = await inventarioDelNegocio(t);
    return res.json({ success: true, esTienda: await esTiendaFisica(t), ...inv });
  } catch (e) { return mal(res, e); }
});

/** POST /api/pos/entrada — suma mercadería. { productId, cantidad, motivo } */
posRouter.post("/entrada", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  try {
    const r = await registrarEntrada(t, Number(req.body?.productId), Number(req.body?.cantidad), req.body?.motivo, (req as any).tenant?.email);
    return res.json({ success: true, ...r });
  } catch (e) { return mal(res, e); }
});

/** POST /api/pos/ajustar — fija el saldo exacto (conteo físico). */
posRouter.post("/ajustar", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  try {
    const r = await ajustarStock(t, Number(req.body?.productId), Number(req.body?.nuevoSaldo), req.body?.motivo, (req as any).tenant?.email);
    return res.json({ success: true, ...r });
  } catch (e) { return mal(res, e); }
});

/** POST /api/pos/caja/abrir — { fondoInicial } */
posRouter.post("/caja/abrir", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  try {
    const caja = await abrirCaja(t, Number(req.body?.fondoInicial) || 0, (req as any).tenant?.email);
    return res.json({ success: true, caja });
  } catch (e) { return mal(res, e); }
});

/** GET /api/pos/caja — la caja abierta, si hay. */
posRouter.get("/caja", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  try {
    return res.json({ success: true, caja: await cajaAbierta(t) });
  } catch (e) { return mal(res, e); }
});

/** POST /api/pos/caja/cerrar — { contado, notas }: arqueo esperado vs. contado. */
posRouter.post("/caja/cerrar", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  try {
    const caja = await cerrarCaja(t, Number(req.body?.contado), (req as any).tenant?.email, req.body?.notas);
    return res.json({ success: true, caja });
  } catch (e) { return mal(res, e); }
});

/**
 * POST /api/pos/vender — la venta del mostrador.
 * { items: [{ productId, cantidad, descuentoPct?, impuestoPct? }],
 *   metodoPago, cliente?: { nombre, documento, correo, telefono } }
 * Descuenta stock, crea el pago confirmado y factura si hay sistema conectado.
 */
posRouter.post("/vender", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  try {
    const caja = await cajaAbierta(t).catch(() => null);
    const r = await venderEnTienda(t, {
      items: req.body?.items || [],
      metodoPago: req.body?.metodoPago || "efectivo",
      cliente: req.body?.cliente,
      cajaId: (caja as any)?.id ?? null,
      creadoPor: (req as any).tenant?.email,
    });
    return res.json({ success: true, ...r });
  } catch (e) { return mal(res, e); }
});

/** POST /api/pos/devolver — { pagoId, items: [{ productId, cantidad }], motivo } */
posRouter.post("/devolver", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  try {
    const r = await devolverVenta(t, Number(req.body?.pagoId), req.body?.items || [], req.body?.motivo, (req as any).tenant?.email);
    return res.json({ success: true, ...r });
  } catch (e) { return mal(res, e); }
});

/** GET /api/pos/reporte?desde=2026-10-01&hasta=2026-10-09 */
posRouter.get("/reporte", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  try {
    const r = await reporteVentas(t, { desde: String(req.query?.desde || ""), hasta: String(req.query?.hasta || "") });
    return res.json({ success: true, ...r });
  } catch (e) { return mal(res, e); }
});

/** GET /api/pos/exportar?formato=csv — plano para Excel o el contador. */
posRouter.get("/exportar", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  try {
    const r = await exportarVentas(t, {
      desde: String(req.query?.desde || ""), hasta: String(req.query?.hasta || ""),
      formato: (String(req.query?.formato || "json") === "csv" ? "csv" : "json"),
    });
    if (r.formato === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=ventas-pos.csv");
      return res.send(r.contenido);
    }
    return res.json({ success: true, ventas: JSON.parse(r.contenido) });
  } catch (e) { return mal(res, e); }
});
