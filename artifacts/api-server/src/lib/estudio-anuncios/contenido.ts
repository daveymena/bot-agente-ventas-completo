/**
 * Qué dice el anuncio: ganchos, beneficios, precio, sellos y llamado a la
 * acción, SOLO con lo que el producto y el negocio respaldan.
 *
 * Reusa las reglas de anuncio-por-modelo.ts (el copy de Meta que ya se
 * calibró contra el catálogo real) y las condiciones del negocio
 * (modelo-de-negocio.ts). La IA es opcional: si hay proveedor configurado,
 * propone ganchos más cortos y vendedores; si no responde a tiempo, salen
 * los deterministas y el anuncio se genera igual.
 */
import { planDeAnuncio, puntosReales, recortarAPalabra, titularDelProducto, type DestinoDelAnuncio } from "../anuncio-por-modelo";
import { modeloDelProducto, sellosDelNegocio, type CondicionesDelNegocio } from "../modelo-de-negocio";
import { limpiarTexto } from "./tipografia";
import { fotosDelProducto } from "../fotos-de-producto";
import type { Contenido } from "./diseno";

export interface ProductoParaEstudio {
  id?: number;
  name?: string | null;
  description?: string | null;
  price?: number | string | null;
  currency?: string | null;
  kind?: string | null;
  category?: string | null;
  deliveryLink?: string | null;
  features?: unknown;
  metadata?: unknown;
  imageUrl?: string | null;
}

export interface OpcionesContenido {
  marca?: string | null;
  color?: string | null;
  logo?: string | null;
  condiciones?: CondicionesDelNegocio | null;
  destino?: DestinoDelAnuncio;
  fotos?: string[];
  /** Ganchos aprobados por el dueño o propuestos por la IA: van primero. */
  ganchosExtra?: string[];
}

export function metadataDe(p: ProductoParaEstudio): any {
  try { return typeof p.metadata === "string" ? JSON.parse(p.metadata) : (p.metadata || {}); } catch { return {}; }
}

export function precioCorto(p: ProductoParaEstudio): string | null {
  const n = Number(p.price) || 0;
  return n > 0 ? `$${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })}` : null;
}

/** Sin viñeta ni emoji al inicio, sin punto final, primera letra en mayúscula. */
function frase(t: string, max = 70): string {
  let s = limpiarTexto(String(t || "")).replace(/^[^\p{L}\p{N}¿¡"']+/u, "").replace(/[.\s]+$/u, "").trim();
  if (!s) return "";
  s = recortarAPalabra(s, max) || s.slice(0, max);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function claveDe(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ ]/g, "").replace(/\s+/g, " ").trim();
}

function sinRepetidos(lista: string[]): string[] {
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const s of lista) {
    const k = claveDe(s);
    if (!k || vistas.has(k)) continue;
    if ([...vistas].some((v) => v.includes(k) || k.includes(v))) continue;
    vistas.add(k);
    out.push(s);
  }
  return out;
}

/** Llamado a la acción corto para un botón (sin emoji ni "y lo pagas…"). */
export function ctaDeBoton(modelo: string, destino: DestinoDelAnuncio): string {
  if (destino === "web") {
    if (modelo === "fisico") return "Pídelo aquí";
    if (modelo === "servicio") return "Agenda tu cita";
    if (modelo === "cotizacion") return "Pide tu cotización";
    return "Empieza hoy";
  }
  if (modelo === "servicio" || modelo === "cotizacion") return "Escríbenos por WhatsApp";
  return "Pídelo por WhatsApp";
}

