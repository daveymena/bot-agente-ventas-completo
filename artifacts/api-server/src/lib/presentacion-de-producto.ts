/**
 * LA PRESENTACIÓN DEL PRODUCTO LA REDACTA LA IA (con las correcciones del dueño)
 * ============================================================================
 *
 * Hasta el 26-09-2026 la ficha de un físico la armaba el código: título, una
 * frase de la descripción, las MISMAS viñetas del anuncio y el precio, todo en
 * una burbuja. El dueño la corrigió tres veces desde /probar-vendedor ("no
 * amontones la información", "separa más los renglones") y nunca cambió: sus
 * indicaciones llegaban al modelo, pero la ficha no la escribía el modelo.
 *
 * Ahora:
 *  - La IA redacta el GANCHO (el dolor → la solución) y "Así te ayuda" (3
 *    resultados), SOLO con los datos del producto y siguiendo TODAS las
 *    indicaciones del dueño.
 *  - Los datos duros (precio, envío, pago, tallas) los pone el servidor: la IA
 *    no puede inventar un precio ni una promesa de entrega.
 *  - Se guarda en `products.metadata.presentacion` con una firma de lo que la
 *    produjo (producto + indicaciones). Si el dueño corrige algo, la firma
 *    cambia y se vuelve a redactar sola en el próximo mensaje.
 *  - Si la IA falla o no pasa el validador, sale la ficha de siempre.
 */
import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db, products } from "@workspace/db";
import { logger } from "./logger";
import { hablarColombiano } from "./hablar-colombiano";
import * as anuncioInteligente from "./anuncio-inteligente";

export interface TextosDePresentacion {
  gancho: string;
  beneficios: string[];
}

interface Guardada extends TextosDePresentacion {
  firma: string;
  autor?: string;
  generadaEn: string;
}

const SYSTEM = `Eres el mejor vendedor por WhatsApp de una tienda en Colombia (pago contraentrega).
Escribes la PRESENTACIÓN de un producto para alguien que ya vio el anuncio y pidió información.
Español de Colombia, tuteo (nunca voseo). Cálido, directo, sin exagerar.

Devuelve SOLO este JSON:
{"gancho":"1 o 2 frases: el problema o la molestia que siente la persona y cómo este producto se lo resuelve","beneficios":["resultado 1","resultado 2","resultado 3"]}

Reglas:
- Usa SOLO lo que dicen los datos del producto. No inventes materiales, medidas, cifras, testimonios ni garantías.
- Los beneficios son RESULTADOS para la persona (qué gana, qué deja de pasarle), no especificaciones técnicas. Máximo 14 palabras cada uno.
- No repitas las frases del anuncio tal cual: dilo de otra forma, enfocado en lo que la persona quiere.
- NO escribas precio, envío, forma de pago ni tallas: eso lo agrega el sistema.
- Nada de promesas médicas: no digas que cura, elimina el dolor, sana o que lo recomiendan médicos.
- Sin emojis dentro del JSON.
- Las INDICACIONES DEL DUEÑO mandan sobre todo lo anterior (salvo inventar datos).`;

const PROHIBIDO = /\$|\bcop\b|\d{2,3}\.?\d{3}|contraentrega|contra entrega|env[ií]o|\bcura\b|sana\b|elimina(r)? (el|los) dolor|m[eé]dic|garant/i;

/** Valida y limpia lo que devolvió la IA (pura, con test). */
export function leerPresentacion(crudo: string): TextosDePresentacion | null {
  try {
    const t = String(crudo || "");
    const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    const gancho = hablarColombiano(String(j.gancho || "").replace(/\s+/g, " ").trim());
    const beneficios = (Array.isArray(j.beneficios) ? j.beneficios : [])
      .map((b: unknown) => hablarColombiano(String(b || "").replace(/\s+/g, " ").replace(/^[-•*\d.)\s]+/, "").trim()))
      .filter(Boolean)
      .slice(0, 3);
    if (gancho.length < 20 || gancho.length > 220) return null;
    if (beneficios.length < 3 || beneficios.some((b: string) => b.length > 120)) return null;
    if ([gancho, ...beneficios].some((x) => PROHIBIDO.test(x))) return null;
    return { gancho, beneficios };
  } catch {
    return null;
  }
}

export function firmaDePresentacion(p: { name?: string | null; description?: string | null; features?: unknown }, indicaciones: string[]): string {
  return createHash("sha1")
    .update(JSON.stringify([p.name || "", p.description || "", p.features || [], indicaciones]))
    .digest("hex")
    .slice(0, 16);
}

const enCurso = new Map<string, Promise<TextosDePresentacion | null>>();

/**
 * La presentación vigente del producto: la guardada si su firma coincide, o
 * una recién redactada. null = usar la ficha de siempre.
 */
