/**
 * ============================================================
 * AGENTE DE LANDINGS: redacta el HTML con los proveedores del negocio
 * ============================================================
 *
 * Pedido del dueño (19-09-2026): "necesitamos un agente especializado en
 * crear landing pages; si no necesitamos OpenCode lo reemplazamos, pero que
 * entienda y tenga memoria de lo que se le pide".
 *
 * Hasta hoy la landing se generaba por el puente de OpenCode (sesión +
 * modelos gratuitos de Zen). Medido en septiembre: el puente se cuelga 45 s
 * con Groq, los 7 modelos gratuitos de Zen están muertos, y la edición de la
 * landing 4 devolvió la página con portada, formulario y fotos duplicados.
 *
 * Este módulo hace tres cosas distintas de aquello:
 *
 *   1. Llama DIRECTO a los proveedores, en cadena y validando cada respuesta
 *      (ver PROVEEDORES): DeepSeek del negocio, los gratuitos de OpenCode que
 *      estén vivos, Groq, OpenRouter y el Ollama del EasyPanel. Sin sesiones
 *      ni puente. El puente viejo de OpenCode queda solo si no hay ninguno.
 *   2. Tiene reglas PROPIAS de landing (una foto por sección, UN solo
 *      formulario al final, nada inventado, devolver el documento entero) en
 *      vez del prompt genérico, y en edición recibe la BITÁCORA de lo que ya
 *      se le pidió a esa landing, para no deshacer lo anterior.
 *   3. Sanea lo que devuelve (ver sanear-html.ts) y lo dice: cuántas cosas
 *      repetidas quitó.
 */
import { db, landingPages } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";
import { sanearHtmlDeLanding } from "./sanear-html";

/**
 * Cadena de redacción. Pedido del dueño (19-09): "también los modelos free
 * de OpenCode, que son buenos pero toca saber llamarlos, los que en este
 * momento funcionan; lo mismo con Ollama desde EasyPanel".
 *
 * "Saber llamarlos" acá significa: no confiar en que responden. Un modelo
 * muerto de Zen devuelve 200 con el error adentro (medido 03-09), así que
 * cada respuesta se valida (tiene que traer <html) y si no, se pasa al
 * siguiente. Los verificados del registro van antes que los "sin probar".
 *
 *   ollama     → Pro/local primero (2026-10-02, orden del dueño); sin clave se saltea solo
 *   deepseek   → la clave paga del negocio (o la global), de respaldo
 *   opencode   → gratuitos de Zen, directo (sin puente ni sesión)
 *   groq / openrouter → gratuitos rápidos
 *   ollama_local → el Ollama del EasyPanel (OLLAMA_LOCAL_URL)
 *   ollama_cloud → ollama.com (OLLAMA_CLOUD_API_KEY)
 */
const PROVEEDORES = ["ollama_local", "ollama_cloud", "deepseek", "opencode", "groq", "openrouter"] as const;
/**
 * Orden "gratuitos primero" para trabajos que no ameritan gastar DeepSeek
 * (curar fichas de producto, clasificar, resumir). DeepSeek queda al final
 * como red. Pedido del dueño (19-09): "iniciado por el de GitHub Copilot /
 * OpenCode y los demás free, para no gastar el de DeepSeek que es el del
 * sistema".
 */
export const ORDEN_GRATUITOS_PRIMERO = ["ollama_local", "ollama_cloud", "opencode", "github_copilot_internal", "groq", "openrouter", "cerebras", "deepseek"] as const;
/** Cuántos modelos distintos se prueban por proveedor gratuito antes de pasar al siguiente. */
const MODELOS_POR_PROVEEDOR = 2;

interface Candidato { proveedor: string; modelo: string; config: any; timeoutMs: number }

