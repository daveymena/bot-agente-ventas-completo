/**
 * ============================================================================
 * useEventosEnVivo — el panel se entera de lo que pasa sin refrescar
 * ============================================================================
 *
 * Abre el WebSocket del canal en vivo (`/api/eventos`), se reconecta solo si se
 * cae, y entrega cada evento a quien lo escuche.
 *
 * ── Reconexión con memoria ────────────────────────────────────────────────
 *
 * Un WebSocket se cae: el portátil se durmió, cambió la red, el proxy cortó.
 * Cuando eso pasa en un panel de ventas, el dueño se queda mirando una pantalla
 * congelada **sin saberlo** — peor que no tener tiempo real, porque confía en
 * lo que ve.
 *
 * Por eso el hook distingue tres estados y los expone (`estado`):
 *
 *   "conectando"  → abriendo
 *   "vivo"        → conectado y recibiendo
 *   "reconectando"→ se cayó y está reintentando (con backoff)
 *
 * Y guarda la última secuencia vista: si al reconectar el servidor dice que
 * hubo eventos en el medio, marca `huboHueco` para que la pantalla haga un
 * refetch en vez de quedar desincronizada en silencio.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/* ─────────────────────── Tipos (espejo del backend) ─────────────────────── */

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
  tipo: TipoDeEvento | "conectado" | "pong";
  tenantId?: number;
  datos?: T;
  at: string;
  seq?: number;
}

export type EstadoDelCanal = "conectando" | "vivo" | "reconectando";

export interface OpcionesDeEventos {
  /** Se llama con cada evento del negocio. */
  onEvento?: (e: EventoEnVivo) => void;
  /** Solo estos tipos. Sin esto, llegan todos. */
  tipos?: TipoDeEvento[];
  /** Apaga el canal sin desmontar el componente (útil en pestañas ocultas). */
  activo?: boolean;
}

export interface ResultadoDeEventos {
  estado: EstadoDelCanal;
  /** La conexión está viva y autenticada. */
  conectado: boolean;
  /**
   * Al reconectar, el servidor tenía eventos más nuevos que los vistos: la
   * pantalla debería refrescar sus datos.
   */
  huboHueco: boolean;
  /** ISO del último evento recibido. */
  ultimoEventoEn: string | null;
  /** Cuántas reconexiones van (para diagnóstico en pantalla). */
  reconexiones: number;
  /** Fuerza un cierre y reapertura. */
  reconectar: () => void;
}

/** Backoff: arranca rápido y se estira, con techo. */
const ESPERA_BASE_MS = 1_000;
const ESPERA_MAX_MS = 30_000;

/**
 * Construye la URL del canal respetando el protocolo de la página.
 * En producción el panel va por HTTPS, así que el socket tiene que ser WSS:
 * un `ws://` desde una página `https://` lo bloquea el navegador.
 */
function urlDelCanal(): string {
  const protocolo = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocolo}//${window.location.host}/api/eventos`;
}

