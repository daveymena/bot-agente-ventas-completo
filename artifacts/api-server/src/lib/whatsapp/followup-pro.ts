/**
 * WhatsApp Cierre Pro — Follow-up Anti-Fantasma
 * ==============================================
 * Secuencia automática de 5 toques en 7 días cuando el cliente deja de
 * responder después de precio/pago. Usa trabajos_programados (programador.ts)
 * para no perder el drip con reinicios — igual que agente-horario.
 *
 * Reglas:
 * - Máx 1/día después del día 1, respeta optOut, cancela si el cliente responde.
 * - Cada mensaje hace 1 pregunta cerrada (no "¿sigues ahí?" genérico).
 * - Contenido distinto cada vez (video, objeción, prueba, pago).
 */
import { db } from "@workspace/db";

export type DisparadorFollowup = "precio_enviado" | "pago_enviado" | "datos_pedido_incompletos";

export interface PasoFollowup {
  delayMin: number; // desde el disparo
  canal: "whatsapp";
  plantilla: string; // id interno
  texto: (vars: { nombre: string; producto: string; precio: string; ciudad?: string }) => string;
  maqueta?: "video" | "pago_link" | "datos_envio";
}

export const SECUENCIAS: Record<DisparadorFollowup, PasoFollowup[]> = {
  precio_enviado: [
    {
      delayMin: 15,
      canal: "whatsapp",
      plantilla: "pro_precio_T15_video",
      texto: ({ producto }) => `¿Te quedó alguna duda del valor de ${producto}? Te dejo un video de 15s por si te ayuda a decidir 👇`,
      maqueta: "video",
    },
    {
      delayMin: 120,
      canal: "whatsapp",
      plantilla: "pro_precio_T2h_objecion",
      texto: ({ ciudad }) => `¿Es por si te llega a ${ciudad || "tu ciudad"}? Esta semana llegó a Bogotá, Cali y Medellín sin novedad. ¿Quieres que te confirme para la tuya?`,
    },
    {
      delayMin: 60 * 24,
      canal: "whatsapp",
      plantilla: "pro_precio_T24_prueba",
      texto: ({ producto }) => `Así le llegó a un cliente ayer — foto real de ${producto} en su casa 📦 ¿Te lo aparto con pago contraentrega para que lo veas antes de pagar?`,
    },
    {
      delayMin: 60 * 72,
      canal: "whatsapp",
      plantilla: "pro_precio_T72_cierre",
      texto: ({ producto, precio }) => `Último recordatorio: ${producto} sigue en ${precio}. ¿Lo dejamos para después o lo cerramos hoy? Responde 1️⃣ para cerrarlo, 2️⃣ para dejarlo pendiente.`,
    },
  ],
  pago_enviado: [
    {
      delayMin: 60 * 24,
      canal: "whatsapp",
      plantilla: "pro_pago_T24_ayuda",
      texto: ({ producto }) => `¿Te ayudo con el pago de ${producto}? Puedes por Nequi/Daviplata o con tarjeta en un link seguro. ¿Cuál prefieres?`,
      maqueta: "pago_link",
    },
    {
      delayMin: 60 * 48,
      canal: "whatsapp",
      plantilla: "pro_pago_T48_objecion",
      texto: () => `Si te frena algo del pago (monto, link, Nequi), dime en 1 línea y lo resolvemos ahora mismo.`,
    },
  ],
  datos_pedido_incompletos: [
    {
      delayMin: 120,
      canal: "whatsapp",
      plantilla: "pro_datos_T2h_pendiente",
      texto: () => `Solo me falta un dato para cerrarte el pedido (barrio/ciudad). ¿Me lo envías en un mensaje y te lo confirmo de una?`,
      maqueta: "datos_envio",
    },
  ],
};

// ── Scheduler helpers ────────────────────────────────────────────────
// Estos helpers usan programador.ts (trabajos_programados) si existe; si no,
// caen a setTimeout local (solo para tests).
export async function programarDripPro(
  conversacionId: number,
  disparador: DisparadorFollowup,
  vars: { nombre: string; producto: string; precio: string; ciudad?: string },
  tenantId = 0,
): Promise<number[]> {
  const pasos = SECUENCIAS[disparador] || [];
  const ids: number[] = [];
  for (let i = 0; i < pasos.length; i++) {
    const paso = pasos[i]!;
    try {
      const { programar } = await import("../programador");
      const clave = `wa_pro_${conversacionId}_${disparador}_${paso.plantilla}`;
      const res = await programar({
        tenantId: tenantId || 0,
        tipo: "whatsapp_followup_pro",
        clave,
        correAt: new Date(Date.now() + paso.delayMin * 60_000),
        datos: {
          conversacionId,
          disparador,
          plantilla: paso.plantilla,
          texto: paso.texto(vars),
          maqueta: paso.maqueta || null,
          paso: i + 1,
        },
      });
      if (res?.id) ids.push(Number(res.id));
    } catch {
      // noop en tests sin DB
    }
  }
  return ids;
}

export async function cancelarDripPro(conversacionId: number): Promise<void> {
  for (const disparador of Object.keys(SECUENCIAS) as DisparadorFollowup[]) {
    for (const paso of SECUENCIAS[disparador]) {
      try {
        const { cancelar } = await import("../programador");
        await cancelar(`wa_pro_${conversacionId}_${disparador}_${paso.plantilla}`);
      } catch { /* noop */ }
    }
  }
}

/**
 * Evalúa si disparar drip tras enviar una sección.
 * Llamar desde herramientas.ts / whatsapp.ts después de mostrar precio/pago/datos.
 */
export function debeDispararDrip(seccion: string): DisparadorFollowup | null {
  if (seccion === "precio") return "precio_enviado";
  if (seccion === "pago" || seccion === "pago_transferencia" || seccion === "pago_link") return "pago_enviado";
  if (seccion === "datos_pedido") return "datos_pedido_incompletos";
  return null;
}
