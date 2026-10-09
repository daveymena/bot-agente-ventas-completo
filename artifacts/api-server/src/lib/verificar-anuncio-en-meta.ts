/**
 * Después de tocar un anuncio, comparar lo que Meta GUARDÓ con lo que se pidió.
 *
 * 08-10-2026: Atlas respondía "✅ Plan ejecutado y verificado" sobre anuncios,
 * pero verifyMutation no tenía ningún caso de anuncios: el "verificado" salía
 * de lo que se MANDÓ, no de lo que quedó. Así pasó el carrusel que salió como
 * una sola imagen, 18-65, a todo el país, sin que nadie lo notara hasta que el
 * dueño miró los resultados.
 *
 * Esta función es pura (se prueba sin Meta): recibe lo pedido y lo leído del
 * conjunto y devuelve una línea honesta para el admin.
 */

export interface LoPedido {
  ageMin?: number;
  ageMax?: number;
  ciudades?: string[];
  genders?: number[];
  formato?: string;
  /** "ventas" | "trafico" | "mensajes"… — qué tiene que optimizar el conjunto. */
  objetivo?: string;
}

export interface LoLeidoDeMeta {
  targeting?: any;
  optimization_goal?: string;
  status?: string;
  effective_status?: string;
  /** Los anuncios del conjunto, con su creative. */
  ads?: any[];
}

function fotosDelCreative(ad: any): number {
  const spec = ad?.creative?.object_story_spec;
  const hijos = spec?.link_data?.child_attachments;
  if (Array.isArray(hijos) && hijos.length) return hijos.length;
  const feed = ad?.creative?.asset_feed_spec?.images;
  if (Array.isArray(feed) && feed.length) return feed.length;
  return spec?.link_data?.picture || spec?.link_data?.image_hash || spec?.photo_data ? 1 : 0;
}

export function compararConLoPedido(pedido: LoPedido, leido: LoLeidoDeMeta): { ok: boolean; linea: string } {
  const t = leido.targeting || {};
  const quedo: string[] = [];
  const distinto: string[] = [];

  const min = Number(t.age_min) || 18;
  const max = Number(t.age_max) || 65;
  quedo.push(`${min}–${max} años`);
  if (pedido.ageMin && pedido.ageMin !== min) distinto.push(`edad mínima ${min} (pediste ${pedido.ageMin})`);
  if (pedido.ageMax && pedido.ageMax !== max) distinto.push(`edad máxima ${max} (pediste ${pedido.ageMax})`);

  const ciudades: any[] = Array.isArray(t.geo_locations?.cities) ? t.geo_locations.cities : [];
  const paises: string[] = Array.isArray(t.geo_locations?.countries) ? t.geo_locations.countries : [];
  quedo.push(ciudades.length ? `${ciudades.length} ciudad(es)` : paises.length ? `todo ${paises.join(", ")}` : "sin ubicación");
  if (pedido.ciudades?.length) {
    if (!ciudades.length) distinto.push(`sale a todo el país, no a las ${pedido.ciudades.length} ciudades pedidas`);
    else if (ciudades.length < pedido.ciudades.length) distinto.push(`solo ${ciudades.length} de las ${pedido.ciudades.length} ciudades pedidas`);
    if (ciudades.length && paises.length) distinto.push("además del país entero (se suma y sale a todo el país)");
  }

  if (pedido.genders?.length === 1) {
    const g = Array.isArray(t.genders) ? t.genders : [];
    if (g.length !== 1 || g[0] !== pedido.genders[0]) distinto.push(`género sin aplicar (pediste ${pedido.genders[0] === 2 ? "mujeres" : "hombres"})`);
  }

  const ads = Array.isArray(leido.ads) ? leido.ads : [];
  if (ads.length) {
    const fotos = Math.max(...ads.map(fotosDelCreative));
    quedo.push(fotos > 1 ? `carrusel de ${fotos} fotos` : "una sola imagen");
    if (pedido.formato === "carrusel" && fotos < 2) distinto.push("salió como UNA imagen, no como carrusel");
  } else if (pedido.formato) {
    distinto.push("no se pudo leer el anuncio para confirmar el formato");
  }

  // 08-10: se pidió VENTAS y el conjunto optimizaba CLICS (sin píxel):
  // 123 clics a $46, cero pedidos, y nadie lo marcó.
  const opt = String(leido.optimization_goal || "");
  if (opt) {
    quedo.push(opt === "OFFSITE_CONVERSIONS" ? "busca compras" : opt === "LINK_CLICKS" ? "busca CLICS" : opt === "CONVERSATIONS" ? "busca conversaciones" : opt === "LANDING_PAGE_VIEWS" ? "busca visitas a la página" : opt.toLowerCase());
    if (pedido.objetivo === "ventas" && opt !== "OFFSITE_CONVERSIONS" && opt !== "VALUE") distinto.push(`pediste VENTAS y el conjunto busca ${opt === "LINK_CLICKS" ? "CLICS" : opt}`);
  }

  const estado = String(leido.effective_status || leido.status || "");
  if (estado) quedo.push(estado === "ACTIVE" ? "ACTIVO (gastando)" : estado === "PAUSED" || estado === "CAMPAIGN_PAUSED" ? "en pausa" : estado.toLowerCase());

  if (distinto.length) {
    return { ok: false, linea: `⚠️ Leído en Meta, NO quedó como se pidió: ${distinto.join("; ")}. Quedó: ${quedo.join(" · ")}.` };
  }
  return { ok: true, linea: `🔎 Leído en Meta: ${quedo.join(" · ")}.` };
}
