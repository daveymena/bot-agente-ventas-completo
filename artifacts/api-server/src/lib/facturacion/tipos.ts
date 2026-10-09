/**
 * Facturación por negocio: cada negocio conecta SU sistema de facturación.
 *
 * Decisión del dueño (09-10-2026): VentasPro no emite facturas (no tiene
 * resolución de la DIAN, y no debe tenerla: el que factura es cada negocio).
 * Lo que hace es dejar la puerta para que cada negocio conecte el suyo, y que
 * al confirmarse un pago la factura salga sola en ESE sistema.
 *
 * Proveedores:
 *  · `alegra`  — nativo (API REST de Alegra, Basic auth correo:token).
 *  · `webhook` — genérico: se le manda la venta firmada (HMAC-SHA256) a la URL
 *    que ponga el negocio. Sirve para cualquier sistema (Siigo por Zapier/Make,
 *    un ERP propio...). Si responde `{ numero }`, ese número se le da al cliente.
 *
 * Reglas:
 *  · Las credenciales viven en `tenants.metadata.facturacion`, secretos
 *    CIFRADOS (mismo criterio que lib/integraciones).
 *  · Facturar NUNCA bloquea la entrega: si falla, el cliente recibe el recibo
 *    de siempre y el admin se entera de por qué no salió la factura.
 *  · Un pago se factura UNA vez: el resultado queda en `payments.metadata.factura`.
 */

export type ProveedorFacturacion = "alegra" | "webhook";
export const PROVEEDORES_FACTURACION: ProveedorFacturacion[] = ["alegra", "webhook"];

/** La venta, normalizada, tal como sale del pago confirmado. */
export interface VentaAFacturar {
  pagoId: number;
  tenantId: number;
  fecha: string; // yyyy-MM-dd
  moneda: string;
  total: number;
  metodoPago: string;
  cliente: {
    nombre: string;
    documento?: string | null;
    correo?: string | null;
    telefono?: string | null;
  };
  items: Array<{
    productId: number | null;
    nombre: string;
    precio: number;
    cantidad: number;
    digital: boolean;
  }>;
}

export interface FacturaEmitida {
  proveedor: ProveedorFacturacion;
  idExterno: string | null;
  numero: string | null;
  /** Electrónica pedida a la DIAN (Alegra con stamp) o solo creada en el sistema. */
  electronica: boolean;
  emitidaEn: string;
}

export type ResultadoFactura =
  | { ok: true; factura: FacturaEmitida; yaEstaba?: boolean }
  | { ok: false; error: string; proveedor: ProveedorFacturacion | null };

export interface ConfigAlegra {
  correo: string;
  token: string;
  /** Id del contacto "Consumidor final" en Alegra (para clientes sin cédula registrada). */
  contactoPorDefecto: string;
  /** Id de la numeración (resolución) a usar; vacío = la preferida de la cuenta. */
  numeracion?: string;
  /** Id del impuesto a aplicar a cada ítem (ej. IVA 19 %); vacío = sin impuesto. */
  impuesto?: string;
  /** true = pedirle a Alegra que la emita como factura electrónica ante la DIAN. */
  electronica: boolean;
}

export interface ConfigWebhook {
  url: string;
  secreto: string;
}

export interface ConfigFacturacion {
  proveedor: ProveedorFacturacion;
  activa: boolean;
  alegra?: ConfigAlegra;
  webhook?: ConfigWebhook;
  actualizadaEn?: string;
}

export type Pedir = (url: string, init: RequestInit) => Promise<Response>;
