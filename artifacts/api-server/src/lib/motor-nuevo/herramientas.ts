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
 *   AHORA: los HECHOS (precio, ficha, video, enlaces de pago) los emiten
 *          estas herramientas leyendo la base de datos. El modelo solo escribe
 *          la parte conversacional. Un modelo no puede inventar un precio si
 *          el precio nunca sale de su texto.
 *
 * Además, las reglas de negocio viven acá, no en el prompt. "No repitas la
 * ficha" deja de ser una instrucción que el modelo puede ignorar y pasa a ser
 * una herramienta que devuelve "ya se la enviaste el martes" y no manda nada.
 */

import type { EstadoConversacion, Oferta } from "./estado-conversacion";

export interface Producto {
  id: number;
  name: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  videoUrl: string | null;
  paymentUrl: string | null;
  disponible: boolean;
}

/** Lo que el motor termina enviando por WhatsApp. Mismo formato de `parts` que ya usa whatsapp.ts. */
export type Parte =
  | { kind: "text"; content: string }
  | { kind: "card"; productId: number; seccion: string }
  | { kind: "video"; productId: number; url: string }
  | { kind: "payment"; productId: number; url: string };

export interface ContextoHerramientas {
  estado: EstadoConversacion;
  catalogo: Producto[];
  /** Las partes que se van acumulando para enviar al cliente. */
  partes: Parte[];
}

/** Resultado que se le devuelve al modelo tras ejecutar una herramienta. */
export interface ResultadoHerramienta {
  ok: boolean;
  /** Texto que lee el modelo. Debe explicar QUÉ pasó para que razone con eso. */
  mensaje: string;
}

const ahora = () => new Date().toISOString();

function buscarProducto(ctx: ContextoHerramientas, productoId: number): Producto | undefined {
  return ctx.catalogo.find((p) => p.id === productoId);
}

