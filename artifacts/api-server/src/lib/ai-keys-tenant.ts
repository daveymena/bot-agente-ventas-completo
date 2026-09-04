/**
 * Claves de IA POR CLIENTE.
 *
 * El problema que resuelve, verificado en el esquema el 2026-08-19: la tabla
 * `settings` de Postgres NO tiene `tenantId` -- es UNA fila global. Ahí viven
 * `aiProvider`, `githubToken` y todas las API keys (`businessConfig.aiProviders`),
 * y todo el código las lee con `select().from(settings).limit(1)`, sin filtrar
 * por nadie. Encima `cargarClavesEnEntorno()` las vuelca a `process.env`, que es
 * global al PROCESO.
 *
 * O sea que si un cliente cargaba su propia clave desde el panel:
 *   1. pisaba la configuración de TODOS, incluida la del dueño del sistema;
 *   2. su cuota y su plata pagaban las conversaciones de otros clientes;
 *   3. cualquier otro admin podía pisársela.
 *
 * La columna correcta ya existía y no la leía nadie: `tenants.apiKeys`. Este
 * módulo la pone a trabajar.
 *
 * Regla de resolución, en este orden:
 *   1. la clave del PROPIO cliente (`tenants.apiKeys`), si la cargó;
 *   2. si no, la configuración global de este deploy (la de siempre).
 *
 * Así un cliente nuevo que no configuró nada sigue andando con lo del sistema,
 * y uno que sí puso la suya queda aislado: su clave no sale de su tenant y
 * NUNCA se escribe en `process.env`, que es lo que hacía que se mezclaran.
 */
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getProviderConfigConClave, getProviderConfig } from "@workspace/integrations-openai-ai-server";
import { cifrar, descifrar } from "./ai-keys";
import { logger } from "./logger";

/** Lo que se guarda por cliente para un proveedor. */
export interface ClaveDeTenant {
  apiKey?: string;
  model?: string;
}

/**
 * Las claves que cargó ESE cliente, ya descifradas.
 *
 * Devuelve {} si el cliente no configuró nada -- que es el caso normal y no un
 * error: significa "usá lo del sistema".
 */
export async function clavesDelTenant(tenantId: number): Promise<Record<string, ClaveDeTenant>> {
  if (!tenantId) return {};
  try {
    const [fila] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const guardadas = ((fila as any)?.apiKeys || {}) as Record<string, any>;
    const salida: Record<string, ClaveDeTenant> = {};
    for (const [proveedor, datos] of Object.entries(guardadas)) {
      // Se acepta tanto el formato nuevo ({apiKey, model}) como el viejo del
      // esquema, donde el valor era la clave suelta: la columna existía desde
      // antes y no quiero romper lo que alguien haya dejado escrito a mano.
      const crudo = typeof datos === "string" ? { apiKey: datos } : (datos || {});
      const plana = crudo.apiKey ? descifrar(String(crudo.apiKey)) : null;
      salida[proveedor] = { apiKey: plana || undefined, model: crudo.model || undefined };
    }
    return salida;
  } catch (e: any) {
    // Nunca romper la atención de un cliente por no poder leer sus claves: se
    // sigue con la configuración global, que es lo que pasaba hasta hoy.
    logger.warn({ err: e?.message, tenantId }, "[AIKeysTenant] no se pudieron leer las claves del cliente");
    return {};
  }
}

/**
 * Guarda (o borra) la clave y el modelo de UN proveedor para UN cliente.
 *
 * La clave se guarda cifrada, igual que en la configuración global: si alguien
 * lee la base, no se la lleva.
 */
export async function guardarClaveDeTenant(
  tenantId: number,
  proveedor: string,
  datos: { apiKey?: string; model?: string },
): Promise<void> {
  const [fila] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!fila) throw new Error("El cliente no existe");

  const actuales = ({ ...((fila as any).apiKeys || {}) }) as Record<string, any>;
  const previo = typeof actuales[proveedor] === "string"
    ? { apiKey: actuales[proveedor] }
    : { ...(actuales[proveedor] || {}) };

  if (typeof datos.apiKey === "string") {
    if (datos.apiKey.trim()) previo.apiKey = cifrar(datos.apiKey.trim());
    else delete previo.apiKey;
  }
  if (typeof datos.model === "string" && datos.model.trim()) previo.model = datos.model.trim();

  if (Object.keys(previo).length === 0) delete actuales[proveedor];
  else actuales[proveedor] = previo;

  await db.update(tenants).set({ apiKeys: actuales as any }).where(eq(tenants.id, tenantId));
  logger.info({ tenantId, proveedor, conClave: !!previo.apiKey }, "[AIKeysTenant] clave del cliente guardada");
}

/**
 * La configuración de un proveedor PARA ESTE CLIENTE.
 *
 * Si el cliente puso su clave, se arma con la suya sin tocar `process.env`
 * -- eso es justamente lo que mantiene separados a dos clientes que corren en
 * el mismo proceso. Si no la puso, cae a la configuración global de siempre.
 */
export async function configDelTenant(
  tenantId: number,
  proveedor: string,
  clavesPrecargadas?: Record<string, ClaveDeTenant>,
): Promise<{ config: any; propia: boolean } | null> {
  const claves = clavesPrecargadas || (await clavesDelTenant(tenantId));
  const propia = claves[proveedor];
  if (propia?.apiKey) {
    const cfg = getProviderConfigConClave(proveedor, propia.apiKey, propia.model);
    if (cfg) return { config: cfg, propia: true };
    // El proveedor no admite clave propia (ej. uno que vive en un contenedor
    // nuestro): se avisa y se sigue con lo global, en vez de dejarlo sin IA.
    logger.warn({ tenantId, proveedor }, "[AIKeysTenant] el cliente tiene clave para un proveedor que no admite clave propia");
  }
  const global = getProviderConfig(proveedor);
  return global ? { config: global, propia: false } : null;
}