/** Los modelos a probar para un proveedor, verificados primero. */
async function modelosDelProveedor(proveedor: string, config: any): Promise<string[]> {
  const propio = modeloParaRedactar(proveedor, config);
  if (proveedor === "deepseek" || proveedor === "ollama_local") return propio ? [propio] : [];
  try {
    const { MODELOS_LIBRES } = await import("@workspace/integrations-openai-ai-server");
    const orden: Record<string, number> = { verificado: 0, "sin probar": 1, agotado: 2, vacio: 9 };
    const libres = (MODELOS_LIBRES as any[])
      .filter((m) => m.proveedor === proveedor && m.estado !== "vacio" && m.estado !== "agotado")
      // Para escribir HTML sirven los de código y los generales; los de visión no.
      .filter((m) => m.especialidad !== "vision")
      .sort((a, b) => orden[a.estado] - orden[b.estado])
      .map((m) => String(m.modelo));
    const lista = [...new Set([...(propio ? [propio] : []), ...libres])];
    return lista.slice(0, MODELOS_POR_PROVEEDOR);
  } catch {
    return propio ? [propio] : [];
  }
}

async function candidatos(tenantId: number, orden: readonly string[] = PROVEEDORES): Promise<Candidato[]> {
  const { getProviderConfig } = await import("@workspace/integrations-openai-ai-server");
  const { clavesDelTenant, configDelTenant } = await import("../ai-keys-tenant");
  const claves = await clavesDelTenant(tenantId).catch(() => null);
  const out: Candidato[] = [];
  for (const proveedor of orden) {
    let config: any = null;
    try { config = (await configDelTenant(tenantId, proveedor, claves || undefined))?.config || null; } catch { /* sigue */ }
    if (!config?.apiKey) { try { config = getProviderConfig(proveedor as any); } catch { config = null; } }
    if (!config?.apiKey && proveedor !== "ollama_local") continue;
    if (!config) continue;
    for (const modelo of await modelosDelProveedor(proveedor, config)) {
      out.push({ proveedor, modelo, config, timeoutMs: proveedor === "deepseek" ? 150_000 : 90_000 });
    }
  }
  return out;
}

export interface EntradaRedaccion {
  tenantId: number;
  system: string;
  user: string;
  timeoutMs?: number;
  maxTokens?: number;
  /** Orden de proveedores; por defecto el de landings (DeepSeek al frente). */
  orden?: readonly string[];
  /** Qué cuenta como respuesta válida; por defecto "trae <html". */
  validar?: (text: string) => boolean;
  /** Etiqueta para el log. */
  tarea?: string;
}

export interface SalidaRedaccion {
  text: string;
  proveedor?: string;
  modelo?: string;
  error?: string;
}

/** Modelo del proveedor apto para escribir HTML largo (sin razonadores lentos). */
function modeloParaRedactar(proveedor: string, config: any): string | null {
  const m = String(config?.model || config?.defaultModel || "").trim();
  if (m && !/reasoner|thinking|-r1\b|reasoning|-pro\b/i.test(m)) return m;
  if (proveedor === "deepseek") return "deepseek-chat";
  if (proveedor === "groq") return process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  return m || null;
}

/**
 * ¿Hay algún proveedor con clave para este negocio? Si no, quien llama puede
 * caer al puente de OpenCode.
 */
export async function hayProveedorPropio(tenantId: number): Promise<boolean> {
  try { return (await candidatos(tenantId)).length > 0; } catch { return false; }
}

