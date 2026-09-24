/**
 * ── El primer mensaje de Atlas, dicho según lo que le pidieron ────────────
 *
 * Pedido del dueño (2026-09-24): "ese mensaje de Atlas al principio, antes de
 * responder, es genérico y a veces no cuadra con lo que va a hacer".
 *
 * El texto era SIEMPRE el mismo, y salía en cada turno que no fuera ruta
 * guiada:
 *
 *     🧭 Ya entendí el pedido. Lo voy a resolver por etapas y te iré
 *        entregando cada parte terminada.
 *
 * El problema no es que sea feo: es que promete de más. Un "¿cuántos productos
 * tengo?" se resuelve en una lectura y no tiene ninguna etapa; un "pausá esa
 * campaña" es un solo cambio. Decirle "por etapas" a eso no solo no cuadra:
 * enseña a esperar una entrega que nunca llega.
 *
 * ── Qué decide esto y qué NO ─────────────────────────────────────────────
 *
 * Decía el dueño que el aviso tiene que ser "acorde a lo que pidió". Acá se
 * mira el pedido del admin y se elige la frase que mejor lo describe, con las
 * mismas familias de palabras con las que el sistema ya elige qué herramientas
 * mandar (ver GRUPOS en opencode-mcp-tools.ts): si el aviso dijera una cosa y
 * las herramientas fueran por otra, el texto mentiría.
 *
 * NO adivina el resultado ni promete nada que no esté pedido. Y ante la menor
 * duda devuelve null: **no se manda nada**. Un aviso en blanco es mejor que uno
 * que anuncia algo distinto de lo que va a pasar -- que es justo el defecto que
 * esto viene a corregir. El turno entrega la respuesta real igual; lo único que
 * cambia es que, si no sabemos qué va a hacer, no lo anunciamos.
 *
 * ── Sobre "por etapas" ───────────────────────────────────────────────────
 *
 * La promesa de partes SÍ es cierta cuando el admin enumeró varias cosas: eso
 * lo sabe `partirElPedido()`. Por eso el aviso agrega la nota de partes SOLO
 * en ese caso. En un pedido de una sola cosa, desaparece.
 */
import { partirElPedido } from "./partir-el-pedido";

interface ReglaAviso {
  /** Se evalúa sobre el pedido en minúsculas y sin acentos. */
  patron: RegExp;
  /** Una sola línea, en presente y sin prometer resultados. */
  mensaje: string;
}

/**
 * Orden = prioridad. Las específicas van primero para que "generá una imagen
 * para el anuncio" hable de la imagen y no del anuncio, y para que "cómo van
 * mis campañas" no caiga en el aviso genérico de crear.
 */
