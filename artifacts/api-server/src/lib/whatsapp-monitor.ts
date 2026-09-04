// ────────────────────────────────────────────────────────────────────────────
// whatsapp-monitor.ts — Monitoreo y limpieza de instancias inactivas
//
// Se ejecuta periódicamente y:
//   1. Detecta instancias inactivas (sin conexión por más de N minutos)
//   2. Cierra instancias huérfanas para liberar memoria
//   3. Reporta métricas por tenant (estado, última conexión, # mensajes)
// ────────────────────────────────────────────────────────────────────────────

import { listWhatsAppInstances, disposeWhatsAppForTenant, getWhatsAppForTenant } from "./whatsapp-factory";
import { tenantManager } from "./tenantManager";
import { logger } from "./logger";

interface InstanceMetrics {
  tenantId: number;
  state: string;
  phoneNumber: string | null;
  connectedAt: string | null;
  lastError: string | null;
  ageMinutes: number | null;
  qrPending: boolean;
}

const INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutos

export function getMetricsForAll(): InstanceMetrics[] {
  const list = listWhatsAppInstances();
  const now = Date.now();
  return list.map(({ tenantId, status }) => {
    let ageMinutes: number | null = null;
    if (status.connectedAt) {
      const ts = new Date(status.connectedAt).getTime();
      ageMinutes = Math.round((now - ts) / 60000);
    }
    return {
      tenantId,
      state: status.state,
      phoneNumber: status.phoneNumber,
      connectedAt: status.connectedAt,
      lastError: status.lastError,
      ageMinutes,
      qrPending: status.state === "qr",
    };
  });
}

/**
 * Detiene instancias con sesión realmente muerta: logout confirmado, o
 * "disconnected" sin haber llegado a conectar nunca. NO desconecta instancias
 * activas, con QR pendiente, ni instancias en "error" reintentando la
 * reconexión (esas se resuelven solas via el backoff del manager).
 */
export async function cleanupInactiveInstances(): Promise<{ removed: number[]; kept: number[] }> {
  const list = listWhatsAppInstances();
  const removed: number[] = [];
  const kept: number[] = [];

  for (const { tenantId, status } of list) {
    // "error" ya NO se trata como obsoleto por sí solo: es también el estado
    // mientras el manager está reintentando la reconexión con backoff (ver
    // whatsappManagerByTenant.ts) -- tratarlo como "stale" incondicionalmente
    // hacía que esta limpieza, que corre cada 5 min, matara reconexiones que
    // estaban en curso y a punto de resolverse solas, obligando a reiniciar
    // desde cero (o a intervención manual) en vez de dejarlas terminar. Solo
    // se limpia si el motivo es un logout real (sesión cerrada, no hay nada
    // que reintentar) o si nunca llegó a conectar.
    const isStale =
      (status.state === "disconnected" && !status.connectedAt) ||
      status.lastError?.toLowerCase().includes("loggedout");

    if (isStale) {
      try {
        await disposeWhatsAppForTenant(tenantId);
        removed.push(tenantId);
        logger.info({ tenantId }, "[WhatsApp-Monitor] Instancia inactiva eliminada");
      } catch (e) {
        logger.warn({ err: e, tenantId }, "[WhatsApp-Monitor] Error eliminando instancia");
      }
    } else {
      kept.push(tenantId);
    }
  }

  return { removed, kept };
}

/**
 * Health-check del sistema multi-tenant.
 * Devuelve un resumen con cantidad de instancias por estado.
 */
export function healthSummary(): {
  total: number;
  byState: Record<string, number>;
  staleErrors: number;
} {
  const metrics = getMetricsForAll();
  const byState: Record<string, number> = {};
  let staleErrors = 0;
  for (const m of metrics) {
    byState[m.state] = (byState[m.state] || 0) + 1;
    if (m.state === "error" && m.lastError?.toLowerCase().includes("loggedout")) {
      staleErrors++;
    }
  }
  return { total: metrics.length, byState, staleErrors };
}

let monitorInterval: NodeJS.Timeout | null = null;

/**
 * Inicia el monitor periódico. Idempotente: si ya está corriendo, no hace nada.
 */
export function startWhatsAppMonitor(intervalMs: number = 5 * 60 * 1000) {
  if (monitorInterval) return;
  monitorInterval = setInterval(async () => {
    try {
      const result = await cleanupInactiveInstances();
      if (result.removed.length > 0) {
        logger.info({ removed: result.removed, kept: result.kept }, "[WhatsApp-Monitor] Limpieza periódica");
      }
    } catch (e) {
      logger.warn({ err: e }, "[WhatsApp-Monitor] Error en limpieza periódica");
    }
  }, intervalMs);
  logger.info({ intervalMs }, "[WhatsApp-Monitor] Monitor iniciado");
}

/**
 * Detiene el monitor periódico.
 */
export function stopWhatsAppMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    logger.info("[WhatsApp-Monitor] Monitor detenido");
  }
}
