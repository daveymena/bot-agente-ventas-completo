/**
 * Agent Lab — el chat del simulador.
 *
 * Simula clientes contra el vendedor REAL de este negocio (motor v2, en
 * memoria), muestra lo que pasó en cada charla con los hallazgos del
 * evaluador de chats, y convierte esos hallazgos en REGLAS que el dueño aplica
 * con un clic (las mismas de "Probar vendedor → Corregir", que el vendedor lee
 * en cada mensaje de WhatsApp).
 *
 * Reescrito el 26-09-2026. Antes, probado en producción:
 *  - usaba el producto #1 por defecto, que no existía en ese catálogo: 0
 *    simulaciones y "¡Excelente! No se detectaron problemas" (verde falso);
 *  - leía los resultados fuera de `data`, así que siempre mostraba 0;
 *  - cuando había problemas imprimía hallazgos FIJOS ("Lenguaje demasiado
 *    técnico"…) sin mirar la charla, y "proponer mejora" usaba un hallazgo fijo;
 *  - "comparar" inventaba el % de mejora, y "aplicar versión" cambiaba
 *    `agents.systemPrompt`, que el vendedor nuevo (v2) no lee.
 *
 * Cliente: artifacts/ventas-pro/src/pages/agent-lab.tsx
 */

import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { architectMemory, db } from "@workspace/db";
import { logger } from "../lib/logger";
import type { TenantRequest } from "../lib/tenantManager";
import { executeAction } from "../lib/app-operator";

const router = Router();

/** Tope de charlas por pedido: cada una son ~10 llamadas al modelo. */
const MAX_SIMULACIONES = 3;
const TURNOS_POR_CHARLA = 5;

const N = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * El producto del que habla el dueño: el id que mandó la pantalla, si no el
 * que nombra en el mensaje ("simula clientes para el corrector de hombros"),
 * si no el primero disponible del catálogo.
 */
export function elegirProducto<T extends { id: number; name: string; disponible?: boolean }>(
  catalogo: T[],
  mensaje: string,
  productoId?: number | null,
): T | null {
  const porId = catalogo.find((p) => p.id === Number(productoId));
  if (porId) return porId;
  const palabras = N(mensaje).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 4);
  let mejor: { p: T; puntos: number } | null = null;
  for (const p of catalogo) {
    const nombre = N(p.name);
    const puntos = palabras.reduce((n, w) => n + (nombre.includes(w) ? 1 : 0), 0);
    if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { p, puntos };
  }
  return mejor?.p ?? catalogo.find((p) => p.disponible !== false) ?? catalogo[0] ?? null;
}

/** Cuántas charlas pide ("simula 5 clientes"), con tope. */
export function cantidadPedida(mensaje: string, arquetipos: number): number {
  const n = Number(mensaje.match(/\b(\d{1,2})\b/)?.[1]);
  const pedida = Number.isFinite(n) && n > 0 ? n : Math.max(arquetipos, 1);
  return Math.min(pedida, MAX_SIMULACIONES);
}

/** Qué quiere hacer el dueño con su mensaje. */
export function intencionDelLab(mensaje: string): "simular" | "mejorar" | "aplicar_regla" | "version" | "ayuda" {
  const t = N(mensaje);
  if (/\baplica(r)?\b.*\b(regla|reglas|todas|la\s+\d|\d)\b/.test(t) && !/\bversion\b/.test(t)) return "aplicar_regla";
  if (/\b(simula|simular|simulacion|simulaciones)\b/.test(t)) return "simular";
  if (/\b(mejora|mejorar|propone|proponer|propuesta)\b/.test(t)) return "mejorar";
  if (/\b(compara|comparar|version|candidata|aplica|aplicar|rollback|a\/b)\b/.test(t)) return "version";
  if (/\bclientes?\b/.test(t)) return "simular";
  return "ayuda";
}

