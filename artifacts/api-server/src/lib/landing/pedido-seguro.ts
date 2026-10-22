/**
 * Formulario contraentrega "seguro" (22-10-2026): verificación por WhatsApp,
 * upsell/downsell y antifraude. Las tres cosas que traen los formularios COD
 * de referencia (Releasit, EasySell) y que acá faltaban.
 *
 * Todo lo de este archivo es PURO (sin base, sin red): reglas que se pueden
 * probar. Las rutas (`routes/landing-publica.ts`) y el receptor de mensajes
 * (`services/message-handler.ts`) lo usan.
 *
 * ── Verificación al revés ─────────────────────────────────────────────────
 *
 * Los formularios de referencia MANDAN un código al cliente. Acá no: con
 * Baileys, escribirle primero a un número que nunca nos escribió es lo que
 * más arriesga el baneo, y por Cloud API exigiría una plantilla aprobada.
 * Entonces el pedido queda `por_verificar` y es el CLIENTE quien nos escribe
 * el código desde su WhatsApp (botón wa.me con el texto listo). Eso prueba
 * que el número existe y es suyo, y además abre la conversación con el bot
 * para confirmar la entrega, que es lo que de verdad baja las devoluciones.
 *
 * ── Nada se activa solo ───────────────────────────────────────────────────
 *
 * Verificación, upsell y cada regla antifraude están apagadas hasta que el
 * dueño las prende. Rechazar un pedido legítimo es peor que dejar pasar uno
 * dudoso (lección #5 de ESTADO_Y_PENDIENTES.md).
 */
import { createHash, randomInt } from "node:crypto";

// ─── Configuración de la landing (design.pedido) ─────────────────────────────

export interface OfertaExtra {
  /** Producto que se ofrece. Vacío = más unidades del MISMO producto. */
  productId: number | null;
  /** Unidades que agrega. */
  cantidad: number;
  /** Precio total de lo que agrega (no unitario). */
  precio: number;
  /** Texto corto que ve el cliente: "Lleva otra unidad". */
  titulo: string;
}

export interface ConfigPedido {
  verificarWhatsapp: boolean;
  upsell: OfertaExtra | null;
  /** Mismo producto del upsell a menor precio, si lo rechaza. */
  downsell: OfertaExtra | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const texto = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function ofertaExtra(v: any): OfertaExtra | null {
  if (!v || typeof v !== "object") return null;
  const precio = Math.round(num(v.precio));
  const cantidad = Math.max(1, Math.min(10, Math.round(num(v.cantidad) || 1)));
  const productId = num(v.productId) > 0 ? Math.round(num(v.productId)) : null;
  if (precio <= 0) return null;
  return { productId, cantidad, precio, titulo: texto(v.titulo, 80) || (productId ? "Agrégalo a tu pedido" : `Lleva ${cantidad} más`) };
}

/** Lee `design.pedido` de la landing. Lo que no está bien formado queda apagado. */
export function configPedido(design: unknown): ConfigPedido {
  const p = (design && typeof design === "object" ? (design as any).pedido : null) || {};
  const upsell = p.upsell?.activo === false ? null : ofertaExtra(p.upsell);
  let downsell = upsell && p.downsell?.activo !== false ? ofertaExtra({ ...p.downsell, productId: upsell.productId, cantidad: p.downsell?.cantidad ?? upsell.cantidad }) : null;
  // Un "downsell" que no es más barato no es downsell: se descarta.
  if (downsell && upsell && downsell.precio >= upsell.precio) downsell = null;
  return { verificarWhatsapp: p.verificarWhatsapp === true, upsell, downsell };
}

/** Lo que eligió el cliente en el formulario: campo `extra` = "upsell" | "downsell". */
export function extraElegido(cfg: ConfigPedido, valor: unknown): OfertaExtra | null {
  const v = String(valor ?? "").trim().toLowerCase();
  if (v === "upsell") return cfg.upsell;
  if (v === "downsell") return cfg.downsell;
  return null;
}

/**
 * Suma el extra al pedido cuando es el MISMO producto (un solo despacho).
 * Si es otro producto devuelve el pedido sin tocar: ese va en un pedido
 * aparte (ver la ruta), porque el despacho es de un producto por pedido.
 */
export function sumarExtraMismoProducto(
  base: { cantidad: number; total: number },
  extra: OfertaExtra | null,
  productoDelPedido: number,
): { cantidad: number; total: number; sumado: boolean } {
  if (!extra || (extra.productId && extra.productId !== productoDelPedido)) return { ...base, sumado: false };
  const cantidad = Math.min(20, base.cantidad + extra.cantidad);
  return { cantidad, total: base.total + extra.precio, sumado: true };
}

// ─── Antifraude (tenants.metadata.antifraude) ────────────────────────────────

export interface ConfigAntifraude {
  /** Pedidos del mismo celular en 24 h. 0 = sin límite. */
  maxPedidosPorTelefono24h: number;
  /** Pedidos desde la misma IP en 24 h. 0 = sin límite. */
  maxPedidosPorIp24h: number;
  telefonosBloqueados: string[];
  ipsBloqueadas: string[];
  /** Ciudades a las que el dueño no despacha contraentrega (sin tildes, minúsculas). */
  ciudadesBloqueadas: string[];
}

export const ANTIFRAUDE_APAGADO: ConfigAntifraude = {
  maxPedidosPorTelefono24h: 0, maxPedidosPorIp24h: 0, telefonosBloqueados: [], ipsBloqueadas: [], ciudadesBloqueadas: [],
};

export const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/** Últimos 10 dígitos: "+57 300 123 4567" y "3001234567" son el mismo celular. */
export const celular = (s: unknown) => String(s ?? "").replace(/\D/g, "").slice(-10);

function lista(v: unknown, limpiar: (s: string) => string): string[] {
  const crudo = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\n,;]+/) : [];
  return [...new Set(crudo.map((x) => limpiar(String(x ?? ""))).filter(Boolean))].slice(0, 500);
}

