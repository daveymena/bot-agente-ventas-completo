import { Router } from "express";
import { z } from "zod";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  getBusinessContext,
  invalidarContextoDeNegocio,
  normalizarMetadata,
  renderBloqueNegocio,
} from "../lib/business-context";

/**
 * El perfil del negocio del cliente logueado.
 *
 * Es lo que el agente de ventas sabe: qué vende, hasta dónde llega, cómo
 * entrega, qué garantía da y —sobre todo— QUÉ NO PUEDE HACER. Todo lo que no
 * esté acá, el agente tiene prohibido afirmarlo (ver `business-context.ts`).
 *
 * Vive en `tenants.metadata.businessProfile`, POR CLIENTE. No en `settings`,
 * que es una tabla global de una sola fila para toda la plataforma: guardarlo
 * ahí haría que el perfil de un negocio se lo comieran todos los demás.
 */
const router = Router();

function tenantIdDe(req: any): number | null {
  const raw = req.signedCookies?.tenant_id;
  const id = Number(raw);
  return raw && Number.isFinite(id) ? id : null;
}

const entregaSchema = z.object({
  metodo: z.string().min(1),
  plazo: z.string().min(1),
  detalle: z.string().optional(),
});

const garantiaSchema = z.object({
  dias: z.number().int().min(0),
  descripcion: z.string().optional(),
});

const accesoSchema = z.object({
  tipo: z.string().min(1),
  descripcion: z.string().optional(),
});

// Todo opcional: guardar el horario no debe borrar la entrega. Lo que no
// llega, no se toca (mismo criterio que payment-credentials y
// facebook-credentials). `null` sí borra el campo a propósito.
const guardarSchema = z.object({
  descripcion: z.string().nullable().optional(),
  nicho: z.string().nullable().optional(),
  cobertura: z.string().nullable().optional(),
  horario: z.string().nullable().optional(),
  entrega: entregaSchema.nullable().optional(),
  garantia: garantiaSchema.nullable().optional(),
  acceso: accesoSchema.nullable().optional(),
  noPuede: z.array(z.string()).optional(),
  /**
   * Cómo habla este negocio.
   *
   * Es lo que más rompe al cambiar de cliente y no se podía configurar: una
   * funeraria no vende como una tienda de zapatillas, y el agente hablaba
   * igual para las dos. Texto libre a propósito -- una lista cerrada de tonos
   * nunca alcanza, y el dueño describe el suyo mejor que cualquier etiqueta.
   */
  tono: z.string().max(300).nullable().optional(),
  /**
   * Si el negocio acepta negociar el precio.
   *
   * Por defecto NO, y es deliberado: un precio que baja al primer pedido
   * enseña que el de la lista era falso, y de ahí en más todo el catálogo se
   * lee como inflado. Pero un concesionario o una mueblería sí regatean, y el
   * SaaS tiene que servirles: con esto en true, el candado de
   * `defenderElPrecio` deja de aplicarse.
   */
  negociaPrecio: z.boolean().nullable().optional(),
  loQueDebeSaber: z.array(z.string()).optional(),
  /**
   * Qué tipo de producto vende este negocio.
   *
   * "digital" o "fisico" dejan el otro tipo FUERA del catálogo que ve el
   * agente, así que no puede confundirlos. "mixto" es el comportamiento de
   * siempre y el valor por defecto: nadie cambia de catálogo sin pedirlo.
   */
  modoCatalogo: z.enum(["digital", "fisico", "mixto"]).optional(),
  /**
   * Condiciones del negocio que antes vivían fijas en el código (y solo
   * valían para el dueño): país, y cómo se despacha y cobra lo físico.
   * Ver `modelo-de-negocio.ts`.
   */
  pais: z.string().max(60).nullable().optional(),
  envio: z.object({
    plazo: z.string().max(120).optional(),
    pago: z.enum(["contraentrega", "anticipado", "ambos"]).optional(),
    costo: z.string().max(120).optional(),
    cobertura: z.string().max(200).optional(),
  }).nullable().optional(),
  /** Cómo se agenda un servicio ("por este chat, lunes a viernes 8-18"). */
  agenda: z.string().max(300).nullable().optional(),
});

router.get("/", async (req, res, next) => {
  try {
    const tenantId = tenantIdDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });

    const ctx = await getBusinessContext(tenantId);

    // `faltan` es la lista de preguntas que el dueño todavía no respondió.
    // Es lo que el panel (y el agente de alta) usa para saber qué preguntar.
    const faltan = [
      !ctx.descripcion && "descripcion",
      !ctx.nicho && "nicho",
      !ctx.cobertura && "cobertura",
      !ctx.entrega && "entrega",
      !ctx.garantia && "garantia",
      !ctx.acceso && "acceso",
      ctx.noPuede.length === 0 && "noPuede",
    ].filter(Boolean) as string[];

    return res.json({
      perfil: ctx,
      configurado: ctx.configurado,
      faltan,
      // Exactamente el texto que el agente de ventas lee en cada mensaje.
      // Sirve para que el dueño vea qué sabe su agente, sin adivinar.
      loQueVeElAgente: renderBloqueNegocio(ctx),
    });
  } catch (e) {
    return next(e);
  }
});

router.put("/", async (req, res, next) => {
  try {
    const tenantId = tenantIdDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });

    const body = guardarSchema.parse(req.body ?? {});
    if (Object.keys(body).length === 0) {
      return res.status(400).json({ error: "No llegó ningún campo del perfil" });
    }

    const [fila] = await db
      .select({ metadata: tenants.metadata })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!fila) return res.status(404).json({ error: "Negocio no encontrado" });

    const meta = normalizarMetadata(fila.metadata);
    const previo = (meta.businessProfile || {}) as Record<string, any>;

    const nuevo: Record<string, any> = { ...previo };
    for (const [k, v] of Object.entries(body)) {
      if (v === null) delete nuevo[k];
      else nuevo[k] = v;
    }

    await db
      .update(tenants)
      .set({ metadata: { ...meta, businessProfile: nuevo } })
      .where(eq(tenants.id, tenantId));

    // Sin esto el agente sigue respondiendo con el perfil viejo hasta un
    // minuto — justo cuando el dueño está probando si su cambio funcionó.
    invalidarContextoDeNegocio(tenantId);

    const ctx = await getBusinessContext(tenantId);
    logger.info(
      { tenantId, campos: Object.keys(body) },
      "[BUSINESS-PROFILE] Perfil del negocio actualizado",
    );

    return res.json({ ok: true, perfil: ctx, loQueVeElAgente: renderBloqueNegocio(ctx) });
  } catch (e: any) {
    if (e?.name === "ZodError") {
      return res.status(400).json({ error: "Perfil inválido", detalle: e.issues });
    }
    return next(e);
  }
});

export default router;
