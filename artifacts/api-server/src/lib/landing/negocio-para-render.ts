/**
 * Lo que la página pública necesita saber del negocio dueño del producto.
 *
 * Marca y WhatsApp para el encabezado, el pie y el CTA; el modelo del
 * producto para elegir qué franja de confianza va (un físico contraentrega
 * y un curso no tranquilizan con lo mismo); y las condiciones reales del
 * negocio para que la franja no invente plazos.
 */
import { getBusinessContext } from "../business-context";
import { CONDICIONES_DE_RESPALDO, fraseCostoEnvio, frasePagoEnvio, modeloDelProducto } from "../modelo-de-negocio";
import { tenantManager } from "../tenantManager";
import type { NegocioParaRenderizar } from "./renderer";

export async function negocioParaRender(tenantId: number, producto: any | null): Promise<NegocioParaRenderizar> {
  const [tenant, ctx] = await Promise.all([
    tenantManager.getTenantById(tenantId).catch(() => null),
    getBusinessContext(tenantId).catch(() => null),
  ]);
  const modelo = producto ? modeloDelProducto(producto) : "digital";
  const c = ctx?.condiciones ?? CONDICIONES_DE_RESPALDO;

  const confianza = modelo === "fisico"
    // Costo y plazo solo si el negocio los configuró: sin dato, no se afirman.
    ? [c.envio.costo ? `🚚 ${fraseCostoEnvio(c)}` : "", `💵 ${frasePagoEnvio(c)}`, c.envio.plazo ? `⏱️ Llega en ${c.envio.plazo}` : ""].filter(Boolean)
    : modelo === "digital"
      ? ["⚡ Acceso apenas se confirma el pago", "💳 Pago seguro", "📱 Se ve desde el celular o el computador"]
      : modelo === "servicio"
        ? ["🗓️ Se agenda por WhatsApp", "📍 Atención personalizada"]
        : [];

  return {
    nombre: ctx?.businessName || (tenant as any)?.brandName || null,
    whatsapp: (tenant as any)?.contactPhone || (tenant as any)?.whatsappNumber || null,
    modelo,
    confianza,
  };
}
