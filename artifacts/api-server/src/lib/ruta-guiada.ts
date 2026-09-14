/**
 * ── Rutas guiadas: Atlas lleva la conversación ──────────────────────────
 *
 * Pedido del dueño (14-09-2026): "siento que debo estar guiando a Atlas
 * cuando debería ser él quien guíe a un cliente que no sabe ni anunciar".
 *
 * Una ruta es una secuencia FIJA de pasos que el servidor conoce y hace
 * avanzar. En cada paso Atlas entrega una cosa y cierra con UNA pregunta de
 * sí/no. Cuando el admin dice que sí, el SERVIDOR ejecuta el paso siguiente
 * (investiga, crea la landing, escribe el anuncio) y el modelo solo lo
 * presenta. Así el cliente nunca tiene que saber qué pedir ni qué viene
 * después, y lo que pasa no depende de que el modelo se acuerde de hacerlo.
 *
 * El estado vive por sesión de chat en architect_memory (memoryType
 * "instruction", title "ruta_guiada"): sobrevive reinicios y no se mezcla
 * con el historial ("observation") ni con el plan pendiente ("decision").
 *
 * El modelo se comunica con el servidor con un marcador al final de su
 * texto, `[[ruta: productoId=168; angulo=…]]`, que nunca llega al admin.
 */
import { and, desc, eq } from "drizzle-orm";
import { db, architectMemory } from "@workspace/db";
import { logger } from "./logger";
import { isApproval, isRejection } from "./architect-store";
import { executeAction, investigacionRapida, type OperatorContext } from "./app-operator";

export type RutaId = "producto-nuevo";

export interface EstadoDeRuta {
  ruta: RutaId;
  /** 1..N. */
  paso: number;
  /** true cuando Atlas ya propuso el paso y espera el sí/no del admin. */
  esperando: boolean;
  productoId?: number;
  producto?: string;
  angulo?: string;
  landingId?: number;
  landingUrl?: string;
  draftId?: number;
  campaignId?: string;
  iniciadaEn: string;
}

interface Paso {
  nombre: string;
  /**
   * En este paso el modelo NO propone acciones: lo que había que hacer ya lo
   * hizo el servidor. Sin esto, en el paso del anuncio proponía "landing_publicar"
   * sobre una landing que ya estaba publicada (visto en la prueba del 14-09).
   */
  sinAcciones?: boolean;
  /** Palabras que hacen que el selector de herramientas cargue las de este paso. */
  pedido: string;
  /** La pregunta con la que Atlas cierra el paso si él no la escribió. */
  pregunta: (e: EstadoDeRuta) => string;
  /** Instrucción para el modelo en este turno. */
  instruccion: (e: EstadoDeRuta, entrada: string) => string;
  /**
   * Lo que el servidor hace al ENTRAR al paso (después del sí del admin).
   * Devuelve texto para el modelo con el resultado real, y puede completar
   * el estado (ids, urls).
   */
  alEntrar?: (e: EstadoDeRuta, ctx: OperatorContext, avisar: (m: string) => void) => Promise<string>;
}

const PRESUPUESTO_DIARIO_POR_DEFECTO = 20_000;

/**
 * Ruta "Vender un producto nuevo": elegir → competencia → página → anuncio → seguimiento.
 */
