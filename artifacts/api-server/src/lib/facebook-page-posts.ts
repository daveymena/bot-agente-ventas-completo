/**
 * Publicaciones ORGÁNICAS en la página de Facebook (sin pauta, sin costo).
 *
 * Distinto del AdStrategist: aquí no hay cuenta publicitaria, presupuesto ni
 * segmentación — es una publicación normal en el muro de la página.
 *
 * Requiere el permiso `pages_manage_posts` en el token de la página. Sin él,
 * Meta responde 200 en la validación del token pero rechaza el POST al feed,
 * así que se comprueba antes para dar un error claro en vez de un fallo opaco.
 */

import { logger } from "./logger";
import { db, products } from "@workspace/db";
import { eq } from "drizzle-orm";
import { tenantManager, type TenantContext } from "./tenantManager";

const FB_GRAPH = "https://graph.facebook.com/v21.0";

export interface PagePostDraft {
  productId: number;
  productName: string;
  message: string;
  imageUrl: string | null;
  /** URL a la que dirigir al cliente (ficha de la tienda) */
  link: string | null;
}

export interface PublishResult {
  ok: boolean;
  postId?: string;
  permalink?: string;
  error?: string;
}

/**
 * Credenciales de la página SIEMPRE por tenant primero.
 *
 * Esto es un SaaS: cada administrador conecta SU página. Si se leyera solo del
 * .env, todas las cuentas publicarían en la misma página — la del dueño del
 * servidor. El .env queda como respaldo para la instalación propia.
 * Mismo orden que usan facebook.ts y facebook-messenger.ts.
 */
function pageCreds(tenant?: TenantContext): { token: string; pageId: string } {
  const t = tenant || tenantManager.getDefaultTenant();
  const fb = t?.facebook || {};
  return {
    token:
      fb.accessToken ||
      fb.messengerPageToken ||
      process.env.FB_ACCESS_TOKEN ||
      process.env.FB_MESSENGER_PAGE_TOKEN ||
      "",
    pageId: fb.pageId || process.env.FB_PAGE_ID || "",
  };
}

/**
 * Convierte una ruta relativa del catálogo en URL pública absoluta.
 * Facebook descarga la imagen desde sus servidores: una ruta como
 * /images/products/41.jpg o un localhost no le sirven.
 */
function absoluteUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  const appUrl = process.env.APP_URL || "";
  if (!/^https:\/\//i.test(appUrl)) return null;

  return `${appUrl.replace(/\/+$/, "")}/${pathOrUrl.replace(/^\/+/, "")}`;
}

/**
 * Comprueba que el token tenga permiso para publicar en el feed de la página.
 * Devuelve el motivo si falta algo, o null si está todo bien.
 */
