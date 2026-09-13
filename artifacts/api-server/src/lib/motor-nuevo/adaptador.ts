/**
 * ADAPTADOR DEL MOTOR NUEVO AL SISTEMA REAL (modo sombra)
 * ======================================================
 *
 * El motor de `motor.ts` no sabe nada de la base ni del proveedor de IA:
 * recibe un `ClienteLLM`, un catálogo y una voz. Acá se construyen esas tres
 * cosas con lo que ya existe en el repo, SIN tocar el camino de WhatsApp:
 *
 *   - `clienteDeepSeek`: tool calling estilo OpenAI contra DeepSeek (la misma
 *     API que usa atlas-directo.ts para el operador).
 *   - `cargarCatalogoDelNegocio`: los productos activos del tenant, con el
 *     video leído del metadata igual que lo hace el render de la ficha.
 *   - `RepositorioEnMemoria`: el estado explícito vive en memoria mientras el
 *     motor corre en sombra. Cuando pase a producción va a una columna jsonb.
 *
 * Nada de esto se llama desde el flujo real: solo desde la ruta de sombra
 * (`POST /api/whatsapp/sombra`), que corre los dos motores sobre los mismos
 * turnos y devuelve las dos salidas para compararlas.
 */
import { and, eq } from "drizzle-orm";
import { db, products, agents } from "@workspace/db";
import { videoDeProducto } from "../video-de-producto";
import { getAppUrl } from "../app-url";
import { logger } from "../logger";
import { estadoInicial, type EstadoConversacion, type RepositorioEstado } from "./estado-conversacion";
import type { Producto } from "./herramientas";
import type { ClienteLLM, VozDelNegocio } from "./motor";

const URL_DEEPSEEK = "https://api.deepseek.com/chat/completions";

/** Cliente con tool calling. Sin clave devuelve un error legible, no una excepción. */
export function clienteDeepSeek(opts: { apiKey?: string; modelo?: string; timeoutMs?: number } = {}): ClienteLLM {
  const apiKey = String(opts.apiKey || process.env.DEEPSEEK_API_KEY || "");
  const modelo = opts.modelo || process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const timeoutMs = opts.timeoutMs ?? 25_000;
  return {
    async crear({ messages, tools, temperature }) {
      if (!apiKey) throw new Error("Sin DEEPSEEK_API_KEY: el motor nuevo necesita un modelo con tool calling");
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const r = await fetch(URL_DEEPSEEK, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: modelo, messages, tools, tool_choice: "auto", temperature, max_tokens: 700 }),
          signal: ctrl.signal,
        });
        if (!r.ok) throw new Error(`DeepSeek HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const j: any = await r.json();
        const m = j?.choices?.[0]?.message || {};
        return {
          content: typeof m.content === "string" ? m.content : null,
          toolCalls: Array.isArray(m.tool_calls)
            ? m.tool_calls.map((tc: any) => ({ id: String(tc.id), name: String(tc.function?.name || ""), arguments: String(tc.function?.arguments || "{}") }))
            : [],
        };
      } finally {
        clearTimeout(t);
      }
    },
  };
}

/** Productos activos del negocio, en la forma que espera el motor. */
export async function cargarCatalogoDelNegocio(tenantId: number, soloKind?: "digital" | "physical"): Promise<Producto[]> {
  const filas = await db.select().from(products).where(and(eq(products.tenantId, tenantId), eq(products.isActive, true))).limit(200);
  return filas
    .filter((p: any) => !soloKind || String(p.kind || "digital") === soloKind)
    .map((p: any) => {
      let videoUrl: string | null = null;
      try { videoUrl = videoDeProducto(p.metadata) || null; } catch { videoUrl = null; }
      return {
        id: p.id,
        name: String(p.name || ""),
        description: p.description ? String(p.description) : null,
        price: p.price != null && Number.isFinite(Number(p.price)) ? Number(p.price) : null,
        currency: p.currency || "COP",
        videoUrl,
        // En sombra alcanza con el enlace público del producto; en producción
        // acá irían los enlaces de MercadoPago/PayPal que genera PaymentGateway.
        paymentUrl: p.paymentLink ? String(p.paymentLink) : `${getAppUrl()}/p/${p.id}`,
        disponible: true,
      };
    });
}

/** La voz: nombre y rol del agente activo del negocio, y su prompt como indicaciones. */
export async function cargarVozDelNegocio(tenantId: number, agentId?: number | null): Promise<VozDelNegocio> {
  const filas = await db.select().from(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.isActive, true)));
  const a: any = (agentId ? filas.find((x: any) => x.id === agentId) : null) || filas[0] || {};
  return {
    nombreAgente: String(a.name || "Asesor"),
    rolAgente: String(a.role || "asesor comercial"),
    nombreNegocio: String(process.env.BUSINESS_NAME || "el negocio"),
    instruccionesExtra: a.systemPrompt ? String(a.systemPrompt).slice(0, 1500) : undefined,
  };
}

/** Estado en memoria: suficiente para correr en sombra. Se pierde al reiniciar. */
export class RepositorioEnMemoria implements RepositorioEstado {
  private estados = new Map<number, EstadoConversacion>();
  async cargar(conversationId: number) {
    return this.estados.get(conversationId) ?? estadoInicial(conversationId);
  }
  async guardar(estado: EstadoConversacion) {
    this.estados.set(estado.conversationId, estado);
    logger.debug({ conversationId: estado.conversationId, etapa: estado.etapa }, "[MotorNuevo] estado guardado (memoria)");
  }
}
