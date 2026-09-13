/**
 * ESTADO EXPLÍCITO DE LA CONVERSACIÓN
 * ===================================
 *
 * Principio único de todo el motor nuevo:
 *
 *   Un hecho se REGISTRA en el momento en que ocurre.
 *   Nunca se adivina después leyendo el texto con expresiones regulares.
 *
 * El motor viejo preguntaba "¿le ofrecimos el precio?" corriendo una regex
 * sobre los mensajes anteriores. Eso falla siempre que aparece una redacción
 * nueva, y por eso cada arreglo destapaba otro bug. Aquí, cuando el bot da un
 * precio, la herramienta `dar_precio` escribe `ultimaOferta = {tipo:"precio"}`.
 * Cuando llega un "sí", "dale", "obvio", "de una" o cualquier otra forma que
 * ni se nos ocurrió, no hay nada que interpretar: el servidor YA SABE qué
 * ofreció.
 */

export type TipoOferta =
  | "precio"
  | "ficha"
  | "video"
  | "datos_de_pago"
  | "pregunta_abierta"
  | "ninguna";

export type Etapa =
  | "saludo"
  | "explorando"
  | "producto_en_foco"
  | "precio_dado"
  | "cierre"
  | "postventa";

export interface Oferta {
  tipo: TipoOferta;
  productoId: number | null;
  /** Texto corto de lo que se le ofreció, para el bloque de contexto. */
  resumen: string;
  at: string; // ISO
}

export interface EstadoConversacion {
  conversationId: number;

  /** Producto del que se está hablando ahora. null = todavía explorando. */
  productoEnFoco: number | null;

  /**
   * Qué se le mandó al cliente y cuándo. La clave es el productId.
   * Esto reemplaza a `elVideoYaSalio()` y a toda la familia de funciones que
   * escaneaban el historial buscando enlaces y emojis 🎬 para deducirlo.
   */
  fichasEnviadas: Record<number, { seccion: string; at: string }>;
  videosEnviados: Record<number, { url: string; at: string }>;
  preciosDados: Record<number, { valor: number; moneda: string; at: string }>;
  datosDePagoEnviados: Record<number, { at: string }>;

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

  etapa: Etapa;

  /** Última vez que el cliente escribió. Para saludar distinto si volvió al otro día. */
  ultimoMensajeCliente: string | null;

  /** Resumen de la conversación vieja, cuando ya no cabe entera en contexto. */
  resumenPrevio: string | null;
}

export function estadoInicial(conversationId: number): EstadoConversacion {
  return {
    conversationId,
    productoEnFoco: null,
    fichasEnviadas: {},
    videosEnviados: {},
    preciosDados: {},
    datosDePagoEnviados: {},
    ultimaOferta: null,
    pagoConfirmadoPorHumano: false,
    comprobanteRecibido: false,
    etapa: "saludo",
    ultimoMensajeCliente: null,
    resumenPrevio: null,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * PERSISTENCIA
 *
 * ADAPTAR AL ESQUEMA REAL: el estado se guarda como una columna `jsonb`
 * llamada `estado_agente` en la tabla `conversations`. La migración está en
 * README-RECONSTRUCCION.md. Se eligió jsonb en vez de 12 columnas nuevas para
 * que agregar un campo más adelante no requiera otra migración.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface RepositorioEstado {
  cargar(conversationId: number): Promise<EstadoConversacion>;
  guardar(estado: EstadoConversacion): Promise<void>;
}

/**
 * Implementación con Drizzle. Se deja aislada acá para que el resto del motor
 * no sepa nada de la base de datos y se pueda probar sin ella.
 */
export function crearRepositorioDrizzle(deps: {
  db: any;
  conversations: any;
  eq: (a: any, b: any) => any;
}): RepositorioEstado {
  const { db, conversations, eq } = deps;

  return {
    async cargar(conversationId) {
      const [fila] = await db
        .select({ estado: conversations.estadoAgente })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);

      if (!fila?.estado) return estadoInicial(conversationId);

      // Mezcla con el inicial para que un estado viejo al que le falte un campo
      // nuevo no rompa nada tras un despliegue.
      return { ...estadoInicial(conversationId), ...fila.estado, conversationId };
    },

    async guardar(estado) {
      await db
        .update(conversations)
        .set({ estadoAgente: estado })
        .where(eq(conversations.id, estado.conversationId));
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * LECTURA DEL ESTADO PARA EL MODELO
 *
 * En vez de meterle al prompt 40 notas condicionales escritas a mano
 * (`notaDelSi`, `notaDeRegreso`, `notaDeContenido`... como venía haciendo
 * agent.ts), se le entrega UN bloque de hechos. El modelo razona sobre hechos,
 * que es lo que sabe hacer bien.
 * ──────────────────────────────────────────────────────────────────────────── */

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

  const fichas = Object.keys(estado.fichasEnviadas).map(Number);
  if (fichas.length) {
    l.push(
      `Fichas que YA le enviaste (no las repitas salvo que las pida): ${fichas
        .map((id) => nombrePorProducto(id))
        .join(", ")}.`,
    );
  }

  const videos = Object.keys(estado.videosEnviados).map(Number);
  if (videos.length) {
    l.push(
      `Videos que YA le enviaste (no los repitas): ${videos
        .map((id) => nombrePorProducto(id))
        .join(", ")}.`,
    );
  }

  const precios = Object.keys(estado.preciosDados).map(Number);
  if (precios.length) {
    l.push(
      `Precios que ya le diste: ${precios
        .map((id) => {
          const p = estado.preciosDados[id];
          return `${nombrePorProducto(id)} (${p.moneda} ${p.valor.toLocaleString("es-CO")})`;
        })
        .join(", ")}.`,
    );
  }

  // Esto es lo que desambigua un "sí" pelado, sin una sola regex.
  if (estado.ultimaOferta && estado.ultimaOferta.tipo !== "ninguna") {
    l.push(
      `LO ÚLTIMO QUE LE OFRECISTE: ${estado.ultimaOferta.resumen}. ` +
        `Si el cliente responde afirmativamente de cualquier forma ("sí", "dale", ` +
        `"listo", "obvio", un pulgar arriba), está aceptando ESO y nada más.`,
    );
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

  if (estado.resumenPrevio) {
    l.push(`Resumen de lo que hablaron antes: ${estado.resumenPrevio}`);
  }

  return l.join("\n");
}

/** Cuánto tiempo pasó desde el último mensaje del cliente, en horas. */
export function horasDesdeUltimoMensaje(estado: EstadoConversacion): number | null {
  if (!estado.ultimoMensajeCliente) return null;
  const ms = Date.now() - new Date(estado.ultimoMensajeCliente).getTime();
  return ms / (1000 * 60 * 60);
}