/** Arma el contenido determinista del anuncio. */
export function contenidoDelProducto(p: ProductoParaEstudio, o: OpcionesContenido = {}): Contenido {
  const m = metadataDe(p);
  const destino: DestinoDelAnuncio = o.destino === "web" ? "web" : "whatsapp";
  const modelo = modeloDelProducto(p as any);
  const plan = planDeAnuncio(p as any, o.condiciones ?? null, { destino });
  const nombre = frase(String(p.name || "Producto"), 90) || "Producto";
  const titular = frase(titularDelProducto(String(p.name || nombre), 40), 40) || nombre;

  const candidatos: string[] = [];
  for (const g of o.ganchosExtra || []) candidatos.push(frase(g, 60));
  const copies = m?.lanzamiento?.copies;
  if (Array.isArray(copies?.ganchos)) for (const g of copies.ganchos) candidatos.push(frase(String(g), 60));
  if (plan.headline) candidatos.push(frase(plan.headline, 60));
  const primera = String(plan.primaryText || "").split(/\n|(?<=[.!?])\s/)[0] || "";
  if (primera) candidatos.push(frase(primera, 64));
  if (m?.curado?.beneficioPrincipal) candidatos.push(frase(String(m.curado.beneficioPrincipal), 64));
  const puntosCrudos = puntosReales(p as any, "", "", -2).map((x) => frase(x, 72)).filter(Boolean);
  for (const pt of puntosCrudos.slice(0, 2)) candidatos.push(pt);
  candidatos.push(`¿Buscas ${titular.toLowerCase().startsWith("curso") || titular.toLowerCase().startsWith("el ") ? titular : `un ${titular}`}?`);
  candidatos.push(titular);
  const ganchos = sinRepetidos(candidatos.filter(Boolean)).slice(0, 5);

  const sellos = sellosDelNegocio(o.condiciones ?? null).map((s) => frase(s, 32)).filter(Boolean);
  // Los sellos de envío solo aplican a lo que se despacha.
  const sellosAplicables = modelo === "fisico" ? sellos : sellos.filter((s) => !/env[ií]o|recibir|llega/i.test(s));

  const puntos = sinRepetidos(puntosCrudos.filter((pt) => !ganchos.slice(0, 1).some((g) => claveDe(g) === claveDe(pt)))).slice(0, 3);

  // Sin lista explícita se leen todas las fotos reales del producto (principal,
  // metadata.imagenes, WooCommerce, Dropi), con rutas locales tal cual (las
  // resuelve el render desde el disco).
  const fotos = (o.fotos && o.fotos.length ? o.fotos : fotosDelProducto(p, "", 8)).slice(0, 8);
  return {
    nombre,
    titular,
    ganchos: ganchos.length ? ganchos : [titular],
    puntos,
    precio: precioCorto(p),
    sellos: sellosAplicables.slice(0, 3),
    cta: ctaDeBoton(modelo, destino),
    marca: frase(String(o.marca || ""), 28),
    color: /^#[0-9a-f]{6}$/i.test(String(o.color || "")) ? String(o.color) : "#4F46E5",
    fotos,
    logo: o.logo || null,
  };
}

/**
 * Ganchos con IA (opcional). Devuelve [] si no hay proveedor, falla o se pasa
 * de tiempo: el llamador sigue con los deterministas.
 */
export async function ganchosConIA(tenantId: number, c: Contenido, p: ProductoParaEstudio, timeoutMs = 20_000): Promise<string[]> {
  try {
    const { redactarConProveedores, ORDEN_GRATUITOS_PRIMERO } = await import("../landing/agente-landing");
    const datos = [
      `Producto: ${c.nombre}`,
      c.precio ? `Precio: ${c.precio} COP` : "",
      c.puntos.length ? `Beneficios reales: ${c.puntos.join(" | ")}` : "",
      p.description ? `Descripción: ${String(p.description).slice(0, 400)}` : "",
    ].filter(Boolean).join("\n");
    const system = "Escribís ganchos para anuncios de Meta en español colombiano. Reglas: máximo 7 palabras cada uno, nada inventado (solo lo que dicen los datos), sin garantías, cifras ni testimonios que no estén, sin emojis, sin mayúsculas sostenidas. Devolvés SOLO JSON: {\"ganchos\":[\"...\",\"...\",\"...\"]}";
    const validar = (t: string) => { try { const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); return Array.isArray(j.ganchos) && j.ganchos.length >= 1; } catch { return false; } };
    const r: any = await Promise.race([
      redactarConProveedores({ tenantId, system, user: datos, timeoutMs, maxTokens: 300, orden: ORDEN_GRATUITOS_PRIMERO, tarea: "ganchos-anuncio", validar }),
      new Promise((ok) => setTimeout(() => ok(null), timeoutMs * 2 + 1000)),
    ]);
    const texto = String(r?.text || "");
    const m = /\{[\s\S]*\}/.exec(texto);
    if (!m) return [];
    const json = JSON.parse(m[0]);
    const lista = Array.isArray(json?.ganchos) ? json.ganchos : [];
    return lista.map((g: unknown) => frase(String(g), 60)).filter((g: string) => g && g.split(" ").length <= 9).slice(0, 3);
  } catch {
    return [];
  }
}
