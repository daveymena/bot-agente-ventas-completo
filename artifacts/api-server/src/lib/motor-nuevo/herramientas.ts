/**
 * HERRAMIENTAS DEL AGENTE
 * =======================
 *
 * La inversión que arregla el problema de fondo:
 *
 *   ANTES: el modelo escribía el mensaje completo (incluido el precio, el
 *          enlace de pago, la promesa de entrega) y después un "supervisor"
 *          con ~40 expresiones regulares intentaba cazar las mentiras.
 *          Cada redacción nueva que la regex no contemplaba pasaba derecho.
 *
 *   AHORA: los HECHOS (precio, ficha, video, medios de pago, entrega) los
 *          emiten estas herramientas leyendo la base de datos. El modelo solo
 *          escribe la parte conversacional. Un modelo no puede inventar un
 *          precio si el precio nunca sale de su texto.
 *
 * Además, las reglas de negocio viven acá, no en el prompt. "No repitas la
 * ficha" deja de ser una instrucción que el modelo puede ignorar y pasa a ser
 * una herramienta que devuelve "ya se la enviaste" y no manda nada.
 *
 * Lo que devuelve cada herramienta es un texto que EXPLICA QUÉ PASÓ: el modelo
 * razona con eso para escribir lo que sigue. No es un "ok".
 */

import {
  registrarEnvio,
  registrarOferta,
  precioDado,
  productoPresentado,
  yaSeEnvio,
  type EstadoConversacion,
  type Oferta,
} from "./estado-conversacion";
import { datosQueFaltan, type GuionDelNegocio } from "./nicho";

export interface Producto {
  id: number;
  name: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  /** Lo que `products.kind` guarda: digital | physical | service. */
  kind?: string | null;
  categoria?: string | null;
  opciones?: string[] | null;
  videoUrl?: string | null;
  disponible?: boolean;
}

/** Lo que el dueño cargó en `product_knowledge`. */
export interface ItemDeConocimiento {
  /** null = vale para todo el catálogo. */
  productId: number | null;
  pregunta: string;
  disparadores: string[];
  /** null = se sabe que lo preguntan y NO hay dato: no se inventa. */
  respuesta: string | null;
}

/**
 * Las partes que se envían por WhatsApp.
 *
 * Es el MISMO formato que ya renderiza `whatsapp.ts` (`text` y `card`). Los
 * campos extra (`yaVioContenido`, `yaSabeElPrecio`…) son los que
 * `construirSeccion` ya sabía usar y que el motor viejo casi nunca le pasaba:
 * acá salen del estado, calculados, sin que el modelo tenga que acordarse.
 */
export type Parte =
  | { kind: "text"; content: string }
  | {
      kind: "card";
      productId: number;
      /** `SeccionFicha` de ficha-parcial.ts: qué pedazo de la ficha va. */
      seccion: Seccion;
      yaVioContenido?: boolean;
      sesionNueva?: boolean;
      videoYaEnviado?: boolean;
      mensajeDelCliente?: string;
      yaSabeElPrecio?: boolean;
    };

export type Seccion =
  | "tienda"
  | "precio"
  | "pago"
  | "pago_transferencia"
  | "pago_link"
  | "info"
  | "entrega"
  | "video"
  | "completa"
  | "ninguna";

/** Efectos que el adaptador aplica DESPUÉS del turno. Mantienen las herramientas puras. */
export type Efecto =
  | { tipo: "pago_reportado"; medio?: string; referencia?: string }
  | { tipo: "escalar"; motivo: string }
  | { tipo: "dato"; campo: string; valor: string };

export interface ContextoHerramientas {
  estado: EstadoConversacion;
  catalogo: Producto[];
  /** Las partes que se van acumulando para enviar al cliente. */
  partes: Parte[];
  /** Conocimiento cargado por el dueño para este negocio. */
  conocimiento: ItemDeConocimiento[];
  /** El guion derivado del negocio (nicho.ts). */
  guion: GuionDelNegocio;
  /** Lo que escribió el cliente en este turno. Va al render de la ficha. */
  mensajeDelCliente: string;
  /** Efectos pendientes de aplicar al terminar el turno. */
  efectos: Efecto[];
}

export interface ResultadoHerramienta {
  ok: boolean;
  /** Texto que lee el modelo. Debe explicar QUÉ pasó para que razone con eso. */
  mensaje: string;
}

