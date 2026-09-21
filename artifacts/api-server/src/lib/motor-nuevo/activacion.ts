/**
 * LA BANDERA DEL MOTOR
 * ====================
 *
 * El motor nuevo se enciende POR NEGOCIO, no para todos de golpe. La razón es
 * la de siempre en este proyecto: el bot atiende clientes reales que están
 * comprando ahora mismo, y un despliegue que cambia la forma de vender de todos
 * a la vez no se puede revertir con un git revert (lo que ya se mandó, se
 * mandó).
 *
 * Orden de decisión, de más específico a más general:
 *
 *   1. `tenants.metadata.motorVendedor`  → lo que decidió el dueño (o Atlas).
 *   2. `MOTOR_VENDEDOR_TENANTS`          → lista de ids para probar ("3,7").
 *   3. `MOTOR_VENDEDOR_PORCENTAJE`       → porcentaje del tráfico, estable por
 *                                          negocio (el mismo negocio siempre
 *                                          cae del mismo lado, así que no
 *                                          "parpadea" entre motores).
 *   4. `MOTOR_VENDEDOR`                  → el valor por defecto: v1.
 *
 * Con la variable en `v1` (el defecto) NADA cambia para nadie aunque el código
 * nuevo esté en producción. Esa es la condición para poder desplegarlo.
 */

import { and, eq } from "drizzle-orm";
import { db, conversations, tenants } from "@workspace/db";
import { logger } from "../logger";
import { tenantManager } from "../tenantManager";

export type Motor = "v1" | "v2";

const CACHE_MS = 60_000;
const cache = new Map<number, { motor: Motor; expira: number }>();

