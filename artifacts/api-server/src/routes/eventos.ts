/**
 * ============================================================================
 * EL CANAL EN VIVO — WebSocket montado sobre el http.Server que ya existe
 * ============================================================================
 *
 * No se levanta un servidor paralelo: se engancha el `upgrade` al mismo
 * `http.Server` que atiende la API. Una sola puerta de entrada (y una sola
 * regla de autenticación) es más fácil de razonar y de auditar que dos.
 *
 * ── Autenticación: la MISMA cookie firmada del panel ──────────────────────
 *
 * El panel ya se autentica con una cookie firmada por `cookie-parser` con
 * `COOKIE_SECRET`. Acá se verifica esa misma cookie en el handshake, con las
 * mismas funciones que usa Express — no hay una segunda forma de entrar.
 *
 * Si la cookie no es válida, el upgrade se rechaza con 401 y no se abre el
 * socket. Un WebSocket sin autenticar sería una puerta trasera que saltea todo
 * el multi-tenant.
 *
 * ── El aislamiento por negocio ────────────────────────────────────────────
 *
 * El `tenantId` sale de la sesión, NO del cliente. Aunque alguien abra la
 * conexión desde otro lado, solo recibe los eventos de su propio negocio:
 * `lib/eventos.ts` filtra por ese id al repartir.
 */

import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { Router, type Request, type Response } from "express";
import { WebSocketServer, type WebSocket } from "ws";
import {
  conectar,
  rechazarUpgrade,
  secuenciaActual,
  emitir,
  conexionesActivas,
  oyentesActivos,
  type ConexionEnVivo,
} from "../lib/eventos";
import { logger } from "../lib/logger";
import { verificarSesionDeEventos } from "../lib/sesion-eventos";

/**
 * Router HTTP del canal en vivo (el WebSocket se monta aparte, en index.ts).
 *
 * Estas rutas pasan por el mismo middleware de sesión que el resto de la API,
 * así que `req.tenant` ya viene resuelto: no hay una segunda forma de
 * autenticarse.
 */
export const eventosRouter = Router();

/** Estado del canal. Sirve para saber si el WS quedó montado tras un deploy. */
eventosRouter.get("/estado", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    conexiones: conexionesActivas(),
    oyentes: oyentesActivos(),
    secuencia: secuenciaActual(),
    at: new Date().toISOString(),
  });
});

/**
 * Emite un evento de prueba al negocio de la sesión.
 *
 * Solo fuera de producción: en producción este endpoint sería una forma de
 * inyectar eventos falsos en el panel de un negocio.
 */
eventosRouter.post("/prueba", async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ ok: false, error: "No disponible en producción" });
  }
  const tenantId = Number((req as any).tenant?.id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return res.status(401).json({ ok: false, error: "No session found. Please login." });
  }
  const evento = emitir("mensaje.nuevo", tenantId, {
    conversationId: Number(req.body?.conversationId || 0),
    rol: "agent",
    texto: String(req.body?.texto || "evento de prueba"),
  });
  res.json({ ok: Boolean(evento), evento });
});


/** Cada cuánto se manda un ping para que un proxy no cierre por inactividad. */
const PING_MS = 30_000;

/** Si el cliente no contesta el ping en este plazo, se considera muerto. */
const PONG_TIMEOUT_MS = 10_000;

let wss: WebSocketServer | null = null;
let pingTimer: NodeJS.Timeout | null = null;

/**
 * Monta el canal en vivo sobre un `http.Server` existente.
 * Devuelve la función de desmontaje (apagado ordenado y tests).
 */
