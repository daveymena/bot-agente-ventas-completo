/**
 * ============================================================
 * CONTEXTO DE NEGOCIO — una sola fuente para todo el sistema
 * ============================================================
 *
 * El problema que resuelve, verificado en el código el 2026-08-22:
 *
 * El agente no conocía el negocio del cliente: conocía TecnoVariedades,
 * escrito a mano en tres lugares distintos.
 *
 *   · `conversation-engine.ts` afirmaba "Eres Sofía, asesora de
 *     TecnoVariedades D&S" y "DATOS REALES: entrega por Google Drive,
 *     acceso de por vida, garantía de 7 días" en el bloque de contexto.
 *   · `agent.ts` repetía los mismos HECHOS CONFIRMADOS en el prompt.
 *   · `anuncio-inteligente.ts` los derivaba por su cuenta del producto.
 *
 * Y lo peor: en `agent.ts` el dueño SÍ puede reemplazar el prompt del
 * sistema (`activeAgent.systemPrompt || <default>`), pero el bloque de
 * contexto se le pegaba igual, DESPUÉS. Así que un gimnasio o un
 * restaurante que se registrara en el SaaS recibía un bot que se
 * presentaba como Sofía y prometía Google Drive con garantía de 7 días.
 *
 * Este módulo es la única fuente. Resuelve el perfil del negocio en este
 * orden, y deja registrado de dónde salió cada dato:
 *
 *   1. `tenants.metadata.businessProfile` — lo que el dueño configuró.
 *      Es el lugar canónico: va POR CLIENTE.
 *   2. `settings.businessConfig` / `settings.businessDescription` — la
 *      configuración vieja. OJO: `settings` es una tabla GLOBAL, una sola
 *      fila para toda la plataforma (no tiene tenant_id), así que solo se
 *      usa como respaldo y nunca pisa lo del tenant.
 *   3. Derivado de los productos del cliente (`kind` + `deliveryLink`):
 *      si todo lo que vende es digital con enlace, la entrega es digital
 *      y NO puede prometer envío, clases en vivo ni atención presencial.
 *   4. Nada. Y acá está la regla más importante de este archivo:
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ LO QUE NO ESTÁ CONFIGURADO NO SE AFIRMA.                         │
 * │ Antes, un dato faltante se rellenaba con el de TecnoVariedades:  │
 * │ el agente inventaba con total seguridad. Ahora un dato faltante  │
 * │ se convierte en una PROHIBICIÓN explícita de afirmarlo.          │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * Es la base del punto 2 de la hoja de ruta ("un agente por tipo de
 * negocio, que le pregunte al dueño qué ofrece y qué NO puede hacer"):
 * este módulo es dónde vive esa respuesta una vez que el dueño la da.
 */
import { db, tenants, settings as settingsTable, products } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { ESTILO_POR_DEFECTO, estiloDelNegocio, type EstiloDeVenta } from "./estilo-de-venta";
import {
  CONDICIONES_DE_RESPALDO, condicionesDesdePerfil, fraseCostoEnvio, frasePagoEnvio,
  type CondicionesDelNegocio,
} from "./modelo-de-negocio";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface DatoEntrega {
  metodo: string;      // "Google Drive" | "envío a domicilio" | "en el local" | ...
  plazo: string;       // "inmediato" | "3 a 5 días hábiles" | ...
  detalle?: string;
}

export interface DatoGarantia {
  dias: number;
  descripcion: string;
}

export interface DatoAcceso {
  tipo: string;        // "de por vida" | "mensual" | "por sesión" | ...
  descripcion?: string;
}

export interface BusinessContext {
  tenantId: number | null;
  businessName: string;
  agentName: string;

  /** Qué vende y a quién. `null` = el dueño no lo describió. */
  descripcion: string | null;
  /** Rubro: "cursos digitales", "restaurante", "gimnasio", ... */
  nicho: string | null;
  /** Hasta dónde llega: ciudades, país, online. `null` = no configurado. */
  cobertura: string | null;
  /** Horario de atención, ya formateado. `null` = no configurado. */
  horario: string | null;

  /** Los tres datos que el agente afirmaba de memoria. `null` = NO afirmar. */
  entrega: DatoEntrega | null;
  garantia: DatoGarantia | null;
  /** Cómo habla este negocio. Lo describe el dueño; no hay lista cerrada. */
  tono: string | null;
  /**
   * Si acepta negociar el precio. Por defecto NO.
   *
   * Un concesionario o una muebleria si regatean, y el SaaS tiene que
   * servirles. Pero el default es no: rebajar al primer pedido ensena que el
   * precio de lista era falso.
   */
  negociaPrecio: boolean;
  acceso: DatoAcceso | null;

