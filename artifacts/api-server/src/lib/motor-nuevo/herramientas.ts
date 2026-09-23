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
  registrarHechoEntregado,
  registrarHechoPedido,
  registrarIntencion,
  apilarContexto,
  marcarPaso,
  type EstadoConversacion,
  type Intencion,
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
  /** Stock REAL (`products.stock`, puede ser null = no configurado). */
  stock?: number | null;
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
  /**
   * Hook opcional que el adaptador provee para recargar el guion cuando el
   * foco cambia en mitad del turno. Sin esto, `que_falta_para_cerrar` usaría
   * la calificación del producto anterior (digital vs físico).
   */
  alCambiarFoco?: (nuevoProductoId: number) => Promise<void> | void;
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

/** Levenshtein <=1: corrige "corector"→"corrector", "lanpostura"→"postura" sin abrir la puerta a falsos positivos. */
function esMismoConTypo(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length < 4 || b.length < 4) return false; // palabras cortas no toleran typo
  let i = 0; let j = 0; let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length === b.length) { i++; j++; }
    else if (a.length > b.length) i++;
    else j++;
  }
  edits += Math.abs((a.length - i) - (b.length - j));
  return edits <= 1;
}
function incluyeConTypo(texto: string, palabra: string): boolean {
  if (texto.includes(palabra)) return true;
  const palabras = texto.split(/[^a-z0-9ñ]+/).filter(Boolean);
  return palabras.some((w) => esMismoConTypo(w, palabra));
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
      name: "mostrar_opciones",
      description:
        "Cuando el cliente pide algo que coincide con VARIOS productos (nombre ambiguo, varios modelos), " +
        "mostrá la ficha de cada opción para que elija. Usala en vez de listar solo texto.",
      parameters: {
        type: "object",
        properties: {
          productoIds: {
            type: "array",
            items: { type: "number" },
            description: "Ids de los productos a mostrar (de 2 a 4).",
          },
        },
        required: ["productoIds"],
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
  {
    type: "function" as const,
    function: {
      name: "anotar_contexto",
      description:
        "Anota intención y pendiente del turno (para que el próximo 'sí/ese/dale/cuánto' se resuelva sin releer texto). " +
        "Llamala cuando quede claro qué quiere el cliente o qué le preguntaste. No envía nada al cliente.",
      parameters: {
        type: "object",
        properties: {
          intencion: {
            type: "string",
            enum: [
              "saludar", "explorar", "ver_producto", "preguntar_precio", "preguntar_info",
              "preguntar_entrega", "comprar", "pagar", "reportar_pago", "objecion", "despedida", "otra",
            ],
          },
          preguntaPendiente: { type: "string", description: "Lo último que le preguntaste, si esperás respuesta." },
          accionPendiente: { type: "string", description: "Lo que quedó pendiente (ej. pedir_ciudad, enviar_pago)." },
          siguienteAccion: { type: "string", description: "Qué vas a hacer después." },
          objecion: { type: "string", description: "Si puso una duda, anotala para no repetir la explicación." },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "consultar_disponibilidad",
      description:
        "Consulta inventario REAL del producto (columna stock). Usala antes de afirmar que hay stock, " +
        "una variante o una cantidad. Si no hay inventario configurado, te dice que lo confirmes: nunca inventes.",
      parameters: {
        type: "object",
        properties: {
          productoId: { type: "number" },
          variante: { type: "string", description: "Color/talla/modelo, si el cliente la pidió." },
          cantidad: { type: "number", description: "Cuántas unidades quiere." },
        },
        required: ["productoId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "registrar_caso",
      description:
        "Registra un caso de servicio o consultoría (necesidad/problema/objetivo/alcance/cita). " +
        "No cotiza ni agenda por sí solo: deja el caso estructurado para cotizar o agendar después.",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["servicio", "consultoria"] },
          necesidad: { type: "string" },
          alcance: { type: "string" },
          cuando: { type: "string", description: "Cuándo quiere la cita/entrega del servicio." },
          problema: { type: "string" },
          objetivo: { type: "string" },
        },
        required: ["tipo"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "solicitar_cotizacion",
      description:
        "Marca la cotización/propuesta como en proceso para que una persona la prepare. " +
        "Usala cuando el precio depende del alcance (consultoría, servicio con visita, instalación). No inventa el valor.",
      parameters: {
        type: "object",
        properties: { resumen: { type: "string", description: "Qué incluirá la cotización." } },
        required: [],
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
    // Palabra "de categoría": aparece en AL MENOS DOS TERCIOS del catálogo y no
    // distingue. El umbral era 0.5, pero tumbaba búsquedas válidas en catálogos
    // chicos: 3 taladros en una tienda de 5 productos (60%) se leían como
    // "categoría" y el bot decía "no manejo taladros" a un producto que sí
    // estaba (22-09). "Curso" en un catálogo de cursos (2 de 3 = 66%) sigue
    // cayendo porque no distingue cuál curso quiere el cliente.
    if (disponibles.length >= 3 && enCuantos * 3 >= disponibles.length * 2) return 0;
    return Math.log(1 / frecuencia);
  };

  return disponibles
    .map((p, i) => ({
      p,
      puntos: palabras.reduce((n, w) => n + (incluyeConTypo(textos[i], w) ? peso(w) : 0), 0),
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

  async enfocar_producto(ctx, { productoId }) {
    const p = ctx.catalogo.find((x) => x.id === Number(productoId));
    if (!p) return { ok: false, mensaje: `No existe el producto #${productoId}. Buscá en el catálogo primero.` };

    const anterior = ctx.estado.productoEnFoco;
    if (anterior === p.id) {
      return { ok: true, mensaje: `Producto en foco: ${p.name}.` };
    }
    // Multimodelo: apilar contexto para "y la cámara?" tras la laptop.
    apilarContexto(ctx.estado, anterior ? `hablaban de ${nombreDe(ctx, anterior)}` : "explorando");
    ctx.estado.productoAnterior = anterior;
    ctx.estado.productoEnFoco = p.id;
    // Ya eligió: las opciones mostradas dejan de estar "en espera de elección".
    ctx.estado.opcionesMostradas = [];
    if (ctx.estado.etapa === "saludo" || ctx.estado.etapa === "explorando") {
      ctx.estado.etapa = "producto_en_foco";
    }
    // FASE 3/4: cambio explícito actualiza foco+anterior y marca proceso,
    // sin borrar historial (seccionesEnviadas/datos se conservan).
    if (ctx.estado.compra === "ninguno" || ctx.estado.compra === "interes") {
      ctx.estado.compra = "producto_definido";
    }

    // La oferta anterior era de otro producto: un "sí" posterior no puede
    // seguir aceptando aquello. Se invalida en vez de reinterpretarla.
    if (ctx.estado.ultimaOferta?.productoId != null && ctx.estado.ultimaOferta.productoId !== p.id) {
      ctx.estado.ultimaOferta = null;
    }

    // El guion (qué falta para cerrar, cómo se cierra) depende del producto
    // en foco. Si el adaptador proveyó el hook, se recarga en el acto para
    // que `que_falta_para_cerrar` no use la calificación rancia.
    try {
      await ctx.alCambiarFoco?.(p.id);
    } catch {
      /* recargar el guion nunca puede tumbar el cambio de foco */
    }

    if (anterior) {
      return {
        ok: true,
        mensaje:
          `Cambiaste el foco de ${nombreDe(ctx, anterior)} a ${p.name}. ` +
          `Ojo: lo que ya le dijiste del producto anterior no vale para este.`,
      };
    }
    return { ok: true, mensaje: `Producto en foco: ${p.name}.` };
  },

  async mostrar(ctx, { productoId, seccion, reenviar }) {
    const idNumerico = Number(productoId);
    if (!Number.isFinite(idNumerico) || idNumerico <= 0) {
      return {
        ok: false,
        mensaje:
          "No me pasaste un id de producto válido. No llames a mostrar sin id: " +
          "buscá primero con buscar_en_catalogo lo que pidió el cliente y usá el id que te devuelva.",
      };
    }
    const p = ctx.catalogo.find((x) => x.id === idNumerico);
    if (!p) return { ok: false, mensaje: `No existe el producto #${idNumerico}. Buscá en el catálogo primero.` };

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
    registrarHechoEntregado(ctx.estado, `${sec} de ${p.name}`);
    marcarPaso(ctx.estado, `mostrar_${sec}_${p.id}`);
    if (ctx.estado.productoEnFoco !== p.id) {
      const previo = ctx.estado.productoEnFoco;
      apilarContexto(ctx.estado, previo ? `hablaban de ${nombreDe(ctx, previo)}` : "explorando");
      ctx.estado.productoAnterior = previo;
      ctx.estado.productoEnFoco = p.id;
      // `mostrar` también mueve el foco (el modelo a veces muestra sin
      // enfocar antes): la oferta previa de otro producto queda invalidada
      // por `registrarOferta` de abajo, que ya apunta al producto nuevo.
      try {
        await ctx.alCambiarFoco?.(p.id);
      } catch {
        /* idem: no tumbar el envío por el guion */
      }
    }

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
    // FASE 4: proceso explícito movido por herramientas, no por memoria del LLM.
    if (sec === "precio" && (ctx.estado.compra === "ninguno" || ctx.estado.compra === "interes" || ctx.estado.compra === "producto_definido")) {
      ctx.estado.compra = "precio_dado";
    }
    if (sec.startsWith("pago")) {
      ctx.estado.compra = "listo_para_pagar";
      if (ctx.estado.pago === "ninguno" || ctx.estado.pago === "pendiente_dato") ctx.estado.pago = "datos_enviados";
    }
    if ((sec === "info" || sec === "completa" || sec === "video") && ctx.estado.compra === "ninguno") {
      ctx.estado.compra = "producto_definido";
    }
    if (sec === "entrega" && ctx.estado.entregaEstado === "pendiente_datos") ctx.estado.entregaEstado = "datos_listos";

    return {
      ok: true,
      mensaje:
        `Se envió "${seccion}" de ${p.name}. Los datos (precio, cuentas, enlaces) los puso el sistema: ` +
        `no los repitas en tu texto. Seguí con lo que sigue naturalmente.`,
    };
  },

  mostrar_opciones(ctx, { productoIds }) {
    const ids = (Array.isArray(productoIds) ? productoIds : [])
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, 4);

    if (ids.length < 2) {
      return { ok: false, mensaje: "mostrar_opciones es para DOS o más productos. Si es uno solo, usá mostrar." };
    }

    const prods = ids.map((id) => ctx.catalogo.find((p) => p.id === id)).filter((p): p is Producto => !!p);
    if (prods.length < 2) {
      return { ok: false, mensaje: "No encontré esos ids en el catálogo. Buscá primero con buscar_en_catalogo y usá los ids que devuelva." };
    }

    for (const p of prods) {
      ctx.partes.push({
        kind: "card",
        productId: p.id,
        seccion: "info",
        yaVioContenido: productoPresentado(ctx.estado, p.id),
        sesionNueva: ctx.estado.turnos === 0,
        videoYaEnviado: yaSeEnvio(ctx.estado, p.id, "video"),
        mensajeDelCliente: ctx.mensajeDelCliente,
        yaSabeElPrecio: precioDado(ctx.estado, p.id),
      });
      registrarEnvio(ctx.estado, p.id, "info");
    }

    // La lista ordenada queda en el estado: "el primero/el segundo/este/esa"
    // se resuelve contra ESTA posición en el siguiente turno.
    ctx.estado.opcionesMostradas = prods.map((p) => p.id);

    const orden = prods.map((p, i) => `${i + 1}) ${p.name}`).join(" · ");
    return {
      ok: true,
      mensaje:
        `Mostré ${prods.length} opciones, en este orden: ${orden}. ` +
        `Decile al cliente que elija cuál, sin repetir lo que ya sale en las fichas.`,
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
    registrarHechoEntregado(ctx.estado, `dato ${c}`);
    // FASE 4 físico/contraentrega: dirección+ciudad completan entrega.
    if ((c === "direccion" || c === "ciudad") && ctx.estado.entregaEstado === "pendiente_datos") {
      const tieneCiudad = String((ctx.estado.datos as any).ciudad || "").trim();
      const tieneDir = String((ctx.estado.datos as any).direccion || "").trim();
      if (tieneCiudad && tieneDir) ctx.estado.entregaEstado = "datos_listos";
    }
    return { ok: true, mensaje: `Guardado (${c}: ${v}). No lo repitas en tu mensaje salvo que aporte.` };
  },

  que_falta_para_cerrar(ctx) {
    const faltan = datosQueFaltan(ctx.guion.calificacion, ctx.estado.datos as Record<string, string>);
    if (!faltan.length) {
      ctx.estado.accionPendiente = null;
      ctx.estado.siguienteAccion = "cerrar_y_enviar_pago";
      return { ok: true, mensaje: "No falta ningún dato: podés cerrar. Pedile la confirmación y mandale los medios de pago." };
    }
    // FASE 7: si falta un dato, se pide ÚNICAMENTE ese dato.
    ctx.estado.accionPendiente = `pedir_${faltan[0].campo}`;
    ctx.estado.siguienteAccion = `pedir_${faltan[0].campo}`;
    registrarHechoPedido(ctx.estado, faltan[0].campo);
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
    // FASE 4/7: reportado ≠ confirmado. Solo persona confirma (adaptador).
    ctx.estado.compra = "pago_reportado";
    ctx.estado.pago = "reportado";
    ctx.estado.accionPendiente = null;
    ctx.estado.siguienteAccion = "esperar_verificacion_humana";
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
    ctx.estado.accionPendiente = null;
    ctx.estado.siguienteAccion = "esperar_humano";
    ctx.efectos.push({ tipo: "escalar", motivo: String(motivo || "sin motivo") });
    return {
      ok: true,
      mensaje:
        `Escalado registrado (${motivo}). Decile en una línea que ya le pasás el caso a alguien del ` +
        `equipo, sin prometer tiempos exactos.`,
    };
  },

  anotar_contexto(ctx, { intencion, preguntaPendiente, accionPendiente, siguienteAccion, objecion }) {
    const validas: Intencion[] = [
      "saludar", "explorar", "ver_producto", "preguntar_precio", "preguntar_info",
      "preguntar_entrega", "comprar", "pagar", "reportar_pago", "objecion", "despedida", "otra",
    ];
    if (typeof intencion === "string" && (validas as string[]).includes(intencion)) {
      registrarIntencion(ctx.estado, intencion as Intencion);
    }
    if (typeof preguntaPendiente === "string" && preguntaPendiente.trim()) {
      ctx.estado.preguntaPendiente = preguntaPendiente.trim().slice(0, 300);
    }
    if (typeof accionPendiente === "string" && accionPendiente.trim()) {
      ctx.estado.accionPendiente = accionPendiente.trim().slice(0, 120);
    }
    if (typeof siguienteAccion === "string" && siguienteAccion.trim()) {
      ctx.estado.siguienteAccion = siguienteAccion.trim().slice(0, 120);
    }
    if (typeof objecion === "string" && objecion.trim()) {
      const o = objecion.trim().slice(0, 200);
      if (!ctx.estado.objecionesVistas.includes(o)) ctx.estado.objecionesVistas.push(o);
    }
    return { ok: true, mensaje: "Contexto anotado. No le muestres esto al cliente; seguí la conversación." };
  },

  consultar_disponibilidad(ctx, { productoId, variante, cantidad }) {
    const id = Number(productoId);
    const p = ctx.catalogo.find((x) => x.id === id);
    if (!p) return { ok: false, mensaje: `No existe el producto #${productoId}. Buscá en el catálogo primero.` };
    const det = (ctx.estado.detalleProducto[p.id] ??= {});
    if (typeof variante === "string" && variante.trim()) {
      det.variante = variante.trim().slice(0, 120);
      ctx.estado.datos.variante = det.variante;
    }
    if (Number.isFinite(Number(cantidad)) && Number(cantidad) > 0) {
      det.cantidad = Math.min(999, Math.floor(Number(cantidad)));
      (ctx.estado.datos as any).cantidad = String(det.cantidad);
    }
    // Variante pedida debe existir en opciones reales: si no, no se inventa.
    if (det.variante && p.opciones?.length && !p.opciones.some((o) => o.toLowerCase().includes(det.variante!.toLowerCase()))) {
      det.stockEstado = "por_confirmar";
      return {
        ok: true,
        mensaje:
          `El catálogo no trae la variante "${det.variante}" para ${p.name} (opciones: ${p.opciones.join(", ")}). ` +
          `No afirmes que existe: decí que lo confirmás.`,
      };
    }
    if (p.stock == null) {
      det.stockEstado = "sin_dato";
      return {
        ok: true,
        mensaje:
          `${p.name} no tiene inventario configurado. No afirmes stock ni disponibilidad: ` +
          `decí que revisás existencias y confirmás.`,
      };
    }
    det.stock = p.stock;
    if (p.stock <= 0) {
      det.stockEstado = "agotado";
      return { ok: true, mensaje: `${p.name} figura sin stock. No lo ofrezcas como disponible: explícalo y ofrecele alternativa real.` };
    }
    if (det.cantidad != null && det.cantidad > p.stock) {
      det.stockEstado = "por_confirmar";
      return { ok: true, mensaje: `Pide ${det.cantidad} pero hay ${p.stock} en inventario. No confirmes: decí que lo verificás.` };
    }
    det.stockEstado = "disponible";
    marcarPaso(ctx.estado, `stock_${p.id}`);
    return { ok: true, mensaje: `${p.name}: ${p.stock} unidad(es) en inventario. Podés ofrecerlo.` };
  },

  registrar_caso(ctx, { tipo, necesidad, alcance, cuando, problema, objetivo }) {
    if (tipo !== "servicio" && tipo !== "consultoria") {
      return { ok: false, mensaje: "Tipo inválido: es servicio o consultoria." };
    }
    if (tipo === "servicio") {
      const s = (ctx.estado.servicio ??= {});
      if (typeof necesidad === "string" && necesidad.trim()) {
        s.necesidad = necesidad.trim().slice(0, 300);
        ctx.estado.datos.necesidad = s.necesidad;
        ctx.efectos.push({ tipo: "dato", campo: "necesidad", valor: s.necesidad });
      }
      if (typeof alcance === "string" && alcance.trim()) {
        s.alcance = alcance.trim().slice(0, 300);
        (ctx.estado.datos as any).alcance = s.alcance;
      }
      if (typeof cuando === "string" && cuando.trim()) {
        s.citaCuando = cuando.trim().slice(0, 120);
        ctx.estado.datos.cuando = s.citaCuando;
      }
      registrarIntencion(ctx.estado, "explorar");
      marcarPaso(ctx.estado, "caso_servicio");
      return { ok: true, mensaje: "Caso de servicio registrado. Diagnosticá primero; cotizá después con datos reales." };
    }
    const c = (ctx.estado.consultoria ??= {});
    if (typeof problema === "string" && problema.trim()) {
      c.problema = problema.trim().slice(0, 300);
      (ctx.estado.datos as any).problema = c.problema;
    }
    if (typeof objetivo === "string" && objetivo.trim()) {
      c.objetivo = objetivo.trim().slice(0, 300);
      (ctx.estado.datos as any).objetivo = c.objetivo;
    }
    if (typeof necesidad === "string" && necesidad.trim() && !c.problema) c.problema = necesidad.trim().slice(0, 300);
    if (typeof alcance === "string" && alcance.trim()) c.alcance = alcance.trim().slice(0, 300);
    if (!c.cotizacion) c.cotizacion = "pendiente";
    registrarIntencion(ctx.estado, "explorar");
    marcarPaso(ctx.estado, "caso_consultoria");
    return { ok: true, mensaje: "Caso de consultoría registrado. Entendé problema y objetivo antes de cotizar; no inventes precio fijo." };
  },

  solicitar_cotizacion(ctx, { resumen }) {
    if (ctx.estado.consultoria) ctx.estado.consultoria.cotizacion = "en_proceso";
    if (ctx.estado.servicio) ctx.estado.servicio.cotizacion = "en_proceso";
    ctx.estado.siguienteAccion = "preparar_cotizacion";
    ctx.estado.accionPendiente = "preparar_cotizacion";
    marcarPaso(ctx.estado, "cotizacion_solicitada");
    return {
      ok: true,
      mensaje:
        `Cotización marcada en proceso${typeof resumen === "string" && resumen.trim() ? `: ${resumen.trim().slice(0, 200)}` : ""}. ` +
        `Decile que preparás la propuesta con esos datos, sin inventar el valor.`,
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