export function configAntifraude(v: unknown): ConfigAntifraude {
  const a = (v && typeof v === "object" ? v : {}) as any;
  return {
    maxPedidosPorTelefono24h: Math.max(0, Math.min(50, Math.round(num(a.maxPedidosPorTelefono24h)))),
    maxPedidosPorIp24h: Math.max(0, Math.min(200, Math.round(num(a.maxPedidosPorIp24h)))),
    telefonosBloqueados: lista(a.telefonosBloqueados, (s) => { const c = celular(s); return c.length >= 7 ? c : ""; }),
    ipsBloqueadas: lista(a.ipsBloqueadas, (s) => s.trim().replace(/^::ffff:/, "")),
    ciudadesBloqueadas: lista(a.ciudadesBloqueadas, sinTildes),
  };
}

export type VeredictoAntifraude =
  | { ok: true }
  /** `alCliente` es lo único que se le muestra: nunca dice qué regla saltó. */
  | { ok: false; regla: string; alCliente: string };

const MENSAJE_GENERICO = "No pudimos registrar tu pedido desde la página. Escríbenos por WhatsApp y lo hacemos contigo.";

export function evaluarAntifraude(
  cfg: ConfigAntifraude,
  p: { telefono: string; ip: string; ciudad: string; pedidosTelefono24h: number; pedidosIp24h: number; trampa?: unknown },
): VeredictoAntifraude {
  // Campo trampa: invisible para una persona, los robots lo llenan. Siempre
  // activo: una persona nunca lo ve, así que no puede bloquear a nadie real.
  if (String(p.trampa ?? "").trim()) return { ok: false, regla: "campo trampa lleno (robot)", alCliente: MENSAJE_GENERICO };
  const tel = celular(p.telefono);
  const ip = String(p.ip || "").replace(/^::ffff:/, "");
  if (tel && cfg.telefonosBloqueados.includes(tel)) return { ok: false, regla: `celular bloqueado ${tel}`, alCliente: MENSAJE_GENERICO };
  if (ip && cfg.ipsBloqueadas.includes(ip)) return { ok: false, regla: `IP bloqueada ${ip}`, alCliente: MENSAJE_GENERICO };
  const ciudad = sinTildes(p.ciudad || "");
  if (ciudad && cfg.ciudadesBloqueadas.includes(ciudad)) {
    return { ok: false, regla: `ciudad sin contraentrega: ${p.ciudad}`, alCliente: `Por ahora no despachamos contraentrega a ${p.ciudad}. Escríbenos por WhatsApp y vemos otra opción.` };
  }
  if (cfg.maxPedidosPorTelefono24h > 0 && p.pedidosTelefono24h >= cfg.maxPedidosPorTelefono24h) {
    return { ok: false, regla: `${p.pedidosTelefono24h} pedidos del mismo celular en 24 h`, alCliente: "Ya tienes pedidos registrados hoy. Escríbenos por WhatsApp si quieres agregar algo." };
  }
  if (cfg.maxPedidosPorIp24h > 0 && p.pedidosIp24h >= cfg.maxPedidosPorIp24h) {
    return { ok: false, regla: `${p.pedidosIp24h} pedidos desde la misma IP en 24 h`, alCliente: MENSAJE_GENERICO };
  }
  return { ok: true };
}

// ─── Código de verificación ──────────────────────────────────────────────────

/** "VP-482193". El prefijo es lo que lo distingue de un número de casa o de guía. */
export function generarCodigo(): string {
  return `VP-${randomInt(100000, 1000000)}`;
}

/** El código dentro de un mensaje del cliente, o null. Señal estructural, no palabras. */
export function codigoEnMensaje(mensaje: string): string | null {
  const m = String(mensaje || "").match(/\bVP[\s-]?(\d{6})\b/i);
  return m ? `VP-${m[1]}` : null;
}

/** Texto que el cliente nos manda (sale escrito en el enlace wa.me). */
export function textoDeVerificacion(pedidoId: number, codigo: string, producto: string): string {
  return `Hola, quiero confirmar mi pedido #${pedidoId} de ${producto}. Mi código es ${codigo}`;
}

/**
 * Token para que la página de verificación consulte el estado sin dejar que
 * cualquiera recorra los pedidos por número. Deriva del código, que solo
 * conocen el servidor y quien hizo el pedido.
 */
export function tokenDeVerificacion(pedidoId: number, codigo: string): string {
  return createHash("sha256").update(`${pedidoId}|${codigo}`).digest("hex").slice(0, 24);
}

/** Ventana para escribir el código: pasado esto el pedido queda para revisión manual. */
export const HORAS_PARA_VERIFICAR = 48;
