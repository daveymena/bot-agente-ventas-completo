import { encryptionService } from "./encryption-service";
import { logger } from "./logger";
import { tenantManager, type TenantContext } from "./tenantManager";

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
  /** Secreto del webhook (x-signature) de MercadoPago. Vacío = sin verificar firma. */
  webhookSecret: string;
}

export interface CredencialesPayPal {
  clientId: string;
  clientSecret: string;
  mode: "sandbox" | "live";
  enabled: boolean;
}

export interface CuentaTransferencia {
  type: string;
  number: string;
  name: string;
}

export interface CredencialesDePago {
  mercadopago: CredencialesMercadoPago;
  paypal: CredencialesPayPal;
  /** Nequi, Daviplata, bancos: el cliente transfiere y alguien verifica. */
  transfer: { enabled: boolean; accounts: CuentaTransferencia[] };
  /** true si salieron de la config del negocio; false si son las del .env */
  propias: boolean;
}

/**
 * Cuentas de transferencia del negocio.
 *
 * NO hay número por defecto, y es a propósito: antes el código traía
 * "3136174267" hardcodeado como respaldo en cuatro lugares, así que un
 * negocio sin configurar le daba a SUS clientes el número de un tercero.
 * Plata que se va a la cuenta equivocada, sin ningún error visible.
 *
 * Vacío significa vacío: el bot no ofrece transferencia si no hay a dónde.
 */
function transferenciasDe(pm: any, esDuenoDelServidor: boolean): { enabled: boolean; accounts: CuentaTransferencia[] } {
  const propias: CuentaTransferencia[] = Array.isArray(pm?.transfer?.accounts)
    ? pm.transfer.accounts.filter((c: any) => c?.number && c?.name)
    : [];

  if (propias.length > 0) {
    return { enabled: pm.transfer?.enabled !== false, accounts: propias };
  }

  // Respaldo del .env: solo para el dueño del servidor, y solo si está
  // realmente configurado. Para otro negocio sería darle a SUS clientes el
  // Nequi de un tercero -- plata que se va sin dejar rastro.
  if (esDuenoDelServidor) {
    const envNum = process.env.TRANSFER_NUMBER || "";
    const envName = process.env.TRANSFER_NAME || process.env.TRANSFER_OWNER || "";
    if (envNum && envName) {
      return { enabled: true, accounts: [{ type: "Nequi", number: envNum, name: envName }] };
    }
  }

  return { enabled: false, accounts: [] };
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

  // Si no hay tenant resuelto, no asumir que es el propietario: un llamado
  // sin contexto nunca debe poder cobrar usando las credenciales globales.
  const esDuenoDelServidor = !!tenant && tenant.id === tenantManager.getDefaultTenant().id;
  const env = (valor: string | undefined) => (esDuenoDelServidor ? valor || "" : "");

  // Si el negocio guardó una credencial explícitamente, se conserva aunque
  // coincida con la del entorno (puede usar legítimamente esa misma cuenta).
  // El .env solo se consulta para el tenant dueño; nunca se copia como valor
  // inicial a los demás negocios.
  const mpToken = leerSecreto(pm.mercadopago?.accessToken);
  const ppId = typeof pm.paypal?.clientId === "string" ? pm.paypal.clientId : "";
  const ppSecret = leerSecreto(pm.paypal?.clientSecret);

  const tieneMp = !!mpToken;
  const tienePp = !!(ppId && ppSecret);

  // El respaldo del .env vale SOLO para el negocio dueño del servidor.
  //
  // La primera versión de esto lo aplicaba a todos, para no romper la
  // instalación existente. Pero con un segundo negocio eso significa que sus
  // ventas se cobran en la cuenta de MercadoPago del dueño de la plataforma
  // -- exactamente el problema que este archivo venía a resolver.
  //
  // Para cualquier otro negocio, vacío es vacío: el checkout responde
  // "MercadoPago no configurado" y el dueño va a cargar el suyo, en vez de
  // que la plata entre en la cuenta equivocada sin que nadie se entere.
  // Si no hay tenant resuelto, no asumir que es el propietario: un llamado
  // sin contexto nunca debe poder cobrar usando las credenciales globales.
  return {
    mercadopago: {
      accessToken: mpToken || env(process.env.MERCADO_PAGO_ACCESS_TOKEN),
      enabled: tieneMp ? pm.mercadopago?.enabled !== false : !!env(process.env.MERCADO_PAGO_ACCESS_TOKEN),
      webhookSecret: leerSecreto(pm.mercadopago?.webhookSecret) || env(process.env.MERCADO_PAGO_WEBHOOK_SECRET),
    },
    paypal: {
      clientId: ppId || env(process.env.PAYPAL_CLIENT_ID),
      clientSecret: ppSecret || env(process.env.PAYPAL_CLIENT_SECRET),
      mode: (pm.paypal?.mode as "sandbox" | "live") || (process.env.PAYPAL_MODE === "sandbox" ? "sandbox" : "live"),
      enabled: tienePp ? pm.paypal?.enabled !== false : !!env(process.env.PAYPAL_CLIENT_ID),
    },
    transfer: transferenciasDe(pm, esDuenoDelServidor),
    propias: tieneMp || tienePp || (Array.isArray(pm?.transfer?.accounts) && pm.transfer.accounts.length > 0),
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