  /**
   * Cómo vende este negocio: si califica antes de presentar, si usa el video
   * como gancho, y qué hace ante un "lo voy a pensar". Ver `estilo-de-venta.ts`.
   *
   * Nunca es null: un negocio que no eligió nada vende con el estilo por
   * defecto, que no es "neutro" sino el que este proyecto midió que funciona.
   */
  estiloDeVenta: EstiloDeVenta;

  /**
   * Qué tipo de producto vende ESTE negocio.
   *
   * Un curso digital y una rodillera térmica no se venden igual: el digital se
   * entrega con un enlace al instante, el físico necesita dirección, ciudad y
   * transportadora. Con los dos mezclados en el mismo catálogo, el agente
   * promete envíos de un curso y "acceso de por vida" de un frasco -- pasó
   * las dos veces, y son de los errores que más caro salen.
   *
   * "digital" o "fisico" dejan fuera del catálogo el otro tipo, así que el
   * agente ni siquiera puede confundirse. "mixto" es el comportamiento de
   * siempre, y sigue siendo el valor por defecto para no cambiarle el
   * catálogo a nadie sin que lo pida.
   */
  modoCatalogo: "digital" | "fisico" | "mixto";

  /**
   * País, y cómo se despacha y cobra lo físico. Antes eran constantes de
   * código válidas solo para el dueño (`HECHOS_DROPSHIPPING`); otro negocio
   * heredaba "3 a 5 días, contraentrega, envío incluido" aunque cobrara el
   * envío aparte. Ahora salen del perfil; lo de código es solo el respaldo.
   */
  condiciones: CondicionesDelNegocio;

  /** Lo que el negocio NO hace. Se renderiza como prohibición dura. */
  noPuede: string[];
  /** Datos sueltos que el dueño quiera que el agente sepa (FAQ del negocio). */
  loQueDebeSaber: string[];

  /** De dónde salió cada dato. Para depurar sin adivinar. */
  fuentes: string[];
  /** ¿El dueño configuró su perfil, o esto es todo derivado/vacío? */
  configurado: boolean;
}

// ─── Caché corta por tenant ───────────────────────────────────────────────────
// El contexto entra en CADA mensaje de WhatsApp: sin caché serían 3 consultas
// por mensaje. 60s alcanza para que un cambio en el panel se vea enseguida.

const CACHE_MS = 60_000;
const cache = new Map<string, { ctx: BusinessContext; expira: number }>();