const ENV_MOTOR = () => String(process.env.MOTOR_VENDEDOR || "v1").toLowerCase();
const ENV_TENANTS = () =>
  String(process.env.MOTOR_VENDEDOR_TENANTS || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
const ENV_PORCENTAJE = () => {
  const n = Number(process.env.MOTOR_VENDEDOR_PORCENTAJE || 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
};

/** Un hash estable: el mismo negocio cae siempre del mismo lado del porcentaje. */
function estable(numero: number): number {
  let h = 2166136261;
  const s = String(numero);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100;
}

function normalizar(valor: unknown): Motor | null {
  const v = String(valor || "").toLowerCase();
  return v === "v2" ? "v2" : v === "v1" ? "v1" : null;
}

function metadataDe(valor: unknown): Record<string, any> {
  if (!valor) return {};
  if (typeof valor === "string") {
    try {
      const p = JSON.parse(valor);
      return p && typeof p === "object" ? p : {};
    } catch {
      return {};
    }
  }
  return typeof valor === "object" ? (valor as Record<string, any>) : {};
}

export function invalidarMotor(tenantId?: number | null): void {
  if (tenantId == null) cache.clear();
  else cache.delete(tenantId);
}

/**
 * Qué motor atiende a este negocio.
 *
 * Nunca tira: si la base no contesta, se usa lo que diga el entorno. Una
 * bandera no puede dejar mudo al vendedor.
 */
export async function motorDelTenant(tenantId: number | null | undefined): Promise<Motor> {
  if (tenantId == null) return normalizar(ENV_MOTOR()) ?? "v1";

  const hit = cache.get(tenantId);
  if (hit && Date.now() < hit.expira) return hit.motor;

  let motor: Motor | null = null;
  try {
    const [fila] = await db
      .select({ metadata: tenants.metadata })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    motor = normalizar(metadataDe(fila?.metadata).motorVendedor);
  } catch (e: any) {
    logger.warn({ err: e?.message, tenantId }, "[MotorV2] no se pudo leer la bandera del negocio");
  }

  if (!motor && ENV_TENANTS().includes(tenantId)) motor = "v2";

  if (!motor && ENV_PORCENTAJE() > 0 && estable(tenantId) < ENV_PORCENTAJE()) motor = "v2";

  if (!motor) motor = normalizar(ENV_MOTOR()) ?? "v1";

  cache.set(tenantId, { motor, expira: Date.now() + CACHE_MS });
  return motor;
}

/** Versión sincrónica para el camino caliente: lee la caché y el entorno. */
export function motorEnCache(tenantId: number | null | undefined): Motor {
  if (tenantId == null) return normalizar(ENV_MOTOR()) ?? "v1";
  const hit = cache.get(tenantId);
  if (hit && Date.now() < hit.expira) return hit.motor;
  if (ENV_TENANTS().includes(tenantId)) return "v2";
  if (ENV_PORCENTAJE() > 0 && estable(tenantId) < ENV_PORCENTAJE()) return "v2";
  return normalizar(ENV_MOTOR()) ?? "v1";
}

/**
 * Lo que usa Atlas: prende o apaga el motor nuevo para UN negocio.
 *
 * Un valor que no sea v1/v2 se rechaza en vez de guardarse: escribir "v3" en
 * el perfil dejaría al negocio sin ATENDER a nadie (ningún motor lo reconoce),
 * y ese es el peor fallo posible porque no se ve como error en ningún lado.
 */
export async function fijarMotorDelTenant(
  tenantId: number,
  motor: Motor,
): Promise<{ ok: boolean; motor: Motor | null; motivo?: string }> {
  const pedido = normalizar(motor);
  if (!pedido) return { ok: false, motor: null, motivo: `motor inválido: ${String(motor)}. Es v1 o v2.` };

  const [fila] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!fila) return { ok: false, motor: null, motivo: "no existe el negocio" };

  const meta = metadataDe(fila.metadata);
  meta.motorVendedor = pedido;
  await db.update(tenants).set({ metadata: meta as any }).where(eq(tenants.id, tenantId));

  // Sin limpiar las cachés el cambio tarda un minuto en verse, justo cuando
  // el dueño está probando si funcionó.
  invalidarMotor(tenantId);
  try {
    tenantManager.clearCache();
  } catch {
    /* no crítico */
  }

  return { ok: true, motor: pedido };
}

/** Explicación legible, para Atlas y para el panel. */
export async function describirActivacion(tenantId: number): Promise<string> {
  const motor = await motorDelTenant(tenantId);
  const global = normalizar(ENV_MOTOR()) ?? "v1";
  const lista = ENV_TENANTS();
  const pct = ENV_PORCENTAJE();

  const partes = [
    `Este negocio está en el motor ${motor}.`,
    `Valor por defecto de la plataforma: ${global}.`,
    pct > 0 ? `Despliegue por porcentaje: ${pct}%.` : "Sin despliegue por porcentaje.",
    lista.length ? `Negocios marcados a mano: ${lista.join(", ")}.` : "Ningún negocio marcado a mano.",
  ];

  try {
    const [fila] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const explicito = normalizar(metadataDe(fila?.metadata).motorVendedor);
    if (explicito) partes.push(`Decisión explícita guardada para este negocio: ${explicito}.`);
  } catch {
    /* no crítico */
  }

  return partes.join(" ");
}

/**
 * Borra la memoria que el motor v2 tiene de UNA conversación: qué fichas ya le
 * mandó, qué precio le dio y qué le ofreció último.
 *
 * Se usa cuando el agente quedó trabado repitiendo algo o después de corregir
 * un dato del negocio. La validación de que la conversación sea de ESTE negocio
 * vive acá y no en la herramienta de Atlas: es la misma regla de aislamiento
 * que ya aplica el resto del sistema, y ponerla en un lugar que se puede probar
 * sin el plan de control evita que quede solo del lado del modelo.
 */
export async function olvidarMemoria(
  tenantId: number,
  conversationId: number,
): Promise<{ ok: boolean; motivo?: string }> {
  const id = Number(conversationId);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, motivo: "conversación inválida" };

  const [convo] = await db
    .select({ id: conversations.id, tenantId: conversations.tenantId })
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);

  if (!convo) return { ok: false, motivo: `no existe la conversación ${id}` };
  if (convo.tenantId !== tenantId) {
    return { ok: false, motivo: "esa conversación es de otro negocio" };
  }

  await db.update(conversations).set({ estadoAgente: null as any }).where(eq(conversations.id, id));
  return { ok: true };
}

/** Cuántas conversaciones de este negocio ya tienen memoria del motor v2. */
export async function conversacionesConMemoria(tenantId: number): Promise<number> {
  try {
    const { sql } = await import("drizzle-orm");
    const [fila] = await db
      .select({ total: sql<number>`count(*)` })
      .from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), sql`${conversations.estadoAgente} IS NOT NULL`));
    return Number((fila as any)?.total || 0);
  } catch {
    // La columna puede no existir si la migración todavía no corrió.
    return 0;
  }
}