export async function checkPostingPermission(tenant?: TenantContext): Promise<string | null> {
  const { token, pageId } = pageCreds(tenant);
  if (!token) return "Esta cuenta no tiene conectada una página de Facebook (falta el token)";
  if (!pageId) return "Esta cuenta no tiene conectada una página de Facebook (falta el ID de página)";

  // Un token DE PÁGINA devuelve /me/permissions vacío — ese endpoint solo
  // sirve para tokens de usuario. Lo que manda son los `tasks` que Facebook
  // asignó sobre la página: CREATE_CONTENT es el que permite publicar. Se
  // guardan al conectar la cuenta (POST /public/fb-connect).
  const t = tenant || tenantManager.getDefaultTenant();
  const tasks: string[] = (t?.facebook as any)?.tasks || [];

  if (tasks.length > 0) {
    if (!tasks.includes("CREATE_CONTENT")) {
      return (
        "El token de esta página no tiene la tarea CREATE_CONTENT, que es la que " +
        "permite publicar. Hay que reconectar la página con el permiso " +
        "'pages_manage_posts' desde el panel."
      );
    }
    return null;
  }

  // Sin tasks guardados (config vieja por .env): se valida al menos que el
  // token sirva y corresponda a la página configurada.
  try {
    const res = await fetch(`${FB_GRAPH}/me?fields=id,name&access_token=${token}`, {
      signal: AbortSignal.timeout(10000),
    });
    const data: any = await res.json();
    if (data.error) return `Facebook rechazó el token: ${data.error.message}`;
    if (data.id && data.id !== pageId) {
      return `El token pertenece a "${data.name}" (${data.id}) pero la página configurada es ${pageId}. Reconecta la página desde el panel.`;
    }
    return null;
  } catch (err) {
    return `No se pudo verificar el token: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Arma el texto de una publicación orgánica con técnica de venta AIDA
 * (Atención → Interés → Deseo → Acción). Sin inventar datos.
 */
export async function buildPostDraft(
  productId: number,
  storeSlug: string,
): Promise<PagePostDraft> {
  const [p] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!p) throw new Error("Producto no encontrado");

  const price = Number(p.price || 0);
  const priceStr = "$" + Math.round(price).toLocaleString("es-CO");
  const features = (Array.isArray(p.features) ? p.features : []).slice(0, 5);
  const cat = (p.category || "").toLowerCase();

  const appUrl = process.env.APP_URL || "";
  const link = /^https?:\/\//i.test(appUrl)
    ? `${appUrl.replace(/\/+$/, "")}/p/${p.id}`
    : null;

  const lines: string[] = [];

  // ── ATENCIÓN: Hook que duele o que ilusiona ──
  lines.push(getHook(cat, p.name));
  lines.push("");

  // ── INTERÉS: Qué gana el cliente ──
  if (p.description) {
    const desc = p.description
      .split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || "";
    if (desc) {
      lines.push("✨ " + (desc.length > 180 ? desc.substring(0, 177) + "..." : desc));
      lines.push("");
    }
  }

  // ── DESEO: Beneficios en formato escaneable ──
  for (const f of features) lines.push(`✅ ${f}`);
  if (features.length) lines.push("");

  lines.push(`💰 ${priceStr} — PAGO ÚNICO (no hay cuotas ni suscripciones)`);
  lines.push("♾️ Acceso de por vida — estudia cuando quieras");
  lines.push("📲 Recibes todo por Google Drive al instante");

  // ── ACCIÓN: CTA claro ──
  if (link) {
    lines.push("");
    lines.push("👇 CÓMPRALO AQUÍ 👇");
    lines.push(link);
  }

  return {
    productId: p.id,
    productName: p.name,
    message: lines.join("\n"),
    imageUrl: absoluteUrl(p.imageUrl),
    link,
  };
}

const HOOKS_BY_CATEGORY: Record<string, string[]> = {
  diseño: [
    "¿Tu creatividad merece herramientas profesionales sin pagar mensualidades?",
    "Diseña como un pro sin suscripciones. Paga una vez y usa para siempre.",
  ],
  idiomas: [
    "Hablar 5 idiomas abre puertas que ni imaginas. ¿Listo para empezar?",
    "Aprende francés, alemán, italiano, portugués y japonés con un solo pago.",
  ],
  musica: [
    "Siempre quisiste tocar un instrumento. ¿Qué esperas para empezar?",
    "La música cambia vidas. El curso que necesitas está a un clic.",
  ],
  programacion: [
    "Los programadores ganan +60% que el promedio. Empieza hoy desde cero.",
    "Aprende a programar desde casa y consigue tu primer trabajo remoto.",
  ],
  marketing: [
    "El marketing digital ya no es opcional. Domínalo con contenido descargable.",
    "Haz crecer tu negocio con estrategias que funcionan. Todo en un solo pack.",
  ],
  fitness: [
    "Tu cuerpo de 10 empieza con decisiones de hoy. ¿Empiezas mañana?",
    "Entrena en casa, a tu ritmo, sin excusas. Resultados garantizados.",
  ],
  fotografia: [
    "Tu smartphone puede tomar fotos profesionales. Aprende cómo.",
    "Captura momentos increíbles. Curso de fotografía de cero a pro.",
  ],
  tecnologia: [
    "La tecnología avanza rápido. Mantente al día sin pagar mensualidades.",
    "Domina la tecnología que el mercado pide. Contenido actualizado.",
  ],
  construccion: [
    "Construye tu futuro con habilidades reales. Planos, metrados y más.",
    "Obra gruesa a fin de obra: aprende todo lo que necesitas saber.",
  ],
  educacion: [
    "Nunca dejes de aprender. Cursos completos por un solo pago.",
    "El conocimiento es la mejor inversión. Empieza hoy.",
  ],
};

function getHook(category: string, productName: string): string {
  const lowerName = productName.toLowerCase();

  if (lowerName.includes("piano") || lowerName.includes("guitarra")) {
    return "🎹 ¿Siempre has querido tocar un instrumento? Este curso te lleva de 0 a avanzado.";
  }
  if (lowerName.includes("condorito") || lowerName.includes("comic") || lowerName.includes("lettering")) {
    return "🎨 Transforma tu creatividad en arte digital. Aprende desde casa.";
  }
  if (lowerName.includes("idioma") || lowerName.includes("ingl") || lowerName.includes("franc")) {
    return "🌍 Hablar varios idiomas es la llave del mundo. Empieza hoy con un solo pago.";
  }
  if (lowerName.includes("fitness") || lowerName.includes("pilates") || lowerName.includes("perro")) {
    return "💪 Tu mejor versión te está esperando. Empieza hoy, desde casa.";
  }
  if (lowerName.includes("marketing") || lowerName.includes("seo") || lowerName.includes("ecommerce")) {
    return "📈 El marketing digital mueve el mundo. Aprende lo que nadie te enseña en la universidad.";
  }

  for (const [key, hooks] of Object.entries(HOOKS_BY_CATEGORY)) {
    if (category.includes(key) || lowerName.includes(key)) {
      return hooks[Math.floor(Math.random() * hooks.length)];
    }
  }

  return `📚 Aprende ${productName.toLowerCase()} desde cero. Contenido completo, pago único.`;
}

/**
 * Publica de verdad en el muro de la página.
 * Si el producto tiene imagen se publica como foto con pie de texto (rinde
 * mucho más que un enlace suelto); si no, como publicación de texto + enlace.
 */
export async function publishToPage(
  draft: PagePostDraft,
  tenant?: TenantContext,
): Promise<PublishResult> {
  const permissionError = await checkPostingPermission(tenant);
  if (permissionError) return { ok: false, error: permissionError };

  const { token, pageId: id } = pageCreds(tenant);

  try {
    const isPhoto = Boolean(draft.imageUrl);
    const endpoint = isPhoto ? `${FB_GRAPH}/${id}/photos` : `${FB_GRAPH}/${id}/feed`;

    const body: Record<string, string> = { access_token: token };
    if (isPhoto) {
      body.url = draft.imageUrl!;
      body.caption = draft.message;
    } else {
      body.message = draft.message;
      if (draft.link) body.link = draft.link;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(20000),
    });

    const data: any = await res.json();
    if (!res.ok || data.error) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      logger.error({ err: data?.error, productId: draft.productId }, "[PagePost] Falló la publicación");
      return { ok: false, error: msg };
    }

    // /photos devuelve post_id; /feed devuelve id
    const postId = data.post_id || data.id;
    logger.info({ postId, productId: draft.productId }, "[PagePost] Publicado en la página");

    return {
      ok: true,
      postId,
      permalink: postId ? `https://facebook.com/${postId}` : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, productId: draft.productId }, "[PagePost] Error publicando");
    return { ok: false, error: msg };
  }
}
