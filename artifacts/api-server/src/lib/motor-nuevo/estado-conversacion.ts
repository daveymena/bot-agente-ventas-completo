/**
 * ESTADO EXPLÍCITO DE LA CONVERSACIÓN
 * ===================================
 *
 * Principio único de todo el motor:
 *
 *   Un hecho se REGISTRA en el momento en que ocurre.
 *   Nunca se adivina después leyendo el texto con expresiones regulares.
 *
 * El motor viejo preguntaba "¿le ofrecimos el precio?" corriendo una regex
 * sobre los mensajes anteriores. Eso falla siempre que aparece una redacción
 * nueva, y por eso cada arreglo destapaba otro bug. Aquí, cuando el bot da un
 * precio, la herramienta `mostrar` escribe `seccionesEnviadas[id].precio`.
 * Cuando llega un "sí", "dale", "obvio", "de una" o cualquier otra forma que
 * ni se nos ocurrió, no hay nada que interpretar: el servidor YA SABE qué
 * ofreció.
 */

export type TipoOferta =
  | "precio"
  | "ficha"
  | "video"
  | "datos_de_pago"
  | "entrega"
  | "pregunta"
  | "ninguna";

/** Etapas, solo para poder mirar de reojo cómo va la charla. No dirigen nada. */
export type Etapa =
  | "saludo"
  | "explorando"
  | "producto_en_foco"
  | "precio_dado"
  | "cierre"
  | "postventa"
  | "escalado";

export interface Oferta {
  tipo: TipoOferta;
  productoId: number | null;
  /** Texto corto de lo que se le ofreció, para el bloque de contexto. */
  resumen: string;
  at: string; // ISO
}

/** Los campos de calificación que el agente va juntando. */
export type CampoDeDato =
  | "nombre"
  | "ciudad"
  | "direccion"
  | "variante"
  | "necesidad"
  | "cuando"
  | "presupuesto"
  | "otro";

export interface EstadoConversacion {
  conversationId: number;

  /** Producto del que se está hablando ahora. null = todavía explorando. */
  productoEnFoco: number | null;

  /**
   * QUÉ se le mandó de CADA producto y cuándo.
   *
   * Reemplaza a `elVideoYaSalio()`, a `yaVioContenido` y a toda la familia de
   * funciones que escaneaban el historial buscando enlaces y emojis 🎬 para
   * deducirlo. La clave es el id del producto y después la sección.
   */
  seccionesEnviadas: Record<number, Record<string, string>>;

  /**
   * LA PIEZA CLAVE. Responde "¿a qué contesta este 'sí'?" sin adivinar.
   * Se escribe cada vez que el bot ofrece algo, en la herramienta que lo ofrece.
   */
  ultimaOferta: Oferta | null;

  /**
   * El modelo NUNCA puede poner esto en true. Solo una persona, desde el panel.
   * Así es estructuralmente imposible que el bot diga "ya confirmé tu pago"
   * cuando no lo confirmó nadie — que era lo que la regex AFIRMA_PAGO_CONFIRMADO
   * intentaba atrapar a posteriori, y fallaba con cada redacción nueva
   * ("apenas se confirme el pago" la rompió el 13-09).
   */
  pagoConfirmadoPorHumano: boolean;
  comprobanteRecibido: boolean;

  /** Lo que el cliente fue diciendo de sí mismo y hace falta para cerrar. */
  datos: Partial<Record<CampoDeDato, string>>;

  /** Objeciones que ya puso, para no volver a explicar lo mismo. */
  objecionesVistas: string[];

  etapa: Etapa;
  /** Cuántas respuestas lleva dadas el agente en esta conversación. */
  turnos: number;

  /** Última vez que el cliente escribió. Para saludar distinto si volvió al otro día. */
  ultimoMensajeCliente: string | null;
  /** Última vez que el AGENTE escribió. Para saber si la charla se enfrió. */
  ultimoMensajeAgente: string | null;

  /** Resumen de la conversación vieja, cuando ya no cabe entera en contexto. */
  resumenPrevio: string | null;

  /** Si se escaló a una persona, por qué. */
  escalado: { motivo: string; at: string } | null;
}

export function estadoInicial(conversationId: number): EstadoConversacion {
  return {
    conversationId,
    productoEnFoco: null,
    seccionesEnviadas: {},
    ultimaOferta: null,
    pagoConfirmadoPorHumano: false,
    comprobanteRecibido: false,
    datos: {},
    objecionesVistas: [],
    etapa: "saludo",
    turnos: 0,
    ultimoMensajeCliente: null,
    ultimoMensajeAgente: null,
    resumenPrevio: null,
    escalado: null,
  };
}

