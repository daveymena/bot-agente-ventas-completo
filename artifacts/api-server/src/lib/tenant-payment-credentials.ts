import { encryptionService } from "./encryption-service";
import { logger } from "./logger";
import type { TenantContext } from "./tenantManager";

/**
 * Credenciales de cobro POR NEGOCIO.
 *
 * Hasta acá el checkout leía `process.env.MERCADO_PAGO_ACCESS_TOKEN` y
 * `process.env.PAYPAL_CLIENT_ID` directamente, así que TODOS los cobros de
 * TODOS los clientes caían en la cuenta del dueño del servidor. Con un solo
 * negocio eso funciona por casualidad -- la cuenta del dueño ES la correcta.
 * Con dos, el segundo cliente le estaría cobrando al primero.
 *
 * Es el mismo problema que ya se había arreglado para Facebook (ver
 * parseFacebookMeta en tenantManager): las credenciales estaban declaradas en
 * TenantContext pero nadie las leía, y todo caía al .env global.
 *
 * Los secretos se guardan CIFRADOS en tenants.payment_methods. Un token de
 * MercadoPago permite cobrar y mover plata: en texto plano, cualquiera con
 * acceso de lectura a la base -- un backup, un dump, un log -- se lleva la
 * capacidad de cobrar en nombre del cliente.
 */

/** Valor cifrado tal como queda guardado en la base. */
interface Cifrado {
  encrypted: string;
  authTag: string;
  iv: string;
}

function esCifrado(v: unknown): v is Cifrado {
  return !!v && typeof v === "object"
    && typeof (v as any).encrypted === "string"
    && typeof (v as any).authTag === "string"
    && typeof (v as any).iv === "string";
}

/**
 * Lee un campo que puede estar cifrado o en texto plano.
 *
 * Acepta texto plano a propósito: las credenciales que ya existían en la base
 * antes de este cambio están sin cifrar, y romperlas obligaría a cada cliente
 * a volver a cargarlas. Se leen tal cual y se re-guardan cifradas la próxima
 * vez que el dueño toque la configuración.
 */
function leerSecreto(valor: unknown): string {
  if (!valor) return "";
  if (typeof valor === "string") return valor;
  if (esCifrado(valor)) {
    try {
      return encryptionService.decrypt(valor);
    } catch (err) {
      // Pasa si cambió ENCRYPTION_KEY entre reinicios: el dato sigue ahí pero
      // ya no se puede abrir. Mejor devolver vacío (y que el cobro falle con
      // un error claro) que devolver basura a la pasarela.
      logger.error({ err }, "[PagosTenant] No se pudo descifrar una credencial; hay que volver a cargarla");
      return "";
    }
  }
  return "";
}

export function cifrarSecreto(texto: string): Cifrado | "" {
  if (!texto) return "";
  return encryptionService.encrypt(texto);
}

export interface CredencialesMercadoPago {
  accessToken: string;
  enabled: boolean;
}

export interface CredencialesPayPal {
  clientId: string;
  clientSecret: string;
  mode: "sandbox" | "live";
  enabled: boolean;
}

export interface CredencialesDePago {
  mercadopago: CredencialesMercadoPago;
  paypal: CredencialesPayPal;
  /** true si salieron de la config del negocio; false si son las del .env */
  propias: boolean;
}

/**
 * Credenciales efectivas de un negocio, ya descifradas.
 *
 * Cae al .env solo si el negocio no configuró las suyas. Ese fallback se
 * mantiene para no romper la instalación actual (un solo negocio, el del
 * dueño del servidor), pero `propias` deja claro cuál se está usando para
 * poder avisarlo en la interfaz y en los logs.
 */
export function credencialesDe(tenant: TenantContext | null | undefined): CredencialesDePago {
  const pm: any = tenant?.paymentMethods || {};

  const mpToken = leerSecreto(pm.mercadopago?.accessToken);
  const ppId = typeof pm.paypal?.clientId === "string" ? pm.paypal.clientId : "";
  const ppSecret = leerSecreto(pm.paypal?.clientSecret);

  const tieneMp = !!mpToken;
  const tienePp = !!(ppId && ppSecret);

  return {
    mercadopago: {
      accessToken: mpToken || process.env.MERCADO_PAGO_ACCESS_TOKEN || "",
      enabled: tieneMp ? pm.mercadopago?.enabled !== false : !!process.env.MERCADO_PAGO_ACCESS_TOKEN,
    },
    paypal: {
      clientId: ppId || process.env.PAYPAL_CLIENT_ID || "",
      clientSecret: ppSecret || process.env.PAYPAL_CLIENT_SECRET || "",
      mode: (pm.paypal?.mode as "sandbox" | "live") || (process.env.PAYPAL_MODE === "sandbox" ? "sandbox" : "live"),
      enabled: tienePp ? pm.paypal?.enabled !== false : !!process.env.PAYPAL_CLIENT_ID,
    },
    propias: tieneMp || tienePp,
  };
}

/**
 * Verifica un access token de MercadoPago contra su API.
 *
 * Guardar una credencial sin probarla es la receta para descubrir que estaba
 * mal el día que un cliente intenta pagar. Se consulta /users/me, que es de
 * solo lectura y no mueve dinero.
 */
export async function probarMercadoPago(accessToken: string): Promise<{ ok: boolean; detalle: string }> {
  if (!accessToken) return { ok: false, detalle: "Falta el access token" };
  try {
    const res = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(12000),
    });
    if (res.status === 401) return { ok: false, detalle: "El token fue rechazado por MercadoPago (401)" };
    if (!res.ok) return { ok: false, detalle: `MercadoPago respondió ${res.status}` };
    const data: any = await res.json();
    const cuenta = data?.nickname || data?.email || `id ${data?.id}`;
    return { ok: true, detalle: `Conectado a la cuenta ${cuenta}` };
  } catch (err: any) {
    return { ok: false, detalle: err?.message || "No se pudo contactar a MercadoPago" };
  }
}

/**
 * Verifica credenciales de PayPal pidiendo un token OAuth, que es exactamente
 * lo que hace el cobro real. Si esto anda, el checkout anda.
 */
export async function probarPayPal(
  clientId: string,
  clientSecret: string,
  mode: "sandbox" | "live",
): Promise<{ ok: boolean; detalle: string }> {
  if (!clientId || !clientSecret) return { ok: false, detalle: "Faltan el Client ID o el Client Secret" };
  const base = mode === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
  try {
    const res = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(12000),
    });
    if (res.status === 401) {
      return { ok: false, detalle: `PayPal rechazó las credenciales (401). ¿Están en el modo correcto? Estás probando en ${mode}.` };
    }
    if (!res.ok) return { ok: false, detalle: `PayPal respondió ${res.status}` };
    return { ok: true, detalle: `Credenciales válidas en modo ${mode}` };
  } catch (err: any) {
    return { ok: false, detalle: err?.message || "No se pudo contactar a PayPal" };
  }
}

/** Deja ver los últimos caracteres para reconocer la credencial sin exponerla. */
export function enmascarar(valor: string): string {
  return valor ? encryptionService.maskApiKey(valor) : "";
}