const REGLAS: ReglaAviso[] = [
  // ── Investigación real: es lo que más tarda y más necesita aviso ────────
  {
    patron: /competencia|competidor|biblioteca de anuncios|ad library|mercado|tendencia|benchmark|que (esta|estan) haciendo|que funciona/,
    mensaje: "🔎 Voy a ver qué está haciendo la competencia para traerte datos reales…",
  },
  {
    patron: /investig|research|averigu|indag|\bbusc/,
    mensaje: "🔎 Voy a investigar eso y te traigo las fuentes…",
  },

  // ── Cambios sobre campañas (van a pedir confirmación antes de tocar Meta)
  {
    patron: /(?=.*(pausa|activ|apag|deten|reanud|borr|elimin|presupuesto)).*(campana|anuncio|pauta|publicidad|\bads\b|facebook|meta)/,
    mensaje: "⚙️ Preparo ese cambio en tus campañas…",
  },

  // ── Cómo van las campañas / métricas ────────────────────────────────────
  {
    patron: /(?=.*(como va|como van|como esta|rendimiento|metrica|resultado|roas|cpa|ctr|gast|analiz|diagnostic|atribuci|optimiz)).*(campana|anuncio|pauta|publicidad|\bads\b|facebook|meta)/,
    mensaje: "📊 Reviso cómo van tus campañas…",
  },

  // ── Estrategia / propuesta antes de gastar ──────────────────────────────
  {
    patron: /propuesta|propon|estrategia|angulo/,
    mensaje: "🧭 Armo la propuesta y te la muestro…",
  },

  // ── El texto del anuncio ────────────────────────────────────────────────
  {
    patron: /copy|redact|titulo|descripcion|guion/,
    mensaje: "📝 Preparo el texto…",
  },

  // ── Crear anuncio / campaña (lo demás de Facebook) ──────────────────────
  {
    patron: /campana|anuncio|pauta|publicidad|\bads\b|creativ|facebook|meta/,
    mensaje: "📣 Preparo el anuncio y te lo muestro antes de subirlo…",
  },

  // ── El vendedor de WhatsApp ─────────────────────────────────────────────
  {
    patron: /whatsapp|wasap|vendedor|\bagente\b|\bbot\b/,
    mensaje: "🤖 Reviso tu agente de WhatsApp…",
  },

  // ── Conversaciones y clientes ───────────────────────────────────────────
  {
    patron: /conversaci|cliente|lead|mensaje|chat/,
    mensaje: "💬 Reviso tus conversaciones…",
  },

  // ── Imagen ──────────────────────────────────────────────────────────────
  {
    patron: /imagen|foto|disen|portada|logo/,
    mensaje: "🎨 Genero la imagen…",
  },

  // ── Contenido orgánico ──────────────────────────────────────────────────
  {
    patron: /contenido|publicacion|publicar|posteo|postear|\bpost\b|organic|calendario|redes|instagram/,
    mensaje: "📝 Preparo la publicación…",
  },

  // ── Página de venta / tienda ────────────────────────────────────────────
  {
    patron: /landing|landi|pagina de venta|tienda|woocommerce|wordpress|\blp\b/,
    mensaje: "🛍️ Reviso tu página de venta…",
  },

  // ── Pedidos, entregas y proveedores ─────────────────────────────────────
  {
    patron: /pedido|entrega|proveedor|dropi|envio|despacho/,
    mensaje: "📦 Reviso tus pedidos y entregas…",
  },

  // ── Catálogo, productos y precios ───────────────────────────────────────
  {
    patron: /producto|catalogo|precio|ficha|stock|inventario/,
    mensaje: "📦 Reviso tu catálogo…",
  },

  // ── Ventas y dinero ─────────────────────────────────────────────────────
  {
    patron: /venta|ingreso|factur|dinero|plata|cobr|ganancia/,
    mensaje: "💰 Reviso tus ventas…",
  },

  // ── Panorama general (después de las categorías concretas) ──────────────
  {
    patron: /como va|como van|como esta|resumen|dashboard|balance|panorama|en general/,
    mensaje: "📊 Reviso cómo va tu negocio…",
  },

  // ── Agenda ──────────────────────────────────────────────────────────────
  {
    patron: /program|agend|recordatorio/,
    mensaje: "🗓️ Preparo esa programación…",
  },

  // ── Código / despliegue ─────────────────────────────────────────────────
  {
    patron: /codigo|bug|programa|deploy|repositorio|github|\bgit\b/,
    mensaje: "🔧 Voy a revisar el código…",
  },

  // ── Estado del sistema y configuración (lo más ancho, al final) ─────────
  {
    patron: /sistema|configurac|ajuste|error|falla|conexion/,
    mensaje: "🩺 Reviso cómo está todo…",
  },
];

const sinAcentos = (s: string) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * El aviso que se manda al chat apenas arranca el turno. null = no mandar nada.
 */
export function avisoDeArranque(prompt: string): string | null {
  const t = sinAcentos(prompt).replace(/“[^”]*”|"[^"]*"|«[^»]*»/g, " ").trim();
  if (!t) return null;

  const regla = REGLAS.find((r) => r.patron.test(t));
  if (!regla) return null;

  const partes = partirElPedido(String(prompt || ""));
  return partes
    ? `${regla.mensaje} Son varias cosas: te las voy entregando a medida que las termino.`
    : regla.mensaje;
}
