/**
 * LA PRÓXIMA ACCIÓN DE CADA LEAD.
 *
 * Regla del spec de V2: "No dejar leads sin siguiente acción". Hoy un lead
 * queda quieto en una etapa y nadie sabe qué falta para que compre — ni el
 * dueño mirando el panel, ni el vendedor humano cuando le transfieren el chat.
 *
 * Esto NO decide qué responder en el turno: de eso se ocupa el manual de venta
 * (`sales-playbook.ts`), que mira el mensaje concreto. Esto responde la otra
 * pregunta, la que se hace MIRANDO LA LISTA: "de estos diez, ¿cuál atiendo y
 * qué le falta?".
 *
 * Es logica pura a proposito: se calcula al vuelo desde el estado que ya
 * existe. Guardarla en una columna crearia una segunda verdad que se queda
 * vieja apenas el cliente escribe.
 */

export type AccionSugerida =
  | "responder"          // le debemos respuesta: escribió último
  | "cobrar"             // pidió pagar o está en el cierre
  | "resolver_objecion"  // puso una objeción sin resolver
  | "mostrar_producto"   // no vio ninguna ficha todavía
  | "descubrir"          // no sabemos qué quiere lograr
  | "recuperar"          // llegó lejos y se enfrió
  | "entregar"           // pagó: hay que asegurarse de que lo reciba
  | "esperar";           // ya se le escribió y no volvió: no insistir

export interface EntradaNBA {
  etapa: string | null;
  estadoDePago: string | null;
  /** ¿El último mensaje de la conversación es del cliente? */
  clienteEscribioUltimo: boolean;
  horasSinEscribir: number;
  /** Fichas que ya vio (del perfil comercial). */
  productosVistos: number;
  /** Objeciones registradas y todavía no resueltas. */
  objecionAbierta: string | null;
  /** ¿Ya se le mandó un seguimiento sin que volviera a escribir? */
  seguimientoSinRespuesta: boolean;
}

export interface SiguienteAccion {
  accion: AccionSugerida;
  /** Frase lista para mostrarle al dueño o al vendedor humano. */
  detalle: string;
  /** 1 = atender ya. 5 = puede esperar. Sirve para ordenar la lista. */
  prioridad: 1 | 2 | 3 | 4 | 5;
}

/**
 * El orden de las ramas ES la política comercial, y por eso va comentado:
 * lo urgente primero, y lo que no se debe hacer (insistirle a quien ya no
 * contesta) al final.
 */
export function siguienteAccion(e: EntradaNBA): SiguienteAccion {
  // 1. Pagó: se terminó de vender. Lo único que importa es que lo reciba.
  if (e.estadoDePago === "confirmed") {
    return { accion: "entregar", detalle: "Ya pagó: confirmá que recibió el acceso o el envío.", prioridad: 2 };
  }

  // 2. Escribió último: le debemos una respuesta. Nada gana a esto -- es la
  //    única situación donde el cliente está esperando AHORA.
  if (e.clienteEscribioUltimo) {
    return { accion: "responder", detalle: "Te escribió y sigue esperando respuesta.", prioridad: 1 };
  }

  // 3. Está en el cierre sin pagar: es la plata más cerca de entrar.
  if (["closing", "negotiating"].includes(String(e.etapa || ""))) {
    return { accion: "cobrar", detalle: "Llegó al cierre y no pagó: falta cobrarle.", prioridad: 1 };
  }

  // 4. Objeción sin resolver: la venta está frenada por algo concreto y sabido.
  if (e.objecionAbierta) {
    return {
      accion: "resolver_objecion",
      detalle: `Quedó frenado por una objeción de tipo "${e.objecionAbierta}".`,
      prioridad: 2,
    };
  }

  // 5. Ya se le escribió y no volvió. Insistir es lo que hace que bloqueen el
  //    número, así que esta rama va ANTES de cualquier otra que proponga
  //    escribirle de nuevo.
  if (e.seguimientoSinRespuesta) {
    return { accion: "esperar", detalle: "Ya se le hizo seguimiento y no respondió: no insistir.", prioridad: 5 };
  }

  // 6. Llegó lejos y se enfrió: recuperable mientras sea reciente.
  if (e.productosVistos > 0 && e.horasSinEscribir >= 3 && e.horasSinEscribir <= 7 * 24) {
    return { accion: "recuperar", detalle: "Vio el producto y se enfrió: se puede recuperar.", prioridad: 2 };
  }

  // 7. Nunca vio una ficha: todavía no hay nada que decidir.
  if (e.productosVistos === 0) {
    return { accion: "mostrar_producto", detalle: "Todavía no vio ningún producto.", prioridad: 3 };
  }

  return { accion: "descubrir", detalle: "Falta saber qué quiere lograr para poder argumentar.", prioridad: 4 };
}
