/**
 * ============================================================
 * WEBHOOK DE META — UNA SOLA PUERTA PARA PÁGINA E INSTAGRAM
 * ============================================================
 *
 * Meta manda TODOS los eventos de un objeto ("page" o "instagram") a UNA sola
 * URL de callback, la que esté configurada en el panel de la app. Acá había
 * tres rutas (`/messenger/webhook`, `/comments/webhook`, `/lead-ads/webhook`)
 * y cada una entendía solo una parte:
 *
 *   - la de Messenger no procesaba leads; la de leads no procesaba mensajes
 *     ni comentarios: según cuál estuviera en el panel, se perdía el resto.
 *   - NINGUNA le pasaba el negocio a los comentarios, y el ChannelManager
 *     descarta todo mensaje sin negocio ("mensaje sin negocio: no se
 *     responde"): ningún comentario de Facebook se contestó nunca.
 *   - Messenger usaba un servicio armado con el negocio de relleno: los
 *     mensajes de la página de cualquier negocio se guardaban en el 1.
 *   - El objeto "instagram" se ignoraba entero (`object !== "page"`):
 *     ningún DM ni comentario de Instagram entraba.
 *   - Se contestaba ANTES de devolver el 200. Una respuesta de IA tarda más
 *     que la paciencia de Meta, que entonces reintenta: respuesta duplicada.
 *
 * Ahora las tres rutas llaman a `procesarWebhookDeMeta`, que lee el evento,
 * resuelve el negocio por la cuenta que lo recibió (`entry.id`) y lo atiende
 * con los servicios de ESE negocio.
 */
import { logger } from "./logger";
import { tenantManager, type TenantContext } from "./tenantManager";

export type CanalMeta = "facebook" | "instagram";

export type EventoDeMeta =
  | { tipo: "mensaje"; canal: CanalMeta; cuentaId: string; remitente: string; nombre: string; texto: string; id: string }
  | { tipo: "comentario"; canal: CanalMeta; cuentaId: string; remitente: string; nombre: string; texto: string; id: string; postId: string; parentId: string | null }
  | { tipo: "lead"; canal: "facebook"; cuentaId: string; leadgenId: string; formId: string | null; adId: string | null };

/**
 * Del cuerpo crudo del webhook a eventos con todo lo necesario para
 * atenderlos. Puro: no toca la base ni la red (se prueba solo).
 *
 * Se descartan acá, y no más adelante, los eventos que NO son de un cliente:
 * ecos de lo que mandó la propia página, acuses de entrega/lectura, y los
 * comentarios que escribió la propia página o cuenta (su propia respuesta
 * pública vuelve como comentario nuevo: contestarla sería un bucle).
 */
export function leerEventosDeMeta(body: any): EventoDeMeta[] {
  const objeto = String(body?.object || "");
  if (objeto !== "page" && objeto !== "instagram") return [];
  const canal: CanalMeta = objeto === "instagram" ? "instagram" : "facebook";
  const eventos: EventoDeMeta[] = [];

  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    const cuentaId = String(entry?.id || "");

    for (const ev of [...(entry?.messaging || []), ...(entry?.standby || [])]) {
      const remitente = String(ev?.sender?.id || "");
      if (!remitente || remitente === cuentaId) continue;
      if (ev?.message?.is_echo || ev?.delivery || ev?.read) continue;
      const texto = String(ev?.message?.text || ev?.postback?.payload || "").trim();
      if (!texto) continue;
      eventos.push({
        tipo: "mensaje",
        canal,
        cuentaId,
        remitente,
        nombre: String(ev?.sender?.name || ev?.message?.from?.name || (canal === "instagram" ? "Usuario de Instagram" : "Usuario de Facebook")),
        texto,
        id: String(ev?.message?.mid || ev?.postback?.mid || `${remitente}:${ev?.timestamp || ""}:${texto}`),
      });
    }

    for (const change of entry?.changes || []) {
      const v = change?.value || {};
      if (canal === "facebook" && change?.field === "feed") {
        if (v.item !== "comment" || v.verb !== "add") continue;
        const remitente = String(v.from?.id || "");
        if (!remitente || remitente === cuentaId || !v.comment_id || !v.message) continue;
        eventos.push({
          tipo: "comentario",
          canal,
          cuentaId,
          remitente,
          nombre: String(v.from?.name || "Usuario"),
          texto: String(v.message),
          id: String(v.comment_id),
          postId: String(v.post_id || ""),
          parentId: v.parent_id ? String(v.parent_id) : null,
        });
      } else if (canal === "instagram" && change?.field === "comments") {
        // Instagram: { id, text, from: { id, username }, media: { id }, parent_id }
        const remitente = String(v.from?.id || "");
        if (!remitente || remitente === cuentaId || !v.id || !v.text) continue;
        eventos.push({
          tipo: "comentario",
          canal,
          cuentaId,
          remitente,
          nombre: String(v.from?.username || "Usuario de Instagram"),
          texto: String(v.text),
          id: String(v.id),
          postId: String(v.media?.id || ""),
          parentId: v.parent_id ? String(v.parent_id) : null,
        });
      } else if (canal === "facebook" && change?.field === "leadgen") {
        if (!v.leadgen_id) continue;
        eventos.push({
          tipo: "lead",
          canal: "facebook",
          cuentaId: String(v.page_id || cuentaId),
          leadgenId: String(v.leadgen_id),
          formId: v.form_id ? String(v.form_id) : null,
          adId: v.ad_id ? String(v.ad_id) : null,
        });
      }
    }
  }
  return eventos;
}

