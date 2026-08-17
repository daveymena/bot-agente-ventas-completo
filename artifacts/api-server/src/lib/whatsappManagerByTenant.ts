// ────────────────────────────────────────────────────────────────────────────
// whatsappManagerByTenant.ts — Extiende WhatsAppManager con carpetas aisladas
//
// El módulo whatsapp.ts original declara `AUTH_DIR` como constante a nivel de
// archivo, por lo que dos instancias compartirían la misma carpeta de credenciales.
//
// Esta clase hereda de WhatsAppManager y sobreescribe `start()` para apuntar
// `useMultiFileAuthState` a la carpeta del tenant correspondiente. El resto de
// los métodos (`stop`, `sendText`, etc.) se reutilizan sin cambios.
// ────────────────────────────────────────────────────────────────────────────

import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import QRCode from "qrcode";

import { tenantManager, type TenantContext } from "./tenantManager";
import { WhatsAppManager } from "./whatsapp";
import { logger } from "./logger";

export class WhatsAppByTenant extends WhatsAppManager {
  public tenantAuthDir: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private socketGeneration = 0;

  constructor(tenant: TenantContext, authDir: string) {
    super(tenant);
    this.tenantAuthDir = authDir;
  }

  // Override de `start()` para usar authDir del tenant
  async start() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.starting) {
      return this.getStatus();
    }
    if (this.state === "connected" || this.state === "qr") {
      return this.getStatus();
    }

    this.starting = true;
    this.state = "connecting";
    const generation = ++this.socketGeneration;

    // Sistema de reintentos mejorado para QR sync
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000;
    let retries = 0;

    while (retries < MAX_RETRIES) {
      try {
        if (!existsSync(this.tenantAuthDir)) {
          mkdirSync(this.tenantAuthDir, { recursive: true });
        }

        const baileys = await import("@whiskeysockets/baileys");
        const makeWASocket = (baileys as any).default ?? (baileys as any).makeWASocket;
        const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys as any;

        // ── Desmontar el socket anterior ANTES de crear uno nuevo ─────────
        // Sin esto los listeners se acumulan y un solo mensaje entrante se
        // procesa varias veces. Medido en producción (2026-08-16): el admin
        // escribió "Hola" UNA vez y el bot respondió SEIS veces el mismo
        // saludo, y sus mensajes siguientes ya no entraron.
        //
        // Dos caminos lo provocan, y los dos son normales acá:
        //  1. El reconector llama a start() cada 2 min mientras el estado sea
        //     "error"/"disconnected" -- la guardia `this.starting` solo frena
        //     arranques SIMULTÁNEOS, no uno nuevo sobre un socket viejo vivo.
        //  2. Este mismo bucle reintenta hasta 3 veces: si un intento falla
        //     después de asignar this.sock, su socket queda con listeners.
        //
        // Un socket de Baileys sigue recibiendo eventos hasta que se le hace
        // end(), así que el viejo seguía contestando en paralelo al nuevo.
        // Para el cliente eso es spam, y para el número es riesgo de reporte.
        if (this.sock) {
          try {
            this.sock.ev.removeAllListeners();
            this.sock.end?.(undefined);
          } catch { /* best-effort: si ya estaba muerto, da igual */ }
          this.sock = null;
          logger.info({ tenantId: this.currentTenant?.id }, "[WhatsApp] Socket anterior desmontado antes de reconectar");
        }

        const { state: authState, saveCreds } = await useMultiFileAuthState(this.tenantAuthDir);

        let waVersion: [number, number, number] | undefined;
        try {
          const { version } = await Promise.race([
            fetchLatestBaileysVersion(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000)),
          ]);
          waVersion = version;
        } catch (e) {
          logger.warn({ err: e }, "[WhatsApp] Versión de Baileys no disponible, continuando con la predeterminada");
        }

        const sock = makeWASocket({
          auth: authState,
          browser: ["VentasPro", "Chrome", "1.0.0"],
          syncFullHistory: false,
          markOnlineOnConnect: true,
          generateHighQualityLinkPreview: false,
          connectTimeoutMs: 30000, // Timeout aumentado de 6s a 30s
          defaultQueryTimeoutMs: 30000,
          keepAliveIntervalMs: 10000,
          ...(waVersion ? { version: waVersion } : {}),
          // El modo pairing DEBE estar en el constructor (igual que en
          // WhatsAppManager.start). Sin esto, requestPairingCode() falla con
          // "Connection Failure" del noise-handler porque el protocolo se
          // negocia en modo QR.
          ...(this._usePairingCode ? { usePairingCode: true } : {}),
        });
        this.sock = sock;

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", async (update: any) => {
          if (generation !== this.socketGeneration) return;
          const { connection, lastDisconnect, qr } = update;

          if (qr) {
            this.hadQrInThisSession = true;
            try {
              this.qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 1 });
              this.state = "qr";
              logger.info({ tenantId: this.currentTenant.id }, "[WhatsApp] QR generado exitosamente");
            } catch (err) {
              this.state = "error";
              this.lastError = `Error generating QR: ${err instanceof Error ? err.message : String(err)}`;
              logger.error({ err, tenantId: this.currentTenant.id }, "[WhatsApp] Error generando QR");
            }
          }

          if (connection === "open") {
            this.state = "connected";
            this.lastError = null;
            this.qrDataUrl = null;
            this.connectedAt = new Date().toISOString();
            this.reconnectAttempts = 0;
            retries = 0; // Reset retries en conexión exitosa
            try {
              const me = sock.user?.id?.split(":")[0] || sock.user?.id || null;
              this.phoneNumber = me;
              logger.info({ tenantId: this.currentTenant.id, phone: me }, "[WhatsApp] Conectado exitosamente");
            } catch {}
          }

          if (connection === "close") {
            const reason = (lastDisconnect?.error as any)?.output?.statusCode
              || (lastDisconnect?.error as any)?.statusCode;
            const qrExpired = reason === 408 && this.hadQrInThisSession && !sock.user;
            const isLoggedOut = reason === DisconnectReason?.loggedOut
              || reason === 401
              || reason === 403;
            const isRestartRequired = reason === DisconnectReason?.restartRequired || reason === 515;

            if (qrExpired) {
              // A QR that was not scanned is not a transient network failure.
              // Stop here so the panel does not rotate QR codes forever.
              this.state = "disconnected";
              this.lastError = "El QR expiró. Pulsa Generar código QR para intentar de nuevo.";
              this.reconnectAttempts = 0;
              this.reconnectTimer = null;
              logger.info({ tenantId: this.currentTenant?.id, reason }, "[WhatsApp] QR expirado; esperando acción manual");
            } else if (isLoggedOut) {
              this.state = "error";
              this.lastError = "Sesión cerrada (LoggedOut). Escanea el QR nuevamente.";
              logger.warn({ tenantId: this.currentTenant.id }, "[WhatsApp] Sesión cerrada por WhatsApp");
            } else if (isRestartRequired) {
              // Baileys closes with 515 after a QR scan while it restarts the
              // socket using the newly saved credentials. This is expected and
              // must not consume the normal reconnect budget.
              this.reconnectAttempts = 0;
              this.state = "connecting";
              this.lastError = "Sincronizando la sesión de WhatsApp...";
              logger.info({ tenantId: this.currentTenant.id, reason }, "[WhatsApp] Reinicio requerido tras sincronización");
              this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                void this.start();
              }, 1000);
            } else {
              this.reconnectAttempts++;
              const delay = Math.min(2000 * this.reconnectAttempts, 30000);
              this.state = "error";
              this.lastError = `Reconectando... intento ${this.reconnectAttempts}`;
              logger.warn({ tenantId: this.currentTenant.id, reason, delay }, "[WhatsApp] Desconexión transitoria; reintentando");
              if (this.reconnectAttempts <= this.MAX_RECONNECT_ATTEMPTS) {
                this.reconnectTimer = setTimeout(() => {
                  this.reconnectTimer = null;
                  void this.start();
                }, delay);
              } else {
                // No dar la sesión por perdida: esto NO fue un logout, las
                // credenciales en disco siguen siendo válidas. Antes, al
                // agotar los reintentos rápidos, el manager se rendía para
                // siempre -- el panel quedaba mostrando "Desconectado" de
                // forma permanente aunque el teléfono siguiera vinculado,
                // sin ningún proceso que lo reintentara solo (requería
                // intervención manual desde el panel). Ahora se reporta el
                // estado real (disconnected) pero se sigue reintentando cada
                // 2 min indefinidamente -- ritmo lento a propósito para no
                // martillar la conexión, pero sin rendirse.
                this.state = "disconnected";
                this.lastError = "Reconexión pausada tras varios intentos fallidos; reintentando cada 2 min";
                this.reconnectAttempts = 0;
                const RECONNECT_COOLDOWN_MS = 2 * 60 * 1000;
                this.reconnectTimer = setTimeout(() => {
                  this.reconnectTimer = null;
                  void this.start();
                }, RECONNECT_COOLDOWN_MS);
              }
            }
            this.sock = null;
            this.starting = false;
          }
        });

        // handleIncomingMessages ahora es un método real (protected) de la clase
        // base -- antes esto intentaba delegar a "handleIncoming", que nunca
        // existió (la lógica vivía inline dentro de WhatsAppManager.start()),
        // así que los mensajes entrantes de CUALQUIER tenant se ignoraban en
        // silencio sin ningún error visible.
        sock.ev.on("messages.upsert", (m: any) => this.handleIncomingMessages(m));

        logger.info({ tenantId: this.currentTenant.id, attempt: retries + 1 }, "[WhatsApp] Iniciando conexión");
        return this.getStatus();
      } catch (e: any) {
        retries++;
        logger.error({ 
          err: e, 
          tenantId: this.currentTenant.id, 
          attempt: retries, 
          maxRetries: MAX_RETRIES 
        }, "[WhatsApp] Error en intento de conexión");

        if (retries >= MAX_RETRIES) {
          this.state = "error";
          this.lastError = `Error después de ${MAX_RETRIES} intentos: ${e?.message || String(e)}`;
          this.starting = false;
          return this.getStatus();
        }

        // Esperar antes de reintentar
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * retries));
      }
    }

    this.state = "error";
    this.lastError = "No se pudo establecer conexión después de varios intentos";
    this.starting = false;
    return this.getStatus();
  }

  // Override stop para borrar la carpeta del tenant (no la global)
  async stop(keepAuth: boolean = true) {
    this.socketGeneration++;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      if (this.sock) {
        this.sock.ev.removeAllListeners();
        if (!keepAuth) {
          await this.sock.logout().catch(() => {});
        }
        this.sock.end(undefined);
        this.sock = null;
      }
    } catch (e) {
      logger.warn({ err: e }, "[WhatsApp-ByTenant] Error during stop");
    }

    if (!keepAuth) {
      try {
        const fs = await import("node:fs");
        if (existsSync(this.tenantAuthDir)) {
          fs.rmSync(this.tenantAuthDir, { recursive: true, force: true });
        }
      } catch (e) {
        logger.warn({ err: e }, "[WhatsApp-ByTenant] Error deleting auth dir");
      }
    }

    this.state = "disconnected";
    this.qrDataUrl = null;
    this.phoneNumber = null;
    this.connectedAt = null;
    this.starting = false;
    this.lastError = null;
    this.hadQrInThisSession = false;
    return this.getStatus();
  }
}
