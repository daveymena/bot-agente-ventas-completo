/**
 * LO QUE ATLAS CONFIGURA TIENE QUE CAER DONDE EL VENDEDOR LEE
 * ==========================================================
 *
 * Hasta el 25-09-2026 `agente_configurar` escribía siempre en los campos del
 * motor viejo (`tenants.agentPrompt`, `agentPersonality`, `estiloDeVenta`) y
 * respondía "el cambio ya está activo en la próxima conversación". Desde el
 * 22-09 atiende el motor v2, que NO lee ninguno de esos tres: Atlas confirmaba
 * cambios que el cliente nunca veía.
 *
 * La regla vive acá y no en la descripción de la herramienta: qué campo lee
 * cada motor es un hecho del código, y un hecho se prueba, no se le pide al
 * modelo que lo recuerde.
 *
 *   campo            v1                          v2
 *   ───────────────  ──────────────────────────  ─────────────────────────────
 *   agentName        tenants.agentName           tenants.agentName
 *   brandName        tenants.brandName           tenants.brandName
 *   tono             businessProfile.tono        businessProfile.tono
 *   negociaPrecio    businessProfile             businessProfile
 *   prompt           tenants.agentPrompt         agents.metadata.indicaciones
 *   estiloDeVenta    businessProfile             (no lo lee todavía)
 *   agentPersonality (ninguno lo lee)            (ninguno lo lee)
 *
 * Lo que el motor del negocio no lee NO se guarda y se dice por qué: guardarlo
 * haría que `agente_inspectar` lo muestre como configurado sin serlo.
 */

import { and, eq } from "drizzle-orm";
import { db, agents, tenants } from "@workspace/db";
import { dbNow } from "./date-utils";
import { motorDelTenant, type Motor } from "./motor-nuevo/activacion";
import { invalidarContextoDeNegocio } from "./business-context";
import { tenantManager } from "./tenantManager";

export interface ArgsDeConfiguracion {
  agentName?: unknown;
  brandName?: unknown;
  agentPersonality?: unknown;
  prompt?: unknown;
  promptLibre?: unknown;
  tono?: unknown;
  negociaPrecio?: unknown;
  estiloDeVenta?: unknown;
  /** Solo v2: a qué agente van las instrucciones libres. Sin él, el principal. */
  agentId?: unknown;
}

export interface ResultadoDeConfiguracion {
  ok: boolean;
  motor: Motor;
  aplicados: { campo: string; donde: string }[];
  ignorados: { campo: string; motivo: string }[];
  /** Lo que había antes de cada campo aplicado: para poder volver atrás. */
  anterior: Record<string, unknown>;
  summary: string;
}

function objeto(valor: unknown): Record<string, any> {
  if (!valor) return {};
  if (typeof valor === "string") {
    try {
      const p = JSON.parse(valor);
      return p && typeof p === "object" ? p : {};
    } catch {
      return {};
    }
  }
  return typeof valor === "object" ? { ...(valor as Record<string, any>) } : {};
}

/** El agente que recibe las instrucciones libres en v2: el pedido, o el principal. */
async function agenteDestino(tenantId: number, agentId: unknown) {
  if (agentId != null && agentId !== "") {
    const [a] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, Number(agentId)), eq(agents.tenantId, tenantId)))
      .limit(1);
    return { agente: a || null, activos: [] as any[], pedido: true };
  }
  const todos = await db.select().from(agents).where(eq(agents.tenantId, tenantId));
  const activos = todos.filter((a: any) => a.isActive);
  // Mismo criterio que `agenteDelTenant`: primero los activos, después el id más viejo.
  const orden = [...todos].sort((a: any, b: any) => Number(!!b.isActive) - Number(!!a.isActive) || a.id - b.id);
  return { agente: orden[0] || null, activos, pedido: false };
}

