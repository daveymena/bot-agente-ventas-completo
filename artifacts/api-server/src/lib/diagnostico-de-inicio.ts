/**
 * ── Diagnóstico de inicio: Atlas abre proponiendo, no saludando ─────────
 *
 * Pedido del dueño (14-09-2026): que Atlas guíe a un cliente que "no sabe ni
 * anunciar". La primera pantalla del chat era un saludo fijo con una lista de
 * capacidades; eso obliga al cliente a saber qué pedir. Ahora, al abrir, se
 * mira el negocio (productos, WhatsApp, Facebook, campañas) y se le dice en
 * tres líneas cómo está y cuál es el siguiente paso, con un botón.
 *
 * Todo sale de las mismas herramientas de LECTURA que usa Atlas en cada turno
 * (executeAction), en paralelo y con tope de tiempo: una consulta lenta no
 * puede demorar la apertura del chat.
 */
import { executeAction, type OperatorContext } from "./app-operator";
import { logger } from "./logger";

export type SiguientePasoId = "whatsapp" | "productos" | "meta-pago" | "meta-conectar" | "producto-nuevo";

export interface SiguientePaso {
  id: SiguientePasoId;
  /** Texto del botón. */
  texto: string;
  /** Mensaje que manda el botón (lo que detecta el servidor). */
  mensaje: string;
  /** Por qué es lo primero, en una línea. */
  porque: string;
}

export interface Diagnostico {
  productos: { total: number; fisicos: number; digitales: number; sinFoto: number };
  whatsappConectado: boolean | null;
  facebookConectado: boolean | null;
  cuentaMetaPuedeGastar: boolean | null;
  campanasActivas: number | null;
  leads: number | null;
  /** Tres líneas, en lenguaje de dueño de negocio. */
  texto: string;
  siguiente: SiguientePaso;
}

const TOPE_MS = 8_000;

async function leer(nombre: string, ctx: OperatorContext): Promise<any | null> {
  try {
    const r = await Promise.race([
      executeAction(nombre, {}, ctx),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TOPE_MS)),
    ]);
    return r;
  } catch (e: any) {
    logger.warn({ tool: nombre, err: e?.message }, "[Diagnostico] Lectura falló");
    return null;
  }
}

export const SIGUIENTES: Record<SiguientePasoId, Omit<SiguientePaso, "porque">> = {
  whatsapp: { id: "whatsapp", texto: "📱 Conectar WhatsApp", mensaje: "Ayúdame a conectar WhatsApp" },
  productos: { id: "productos", texto: "📦 Cargar mi primer producto", mensaje: "Quiero cargar mi primer producto" },
  "meta-pago": { id: "meta-pago", texto: "💳 Arreglar el pago de Facebook", mensaje: "Ayúdame a arreglar el pago de la cuenta de Facebook" },
  "meta-conectar": { id: "meta-conectar", texto: "🔗 Conectar Facebook", mensaje: "Ayúdame a conectar Facebook" },
  "producto-nuevo": { id: "producto-nuevo", texto: "🚀 Vender un producto nuevo", mensaje: "Quiero vender un producto nuevo" },
};