const PRODUCTO_NUEVO: Paso[] = [
  {
    nombre: "Elegir el producto",
    sinAcciones: true,
    pedido: "productos catálogo",
    pregunta: (e) => e.producto ? `¿Arrancamos con **${e.producto}**?` : "¿Con cuál arrancamos?",
    instruccion: (e) =>
      `Objetivo del paso: elegir UN producto para vender. Mirá el catálogo (list_products) y RECOMENDÁ uno vos: ` +
      `un físico con foto y precio, sin campaña activa; si el admin ya nombró uno, ese. Explicá en 2 líneas por qué ese ` +
      `(sin tecnicismos). No le des la lista entera ni le pidas que elija entre 16: proponé uno y, como mucho, una alternativa. ` +
      `Al final escribí el marcador con tu recomendación: [[ruta: productoId=ID; producto=NOMBRE]]. ` +
      `Cerrá con la pregunta "¿Arrancamos con ese?".` +
      (e.producto ? ` El admin ya tenía propuesto "${e.producto}" (id ${e.productoId}); si no lo quiere, proponé otro distinto.` : ""),
  },
  {
    nombre: "Ver qué hace la competencia",
    sinAcciones: true,
    pedido: "investigá la competencia biblioteca de anuncios web",
    pregunta: () => "¿Armo la página de venta con este ángulo?",
    instruccion: () =>
      `Objetivo del paso: contarle al admin, en lenguaje de dueño de negocio, qué está haciendo la competencia con este producto. ` +
      `Usá SOLO la investigación real que te pasa el sistema abajo (nada de datos de su cuenta). Entregá: quién lo anuncia, ` +
      `desde cuándo, el gancho que repiten, y UN ángulo recomendado para él (una frase). Máximo 8 líneas. ` +
      `Al final escribí el marcador: [[ruta: angulo=EL ÁNGULO EN UNA FRASE]]. Cerrá con la pregunta "¿Armo la página de venta con este ángulo?".`,
    alEntrar: async (e, ctx, avisar) => {
      if (!e.producto) return "[SISTEMA] No hay producto elegido: volvé a proponer uno.";
      avisar(`Investigando qué hace la competencia con ${e.producto}...`);
      const r = await investigacionRapida(ctx, `anuncios activos y competencia de "${e.producto}" en Colombia: quién lo vende, precio, gancho`, 25_000);
      return r.ok
        ? `[SISTEMA] Investigación REAL hecha por el servidor (fuentes incluidas). Usala tal cual, no prometas investigar:\n${r.texto.slice(0, 6000)}`
        : `[SISTEMA] La investigación externa no devolvió datos (${r.motivo.slice(0, 200)}). Decíselo con honestidad, proponé un ángulo con lo que se sabe del producto y seguí.`;
    },
  },
  {
    nombre: "La página de venta",
    sinAcciones: true,
    pedido: "landing página de venta",
    pregunta: () => "¿La publico y seguimos con el anuncio?",
    instruccion: (e) =>
      `Objetivo del paso: mostrarle la página de venta que el sistema YA creó (abajo está el resultado real). ` +
      `Contale en 3 líneas qué tiene (dolor → solución → pedido contraentrega o pago) y dale el enlace de vista previa si viene. ` +
      `No la vuelvas a crear ni propongas acciones (nada de propose_action): ya está creada. No escribas el encabezado "Paso N de N", lo pone el sistema. Cerrá con la pregunta "¿La publico y seguimos con el anuncio?".` +
      (e.landingId ? ` La landing es la [${e.landingId}].` : ""),
    alEntrar: async (e, ctx, avisar) => {
      if (!e.productoId) return "[SISTEMA] No hay producto elegido.";
      avisar("Armando la página de venta...");
      const r = await executeAction("landing_crear", { productId: e.productoId, objetivo: "ventas" }, ctx);
      if (!r.ok) return `[SISTEMA] La página de venta NO se pudo crear: ${r.summary}. Decíselo y ofrecé reintentar.`;
      e.landingId = Number((r as any).data?.id) || undefined;
      return `[SISTEMA] Página de venta creada por el servidor (borrador): ${r.summary}${e.landingId ? `\nVista previa en el panel: Landing Studio → landing ${e.landingId}.` : ""}`;
    },
  },
  {
    nombre: "El anuncio",
    sinAcciones: true,
    pedido: "anuncio campaña facebook",
    pregunta: () => `¿Lo subo a tu cuenta de Facebook con $${PRESUPUESTO_DIARIO_POR_DEFECTO.toLocaleString("es-CO")} por día? Queda en pausa: no gasta hasta que vos lo actives.`,
    instruccion: () =>
      `Objetivo del paso: mostrarle el anuncio que el sistema YA escribió (abajo está el resultado real): el título, el texto y a dónde lleva. ` +
      `Si la página quedó publicada, dale el enlace público tal cual. ` +
      `NO propongas ni llames ninguna acción (ni landing_publicar ni propose_action): la página ya está publicada y el anuncio ya está escrito. ` +
      `Decile el presupuesto sugerido para probar (${PRESUPUESTO_DIARIO_POR_DEFECTO.toLocaleString("es-CO")} pesos por día, se puede cambiar) sin preguntarle cifras. ` +
      `No lo vuelvas a crear. Cerrá con la pregunta "¿Lo subo a tu cuenta de Facebook con ese presupuesto? Queda en pausa, no gasta hasta que lo actives".`,
    alEntrar: async (e, ctx, avisar) => {
      if (!e.producto) return "[SISTEMA] No hay producto elegido.";
      const partes: string[] = [];
      if (e.landingId) {
        avisar("Publicando la página de venta...");
        const p = await executeAction("landing_publicar", { id: e.landingId, publicada: true }, ctx);
        if (p.ok) {
          e.landingUrl = String((p as any).data?.url || "");
          partes.push(`Página publicada: ${e.landingUrl || p.summary}`);
        } else {
          partes.push(`La página no se pudo publicar (${p.summary}); el anuncio puede llevar a WhatsApp.`);
        }
      }
      avisar("Escribiendo el anuncio...");
      const a = await executeAction("crear_anuncio", { producto: e.producto, dailyBudget: PRESUPUESTO_DIARIO_POR_DEFECTO, objetivo: "mensajes" }, ctx);
      if (!a.ok) return `[SISTEMA] ${partes.join(" ")}\nEl anuncio NO se pudo escribir: ${a.summary}. Decíselo y ofrecé reintentar.`;
      e.draftId = Number((a as any).data?.draftId) || Number((a as any).data?.id) || undefined;
      return `[SISTEMA] ${partes.join(" ")}\nAnuncio creado por el servidor (borrador${e.draftId ? ` ${e.draftId}` : ""}):\n${a.summary.slice(0, 3000)}`;
    },
  },
  {
    nombre: "Activar y seguir",
    pedido: "publicar activar anuncio meta campaña",
    pregunta: (e) => e.campaignId ? "¿Lo activo ahora para que empiece a mostrarse?" : "¿Querés que lo intente de nuevo?",
    instruccion: (e) =>
      `Objetivo del paso: cerrar. ` +
      (e.campaignId
        ? `El anuncio YA está en su cuenta de Meta, en PAUSA (campaña ${e.campaignId}): no gasta nada todavía. Decíselo en una línea. ` +
          `Activarlo sí gasta plata: proponelo con propose_action → fb_resume_campaign { "campaignId": "${e.campaignId}" } (una sola acción). `
        : `El anuncio NO se pudo subir a Meta (abajo está el motivo real). Explicáselo en lenguaje simple y decile qué hacer (por ejemplo conectar Facebook en Configuración o poner un método de pago en Ads Manager); no propongas acciones. `) +
      `Después, en 3 líneas sin tecnicismos: qué va a ver en 3 días (cuánta gente escribió, cuánto costó cada mensaje) y cuándo conviene apagar o subir el presupuesto. ` +
      `Cerrá con UNA sola pregunta: ${e.campaignId ? '"¿Lo activo ahora?"' : '"¿Querés que lo intente de nuevo?"'}. Escribí el marcador [[ruta: fin]].`,
    alEntrar: async (e, ctx, avisar) => {
      if (!e.draftId) return "[SISTEMA] No hay borrador de anuncio guardado (el paso anterior no lo creó).";
      avisar("Subiendo el anuncio a tu cuenta de Facebook (en pausa)...");
      // En PAUSA no gasta: por eso lo hace el servidor con el sí del paso 4.
      // Activarlo es lo que gasta, y eso va por propose_action.
      const r = await executeAction("fb_upload_draft_to_meta", { draftId: e.draftId, objetivo: "mensajes" }, ctx);
      if (!r.ok) return `[SISTEMA] La subida a Meta falló: ${r.summary}`;
      e.campaignId = String(r.summary).match(/campaña\s+([\w-]+)/)?.[1] || undefined;
      return `[SISTEMA] Subido a Meta en pausa: ${r.summary}`;
    },
  },
];