async function guardar(tenantId: number, tipo: string, contenido: unknown) {
  try {
    // `title` es obligatorio en la tabla y la fecha la pone la base: sin el
    // título el insert fallaba siempre y "propone mejoras" nunca encontraba
    // la simulación ("Primero simula clientes", recién simulado).
    await db.insert(architectMemory).values({
      tenantId,
      memoryType: tipo,
      title: tipo === "agentlab_simulacion" ? "Simulación del Agent Lab" : "Reglas propuestas del Agent Lab",
      tags: ["agent-lab"],
      content: JSON.stringify(contenido),
    } as any);
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[AgentLab] no se guardó en architect_memory");
  }
}

async function ultimo(tenantId: number, tipo: string): Promise<any | null> {
  try {
    const [fila] = await db
      .select()
      .from(architectMemory)
      .where(and(eq(architectMemory.tenantId, tenantId), eq(architectMemory.memoryType, tipo)))
      .orderBy(desc(architectMemory.id))
      .limit(1);
    return fila ? JSON.parse(String((fila as any).content || "null")) : null;
  } catch {
    return null;
  }
}

const AYUDA = `**Agent Lab**: pon a prueba a tu vendedor con clientes simulados.

📊 **Simular**: \`simula 3 clientes desconfiados para el corrector\`
Arquetipos: normal, desconfiado, precio sensible, apresurado, indeciso, curioso, comparador, escéptico, experto, molesto, difícil, listo para comprar.

🔧 **Proponer mejoras**: \`propone mejoras\`
Convierte lo que salió mal en la última simulación en reglas concretas.

✅ **Aplicar**: \`aplica la regla 1\` o \`aplica todas\`
Van a tu vendedor al instante (las mismas de *Probar vendedor → Corregir*) y se deshacen en *Lo que ya sabe*.`;

