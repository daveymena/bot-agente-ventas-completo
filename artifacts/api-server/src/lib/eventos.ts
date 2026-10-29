/**
 * ============================================================================
 * EVENTOS EN VIVO — el canal que hace que Atlas y los agentes se vean vivos
 * ============================================================================
 *
 * Hasta ahora, el panel se enteraba de lo que pasaba **preguntando**: cada
 * pantalla hacía su fetch y el usuario tenía que refrescar para ver un mensaje
 * nuevo, un pago confirmado o un pedido que entró. En una plataforma que
 * atiende clientes reales por WhatsApp eso se nota: el dueño mira la pantalla
 * y no sabe si el bot está trabajando o está caído.
 *
 * Este módulo es el BUS: las partes del backend avisan lo que pasa y el panel
 * lo recibe al instante, sin refrescar y sin polling.
 *
 * ── Decisión de diseño: el bus NO conoce el WebSocket ─────────────────────
 *
 * `emitir()` no sabe si hay alguien escuchando por WebSocket, ni cuántos, ni
 * quién. Solo publica. El transporte (el servidor WS, en `routes/eventos.ts`)
 * se suscribe al bus como un oyente más. Así:
 *
 *   · El motor de ventas puede emitir sin depender de la capa HTTP.
 *   · Los tests prueban la entrega sin levantar un servidor.
 *   · Mañana el mismo bus alimenta un webhook o un log sin tocar a quien emite.
 *
 * ── El aislamiento por negocio va acá, no en el transporte ────────────────
 *
 * Un evento SIEMPRE lleva `tenantId`. El transporte filtra por el negocio de
 * la sesión que se conectó. Poner ese filtro en un solo lugar (y probarlo) es
 * lo que evita que un negocio vea los mensajes de otro — el mismo cuidado que
 * ya aplica el resto del sistema.
 */

import type { ServerResponse } from "node:http";

/* ─────────────────────────── Los eventos ─────────────────────────── */

/**
 * Los tipos de evento que el panel consume hoy. Es una lista cerrada a
 * propósito: un nombre inventado en un `emitir()` no llega a ningún lado y se
 * descubre tarde.
 */
export type TipoDeEvento =
  | "mensaje.nuevo"
  | "mensaje.estado"
  | "agente.escribiendo"
  | "agente.respondio"
  | "conversacion.actualizada"
  | "pago.confirmado"
  | "pedido.creado"
  | "pedido.actualizado"
  | "lead.nuevo"
  | "job.actualizado"
  | "campana.actualizada";

export interface EventoEnVivo<T = any> {
  tipo: TipoDeEvento;
  /** El negocio dueño del evento. El transporte filtra por esto. */
  tenantId: number;
  /** Datos del evento. Cada tipo define su forma (ver más abajo). */
  datos: T;
  /** ISO. Lo pone el bus, no quien emite: así el orden es consistente. */
  at: string;
  /** Secuencia monótona por proceso. Sirve para detectar huecos tras reconectar. */
  seq: number;
}

/* ─────────────────────── Formas de cada evento ─────────────────────── */
/* Documentadas para que el frontend sepa qué esperar sin adivinar. */

export interface DatosMensajeNuevo {
  conversationId: number;
  messageId?: number | null;
  rol: "customer" | "agent" | "system";
  texto: string;
  contactName?: string | null;
}

export interface DatosAgenteEscribiendo {
  conversationId: number;
  escribiendo: boolean;
}

export interface DatosAgenteRespondio {
  conversationId: number;
  texto: string;
  /** De qué motor salió, para el diagnóstico en vivo. */
  motor?: "v1" | "v2";
  /** Cuántas herramientas usó el turno. */
  herramientas?: number;
}

export interface DatosPagoConfirmado {
  conversationId: number;
  tenantId: number;
  monto?: number | null;
  moneda?: string | null;
}

export interface DatosPedido {
  pedidoId: number;
  conversationId?: number | null;
  estado: string;
  producto?: string | null;
  /** Solo en `pedido.actualizado`: qué cambió. */
  cambio?: string;
}

/* ─────────────────────────── El bus ─────────────────────────── */

type Oyente = (e: EventoEnVivo) => void;

const oyentes = new Set<Oyente>();
let secuencia = 0;

/**
 * Publica un evento. Nunca lanza: un oyente roto no puede tumbar el turno del
 * vendedor. Es la misma regla que ya aplica cada herramienta del motor.
 */