const RUTAS: Record<RutaId, { nombre: string; pasos: Paso[] }> = {
  "producto-nuevo": { nombre: "Vender un producto nuevo", pasos: PRODUCTO_NUEVO },
};

// ── Estado por sesión ────────────────────────────────────────────────────

const TITULO = "ruta_guiada";

export async function cargarRuta(tenantId: number, sessionId: string): Promise<EstadoDeRuta | null> {
  try {
    const [row] = await db
      .select()
      .from(architectMemory)
      .where(and(eq(architectMemory.tenantId, tenantId), eq(architectMemory.sessionId, sessionId), eq(architectMemory.memoryType, "instruction"), eq(architectMemory.title, TITULO)))
      .orderBy(desc(architectMemory.createdAt))
      .limit(1);
    if (!row) return null;
    const e = JSON.parse(row.content) as EstadoDeRuta;
    return e && RUTAS[e.ruta] ? e : null;
  } catch (err) {
    logger.warn({ err, tenantId, sessionId }, "[Ruta] No se pudo leer el estado de la ruta");
    return null;
  }
}

export async function guardarRuta(tenantId: number, sessionId: string, e: EstadoDeRuta): Promise<void> {
  await cerrarRuta(tenantId, sessionId);
  await db.insert(architectMemory).values({
    tenantId,
    sessionId,
    memoryType: "instruction",
    title: TITULO,
    content: JSON.stringify(e),
    tags: ["ruta_guiada"],
    metadata: { ruta: e.ruta, paso: e.paso },
  });
}

