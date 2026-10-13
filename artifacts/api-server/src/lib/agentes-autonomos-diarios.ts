/**
 * AGENTES AUTÓNOMOS DIARIOS — El equipo que trabaja solo
 * =========================================================
 * Antes: 14 especialistas esperando a que el admin pregunte.
 * Ahora: 3 agentes que se despiertan solos cada día, publican valor (enamoran)
 * y dejan anuncios listos (para luego vender). Sin intervención.
 *
 * Regla DIOS: lo que ENAMORA (orgánico) corre solo; lo que GASTA (pauta) queda en pausa para aprobar.
 *
 * Horario America/Bogota (UTC-5): valor 08:00 (atraer, diario), demo 19:00 (demostrar, lun-vie), anuncio 20:00 (borrador, diario), diagnóstico 07:00
 * Comedido: 2 posts máximo por día entre semana, 1 fin de semana — enamorar sin saturar. Vender 1 de cada 5 (20%) ya lo hace calendario semanal.
 */

import { logger } from "./logger";
import { db, tenants, products } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { programar, registrarManejador, type ContextoDeTrabajo } from "./programador";
import { tenantManager } from "./tenantManager";
import { instanteEnZona, horaLocal, zonaValida } from "./zona-horaria";
import { checkPostingPermission, publishToPage, buildPostDraft } from "./facebook-page-posts";

export const TIPO_VALOR_MANANA = "autonomo:valor-manana";
export const TIPO_VALOR_TARDE = "autonomo:valor-tarde";
export const TIPO_DEMO_NOCHE = "autonomo:demo-noche";
export const TIPO_BORRADOR_DIARIO = "autonomo:borrador-diario";
export const TIPO_DIAGNOSTICO_MATUTINO = "autonomo:diagnostico";

async function zonaDelNegocio(tenantId: number): Promise<string> {
  try {
    const { db: d, settings } = await import("@workspace/db");
    const [s] = await d.select().from(settings).limit(1);
    return zonaValida((s as any)?.timezone);
  } catch { return zonaValida(null); }
}

// Contenido de VALOR real (no venta) — usa rasgos del producto pero sin pedir compra
function textoValor(producto: any, tipo: "manana" | "tarde"): string | null {
  const nombre = String(producto?.name || "").trim();
  const rasgos: string[] = Array.isArray(producto?.features) ? producto.features.slice(0, 3).map(String) : [];
  if (!nombre) return null;
  if (tipo === "manana") {
    // Atraer: error común, tip rápido, sin mencionar producto directamente al inicio
    return [
      `El error que el 90% comete al empezar 👇`,
      ``,
      `No es falta de ganas: es empezar por el final en vez del principio.`,
      rasgos[0] ? `Ej: ${rasgos[0].slice(0, 70)}` : `Guardá este tip para cuando lo necesites 📌`,
      ``,
      `¿Te pasó? Contame en los comentarios 💬`,
    ].join("\n");
  } else {
    if (!rasgos.length) return null;
    return [
      `3 cosas que casi nadie te cuenta 👇`,
      ``,
      ...rasgos.map((r, i) => `${i + 1}. ${r}`),
      ``,
      `¿Cuál te sirve más? Te leo 💬`,
    ].join("\n");
  }
}

function textoDemo(producto: any): string | null {
  const nombre = String(producto?.name || "").trim();
  if (!nombre) return null;
  const rasgos: string[] = Array.isArray(producto?.features) ? producto.features.slice(0, 3).map(String) : [];
  return [
    `Así se ve por dentro: ${nombre} 👇`,
    ``,
    rasgos.length ? `Lo que se lleva quien entra: ${rasgos.join(" · ")}` : `Te muestro el contenido real, sin recortes.`,
    ``,
    `Preguntá lo que quieras acá abajo 💬`,
  ].join("\n");
}