/** Vacía la caché. Llamalo cuando el dueño guarda su perfil. */
export function invalidarContextoDeNegocio(tenantId?: number | null): void {
  if (tenantId == null) cache.clear();
  else cache.delete(`t:${tenantId}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function textoLimpio(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  // "Mi Negocio" y "Tienda virtual de productos digitales y servicios
  // tecnológicos" son los placeholders que trae el sistema de fábrica. Tomarlos
  // como configuración real es peor que no tener nada: el agente los afirma.
  const placeholders = [
    "mi negocio",
    "tienda virtual de productos digitales y servicios tecnológicos",
    "asistente virtual",
    "sin descripción",
  ];
  if (placeholders.includes(s.toLowerCase())) return null;
  return s;
}

/**
 * `tenants.metadata` vuelve como objeto en Postgres y como STRING en SQLite
 * (que es el modo local, USE_SQLITE=true). Sin esto, el perfil del negocio se
 * leía como `undefined` en local: el agente parecía no tener nada configurado
 * aunque el dueño lo hubiera guardado. Mismo criterio que
 * `leerMetadata()` en routes/facebook-credentials.ts.
 */
export function normalizarMetadata(meta: unknown): Record<string, any> {
  if (!meta) return {};
  if (typeof meta === "string") {
    try {
      const parsed = JSON.parse(meta);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof meta === "object" ? (meta as Record<string, any>) : {};
}

function listaLimpia(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => textoLimpio(x)).filter((x): x is string => !!x);
}

function leerEntrega(raw: any): DatoEntrega | null {
  const metodo = textoLimpio(raw?.metodo ?? raw?.method);
  if (!metodo) return null;
  return {
    metodo,
    plazo: textoLimpio(raw?.plazo ?? raw?.timeframe) || "sin plazo definido",
    detalle: textoLimpio(raw?.detalle ?? raw?.details) || undefined,
  };
}

function leerGarantia(raw: any): DatoGarantia | null {
  const dias = Number(raw?.dias ?? raw?.days);
  const descripcion = textoLimpio(raw?.descripcion ?? raw?.description);
  if (!Number.isFinite(dias) || dias <= 0) {
    // Una garantía sin días pero con texto sigue siendo una garantía real.
    return descripcion ? { dias: 0, descripcion } : null;
  }
  return { dias, descripcion: descripcion || `${dias} días de garantía` };
}

function leerAcceso(raw: any): DatoAcceso | null {
  const tipo = textoLimpio(raw?.tipo ?? raw?.type);
  if (!tipo) return null;
  return { tipo, descripcion: textoLimpio(raw?.descripcion ?? raw?.description) || undefined };
}

/**
 * Lo que se puede saber del negocio SIN preguntarle nada al dueño, mirando
 * lo que vende. Es el arreglo barato del punto 7.2: la fila del producto ya
 * traía `kind` y `deliveryLink`, solo que nadie los miraba.
 */
function derivarDeProductos(filas: Array<{ kind?: string | null; deliveryLink?: string | null }>) {
  if (filas.length === 0) return null;

  const digitales = filas.filter((p) => String(p.kind || "digital") === "digital");
  const todosDigitales = digitales.length === filas.length;
  if (!todosDigitales) return null;

  const conEnlace = digitales.filter((p) => !!textoLimpio(p.deliveryLink));
  if (conEnlace.length === 0) return null;

  const porDrive = conEnlace.filter((p) => String(p.deliveryLink).includes("drive.google")).length;
  const metodo = porDrive > conEnlace.length / 2 ? "Google Drive" : "enlace de descarga";

  return {
    entrega: {
      metodo,
      plazo: "inmediato",
      detalle: `Producto digital: el enlace (${metodo}) se envía apenas se confirma el pago.`,
    } as DatoEntrega,
    noPuede: [
      "prometer envío físico, paquetes ni domicilios: no se manda nada por correo",
      "prometer clases en vivo, sesiones en directo, tutorías ni atención presencial",
      "dar una dirección, local o punto de retiro",
    ],
  };
}

function formatearHorario(inicio?: string | null, fin?: string | null, tz?: string | null): string | null {
  const i = textoLimpio(inicio);
  const f = textoLimpio(fin);
  if (!i || !f) return null;
  return `${i} a ${f}${tz ? ` (${tz})` : ""}`;
}

// ─── Resolución ───────────────────────────────────────────────────────────────

/**
 * El perfil del negocio de ESTE cliente. Nunca lanza: si la base falla,
 * devuelve un contexto vacío, que es el modo seguro (el agente no afirma nada).
 */
export async function getBusinessContext(
  tenantId: number | null | undefined,
  opts?: { businessName?: string | null; agentName?: string | null }
): Promise<BusinessContext> {
  const key = `t:${tenantId ?? 0}`;
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expira) {
    return aplicarNombres(hit.ctx, opts);
  }

  const ctx: BusinessContext = {
    tenantId: tenantId ?? null,
    businessName: "",
    agentName: "",
    descripcion: null,
    nicho: null,
    cobertura: null,
    horario: null,
    entrega: null,
    garantia: null,
    tono: null,
    negociaPrecio: false,
    acceso: null,
    estiloDeVenta: { ...ESTILO_POR_DEFECTO },
    // Por defecto NO se filtra nada: cambiarle el catálogo a un negocio que no
    // lo pidió sería peor que el problema que esto resuelve.
    //
    // `MODO_CATALOGO` es el respaldo para instalaciones de UN solo negocio,
    // mismo criterio que `ADMIN_PHONE` en ad-growth-agent: el perfil del
    // negocio manda, y el entorno solo sirve cuando todavía no se configuró
    // desde el panel. Con varios negocios hay que usar el perfil, porque una
    // variable de entorno les cambiaría el catálogo a todos por igual.
    modoCatalogo: modoDelEntorno(),
    condiciones: CONDICIONES_DE_RESPALDO,
    noPuede: [],
    loQueDebeSaber: [],
    fuentes: [],
    configurado: false,
  };

  try {
    // ── 1. Perfil del propio cliente (canónico) ──────────────────────────────
    let perfil: any = null;
    if (tenantId) {
      const [fila] = await db
        .select({
          brandName: tenants.brandName,
          agentName: tenants.agentName,
          metadata: tenants.metadata,
          ajustes: tenants.settings,
        })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (fila) {
        ctx.businessName = textoLimpio(fila.brandName) || "";
        ctx.agentName = textoLimpio(fila.agentName) || "";
        perfil = normalizarMetadata(fila.metadata).businessProfile || null;

        const ajustes = normalizarMetadata(fila.ajustes);
        const wh = ajustes.workingHours;
        if (wh?.enabled) {
          ctx.horario = formatearHorario(wh.start, wh.end, ajustes.timezone);
          if (ctx.horario) ctx.fuentes.push("tenants.settings.workingHours");
        }
      }
    }

    if (perfil && typeof perfil === "object") {
      ctx.descripcion = textoLimpio(perfil.descripcion ?? perfil.description);
      ctx.nicho = textoLimpio(perfil.nicho ?? perfil.niche);
      ctx.cobertura = textoLimpio(perfil.cobertura ?? perfil.coverage);
      ctx.entrega = leerEntrega(perfil.entrega ?? perfil.deliveryInfo);
      ctx.garantia = leerGarantia(perfil.garantia ?? perfil.guaranteeInfo);
      ctx.tono = textoLimpio(perfil.tono);
      ctx.negociaPrecio = perfil.negociaPrecio === true;
      // Tolera lo viejo y lo inventado: `estiloDelNegocio` cae al defecto
      // valor por valor. Este campo lo escribe una IA a pedido del dueño.
      ctx.estiloDeVenta = estiloDelNegocio(perfil);
      ctx.acceso = leerAcceso(perfil.acceso ?? perfil.accessInfo);
      ctx.noPuede = listaLimpia(perfil.noPuede ?? perfil.cannotDo);
      ctx.loQueDebeSaber = listaLimpia(perfil.loQueDebeSaber ?? perfil.mustKnow);
      // "mixto" TAMBIÉN cuenta: el perfil manda sobre `MODO_CATALOGO`, y si
      // el dueño guarda "mixto" para volver a ver los físicos, tiene que
      // ganarle al "digital" del entorno. Antes solo se aceptaban los dos
      // restrictivos y "mixto" caía en silencio al valor del env: el PUT
      // devolvía 200 y el catálogo seguía escondiendo 56 productos (11-09-2026).
      const modo = String(perfil.modoCatalogo || "").toLowerCase();
      if (modo === "digital" || modo === "fisico" || modo === "mixto") ctx.modoCatalogo = modo;
      ctx.condiciones = condicionesDesdePerfil(perfil);
      if (perfil.horario) ctx.horario = textoLimpio(perfil.horario) || ctx.horario;

      const algo =
        ctx.descripcion || ctx.nicho || ctx.entrega || ctx.garantia ||
        ctx.acceso || ctx.noPuede.length > 0 || ctx.loQueDebeSaber.length > 0;
      if (algo) {
        ctx.configurado = true;
        ctx.fuentes.push("tenants.metadata.businessProfile");
      }
    }

    // ── 2. Respaldo global (settings) — NUNCA pisa lo del cliente ────────────
    //
    // Rellena campo por campo, no todo-o-nada. Estaba guardado bajo
    // `if (!ctx.configurado)` y eso tenía un efecto que se vio en vivo el
    // 2026-08-22: apenas el dueño guardó su perfil, el horario de atención
    // que venía del respaldo global DESAPARECIÓ — no porque lo hubiera
    // pisado, sino porque el bloque entero dejó de ejecutarse. Un respaldo
    // que se apaga cuando aparece el primer dato propio no es un respaldo.
    {
      const [s] = await db.select().from(settingsTable).limit(1);
      if (s) {
        const bc = (s.businessConfig as any) || {};
        // Para no atribuirle a `settings` datos que en realidad puso el
        // cliente: la fuente se anota solo si este bloque llenó algo.
        const antes = JSON.stringify([ctx.descripcion, ctx.nicho, ctx.entrega, ctx.garantia, ctx.acceso, ctx.noPuede, ctx.horario]);
        ctx.descripcion = ctx.descripcion || textoLimpio(s.businessDescription);
        ctx.nicho = ctx.nicho || textoLimpio(bc.businessNiche);
        ctx.entrega = ctx.entrega || leerEntrega(bc.deliveryInfo);
        ctx.garantia = ctx.garantia || leerGarantia(bc.guaranteeInfo);
        ctx.acceso = ctx.acceso || leerAcceso(bc.accessInfo);
        if (ctx.noPuede.length === 0) ctx.noPuede = listaLimpia(bc.noPuede);
        if (!ctx.horario) ctx.horario = formatearHorario(s.workingHoursStart, s.workingHoursEnd, s.timezone);
        if (!ctx.businessName) ctx.businessName = textoLimpio(s.businessName) || "";
        const despues = JSON.stringify([ctx.descripcion, ctx.nicho, ctx.entrega, ctx.garantia, ctx.acceso, ctx.noPuede, ctx.horario]);
        if (antes !== despues) ctx.fuentes.push("settings (global)");
      }
    }

    // ── 3. Derivado de lo que vende ─────────────────────────────────────────
    if (!ctx.entrega && tenantId) {
      const filas = await db
        .select({ kind: products.kind, deliveryLink: products.deliveryLink })
        .from(products)
        // ⚠️ Solo los ACTIVOS. Antes miraba el catálogo entero, así que los 56
        // productos físicos desactivados seguían diciéndole al agente que el
        // negocio hace envíos -- y por eso el bot contestaba distinto según el
        // día sobre si vende físico, cuatro rondas de QA seguidas.
        //
        // Apagar un producto tiene que apagarlo en TODAS partes; si no, queda
        // vivo en el único lugar que nadie mira.
        .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)))
        .limit(200);

      const derivado = derivarDeProductos(filas as any[]);
      if (derivado) {
        ctx.entrega = derivado.entrega;
        // Las prohibiciones derivadas se SUMAN a las que escribió el dueño.
        for (const p of derivado.noPuede) if (!ctx.noPuede.includes(p)) ctx.noPuede.push(p);
        ctx.fuentes.push("derivado de products.kind + deliveryLink");
      }
    }
  } catch (err: any) {
    // Modo seguro: sin datos, el agente no afirma nada. Preferimos un agente
    // que dice "lo confirmo y te aviso" a uno que inventa Google Drive.
    logger.warn(
      { err: err?.message || err, tenantId },
      "[BUSINESS-CTX] No se pudo resolver el perfil; se sigue en modo seguro",
    );
  }

  cache.set(key, { ctx, expira: Date.now() + CACHE_MS });
  return aplicarNombres(ctx, opts);
}

/**
 * El nombre del negocio y del agente los resuelve `agent.ts` con su propia
 * lógica (tenant → settings → preset). Si los pasa, mandan ellos: no queremos
 * dos fuentes peleándose por el nombre.
 */
function aplicarNombres(
  ctx: BusinessContext,
  opts?: { businessName?: string | null; agentName?: string | null },
): BusinessContext {
  const businessName = textoLimpio(opts?.businessName) || ctx.businessName || "";
  const agentName = textoLimpio(opts?.agentName) || ctx.agentName || "";
  return { ...ctx, businessName, agentName };
}

// ─── Render para el prompt ────────────────────────────────────────────────────

/**
 * El bloque que leen tanto el prompt de WhatsApp como el de anuncios.
 *
 * Un dato presente se afirma con seguridad. Un dato AUSENTE se convierte en
 * una prohibición explícita: es la diferencia entre un agente que confirma y
 * uno que inventa.
 */
/**
 * Los datos que este negocio NO tiene cargados.
 *
 * Son los que el agente rellenaba de memoria: un plazo de entrega inventado,
 * una garantía que nadie definió. Se extrae acá para que lo use tanto el
 * bloque del negocio como el estado cognitivo, sin duplicar la regla.
 */
/** El modo de catálogo del entorno. Solo vale "digital" o "fisico". */
function modoDelEntorno(): "digital" | "fisico" | "mixto" {
  const m = String(process.env.MODO_CATALOGO || "").trim().toLowerCase();
  return m === "digital" || m === "fisico" ? m : "mixto";
}

export function datosQueFaltan(ctx: BusinessContext | null | undefined): string[] {
  if (!ctx) return [];
  const faltan: string[] = [];
  if (!ctx.entrega) faltan.push("cómo se entrega o cuánto tarda");
  if (!ctx.garantia) faltan.push("si hay garantía o devolución");
  if (!ctx.acceso) faltan.push("por cuánto tiempo dura el acceso");
  return faltan;
}

export function renderBloqueNegocio(ctx: BusinessContext): string {
  const l: string[] = [];
  const quien = ctx.businessName || "este negocio";

  l.push(`\n━━━━━━━━━━━━━━━━━━━━━━━`);
  l.push(`🏢 EL NEGOCIO PARA EL QUE TRABAJÁS`);
  l.push(`━━━━━━━━━━━━━━━━━━━━━━━`);
  l.push(`• Negocio: ${quien}`);
  if (ctx.agentName) l.push(`• Tú eres: ${ctx.agentName}`);
  if (ctx.nicho) l.push(`• Rubro: ${ctx.nicho}`);
  if (ctx.descripcion) l.push(`• Qué hace: ${ctx.descripcion}`);
  if (ctx.cobertura) l.push(`• Alcance: ${ctx.cobertura}`);
  if (ctx.horario) l.push(`• Horario de atención: ${ctx.horario}`);

  // ── Los tres datos que antes se afirmaban de memoria ──────────────────────
  const sinConfirmar: string[] = [];

  if (ctx.entrega) {
    l.push(
      `• Entrega: ${ctx.entrega.metodo} — ${ctx.entrega.plazo}.${ctx.entrega.detalle ? ` ${ctx.entrega.detalle}` : ""}`,
    );
  } else {
    sinConfirmar.push("cómo se entrega o cuánto tarda");
  }

  if (ctx.garantia) {
    l.push(`• Garantía: ${ctx.garantia.descripcion}`);
  } else {
    // Estaba colgado del `else` del TONO: con tono cargado nunca se avisaba
    // que faltaba la garantía, y sin tono se avisaba aunque estuviera.
    sinConfirmar.push("si hay garantía o devolución");
  }
  if (ctx.tono) {
    // El tono va en el bloque del negocio, no en el prompt fijo: es lo que
    // cambia entre una funeraria y una tienda de zapatillas.
    l.push(`• Tono: ${ctx.tono}`);
  }

  // Condiciones de lo que se despacha: solo cuando el negocio las confirmó.
  // Con el respaldo no se escriben acá (el bloque de dropshipping ya las
  // inyecta cuando hay un físico en juego) para no afirmar "contraentrega"
  // a un negocio de servicios que nunca lo dijo.
  if (ctx.condiciones?.fuente === "perfil") {
    const c = ctx.condiciones;
    l.push(`• País: ${c.pais}`);
    l.push(`• Lo que se despacha: ${c.envio.plazo}, ${c.envio.cobertura}. ${fraseCostoEnvio(c)}. ${frasePagoEnvio(c)}.`);
    if (c.agenda) l.push(`• Cómo se agenda un servicio: ${c.agenda}`);
  }

  if (ctx.acceso) {
    l.push(`• Acceso: ${ctx.acceso.tipo}${ctx.acceso.descripcion ? ` — ${ctx.acceso.descripcion}` : ""}`);
  } else {
    sinConfirmar.push("por cuánto tiempo dura el acceso");
  }

  if (ctx.loQueDebeSaber.length > 0) {
    l.push(`\n📌 DATOS DEL NEGOCIO (son ciertos, respondelos con seguridad):`);
    ctx.loQueDebeSaber.forEach((d) => l.push(`  • ${d}`));
  }

  if (ctx.noPuede.length > 0) {
    l.push(`\n🚫 LO QUE ESTE NEGOCIO NO HACE — NUNCA lo prometas:`);
    ctx.noPuede.forEach((d) => l.push(`  ❌ ${d}`));
  }

  if (sinConfirmar.length > 0) {
    l.push(`\n⚠️ DATOS QUE NO TIENES: ${sinConfirmar.join("; ")}.`);
    l.push(`   Si el cliente pregunta por eso, NO lo inventes y NO lo des por supuesto.`);
    l.push(`   Dilo con naturalidad: que lo confirmas y le respondes. Nunca afirmes un plazo,`);
    l.push(`   un método de entrega ni una garantía que no figure arriba.`);
  }

  l.push(`\n🚨 Todo lo que afirmes sobre ${quien} tiene que salir de este bloque o del catálogo.`);
  l.push(`   Si no está acá, no lo sabes.`);

  return l.join("\n");
}

/** Versión de una línea, para logs. */
export function resumenContexto(ctx: BusinessContext): string {
  return [
    ctx.businessName || "sin nombre",
    ctx.configurado ? "configurado" : "SIN configurar",
    `entrega:${ctx.entrega ? ctx.entrega.metodo : "—"}`,
    `garantia:${ctx.garantia ? `${ctx.garantia.dias}d` : "—"}`,
    `noPuede:${ctx.noPuede.length}`,
    `fuentes:[${ctx.fuentes.join(" | ") || "ninguna"}]`,
  ].join(" ");
}