export async function cerrarRuta(tenantId: number, sessionId: string): Promise<void> {
  await db
    .delete(architectMemory)
    .where(and(eq(architectMemory.tenantId, tenantId), eq(architectMemory.sessionId, sessionId), eq(architectMemory.memoryType, "instruction"), eq(architectMemory.title, TITULO)));
}

// ── Detección ────────────────────────────────────────────────────────────

const INICIO_PRODUCTO_NUEVO = /\b(vender\s+(un\s+)?(producto\s+)?nuevo|producto\s+nuevo|nuevo\s+producto|quiero\s+(empezar\s+a\s+)?vender|empezar\s+a\s+vender|lanzar\s+(un\s+)?producto|no\s+s[eé]\s+por\s+d[oó]nde\s+empezar|por\s+d[oó]nde\s+empiezo|ay[uú]dame\s+a\s+vender)\b/i;
const SALIDA = /\b(sal[ií]\s+de\s+la\s+ruta|cancel[aá]\s+(la\s+)?ruta|dejemos\s+(esto|la\s+ruta)|olvid[aá]lo|par[aá]\s+la\s+ruta|no\s+sigamos)\b/i;

export function detectarInicioDeRuta(prompt: string): RutaId | null {
  return INICIO_PRODUCTO_NUEVO.test(String(prompt || "")) ? "producto-nuevo" : null;
}

export function pideSalirDeRuta(prompt: string): boolean {
  return SALIDA.test(String(prompt || ""));
}

// ── Marcador del modelo ──────────────────────────────────────────────────

const MARCADOR_RUTA = /\[\[\s*ruta\s*:\s*([^\]]*)\]\]/gi;

export function avanceQueDeclara(texto: string): { campos: Record<string, string>; fin: boolean; textoLimpio: string } {
  const campos: Record<string, string> = {};
  let fin = false;
  const limpio = String(texto || "").replace(MARCADOR_RUTA, (_m, lista: string) => {
    for (const par of lista.split(";")) {
      const [k, ...v] = par.split("=");
      const clave = String(k || "").trim().toLowerCase();
      const valor = v.join("=").trim();
      if (clave === "fin") fin = true;
      else if (clave && valor) campos[clave] = valor.slice(0, 300);
    }
    return "";
  }).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { campos, fin, textoLimpio: limpio };
}

// ── El turno ─────────────────────────────────────────────────────────────

export interface RutaEnTurno {
  estado: EstadoDeRuta;
  paso: Paso;
  total: number;
  /** Lo que se suma al pedido para que el selector cargue las herramientas del paso. */
  pedidoExtra: string;
  /** Instrucción [SISTEMA] para el modelo, con el resultado real del paso si el servidor lo ejecutó. */
  instruccion: string;
  /** El servidor investigó en este turno (para que el guardián de "investigué" no lo desmienta). */
  investigo: boolean;
}

/**
 * Antes de hablarle al modelo: arranca, avanza o sigue la ruta según lo que
 * dijo el admin, y ejecuta lo que le toca al servidor en el paso nuevo.
 */
