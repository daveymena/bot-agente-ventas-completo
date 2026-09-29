import { Router } from "express";
import { z } from "zod";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  cifrarSecreto,
  credencialesDe,
  enmascarar,
  probarMercadoPago,
  probarPayPal,
} from "../lib/tenant-payment-credentials";
import { tenantManager } from "../lib/tenantManager";

/**
 * Credenciales de cobro del negocio logueado.
 *
 * Cada cliente carga acá SU cuenta de MercadoPago y de PayPal, para que el
 * dinero de sus ventas le llegue a él. Antes esto no existía: el checkout
 * leía las variables de entorno del servidor, así que todo cobro terminaba
 * en la cuenta del dueño de la plataforma.
 *
 * Los secretos NUNCA vuelven al navegador. El GET devuelve solo si están
 * configurados y unos pocos caracteres para reconocerlos.
 */
const router = Router();

const guardarSchema = z.object({
  mercadopago: z.object({
    // Vacío o ausente = "no lo toques". Así el formulario puede guardarse sin
    // reescribir un token que el usuario no volvió a tipear (no lo tiene: el
    // GET nunca se lo devolvió).
    accessToken: z.string().optional(),
    // Secreto del webhook de MercadoPago (x-signature). Vacío/ausente = no se toca.
    webhookSecret: z.string().optional(),
    enabled: z.boolean().optional(),
  }).optional(),
  paypal: z.object({
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    mode: z.enum(["sandbox", "live"]).optional(),
    enabled: z.boolean().optional(),
  }).optional(),
  // Nequi, Daviplata, bancos. No son secretos -- el cliente TIENE que verlos
  // para poder transferir -- así que van en claro, sin cifrar.
  transfer: z.object({
    enabled: z.boolean().optional(),
    accounts: z.array(z.object({
      type: z.string().min(1),
      number: z.string().min(1),
      name: z.string().min(1),
    })).optional(),
  }).optional(),
});

function tenantIdDe(req: any): number | null {
  const raw = req.signedCookies?.tenant_id;
  const id = Number(raw);
  return raw && Number.isFinite(id) ? id : null;
}

async function leerPaymentMethods(tenantId: number): Promise<any> {
  const [row] = await db
    .select({ paymentMethods: tenants.paymentMethods })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const pm = row?.paymentMethods as any;
  if (!pm) return {};
  // SQLite guarda JSON como texto; Postgres ya lo devuelve parseado.
  if (typeof pm === "string") {
    try { return JSON.parse(pm); } catch { return {}; }
  }
  return pm;
}

/** GET /api/payments/credentials — estado, sin secretos. */
router.get("/credentials", async (req, res, next) => {
  try {
    const tenantId = tenantIdDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });

    const tenant = await tenantManager.getTenantById(tenantId);
    const cred = credencialesDe(tenant);
    const pm = await leerPaymentMethods(tenantId);

    // `propias` distingue "configurado por vos" de "heredado del servidor".
    // Sin eso, el dueño ve "configurado" y cree que cobra en su cuenta cuando
    // en realidad está usando la del servidor.
    return res.json({
      propias: cred.propias,
      mercadopago: {
        configurado: !!pm?.mercadopago?.accessToken,
        enabled: cred.mercadopago.enabled,
        pista: pm?.mercadopago?.accessToken ? enmascarar(cred.mercadopago.accessToken) : "",
      },
      paypal: {
        configurado: !!(pm?.paypal?.clientId && pm?.paypal?.clientSecret),
        enabled: cred.paypal.enabled,
        clientId: pm?.paypal?.clientId || "",
        mode: cred.paypal.mode,
        pista: pm?.paypal?.clientSecret ? enmascarar(cred.paypal.clientSecret) : "",
      },
      transfer: {
        // Solo cuentas PROPIAS: si mostrara el respaldo del .env, el dueño
        // creería que ya cargó las suyas cuando en realidad está dando el
        // número del servidor.
        configurado: Array.isArray(pm?.transfer?.accounts) && pm.transfer.accounts.length > 0,
        enabled: cred.transfer.enabled,
        accounts: Array.isArray(pm?.transfer?.accounts) ? pm.transfer.accounts : [],
      },
    });
  } catch (err) {
    return next(err);
  }
});

