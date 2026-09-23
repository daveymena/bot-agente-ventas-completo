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

/**
 * FASE 1 — Intención del turno. La fija el modelo vía `anotar_contexto`
 * (o queda null): nunca se deduce con regex sobre texto viejo.
 */
export type Intencion =
  | "saludar"
  | "explorar"
  | "ver_producto"
  | "preguntar_precio"
  | "preguntar_info"
  | "preguntar_entrega"
  | "comprar"
  | "pagar"
  | "reportar_pago"
  | "objecion"
  | "despedida"
  | "otra";

/** FASE 4/7 — Proceso de compra explícito. Lo mueven las herramientas, no el LLM. */
export type EstadoCompra =
  | "ninguno"
  | "interes"
  | "producto_definido"
  | "precio_dado"
  | "listo_para_pagar"
  | "pago_reportado"
  | "pago_confirmado"
  | "pedido_creado"
  | "entregado"
  | "cancelado";

/** FASE 4/7 — Pago explícito. Solo una persona llega a `confirmado`. */
export type EstadoPago =
  | "ninguno"
  | "pendiente_dato"
  | "datos_enviados"
  | "reportado"
  | "verificando"
  | "confirmado"
  | "rechazado";

/** FASE 4 — Entrega explícita. `no_aplica` para digital. */
export type EstadoEntrega =
  | "no_aplica"
  | "pendiente_datos"
  | "datos_listos"
  | "programada"
  | "enviada"
  | "entregada";

/** FASE 7 — Operación con ciclo de vida. Ningún fallo se reporta como éxito. */
export type EstadoOperacion = "started" | "in_progress" | "completed" | "failed" | "cancelled";

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
  | "cantidad"
  | "necesidad"
  | "alcance"
  | "cuando"
  | "presupuesto"
  | "problema"
  | "objetivo"
  | "otro";

/** Contexto previo apilado (multimodelo: cámara + laptop sin perderse). Máx 5. */
export interface ContextoPrevio {
  producto: number | null;
  intencion: Intencion | null;
  compra: EstadoCompra;
  resumen: string;
  at: string;
}

/** Detalle operativo por producto: variante, cantidad y stock REAL. */
export interface DetalleProducto {
  variante?: string | null;
  cantidad?: number | null;
  stock?: number | null;
  stockEstado?: "disponible" | "agotado" | "sin_dato" | "por_confirmar";
}

/** Servicio: necesidad → diagnóstico/alcance → disponibilidad → precio → agenda. */
export interface CasoServicio {
  necesidad?: string | null;
  alcance?: string | null;
  citaCuando?: string | null;
  cotizacion?: "pendiente" | "en_proceso" | "enviada";
}

/** Consultoría: problema → objetivo → contexto → alcance → propuesta → cotización. */
export interface CasoConsultoria {
  problema?: string | null;
  objetivo?: string | null;
  tipoNegocio?: string | null;
  alcance?: string | null;
  cotizacion?: "pendiente" | "en_proceso" | "enviada";
}

export interface EstadoConversacion {
  conversationId: number;

  /** Producto del que se está hablando ahora. null = todavía explorando. */
  productoEnFoco: number | null;

  /**
   * Producto del que se hablaba antes del cambio de foco.
   * Permite "volver al anterior" sin rebuscarlo en el historial.
   * Se escribe en `enfocar_producto` / `mostrar` cuando el foco cambia.
   */
  productoAnterior: number | null;

  /**
   * La lista ORDENADA de productos que se le mostraron como opciones
   * (mostrar_opciones) y que aún esperan que el cliente elija cuál.
   * La posición en esta lista ES el orden en que se le mostraron las fichas,
   * así "el primero/el segundo/este/esa" se resuelve sin adivinar.
   */
  opcionesMostradas: number[];

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

  /* ── FASE 1: fuente única de verdad (todo aditivo, todo opcional) ── */

  /** Intención del turno actual (la declara el modelo) y la anterior. */
  intencionActual: Intencion | null;
  intencionAnterior: Intencion | null;

  /** Última pregunta que hizo el AGENTE (para resolver "sí/ese/dale"). */
  preguntaPendiente: string | null;
  /** Acción que quedó pendiente (ej. "pedir_ciudad", "enviar_pago"). */
  accionPendiente: string | null;

