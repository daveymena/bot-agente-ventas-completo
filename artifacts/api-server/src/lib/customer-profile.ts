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


/**
 * Las formas en que el MISMO teléfono puede estar guardado.
 *
 * `conversations` se busca por `contactPhone` en tres lugares distintos y cada
 * uno traía el número como le llegaba: Baileys lo entrega en dígitos
 * (573042748687), pero por la API y por el panel entra como lo escribió una
 * persona (+57 304 274 8687). Como la comparación es exacta, el mismo cliente
 * terminaba con DOS conversaciones -- y cada una con su historial.
 *
 * Ese es el efecto que se ve desde afuera: el cliente vuelve a escribir y el
 * bot arranca de cero, sin acordarse de nada de lo anterior. No perdió la
 * memoria: está leyendo la otra fila.
 *
 * Devuelve las variantes a comparar en vez de normalizar y listo, porque en la
 * base YA hay filas guardadas de las dos formas. Normalizar solo al escribir
 * arregla lo que viene y deja huérfano lo que ya está.
 */
export function variantesDeTelefono(tel: string | null | undefined): string[] {
  const crudo = String(tel || "").trim();
  const solaDigitos = normalizarTelefono(crudo);
  const variantes = new Set<string>();
  if (crudo) variantes.add(crudo);
  if (solaDigitos) variantes.add(solaDigitos);
  return [...variantes];
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

/** Cuántos datos comerciales se recuerdan. Son siete en total, no hay tope real. */
const TOPE_DATOS = 12;

/**
 * Registra qué datos comerciales se le dijeron.
 *
 * No se duplica: saber el precio dos veces es saberlo. Se conserva la fecha
 * MÁS RECIENTE de cada dato, porque lo que importa para decidir si repetirlo es
 * cuándo fue la última vez que lo escuchó.
 */
export function agregarDatosDichos(
  perfil: CommercialProfile,
  datos: readonly string[],
  ahora: string,
): CommercialProfile {
  if (!datos || datos.length === 0) return perfil;
  const nuevos = new Set(datos.filter(Boolean));
  if (nuevos.size === 0) return perfil;

  const previos = (perfil.datosDichos || []).filter((d) => !nuevos.has(d.dato));
  return {
    ...perfil,
    datosDichos: [...[...nuevos].map((dato) => ({ dato, fecha: ahora })), ...previos].slice(0, TOPE_DATOS),
  };
}

/**
 * ¿Ya le dijimos este dato, en CUALQUIER chat y hace poco?
 *
 * Misma ventana que la ficha y por la misma razón: dentro de una semana se
 * acuerda; pasado el mes, recordárselo es servicio y no repetición.
 */
export function yaLeDijimos(
  perfil: CommercialProfile | null | undefined,
  dato: string,
  ahora: Date = new Date(),
  dias: number = DIAS_QUE_RECUERDA_LA_FICHA,
): boolean {
  if (!perfil || !dato) return false;
  const visto = (perfil.datosDichos || []).find((d) => d.dato === dato);
  if (!visto?.fecha) return false;
  const cuando = new Date(visto.fecha).getTime();
  if (!Number.isFinite(cuando)) return false;
  return (ahora.getTime() - cuando) / 86_400_000 <= dias;
}

/**
 * Cuántos días una ficha sigue contando como "ya la vio".
 *
 * Dentro de una semana el cliente se acuerda de lo que le mandaron, y
 * remandárselo es lo que hace que el bot parezca un folleto. Pasado ese plazo
 * ya no: volver a presentar el producto a alguien que no lo mira hace un mes es
 * lo correcto, no una repetición.
 *
 * Es un plazo elegido, no medido. Se deja acá con nombre para poder moverlo con
 * datos cuando los haya, en vez de que quede escondido en un `if`.
 */
export const DIAS_QUE_RECUERDA_LA_FICHA = 7;

/**
 * ¿Ya le mandamos la ficha de este producto hace poco, en CUALQUIER chat?
 *
 * ── Por qué hace falta ────────────────────────────────────────────────────
 *
 * Este archivo nació para arreglar que el cliente recibiera la misma ficha una
 * y otra vez, y el perfil se conectó al prompt. Pero la ficha no la escribe el
 * modelo: la arma el servidor, y esa decisión --`yaVioContenido`-- se seguía
 * tomando con `memory.sentProductIds`, que se construye leyendo SOLO la
 * conversación actual y arranca vacío en un chat nuevo.
 *
 * O sea: al modelo se le decía "ya la vio" y la plantilla se la mandaba igual.
 * El arreglo estaba hecho a medias, en el lado que menos se ve.
 */
export function vioLaFichaHacePoco(
  perfil: CommercialProfile | null | undefined,
  productoId: number | null | undefined,
  ahora: Date = new Date(),
  dias: number = DIAS_QUE_RECUERDA_LA_FICHA,
): boolean {
  if (!perfil || !productoId) return false;
  const visto = (perfil.productosVistos || []).find((p) => p.id === productoId);
  if (!visto?.fecha) return false;

  const cuando = new Date(visto.fecha).getTime();
  // Una fecha ilegible no puede hacer que el cliente se quede sin la ficha.
  if (!Number.isFinite(cuando)) return false;

  const transcurridos = (ahora.getTime() - cuando) / 86_400_000;
  // Un perfil con fecha futura (relojes desincronizados) cuenta como reciente.
  return transcurridos <= dias;
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
