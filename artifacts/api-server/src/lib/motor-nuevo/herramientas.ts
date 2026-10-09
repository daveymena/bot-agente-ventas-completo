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

import { sePuedeReenviar, instruccionDeDuda, fraseHablada, maquetaDeDatosDeEnvio } from "./maquetas";
import {
  registrarEnvio,
  registrarOferta,
  precioDado,
  productoPresentado,
  yaSeEnvio,
  fotosPendientes,
  fotosYaEnviadas,
  registrarFotosEnviadas,
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
import { puntosDeLaFicha } from "./lo-que-dice-la-ficha";

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
  /** Todas las fotos reales (la principal primero). Para "más fotos". */
  fotos?: string[] | null;
  /** Características (`products.features`), para razonar dudas sin maqueta. */
  caracteristicas?: string[] | null;
  /** Preguntas frecuentes curadas, para razonar dudas sin maqueta. */
  preguntas?: Array<{ p: string; r: string }> | null;
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
  /**
   * Una explicación que sale como NOTA DE VOZ (y como texto si la voz falla).
   * Solo la emite `explicar_con_nota_de_voz`, cuando el cliente no entendió.
   */
  | { kind: "voz"; content: string }
  | {
      kind: "card";
      productId: number;
      /** `SeccionFicha` de ficha-parcial.ts: qué pedazo de la ficha va. */
      seccion: Seccion;
      /**
       * Con seccion "fotos": las URLs concretas a enviar (las que faltan,
       * calculadas por `mostrar`). El render las manda como imágenes.
       */
      fotos?: string[];
      yaVioContenido?: boolean;
      sesionNueva?: boolean;
      videoYaEnviado?: boolean;
      mensajeDelCliente?: string;
      yaSabeElPrecio?: boolean;
      /**
       * Ficha que va como UNA de varias opciones: sale sin pregunta de cierre.
       * Con 4 fichas seguidas, las 4 cerraban "¿Quieres saber cuánto está?"
       * (chat real del 22-09-2026); la pregunta ("¿cuál te gusta?") la hace
       * el texto del agente, una sola vez.
       */
      sinCierre?: boolean;
      /** Lo que esta maqueta dice en la nota de voz (ver maquetas.ts). */
      hablado?: string;
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
  | "fotos"
  | "ninguna";

/** Efectos que el adaptador aplica DESPUÉS del turno. Mantienen las herramientas puras. */
export type Efecto =
  | { tipo: "pago_reportado"; medio?: string; referencia?: string }
  | { tipo: "escalar"; motivo: string }
  | { tipo: "pregunta_al_dueno"; pregunta: string; productoId: number | null }
  | { tipo: "dato"; campo: string; valor: string };

export interface ContextoHerramientas {
  estado: EstadoConversacion;
  catalogo: Producto[];
  /**
   * TODO el catálogo del negocio, sin el filtro por especialidad del agente.
   * `buscar_en_catalogo` cae acá cuando en `catalogo` no hay nada: conv 221
   * (24-09-2026), el agente de digitales atendió "El correcto", no vio los
   * correctores (son físicos, los ve AtlasDrops) y le dijo al cliente que no
   * los manejábamos. Que otro agente lo venda no es motivo para negarlo.
   */
  catalogoCompleto?: Producto[];
  /**
   * Producto que el SERVIDOR fijó en este turno ("el primero" contra las
   * opciones mostradas). Simulación del 25-09-2026: el servidor resolvió el
   * extractor 213 y el modelo llamó mostrar(152) -- un colgante --, que movió
   * el foco; el pedido salió de otro producto. Con esto, mostrar y
   * tomar_pedido no pueden cambiarlo por un id que el cliente no nombró.
   */
  focoFijo?: number | null;
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
  /**
   * Pedidos de productos físicos (dropshipping). Lo provee el adaptador con la
   * base real (lib/dropshipping.ts); las pruebas le pasan uno falso. Sin él,
   * `tomar_pedido` / `confirmar_pedido` responden que este negocio no toma
   * pedidos automáticos -- nunca fingen que se registró algo.
   */
  pedidos?: ServicioDePedidos;
}

/** Lo que el cliente dijo de sí mismo para el envío. Lo extrae el modelo. */
export interface DatosDelPedido {
  nombre?: string;
  telefono?: string;
  documento?: string;
  departamento?: string;
  ciudad?: string;
  direccion?: string;
  barrio?: string;
  notas?: string;
}

export type ResultadoTomarPedido =
  | { estado: "faltan"; faltan: string[]; yaTiene: string[] }
  | { estado: "zona"; motivo: string }
  | { estado: "listo"; resumen: string }
  | { estado: "error"; motivo: string };

export type ResultadoConfirmarPedido =
  | { estado: "creado"; numero: string | null; confirmacion: string }
  | { estado: "no_disponible"; mensajeAlCliente: string }
  | { estado: "rechazado"; motivo: string; productoDesactivado: boolean }
  | { estado: "sin_pedido" }
  | { estado: "error"; motivo: string };

export interface ServicioDePedidos {
  /**
   * Abre (o retoma) el pedido de esta conversación y guarda los datos que llegaron.
   * `variante` es lo que el cliente eligió (talla/color/modelo): se guarda
   * aparte de `datos.notas` para que al despachar se pueda resolver la
   * variación EXACTA de Dropi y no una cualquiera.
   */
  tomar(p: { producto: Producto; cantidad: number; datos: DatosDelPedido; variante?: string | null; transportadora?: { id?: number | null; nombre: string } | null }): Promise<ResultadoTomarPedido>;
  /** El cliente confirmó el resumen: se registra y se despacha. */
  confirmar(): Promise<ResultadoConfirmarPedido>;
  /** Seguimiento: el último pedido de esta conversación y lo que dice Dropi de él. */
  estado?(): Promise<{ hay: boolean; texto: string }>;
  /** El cliente pide cancelar: se cancela de verdad o se avisa al dueño. */
  cancelar?(): Promise<{ ok: boolean; texto: string }>;
  /**
   * Transportadoras que llegan a la ciudad del cliente (si la tiene) o a la
   * que se le pase. Nombres reales del proveedor: el bot ofrece la lista y el
   * cliente elige; nunca se inventa una ni se muestra el flete.
   */
  transportadoras?(ciudad: string): Promise<{ ok: boolean; mensaje: string }>;
}

export interface ResultadoHerramienta {
  ok: boolean;
  /** Texto que lee el modelo. Debe explicar QUÉ pasó para que razone con eso. */
  mensaje: string;
}

const ahora = () => new Date().toISOString();

/**
 * La ficha COMPLETA (y el detalle de "info" cuando ya vio el contenido) lleva
 * el enlace del video adentro: es la misma condición que `construirSeccion`
 * (whatsapp.ts, "Si el producto tiene video, se comparte UNA vez"). Sin esto
 * el estado solo anotaba "completa", el video figuraba como NO enviado y el
 * turno siguiente volvía a ofrecer "¿Quieres ver un pedacito del video?"
 * (reportado por el dueño en producción, 25-09-2026). Ninguna corrección lo
 * arreglaba porque esa pregunta la arma el sistema, no el modelo.
 */
export function registrarVideoSiLaFichaLoLleva(estado: EstadoConversacion, p: Producto, seccion: string, yaVioContenido: boolean): void {
  if (!p.videoUrl || yaSeEnvio(estado, p.id, "video")) return;
  if (seccion === "completa" || (seccion === "info" && yaVioContenido)) {
    registrarEnvio(estado, p.id, "video");
    registrarHechoEntregado(estado, `video de ${p.name}`);
  }
}

const nombreDe = (ctx: ContextoHerramientas, id: number) =>
  ctx.catalogo.find((p) => p.id === id)?.name ?? `producto #${id}`;

/**
 * Palabras que aparecen en casi cualquier pregunta del cliente. No deciden
 * nada de la conversación: solo no cuentan como coincidencia al buscar en el
 * conocimiento del negocio ni se guardan como disparadores.
 */
export const PALABRAS_GENERICAS = new Set([
  "hola", "tiene", "tienen", "tienes", "hay", "quiero", "quisiera", "puedo", "pueden", "como", "cuanto", "cuando",
  "donde", "que", "para", "pero", "entonces", "este", "esta", "esto", "ese", "esa", "eso", "sobre", "porque",
  "buenas", "buenos", "gracias", "favor", "saber", "dame", "dime", "decir", "hacer", "tambien", "algo", "los", "las",
  "del", "con", "una", "uno", "por", "mas", "muy",
]);

const N = (t: unknown): string =>
  String(t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Levenshtein <=1: corrige "corector"→"corrector", "lanpostura"→"postura" sin abrir la puerta a falsos positivos. */
function esMismoConTypo(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  // 6+ letras y la primera igual: desde 4 letras "piano" era "plano" y
  // "astronomia" era "gastronomia" (medido con el catálogo real, 23-09-2026).
  // Mismo criterio que conversation-engine.ts.
  if (a.length < 6 || b.length < 6) return false;
  if (a[0] !== b[0]) return false;
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
        "Busca productos en el catálogo por nombre, tema o palabra clave. Úsala cuando el cliente " +
        "mencione algo que quieres ubicar, cuando no estés seguro de si existe, o cuando pida algo " +
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
        "Marca de qué producto están hablando. Llámala apenas quede claro cuál le interesa al cliente. " +
        "Si el cliente cambia de producto, llámala de nuevo con el nuevo.",
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
        "Pega una MAQUETA visual (ficha, precio, medios de pago, entrega, fotos) debajo de tu texto. " +
        "Tú redactá una frase natural para introducirla (ej. 'Este es el valor:') y el SISTEMA " +
        "escribe los datos duros reales. NUNCA escribas los precios ni repitas los datos en tu texto. " +
        "Para PREGUNTAS y dudas NO uses esta herramienta: se responden con tus palabras razonando " +
        "(tenés la ficha y los datos en el contexto); la maqueta es para mostrar, no para responder.",
      parameters: {
        type: "object",
        properties: {
          productoId: { type: "number" },
          seccion: {
            type: "string",
            enum: ["completa", "info", "precio", "pago", "pago_transferencia", "pago_link", "entrega", "video", "tienda", "fotos"],
            description:
              "completa = ficha entera (solo si nunca la vio); info = qué es y qué incluye; " +
              "precio = el valor; pago = todos los medios; pago_transferencia = solo cuentas; " +
              "pago_link = solo tarjeta/enlace; entrega = cómo y cuándo llega; video = video de muestra; " +
              "tienda = enlace para verlo en la tienda; " +
              "fotos = MÁS FOTOS del producto (cuando pide 'más fotos', 'otra foto', 'fotos reales'): " +
              "el SISTEMA manda las que todavía no vio, sin repetir, hasta 3 por vez.",
          },
          reenviar: {
            type: "boolean",
            description: "true SOLO para pago, video o tienda, si el cliente pidió que se lo mandes de nuevo. Ficha, info y precio NUNCA se reenvían: si vuelve a preguntar tiene una duda, y se la respondes con tus palabras.",
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
        "OBLIGATORIA cuando lo que pide el cliente coincide con DOS o más productos (varios modelos del mismo tipo). " +
        "Busca primero con buscar_en_catalogo, después llámala con los ids. El SISTEMA pega debajo de tu texto la ficha de cada opción " +
        "con su FOTO, NOMBRE y PRECIO reales del catálogo. Por eso en tu texto NUNCA escribas nombres de productos ni precios: " +
        "solo una frase de intro (ej. 'Te muestro los modelos que tengo:') y la pregunta de cierre. Si listas a mano, los nombres salen " +
        "viejos y sin foto.",
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
      name: "explicar_con_nota_de_voz",
      description:
        "Manda una NOTA DE VOZ con una explicación. Úsala SOLO cuando el cliente muestra que no entendió algo " +
        "que ya le explicaste (\"no entiendo\", \"¿cómo así?\", repite la misma duda, se confunde con los pasos " +
        "o con cómo funciona). No la uses para saludar, dar el precio ni en respuestas normales. La explicación " +
        "sale solo como audio: no la repitas por escrito.",
      parameters: {
        type: "object",
        properties: {
          explicacion: {
            type: "string",
            description: "Lo que vas a decir en el audio: claro, sencillo, como se lo explicarías en persona. 2 a 5 frases.",
          },
        },
        required: ["explicacion"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "consultar_conocimiento",
      description:
        "Busca en lo que el DUEÑO del negocio cargó como respuestas (qué incluye, duración, " +
        "garantías, preguntas frecuentes). Úsala antes de decir 'no sé' o 'déjame confirmarte'.",
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
        "Te dice qué dato le falta a este negocio para poder concretar la venta. Úsala cuando el " +
        "cliente ya quiere comprar: así pides lo justo y no pareces un formulario.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "tomar_pedido",
      description:
        "Para productos FÍSICOS con envío, apenas el cliente quiere comprarlo (y ya sabe el precio), AUNQUE todavía " +
        "no te haya dado ningún dato: el SISTEMA le manda la lista ordenada de los datos de envío que faltan, así que " +
        "tú no los pides por texto. Pásale los datos que el cliente te dio, tal como los entendiste (aunque vengan todos " +
        "en un mensaje o en desorden). Cuando están todos, verifica la zona y le MANDA el resumen para confirmar. " +
        "Llámala otra vez cada vez que te dé o corrija un dato.",
      parameters: {
        type: "object",
        properties: {
          productoId: { type: "number", description: "El producto que compra. Si no lo pasas, se usa el que está en foco." },
          cantidad: { type: "number" },
          nombre: { type: "string", description: "Nombre y apellido de quien recibe." },
          documento: { type: "string", description: "Cédula, SOLO si el cliente la dio sin que se la pidas (no se pide)." },
          telefono: { type: "string", description: "Celular de contacto." },
          direccion: { type: "string", description: "Calle/carrera, número, torre, apto." },
          barrio: { type: "string" },
          ciudad: { type: "string" },
          departamento: { type: "string", description: "Departamento (o estado/provincia). Si solo dijo la ciudad, déjalo vacío." },
          notas: { type: "string", description: "Punto de referencia u otra indicación de entrega." },
          variante: { type: "string", description: "Talla/color/modelo que eligió el cliente (ej. \"M\"). Pásala SIEMPRE que la haya dicho." },
          transportadora: { type: "string", description: "Transportadora que eligió el cliente (ej. \"SERVIENTREGA\"), SOLO si la eligió él después de ver la lista de consultar_transportadoras. Si no eligió, déjala vacía: nunca inventes una." },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "consultar_transportadoras",
      description:
        "Consulta en Dropi si enviamos a la ciudad del cliente, si acepta contraentrega y qué transportadoras hay. " +
        "Úsala cuando el cliente pregunte qué empresa lleva el envío o quiera elegir una. Repetí SOLO lo que diga la " +
        "respuesta: si trae una lista, ofrecé las 2 o 3 primeras en ese orden; si dice que la asigna Dropi, decilo así. " +
        "El flete NUNCA se le muestra al cliente. Si el cliente elige una, pasa su nombre en tomar_pedido(transportadora=…). " +
        "Si la ciudad no está en cobertura, pedí que confirme cómo se escribe; nunca inventes empresas.",
      parameters: {
        type: "object",
        properties: {
          ciudad: { type: "string", description: "Ciudad de entrega. Si no la pasás se usa la que ya dio el cliente." },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "estado_de_mi_pedido",
      description:
        "SEGUIMIENTO de un pedido YA hecho: cuando el cliente pregunta dónde va, cuándo llega, la guía o la transportadora. " +
        "Trae el estado real (de la base y de Dropi). Si el pedido había quedado frenado, lo reintenta en el acto. Nunca inventes una guía ni una fecha.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "guia_de_tallas",
      description:
        "Preguntas de TALLA o medida (qué talla me sirve, peso X kg, mido Y, ¿me queda?, ¿es ajustable?). " +
        "Trae la tabla REAL de la ficha, las tallas que existen y si es ajustable, para razonar la recomendación. Úsala antes de decir 'lo confirmo'.",
      parameters: {
        type: "object",
        properties: { productoId: { type: "number", description: "Si no lo pasás, el producto en foco." } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "cancelar_mi_pedido",
      description:
        "El cliente pide CANCELAR un pedido que ya hizo. Lo cancela de verdad si todavía no salió a Dropi, o avisa al dueño si ya está allá. " +
        "Nunca digas que quedó cancelado sin llamar esta herramienta.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "confirmar_pedido",
      description:
        "Registra y despacha el pedido físico. SOLO cuando el cliente confirmó el resumen que le mostró tomar_pedido " +
        "en un mensaje anterior. Hasta que esta herramienta diga que se creó, el pedido NO existe: no digas que quedó registrado.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "registrar_pago_reportado",
      description:
        "Llámala cuando el cliente diga que ya pagó o mande un comprobante. Deja el caso marcado " +
        "para que una persona lo verifique. NO confirma el pago: tú nunca puedes dar un pago por " +
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
      name: "preguntar_al_dueno",
      description:
        "Le pasa al DUEÑO una pregunta del cliente que NO se puede responder con la ficha, los hechos del " +
        "negocio ni la lógica (ej. '¿tienen tienda física?' sin dato cargado). El dueño la recibe y su respuesta " +
        "queda guardada para siempre. Úsala SOLO después de consultar_conocimiento y solo si no la pudiste " +
        "responder razonando; no la uses para dudas del producto que se responden con criterio general.",
      parameters: {
        type: "object",
        properties: {
          pregunta: { type: "string", description: "La pregunta del cliente, corta y clara." },
          productoId: { type: "number", description: "Si es sobre un producto concreto." },
        },
        required: ["pregunta"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "escalar_a_humano",
      description:
        "Pasa la conversación a una persona del equipo. Úsala si el cliente se queja en serio, pide " +
        "hablar con alguien, reclama un reembolso, o si algo se sale de lo que puedes resolver.",
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
        "Llámala cuando quede claro qué quiere el cliente o qué le preguntaste. No envía nada al cliente.",
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
          preguntaPendiente: { type: "string", description: "Lo último que le preguntaste, si esperas respuesta." },
          accionPendiente: { type: "string", description: "Lo que quedó pendiente (ej. pedir_ciudad, enviar_pago)." },
          siguienteAccion: { type: "string", description: "Qué vas a hacer después." },
          objecion: { type: "string", description: "Si puso una duda, anótala para no repetir la explicación." },
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
        "Consulta inventario REAL del producto (columna stock). Úsala antes de afirmar que hay stock, " +
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
        "Úsala cuando el precio depende del alcance (consultoría, servicio con visita, instalación). No inventa el valor.",
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

  const nombres = disponibles.map((p) => N(p.name).trim());
  const descripciones = disponibles.map((p) => N(p.description || ""));
  const categorias = disponibles.map((p) => N(p.categoria || ""));
  const opciones = disponibles.map((p) => N((p.opciones || []).join(" ")));
  const textos = disponibles.map((_, i) => `${nombres[i]} ${descripciones[i]} ${categorias[i]} ${opciones[i]}`);
  const consultaNormalizada = N(consulta).replace(/[^a-z0-9ñ]+/g, " ").replace(/\s+/g, " ").trim();

  const peso = (w: string) => {
    // Importante: contar también coincidencias con un typo. Antes la búsqueda
    // encontraba "ciberseuridad" dentro de "ciberseguridad", pero peso() daba
    // cero porque volvía a exigir coincidencia EXACTA; 19 productos reales
    // quedaban fuera por una sola letra.
    const enCuantos = textos.filter((t) => incluyeConTypo(t, w)).length;
    if (enCuantos === 0) return 0;
    const frecuencia = enCuantos / Math.max(1, disponibles.length);
    if (disponibles.length >= 3 && enCuantos * 3 >= disponibles.length * 2) return 0;
    return Math.max(0.1, Math.log(1 / frecuencia));
  };

  return disponibles
    .map((p, i) => {
      // El nombre es la identidad del producto. Antes descripción/opciones
      // pesaban igual: buscar el nombre exacto "MARKETING DIGITAL" devolvía
      // primero Ecommerce porque su descripción mencionaba esas palabras.
      const exacto = nombres[i] === consultaNormalizada ? 10_000 : 0;
      const nombreDentro = !exacto && (nombres[i].includes(consultaNormalizada) || consultaNormalizada.includes(nombres[i])) ? 500 : 0;
      const puntos = palabras.reduce((total, w) => {
        const base = peso(w);
        if (!base) return total;
        if (incluyeConTypo(nombres[i], w)) return total + base * 8;
        if (incluyeConTypo(categorias[i], w)) return total + base * 2;
        if (incluyeConTypo(opciones[i], w)) return total + base;
        if (incluyeConTypo(descripciones[i], w)) return total + base * 0.5;
        return total;
      }, exacto + nombreDentro);
      return { p, puntos };
    })
    .filter((x) => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, limite);
}

// ══ El mensaje ACTUAL contra el foco viejo ═══════════════════════════════
// Regla del playbook (v1 la aprendió con sangre): "el producto del mensaje
// actual manda sobre el contexto viejo". El probador marcó el fallo dos
// rondas seguidas: el modelo, con foco viejo, negaba productos que SÍ
// existen ("dice que no lo tiene… Coche Mecedora…") y daba el precio del
// foco anterior (×9). La BÚSQUEDA pura está bien (los 133 del catálogo
// real se encuentran a sí mismos primero: diag-match-productos.ts, 04-10):
// lo que faltaba era que el re-enfoque no dependa del capricho del modelo.
// Esta regla es el hecho: qué producto nombró el mensaje ACTUAL.

/** Piso de puntos para considerar que el mensaje NOMBRÓ un producto. BAJO a
 * propósito: el peso IDF escala con el tamaño del catálogo (con 133 un nombre
 * propio rinde 30-60 pts, con 4 productos ~11) — un umbral alto rompe los
 * catálogos chicos, medido con el diag del 04-10. Lo que decide de verdad es
 * el MARGEN y la palabra de NOMBRE. */
export const UMBRAL_RE_ENFOQUE = 8;

/**
 * LOS PRODUCTOS que el mensaje actual nombró (1 a 4), en orden de fuerza.
 *
 * La versión DE LISTA de `productoMencionadoEnElMensajeActual`: el probador
 * marcó el caso del cliente caótico que nombra varios en un mensaje ("…y
 * la Mochila Elegante, y la Transportadora para Mascotas…") — el vendedor
 * negaba los que no estaban en foco ("dice que no lo tiene" con productos
 * que SÍ existen). Cada candidato acá exige sus PROPIAS palabras de nombre
 * en el mensaje (el coche con "coche/mecedora", la mochila con "mochila"):
 * sin ese requisito, el que gana por puntos comería a los demás.
 *
 * La AMBIGÜEDAD deja de ser rechazo: un "mochila" solo empata entre diez
 * mochilas y el hecho las lista para que el vendedor pregunte cuál — que es
 * lo que corresponde a una duda así (el foco solo cambia con un GANADOR
 * CLARO, y eso lo decide el motor con la regla de arriba).
 */
export function productosMencionadosEnElMensajeActual(
  mensaje: string,
  catalogo: Producto[],
  limite = 4,
): Array<{ id: number; nombre: string; puntos: number }> {
  if (!String(mensaje || "").trim()) return [];
  const palabras = N(mensaje)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length > 2);
  if (!palabras.length) return [];
  const punt = puntuarCoincidencias(mensaje, catalogo, 8);
  const out: Array<{ id: number; nombre: string; puntos: number }> = [];
  for (const cand of punt) {
    if (cand.puntos < UMBRAL_RE_ENFOQUE) break;
    if (!palabras.some((w) => incluyeConTypo(N(cand.p.name), w))) continue;
    out.push({ id: cand.p.id, nombre: cand.p.name, puntos: cand.puntos });
    if (out.length >= limite) break;
  }
  return out;
}

/**
 * El producto que el mensaje actual nombró con fuerza, o null (no hay).
 *
 * Tres condiciones — las tres importan, y juntas son libres de escala:
 *   1. el que ganó tiene puntos >= 8 (algo del catálogo se mencionó);
 *   2. al menos UNA palabra del mensaje vive en su NOMBRE (el match vino del
 *      producto nombrado, no de la descripción: "me gusta la verde" puntúa
 *      por la descripción y NO nombró nada);
 *   3. gana con MARGEN: al menos el doble del segundo (o es el único que
 *      puntuó). Un "mochila" sola empata contra diez mochilas: AMBIGUO — en
 *      ese caso no se re-enfoca y el modelo consulta/busca, que es lo que le
 *      corresponde a una duda así.
 */
export function productoMencionadoEnElMensajeActual(
  mensaje: string,
  catalogo: Producto[],
): { id: number; nombre: string; puntos: number } | null {
  const punt = puntuarCoincidencias(mensaje, catalogo, 3);
  if (!punt.length) return null;
  const top = punt[0];
  if (top.puntos < UMBRAL_RE_ENFOQUE) return null;
  const palabras = N(mensaje)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length > 2);
  if (!palabras.some((w) => incluyeConTypo(N(top.p.name), w))) return null;
  const segundo = punt[1]?.puntos ?? 0;
  if (segundo > 0 && top.puntos < segundo * 2) return null;
  return { id: top.p.id, nombre: top.p.name, puntos: top.puntos };
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

    let puntuados = puntuarCoincidencias(String(consulta), ctx.catalogo);

    // Nada en lo de este agente: se busca en todo el negocio antes de decir
    // "no lo manejo". Lo encontrado se suma a su catálogo para que
    // enfocar_producto / mostrar lo reconozcan en este mismo turno.
    if (!puntuados.length && ctx.catalogoCompleto?.length) {
      puntuados = puntuarCoincidencias(String(consulta), ctx.catalogoCompleto);
      for (const { p } of puntuados) {
        if (!ctx.catalogo.some((x) => x.id === p.id)) ctx.catalogo.push(p);
      }
    }

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
          `Dile con naturalidad que ese no lo manejas y ofrécele lo que sí hay. Nunca inventes un producto.`,
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
    if (!p) return { ok: false, mensaje: `No existe el producto #${productoId}. Busca en el catálogo primero.` };

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
    if (ctx.focoFijo != null && Number(productoId) !== ctx.focoFijo) productoId = ctx.focoFijo;
    const idNumerico = Number(productoId);
    if (!Number.isFinite(idNumerico) || idNumerico <= 0) {
      return {
        ok: false,
        mensaje:
          "No me pasaste un id de producto válido. No llames a mostrar sin id: " +
          "busca primero con buscar_en_catalogo lo que pidió el cliente y usa el id que te devuelva.",
      };
    }
    const p = ctx.catalogo.find((x) => x.id === idNumerico);
    if (!p) return { ok: false, mensaje: `No existe el producto #${idNumerico}. Busca en el catálogo primero.` };

    let sec = String(seccion || "completa") as Seccion;
    // ── Físico sin precio dado: "info" es "completa" ───────────────────────
    //
    // Conversaciones reales 265–268 y 270 (25/26-09-2026): el cliente llega
    // del anuncio con "Quiero más información", el modelo elige "info" (sin
    // precio) y cierra con "¿Te cuento cuánto vale?". Tiene que escribir otra
    // vez solo para saber el precio, y casi nadie lo hace: se van. La regla
    // del dueño (25-09) es ficha completa de una; el prompt lo pedía y el
    // modelo igual elegía "info", así que lo decide la herramienta.
    if (sec === "info" && String(p.kind || "") === "physical" && !precioDado(ctx.estado, p.id)) sec = "completa";
    const yaVio = yaSeEnvio(ctx.estado, p.id, sec);

    // La regla que antes era una instrucción en el prompt (y que el modelo se
    // saltaba) ahora es imposible de saltar: la herramienta no manda nada.
    // Y si ya salió, lo que corresponde es RAZONAR la duda (ver maquetas.ts):
    // solo lo accionable (pago, video, tienda) se reenvía, y solo si lo pide.
    if (yaVio && !(reenviar && sePuedeReenviar(sec))) {
      return { ok: false, mensaje: instruccionDeDuda(p, sec, ctx.guion.hechos) };
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
          `No inventes un plazo ni una transportadora: dile que lo confirmas y le pasas el dato. ` +
          `Si insiste, escalá a humano.`,
      };
    }

    // ── Video: solo si existe ──────────────────────────────────────────────
    if (sec === "video" && !p.videoUrl) {
      return { ok: false, mensaje: `${p.name} no tiene video cargado. Sigue sin ofrecerle video.` };
    }

    // ── Más fotos: las que faltan, nunca repetidas ───────────────────────
    // "Mándame más fotos / otra foto / fotos reales": no es la ficha de
    // nuevo (esa ya la vio con su foto principal), son las vistas que
    // todavía no le llegaron. Se calcula contra lo registrado, no contra
    // lo que el modelo cree que mandó.
    if (sec === "fotos") {
      const todas = Array.isArray(p.fotos) ? p.fotos : [];
      const pendientes = fotosPendientes(todas, fotosYaEnviadas(ctx.estado, p.id));
      if (!pendientes.length) {
        return {
          ok: false,
          mensaje:
            todas.length === 0
              ? `${p.name} no tiene más fotos cargadas (solo la de la ficha). Dilo con tus palabras y no prometas fotos que no hay.`
              : `Ya vio todas las fotos de ${p.name} (${todas.length}). Dilo con tus palabras y no mandes nada de nuevo.`,
        };
      }
      const lote = pendientes.slice(0, 3);
      ctx.partes.push({ kind: "card", productId: p.id, seccion: "fotos", fotos: lote, mensajeDelCliente: ctx.mensajeDelCliente });
      registrarFotosEnviadas(ctx.estado, p.id, lote);
      registrarHechoEntregado(ctx.estado, `fotos de ${p.name}`);
      marcarPaso(ctx.estado, `mostrar_fotos_${p.id}`);
      if (ctx.estado.productoEnFoco !== p.id) ctx.estado.productoEnFoco = p.id;
      return {
        ok: true,
        mensaje:
          `Salen ${lote.length} foto(s) nuevas de ${p.name}, las que todavía no había visto. ` +
          `Tu texto: UNA frase corta presentándolas (ej. "Te mando otras vistas:"). No describas lo que se ve en cada foto (no la ves vos) ni repitas la ficha. ` +
          (pendientes.length > lote.length
            ? `Todavía quedan ${pendientes.length - lote.length} por mostrar: si pide más, volvé a llamar a mostrar(seccion="fotos").`
            : `Eran las últimas: si pide más, dile con tus palabras que ya vio todas.`),
      };
    }

    const yaVioElContenido = productoPresentado(ctx.estado, p.id);
    ctx.partes.push({
      kind: "card",
      productId: p.id,
      seccion: sec,
      // Lo que el render ya sabía usar y el motor viejo casi nunca le pasaba.
      // Acá sale del estado, sin depender de que el modelo se acuerde.
      yaVioContenido: yaVioElContenido,
      sesionNueva: ctx.estado.turnos === 0,
      videoYaEnviado: yaSeEnvio(ctx.estado, p.id, "video"),
      mensajeDelCliente: ctx.mensajeDelCliente,
      yaSabeElPrecio: precioDado(ctx.estado, p.id),
      hablado: fraseHablada(p, sec),
    });

    registrarEnvio(ctx.estado, p.id, sec);
    registrarVideoSiLaFichaLoLleva(ctx.estado, p, sec, yaVioElContenido);
    // La foto principal viaja con la presentación (completa/info/entrega) la
    // primera vez: se registra para que "más fotos" no la repita. La
    // condición espeja la del render (`conFoto: !yaVioContenido ||
    // sesionNueva` en whatsapp.ts): si la foto no sale, no se registra.
    if ((sec === "completa" || sec === "info" || sec === "entrega") && (!yaVioElContenido || ctx.estado.turnos === 0)) {
      const principal = Array.isArray(p.fotos) && p.fotos.length ? p.fotos[0] : null;
      if (principal) registrarFotosEnviadas(ctx.estado, p.id, [principal]);
    }
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
      fotos: `más fotos de ${p.name}`,
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
    // Físico: la ficha "completa" ya trae precio, pago y entrega, y cierra con
    // "¿Te lo enviamos?" (ver construirSeccion). Queda registrado como dicho:
    // el precio no se vuelve a ofrecer y un "sí" siguiente abre el pedido.
    if (sec === "completa" && String(p.kind || "") === "physical") {
      for (const s2 of ["precio", "pago", "entrega"]) registrarEnvio(ctx.estado, p.id, s2 as Seccion);
      if (ctx.estado.compra === "ninguno" || ctx.estado.compra === "interes" || ctx.estado.compra === "producto_definido") ctx.estado.compra = "precio_dado";
      ctx.estado.preguntoSiCompra = { productoId: p.id, turno: ctx.estado.turnos };
    }
    if (sec === "entrega" && ctx.estado.entregaEstado === "pendiente_datos") ctx.estado.entregaEstado = "datos_listos";

    return {
      ok: true,
      mensaje:
        sec === "completa" && String(p.kind || "") === "physical"
          ? `Se envió la ficha COMPLETA de ${p.name}: foto, qué es, precio, envío, pago contraentrega y la pregunta "¿Te lo enviamos?". ` +
            `NO escribas nada más en este turno (o como mucho un saludo de una línea si es el primer mensaje). No ofrezcas el precio: ya lo tiene.`
          : `Se envió "${seccion}" de ${p.name}. Los datos (precio, cuentas, enlaces) los puso el sistema: ` +
            `no los repitas en tu texto. Sigue con lo que sigue naturalmente.`,
    };
  },

  mostrar_opciones(ctx, { productoIds }) {
    const pedidos = (Array.isArray(productoIds) ? productoIds : [])
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    const ids = pedidos.slice(0, 4);
    // Los que no entran se DICEN: con 5 correctores, el texto del agente
    // listaba 5 y llegaban 4 fichas -- el "Black" no se vio nunca y el
    // cliente no sabía por qué (chat real del 22-09-2026).
    const afuera = pedidos
      .slice(4)
      .map((id) => ctx.catalogo.find((p) => p.id === id)?.name)
      .filter(Boolean) as string[];

    if (ids.length < 2) {
      return { ok: false, mensaje: "mostrar_opciones es para DOS o más productos. Si es uno solo, usa mostrar." };
    }

    const prods = ids.map((id) => ctx.catalogo.find((p) => p.id === id)).filter((p): p is Producto => !!p);
    if (prods.length < 2) {
      return { ok: false, mensaje: "No encontré esos ids en el catálogo. Busca primero con buscar_en_catalogo y usa los ids que devuelva." };
    }

    for (const p of prods) {
      const yaVio = productoPresentado(ctx.estado, p.id);
      ctx.partes.push({
        kind: "card",
        productId: p.id,
        seccion: "info",
        yaVioContenido: yaVio,
        sesionNueva: ctx.estado.turnos === 0,
        videoYaEnviado: yaSeEnvio(ctx.estado, p.id, "video"),
        mensajeDelCliente: ctx.mensajeDelCliente,
        yaSabeElPrecio: precioDado(ctx.estado, p.id),
        sinCierre: prods.length > 1,
      });
      registrarEnvio(ctx.estado, p.id, "info");
      // Cada opción sale con su foto principal: también cuenta como vista.
      if (!yaVio || ctx.estado.turnos === 0) {
        const principal = Array.isArray(p.fotos) && p.fotos.length ? p.fotos[0] : null;
        if (principal) registrarFotosEnviadas(ctx.estado, p.id, [principal]);
      }
      registrarVideoSiLaFichaLoLleva(ctx.estado, p, "info", yaVio);
    }

    // La lista ordenada queda en el estado: "el primero/el segundo/este/esa"
    // se resuelve contra ESTA posición en el siguiente turno.
    ctx.estado.opcionesMostradas = prods.map((p) => p.id);

    const orden = prods.map((p, i) => `${i + 1}) ${p.name}`).join(" · ");
    return {
      ok: true,
      mensaje:
        `Mostré ${prods.length} opciones, en este orden: ${orden}. ` +
        `Dile al cliente que elija cuál, sin repetir lo que ya sale en las fichas.` +
        (afuera.length
          ? ` Entran hasta 4 fichas: NO se mostró ${afuera.join(", ")}. No lo nombres como si estuviera arriba; ` +
            `si quieres, dile en una frase que también hay ${afuera.length === 1 ? "otro modelo" : "otros modelos"} y que se lo muestras si le interesa.`
          : ""),
    };
  },

  explicar_con_nota_de_voz(ctx, { explicacion }) {
    const texto = String(explicacion || "").trim().slice(0, 700);
    if (texto.length < 20) return { ok: false, mensaje: "La explicación está vacía o es muy corta. Escríbela completa." };
    // Una sola por turno y no en dos turnos seguidos: el audio es para destrabar
    // una duda, no una forma nueva de contestar todo.
    if (ctx.partes.some((p) => p.kind === "voz")) return { ok: false, mensaje: "Ya va una nota de voz en esta respuesta." };
    const ultima = ctx.estado.notaDeVozEnTurno;
    if (ultima != null && ctx.estado.turnos - ultima <= 1) {
      return { ok: false, mensaje: "Acabas de mandarle un audio. Esta vez explícaselo por escrito, más corto y con un ejemplo." };
    }
    ctx.partes.push({ kind: "voz", content: texto });
    ctx.estado.notaDeVozEnTurno = ctx.estado.turnos;
    return { ok: true, mensaje: "La nota de voz sale con esa explicación. No la repitas por escrito: si acaso, una frase corta de cierre." };
  },

  consultar_conocimiento(ctx, { pregunta, productoId }) {
    const q = N(pregunta);
    // Las palabras que están en casi cualquier pregunta no cuentan: con ellas
    // "¿y tiene envío?" devolvía la respuesta de "Tiene certificado" (chat de
    // prueba, 25-09-2026) y el vendedor la repetía sin que se la pidieran.
    const palabras = q.split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2 && !PALABRAS_GENERICAS.has(w));
    if (!palabras.length) return { ok: false, mensaje: "No entendí qué preguntarle al conocimiento del negocio." };

    const enFoco = Number(productoId) || ctx.estado.productoEnFoco;
    // Sin producto en foco todavía (primer mensaje), se busca en TODO lo que
    // cargó el dueño: antes una respuesta guardada para un producto no se
    // encontraba hasta que el vendedor enfocaba ese producto.
    const relevantes = enFoco
      ? ctx.conocimiento.filter((k) => k.productId == null || k.productId === enFoco || k.productId === Number(productoId))
      : ctx.conocimiento;

    let mejor: { item: ItemDeConocimiento; puntos: number } | null = null;
    for (const item of relevantes) {
      const texto = N(`${item.pregunta} ${item.disparadores.join(" ")}`);
      const puntos = palabras.reduce((n, w) => n + (texto.includes(w) ? 1 : 0), 0);
      if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { item, puntos };
    }

    if (!mejor) {
      // Antes: "No inventes: dile que lo confirmas con el equipo y le
      // respondes". Nadie recibe esa pregunta (no hay aviso al dueño), así que
      // la promesa no se cumplía nunca, y como es la última instrucción que lee
      // el modelo, le ganaba a la regla de RAZONAR del prompt (chat de prueba,
      // 30-09-2026: "¿graba si se va la luz?" → "te aviso por acá mismo").
      // Ahora le llega lo que dice la ficha y la regla para razonar sin
      // inventar. Ver __tests__/razonar-sin-respuesta-cargada.test.ts.
      const producto = enFoco ? ctx.catalogo.find((p) => p.id === enFoco) : null;
      const puntos = producto ? puntosDeLaFicha(producto) : [];
      // Los HECHOS del negocio (pago, envío, cobertura, plazos, datos que cargó
      // el dueño) van acá: muchas preguntas "fuera del tema" se responden con
      // lógica de negocio a partir de ellos (07-10, pedido del dueño: "le hacen
      // preguntas que no son directas del tema pero que sí se pueden responder
      // con lógica de negocio, y las omite o no sabe qué decir"). Antes solo le
      // llegaba la ficha, y la regla final le prohibía decir que lo consultaba.
      const hechos = [...(ctx.guion?.hechos ?? []), ...(ctx.guion?.datosDelNegocio ?? [])].filter(Boolean).slice(0, 10);
      return {
        ok: true,
        mensaje:
          `El dueño no cargó nada sobre "${pregunta}". ` +
          (puntos.length ? `Lo que dice la ficha de ${producto!.name}: ${puntos.join(" · ")}. ` : "") +
          (hechos.length ? `Hechos del negocio: ${hechos.join(" · ")}. ` : "") +
          `Responde RAZONANDO y responde SIEMPRE algo útil:\n` +
          `1) Lo que digan la ficha o los hechos, afírmalo.\n` +
          `2) Lo que se DEDUCE de esos hechos, dilo como consecuencia lógica (ej.: si es contraentrega, "pagas cuando ` +
          `te llega, y si no estás puede recibirlo y pagarlo quien esté en casa"; si el envío es a todo el país, la ` +
          `respuesta a "¿llega a mi pueblo?" sale de ahí).\n` +
          `3) Lo que sepas de cómo funciona este TIPO de producto, dilo como criterio general ("en general…"), nunca ` +
          `como característica de este modelo.\n` +
          `4) Una condición comercial (garantía, devolución, descuento, stock, plazo) que no está cargada: no la afirmes.\n` +
          `Si aun así la respuesta depende de un dato del negocio que no tienes, llama preguntar_al_dueno y dile al ` +
          `cliente en una frase que ya se lo consultaste al equipo y que le confirmas por acá; y sigue ayudando con lo ` +
          `demás. Nunca lo dejes sin respuesta ni cambies de tema.`,
      };
    }

    if (!mejor.item.respuesta) {
      return {
        ok: true,
        mensaje:
          `El dueño cargó que los clientes preguntan "${mejor.item.pregunta}" pero NO dejó respuesta. ` +
          `Responde RAZONANDO con la ficha del producto y criterio general del tipo de producto (dicho como general, ` +
          `no como característica de este modelo). Si es una condición comercial no cargada (garantía, plazo, descuento), ` +
          `no la afirmes y sigue ayudando. No inventes, y no prometas que alguien le va a responder.`,
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
      return { ok: true, mensaje: "No falta ningún dato: puedes cerrar. Pídele la confirmación y mándale los medios de pago." };
    }
    // FASE 7: si falta un dato, se pide ÚNICAMENTE ese dato.
    ctx.estado.accionPendiente = `pedir_${faltan[0].campo}`;
    ctx.estado.siguienteAccion = `pedir_${faltan[0].campo}`;
    registrarHechoPedido(ctx.estado, faltan[0].campo);
    return {
      ok: true,
      mensaje:
        `Para poder concretar falta: ${faltan.map((d) => `${d.campo} (${d.porque})`).join("; ")}. ` +
        `Pide UNO por mensaje, y siempre DESPUÉS de contestar lo que el cliente acaba de decir. ` +
        `Nunca los pidas todos juntos: en WhatsApp eso se lee como un formulario.`,
    };
  },

  async estado_de_mi_pedido(ctx) {
    if (!ctx.pedidos?.estado) {
      return { ok: false, mensaje: "No puedo consultar pedidos desde acá. Dile que una persona le confirma el estado en un momento y usa escalar_a_humano. No inventes guía ni fecha." };
    }
    const r = await ctx.pedidos.estado();
    if (!r.hay) return { ok: true, mensaje: "Esta conversación no tiene ningún pedido hecho. Pregúntale con qué nombre o número lo hizo, sin inventar." };
    return { ok: true, mensaje: `${r.texto} Díselo con tus palabras; si no hay guía todavía, dile que se la pasas apenas la transportadora la asigne.` };
  },

  async guia_de_tallas(ctx, args) {
    const id = Number(args?.productoId) || ctx.focoFijo || ctx.estado.productoEnFoco;
    const p = id ? ctx.catalogo.find((x) => x.id === id) : null;
    if (!p) return { ok: false, mensaje: "No sé de qué producto pregunta la talla. Ubícalo con buscar_en_catalogo o enfocar_producto." };
    const { lineasDeTallas, esAjustable, medidasDelTexto, mensajeDeTallas } = await import("./guia-de-tallas");
    const conocimiento = (ctx.conocimiento || [])
      .filter((k) => (k.productId == null || k.productId === p.id) && k.respuesta)
      .map((k) => `${k.pregunta}: ${k.respuesta}`);
    const fuentes = [
      p.description,
      ...(p.caracteristicas || []),
      ...((p.preguntas || []).map((q) => `${q.p}: ${q.r}`)),
      ...conocimiento,
    ];
    marcarPaso(ctx.estado, `tallas_${p.id}`);
    return mensajeDeTallas({
      nombre: p.name,
      opciones: (p.opciones || []).filter(Boolean),
      lineas: lineasDeTallas(fuentes),
      ajustable: esAjustable(fuentes),
      medidas: medidasDelTexto(ctx.mensajeDelCliente || ""),
    });
  },

  async cancelar_mi_pedido(ctx) {
    if (!ctx.pedidos?.cancelar) {
      return { ok: false, mensaje: "No puedo cancelar pedidos desde acá. Usa escalar_a_humano y dile que una persona le confirma la cancelación. No digas que ya quedó cancelado." };
    }
    const r = await ctx.pedidos.cancelar();
    return { ok: r.ok, mensaje: r.texto };
  },

  async tomar_pedido(ctx, args) {
    if (!ctx.pedidos) {
      return { ok: false, mensaje: "Este negocio no toma pedidos automáticos. Toma los datos con registrar_dato y dile que una persona le confirma el envío. No digas que el pedido quedó registrado." };
    }
    const id = ctx.focoFijo ?? (Number(args?.productoId) || ctx.estado.productoEnFoco);
    const p = id ? ctx.catalogo.find((x) => x.id === id) : null;
    if (!p) return { ok: false, mensaje: "No sé qué producto compra. Ubícalo con buscar_en_catalogo o enfocar_producto y volvé a llamar." };
    if (String(p.kind || "digital") !== "physical") {
      return { ok: false, mensaje: `${p.name} no es un producto físico: no lleva envío ni pedido. Sigue con mostrar(seccion="pago").` };
    }
    // Precio antes que datos: pedir cédula y dirección a quien no sabe cuánto
    // cuesta es la regla que CLAUDE.md prohíbe romper.
    if (!precioDado(ctx.estado, p.id)) {
      return { ok: false, mensaje: `Todavía no le mostraste el precio de ${p.name}. Manda primero mostrar(seccion="precio") y después pide los datos.` };
    }
    // Que QUIERA comprar, no que le interese. Pedido del dueño (25-09-2026):
    // a "me interesa este" el bot le pidió nombre y cédula. Los datos se piden
    // cuando el cliente dijo que sí a "¿te lo enviamos?" (en un mensaje
    // POSTERIOR a esa pregunta), o cuando él mismo dijo que lo compra.
    if (ctx.estado.compraConfirmada !== p.id) {
      const preguntado = ctx.estado.preguntoSiCompra;
      // Preguntado por esta herramienta en un turno anterior, o por el modelo
      // en su texto ("¿Te lo enviamos?" con que cerró su último mensaje).
      const preguntoEnElTexto = /env[ií]|pedido|llev[aá]s|llevas|compr|separ|apart|lo quer[eé]s|lo quieres|te animas|te animás/i.test(ctx.estado.ultimaPreguntaAgente || "");
      const preguntoAntes = (preguntado?.productoId === p.id && ctx.estado.turnos > preguntado.turno) || preguntoEnElTexto;
      const respondioAlaPregunta = preguntoAntes && esConfirmacionBreve(ctx.mensajeDelCliente);
      if (respondioAlaPregunta || diceQueCompra(ctx.mensajeDelCliente)) {
        ctx.estado.compraConfirmada = p.id;
      } else {
        ctx.estado.preguntoSiCompra = { productoId: p.id, turno: ctx.estado.turnos };
        return {
          ok: false,
          mensaje:
            `El cliente todavía NO dijo que compra ${p.name} (interesarse no es comprar). NO le pidas datos de envío. ` +
            `Responde lo que preguntó y cierra con UNA pregunta corta de si quiere hacer el pedido (ej: "¿Te lo enviamos?"). ` +
            `Si responde que sí, volvé a llamar tomar_pedido.`,
        };
      }
    }
    const datos: DatosDelPedido = {};
    // La cédula no se pide (dueño, 24-09). Un 3xxxxxxxxx es celular aunque el
    // modelo lo mande como documento: la simulación del 25-09 imprimió
    // "🪪 Cédula 3001234567" en el resumen.
    if (args && /^\s*3\d{9}\s*$/.test(String(args.documento ?? "")) && !String(args.telefono ?? "").trim()) args.telefono = args.documento;
    if (args && !/c[eé]dula|\bcc\b|documento/i.test(ctx.mensajeDelCliente)) delete args.documento;
    for (const k of ["nombre", "telefono", "documento", "departamento", "ciudad", "direccion", "barrio", "notas"] as const) {
      const v = String(args?.[k] ?? "").trim();
      if (v) {
        // 25-09-2026: si el valor parece un celular (3xxxxxxxxx), lo movemos al teléfono
        // aunque el modelo lo haya puesto en 'documento'.
        if (k === "documento" && /^\d{10}$/.test(v)) {
          datos.telefono = v;
        } else {
          datos[k] = v.slice(0, 200);
        }
      }
    }
    // ── La talla viaja con el pedido ─────────────────────────────────────
    // Simulación del 26-09-2026: "…Medellín, 3001234567, talla M" y el
    // resumen salió sin talla. En dropshipping eso es despachar una talla
    // cualquiera. Se guarda en el estado (sobrevive entre turnos) y va en las
    // notas del pedido, que es lo que ven el resumen y quien despacha.
    // Si el modelo no la pasó pero el cliente la escribió ("…, talla M"), se
    // reconoce contra las opciones REALES del producto, no contra una lista
    // de palabras: preguntarle otra vez lo que ya dijo es peor que no preguntar.
    const palabrasDelCliente = String(ctx.mensajeDelCliente || "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    const enElMensaje = (p.opciones ?? []).find((o) => palabrasDelCliente.includes(o.toLowerCase().trim()));
    const varianteDicha =
      String(args?.variante ?? "").trim() || String(ctx.estado.datos?.variante ?? "").trim() || (enElMensaje ?? "");
    if (varianteDicha) {
      ctx.estado.datos.variante = varianteDicha.slice(0, 120);
      datos.notas = [`Talla/variante: ${ctx.estado.datos.variante}`, datos.notas].filter(Boolean).join(" · ");
    }
    const cantidad = Math.max(1, Math.min(20, Number(args?.cantidad) || 1));
    // La transportadora solo cuenta si la ELIGIÓ el cliente (nunca se inventa:
    // dueño, 25-09-2026). Con el nombre alcanza: quien despacha resuelve el id
    // contra las que Dropi lista para esa ciudad.
    const transportadoraElegida = String(args?.transportadora ?? "").trim().slice(0, 120);
    if (transportadoraElegida) ctx.estado.datos.transportadora = transportadoraElegida;
    const r = await ctx.pedidos.tomar({
      producto: p,
      cantidad,
      datos,
      variante: varianteDicha || null,
      transportadora: transportadoraElegida ? { nombre: transportadoraElegida } : null,
    });

    ctx.estado.productoEnFoco = p.id;
    if (ctx.estado.compra === "ninguno" || ctx.estado.compra === "interes" || ctx.estado.compra === "producto_definido" || ctx.estado.compra === "precio_dado") {
      ctx.estado.compra = "listo_para_pagar";
    }
    marcarPaso(ctx.estado, "pedido_abierto");

    switch (r.estado) {
      case "faltan":
        ctx.estado.pedidoPorConfirmarEnTurno = null;
        ctx.estado.accionPendiente = "pedir_datos_envio";
        ctx.estado.entregaEstado = "pendiente_datos";
        {
          // La lista la pega el SISTEMA (maquetaDeDatosDeEnvio): completa la
          // primera vez, solo lo que falta después. El modelo ya no la redacta
          // -- redactándola, a veces pedía los datos de a uno.
          const primeraVez = !yaSeEnvio(ctx.estado, p.id, "datos_envio" as Seccion);
          const maqueta = maquetaDeDatosDeEnvio(r.faltan, primeraVez);
          if (maqueta) {
            ctx.partes.push({ kind: "text", content: maqueta });
            registrarEnvio(ctx.estado, p.id, "datos_envio" as Seccion);
          }
          return {
            ok: true,
            mensaje:
              `Pedido de ${p.name} abierto. ` +
              (r.yaTiene.length ? `Ya tienes: ${r.yaTiene.join(", ")} (no los vuelvas a pedir). ` : "") +
              (maqueta
                ? `El SISTEMA ya le mandó la lista de datos que faltan (${r.faltan.join(", ")}). Escribe SOLO una frase corta de intro, sin listar los datos tú y sin pedir la cédula. No registres nada todavía.`
                : `No falta nada obligatorio. No pidas la cédula.`),
          };
        }
      case "zona":
        ctx.estado.pedidoPorConfirmarEnTurno = null;
        ctx.estado.accionPendiente = "confirmar_zona";
        return { ok: true, mensaje: `Los datos están, pero la zona no verifica: ${r.motivo}. Pídele que confirme la ciudad y el departamento. No registres nada.` };
      case "listo":
        // Tiene tallas/modelos y el cliente no dijo cuál: se pregunta ANTES
        // del resumen. Confirmar un pedido sin talla es despachar a ciegas.
        if (!varianteDicha && (p.opciones?.length ?? 0) > 0) {
          ctx.estado.pedidoPorConfirmarEnTurno = null;
          ctx.estado.accionPendiente = "pedir_datos_envio";
          return {
            ok: true,
            mensaje:
              `Datos de envío completos, pero falta la talla/variante de ${p.name} (opciones: ${p.opciones!.join(", ")}). ` +
              `Pregúntale SOLO cuál quiere, en una línea, y cuando conteste vuelve a llamar tomar_pedido con variante. No mandes resumen todavía.`,
          };
        }
        // El resumen sale en el mismo turno en que llegan los datos, y el "sí"
        // que confirma tiene que llegar en un mensaje POSTERIOR: por eso se
        // marca el turno (confirmar_pedido rechaza un sí del mismo turno).
        ctx.estado.pedidoPorConfirmarEnTurno = ctx.estado.turnos;
        ctx.estado.accionPendiente = "confirmar_pedido";
        ctx.estado.entregaEstado = "datos_listos";
        // El resumen lo manda el SISTEMA, tal cual, con los datos guardados:
        // así no puede salir con un dato cambiado por el modelo.
        ctx.partes.push({ kind: "text", content: `${r.resumen}\n\n¿Confirmas el pedido y el envío a esa dirección? ✅` });
        return {
          ok: true,
          mensaje:
            "Datos completos y zona verificada. El sistema ya le manda al cliente el RESUMEN del pedido y le pregunta si confirma. " +
            "Tu texto: una línea corta antes (ej. \"Te dejo el resumen para que lo revises:\"); no repitas el resumen ni la pregunta. " +
            "TODAVÍA NO está registrado: no digas que quedó registrado ni inventes número de pedido.",
        };
      default:
        return { ok: false, mensaje: `No se pudo abrir el pedido (${r.motivo}). Dile que tomaste sus datos y que una persona le confirma. No digas que quedó registrado.` };
    }
  },

  async confirmar_pedido(ctx) {
    if (!ctx.pedidos) {
      return { ok: false, mensaje: "Este negocio no toma pedidos automáticos: dile que una persona le confirma el envío. No digas que quedó registrado." };
    }
    if (ctx.estado.pedidoPorConfirmarEnTurno == null) {
      return { ok: false, mensaje: "No hay un resumen de pedido esperando confirmación. Primero tomar_pedido con los datos; cuando el sistema le mande el resumen y el cliente diga que sí, recién ahí confirmar_pedido." };
    }
    if (ctx.estado.pedidoPorConfirmarEnTurno >= ctx.estado.turnos) {
      return { ok: false, mensaje: "El resumen se le está mandando en ESTE mismo mensaje: el cliente todavía no lo leyó. Espera su respuesta." };
    }
    const r = await ctx.pedidos.confirmar();
    ctx.estado.pedidoPorConfirmarEnTurno = null;
    ctx.estado.accionPendiente = null;
    switch (r.estado) {
      case "creado":
        ctx.estado.compra = "pedido_creado";
        ctx.estado.entregaEstado = "programada";
        ctx.estado.etapa = "postventa";
        marcarPaso(ctx.estado, "pedido_creado");
        // La confirmación la manda el SISTEMA con los datos reales del pedido,
        // igual que el resumen. En la simulación con la IA real salía solo
        // "¡Listo, Ana! Tu pedido quedó registrado 🎉": sin número, sin a
        // dónde llega ni cuándo -- lo que el cliente necesita para quedarse
        // tranquilo después de dar su cédula y su dirección.
        ctx.partes.push({
          kind: "text",
          content:
            `✅ *Pedido${r.numero ? ` #${r.numero}` : ""} registrado*\n\n${r.confirmacion.trim()}\n\n` +
            "Apenas la transportadora genere la guía, te la comparto por acá 📦",
        });
        return {
          ok: true,
          mensaje:
            `PEDIDO REGISTRADO${r.numero ? ` (#${r.numero})` : ""}. La confirmación (número, a dónde llega y cuándo) sale JUSTO debajo de tu texto, en este mismo mensaje. ` +
            "Tu texto: UNA línea cálida de agradecimiento, sin repetir esos datos y sin decir que la confirmación llega después. NO le pidas más datos. NO inventes número de guía.",
        };
      case "no_disponible":
        return { ok: false, mensaje: `NO SE TOMÓ EL PEDIDO: el proveedor no puede despachar este producto. Dile algo como: "${r.mensajeAlCliente}". No le prometas despacho; ofrécele una alternativa del catálogo si la hay.` };
      case "rechazado":
        return {
          ok: false,
          mensaje: r.productoDesactivado
            ? `El proveedor rechazó el pedido (${r.motivo}) y el producto se agotó. Díselo con honestidad y sin tecnicismos, pídele disculpas y ofrécele una alternativa parecida. No prometas despacho ni inventes número de guía.`
            : `El proveedor tuvo un problema para despachar (${r.motivo}). Dile que ya avisaste al equipo y que le confirmas por acá apenas se resuelva. No prometas despacho ni inventes número de guía.`,
        };
      case "sin_pedido":
        return { ok: false, mensaje: "No encontré el pedido de esta conversación. Volvé a tomar_pedido con sus datos." };
      default:
        return { ok: false, mensaje: `El cliente confirmó pero el pedido NO se pudo registrar (${r.motivo}). Dile que ya tienes sus datos y que en un momento le confirmas el despacho. NO inventes número de pedido.` };
    }
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
        "Dile que ya está en verificación y que en cuanto quede confirmado le llega el acceso. " +
        "No prometas un tiempo exacto.",
    };
  },

  preguntar_al_dueno(ctx, { pregunta, productoId }) {
    const q = String(pregunta || "").trim().slice(0, 240);
    if (!q) return { ok: false, mensaje: "Falta la pregunta del cliente." };
    const pid = Number(productoId) || ctx.estado.productoEnFoco || null;
    ctx.efectos.push({ tipo: "pregunta_al_dueno", pregunta: q, productoId: pid ?? null });
    return {
      ok: true,
      mensaje:
        `Pregunta enviada al dueño ("${q}"); su respuesta queda guardada para las próximas veces. Dile al ` +
        `cliente en UNA frase que ya lo consultaste con el equipo y que le confirmas por acá, sin prometer un ` +
        `tiempo exacto, y sigue ayudando con lo que sí sabes.`,
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
        `Escalado registrado (${motivo}). Dile en una línea que ya le pasas el caso a alguien del ` +
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
    return { ok: true, mensaje: "Contexto anotado. No le muestres esto al cliente; sigue la conversación." };
  },

  consultar_disponibilidad(ctx, { productoId, variante, cantidad }) {
    const id = Number(productoId);
    const p = ctx.catalogo.find((x) => x.id === id);
    if (!p) return { ok: false, mensaje: `No existe el producto #${productoId}. Busca en el catálogo primero.` };
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
          `No afirmes que existe: di que lo confirmas.`,
      };
    }
    // Lo digital no se agota: no hay "existencias" que revisar.
    if (p.stock == null && /^(digital|curso|ebook|software)$/i.test(String(p.kind || ""))) {
      return { ok: true, mensaje: `${p.name} es digital: está disponible siempre, no tiene límite de unidades. Dilo con seguridad.` };
    }
    if (p.stock == null) {
      det.stockEstado = "sin_dato";
      return {
        ok: true,
        mensaje:
          `${p.name} no tiene inventario configurado. No afirmes una cantidad. Si pregunta si hay, di que se ` +
          `puede pedir y que la disponibilidad se valida al registrar el pedido; no prometas escribirle después.`,
      };
    }
    det.stock = p.stock;
    if (p.stock <= 0) {
      det.stockEstado = "agotado";
      return { ok: true, mensaje: `${p.name} figura sin stock. No lo ofrezcas como disponible: explícalo y ofrécele alternativa real.` };
    }
    if (det.cantidad != null && det.cantidad > p.stock) {
      det.stockEstado = "por_confirmar";
      return { ok: true, mensaje: `Pide ${det.cantidad} pero hay ${p.stock} en inventario. No confirmes: di que lo verificas.` };
    }
    det.stockEstado = "disponible";
    marcarPaso(ctx.estado, `stock_${p.id}`);
    return { ok: true, mensaje: `${p.name}: ${p.stock} unidad(es) en inventario. Puedes ofrecerlo.` };
  },

  async consultar_transportadoras(ctx, { ciudad }) {
    if (!ctx.pedidos?.transportadoras) {
      return { ok: false, mensaje: "Este negocio no tiene pedidos automáticos, así que no puedo listar transportadoras reales. No inventes ninguna empresa: dile que el envío lo coordina el equipo y, si el cliente insiste, usa escalar_a_humano." };
    }
    const destino = String(ciudad ?? "").trim() || String((ctx.estado.datos as any)?.ciudad ?? "").trim();
    if (!destino) {
      return { ok: false, mensaje: "Falta la ciudad de entrega: sin ciudad no sé qué transportadoras llegan. Pídesela al cliente en UNA pregunta corta y volvé a llamar." };
    }
    const r = await ctx.pedidos.transportadoras(destino);
    if (!r.ok) return r;
    return {
      ok: true,
      mensaje:
        `${r.mensaje} ` +
        `Mostrá SOLO los nombres, ordenados de la más económica a la más cara, y ofrecé 2 o 3. ` +
        `NUNCA muestres el flete ni ningún precio de envío (dueño: el flete no se muestra). ` +
        `Si el cliente elige una, pasá su nombre exacto en tomar_pedido(transportadora=…); si no elige, no insistas.`,
    };
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
    return { ok: true, mensaje: "Caso de consultoría registrado. Entiende problema y objetivo antes de cotizar; no inventes precio fijo." };
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
        `Dile que preparas la propuesta con esos datos, sin inventar el valor.`,
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

/**
 * Una respuesta corta afirmativa solo adquiere sentido porque existe una
 * pregunta pendiente del agente. Se evalúa por mensaje COMPLETO: "sí" confirma
 * "¿te lo enviamos?", pero "sí, ¿cuánto demora?" es una pregunta y no autoriza
 * un pedido. Incluye errores coloquiales frecuentes sin convertir cualquier
 * texto no negativo en un sí.
 */
export function esConfirmacionBreve(mensaje: string): boolean {
  const t = String(mensaje || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¡!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || t.includes("?") || esDudaONegativa(t)) return false;
  // Un "sí" puede venir acompañado: "sii claro", "sí por favor", "dale de una"
  // (venta real 05-10: "Sii claro" a "¿lo programamos?" no contaba como sí y
  // el bot volvió a preguntar tres veces; el cliente volvió al otro día).
  const SI = "(si+|s+|sip|sep|dale|listo|de una|ok|okay|okey|oki|va|bueno|claro|hagale|hagamole|perfecto|confirmo|por favor|porfa|seguro|obvio|of course|de acuerdo|esta bien)";
  return new RegExp(`^${SI}( ${SI})*$`).test(t);
}

/**
 * ¿El cliente dice, con sus palabras, que COMPRA? Solo frases explícitas:
 * "me interesa", "me gusta", "este" NO cuentan (pedido del dueño 25-09-2026).
 */
const AFIRMA_COMPRA = /\b(lo|la|los|las) (quiero|kiero|qiero|queiro|compro|pido|llevo)\b|\b(quiero|kiero|qiero|queiro) (uno|una|dos|tres|\d+|comprar|pedir|ordenar|hacer el pedido|realizar el pedido|encargar|confirmar el pedido)\b|\b(realizar|realizo|hacer|confirmar)( el)? pedido\b|\bme (lo|la) llevo\b|\bme (lo|la|los|las) (llevo|env[ií]as?|mand[aá]s?)\b|\b(env[ií]a|mand[aá])(me)?(lo|la|los|las)\b|\bhagamos el pedido\b|\bh[aá]gamelo\b|\bpedido\b.*\bconfirm/i;

/**
 * Una pregunta sobre CÓMO comprar es una señal de compra, no una duda.
 *
 * Chat de prueba (30-09-2026): "Listo, la quiero. ¿Cómo hago el pedido?" →
 * el vendedor contestó "¿Te gustaría que hagamos el pedido de una vez?". El
 * signo de pregunta bastaba para que todo el mensaje contara como duda, y el
 * pedido nunca se abría.
 */
const PREGUNTA_COMO_COMPRAR = /\bc[oó]mo (hago|hacemos|realizo|se hace|puedo hacer|es)( el| mi)? (pedido|compra)\b|\bc[oó]mo (lo|la|los|las) (pido|compro|encargo|pago)\b|\bc[oó]mo (te |les )?(pago|se paga)\b|\bd[oó]nde (hago|realizo|dejo) (el |mi )?pedido\b/i;

const NEGATIVA_O_APLAZA = /^\s*no\b|\bno (gracias|todav[ií]a|por ahora|s[eé])\b|\b(lo voy a pensar|lo pienso|despu[eé]s|m[aá]s tarde|luego te|d[eé]jame (ver|pensar)|todav[ií]a no)\b/i;

export function diceQueCompra(mensaje: string): boolean {
  const t = String(mensaje || "").toLowerCase().trim();
  if (!t || NEGATIVA_O_APLAZA.test(t)) return false;
  // Frase por frase: "la quiero" afirma; "¿cómo hago el pedido?" también. Una
  // pregunta de otra cosa ("¿la tienen en negro?") es una duda real y manda:
  // primero se responde, después se cierra.
  const frases = t.split(/(?=¿)|(?<=[.!?\n])\s+/).map((f) => f.trim()).filter(Boolean);
  let compra = false;
  for (const f of frases) {
    if (f.includes("?") || f.startsWith("¿")) {
      if (!PREGUNTA_COMO_COMPRAR.test(f)) return false;
      compra = true;
    } else if (AFIRMA_COMPRA.test(f)) {
      compra = true;
    }
  }
  return compra;
}

/** Una duda o un no: no es un sí aunque venga después de "¿te lo enviamos?". */
export function esDudaONegativa(mensaje: string): boolean {
  const t = String(mensaje || "").toLowerCase().trim();
  return t.includes("?") || NEGATIVA_O_APLAZA.test(t);
}