/** Una llamada de redacción larga, probando los proveedores en orden. */
export async function redactarConProveedores(e: EntradaRedaccion): Promise<SalidaRedaccion> {
  const { createAIClient } = await import("@workspace/integrations-openai-ai-server");
  const errores: string[] = [];

  // Tope total: el doble del tiempo pedido. Sin esto, seis candidatos a 90 s
  // cada uno son nueve minutos para un request que espera uno.
  const limite = Date.now() + (e.timeoutMs ?? 150_000) * 2;
  const validar = e.validar || ((t: string) => /<html[\s>]|<!doctype\s+html/i.test(t));
  const tarea = e.tarea || "landing";
  for (const c of await candidatos(e.tenantId, e.orden || PROVEEDORES)) {
    const { proveedor, modelo, config } = c;
    if (Date.now() > limite) { errores.push("se agotó el tiempo total de la cadena"); break; }
    try {
      const client = createAIClient(config);
      const t0 = Date.now();
      const completion = await client.chat.completions.create(
        {
          model: modelo,
          messages: [{ role: "system", content: e.system }, { role: "user", content: e.user }],
          temperature: 0.4,
          max_tokens: e.maxTokens ?? 12000,
          ...(proveedor === "deepseek" ? { thinking: { type: "disabled" } } : {}),
        } as any,
        { timeout: Math.min(e.timeoutMs ?? c.timeoutMs, c.timeoutMs), maxRetries: 0 },
      );
      const text = completion.choices?.[0]?.message?.content?.trim() || "";
      const fin = String(completion.choices?.[0]?.finish_reason || "");
      logger.info({ proveedor, modelo, ms: Date.now() - t0, chars: text.length, fin }, "[Landing] respuesta del modelo");
      // La validación ES la forma de "saber llamarlos": vacío, o sin HTML,
      // o un error disfrazado de respuesta → siguiente candidato.
      if (!text) { errores.push(`${proveedor}/${modelo}: vacío (finish:${fin})`); continue; }
      if (!validar(text)) {
        errores.push(`${proveedor}/${modelo}: respuesta no válida (${text.slice(0, 80).replace(/\s+/g, " ")}…)`);
        continue;
      }
      if (fin === "length") logger.warn({ proveedor, modelo, tarea }, "[IA] la respuesta pudo quedar cortada (finish:length)");
      console.log(`🧠 [IA:${tarea}] respondió ${proveedor}/${modelo} en ${Date.now() - t0}ms`);
      return { text, proveedor, modelo };
    } catch (err: any) {
      errores.push(`${proveedor}/${modelo}: ${String(err?.message || err).slice(0, 160)}`);
      logger.warn({ proveedor, modelo, err: err?.message }, "[Landing] candidato falló, se prueba el siguiente");
    }
  }
  return { text: "", error: errores.length ? errores.join(" · ") : "Ningún proveedor de IA disponible para este negocio" };
}

// ─── Reglas propias del agente de landings ──────────────────────────────────

export const REGLAS_DEL_AGENTE_DE_LANDINGS = `
REGLAS DEL AGENTE DE LANDINGS (mandan sobre cualquier otra instrucción de formato):
1. Devolvé UN solo documento HTML completo (<!doctype html> … </html>), sin explicaciones ni bloques de código. Nada antes ni después.
2. UNA sola portada (hero), UN solo bloque de precio y UN solo formulario de pedido, al final de la página. Si te piden agregar el formulario y ya existe, NO agregues otro: dejá el que hay.
3. Cada foto del producto se usa UNA vez en toda la página. Sin fotos suficientes, la sección va sin foto: repetirla se ve mal.
4. En EDICIÓN: aplicá solo lo pedido y devolvé la página entera con ese cambio. NUNCA dejes la versión vieja y la nueva juntas. Si dudás entre reemplazar y sumar, reemplazá.
5. No inventes datos del producto ni del negocio (garantías, plazos, cantidades, testimonios con nombre, cifras). Solo lo que viene en los datos.
6. Conservá tal cual las URLs (imágenes, enlaces de pago, action del formulario) y los nombres de los campos del formulario.
7. Respetá la BITÁCORA: lo que el admin ya pidió en esta landing sigue vigente aunque este pedido no lo mencione.
8. Los nombres de las secciones del brief (HERO, PROBLEMA, SOLUCIÓN, BENEFICIOS, OFERTA, AIDA: Atención/Interés/Deseo/Acción) son INTERNOS: nunca aparecen como texto visible. Si una sección lleva un rótulo chico sobre el título, es una frase del producto ("¿Te suena familiar?", "Así se usa", "Lo que dicen"), no el nombre de la técnica.
9. DISEÑO MÓVIL PRIMERO (casi todo el tráfico viene del anuncio en el celular). Diseñá a 375px y después ampliá:
   - Portada: en móvil la FOTO del producto va PRIMERO, grande (proporción 4:5, esquinas de 24-32px, sombra suave), y debajo la etiqueta chica, el titular con 1-3 palabras resaltadas en degradado del color de marca, 3 viñetas con check y el botón a ancho completo. En escritorio, dos columnas (texto | foto).
   - Fondos que se ALTERNAN para separar sin líneas: tono muy claro del color de marca → blanco → franja gris clarísima de confianza → blanco → sección OSCURA (pizarra/casi negro, texto blanco) para "cómo se usa" con pasos numerados en círculos → degradado claro para la oferta y el formulario.
   - Franja de confianza en 2 columnas en móvil (4 en escritorio): pago al recibir, envío, compra segura (y garantía SOLO si el negocio la tiene).
   - Tarjetas con esquinas de 24px, borde muy suave y sombra difusa; botones en píldora con degradado del color de marca y sombra de color.
   - Oferta + formulario en una tarjeta blanca elevada; total a pagar visible justo encima del botón.
   - Barra fija abajo SOLO en móvil con el botón de pedir.
   - COLORES modernos, NEUTROS y para ambos sexos (salvo que el producto sea claramente de un público): base hueso/piedra (#FAFAF9, #F5F5F4), texto casi negro (#1C1917), sección oscura en pizarra o carbón (#0F172A / #1C1917), y UN acento sobrio tomado del producto o de la paleta del brief: verde salvia/teal (#0F766E), azul petróleo (#155E75), terracota (#C2410C) u oliva (#4D7C0F). Nada de rosa, violeta o azul bebé por defecto, ni neón. Máximo 3 colores más los neutros.
   - Nunca inventes calificaciones, cantidad de reseñas, descuentos, "quedan N unidades" ni testimonios: si no vienen en los datos, esa pieza no va.
`.trim();