router.post("/chat", async (req: TenantRequest, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ ok: false, reply: "Sin sesión" });
  const mensaje = String(req.body?.message || "").trim();
  if (!mensaje) return res.status(400).json({ ok: false, reply: "Mensaje vacío" });

  const intencion = intencionDelLab(mensaje);
  logger.info({ tenantId, intencion }, "[AgentLab] pedido");
  const ctx = { tenantId, userMessage: mensaje, isApproved: true } as any;

  try {
    if (intencion === "ayuda") return res.json({ ok: true, reply: AYUDA });

    if (intencion === "version") {
      return res.json({
        ok: true,
        reply:
          "Las **versiones de prompt** (comparar, aplicar, A/B, rollback) cambian un campo que tu vendedor actual ya no usa, " +
          "así que no te voy a mostrar una mejora que no llegaría a WhatsApp.\n\n" +
          "Para mejorar al vendedor de verdad: **simula**, escribe **propone mejoras** y **aplica** las reglas que te sirvan. " +
          "También puedes corregir respuesta por respuesta en *Probar vendedor*.",
      });
    }

    // ── Simular ─────────────────────────────────────────────────────────────
    if (intencion === "simular") {
      const { cargarCatalogoDelNegocio } = await import("../lib/motor-nuevo/adaptador");
      const { arquetiposDelMensaje } = await import("../lib/motor-nuevo/cliente-simulado");
      const catalogo = await cargarCatalogoDelNegocio(tenantId);
      const producto = elegirProducto(catalogo, mensaje, Number(req.body?.productoId) || null);
      if (!producto) return res.json({ ok: false, reply: "Tu catálogo está vacío: carga al menos un producto para simular." });

      const nombrados = arquetiposDelMensaje(mensaje);
      const base = nombrados.length ? nombrados : ["NORMAL", "DESCONFIADO", "PRECIO_SENSIBLE"];
      const cuantas = cantidadPedida(mensaje, base.length);
      const arquetipos = Array.from({ length: cuantas }, (_, i) => base[i % base.length]);

      // Una llamada por arquetipo: la herramienta no repite claves.
      const resultados: any[] = [];
      for (const a of arquetipos) {
        const r = await executeAction("agentlab_simular", { productoId: producto.id, arquetipos: [a], maxTurnos: TURNOS_POR_CHARLA }, ctx);
        resultados.push(r);
      }
      const buenos = resultados.filter((r) => r.ok && r.data?.simulaciones);
      if (!buenos.length) {
        return res.json({ ok: false, reply: `❌ No se pudo simular. ${resultados.map((r) => r.summary).join(" ")}` });
      }

      const conversaciones = buenos.flatMap((r) => r.data.conversaciones);
      const agrupados = new Map<string, number>();
      for (const r of buenos) for (const g of r.data.agrupados || []) agrupados.set(g.problema, (agrupados.get(g.problema) || 0) + g.veces);
      const compras = conversaciones.filter((c: any) => c.cerroEn === "compra").length;
      const fallidas = resultados.filter((r) => !r.ok).map((r) => r.summary);

      await guardar(tenantId, "agentlab_simulacion", { producto: { id: producto.id, nombre: producto.name }, conversaciones, agrupados: [...agrupados] });

      const cierre = (c: string) => (c === "compra" ? "✅ compró" : c === "abandono" ? "🚪 se fue" : "⏸️ siguió conversando");
      const lista = [...agrupados.entries()].sort((a, b) => b[1] - a[1]);
      const reply = [
        `📊 **Simulación sobre ${producto.name}**`,
        `${conversaciones.length} charla${conversaciones.length === 1 ? "" : "s"} · ${compras} compra${compras === 1 ? "" : "s"}`,
        "",
        ...conversaciones.map((c: any) => `• **${c.cliente}**: ${cierre(c.cerroEn)} en ${Math.ceil(c.turnos.length / 2)} mensajes${c.problemas.length ? ` · ${c.problemas.length} hallazgo${c.problemas.length === 1 ? "" : "s"}` : ""}`),
        "",
        lista.length
          ? `**Lo que salió mal** (del evaluador de chats, sobre las charlas reales):\n${lista.map(([p, v]) => `- ${p}${v > 1 ? ` (×${v})` : ""}`).join("\n")}\n\nEscribe **propone mejoras** para convertirlo en reglas.`
          : "El evaluador no encontró fallas en estas charlas. Revisa las conversaciones abajo por si ves algo que corregir.",
        fallidas.length ? `\n⚠️ Fallaron ${fallidas.length}: ${fallidas.join(" | ")}` : "",
      ].join("\n");

      return res.json({ ok: true, reply, data: { producto: { id: producto.id, nombre: producto.name }, conversaciones, agrupados: lista } });
    }

    // ── Proponer mejoras: hallazgos reales → reglas concretas ──────────────
    if (intencion === "mejorar") {
      const sim = await ultimo(tenantId, "agentlab_simulacion");
      if (!sim?.conversaciones?.length) {
        return res.json({ ok: false, reply: "Primero simula clientes (por ejemplo: *simula 3 clientes desconfiados*). Las mejoras salen de lo que pase en esas charlas." });
      }
      const reglas = await proponerReglas(tenantId, sim);
      if (!reglas.length) {
        return res.json({ ok: true, reply: "No encontré nada que valga la pena convertir en regla en la última simulación. Prueba con otros arquetipos." });
      }
      await guardar(tenantId, "agentlab_propuestas", { reglas });
      return res.json({
        ok: true,
        reply: [
          "🔧 **Reglas propuestas** (salen de las charlas simuladas):",
          "",
          ...reglas.map((r, i) => `**${i + 1}.** ${r.regla}\n   _${r.porque}_`),
          "",
          "Escribe **aplica la regla 1**, **aplica 1 y 3** o **aplica todas**. Se aplican al instante a todos tus agentes.",
        ].join("\n"),
        data: { reglas },
      });
    }

    // ── Aplicar reglas propuestas ───────────────────────────────────────────
    if (intencion === "aplicar_regla") {
      const prop = await ultimo(tenantId, "agentlab_propuestas");
      const reglas: { regla: string }[] = prop?.reglas || [];
      if (!reglas.length) return res.json({ ok: false, reply: "No hay reglas propuestas. Escribe *propone mejoras* después de simular." });
      const numeros = /\btodas\b/i.test(mensaje)
        ? reglas.map((_, i) => i + 1)
        : [...new Set((mensaje.match(/\d+/g) || []).map(Number))].filter((n) => n >= 1 && n <= reglas.length);
      if (!numeros.length) return res.json({ ok: false, reply: `¿Cuál? Hay ${reglas.length}: escribe por ejemplo *aplica la regla 1* o *aplica todas*.` });

      const { corregirForma } = await import("../lib/correcciones-del-dueno");
      const lineas: string[] = [];
      for (const n of numeros) {
        const r = await corregirForma(tenantId, reglas[n - 1].regla);
        lineas.push(`${r.ok ? "✅" : "❌"} Regla ${n}: ${r.ok ? reglas[n - 1].regla : r.mensaje}`);
      }
      return res.json({
        ok: true,
        reply: `${lineas.join("\n")}\n\nYa las usa tu vendedor, también en WhatsApp. Vuelve a **simular** para ver si mejoró; si algo no te gusta, bórralo en *Probar vendedor → Lo que ya sabe*.`,
      });
    }

    return res.json({ ok: true, reply: AYUDA });
  } catch (e: any) {
    logger.error({ tenantId, err: e?.message }, "[AgentLab] error");
    return res.status(500).json({ ok: false, reply: `Error: ${e?.message || "no se pudo completar"}` });
  }
});

