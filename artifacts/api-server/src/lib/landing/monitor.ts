/**
 * LO QUE PASA EN LA LANDING
 * =========================
 *
 * Hasta el 26-09-2026 la landing no medía nada: ni visitas, ni pedidos
 * rechazados (solo un logger), ni el píxel de Meta. La campaña de VENTAS del
 * corrector optimizaba por un píxel que la página nunca disparaba, y el
 * formulario estuvo rechazando TODOS los pedidos por la talla sin que nadie se
 * enterara.
 *
 * Dos piezas:
 *  - `registrarEventoLanding`: visita / inicio_pedido / pedido / rechazo, en
 *    `activity_events` (tabla que ya existe; type `landing_<tipo>`, title =
 *    slug, subtitle = detalle). Sin tabla nueva.
 *  - `snippetDeMedicion`: el píxel de Meta (PageView, ViewContent,
 *    InitiateCheckout, Purchase con valor) + un beacon propio para las visitas
 *    y el inicio del pedido. El Purchase sale cuando el POST al pedido
 *    responde ok, así funciona igual en las landings de HTML fijo, que traen
 *    su propio JS de formulario.
 */
import { db, activityEvents } from "@workspace/db";
import { and, eq, gte, like, desc } from "drizzle-orm";
import { logger } from "../logger";

export const TIPOS_DE_EVENTO = ["visita", "inicio_pedido", "pedido", "rechazo"] as const;
export type TipoDeEvento = (typeof TIPOS_DE_EVENTO)[number];

export async function registrarEventoLanding(tenantId: number, slug: string, tipo: TipoDeEvento, detalle?: string | null): Promise<void> {
  try {
    await db.insert(activityEvents).values({
      tenantId,
      type: `landing_${tipo}`,
      title: String(slug).slice(0, 200),
      subtitle: detalle ? String(detalle).slice(0, 300) : null,
    } as any);
  } catch (e: any) {
    logger.warn({ err: e?.message, slug, tipo }, "[LandingMonitor] no se pudo registrar el evento");
  }
}

export interface ResumenDeLanding {
  slug: string;
  ultimas24h: Record<TipoDeEvento, number>;
  ultimos7d: Record<TipoDeEvento, number>;
  conversion7d: string;
  rechazosRecientes: Array<{ cuando: string; motivo: string }>;
}

export async function resumenDeLanding(tenantId: number, slug: string): Promise<ResumenDeLanding> {
  const desde7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const desde24h = Date.now() - 24 * 3600 * 1000;
  const filas = await db
    .select()
    .from(activityEvents)
    .where(and(eq((activityEvents as any).tenantId, tenantId), eq(activityEvents.title, slug), like(activityEvents.type, "landing_%"), gte(activityEvents.createdAt, desde7d)))
    .orderBy(desc(activityEvents.createdAt))
    .limit(5000);
  const vacio = (): Record<TipoDeEvento, number> => ({ visita: 0, inicio_pedido: 0, pedido: 0, rechazo: 0 });
  const d24 = vacio();
  const d7 = vacio();
  const rechazos: Array<{ cuando: string; motivo: string }> = [];
  for (const f of filas as any[]) {
    const tipo = String(f.type).replace(/^landing_/, "") as TipoDeEvento;
    if (!(tipo in d7)) continue;
    d7[tipo]++;
    if (new Date(f.createdAt).getTime() >= desde24h) d24[tipo]++;
    if (tipo === "rechazo" && rechazos.length < 10) rechazos.push({ cuando: new Date(f.createdAt).toISOString(), motivo: f.subtitle || "" });
  }
  return {
    slug,
    ultimas24h: d24,
    ultimos7d: d7,
    conversion7d: d7.visita ? `${((d7.pedido / d7.visita) * 100).toFixed(1)}%` : "sin visitas",
    rechazosRecientes: rechazos,
  };
}

/** Script de medición que se pega antes de `</body>`. */
export function snippetDeMedicion(opts: { slug: string; pixelId?: string | null; producto?: { name?: string | null; price?: unknown; currency?: string | null } | null }): string {
  const slug = JSON.stringify(String(opts.slug));
  const pixel = /^\d{6,20}$/.test(String(opts.pixelId || "")) ? String(opts.pixelId) : "";
  const valor = Number(opts.producto?.price) || 0;
  const moneda = JSON.stringify(String(opts.producto?.currency || "COP"));
  const nombre = JSON.stringify(String(opts.producto?.name || ""));
  const fbBase = pixel
    ? `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');fbq('track','ViewContent',{content_name:${nombre},value:${valor},currency:${moneda}});`
    : "";
  return `<script>(function(){try{${fbBase}
var S=${slug},U='/api/landing-publica/'+encodeURIComponent(S)+'/evento';
function ev(t,d){try{var b=JSON.stringify({tipo:t,detalle:d||''});if(navigator.sendBeacon){navigator.sendBeacon(U,new Blob([b],{type:'application/json'}))}else{fetch(U,{method:'POST',headers:{'Content-Type':'application/json'},body:b,keepalive:true})}}catch(e){}}
ev('visita',document.referrer?('ref:'+document.referrer.split('?')[0]).slice(0,120):'');
var ini=false;document.addEventListener('focusin',function(e){if(ini)return;var f=e.target&&e.target.closest&&e.target.closest('form');if(f&&/pedido/.test(f.getAttribute('action')||'')){ini=true;ev('inicio_pedido');if(window.fbq)fbq('track','InitiateCheckout',{value:${valor},currency:${moneda}})}},true);
var of=window.fetch;if(of){window.fetch=function(u,o){var p=of.apply(this,arguments);try{if(String(u&&u.url||u).indexOf('/pedido')>-1){p.then(function(r){return r.clone().json()}).then(function(j){if(j&&j.ok&&!j.repetido&&window.fbq)fbq('track','Purchase',{value:${valor},currency:${moneda},content_name:${nombre}})}).catch(function(){})}}catch(e){}return p}}
}catch(e){}})();</script>`;
}

/** Pega el snippet antes de `</body>` (o al final si no hay). */
export function conMedicion(html: string, snippet: string): string {
  if (!html) return html;
  const i = html.toLowerCase().lastIndexOf("</body>");
  return i >= 0 ? html.slice(0, i) + snippet + html.slice(i) : html + snippet;
}