export async function prepararRuta(o: {
  tenantId: number;
  sessionId: string;
  prompt: string;
  ctx: OperatorContext;
  avisar: (m: string) => void;
}): Promise<RutaEnTurno | null> {
  const prompt = String(o.prompt || "");
  let estado = await cargarRuta(o.tenantId, o.sessionId);

  if (estado && pideSalirDeRuta(prompt)) {
    await cerrarRuta(o.tenantId, o.sessionId);
    return null;
  }

  const inicio = detectarInicioDeRuta(prompt);
  if (inicio && (!estado || estado.ruta !== inicio)) {
    estado = { ruta: inicio, paso: 1, esperando: false, iniciadaEn: new Date().toISOString() };
    await guardarRuta(o.tenantId, o.sessionId, estado);
    logger.info({ tenantId: o.tenantId, sessionId: o.sessionId, ruta: inicio }, "[Ruta] Ruta iniciada");
  }
  if (!estado) return null;

  const def = RUTAS[estado.ruta];
  let entrada = "";
  let investigo = false;

  if (estado.esperando && isApproval(prompt) && estado.paso < def.pasos.length) {
    // El admin dijo que sí: el SERVIDOR hace el paso siguiente.
    estado.paso += 1;
    estado.esperando = false;
    const paso = def.pasos[estado.paso - 1];
    if (paso.alEntrar) {
      try {
        entrada = await paso.alEntrar(estado, o.ctx, o.avisar);
        investigo = estado.paso === 2 && /Investigación REAL/.test(entrada);
      } catch (e: any) {
        logger.warn({ err: e?.message, paso: estado.paso }, "[Ruta] Falló lo que el servidor hace al entrar al paso");
        entrada = `[SISTEMA] Este paso no se pudo preparar (${e?.message || e}). Decíselo al admin con honestidad y ofrecé reintentar.`;
      }
    }
    await guardarRuta(o.tenantId, o.sessionId, estado);
  } else if (estado.esperando && isRejection(prompt)) {
    entrada = "[SISTEMA] El admin NO quiere esa propuesta. Proponé otra distinta para este mismo paso, sin repetir la anterior.";
  }

  const paso = def.pasos[estado.paso - 1];
  const instruccion =
    `\n\n[SISTEMA] RUTA GUIADA "${def.nombre}" — paso ${estado.paso} de ${def.pasos.length}: ${paso.nombre}. ` +
    `Vos llevás la conversación: entregá este paso completo y cerrá SIEMPRE con UNA pregunta de sí/no ofreciendo el siguiente. ` +
    `No escribas el encabezado "Paso N de N" (lo pone el sistema). ` +
    `Nada de "decime qué querés": decidí vos y proponé. Lenguaje de dueño de negocio, sin tecnicismos. ` +
    paso.instruccion(estado, entrada) +
    (entrada ? `\n\n${entrada}` : "");

  return { estado, paso, total: def.pasos.length, pedidoExtra: paso.pedido, instruccion, investigo };
}

const TERMINA_PREGUNTANDO = /\?\s*(\*+)?\s*$/;
/** El encabezado que pone el sistema; si el modelo lo copió del historial, se quita para no duplicarlo. */
const ENCABEZADO_DE_PASO = /^\s*\**\s*Paso\s+\d+\s+de\s+\d+\s*[·:\-–]\s*[^\n]*\**\s*\n+/i;

/**
 * Después del modelo: guarda lo que declaró, quita el marcador, pone el
 * encabezado del paso y garantiza que termina proponiendo el siguiente.
 */
export async function cerrarTurnoDeRuta(o: {
  tenantId: number;
  sessionId: string;
  ruta: RutaEnTurno;
  texto: string;
}): Promise<string> {
  const { estado, paso, total } = o.ruta;
  const decl = avanceQueDeclara(o.texto);
  const c = decl.campos;
  if (c.productoid && Number(c.productoid) > 0) estado.productoId = Number(c.productoid);
  if (c.producto) estado.producto = c.producto;
  if (c.angulo) estado.angulo = c.angulo;
  if (c.landingid && Number(c.landingid) > 0) estado.landingId = Number(c.landingid);

  let texto = decl.textoLimpio.replace(ENCABEZADO_DE_PASO, "").replace(ENCABEZADO_DE_PASO, "");
  // Basta con que el cierre (últimas líneas) tenga una pregunta: el modelo a
  // veces la escribe y remata con una frase ("…hasta que lo actives.").
  const cierre = texto.slice(-240);
  if (!TERMINA_PREGUNTANDO.test(texto) && !/\?/.test(cierre)) {
    texto = `${texto}\n\n${paso.pregunta(estado)}`;
  }
  texto = `**Paso ${estado.paso} de ${total} · ${paso.nombre}**\n\n${texto}`;

  if (decl.fin || (estado.paso >= total)) {
    await cerrarRuta(o.tenantId, o.sessionId);
    logger.info({ tenantId: o.tenantId, sessionId: o.sessionId }, "[Ruta] Ruta terminada");
  } else {
    estado.esperando = true;
    await guardarRuta(o.tenantId, o.sessionId, estado);
  }
  return texto;
}

/** Para la pantalla: el saludo con las metas que Atlas sabe guiar. */
export const METAS_DE_INICIO = [
  { id: "producto-nuevo", texto: "🚀 Vender un producto nuevo", mensaje: "Quiero vender un producto nuevo" },
  { id: "vender-mas", texto: "📈 Vender más de lo que ya tengo", mensaje: "Ayúdame a vender más de un producto que ya tengo" },
  { id: "empezar", texto: "🧭 No sé por dónde empezar", mensaje: "No sé por dónde empezar" },
];