const ahora = () => new Date().toISOString();

const nombreDe = (ctx: ContextoHerramientas, id: number) =>
  ctx.catalogo.find((p) => p.id === id)?.name ?? `producto #${id}`;

const N = (t: unknown): string =>
  String(t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/* ═══════════════════════════════════════════════════════════════════════════
 * DEFINICIÓN DE LAS HERRAMIENTAS (formato OpenAI tool calling)
 * ═══════════════════════════════════════════════════════════════════════════ */

export const definicionesDeHerramientas = [
  {
    type: "function" as const,
    function: {
      name: "buscar_en_catalogo",
      description:
        "Busca productos en el catálogo por nombre, tema o palabra clave. Usala cuando el cliente " +
        "mencione algo que querés ubicar, cuando no estés seguro de si existe, o cuando pida algo " +
        "que no aparece en el listado del sistema.",
      parameters: {
        type: "object",
        properties: {
          consulta: { type: "string", description: "Lo que busca el cliente, en sus palabras." },
        },
        required: ["consulta"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "enfocar_producto",
      description:
        "Marca de qué producto están hablando. Llamala apenas quede claro cuál le interesa al cliente. " +
        "Si el cliente cambia de producto, llamala de nuevo con el nuevo.",
      parameters: {
        type: "object",
        properties: { productoId: { type: "number" } },
        required: ["productoId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "mostrar",
      description:
        "Pega una MAQUETA visual (ficha, precio, medios de pago, entrega) debajo de tu texto. " +
        "Vos redactá una frase natural para introducirla (ej. 'Este es el valor:') y el SISTEMA " +
        "escribe los datos duros reales. NUNCA escribas los precios ni repitas los datos en tu texto.",
      parameters: {
        type: "object",
        properties: {
          productoId: { type: "number" },
          seccion: {
            type: "string",
            enum: ["completa", "info", "precio", "pago", "pago_transferencia", "pago_link", "entrega", "video", "tienda"],
            description:
              "completa = ficha entera (solo si nunca la vio); info = qué es y qué incluye; " +
              "precio = el valor; pago = todos los medios; pago_transferencia = solo cuentas; " +
              "pago_link = solo tarjeta/enlace; entrega = cómo y cuándo llega; video = video de muestra; " +
              "tienda = enlace para verlo en la tienda.",
          },
          reenviar: {
            type: "boolean",
            description: "true SOLO si el cliente pidió explícitamente que se lo mandes de nuevo.",
          },
        },
        required: ["productoId", "seccion"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "consultar_conocimiento",
      description:
        "Busca en lo que el DUEÑO del negocio cargó como respuestas (qué incluye, duración, " +
        "garantías, preguntas frecuentes). Usala antes de decir 'no sé' o 'déjame confirmarte'.",
      parameters: {
        type: "object",
        properties: {
          pregunta: { type: "string", description: "La duda del cliente, en sus palabras." },
          productoId: { type: "number", description: "Si la duda es sobre un producto concreto." },
        },
        required: ["pregunta"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "registrar_dato",
      description:
        "Guarda un dato que el cliente dio de sí mismo (nombre, ciudad, dirección, variante, " +
        "qué necesita, cuándo). Se guarda solo: no lo repitas en tu mensaje salvo que aporte.",
      parameters: {
        type: "object",
        properties: {
          campo: {
            type: "string",
            enum: ["nombre", "ciudad", "direccion", "variante", "necesidad", "cuando", "presupuesto", "otro"],
          },
          valor: { type: "string" },
        },
        required: ["campo", "valor"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "que_falta_para_cerrar",
      description:
        "Te dice qué dato le falta a este negocio para poder concretar la venta. Usala cuando el " +
        "cliente ya quiere comprar: así pedís lo justo y no parecés un formulario.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "registrar_pago_reportado",
      description:
        "Llamala cuando el cliente diga que ya pagó o mande un comprobante. Deja el caso marcado " +
        "para que una persona lo verifique. NO confirma el pago: vos nunca podés dar un pago por " +
        "confirmado, eso lo hace una persona del equipo.",
      parameters: {
        type: "object",
        properties: {
          medio: { type: "string", description: "Por dónde dice que pagó, si lo dijo." },
          referencia: { type: "string", description: "Número de referencia, si lo mandó." },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "escalar_a_humano",
      description:
        "Pasa la conversación a una persona del equipo. Usala si el cliente se queja en serio, pide " +
        "hablar con alguien, reclama un reembolso, o si algo se sale de lo que podés resolver.",
      parameters: {
        type: "object",
        properties: { motivo: { type: "string" } },
        required: ["motivo"],
      },
    },
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
 * IMPLEMENTACIÓN
 * ═══════════════════════════════════════════════════════════════════════════ */

export type Ejecutor = (
  ctx: ContextoHerramientas,
  args: any,
) => Promise<ResultadoHerramienta> | ResultadoHerramienta;

/**
 * Búsqueda por palabras distintivas (IDF).
 *
 * Una palabra que aparece en casi todo el catálogo no distingue nada: con un
 * catálogo de cursos, "curso" no dice cuál quiere el cliente. Sin esto, "curso
 * de soldadura" devolvía piano e inglés y el bot ofrecía cualquier cosa con
 * seguridad. Medido en el motor viejo el 13-09-2026.
 */
export function puntuarCoincidencias(consulta: string, catalogo: Producto[], limite = 5) {
  const disponibles = catalogo.filter((p) => p.disponible !== false);
  const palabras = N(consulta)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length > 2);

  const textos = disponibles.map((p) => N(`${p.name} ${p.description || ""} ${p.categoria || ""} ${(p.opciones || []).join(" ")}`));

  const peso = (w: string) => {
    const enCuantos = textos.filter((t) => t.includes(w)).length;
    if (enCuantos === 0) return 0;
    const frecuencia = enCuantos / Math.max(1, disponibles.length);
    if (disponibles.length >= 3 && frecuencia >= 0.5) return 0; // palabra de categoría
    return Math.log(1 / frecuencia);
  };

  return disponibles
    .map((p, i) => ({
      p,
      puntos: palabras.reduce((n, w) => n + (textos[i].includes(w) ? peso(w) : 0), 0),
    }))
    .filter((x) => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, limite);
}

export const ejecutores: Record<string, Ejecutor> = {
  buscar_en_catalogo(ctx, { consulta }) {
    if (!String(consulta || "").trim()) {
      return {
        ok: false,
        mensaje: `No busqué nada porque no me dijiste qué. El catálogo tiene ${
          ctx.catalogo.filter((p) => p.disponible !== false).length
        } productos.`,
      };
    }

    const puntuados = puntuarCoincidencias(String(consulta), ctx.catalogo);

    if (!puntuados.length) {
      return {
        ok: true,
        mensaje:
          `No hay nada en el catálogo que coincida con "${consulta}". ` +
          `Lo que SÍ hay: ${ctx.catalogo
            .filter((p) => p.disponible !== false)
            .slice(0, 12)
            .map((p) => `#${p.id} ${p.name}`)
            .join(", ")}. ` +
          `Decile con naturalidad que ese no lo manejás y ofrecele lo que sí hay. Nunca inventes un producto.`,
      };
    }

    return {
      ok: true,
      mensaje: puntuados
        .map(({ p }) => {
          const precio = p.price != null && p.price > 0 ? ` · ${p.currency || "COP"} ${p.price.toLocaleString("es-CO")}` : "";
          const opts = p.opciones?.length ? ` · Variantes: ${p.opciones.join(", ")}` : "";
          return `#${p.id} · ${p.name}${precio}${opts}`;
        })
        .join("\n"),
    };
  },

  enfocar_producto(ctx, { productoId }) {
    const p = ctx.catalogo.find((x) => x.id === Number(productoId));
    if (!p) return { ok: false, mensaje: `No existe el producto #${productoId}. Buscá en el catálogo primero.` };

    const anterior = ctx.estado.productoEnFoco;
    ctx.estado.productoEnFoco = p.id;
    if (ctx.estado.etapa === "saludo" || ctx.estado.etapa === "explorando") {
      ctx.estado.etapa = "producto_en_foco";
    }

    if (anterior && anterior !== p.id) {
      return {
        ok: true,
        mensaje:
          `Cambiaste el foco de ${nombreDe(ctx, anterior)} a ${p.name}. ` +
          `Ojo: lo que ya le dijiste del producto anterior no vale para este.`,
      };
    }
    return { ok: true, mensaje: `Producto en foco: ${p.name}.` };
  },

  mostrar(ctx, { productoId, seccion, reenviar }) {
    const p = ctx.catalogo.find((x) => x.id === Number(productoId));
    if (!p) return { ok: false, mensaje: `No existe el producto #${productoId}.` };

    const sec = String(seccion || "completa") as Seccion;
    const yaVio = yaSeEnvio(ctx.estado, p.id, sec);

    // La regla que antes era una instrucción en el prompt (y que el modelo se
    // saltaba) ahora es imposible de saltar: la herramienta no manda nada.
    if (yaVio && !reenviar) {
      return {
        ok: false,
        mensaje:
          `NO se envió: ya le mandaste "${seccion}" de ${p.name}. ` +
          `Retomá en una línea en vez de repetirlo. ` +
          `Si te pidió puntualmente que se lo reenvíes, llamá de nuevo con reenviar=true.`,
      };
    }

    // ── No cobrar sin antes decir cuánto cuesta ────────────────────────────
    if ((sec === "pago" || sec === "pago_link" || sec === "pago_transferencia") && !precioDado(ctx.estado, p.id)) {
      return {
        ok: false,
        mensaje:
          `NO se envió: todavía no le dijiste cuánto cuesta ${p.name}. ` +
          `En WhatsApp, mandar un enlace de pago sin decir el precio se lee como estafa. ` +
          `Dale el precio primero con mostrar(seccion="precio").`,
      };
    }

    // ── Entrega: solo si el negocio la tiene cargada ───────────────────────
    if (sec === "entrega" && !ctx.guion.hechos.some((h) => h.startsWith("Entrega:"))) {
      return {
        ok: false,
        mensaje:
          `NO se envió: este negocio no cargó cómo entrega ni en qué plazo. ` +
          `No inventes un plazo ni una transportadora: decile que lo confirmás y le pasás el dato. ` +
          `Si insiste, escalá a humano.`,
      };
    }

    // ── Video: solo si existe ──────────────────────────────────────────────
    if (sec === "video" && !p.videoUrl) {
      return { ok: false, mensaje: `${p.name} no tiene video cargado. Seguí sin ofrecerle video.` };
    }

    ctx.partes.push({
      kind: "card",
      productId: p.id,
      seccion: sec,
      // Lo que el render ya sabía usar y el motor viejo casi nunca le pasaba.
      // Acá sale del estado, sin depender de que el modelo se acuerde.
      yaVioContenido: productoPresentado(ctx.estado, p.id),
      sesionNueva: ctx.estado.turnos === 0,
      videoYaEnviado: yaSeEnvio(ctx.estado, p.id, "video"),
      mensajeDelCliente: ctx.mensajeDelCliente,
      yaSabeElPrecio: precioDado(ctx.estado, p.id),
    });

    registrarEnvio(ctx.estado, p.id, sec);
    if (ctx.estado.productoEnFoco !== p.id) ctx.estado.productoEnFoco = p.id;

    const resumen: Record<string, string> = {
      precio: `el precio de ${p.name}${p.price ? ` (${p.currency || "COP"} ${p.price.toLocaleString("es-CO")})` : ""}`,
      pago: `los medios de pago de ${p.name}`,
      pago_link: `el enlace para pagar con tarjeta ${p.name}`,
      pago_transferencia: `las cuentas de transferencia de ${p.name}`,
      info: `qué incluye ${p.name}`,
      completa: `la ficha completa de ${p.name}`,
      entrega: `cómo se entrega ${p.name}`,
      video: `el video de ${p.name}`,
      tienda: `el enlace de la tienda de ${p.name}`,
    };
    registrarOferta(ctx.estado, {
      tipo: tipoDeOferta(sec),
      productoId: p.id,
      resumen: resumen[sec] || `información de ${p.name}`,
    });

    if (sec === "precio") ctx.estado.etapa = "precio_dado";
    if (sec.startsWith("pago")) ctx.estado.etapa = "cierre";

    return {
      ok: true,
      mensaje:
        `Se envió "${seccion}" de ${p.name}. Los datos (precio, cuentas, enlaces) los puso el sistema: ` +
        `no los repitas en tu texto. Seguí con lo que sigue naturalmente.`,
    };
  },

  consultar_conocimiento(ctx, { pregunta, productoId }) {
    const q = N(pregunta);
    const palabras = q.split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2);
    if (!palabras.length) return { ok: false, mensaje: "No entendí qué preguntarle al conocimiento del negocio." };

    const enFoco = Number(productoId) || ctx.estado.productoEnFoco;
    const relevantes = ctx.conocimiento.filter(
      (k) => k.productId == null || k.productId === enFoco || k.productId === Number(productoId),
    );

    let mejor: { item: ItemDeConocimiento; puntos: number } | null = null;
    for (const item of relevantes) {
      const texto = N(`${item.pregunta} ${item.disparadores.join(" ")}`);
      const puntos = palabras.reduce((n, w) => n + (texto.includes(w) ? 1 : 0), 0);
      if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { item, puntos };
    }

    if (!mejor) {
      return {
        ok: true,
        mensaje:
          `El dueño no cargó nada sobre "${pregunta}". ` +
          `No inventes: decile que lo confirmás con el equipo y le respondés.`,
      };
    }

    if (!mejor.item.respuesta) {
      return {
        ok: true,
        mensaje:
          `El dueño cargó que los clientes preguntan "${mejor.item.pregunta}" pero NO dejó respuesta. ` +
          `Está marcado como sin dato: decile que lo confirmás. No inventes.`,
      };
    }

    return {
      ok: true,
      mensaje: `Respuesta cargada por el dueño para "${mejor.item.pregunta}": ${mejor.item.respuesta}`,
    };
  },

  registrar_dato(ctx, { campo, valor }) {
    const c = String(campo || "otro");
    const v = String(valor || "").trim();
    if (!v) return { ok: false, mensaje: "No guardé nada: el valor venía vacío." };

    ctx.estado.datos[c as keyof EstadoConversacion["datos"]] = v;
    ctx.efectos.push({ tipo: "dato", campo: c, valor: v });
    return { ok: true, mensaje: `Guardado (${c}: ${v}). No lo repitas en tu mensaje salvo que aporte.` };
  },

  que_falta_para_cerrar(ctx) {
    const faltan = datosQueFaltan(ctx.guion.calificacion, ctx.estado.datos as Record<string, string>);
    if (!faltan.length) {
      return { ok: true, mensaje: "No falta ningún dato: podés cerrar. Pedile la confirmación y mandale los medios de pago." };
    }
    return {
      ok: true,
      mensaje:
        `Para poder concretar falta: ${faltan.map((d) => `${d.campo} (${d.porque})`).join("; ")}. ` +
        `Pedí UNO por mensaje, y siempre DESPUÉS de contestar lo que el cliente acaba de decir. ` +
        `Nunca los pidas todos juntos: en WhatsApp eso se lee como un formulario.`,
    };
  },

  registrar_pago_reportado(ctx, { medio, referencia }) {
    ctx.estado.comprobanteRecibido = true;
    ctx.estado.etapa = "postventa";
    ctx.efectos.push({ tipo: "pago_reportado", medio, referencia });
    return {
      ok: true,
      mensaje:
        "Quedó marcado para que una persona lo verifique. " +
        "IMPORTANTE: no le digas que el pago está confirmado ni que ya lo verificaste — no lo está. " +
        "Decile que ya está en verificación y que en cuanto quede confirmado le llega el acceso. " +
        "No prometas un tiempo exacto.",
    };
  },

  escalar_a_humano(ctx, { motivo }) {
    ctx.estado.etapa = "escalado";
    ctx.estado.escalado = { motivo: String(motivo || "sin motivo"), at: ahora() };
    ctx.efectos.push({ tipo: "escalar", motivo: String(motivo || "sin motivo") });
    return {
      ok: true,
      mensaje:
        `Escalado registrado (${motivo}). Decile en una línea que ya le pasás el caso a alguien del ` +
        `equipo, sin prometer tiempos exactos.`,
    };
  },
};

function tipoDeOferta(seccion: Seccion): Oferta["tipo"] {
  if (seccion === "precio") return "precio";
  if (seccion.startsWith("pago")) return "datos_de_pago";
  if (seccion === "video") return "video";
  if (seccion === "entrega") return "entrega";
  if (seccion === "info" || seccion === "completa") return "ficha";
  return "pregunta";
}