/** El negocio dueño de la cuenta de Instagram, preguntándole a cada página. */
export async function tenantDeInstagram(igId: string): Promise<{ id: number; tenant: TenantContext } | null> {
  const buscado = String(igId || "").trim();
  if (!buscado) return null;
  const { db, tenants } = await import("@workspace/db");
  const { FacebookMessengerService } = await import("./facebook-messenger");
  const filas = await db.select({ id: tenants.id }).from(tenants);
  for (const f of filas) {
    const t = await tenantManager.getTenantById(Number(f.id)).catch(() => null);
    if (!t) continue;
    const ig = await new FacebookMessengerService(t).cuentaDeInstagram();
    if (ig && ig === buscado) return { id: Number(f.id), tenant: t };
  }
  return null;
}

async function negocioDe(ev: EventoDeMeta): Promise<{ id: number; tenant: TenantContext } | null> {
  if (ev.canal === "instagram") return tenantDeInstagram(ev.cuentaId);
  const { tenantDePagina } = await import("./facebook-leads");
  return tenantDePagina(ev.cuentaId);
}

/** Mensajes ya atendidos (Meta reintenta si tarda): por `mid`. */
const MENSAJES_VISTOS = new Set<string>();
function mensajeNuevo(clave: string): boolean {
  if (MENSAJES_VISTOS.has(clave)) return false;
  MENSAJES_VISTOS.add(clave);
  if (MENSAJES_VISTOS.size > 5000) {
    const primero = MENSAJES_VISTOS.values().next().value;
    if (primero !== undefined) MENSAJES_VISTOS.delete(primero);
  }
  return true;
}

export async function atenderEvento(ev: EventoDeMeta): Promise<{ ok: boolean; motivo?: string; tenantId?: number }> {
  if (ev.tipo === "lead") {
    const { procesarLeadDeFormulario } = await import("./facebook-leads");
    const r = await procesarLeadDeFormulario({ leadgenId: ev.leadgenId, pageId: ev.cuentaId, formId: ev.formId, adId: ev.adId });
    return { ok: r.ok, motivo: r.motivo, tenantId: r.tenantId };
  }

  if (ev.tipo === "mensaje" && !mensajeNuevo(`${ev.canal}:${ev.id}`)) {
    return { ok: false, motivo: "mensaje repetido (reintento de Meta)" };
  }

  const dueno = await negocioDe(ev);
  if (!dueno) {
    logger.warn({ canal: ev.canal, tipo: ev.tipo, cuentaId: ev.cuentaId }, "[MetaWebhook] Ningún negocio tiene conectada esta cuenta: el evento no se atiende");
    return { ok: false, motivo: "ningún negocio tiene conectada esta cuenta" };
  }

  if (ev.tipo === "mensaje") {
    const { FacebookMessengerService } = await import("./facebook-messenger");
    await new FacebookMessengerService(dueno.tenant).handleIncomingMessage(ev.remitente, ev.texto, ev.nombre, dueno.id, ev.canal);
    return { ok: true, tenantId: dueno.id };
  }

  // Comentario. El registro de "ya visto" lo lleva el propio servicio, que es
  // el que comparten el webhook y el sondeo del panel.
  const { FacebookCommentsService } = await import("./facebook-comments");
  await new FacebookCommentsService(dueno.tenant).handleIncomingComment(
    {
      id: ev.id,
      message: ev.texto,
      postId: ev.postId,
      parentId: ev.parentId,
      from: { id: ev.remitente, name: ev.nombre },
      createdTime: new Date().toISOString(),
    },
    dueno.id,
    ev.canal,
  );
  return { ok: true, tenantId: dueno.id };
}

/**
 * Atiende todo lo que trae un webhook. Un evento que falla no frena a los
 * demás. Las rutas lo llaman DESPUÉS de devolver el 200 a Meta.
 */
export async function procesarWebhookDeMeta(body: any): Promise<{ atendidos: number; fallidos: number }> {
  const eventos = leerEventosDeMeta(body);
  let atendidos = 0;
  let fallidos = 0;
  for (const ev of eventos) {
    try {
      const r = await atenderEvento(ev);
      if (r.ok) atendidos++;
      logger.info({ canal: ev.canal, tipo: ev.tipo, cuentaId: ev.cuentaId, ...r }, "[MetaWebhook] Evento procesado");
    } catch (err) {
      fallidos++;
      logger.error({ err, canal: ev.canal, tipo: ev.tipo, cuentaId: ev.cuentaId }, "[MetaWebhook] Error atendiendo un evento");
    }
  }
  return { atendidos, fallidos };
}

/** Solo para las pruebas. */
export function _olvidarMensajesVistos(): void {
  MENSAJES_VISTOS.clear();
}
