/**
 * PAGOS PENDIENTES DE APROBACION -- vista de panel
 *
 * Antes la unica forma de aprobar un comprobante era responder
 * "APROBAR 47" por WhatsApp. Si ese aviso se perdia entre las
 * conversaciones del dia, el pago se quedaba en pending para siempre
 * y el cliente jamas recibia su acceso. Esta ruta expone la misma
 * logica (verificacion-pago.ts) para que el admin pueda ver y resolver
 * los comprobantes pendientes desde el dashboard, sin depender de
 * encontrar el mensaje correcto en WhatsApp.
 */
import { Router, type IRouter } from "express";
import { db, payments, conversations, products } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { type TenantRequest } from "../lib/tenantManager";
import { logger } from "../lib/logger";
import { sendError } from "../lib/error-handler";
import { ERROR_CODES } from "../lib/error-codes";
import {
  aplicarDecision,
  mensajeDeEntrega,
} from "../lib/verificacion-pago";

const router: IRouter = Router();

function tenantIdOf(req: TenantRequest): number | null {
  const id = req?.tenant?.id;
  return typeof id === "number" ? id : null;
}

/**
 * Comprobantes pendientes de este negocio, con el nombre del contacto
 * y del producto ya resueltos -- para no obligar al panel a pedirlos
 * aparte.
 * GET /api/payment-approvals/pending
 */
router.get("/pending", async (req: TenantRequest, res) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED, 401);

    const rows = await db
      .select({
        id: payments.id,
        conversationId: payments.conversationId,
        productId: payments.productId,
        amount: payments.amount,
        currency: payments.currency,
        method: payments.method,
        payerName: payments.payerName,
        payerPhone: payments.payerPhone,
        proofUrl: payments.proofUrl,
        notes: payments.notes,
        createdAt: payments.createdAt,
        contactName: conversations.contactName,
        productName: products.name,
      })
      .from(payments)
      .leftJoin(conversations, eq(payments.conversationId, conversations.id))
      .leftJoin(products, eq(payments.productId, products.id))
      .where(and(eq(payments.tenantId, tenantId), eq(payments.status, "pending")))
      .orderBy(desc(payments.id));

    return res.json({ pagos: rows });
  } catch (error: any) {
    logger.error({ err: error?.message }, "[PaymentApprovals] No se pudo listar pendientes");
    return sendError(res, ERROR_CODES.INTERNAL_SERVER_ERROR, 500);
  }
});

/**
 * Aprobar o rechazar un comprobante desde el panel.
 * POST /api/payment-approvals/:id/decision  { accion: "aprobar" | "rechazar" }
 *
 * Misma regla que por WhatsApp: solo toca pagos `pending` de ESTE
 * tenant, y si se aprueba, la entrega se intenta en el momento -- no se
 * le dice al cliente que tiene su acceso sin haberlo mandado.
 */
router.post("/:id/decision", async (req: TenantRequest, res) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED, 401);

    const pagoId = Number(req.params.id);
    const accion = req.body?.accion === "rechazar" ? "rechazar" : "aprobar";
    if (!Number.isFinite(pagoId)) {
      return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA, 400);
    }

    // El pago tiene que ser de este negocio: sin este chequeo, el admin
    // de un tenant podria aprobar la entrega de un pago de otro con solo
    // acertarle al id.
    const [pago] = await db
      .select({ id: payments.id, tenantId: payments.tenantId, status: payments.status })
      .from(payments)
      .where(eq(payments.id, pagoId))
      .limit(1);
    if (!pago || pago.tenantId !== tenantId) {
      return sendError(res, ERROR_CODES.NOT_FOUND, 404);
    }

    const r = await aplicarDecision(pagoId, accion, `panel:tenant:${tenantId}`);
    if (!r.ok) {
      return res.json({ ok: false, mensaje: r.mensajeParaElAdmin });
    }

    let mensajeCliente = r.mensajeParaElCliente;
    let entregaSinEnlace = false;
    if (r.aprobado && r.conversationId) {
      const entrega = r.productId ? await mensajeDeEntrega(r.productId) : null;
      if (entrega) {
        mensajeCliente = entrega;
      } else {
        entregaSinEnlace = true;
      }
      // Se manda por WhatsApp al cliente igual que hace el flujo del admin,
      // para que aprobar desde el panel tenga el mismo efecto que aprobar
      // por WhatsApp.
      try {
        const { getWhatsAppForTenant } = await import("../lib/whatsapp-factory");
        const [conv] = await db
          .select({ phone: conversations.contactPhone })
          .from(conversations)
          .where(eq(conversations.id, r.conversationId))
          .limit(1);
        if (conv?.phone && mensajeCliente) {
          await getWhatsAppForTenant(tenantId, (req as any).tenant).sendText(conv.phone, mensajeCliente);
        }
      } catch (e: any) {
        logger.warn({ err: e?.message, pagoId }, "[PaymentApprovals] No se pudo notificar al cliente por WhatsApp");
      }
    }

    logger.info({ pagoId, accion, tenantId }, "[PaymentApprovals] Decision aplicada desde el panel");
    return res.json({
      ok: true,
      aprobado: r.aprobado,
      entregaSinEnlace,
      mensajeCliente,
    });
  } catch (error: any) {
    logger.error({ err: error?.message }, "[PaymentApprovals] No se pudo aplicar la decision");
    return sendError(res, ERROR_CODES.INTERNAL_SERVER_ERROR, 500);
  }
});

export default router;