export async function presentacionDelProducto(p: any): Promise<TextosDePresentacion | null> {
  const tenantId = Number(p?.tenantId);
  if (!tenantId || !p?.id) return null;
  let indicaciones: string[] = [];
  try {
    const { loQueSabeElVendedor } = await import("./correcciones-del-dueno");
    indicaciones = ((await loQueSabeElVendedor(tenantId)) as any)?.indicaciones || [];
  } catch { indicaciones = []; }

  const meta = typeof p.metadata === "string" ? safeJson(p.metadata) : (p.metadata || {});
  const firma = firmaDePresentacion(p, indicaciones);
  const guardada: Guardada | undefined = meta?.presentacion;
  // La guardada también se revisa: una redactada antes de que existiera este
  // control (09-10-2026) seguía saliendo con "de manera inmediata".
  if (guardada?.firma === firma && guardada.gancho && guardada.beneficios?.length === 3 && !prometeDeMas(guardada, p)) return guardada;

  const clave = `${p.id}:${firma}`;
  if (!enCurso.has(clave)) {
    enCurso.set(clave, redactar(p, indicaciones, firma, meta).finally(() => enCurso.delete(clave)));
  }
  return enCurso.get(clave)!;
}

async function redactar(p: any, indicaciones: string[], firma: string, meta: any): Promise<TextosDePresentacion | null> {
  try {
    const { redactarConProveedores, ORDEN_GRATUITOS_PRIMERO } = await import("./landing/agente-landing");
    const user = [
      `PRODUCTO: ${p.name}`,
      `DESCRIPCIÓN: ${String(p.description || "").slice(0, 1200)}`,
      `CARACTERÍSTICAS: ${((p.features || []) as string[]).join(" | ").slice(0, 800)}`,
      indicaciones.length ? `INDICACIONES DEL DUEÑO (obligatorias):\n- ${indicaciones.join("\n- ")}` : "",
    ].filter(Boolean).join("\n\n");
    const r = await redactarConProveedores({
      tenantId: Number(p.tenantId), system: SYSTEM, user, timeoutMs: 20_000, maxTokens: 500,
      orden: ORDEN_GRATUITOS_PRIMERO, tarea: "presentacion-producto",
      validar: (t: string) => { const x = leerPresentacion(t); return x !== null && !prometeDeMas(x, p); },
    });
    const textos = r.text ? leerPresentacion(r.text) : null;
    if (!textos || prometeDeMas(textos, p)) return null;
    const guardada: Guardada = { ...textos, firma, autor: r.proveedor ? `${r.proveedor}/${r.modelo}` : undefined, generadaEn: new Date().toISOString() };
    await db.update(products).set({ metadata: JSON.stringify({ ...(meta || {}), presentacion: guardada }) } as any).where(eq(products.id, p.id));
    logger.info({ productId: p.id, autor: guardada.autor }, "[Presentacion] redactada con las indicaciones del dueño");
    return textos;
  } catch (e: any) {
    logger.warn({ err: e?.message, productId: p?.id }, "[Presentacion] no se pudo redactar; sale la ficha de siempre");
    return null;
  }
}

/**
 * ¿La presentación promete algo que el producto no respalda? Mismo criterio
 * que los anuncios (anuncio-inteligente: PROMESAS y RESULTADOS), no una lista
 * propia: si divergen, la ficha dice lo que el anuncio tiene prohibido.
 */
export function prometeDeMas(t: TextosDePresentacion, p: any): boolean {
  const { afirmacionesSinRespaldo, respaldoDe } = anuncioInteligente;
  return afirmacionesSinRespaldo([t.gancho, ...t.beneficios].join("\n"), respaldoDe(p || {})).length > 0;
}

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return {}; }
}

/**
 * Las 3 burbujas. Espaciadas a propósito: el dueño lo pidió dos veces
 * ("separa más los renglones").
 */
export function burbujasDePresentacion(
  t: TextosDePresentacion,
  hechos: { nombre: string; emoji: string; precio: string; envio?: string | null; pago?: string | null; tallas?: string[] | null; conCierre: boolean },
): string[] {
  const b1 = `${hechos.emoji} *${hechos.nombre}*\n\n${t.gancho}`;
  const b2 = `*Así te ayuda:*\n\n${t.beneficios.map((b) => `✅ ${b}`).join("\n\n")}`;
  const lineas = [
    hechos.envio ? `🚚 ${hechos.envio}` : "",
    hechos.pago ? `💵 ${hechos.pago}` : "",
    `💰 *${hechos.precio}*`,
    hechos.tallas?.length ? `📏 Tallas: ${hechos.tallas.join(", ")}` : "",
  ].filter(Boolean);
  const cierre = hechos.conCierre ? (hechos.tallas?.length ? "¿Te lo enviamos? Dime tu talla 📦" : "¿Te lo enviamos? 📦") : "";
  const b3 = [lineas.join("\n"), cierre].filter(Boolean).join("\n\n");
  return [b1, b2, b3];
}
