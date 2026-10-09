/**
 * Push del negocio (Web Push VAPID, sin Firebase).
 *
 * `avisarAlDueno` llama a `enviarPushAlDueno` además de WhatsApp/Telegram:
 * el dueño recibe el aviso en el celular aunque no esté mirando el chat.
 * Requiere VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT en el entorno.
 */
import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import { db, pushSubscriptions } from "@workspace/db";
import { logger } from "./logger";

let configurado = false;

export function pushConfigurado(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function asegurar(): boolean {
  if (configurado) return true;
  if (!pushConfigurado()) return false;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:soporte@ventasproia.com",
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    configurado = true;
    return true;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[Push] VAPID inválido");
    return false;
  }
}

export interface AvisoPush {
  titulo: string;
  cuerpo: string;
  /** Ruta dentro de la app (ej. /conversations). */
  url?: string;
  tag?: string;
  accion?: string;
}

export async function guardarSuscripcion(
  tenantId: number,
  s: { endpoint: string; keys: { p256dh: string; auth: string } },
  dispositivo?: string,
): Promise<void> {
  const prev = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint)).limit(1);
  if (prev.length > 0) {
    await db.update(pushSubscriptions)
      .set({ tenantId, p256dh: s.keys.p256dh, auth: s.keys.auth, dispositivo: dispositivo || null, activo: true, updatedAt: new Date() } as any)
      .where(eq(pushSubscriptions.endpoint, s.endpoint));
    return;
  }
  await db.insert(pushSubscriptions).values({ tenantId, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, dispositivo: dispositivo || null } as any);
}

export async function quitarSuscripcion(endpoint: string): Promise<void> {
  await db.update(pushSubscriptions).set({ activo: false } as any).where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function enviarPushAlDueno(tenantId: number, aviso: AvisoPush): Promise<{ enviadas: number; fallidas: number }> {
  const r = { enviadas: 0, fallidas: 0 };
  if (!asegurar()) return r;
  let subs: any[] = [];
  try {
    subs = await db.select().from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.tenantId, tenantId), eq(pushSubscriptions.activo, true as any)));
  } catch (e: any) {
    logger.warn({ tenantId, err: e?.message }, "[Push] no se pudieron leer suscripciones");
    return r;
  }
  const payload = JSON.stringify({ titulo: aviso.titulo.slice(0, 80), cuerpo: aviso.cuerpo.slice(0, 180), url: aviso.url || "/conversations", tag: aviso.tag || "ventaspro", accion: aviso.accion });
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } } as any, payload);
      r.enviadas++;
    } catch (e: any) {
      r.fallidas++;
      // 404/410 = suscripción muerta (app desinstalada): se apaga sola.
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        try { await quitarSuscripcion(s.endpoint); } catch { /* noop */ }
      } else {
        logger.warn({ tenantId, err: e?.message }, "[Push] envío falló");
      }
    }
  }
  return r;
}