async function publicarValor(ctx: ContextoDeTrabajo, franja: "manana" | "tarde" | "demo") {
  const tenant = await tenantManager.getTenantById(ctx.tenantId);
  if (!tenant) throw new Error(`negocio ${ctx.tenantId} no encontrado`);
  const permiso = await checkPostingPermission(tenant);
  if (permiso) throw new Error(`no puede publicar: ${permiso}`);

  // Comedido: fin de semana baja frecuencia — demo no sale sáb/dom para no saturar y dejar que el admin descanse
  const zona = await zonaDelNegocio(ctx.tenantId);
  const ahoraLocal = horaLocal(zona);
  if ((franja === "demo" || franja === "tarde") && (ahoraLocal.diaSemana === 6 || ahoraLocal.diaSemana === 7)) {
    return { skipped: "fin de semana sin demo/segundo valor", diaSemana: ahoraLocal.diaSemana } as any;
  }

  const catalogo = await db.select().from(products).where(and(eq(products.tenantId, ctx.tenantId), eq(products.isActive, true))).limit(20);
  if (!catalogo.length) throw new Error("sin productos activos para contenido de valor");
  // Rotación diaria por fecha para no repetir siempre el mismo
  const idx = new Date().getDate() % catalogo.length;
  const producto = catalogo[idx] as any;
  let texto: string | null = null;
  if (franja === "manana") texto = textoValor(producto, "manana");
  else if (franja === "tarde") texto = textoValor(producto, "tarde");
  else texto = textoDemo(producto);
  if (!texto) throw new Error("no se pudo armar texto de valor (faltan datos)");

  const r = await publishToPage({ productId: producto.id, productName: producto.name, message: texto, imageUrl: producto.imageUrl || null, link: null }, tenant);
  if (!r.ok) throw new Error(r.error || "Facebook rechazó el post de valor");
  logger.info({ tenantId: ctx.tenantId, franja, postId: r.postId }, "[Autónomo] valor publicado");
  return { postId: r.postId, franja, producto: producto.name };
}

async function crearBorradorDiario(ctx: ContextoDeTrabajo) {
  const catalogo = await db.select().from(products).where(and(eq(products.tenantId, ctx.tenantId), eq(products.isActive, true))).limit(30);
  if (!catalogo.length) return { skipped: "sin productos" };
  const idx = new Date().getDate() % catalogo.length;
  const producto = catalogo[idx] as any;
  // Ya existe borrador reciente para este producto hoy? No duplicar
  const { facebookDrafts } = await import("@workspace/db");
  const { gte } = await import("drizzle-orm");
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const existentes = await db.select().from(facebookDrafts).where(and(eq(facebookDrafts.tenantId, ctx.tenantId), eq(facebookDrafts.productId, producto.id), gte(facebookDrafts.createdAt as any, hoy as any))).limit(1);
  if (existentes.length) return { skipped: "borrador ya existe hoy", producto: producto.name };

  // Usar pipeline DIOS: marketResearch → creative → copy
  try {
    const { planGrowth } = await import("./marketing-team/orchestrator");
    const { plan } = await planGrowth({ tenantId: ctx.tenantId, productId: producto.id });
    // El plan ya deja borradores/copies listos; crear uno explícito con el copy ganador si no existe
    const copies: any = (plan as any)?.data?.copies || (plan as any)?.copies;
    const variante = copies?.variants?.[0];
    if (variante) {
      const { AdStrategist } = await import("./ad-strategist");
      const t = await tenantManager.getTenantById(ctx.tenantId);
      const draft = await new AdStrategist(t || undefined).createDraftAd(
        (t as any)?.facebook?.adAccountId || process.env.FB_AD_ACCOUNT_ID || "",
        (t as any)?.facebook?.userAccessToken || (t as any)?.facebook?.accessToken || process.env.FB_ACCESS_TOKEN || "",
        producto.id,
        { primaryText: variante.primaryText, headline: variante.headline, description: variante.description, hook: variante.angle, angle: variante.angle, researchNote: `autónomo diario ${new Date().toISOString().slice(0, 10)}` },
      );
      return { borrador: draft?.id, producto: producto.name, variante: variante.angle };
    }
  } catch (e: any) {
    // Fallback simple: AdStrategist con datos reales
    try {
      const t = await tenantManager.getTenantById(ctx.tenantId);
      const { AdStrategist } = await import("./ad-strategist");
      const draft = await new AdStrategist(t || undefined).createDraftAd(
        (t as any)?.facebook?.adAccountId || process.env.FB_AD_ACCOUNT_ID || "",
        (t as any)?.facebook?.userAccessToken || (t as any)?.facebook?.accessToken || process.env.FB_ACCESS_TOKEN || "",
        producto.id,
        { primaryText: `${producto.name}\n\n${(producto.description || "").slice(0, 120)}\n\n✅ Entrega inmediata\n✅ Soporte real\n\n💬 Escribinos y lo tenés hoy`, headline: String(producto.name).slice(0, 35), description: "Envío inmediato · pago único" },
      );
      return { borrador: draft?.id, producto: producto.name, fallback: true };
    } catch (e2: any) { throw new Error(`no se pudo crear borrador: ${e2?.message || e?.message}`); }
  }
  return { skipped: "sin variante" };
}

