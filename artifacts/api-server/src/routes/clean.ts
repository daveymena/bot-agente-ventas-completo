import { Router } from "express";
import { db, conversations, messages, leads } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendError } from "../lib/error-handler";
import { ERROR_CODES } from "../lib/error-codes";
import { requireAdmin, type TenantRequest } from "../lib/tenantManager";

const router = Router();

/**
 * Borrado de las interacciones (conversaciones, mensajes y prospectos) DEL
 * NEGOCIO QUE LLAMA. Herramienta de mantenimiento para dejar una cuenta
 * limpia después de probar.
 *
 * Antes esto era un borrado global sin dueño: `db.delete(messages)` /
 * `db.delete(conversations)` / `db.delete(leads)` / `db.delete(activityEvents)`
 * SIN ningún filtro por tenant, y la ruta solo exigía tener sesión (no ser
 * admin). O sea que cualquier cliente logueado podía borrar las
 * conversaciones, los mensajes y los prospectos de TODOS los negocios de la
 * plataforma con un solo POST. Ahora exige ser administrador y solo toca los
 * datos del negocio autenticado.
 *
 * También hacía dos UPDATE masivos sobre `products` (sin filtro de tenant)
 * que reescribían la imagen de los productos de todo el mundo apuntándolas a
 * una foto de stock de Unsplash. Eso se eliminó: no es "reparar", es pisar
 * los datos de los clientes con una imagen ajena. Si un producto no tiene
 * foto, la app ya genera una propia con IA (ver ai-product-image.ts).
 */
router.post("/deep-clean", requireAdmin(), async (req: TenantRequest, res) => {
  try {
    const { confirm = false } = req.body;

    // sendError ya deduce el HTTP status del propio código de error
    // (ERROR_HTTP_STATUS); el tercer argumento son "details", no el status --
    // pasarle 400/401/500 ahí no cambiaba nada y rompía el tipo.
    if (!confirm) {
      return sendError(res, ERROR_CODES.CLEAN_CONFIRMATION_REQUIRED);
    }

    const tenantId = req.tenant?.id;
    if (!tenantId) return sendError(res, ERROR_CODES.UNAUTHORIZED);

    logger.info({ tenantId }, "[Clean] Borrando interacciones del negocio");

    // Los mensajes no tienen tenant_id propio: cuelgan de la conversación,
    // así que hay que resolver primero cuáles son de este negocio.
    const propias = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.tenantId, tenantId));
    const ids = propias.map((c: { id: number }) => c.id);

    if (ids.length > 0) {
      await db.delete(messages).where(inArray(messages.conversationId, ids));
    }
    await db.delete(conversations).where(eq(conversations.tenantId, tenantId));
    await db.delete(leads).where(eq(leads.tenantId, tenantId));

    // activity_events NO se toca: esa tabla no tiene columna de negocio, así
    // que no hay forma de borrar solo las de este tenant sin llevarse por
    // delante el historial de actividad de los demás.

    logger.info({ tenantId, conversaciones: ids.length }, "[Clean] Limpieza completada");

    return res.json({
      success: true,
      message: `Se borraron ${ids.length} conversaciones con sus mensajes, y los prospectos de tu negocio. Los productos no se tocaron.`,
    });
  } catch (e: any) {
    logger.error(e, "[Clean] Error en Deep Clean");
    return sendError(res, ERROR_CODES.INTERNAL_SERVER_ERROR);
  }
});

export default router;
