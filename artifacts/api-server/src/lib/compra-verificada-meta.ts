/**
 * Avisarle a Meta que hubo una COMPRA REAL (Conversions API, evento Purchase).
 * ===========================================================================
 *
 * Punto único de salida del Purchase del lado servidor. La regla es dura y
 * viene de un error ya pagado: el motor v1 (agent.ts, intent `confirmation`)
 * mandaba el Purchase con el pago PENDIENTE — el cliente decía "sí" y Meta
 * aprendía de una venta que todavía no existía. Desde el 2026-10-01 el
 * Purchase sale SOLO desde un pago verificado:
 *
 *   · pasarelas (routes/webhooks.ts, re-consulta a MercadoPago/PayPal),
 *   · aprobación del comprobante (lib/verificacion-pago.ts, admin o sistema),
 *   · confirm_transfer_payment (Atlas, el admin vio la plata en su cuenta).
 *
 * Nunca lanza: si falla, se loguea y el flujo real (entrega, notificación)
 * sigue. Sin píxel o sin token del tenant, no hace nada.
 */
import { logger } from "./logger";
import { tenantManager } from "./tenantManager";

export interface CompraVerificada {
  tenantId: number;
  productId: number;
  amount: number;
  currency?: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  /** De dónde salió la verificación: "pasarela" | "comprobante" | "transferencia". */
  origen: string;
}

/**
 * Permite probar sin base: en producción se resuelve el tenant con el
 * tenantManager; en tests se pasa un resolutor falso.
 */
export async function avisarCompraRealAMeta(
  compra: CompraVerificada,
  resolverTenant: (tenantId: number) => Promise<any> = (id) => tenantManager.getTenantById(id),
): Promise<boolean> {
  try {
    const tenant = await resolverTenant(compra.tenantId);
    const fb: any = (tenant as any)?.facebook || {};
    if (!fb.pixelId || !fb.accessToken) {
      logger.debug({ tenantId: compra.tenantId }, "[Compra→Meta] Tenant sin píxel o sin token: no se envía el evento de compra");
      return false;
    }
    const { sendPurchaseEvent } = await import("./meta-conversions-api");
    const ok = await sendPurchaseEvent({
      pixelId: fb.pixelId,
      accessToken: fb.accessToken,
      value: Number(compra.amount) || 0,
      currency: compra.currency || "COP",
      contentIds: [compra.productId],
      customerPhone: compra.customerPhone || undefined,
      customerEmail: compra.customerEmail || undefined,
    });
    logger.info(
      { tenantId: compra.tenantId, productId: compra.productId, ok, origen: compra.origen },
      ok ? "[Compra→Meta] Compra verificada informada a Meta" : "[Compra→Meta] Meta no confirmó el evento de compra",
    );
    return ok;
  } catch (e: any) {
    logger.warn({ err: e?.message, origen: compra.origen }, "[Compra→Meta] No se pudo informar la compra a Meta");
    return false;
  }
}
