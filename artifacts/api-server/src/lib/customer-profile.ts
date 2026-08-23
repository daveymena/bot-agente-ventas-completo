/**
 * MEMORIA COMERCIAL DEL CLIENTE — lo que sobrevive a la conversación.
 *
 * El problema, medido en producción el 2026-08-23 (conversación 1): el mismo
 * cliente pidió el curso de piano el 16, el 17, el 23 a las 02:34, a las 02:46
 * y a las 03:22. Cada vez recibió la ficha como si fuera la primera. El bot
 * tenía `sentProductIds`, pero vive en ConversationMemory y se arma leyendo
 * ESA conversación: en un chat nuevo arranca vacío.
 *
 * Acá el dueño de la memoria es el LEAD, no la conversación. Si vuelve en tres
 * semanas, el vendedor se acuerda.
 *
 * Regla que atraviesa todo: solo entra lo que el cliente DIJO o hizo. Nada
 * inferido. Es la misma regla del resto del motor -- un perfil con datos
 * inventados es peor que no tener perfil, porque el agente los afirma.
 */
import { db, leads } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";
import type { CommercialProfile } from "@workspace/db";

/** Cuántos productos y objeciones se recuerdan. Más que esto no ayuda a
 *  vender y sí infla el prompt, que ya se recorta por tamaño. */
const TOPE_PRODUCTOS = 8;
const TOPE_OBJECIONES = 6;

export const PERFIL_VACIO: CommercialProfile = {};

/** Normaliza el teléfono para comparar: WhatsApp lo manda con sufijos. */
export function normalizarTelefono(tel: string | null | undefined): string {
  return String(tel || "").replace(/\D/g, "");
}

// ─── Mezcla (lógica pura, testeable sin base) ────────────────────────────────

/**
 * Agrega un producto a los ya vistos, sin duplicar y sin crecer para siempre.
 * Si ya estaba, se refresca la fecha: interesa CUÁNDO lo vio por última vez.
 */
export function agregarProductoVisto(
  perfil: CommercialProfile,
  producto: { id: number; nombre: string },
  ahora: string,
): CommercialProfile {
  const previos = (perfil.productosVistos || []).filter((p) => p.id !== producto.id);
  return {
    ...perfil,
    productosVistos: [{ id: producto.id, nombre: producto.nombre, fecha: ahora }, ...previos].slice(0, TOPE_PRODUCTOS),
  };
}

/**
 * Registra una objeción. No se deduplica por tipo a propósito: que alguien
 * diga DOS veces que está caro es información distinta a decirlo una vez.
 */
export function agregarObjecion(
  perfil: CommercialProfile,
  tipo: string,
  ahora: string,
): CommercialProfile {
  if (!tipo || tipo === "none") return perfil;
  return {
    ...perfil,
    objeciones: [{ tipo, fecha: ahora }, ...(perfil.objeciones || [])].slice(0, TOPE_OBJECIONES),
  };
}

/** Datos de envío que ya dio (vienen del flujo de contraentrega, no de una
 *  suposición). Nunca se pisan con vacío. */
export function guardarUbicacion(
  perfil: CommercialProfile,
  datos: { ciudad?: string | null; departamento?: string | null },
): CommercialProfile {
  const ciudad = String(datos.ciudad || "").trim();
  const departamento = String(datos.departamento || "").trim();
  return {
    ...perfil,
    ...(ciudad ? { ciudad } : {}),
    ...(departamento ? { departamento } : {}),
  };
}

/** Cuántos días pasaron desde la última vez que escribió. null si es nuevo. */
export function diasDesdeLaUltimaVez(perfil: CommercialProfile, ahora: Date): number | null {
  if (!perfil.ultimaInteraccion) return null;
  const antes = new Date(perfil.ultimaInteraccion).getTime();
  if (!Number.isFinite(antes)) return null;
  const dias = Math.floor((ahora.getTime() - antes) / 86400000);
  return dias >= 0 ? dias : null;
}

/**
 * ¿Vale la pena contarle al agente que este cliente no es nuevo?
 *
 * Solo si hay algo REAL que decir. Un perfil recién creado, sin productos ni
 * objeciones, no aporta nada al turno y solo gasta prompt.
 */
export function tieneAlgoQueRecordar(perfil: CommercialProfile | null | undefined): boolean {
  if (!perfil) return false;
  return (perfil.productosVistos?.length ?? 0) > 0
    || (perfil.objeciones?.length ?? 0) > 0
    || !!perfil.ciudad;
}

// ─── Persistencia ────────────────────────────────────────────────────────────

export async function cargarPerfil(leadId: number | null | undefined): Promise<CommercialProfile> {
  if (!leadId) return PERFIL_VACIO;
  try {
    const [row] = await db
      .select({ perfil: leads.commercialProfile })
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    const p = row?.perfil as CommercialProfile | null;
    return p && typeof p === "object" ? p : PERFIL_VACIO;
  } catch (err: any) {
    // Que falle leer el perfil no puede dejar sin respuesta al cliente: es
    // memoria de apoyo, no parte del camino de la venta.
    logger.warn({ err: err?.message, leadId }, "[CustomerProfile] No se pudo leer el perfil");
    return PERFIL_VACIO;
  }
}

export async function guardarPerfil(
  leadId: number | null | undefined,
  perfil: CommercialProfile,
): Promise<void> {
  if (!leadId) return;
  try {
    await db
      .update(leads)
      .set({ commercialProfile: { ...perfil, actualizado: new Date().toISOString() } })
      .where(eq(leads.id, leadId));
  } catch (err: any) {
    logger.warn({ err: err?.message, leadId }, "[CustomerProfile] No se pudo guardar el perfil");
  }
}

/** Busca el lead de un teléfono dentro de un negocio. */
export async function leadDeTelefono(
  tenantId: number | null | undefined,
  telefono: string,
): Promise<number | null> {
  const tel = normalizarTelefono(telefono);
  if (!tenantId || !tel) return null;
  try {
    const [row] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), eq(leads.phone, telefono)))
      .limit(1);
    return row?.id ?? null;
  } catch {
    return null;
  }
}