export function emitir<T>(tipo: TipoDeEvento, tenantId: number, datos: T): EventoEnVivo<T> | null {
  const id = Number(tenantId);
  if (!Number.isFinite(id) || id <= 0) {
    // Sin negocio no se puede filtrar, y un evento sin dueño se vería en todos
    // los paneles. Se descarta y queda el rastro.
    console.warn(`[Eventos] se descartó ${tipo}: tenantId inválido (${tenantId})`);
    return null;
  }

  const evento: EventoEnVivo<T> = {
    tipo,
    tenantId: id,
    datos,
    at: new Date().toISOString(),
    seq: ++secuencia,
  };

  for (const oyente of oyentes) {
    try {
      oyente(evento as EventoEnVivo);
    } catch (err: any) {
      console.warn(`[Eventos] un oyente falló con ${tipo}: ${err?.message || err}`);
    }
  }
  return evento;
}

/** Suscribe un oyente. Devuelve la función para darse de baja. */
export function suscribir(oyente: Oyente): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/** Cuántos oyentes hay (para diagnóstico y tests). */
export function oyentesActivos(): number {
  return oyentes.size;
}

/** La secuencia actual (para que un cliente reconectado sepa si perdió eventos). */
export function secuenciaActual(): number {
  return secuencia;
}

/* ─────────────────────── Transporte: WebSocket ─────────────────────── */

/**
 * Conexión viva con el panel. Se guarda el `tenantId` para filtrar.
 */
export interface ConexionEnVivo {
  tenantId: number;
  enviar: (texto: string) => void;
  cerrar: () => void;
}

const conexiones = new Set<ConexionEnVivo>();

/**
 * Registra una conexión y devuelve cómo darse de baja.
 *
 * El filtro va acá: una conexión solo recibe los eventos de SU negocio. Es el
 * único punto donde se decide qué ve cada panel.
 */
export function conectar(c: ConexionEnVivo): () => void {
  conexiones.add(c);
  const baja = () => conexiones.delete(c);
  return baja;
}

/** Cuántas conexiones hay abiertas (para diagnóstico y tests). */
export function conexionesActivas(): number {
  return conexiones.size;
}

/**
 * Reparte un evento a las conexiones de su negocio.
 *
 * Un `enviar` que falle (socket ya cerrado) solo quita esa conexión: no
 * interrumpe a las demás ni al bus.
 */
export function repartir(evento: EventoEnVivo): number {
  let entregados = 0;
  for (const c of [...conexiones]) {
    if (c.tenantId !== evento.tenantId) continue;
    try {
      c.enviar(JSON.stringify(evento));
      entregados++;
    } catch {
      conexiones.delete(c);
    }
  }
  return entregados;
}

/**
 * Arranca el puente bus → conexiones. Se llama UNA vez al iniciar el servidor.
 * Devuelve la función para desmontarlo (tests y apagado ordenado).
 */
export function arrancarPuenteEnVivo(): () => void {
  return suscribir((evento) => {
    repartir(evento);
  });
}

/* ─────────────────────── Handshake (respuesta HTTP) ─────────────────────── */

/**
 * Responde el `upgrade` de WebSocket.
 *
 * Se implementa a mano (no con `ws.Server`) porque el servidor ya tiene su
 * propio `http.Server` y un `noServer` con verificación de negocio es más
 * simple de razonar y de probar que enganchar un servidor paralelo.
 */
export function respuestaDeUpgrade(aceptar: boolean, motivo?: string): string {
  if (aceptar) return "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n";
  return (
    `HTTP/1.1 401 Unauthorized\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n` +
    `Connection: close\r\n\r\n` +
    (motivo || "No autorizado")
  );
}

/** Rechaza el upgrade de forma limpia, sin dejar el socket colgado. */
export function rechazarUpgrade(socket: { write: (s: string) => void; destroy: () => void }, motivo: string): void {
  try {
    socket.write(respuestaDeUpgrade(false, motivo));
  } catch {
    /* el socket ya puede estar cerrado */
  }
  socket.destroy();
}

/** Helper para pruebas y para el apagado: cierra todas las conexiones. */
export function cerrarTodas(): void {
  for (const c of [...conexiones]) {
    try {
      c.cerrar();
    } catch {
      /* no crítico */
    }
    conexiones.delete(c);
  }
}

/** Limpia todo el estado del módulo. Solo para tests. */
export function _reiniciarParaPruebas(): void {
  oyentes.clear();
  conexiones.clear();
  secuencia = 0;
}

/* Marca de que este módulo no depende de Express ni de la base: se puede
 * importar desde cualquier parte del backend sin arrastrar nada. */
export type { ServerResponse };