/**
 * Hallazgos + charlas de la última simulación → hasta 5 reglas cortas para el
 * vendedor. Sin precios ni plazos (las reglas no llevan datos: los datos salen
 * del catálogo), y validadas otra vez al aplicarse (`configurarAgente`).
 */
async function proponerReglas(tenantId: number, sim: any): Promise<{ regla: string; porque: string }[]> {
  const { armarCadena, crearClienteLLM } = await import("../lib/motor-nuevo/cliente-llm");
  const { extraerJson } = await import("../lib/entender-al-cliente");
  const { loQueSabeElVendedor } = await import("../lib/correcciones-del-dueno");
  const sabe = await loQueSabeElVendedor(tenantId);
  const charlas = (sim.conversaciones || [])
    .slice(0, 3)
    .map((c: any) => `### ${c.cliente} (${c.cerroEn})\n${c.turnos.map((t: any) => `${t.quien === "cliente" ? "CLIENTE" : "VENDEDOR"}: ${t.texto}`).join("\n")}`)
    .join("\n\n");
  const hallazgos = (sim.agrupados || []).map(([p, v]: [string, number]) => `- ${p} (×${v})`).join("\n") || "(el evaluador no marcó nada)";
  const prompt = [
    "Eres jefe de ventas por WhatsApp. Revisa estas charlas SIMULADAS entre clientes y el vendedor de un negocio.",
    `Producto: ${sim.producto?.nombre || "?"}`,
    "",
    "HALLAZGOS DEL EVALUADOR:",
    hallazgos,
    "",
    "REGLAS QUE YA TIENE EL VENDEDOR:",
    sabe.indicaciones.map((i) => `- ${i}`).join("\n") || "(ninguna)",
    "",
    "CHARLAS:",
    charlas,
    "",
    "Propón hasta 5 REGLAS de cómo vender que corrijan lo que salió mal (repite datos, no responde lo que preguntaron, presiona, no cierra, pregunta de más…).",
    "Cada regla: una frase corta, general, tuteando, sin precios, montos ni plazos. No repitas reglas que ya tiene. Si no hay nada que corregir, devuelve una lista vacía.",
    'Responde SOLO este JSON: {"reglas":[{"regla":"...","porque":"qué pasó en la charla, citándola"}]}',
  ].join("\n");
  const llm = crearClienteLLM({ cadena: await armarCadena({ tenantId }), tenantId });
  const r = await llm.crear({ messages: [{ role: "user", content: prompt }], temperature: 0.3, maxTokens: 900 });
  const crudo = extraerJson(r.content || "");
  const lista: any[] = Array.isArray(crudo?.reglas) ? crudo.reglas : [];
  return lista
    .map((x) => ({ regla: String(x?.regla || "").trim().slice(0, 300), porque: String(x?.porque || "").trim().slice(0, 300) }))
    .filter((x) => x.regla && !/\$\s?\d|\d{1,3}(\.\d{3})+/.test(x.regla))
    .slice(0, 5);
}

export default router;