function registrarOferta(ctx: ContextoHerramientas, oferta: Omit<Oferta, "at">) {
  ctx.estado.ultimaOferta = { ...oferta, at: ahora() };
}

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
        "mencione algo que querés ubicar en el catálogo, o cuando no estés seguro de si existe.",
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
        "Marca de qué producto están hablando. Llamala apenas quede claro cuál le interesa al cliente.",
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
      name: "enviar_ficha",
      description:
        "Envía la ficha del producto (descripción, qué incluye, beneficios). El sistema evita " +
        "automáticamente mandarla dos veces. Si ya se envió, te avisa y no la manda.",
      parameters: {
        type: "object",
        properties: {
          productoId: { type: "number" },
          seccion: {
            type: "string",
            enum: ["completa", "info", "beneficios"],
            description: "completa = todo; info = solo qué incluye; beneficios = solo para qué sirve.",
          },
          esReenvioPedido: {
            type: "boolean",
            description: "true SOLO si el cliente pidió explícitamente que se la mandes de nuevo.",
          },
        },
        required: ["productoId", "seccion"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "dar_precio",
      description:
        "Dice el precio del producto. El valor sale de la base de datos, no lo escribas vos en el " +
        "mensaje: llamá esta herramienta y el precio se agrega solo.",
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
      name: "enviar_video",
      description:
        "Envía el video de muestra del producto. El sistema evita mandarlo dos veces.",
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
      name: "enviar_datos_de_pago",
      description:
        "Envía el enlace o los datos para pagar. Solo funciona si antes le diste el precio.",
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
      name: "registrar_aviso_de_pago",
      description:
        "Llamala cuando el cliente diga que ya pagó o mande un comprobante. Deja el caso marcado " +
        "para que una persona lo verifique. NO confirma el pago: vos nunca podés dar un pago por " +
        "confirmado, eso lo hace una persona del equipo.",
      parameters: { type: "object", properties: {}, required: [] },
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

export const ejecutores: Record<string, Ejecutor> = {
  buscar_en_catalogo(ctx, { consulta }) {
    const normalizar = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""); // "inglés" y "ingles" son la misma palabra

    const disponibles = ctx.catalogo.filter((p) => p.disponible);
    const palabras = normalizar(String(consulta || ""))
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2);

    // Una palabra que aparece en casi todo el catálogo no distingue nada.
    // Con un catálogo de cursos, "curso" no dice cuál quiere el cliente: sin
    // esto, "curso de soldadura" devolvía piano e inglés y el bot ofrecía
    // cualquier cosa con seguridad. El peso es 0 para lo genérico y crece
    // cuanto más raro es el término (IDF clásico).
    const textos = disponibles.map((p) => normalizar(`${p.name} ${p.description || ""}`));
    const peso = (w: string) => {
      const enCuantos = textos.filter((t) => t.includes(w)).length;
      if (enCuantos === 0) return 0; // no está en el catálogo
      const frecuencia = enCuantos / disponibles.length;
      // Con 3 productos o más, una palabra presente en la mitad o más del
      // catálogo es de categoría, no de intención: "curso de soldadura" no
      // puede devolver el curso de piano solo porque comparten "curso".
      if (disponibles.length >= 3 && frecuencia >= 0.5) return 0;
      return Math.log(1 / frecuencia);
    };

    const puntuados = disponibles
      .map((p, i) => ({
        p,
        puntos: palabras.reduce((n, w) => n + (textos[i].includes(w) ? peso(w) : 0), 0),
      }))
      // Solo cuenta si coincidió alguna palabra realmente distintiva.
      .filter((x) => x.puntos > 0)
      .sort((a, b) => b.puntos - a.puntos)
      .slice(0, 5);

    if (!puntuados.length) {
      return {
        ok: true,
        mensaje:
          `No hay nada en el catálogo que coincida con "${consulta}". ` +
          `El catálogo completo tiene ${ctx.catalogo.filter((p) => p.disponible).length} productos. ` +
          `Decile que ese no lo manejás y ofrecele lo que sí hay, sin inventar.`,
      };
    }

    return {
      ok: true,
      mensaje: puntuados
        .map(({ p }) => `#${p.id} · ${p.name}${p.price ? ` · ${p.currency} ${p.price}` : ""}`)
        .join("\n"),
    };
  },

  enfocar_producto(ctx, { productoId }) {
    const p = buscarProducto(ctx, productoId);
    if (!p) return { ok: false, mensaje: `No existe el producto #${productoId}.` };
    ctx.estado.productoEnFoco = p.id;
    if (ctx.estado.etapa === "saludo" || ctx.estado.etapa === "explorando") {
      ctx.estado.etapa = "producto_en_foco";
    }
    return { ok: true, mensaje: `Producto en foco: ${p.name}.` };
  },

  enviar_ficha(ctx, { productoId, seccion, esReenvioPedido }) {
    const p = buscarProducto(ctx, productoId);
    if (!p) return { ok: false, mensaje: `No existe el producto #${productoId}.` };

    const yaEnviada = ctx.estado.fichasEnviadas[p.id];

    // La regla que antes era una instrucción en el prompt (y que el modelo se
    // saltaba) ahora es imposible de saltar: la herramienta no manda nada.
    if (yaEnviada && !esReenvioPedido) {
      return {
        ok: false,
        mensaje:
          `NO se envió: ya le mandaste la ficha de ${p.name}. ` +
          `Retomá en una línea en vez de volver a presentarla. ` +
          `Si te pidió puntualmente que se la reenvíes, llamá de nuevo con esReenvioPedido=true.`,
      };
    }

    ctx.partes.push({ kind: "card", productId: p.id, seccion: seccion || "completa" });
    ctx.estado.fichasEnviadas[p.id] = { seccion: seccion || "completa", at: ahora() };
    ctx.estado.productoEnFoco = p.id;
    registrarOferta(ctx, {
      tipo: "ficha",
      productoId: p.id,
      resumen: `la ficha de ${p.name}`,
    });

    return { ok: true, mensaje: `Ficha de ${p.name} enviada. No la repitas.` };
  },

  dar_precio(ctx, { productoId }) {
    const p = buscarProducto(ctx, productoId);
    if (!p) return { ok: false, mensaje: `No existe el producto #${productoId}.` };

    // El precio SIEMPRE sale de la base. El modelo no puede inventarlo ni
    // "recordar" mal uno viejo — que era el bug de precio-verificado.ts.
    if (p.price == null) {
      return {
        ok: false,
        mensaje:
          `${p.name} no tiene precio cargado. No inventes un valor: decile que se lo confirmás ` +
          `en un momento y llamá a escalar_a_humano.`,
      };
    }

    const moneda = p.currency || "COP";
    ctx.partes.push({ kind: "text", content: `💰 *${p.name}*: ${moneda} $${p.price.toLocaleString("es-CO")}` });
    ctx.estado.preciosDados[p.id] = { valor: p.price, moneda, at: ahora() };
    ctx.estado.etapa = "precio_dado";
    registrarOferta(ctx, {
      tipo: "precio",
      productoId: p.id,
      resumen: `el precio de ${p.name} (${moneda} ${p.price.toLocaleString("es-CO")})`,
    });

    return {
      ok: true,
      mensaje:
        `Precio de ${p.name} enviado (${moneda} ${p.price}). Ya está en el mensaje, no lo repitas ` +
        `en tu texto. Seguí con lo que sigue naturalmente.`,
    };
  },

  enviar_video(ctx, { productoId }) {
    const p = buscarProducto(ctx, productoId);
    if (!p) return { ok: false, mensaje: `No existe el producto #${productoId}.` };
    if (!p.videoUrl) return { ok: false, mensaje: `${p.name} no tiene video. Seguí sin él.` };

    if (ctx.estado.videosEnviados[p.id]) {
      return {
        ok: false,
        mensaje: `NO se envió: ya le mandaste el video de ${p.name}. No lo repitas.`,
      };
    }

    ctx.partes.push({ kind: "video", productId: p.id, url: p.videoUrl });
    ctx.estado.videosEnviados[p.id] = { url: p.videoUrl, at: ahora() };
    registrarOferta(ctx, { tipo: "video", productoId: p.id, resumen: `el video de ${p.name}` });

    return { ok: true, mensaje: `Video de ${p.name} enviado.` };
  },

  enviar_datos_de_pago(ctx, { productoId }) {
    const p = buscarProducto(ctx, productoId);
    if (!p) return { ok: false, mensaje: `No existe el producto #${productoId}.` };

    if (!ctx.estado.preciosDados[p.id]) {
      return {
        ok: false,
        mensaje:
          `NO se envió: todavía no le dijiste cuánto cuesta ${p.name}. ` +
          `Dale el precio primero con dar_precio.`,
      };
    }
    if (!p.paymentUrl) {
      return { ok: false, mensaje: `${p.name} no tiene enlace de pago cargado. Escalá a humano.` };
    }

    ctx.partes.push({ kind: "payment", productId: p.id, url: p.paymentUrl });
    ctx.estado.datosDePagoEnviados[p.id] = { at: ahora() };
    ctx.estado.etapa = "cierre";
    registrarOferta(ctx, {
      tipo: "datos_de_pago",
      productoId: p.id,
      resumen: `los datos para pagar ${p.name}`,
    });

    return { ok: true, mensaje: `Datos de pago de ${p.name} enviados.` };
  },

  registrar_aviso_de_pago(ctx) {
    ctx.estado.comprobanteRecibido = true;
    ctx.estado.etapa = "postventa";
    return {
      ok: true,
      mensaje:
        "Aviso registrado para que una persona lo verifique. " +
        "IMPORTANTE: no le digas que el pago está confirmado ni que ya lo verificaste — no lo está. " +
        "Decile que lo estás verificando y que en cuanto quede confirmado le llega el acceso.",
    };
  },

  escalar_a_humano(ctx, { motivo }) {
    ctx.estado.etapa = "postventa";
    return {
      ok: true,
      mensaje:
        `Escalado registrado (${motivo}). Decile en una línea que ya le pasás el caso a alguien ` +
        `del equipo, sin prometer tiempos exactos.`,
    };
  },
};