/** PUT /api/payments/credentials — guarda, cifrando los secretos. */
router.put("/credentials", async (req, res, next) => {
  try {
    const tenantId = tenantIdDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });

    const parsed = guardarSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Datos inválidos", issues: parsed.error.issues });
    }
    const { mercadopago, paypal } = parsed.data;
    const actual = await leerPaymentMethods(tenantId);
    const nuevo: any = { ...actual };

    if (mercadopago) {
      const prev = actual.mercadopago || {};
      nuevo.mercadopago = {
        ...prev,
        // Solo se pisa el token si mandaron uno nuevo y no vacío.
        ...(mercadopago.accessToken
          ? { accessToken: cifrarSecreto(mercadopago.accessToken.trim()) }
          : {}),
        // Solo se pisa el secreto si mandaron uno nuevo y no vacío.
        ...(mercadopago.webhookSecret
          ? { webhookSecret: cifrarSecreto(mercadopago.webhookSecret.trim()) }
          : {}),
        enabled: mercadopago.enabled ?? prev.enabled ?? true,
      };
    }

    if (paypal) {
      const prev = actual.paypal || {};
      nuevo.paypal = {
        ...prev,
        ...(paypal.clientId !== undefined ? { clientId: paypal.clientId.trim() } : {}),
        ...(paypal.clientSecret
          ? { clientSecret: cifrarSecreto(paypal.clientSecret.trim()) }
          : {}),
        mode: paypal.mode ?? prev.mode ?? "live",
        enabled: paypal.enabled ?? prev.enabled ?? true,
      };
    }

    if (parsed.data.transfer) {
      const prev = actual.transfer || {};
      nuevo.transfer = {
        ...prev,
        ...(parsed.data.transfer.accounts !== undefined
          ? { accounts: parsed.data.transfer.accounts }
          : {}),
        enabled: parsed.data.transfer.enabled ?? prev.enabled ?? true,
      };
    }

    await db.update(tenants).set({ paymentMethods: nuevo as any }).where(eq(tenants.id, tenantId));
    // El TenantManager cachea; sin esto el checkout seguiría usando lo viejo
    // hasta que venza el TTL, y el dueño creería que no se guardó.
    tenantManager.clearCache();

    logger.info({ tenantId, mp: !!mercadopago, pp: !!paypal }, "[PagosTenant] Credenciales actualizadas");
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/payments/credentials/test — prueba contra la API real.
 *
 * Prueba lo que se acaba de tipear si viene en el body; si no, lo guardado.
 * Así se puede validar ANTES de guardar y no descubrir que estaba mal el día
 * que un cliente intenta pagar.
 */
router.post("/credentials/test", async (req, res, next) => {
  try {
    const tenantId = tenantIdDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });

    const proveedor = String(req.body?.provider || "");
    const tenant = await tenantManager.getTenantById(tenantId);
    const cred = credencialesDe(tenant);

    if (proveedor === "mercadopago") {
      const token = String(req.body?.accessToken || "").trim() || cred.mercadopago.accessToken;
      return res.json(await probarMercadoPago(token));
    }

    if (proveedor === "paypal") {
      const clientId = String(req.body?.clientId || "").trim() || cred.paypal.clientId;
      const clientSecret = String(req.body?.clientSecret || "").trim() || cred.paypal.clientSecret;
      const mode = (req.body?.mode === "sandbox" ? "sandbox" : req.body?.mode === "live" ? "live" : cred.paypal.mode);
      return res.json(await probarPayPal(clientId, clientSecret, mode));
    }

    return res.status(400).json({ ok: false, detalle: "provider debe ser 'mercadopago' o 'paypal'" });
  } catch (err) {
    return next(err);
  }
});

export default router;