export async function configurarAgente(tenantId: number, args: ArgsDeConfiguracion): Promise<ResultadoDeConfiguracion> {
  const motor = await motorDelTenant(tenantId);
  const aplicados: ResultadoDeConfiguracion["aplicados"] = [];
  const ignorados: ResultadoDeConfiguracion["ignorados"] = [];
  const anterior: Record<string, unknown> = {};
  const fallo = (summary: string): ResultadoDeConfiguracion => ({ ok: false, motor, aplicados, ignorados, anterior, summary });

  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) return fallo("No se encontró el negocio.");

  const patchTenant: Record<string, any> = {};
  const meta = objeto((t as any).metadata);
  const bp = objeto(meta.businessProfile);
  const nuevoBp: Record<string, any> = { ...bp };
  let tocaPerfil = false;

  if (args.agentName !== undefined) {
    anterior.agentName = (t as any).agentName ?? null;
    patchTenant.agentName = String(args.agentName);
    aplicados.push({ campo: "agentName", donde: "nombre con el que se presenta el vendedor" });
  }
  if (args.brandName !== undefined) {
    anterior.brandName = (t as any).brandName ?? null;
    patchTenant.brandName = String(args.brandName);
    aplicados.push({ campo: "brandName", donde: "nombre del negocio" });
  }
  if (args.tono !== undefined) {
    anterior.tono = bp.tono ?? null;
    nuevoBp.tono = String(args.tono);
    tocaPerfil = true;
    aplicados.push({ campo: "tono", donde: "tono del negocio (lo leen los dos motores)" });
  }
  if (args.negociaPrecio !== undefined) {
    anterior.negociaPrecio = bp.negociaPrecio ?? null;
    nuevoBp.negociaPrecio = args.negociaPrecio === true || args.negociaPrecio === "true";
    tocaPerfil = true;
    aplicados.push({ campo: "negociaPrecio", donde: "política de descuentos" });
  }

  if (args.agentPersonality !== undefined) {
    ignorados.push({
      campo: "agentPersonality",
      motivo: "ningún motor del vendedor lee la personalidad. Para cambiar cómo habla, mandá 'tono' con la descripción (ej: \"cercano, frases cortas, tutea\").",
    });
  }

  if (args.estiloDeVenta !== undefined) {
    if (motor === "v1") {
      anterior.estiloDeVenta = bp.estiloDeVenta ?? null;
      nuevoBp.estiloDeVenta = { ...objeto(bp.estiloDeVenta), ...objeto(args.estiloDeVenta) };
      tocaPerfil = true;
      aplicados.push({ campo: "estiloDeVenta", donde: "estilo de venta del motor v1" });
    } else {
      ignorados.push({
        campo: "estiloDeVenta",
        motivo: "este negocio atiende con el motor v2, que todavía no lee el estilo de venta. No se guardó para no mostrarlo como configurado.",
      });
    }
  }

  // Instrucciones libres: cada motor las lee de un lugar distinto.
  const prompt = args.prompt !== undefined ? args.prompt : args.promptLibre;
  let patchAgente: { id: number; metadata: Record<string, any> } | null = null;
  let avisoAgentes = "";
  if (prompt !== undefined) {
    const texto = String(prompt).trim();
    if (motor === "v1") {
      anterior.prompt = (t as any).agentPrompt ?? null;
      patchTenant.agentPrompt = texto || null;
      aplicados.push({ campo: "prompt", donde: "instrucciones del negocio (motor v1)" });
    } else {
      const { agente, activos, pedido } = await agenteDestino(tenantId, args.agentId);
      const { validarIndicaciones } = await import("./disenar-agente");
      const v = validarIndicaciones(texto);
      if (!v.ok) {
        ignorados.push({ campo: "prompt", motivo: `las instrucciones ${v.errores.join(" Además, ")}` });
      } else if (!agente) {
        ignorados.push({
          campo: "prompt",
          motivo: pedido
            ? `no existe el agente #${args.agentId} en este negocio.`
            : "no hay ningún agente creado: las instrucciones del motor v2 van en un agente. Creá uno primero.",
        });
      } else {
        const m = objeto(agente.metadata);
        anterior.prompt = m.indicaciones ?? null;
        anterior.agentId = agente.id;
        m.indicaciones = texto.slice(0, 2000);
        patchAgente = { id: agente.id, metadata: m };
        aplicados.push({ campo: "prompt", donde: `indicaciones de ${agente.name} (#${agente.id}), las que lee el motor v2` });
        const otros = activos.filter((a: any) => a.id !== agente.id);
        if (otros.length) {
          avisoAgentes =
            ` Ojo: ${otros.map((a: any) => `${a.name} (#${a.id})`).join(", ")} también atiende y conserva sus propias indicaciones; ` +
            `si el cambio es para todos, mandalo de nuevo con su agentId.`;
        }
      }
    }
  }

  if (tocaPerfil) patchTenant.metadata = { ...meta, businessProfile: nuevoBp };

  if (aplicados.length === 0) {
    const nada = "No mandaste ningún campo para cambiar. Campos: agentName, brandName, tono, negociaPrecio, prompt, estiloDeVenta.";
    return fallo(
      ignorados.length
        ? `No se cambió nada. ${ignorados.map((i) => `${i.campo}: ${i.motivo}`).join(" ")}`
        : nada,
    );
  }

  if (Object.keys(patchTenant).length) {
    patchTenant.updatedAt = dbNow();
    await db.update(tenants).set(patchTenant).where(eq(tenants.id, tenantId));
  }
  if (patchAgente) {
    await db.update(agents).set({ metadata: patchAgente.metadata, updatedAt: dbNow() } as any).where(eq(agents.id, patchAgente.id));
  }

  // Sin esto el cambio tarda hasta un minuto: justo lo que el dueño mira al probar.
  invalidarContextoDeNegocio(tenantId);
  try {
    tenantManager.clearCache();
  } catch {
    /* no crítico */
  }

  const partes = [
    `Motor del negocio: ${motor}.`,
    `Aplicado desde el próximo mensaje: ${aplicados.map((a) => `${a.campo} → ${a.donde}`).join("; ")}.`,
  ];
  if (ignorados.length) partes.push(`NO aplicado: ${ignorados.map((i) => `${i.campo}: ${i.motivo}`).join(" ")}`);
  if (avisoAgentes) partes.push(avisoAgentes.trim());

  return { ok: true, motor, aplicados, ignorados, anterior, summary: partes.join(" ") };
}