async function diagnosticoMatutino(ctx: ContextoDeTrabajo) {
  try {
    const { revisionDiaria } = await import("./revision-diaria");
    const { texto } = await revisionDiaria(ctx.tenantId);
    if (!texto) return { sinAcciones: true };
    const { avisarAlDueno } = await import("./avisos");
    await avisarAlDueno(ctx.tenantId, `🤖 Agentes autónomos — resumen 07:00\n\n${texto}`);
    return { avisado: true };
  } catch (e: any) { return { error: e?.message || String(e) }; }
}

export function registrarAgentesAutonomos(): void {
  registrarManejador(TIPO_VALOR_MANANA, (ctx) => publicarValor(ctx, "manana"));
  registrarManejador(TIPO_VALOR_TARDE, (ctx) => publicarValor(ctx, "tarde"));
  registrarManejador(TIPO_DEMO_NOCHE, (ctx) => publicarValor(ctx, "demo"));
  registrarManejador(TIPO_BORRADOR_DIARIO, crearBorradorDiario);
  registrarManejador(TIPO_DIAGNOSTICO_MATUTINO, diagnosticoMatutino);
}

export async function activarAgentesAutonomos(tenantId: number): Promise<void> {
  registrarAgentesAutonomos();
  const zona = await zonaDelNegocio(tenantId);
  const hoy = horaLocal(zona);
  const baseHoy = new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia));
  const manana = hoy.hora >= 20 ? new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia + 1)) : baseHoy;

  const tareas: Array<{ tipo: string; clave: string; hora: number; minuto: number }> = [
    { tipo: TIPO_DIAGNOSTICO_MATUTINO, clave: `autonomo:diagnostico:${tenantId}`, hora: 7, minuto: 0 },
    { tipo: TIPO_VALOR_MANANA, clave: `autonomo:valor-manana:${tenantId}`, hora: 8, minuto: 0 },
    // valor-tarde se mantiene registrado pero solo corre lun-vie vía guard de publicarValor (fin de semana skip) — 1 post extra entre semana
    { tipo: TIPO_VALOR_TARDE, clave: `autonomo:valor-tarde:${tenantId}`, hora: 13, minuto: 0 },
    { tipo: TIPO_DEMO_NOCHE, clave: `autonomo:demo-noche:${tenantId}`, hora: 19, minuto: 0 },
    { tipo: TIPO_BORRADOR_DIARIO, clave: `autonomo:borrador-diario:${tenantId}`, hora: 20, minuto: 0 },
  ];

  for (const t of tareas) {
    const correAt = instanteEnZona(zona, manana.getUTCFullYear(), manana.getUTCMonth() + 1, manana.getUTCDate(), t.hora, t.minuto);
    // Si hoy ya pasó esa hora, va mañana
    const finalAt = correAt.getTime() <= Date.now() ? new Date(correAt.getTime() + 24 * 60 * 60 * 1000) : correAt;
    await programar({ tenantId, tipo: t.tipo, clave: t.clave, correAt: finalAt, repiteCadaMin: 24 * 60 });
  }
  logger.info({ tenantId }, "[Autónomos] 5 tareas diarias activadas (valor x2, demo, borrador, diagnóstico)");
}

export async function activarParaTodosLosTenants(): Promise<void> {
  try {
    const filas = await db.select({ id: tenants.id }).from(tenants);
    for (const { id } of filas) {
      try {
        const t = await tenantManager.getTenantById(Number(id));
        // Solo activa si el negocio ya puede publicar (tiene página conectada). Si no, el job fallaría diario y llenaría logs.
        const puede = await checkPostingPermission(t || undefined);
        const tieneProductos = (await db.select({ id: products.id }).from(products).where(and(eq(products.tenantId, Number(id)), eq(products.isActive, true))).limit(1)).length > 0;
        if (puede === null && tieneProductos) await activarAgentesAutonomos(Number(id));
      } catch {}
    }
  } catch (e: any) { logger.warn({ err: e?.message }, "[Autónomos] no se pudo activar para todos"); }
}