export interface EntradaDeBitacora {
  fecha: string;
  instruccion: string;
  resultado: string;
}

/** Lo que ya se le pidió a ESTA landing, guardado en strategy.bitacora. */
export function bitacoraDe(landing: any): EntradaDeBitacora[] {
  const b = (landing?.strategy as any)?.bitacora;
  return Array.isArray(b) ? b.filter((x) => x && x.instruccion) : [];
}

export function textoDeBitacora(entradas: EntradaDeBitacora[]): string {
  if (!entradas.length) return "";
  const l = entradas.slice(-12).map((e, i) => `${i + 1}. [${e.fecha.slice(0, 10)}] ${e.instruccion}${e.resultado ? ` → ${e.resultado}` : ""}`);
  return `\n\nBITÁCORA DE ESTA LANDING (pedidos anteriores del admin, siguen vigentes):\n${l.join("\n")}`;
}

/** Anota un pedido en la bitácora de la landing (máximo 30, los más nuevos). */
export async function anotarEnBitacora(landingId: number, instruccion: string, resultado: string): Promise<void> {
  try {
    const [row] = await db.select().from(landingPages).where(eq(landingPages.id, landingId)).limit(1);
    if (!row) return;
    const previa = bitacoraDe(row);
    const bitacora = [...previa, { fecha: new Date().toISOString(), instruccion: instruccion.slice(0, 300), resultado: resultado.slice(0, 200) }].slice(-30);
    await db.update(landingPages).set({ strategy: { ...((row.strategy as any) || {}), bitacora } } as any).where(eq(landingPages.id, landingId));
  } catch (e: any) {
    logger.warn({ landingId, err: e?.message }, "[Landing] no se pudo anotar en la bitácora");
  }
}

/** Limpia la salida del modelo y la sanea. */
export function htmlDesdeRespuesta(text: string): { html: string; quitado: string[] } {
  let html = String(text || "").trim();
  const bloque = html.match(/```(?:html)?\s*\n?([\s\S]*?)\n?```/);
  if (bloque) html = bloque[1].trim();
  const desde = html.search(/<!doctype\s+html|<html[\s>]/i);
  if (desde > 0) html = html.slice(desde);
  const r = sanearHtmlDeLanding(html);
  return { html: r.html, quitado: r.quitado };
}
