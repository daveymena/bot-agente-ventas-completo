/**
 * Conector genérico: la venta va por POST a la URL que configuró el negocio.
 *
 * Para cualquier sistema que no tenga conector nativo (Siigo por Zapier/Make,
 * un ERP propio, una hoja de cálculo...). El cuerpo va firmado:
 *
 *   x-ventaspro-firma: sha256=<HMAC-SHA256 del cuerpo con el secreto>
 *
 * El receptor puede contestar `{ "numero": "FE-123", "id": "..." }` y ese
 * número es el que se le muestra al cliente. Si no contesta número, la venta
 * igual se considera enviada (2xx) y el cliente recibe el recibo de siempre.
 */
import { createHmac } from "node:crypto";
import type { ConfigWebhook, FacturaEmitida, Pedir, VentaAFacturar } from "./tipos";

export function firmar(cuerpo: string, secreto: string): string {
  return `sha256=${createHmac("sha256", secreto).update(cuerpo).digest("hex")}`;
}

export function validarConfig(c: Partial<ConfigWebhook> | undefined): string | null {
  if (!c?.url) return "Falta la URL a la que se envía cada venta.";
  if (!/^https:\/\//i.test(c.url)) return "La URL tiene que empezar con https://";
  if (!c.secreto) return "Falta el secreto para firmar los envíos.";
  return null;
}

async function enviar(c: ConfigWebhook, evento: string, datos: unknown, pedir: Pedir): Promise<any> {
  const falta = validarConfig(c);
  if (falta) throw new Error(falta);
  const cuerpo = JSON.stringify({ evento, datos });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15_000);
  try {
    const r = await pedir(c.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ventaspro-evento": evento, "x-ventaspro-firma": firmar(cuerpo, c.secreto) },
      body: cuerpo,
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`El sistema de facturación respondió ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
    return r.json().catch(() => ({}));
  } finally {
    clearTimeout(t);
  }
}

export async function probarConexion(c: ConfigWebhook, pedir: Pedir = fetch): Promise<void> {
  await enviar(c, "prueba", { mensaje: "Prueba de conexión desde VentasPro" }, pedir);
}

export async function emitir(c: ConfigWebhook, venta: VentaAFacturar, pedir: Pedir = fetch): Promise<FacturaEmitida> {
  const r = await enviar(c, "venta.pagada", venta, pedir);
  const numero = r?.numero ?? r?.number ?? null;
  return {
    proveedor: "webhook",
    idExterno: r?.id != null ? String(r.id) : null,
    numero: numero != null ? String(numero) : null,
    electronica: r?.electronica === true,
    emitidaEn: new Date().toISOString(),
  };
}