/**
 * Mezcla un estado guardado con el inicial.
 *
 * Hace falta porque el estado se guarda entero en una columna: el día que se
 * agregue un campo nuevo, las conversaciones que ya venían de antes no lo
 * tienen y sin esto explotarían (o peor: leerían `undefined` y se comportarían
 * como si nada hubiera pasado).
 */
export function normalizarEstado(crudo: unknown, conversationId: number): EstadoConversacion {
  const base = estadoInicial(conversationId);
  if (!crudo || typeof crudo !== "object") return base;
  const c = crudo as Partial<EstadoConversacion>;
  return {
    ...base,
    ...c,
    conversationId,
    seccionesEnviadas: c.seccionesEnviadas && typeof c.seccionesEnviadas === "object" ? c.seccionesEnviadas : {},
    datos: c.datos && typeof c.datos === "object" ? c.datos : {},
    objecionesVistas: Array.isArray(c.objecionesVistas) ? c.objecionesVistas : [],
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * LECTURA Y ESCRITURA DEL ESTADO (helpers que usan las herramientas)
 * ──────────────────────────────────────────────────────────────────────────── */

const ahora = () => new Date().toISOString();

/** ¿Ya se le mandó esta sección de este producto? */
export function yaSeEnvio(estado: EstadoConversacion, productoId: number, seccion: string): boolean {
  return !!estado.seccionesEnviadas[productoId]?.[seccion];
}

/** ¿Ya se le mandó ALGUNA sección de este producto? */
export function productoPresentado(estado: EstadoConversacion, productoId: number): boolean {
  return Object.keys(estado.seccionesEnviadas[productoId] || {}).length > 0;
}

export function registrarEnvio(estado: EstadoConversacion, productoId: number, seccion: string): void {
  if (!estado.seccionesEnviadas[productoId]) estado.seccionesEnviadas[productoId] = {};
  estado.seccionesEnviadas[productoId][seccion] = ahora();
}

export function registrarOferta(estado: EstadoConversacion, oferta: Omit<Oferta, "at">): void {
  estado.ultimaOferta = { ...oferta, at: ahora() };
}

/**
 * Si el precio ya se dio, se puede pasar a cobrar; si no, no.
 *
 * Es la regla que evita el "mandá el link sin decir cuánto cuesta", que en un
 * chat de WhatsApp se lee como una estafa.
 */
export function precioDado(estado: EstadoConversacion, productoId: number): boolean {
  return yaSeEnvio(estado, productoId, "precio");
}

/* ────────────────────────────────────────────────────────────────────────────
 * PERSISTENCIA
 *
 * El estado vive en `conversations.estado_agente`. En Postgres es `jsonb`; en
 * SQLite (modo local y de pruebas) es `text`, así que se guarda como JSON
 * string. Un solo campo a propósito: agregar un dato al estado no puede exigir
 * otra migración.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface RepositorioEstado {
  cargar(conversationId: number): Promise<EstadoConversacion>;
  guardar(estado: EstadoConversacion): Promise<void>;
}

const esSqlite = () => process.env.USE_SQLITE === "true";

/** Drizzle devuelve el jsonb ya parseado y el text como string. Se aceptan los dos. */
function parsearEstado(valor: unknown, conversationId: number): EstadoConversacion {
  if (!valor) return estadoInicial(conversationId);
  if (typeof valor === "string") {
    try {
      return normalizarEstado(JSON.parse(valor), conversationId);
    } catch {
      return estadoInicial(conversationId);
    }
  }
  return normalizarEstado(valor, conversationId);
}

/** Implementación con Drizzle. Aislada acá para que el motor no sepa de la base. */
export function crearRepositorioDrizzle(deps: {
  db: any;
  conversations: any;
  eq: (a: any, b: any) => any;
}): RepositorioEstado {
  const { db, conversations, eq } = deps;

  return {
    async cargar(conversationId) {
      try {
        const [fila] = await db
          .select({ estado: conversations.estadoAgente })
          .from(conversations)
          .where(eq(conversations.id, conversationId))
          .limit(1);
        return parsearEstado(fila?.estado, conversationId);
      } catch (err: any) {
        // Una columna que todavía no existe (migración pendiente) no puede
        // dejar mudo al vendedor: se arranca del estado inicial y se sigue.
        return estadoInicial(conversationId);
      }
    },

    async guardar(estado) {
      const valor = esSqlite() ? JSON.stringify(estado) : estado;
      await db
        .update(conversations)
        .set({ estadoAgente: valor })
        .where(eq(conversations.id, estado.conversationId));
    },
  };
}

/** Estado en memoria: para sombra y pruebas. Se pierde al reiniciar. */
export class RepositorioEnMemoria implements RepositorioEstado {
  private estados = new Map<number, EstadoConversacion>();

  constructor(private iniciales?: Map<number, EstadoConversacion>) {}

  async cargar(conversationId: number): Promise<EstadoConversacion> {
    const previo = this.estados.get(conversationId) ?? this.iniciales?.get(conversationId);
    return previo ? normalizarEstado(previo, conversationId) : estadoInicial(conversationId);
  }

  async guardar(estado: EstadoConversacion): Promise<void> {
    this.estados.set(estado.conversationId, estado);
  }

  /** Para pruebas: leer sin promesas. */
  ver(conversationId: number): EstadoConversacion | undefined {
    return this.estados.get(conversationId);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * LECTURA DEL ESTADO PARA EL MODELO
 *
 * En vez de meterle al prompt cuarenta notas condicionales escritas a mano
 * (`notaDelSi`, `notaDeRegreso`, `notaDeContenido`... como venía haciendo
 * agent.ts), se le entrega UN bloque de hechos. El modelo razona sobre hechos,
 * que es lo que sabe hacer bien.
 * ──────────────────────────────────────────────────────────────────────────── */

const ETIQUETA_SECCION: Record<string, string> = {
  completa: "la ficha entera",
  info: "qué incluye",
  precio: "el precio",
  pago: "los medios de pago",
  pago_transferencia: "las cuentas de transferencia",
  pago_link: "el enlace de pago",
  entrega: "cómo se entrega",
  video: "el video",
  tienda: "el enlace de la tienda",
};

export function describirEstado(
  estado: EstadoConversacion,
  nombrePorProducto: (id: number) => string,
): string {
  const l: string[] = [];

  if (estado.productoEnFoco != null) {
    l.push(`Producto en foco: ${nombrePorProducto(estado.productoEnFoco)}.`);
  } else {
    l.push("Todavía no hay un producto definido en esta conversación.");
  }

  // Lo que YA se mandó, producto por producto. Es lo que evita repetir.
  for (const [id, secciones] of Object.entries(estado.seccionesEnviadas)) {
    const nombre = nombrePorProducto(Number(id));
    const cuales = Object.keys(secciones).map((s) => ETIQUETA_SECCION[s] || s);
    if (cuales.length) {
      l.push(`De ${nombre} ya le enviaste: ${cuales.join(", ")}. No lo repitas salvo que lo pida.`);
    }
  }

  // Esto es lo que desambigua un "sí" pelado, sin una sola regex.
  if (estado.ultimaOferta && estado.ultimaOferta.tipo !== "ninguna") {
    l.push(
      `LO ÚLTIMO QUE LE OFRECISTE: ${estado.ultimaOferta.resumen}. ` +
        `Si el cliente responde afirmativamente de cualquier forma ("sí", "dale", ` +
        `"listo", "obvio", "de una", un pulgar arriba, un emoji), está aceptando ESO y nada más. ` +
        `Si dice que sí a una pregunta que vos no hiciste, no inventes: preguntá.`,
    );
  }

  const datos = Object.entries(estado.datos).filter(([, v]) => String(v || "").trim());
  if (datos.length) {
    l.push(`Lo que ya te dijo de sí mismo: ${datos.map(([k, v]) => `${k}: ${v}`).join("; ")}.`);
  }

  if (estado.objecionesVistas.length) {
    l.push(`Dudas que ya puso (no vuelvas a explicar lo mismo desde cero): ${estado.objecionesVistas.join("; ")}.`);
  }

  if (estado.comprobanteRecibido && !estado.pagoConfirmadoPorHumano) {
    l.push(
      "El cliente dice que ya pagó, pero NINGUNA persona lo verificó todavía. " +
        "No afirmes que el pago está confirmado ni entregues el producto: avisá que lo están verificando.",
    );
  }

  if (estado.pagoConfirmadoPorHumano) {
    l.push("El pago fue verificado por una persona del equipo. Podés entregar el acceso.");
  }

  if (estado.escalado) {
    l.push(`Esta conversación ya se pasó a una persona (${estado.escalado.motivo}). No prometas tiempos.`);
  }

  if (estado.resumenPrevio) {
    l.push(`Resumen de lo que hablaron antes: ${estado.resumenPrevio}`);
  }

  return l.join("\n");
}

/** Cuántas horas pasaron desde el último mensaje del cliente. */
export function horasDesdeUltimoMensaje(estado: EstadoConversacion): number | null {
  if (!estado.ultimoMensajeCliente) return null;
  const ms = Date.now() - new Date(estado.ultimoMensajeCliente).getTime();
  return ms / (1000 * 60 * 60);
}

/** ¿El cliente volvió después de un rato largo? Cambia cómo se lo saluda. */
export function volvioDespuesDe(estado: EstadoConversacion, horas = 8): boolean {
  const h = horasDesdeUltimoMensaje(estado);
  return h != null && h > horas;
}