  /** Hechos ya entregados / pedidos, sin releer el historial. */
  hechosEntregados: string[];
  hechosPedidos: string[];

  /** Proceso comercial explícito (FASE 4). Lo escriben las herramientas. */
  compra: EstadoCompra;
  pago: EstadoPago;
  entregaEstado: EstadoEntrega;

  /** Última herramienta ejecutada y su resultado (FASE 6/14). */
  ultimaHerramienta: { nombre: string; args: any; ok: boolean; at: string } | null;

  /** Última pregunta del agente (texto) y último mensaje del cliente (texto). */
  ultimaPreguntaAgente: string | null;
  ultimoMensajeClienteTexto: string | null;

  /** Próxima acción sugerida (para observabilidad y sombra). */
  siguienteAccion: string | null;

  /** Cuándo se actualizó el resumen de hechos (FASE 5). */
  resumenActualizadoEn: string | null;

  /* ── Multimodelo: físico/dropshipping/consultoría/servicios (aditivo) ── */

  /** Pila de contextos previos para "y la cámara?" tras hablar de laptop. */
  contextosPrevios: ContextoPrevio[];

  /** Variante/cantidad/stock por producto (stock = columna real, puede ser null). */
  detalleProducto: Record<number, DetalleProducto>;

  /** Caso de servicio y de consultoría (null = no aplica en esta charla). */
  servicio: CasoServicio | null;
  consultoria: CasoConsultoria | null;

  /** Pasos completados del proceso (para "estábamos en pago"). */
  pasosCompletados: string[];

  /** Método de pago/entrega elegidos (texto del cliente, no invención). */
  pagoMetodo: string | null;
  entregaMetodo: string | null;
}