export function montarEventosEnVivo(servidor: Server): () => void {
  if (wss) return () => {};

  // `noServer` es deliberado: el upgrade lo manejamos nosotros para poder
  // autenticar ANTES de aceptar el socket.
  wss = new WebSocketServer({ noServer: true });

  servidor.on("upgrade", async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname !== "/api/eventos") {
      // No es nuestro camino: se deja que otro lo maneje (o se corta).
      return;
    }

    let sesion: { tenantId: number } | null = null;
    try {
      sesion = await verificarSesionDeEventos(req);
    } catch (err: any) {
      logger.warn({ err: err?.message }, "[Eventos] falló la verificación de sesión");
    }

    if (!sesion) {
      rechazarUpgrade(socket, "Sesión no válida. Inicia sesión de nuevo.");
      return;
    }

    const tenantId = sesion.tenantId;
    wss!.handleUpgrade(req, socket as any, head, (ws: WebSocket) => {
      wss!.emit("connection", ws, req, tenantId);
    });
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, tenantId: number) => {
    let vivo = true;
    let ultimoPong = Date.now();

    ws.on("pong", () => {
      ultimoPong = Date.now();
    });

    const conexion: ConexionEnVivo = {
      tenantId,
      enviar: (texto) => {
        if (ws.readyState === ws.OPEN) ws.send(texto);
      },
      cerrar: () => {
        try {
          ws.close(1001, "servidor cerrando");
        } catch {
          /* ya cerrado */
        }
      },
    };

    const desregistrar = conectar(conexion);
    logger.info({ tenantId }, "[Eventos] panel conectado al canal en vivo");

    // Saludo: así el cliente sabe que quedó autenticado y desde qué secuencia
    // empieza. Si venía de una reconexión y trae `ultimaSecuencia`, se le dice
    // si perdió eventos para que refresque en vez de quedar desincronizado.
    try {
      ws.send(
        JSON.stringify({
          tipo: "conectado",
          tenantId,
          seq: secuenciaActual(),
          at: new Date().toISOString(),
        }),
      );
    } catch {
      /* si no se puede saludar, el ping lo va a detectar */
    }

    ws.on("message", (crudo: Buffer) => {
      // El panel puede mandar un ping de aplicación; el protocolo ya tiene el
      // suyo, así que solo se tolera y se ignora a propósito.
      try {
        const m = JSON.parse(String(crudo));
        if (m?.tipo === "ping") conexion.enviar(JSON.stringify({ tipo: "pong", at: new Date().toISOString() }));
      } catch {
        /* mensaje no-JSON: se ignora */
      }
    });

    ws.on("close", () => {
      vivo = false;
      desregistrar();
      logger.info({ tenantId }, "[Eventos] panel desconectado");
    });

    ws.on("error", (err) => {
      vivo = false;
      desregistrar();
      logger.warn({ err: err?.message, tenantId }, "[Eventos] error en la conexión del panel");
    });

    // Vigilancia: si el socket murió sin avisar (proxy, red), esto lo limpia.
    const chequeo = setInterval(() => {
      if (!vivo) {
        clearInterval(chequeo);
        return;
      }
      if (Date.now() - ultimoPong > PING_MS + PONG_TIMEOUT_MS) {
        logger.warn({ tenantId }, "[Eventos] conexión sin respuesta: se cierra");
        try {
          ws.terminate();
        } catch {
          /* no crítico */
        }
        clearInterval(chequeo);
        return;
      }
      try {
        ws.ping();
      } catch {
        clearInterval(chequeo);
      }
    }, PING_MS);

    ws.on("close", () => clearInterval(chequeo));
  });

  // Un ping global mantiene vivas las conexiones detrás de proxies que cortan
  // por inactividad. Es más barato que un timer por conexión.
  pingTimer = setInterval(() => {
    for (const cliente of wss?.clients ?? []) {
      try {
        cliente.ping();
      } catch {
        /* el chequeo por conexión lo termina de limpiar */
      }
    }
  }, PING_MS);

  logger.info("[Eventos] canal en vivo montado en /api/eventos");

  return () => {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
    for (const cliente of wss?.clients ?? []) {
      try {
        cliente.close(1001, "servidor cerrando");
      } catch {
        /* no crítico */
      }
    }
    wss?.close();
    wss = null;
  };
}