export async function diagnosticoDelNegocio(ctx: OperatorContext): Promise<Diagnostico> {
  const [prod, wa, fb, camp, dash] = await Promise.all([
    leer("analyze_system", ctx),
    leer("whatsapp_status", ctx),
    leer("fb_status", ctx),
    leer("fb_list_campaigns", ctx),
    leer("dashboard_summary", ctx),
  ]);

  // El resumen agrega TODO el catálogo del tenant. Una página de 50 filas
  // no puede usarse como conteo (142 observados en la pantalla real).
  const productos = {
    total: Number(prod?.data?.products) || 0,
    fisicos: Number(prod?.data?.physicalProducts) || 0,
    digitales: Number(prod?.data?.digitalProducts) || 0,
    sinFoto: Number(prod?.data?.productsWithoutImage) || 0,
  };

  const whatsappConectado = wa ? String(wa.data?.state || "") === "connected" : null;
  const facebookConectado = fb ? Boolean(fb.data?.ok) : null;
  const cuentaMetaPuedeGastar = fb && typeof fb.data?.cuentaPuedeGastar === "boolean" ? fb.data.cuentaPuedeGastar : null;
  const campanas: any[] = Array.isArray(camp?.data?.campañas) ? camp.data.campañas : [];
  const campanasActivas = camp?.ok ? campanas.filter((c) => String(c?.effectiveStatus || c?.status || "").toUpperCase() === "ACTIVE").length : null;
  const leads = dash?.data && Number.isFinite(Number(dash.data.totalLeads)) ? Number(dash.data.totalLeads) : null;

  // ── Qué va primero ──────────────────────────────────────────────────────
  // El orden es el del embudo: sin WhatsApp el bot no atiende; sin productos
  // no hay qué vender; con Meta sin pago ningún anuncio sale. Si todo eso
  // está, lo que sigue es vender.
  let siguiente: SiguientePaso;
  if (whatsappConectado === false) {
    siguiente = { ...SIGUIENTES.whatsapp, porque: "Sin WhatsApp conectado, el bot no puede atender a nadie." };
  } else if (productos.total === 0) {
    siguiente = { ...SIGUIENTES.productos, porque: "Todavía no hay nada que vender." };
  } else if (facebookConectado && cuentaMetaPuedeGastar === false) {
    siguiente = { ...SIGUIENTES["meta-pago"], porque: "La cuenta publicitaria no puede gastar: ningún anuncio va a salir hasta arreglarlo." };
  } else if (facebookConectado === false && campanasActivas === null) {
    siguiente = { ...SIGUIENTES["producto-nuevo"], porque: "Ya podés vender por WhatsApp; Facebook lo conectamos cuando quieras anunciar." };
  } else {
    siguiente = { ...SIGUIENTES["producto-nuevo"], porque: campanasActivas ? "Ya tenés campañas andando; sumemos otro producto." : "Todo listo para empezar a anunciar." };
  }

  const lineas: string[] = [];
  lineas.push(
    productos.total === 0
      ? "Todavía no tenés productos cargados."
      : `Tenés ${productos.total} producto${productos.total === 1 ? "" : "s"}${productos.sinFoto ? ` (${productos.sinFoto} sin foto)` : ""}` +
        (campanasActivas === null ? "." : campanasActivas === 0 ? " y ninguna campaña activa." : ` y ${campanasActivas} campaña${campanasActivas === 1 ? "" : "s"} activa${campanasActivas === 1 ? "" : "s"}.`),
  );
  const estados: string[] = [];
  if (whatsappConectado !== null) estados.push(`WhatsApp ${whatsappConectado ? "conectado ✅" : "sin conectar ⚠️"}`);
  if (facebookConectado !== null) {
    estados.push(
      !facebookConectado ? "Facebook sin conectar"
        : cuentaMetaPuedeGastar === false ? "Facebook conectado pero la cuenta publicitaria no puede gastar 🚨"
        : "Facebook conectado ✅",
    );
  }
  if (estados.length) lineas.push(estados.join(" · ") + ".");
  if (leads !== null && leads > 0) lineas.push(`${leads} persona${leads === 1 ? "" : "s"} ya te escribieron.`);
  lineas.push(`Lo primero: ${siguiente.porque}`);

  return { productos, whatsappConectado, facebookConectado, cuentaMetaPuedeGastar, campanasActivas, leads, texto: lineas.join("\n"), siguiente };
}

/**
 * Guías cortas para lo que el cliente tiene que hacer con sus manos (no lo
 * puede hacer Atlas): en pasos numerados y sin tecnicismos.
 */
export const GUIAS: Record<Exclude<SiguientePasoId, "producto-nuevo">, string> = {
  whatsapp:
    "1. En el menú de la izquierda entrá a **WhatsApp**.\n" +
    "2. Tocá **Conectar** y va a aparecer un código QR.\n" +
    "3. En tu celular: WhatsApp → los tres puntos → **Dispositivos vinculados** → **Vincular dispositivo** → apuntá al código.\n" +
    "Listo: desde ese momento el bot contesta por vos.",
  productos:
    "Decime el **nombre**, el **precio** y mandame una **foto** (o pegá el enlace de la foto) y yo lo cargo. " +
    "Si preferís hacerlo vos: menú **Productos** → **Nuevo**.",
  "meta-pago":
    "1. Entrá a **Administrador de anuncios** de Facebook (adsmanager.facebook.com).\n" +
    "2. Arriba a la derecha, el menú → **Facturación y pagos**.\n" +
    "3. En **Métodos de pago** agregá una tarjeta y, si hay un saldo pendiente, pagalo ahí mismo.\n" +
    "Cuando esté, decime y seguimos con el anuncio.",
  "meta-conectar":
    "1. En el menú de la izquierda entrá a **Configuración → Facebook**.\n" +
    "2. Tocá **Conectar con Facebook** y aceptá los permisos con la cuenta que administra tu página.\n" +
    "3. Elegí tu **página** y tu **cuenta publicitaria**.\n" +
    "Cuando esté, decime y seguimos.",
};