export function useEventosEnVivo(opciones: OpcionesDeEventos = {}): ResultadoDeEventos {
  const { onEvento, tipos, activo = true } = opciones;

  const [estado, setEstado] = useState<EstadoDelCanal>("conectando");
  const [huboHueco, setHuboHueco] = useState(false);
  const [ultimoEventoEn, setUltimoEventoEn] = useState<string | null>(null);
  const [reconexiones, setReconexiones] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const intentosRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cerradoAManoRef = useRef(false);
  const ultimaSeqRef = useRef<number | null>(null);

  // El callback y los tipos van en refs: si el componente los recrea en cada
  // render, el efecto no debe reconectar por eso.
  const onEventoRef = useRef(onEvento);
  const tiposRef = useRef(tipos);
  useEffect(() => {
    onEventoRef.current = onEvento;
    tiposRef.current = tipos;
  }, [onEvento, tipos]);

  const conectar = useCallback(() => {
    if (!activo) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    cerradoAManoRef.current = false;
    setEstado(intentosRef.current === 0 ? "conectando" : "reconectando");

    let ws: WebSocket;
    try {
      ws = new WebSocket(urlDelCanal());
    } catch {
      // El navegador puede rechazar la construcción (URL inválida): se reintenta.
      programarReintento();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      intentosRef.current = 0;
      setEstado("vivo");
    };

    ws.onmessage = (ev) => {
      let evento: EventoEnVivo;
      try {
        evento = JSON.parse(String(ev.data));
      } catch {
        return; // mensaje no-JSON: se ignora en vez de romper el panel
      }

      // Saludo del servidor: dice en qué secuencia está el backend. Si es más
      // nueva que la última vista, hubo eventos mientras estábamos caídos.
      if (evento.tipo === "conectado") {
        const seqServidor = Number(evento.seq ?? 0);
        if (ultimaSeqRef.current !== null && seqServidor > ultimaSeqRef.current) {
          setHuboHueco(true);
        }
        ultimaSeqRef.current = seqServidor;
        return;
      }
      if (evento.tipo === "pong") return;

      if (typeof evento.seq === "number") {
        if (ultimaSeqRef.current !== null && evento.seq > ultimaSeqRef.current + 1) {
          // Se perdió al menos un evento entre medio.
          setHuboHueco(true);
        }
        ultimaSeqRef.current = evento.seq;
      }

      setUltimoEventoEn(evento.at || new Date().toISOString());

      const filtro = tiposRef.current;
      if (filtro && filtro.length && !filtro.includes(evento.tipo as TipoDeEvento)) return;

      try {
        onEventoRef.current?.(evento);
      } catch (err) {
        // Un consumidor que lanza no puede tumbar el canal.
        console.warn("[Eventos] el consumidor lanzó:", err);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (cerradoAManoRef.current || !activo) return;
      setEstado("reconectando");
      programarReintento();
    };

    ws.onerror = () => {
      // `onclose` viene después y es quien reintenta.
    };

    function programarReintento() {
      if (cerradoAManoRef.current || !activo) return;
      const n = intentosRef.current++;
      setReconexiones(n + 1);
      const espera = Math.min(ESPERA_BASE_MS * 2 ** n, ESPERA_MAX_MS);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => conectarRef.current(), espera);
    }
  }, [activo]);

  // `conectar` se referencia a sí misma desde el reintento; el ref evita el
  // ciclo de dependencias que dejaría el efecto corriendo en cada render.
  const conectarRef = useRef(conectar);
  useEffect(() => {
    conectarRef.current = conectar;
  }, [conectar]);

  useEffect(() => {
    if (!activo) {
      cerradoAManoRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      try {
        wsRef.current?.close();
      } catch {
        /* no crítico */
      }
      wsRef.current = null;
      return;
    }
    conectarRef.current();
    return () => {
      cerradoAManoRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      try {
        wsRef.current?.close();
      } catch {
        /* no crítico */
      }
      wsRef.current = null;
    };
  }, [activo]);

  const reconectar = useCallback(() => {
    cerradoAManoRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      wsRef.current?.close();
    } catch {
      /* no crítico */
    }
    wsRef.current = null;
    intentosRef.current = 0;
    setHuboHueco(false);
    // Tras el cierre a mano, se vuelve a abrir en el próximo tick.
    setTimeout(() => {
      cerradoAManoRef.current = false;
      conectarRef.current();
    }, 0);
  }, []);

  return {
    estado,
    conectado: estado === "vivo",
    huboHueco,
    ultimoEventoEn,
    reconexiones,
    reconectar,
  };
}

/* ─────────────────────── Atajos por tipo de evento ─────────────────────── */

/**
 * Escucha un solo tipo. Es el caso más común en una pantalla concreta.
 *
 *   useEventoDeVivo("mensaje.nuevo", (e) => agregarMensaje(e.datos));
 */
export function useEventoDeVivo<T = any>(
  tipo: TipoDeEvento,
  alLlegar: (datos: T, evento: EventoEnVivo<T>) => void,
): ResultadoDeEventos {
  const ref = useRef(alLlegar);
  useEffect(() => {
    ref.current = alLlegar;
  }, [alLlegar]);

  return useEventosEnVivo({
    tipos: [tipo],
    onEvento: (e) => ref.current(e.datos as T, e as EventoEnVivo<T>),
  });
}
