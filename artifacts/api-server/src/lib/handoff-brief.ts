/**
 * EL RESUMEN QUE RECIBE EL VENDEDOR HUMANO.
 *
 * Regla del spec de V2: no transferir diciendo "atiende este cliente". Quien
 * toma el chat tiene que poder seguir la venta sin leerse veinte mensajes ni
 * hacerle al cliente preguntas que ya contestó — que es la forma más rápida de
 * perder a alguien que ya venía decidido.
 *
 * Se arma con lo que YA existe: el perfil comercial del lead (fase 2) y la
 * próxima acción (fase 3). No agrega datos nuevos ni infiere nada.
 */
import { siguienteAccion, type EntradaNBA } from "./next-best-action";

export interface DatosDelBrief extends EntradaNBA {
  nombre?: string | null;
  telefono?: string | null;
  productoEnFoco?: string | null;
  ciudad?: string | null;
  ultimoMensajeDelCliente?: string | null;
  puntaje?: number | null;
}

/**
 * Texto plano a propósito: se copia y pega en WhatsApp, en un correo o en el
 * panel. Un objeto JSON obliga a que alguien lo maquete antes de que sirva.
 */
export function resumenParaHumano(d: DatosDelBrief): string {
  const nba = siguienteAccion(d);

  const urgencia = nba.prioridad <= 1 ? "🔥 ATENDER YA" : nba.prioridad <= 2 ? "⚡ Prioritario" : "📋 Puede esperar";
  const l: string[] = [`${urgencia} — ${d.nombre || d.telefono || "Cliente"}`];

  if (d.telefono) l.push(`📱 ${d.telefono}`);
  if (d.productoEnFoco) l.push(`🛒 Le interesa: ${d.productoEnFoco}`);
  else l.push(`🛒 Todavía no vio ningún producto`);

  if (typeof d.puntaje === "number") l.push(`📊 Puntaje: ${d.puntaje}`);
  if (d.etapa) l.push(`📍 Etapa: ${d.etapa}`);
  if (d.ciudad) l.push(`🏙️ Está en ${d.ciudad} — no se lo vuelvas a preguntar`);

  if (d.objecionAbierta) l.push(`🧱 Objeción sin resolver: ${d.objecionAbierta}`);
  if (d.estadoDePago === "confirmed") l.push(`✅ YA PAGÓ`);
  else if (d.estadoDePago) l.push(`💳 Pago: ${d.estadoDePago}`);

  if (d.clienteEscribioUltimo) {
    l.push(`⏳ Escribió él último hace ${d.horasSinEscribir}h y sigue esperando`);
  } else if (d.horasSinEscribir > 0) {
    l.push(`🕒 Sin escribir hace ${d.horasSinEscribir}h`);
  }

  if (d.ultimoMensajeDelCliente) {
    // Recortado: el vendedor necesita el tono y el tema, no la transcripción.
    const m = d.ultimoMensajeDelCliente.trim().replace(/\s+/g, " ").slice(0, 160);
    l.push(`💬 Lo último que dijo: "${m}"`);
  }

  l.push(`👉 Qué hacer: ${nba.detalle}`);
  return l.join("\n");
}