export function estadoInicial(conversationId: number): EstadoConversacion {
  return {
    conversationId,
    productoEnFoco: null,
    productoAnterior: null,
    opcionesMostradas: [],
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
    intencionActual: null,
    intencionAnterior: null,
    preguntaPendiente: null,
    accionPendiente: null,
    hechosEntregados: [],
    hechosPedidos: [],
    compra: "ninguno",
    pago: "ninguno",
    entregaEstado: "no_aplica",
    ultimaHerramienta: null,
    ultimaPreguntaAgente: null,
    ultimoMensajeClienteTexto: null,
    siguienteAccion: null,
    resumenActualizadoEn: null,
    contextosPrevios: [],
    detalleProducto: {},
    servicio: null,
    consultoria: null,
    pasosCompletados: [],
    pagoMetodo: null,
    entregaMetodo: null,
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
    productoEnFoco: typeof c.productoEnFoco === "number" ? c.productoEnFoco : null,
    productoAnterior: typeof c.productoAnterior === "number" ? c.productoAnterior : null,
    opcionesMostradas: Array.isArray(c.opcionesMostradas)
      ? c.opcionesMostradas.map(Number).filter((n) => Number.isFinite(n))
      : [],
    seccionesEnviadas: c.seccionesEnviadas && typeof c.seccionesEnviadas === "object" ? c.seccionesEnviadas : {},
    datos: c.datos && typeof c.datos === "object" ? c.datos : {},
    objecionesVistas: Array.isArray(c.objecionesVistas) ? c.objecionesVistas : [],
    intencionActual: typeof c.intencionActual === "string" ? (c.intencionActual as EstadoConversacion["intencionActual"]) : null,
    intencionAnterior: typeof c.intencionAnterior === "string" ? (c.intencionAnterior as EstadoConversacion["intencionAnterior"]) : null,
    preguntaPendiente: typeof c.preguntaPendiente === "string" ? c.preguntaPendiente : null,
    accionPendiente: typeof c.accionPendiente === "string" ? c.accionPendiente : null,
    hechosEntregados: Array.isArray(c.hechosEntregados) ? c.hechosEntregados.map(String) : [],
    hechosPedidos: Array.isArray(c.hechosPedidos) ? c.hechosPedidos.map(String) : [],
    compra: typeof c.compra === "string" ? (c.compra as EstadoConversacion["compra"]) : "ninguno",
    pago: typeof c.pago === "string" ? (c.pago as EstadoConversacion["pago"]) : "ninguno",
    entregaEstado: typeof c.entregaEstado === "string" ? (c.entregaEstado as EstadoConversacion["entregaEstado"]) : "no_aplica",
    ultimaHerramienta:
      c.ultimaHerramienta && typeof c.ultimaHerramienta === "object" ? (c.ultimaHerramienta as EstadoConversacion["ultimaHerramienta"]) : null,
    ultimaPreguntaAgente: typeof c.ultimaPreguntaAgente === "string" ? c.ultimaPreguntaAgente : null,
    ultimoMensajeClienteTexto: typeof c.ultimoMensajeClienteTexto === "string" ? c.ultimoMensajeClienteTexto : null,
    siguienteAccion: typeof c.siguienteAccion === "string" ? c.siguienteAccion : null,
    resumenActualizadoEn: typeof c.resumenActualizadoEn === "string" ? c.resumenActualizadoEn : null,
    contextosPrevios: Array.isArray(c.contextosPrevios) ? (c.contextosPrevios as EstadoConversacion["contextosPrevios"]).slice(-5) : [],
    detalleProducto: c.detalleProducto && typeof c.detalleProducto === "object" ? (c.detalleProducto as EstadoConversacion["detalleProducto"]) : {},
    servicio: c.servicio && typeof c.servicio === "object" ? (c.servicio as EstadoConversacion["servicio"]) : null,
    consultoria: c.consultoria && typeof c.consultoria === "object" ? (c.consultoria as EstadoConversacion["consultoria"]) : null,
    pasosCompletados: Array.isArray(c.pasosCompletados) ? c.pasosCompletados.map(String) : [],
    pagoMetodo: typeof c.pagoMetodo === "string" ? c.pagoMetodo : null,
    entregaMetodo: typeof c.entregaMetodo === "string" ? c.entregaMetodo : null,
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

/* ── FASE 1/4/7: escrituras deterministas (las llaman herramientas/motor) ── */

/** Fija la intención declarada por el modelo, conservando la anterior. */
export function registrarIntencion(estado: EstadoConversacion, intencion: Intencion): void {
  if (estado.intencionActual !== intencion) estado.intencionAnterior = estado.intencionActual;
  estado.intencionActual = intencion;
}

/** Última herramienta ejecutada (para F2: "el segundo/ese" se resuelve con esto). */
export function registrarHerramienta(
  estado: EstadoConversacion,
  nombre: string,
  args: any,
  ok: boolean,
): void {
  estado.ultimaHerramienta = { nombre, args, ok, at: ahora() };
}

/** Hechos entregados/pedidos sin releer el historial. Sin duplicados. */
export function registrarHechoEntregado(estado: EstadoConversacion, hecho: string): void {
  const h = String(hecho || "").trim();
  if (h && !estado.hechosEntregados.includes(h)) estado.hechosEntregados.push(h);
}

export function registrarHechoPedido(estado: EstadoConversacion, hecho: string): void {
  const h = String(hecho || "").trim();
  if (h && !estado.hechosPedidos.includes(h)) estado.hechosPedidos.push(h);
}

/**
 * FASE 5 — Resumen de HECHOS (no transcripción) para conversaciones largas.
 * Se deriva del estado estructurado: nunca inventa, nunca cita texto viejo.
 */
export function actualizarResumenDesdeEstado(
  estado: EstadoConversacion,
  nombrePorProducto: (id: number) => string,
): string {
  const partes: string[] = [];
  if (estado.productoEnFoco != null) partes.push(`Interesado en ${nombrePorProducto(estado.productoEnFoco)}`);
  const enviadas = Object.entries(estado.seccionesEnviadas).flatMap(([id, secs]) =>
    Object.keys(secs).map((s) => `${s} de ${nombrePorProducto(Number(id))}`),
  );
  if (enviadas.length) partes.push(`Ya recibió: ${enviadas.join(", ")}`);
  if (estado.ultimaOferta && estado.ultimaOferta.tipo !== "ninguna") partes.push(`Último ofrecido: ${estado.ultimaOferta.resumen}`);
  const datos = Object.entries(estado.datos).filter(([, v]) => String(v || "").trim());
  if (datos.length) partes.push(`Datos: ${datos.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  if (estado.objecionesVistas.length) partes.push(`Dudas: ${estado.objecionesVistas.join("; ")}`);
  partes.push(`Compra: ${estado.compra}; pago: ${estado.pago}; entrega: ${estado.entregaEstado}`);
  if (estado.servicio?.necesidad) partes.push(`Servicio: ${estado.servicio.necesidad}`);
  if (estado.consultoria?.problema) partes.push(`Consultoría: ${estado.consultoria.problema}`);
  if (estado.pasosCompletados.length) partes.push(`Pasos: ${estado.pasosCompletados.join(", ")}`);
  const resumen = partes.join(". ") + ".";
  estado.resumenPrevio = resumen;
  estado.resumenActualizadoEn = ahora();
  return resumen;
}

/**
 * Apila el contexto activo antes de cambiarlo (máx 5). Permite "y la cámara?"
 * tras hablar de laptop sin rebuscar texto. No borra historial.
 */
export function apilarContexto(estado: EstadoConversacion, resumen: string): void {
  estado.contextosPrevios.push({
    producto: estado.productoEnFoco,
    intencion: estado.intencionActual,
    compra: estado.compra,
    resumen: String(resumen || "").slice(0, 200),
    at: ahora(),
  });
  if (estado.contextosPrevios.length > 5) estado.contextosPrevios = estado.contextosPrevios.slice(-5);
}

/** Marca un paso del proceso una sola vez (para "estábamos en pago"). */
export function marcarPaso(estado: EstadoConversacion, paso: string): void {
  const p = String(paso || "").trim();
  if (p && !estado.pasosCompletados.includes(p)) estado.pasosCompletados.push(p);
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
    if (estado.productoAnterior != null && estado.productoAnterior !== estado.productoEnFoco) {
      l.push(`Producto anterior: ${nombrePorProducto(estado.productoAnterior)} (solo para "volver al anterior", no lo mezcles con el actual).`);
    }
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

  // FASE 2 — Resolución de referencias sin buscar en texto viejo.
  // "sí/no/ese/esa/el primero/el segundo/ese curso/lo quiero/dale/ok/
  //  mándame ese/cuánto?/y ese?" se resuelve con ESTO, en este orden:
  //  mensaje actual → última pregunta del agente → producto activo →
  //  producto anterior → última herramienta → estado.
  if (estado.opcionesMostradas.length >= 2) {
    const orden = estado.opcionesMostradas
      .map((id, i) => `${i + 1}) ${nombrePorProducto(id)}`)
      .join(" · ");
    l.push(
      `Le mostraste ${estado.opcionesMostradas.length} opciones EN ESTE ORDEN: ${orden}. ` +
        `Si el cliente dice "el primero/el segundo/la tercera/este/ese/esa/me gusta este", ` +
        `mapealo a esa posición y usá enfocar_producto con el id de esa posición. NO vuelvas a preguntar "¿cuál?".`,
    );
  }
  if (estado.ultimaPreguntaAgente) {
    l.push(`Tu última pregunta fue: "${estado.ultimaPreguntaAgente}". Un "sí/no/ese/dale/ok" contesta A ESO.`);
  }
  if (estado.preguntaPendiente) {
    l.push(`Pregunta pendiente: ${estado.preguntaPendiente}. Resolvé la referencia contra esto antes de cambiar de tema.`);
  }
  if (estado.ultimaHerramienta) {
    l.push(
      `Última herramienta: ${estado.ultimaHerramienta.nombre} (${estado.ultimaHerramienta.ok ? "ok" : "falló"}). ` +
        `Si pide "ese/el segundo/cuánto" es sobre el producto en foco, no sobre otro del catálogo.`,
    );
  }
  if (estado.intencionActual) {
    l.push(`Intención actual: ${estado.intencionActual}. Si cambia de producto o de intención, actualizala con anotar_contexto.`);
  }
  if (estado.accionPendiente || estado.siguienteAccion) {
    l.push(`Lo próximo: ${estado.accionPendiente || estado.siguienteAccion}. No saltes al cierre ni repitas lo ya entregado.`);
  }
  if (estado.compra !== "ninguno" || estado.pago !== "ninguno" || estado.entregaEstado !== "no_aplica") {
    l.push(`Proceso: compra=${estado.compra}, pago=${estado.pago}, entrega=${estado.entregaEstado}. No afirmes un paso que no esté completado.`);
  }
  if (estado.hechosEntregados.length) {
    l.push(`Hechos ya entregados (no los repitas): ${estado.hechosEntregados.slice(-8).join("; ")}.`);
  }
  // Multimodelo: contextos previos, detalle operativo, servicio/consultoría.
  if (estado.contextosPrevios.length) {
    const previos = estado.contextosPrevios
      .map((c) => (c.producto != null ? `${nombrePorProducto(c.producto)} (${c.compra})` : `explorando (${c.compra})`))
      .join(" ← ");
    l.push(`Hablaban antes de: ${previos}. "Y el/la [anterior]?" vuelve ahí sin mezclar.`);
  }
  for (const [id, d] of Object.entries(estado.detalleProducto)) {
    const bits: string[] = [];
    if (d.variante) bits.push(`variante ${d.variante}`);
    if (d.cantidad) bits.push(`cantidad ${d.cantidad}`);
    if (d.stockEstado) bits.push(`stock: ${d.stockEstado}${d.stock != null ? ` (${d.stock})` : ""}`);
    if (bits.length) l.push(`De ${nombrePorProducto(Number(id))}: ${bits.join(", ")}. No afirmes stock que no esté acá.`);
  }
  if (estado.servicio?.necesidad) {
    l.push(
      `Caso de servicio: ${estado.servicio.necesidad}${estado.servicio.alcance ? `; alcance: ${estado.servicio.alcance}` : ""}` +
        `${estado.servicio.citaCuando ? `; cita: ${estado.servicio.citaCuando}` : ""}. Primero diagnosticá, después cotizás.`,
    );
  }
  if (estado.consultoria?.problema || estado.consultoria?.objetivo) {
    l.push(
      `Consultoría: problema=${estado.consultoria.problema || "?"}, objetivo=${estado.consultoria.objetivo || "?"}` +
        `${estado.consultoria.alcance ? `, alcance=${estado.consultoria.alcance}` : ""}` +
        `${estado.consultoria.cotizacion ? `, cotización=${estado.consultoria.cotizacion}` : ""}. ` +
        `Entendé el problema antes de cotizar; si el precio depende del alcance, decilo y registrá el caso.`,
    );
  }
  if (estado.pasosCompletados.length) {
    l.push(`Pasos ya completados: ${estado.pasosCompletados.join(", ")}. Retomá desde ahí, no desde cero.`);
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

/** Compras ya comprometidas: el cliente que vuelve puede venir por su pedido. */
const COMPRA_COMPROMETIDA: EstadoCompra[] = ["pago_reportado", "pago_confirmado", "pedido_creado", "entregado"];

/**
 * El cliente volvió después de horas: es una VISITA NUEVA, no la continuación
 * de la venta de ayer.
 *
 * Antes el estado quedaba intacto -- producto en foco, "lo último que le
 * ofreciste", pregunta pendiente, "lo próximo: esperar respuesta a la oferta"
 * -- y el prompt decía "retomá donde quedaron". Resultado: un "hola" al otro
 * día recibía "¿y pudiste decidirte por el corrector?". El dueño lo describió
 * como un vendedor que quiere vender a toda costa en vez de ayudar.
 *
 * Lo pendiente de la venta vieja se archiva (queda como producto anterior y en
 * la pila de contextos, para "¿y el de ayer?"), pero deja de empujar. Lo que
 * el cliente ya contó de sí mismo, lo que ya se le envió y una compra ya
 * comprometida (pagó, tiene pedido) se conservan: eso es memoria, no presión.
 */
export function abrirVisitaNueva(estado: EstadoConversacion): void {
  if (estado.productoEnFoco != null) {
    apilarContexto(estado, "visita anterior");
    estado.productoAnterior = estado.productoEnFoco;
    estado.productoEnFoco = null;
  }
  estado.opcionesMostradas = [];
  estado.ultimaOferta = null;
  estado.preguntaPendiente = null;
  estado.ultimaPreguntaAgente = null;
  estado.accionPendiente = null;
  estado.siguienteAccion = null;
  estado.ultimaHerramienta = null;
  estado.intencionAnterior = estado.intencionActual;
  estado.intencionActual = null;
  // `pago` no se toca: "ya le mandaste los datos de pago" es un hecho, y si
  // vuelve con un "ya" es justamente lo que hace falta para entenderlo.
  if (!COMPRA_COMPROMETIDA.includes(estado.compra)) estado.compra = "ninguno";
}
