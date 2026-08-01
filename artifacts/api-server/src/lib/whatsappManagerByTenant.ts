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

  constructor(tenant: TenantContext, authDir: string) {
    super(tenant);
    this.tenantAuthDir = authDir;
  }

  // Override de `start()` para usar authDir del tenant
  async start() {
    if (this.starting) {
      return this.getStatus();
    }
    if (this.state === "connected" || this.state === "qr") {
      return this.getStatus();
    }

    this.starting = true;
    this.state = "connecting";

    // Timeout de conexión: si en 25s no hubo ningún evento (ni QR ni open ni
    // close), asumimos que WhatsApp no es accesible. Sin esto, la clase por
    // tenant se quedaba en "connecting" para siempre (spinner infinito en la
    // UI) cuando la red al servidor de WhatsApp fallaba en silencio.
    let connectTimeout: NodeJS.Timeout | null = setTimeout(() => {
      if (this.state === "connecting" && this.starting) {
        this.starting = false;
        this.state = "error";
        this.lastError =
          "Timeout: no se pudo conectar con WhatsApp en 25s. Revisa que el servidor tenga acceso a web.whatsapp.com y reintenta.";
        logger.error({ tenantAuthDir: this.tenantAuthDir }, "[WhatsApp-ByTenant] Connection timeout");
        try { this.sock?.end?.(undefined); } catch {}
        this.sock = null;
      }
    }, 25000);
    const clearConnectTimeout = () => {
      if (connectTimeout) { clearTimeout(connectTimeout); connectTimeout = null; }
    };

    try {
      if (!existsSync(this.tenantAuthDir)) {
        mkdirSync(this.tenantAuthDir, { recursive: true });
      }

      const baileys = await import("@whiskeysockets/baileys");
      const makeWASocket = (baileys as any).default ?? (baileys as any).makeWASocket;
      const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys as any;

      const { state: authState, saveCreds } = await useMultiFileAuthState(this.tenantAuthDir);

      let waVersion: [number, number, number] | undefined;
      try {
        const { version } = await fetchLatestBaileysVersion();
        waVersion = version;
      } catch (e) {
        // continuar sin version
      }

      const sock = makeWASocket({
        auth: authState,
        browser: ["VentasPro", "Chrome", "1.0.0"],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: false,
        ...(waVersion ? { version: waVersion } : {}),
      });
      this.sock = sock;

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        // Solo cancelar el timeout ante un evento REAL de progreso (QR, abierto
        // o cerrado). Baileys emite antes un update intermedio {connection:
        // "connecting"} que no es terminal: si limpiáramos el timeout ahí, un
        // socket que nunca llega a QR/open se quedaría colgado para siempre.
        if (qr || connection === "open" || connection === "close") {
          clearConnectTimeout();
        }

        if (qr) {
          this.hadQrInThisSession = true;
          try {
            this.qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 1 });
            this.state = "qr";
          } catch (err) {
            this.state = "error";
            this.lastError = `Error generating QR: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        if (connection === "open") {
          this.state = "connected";
          this.qrDataUrl = null;
          this.connectedAt = new Date().toISOString();
          this.reconnectAttempts = 0;
          try {
            const me = sock.user?.id?.split(":")[0] || sock.user?.id || null;
            this.phoneNumber = me;
          } catch {}
        }

        if (connection === "close") {
          const reason = (lastDisconnect?.error as any)?.output?.statusCode
            || (lastDisconnect?.error as any)?.statusCode;
          const isLoggedOut = reason === DisconnectReason?.loggedOut
            || reason === 401
            || reason === 403;

          this.sock = null;
          this.starting = false;
          this.qrDataUrl = null;

          if (isLoggedOut) {
            this.state = "error";
            this.reconnectAttempts = 0;
            this.lastError = "Sesión cerrada (LoggedOut). Escanea el QR nuevamente.";
          } else if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
            // Tras escanear el QR (o ingresar el PIN), WhatsApp cierra la
            // conexión con restartRequired (código 515): es OBLIGATORIO
            // reconectar con las credenciales ya guardadas para COMPLETAR el
            // login. Antes esto se marcaba como "disconnected" y no se
            // reconectaba nunca -> el QR se escaneaba pero jamás sincronizaba
            // (idéntico síntoma con el PIN). También cubre caídas transitorias.
            this.reconnectAttempts++;
            this.state = "connecting";
            const delay = Math.min(2000 * this.reconnectAttempts, 20000);
            logger.info(
              { reason, attempt: this.reconnectAttempts, tenantAuthDir: this.tenantAuthDir },
              "[WhatsApp-ByTenant] Reconectando para completar el login (restartRequired/transitorio)",
            );
            setTimeout(() => {
              // Si stop() u otro flujo cambió el estado mientras esperábamos,
              // no reconectar (evita reconexiones fantasma tras un stop).
              if (this.state === "connecting" && !this.sock) {
                this.start().catch(() => {});
              }
            }, delay);
          } else {
            this.state = "disconnected";
            this.reconnectAttempts = 0;
            this.lastError = "No se pudo completar la conexión tras varios intentos. Reinicia la sesión e intenta de nuevo.";
          }
        }
      });

      // handleIncomingMessages ahora es un método real (protected) de la clase
      // base -- antes esto intentaba delegar a "handleIncoming", que nunca
      // existió (la lógica vivía inline dentro de WhatsAppManager.start()),
      // así que los mensajes entrantes de CUALQUIER tenant se ignoraban en
      // silencio sin ningún error visible.
      sock.ev.on("messages.upsert", (m: any) => this.handleIncomingMessages(m));

      return this.getStatus();
    } catch (e: any) {
      clearConnectTimeout();
      this.state = "error";
      this.lastError = e?.message || String(e);
      this.starting = false;
      return this.getStatus();
    }
  }

  // Override stop para borrar la carpeta del tenant (no la global)
  async stop(keepAuth: boolean = true) {
    try {
      if (this.sock) {
        this.sock.ev.removeAllListeners();
        // logout() invalida las credenciales en el servidor de WhatsApp y
        // obliga a re-escanear el QR. Solo debe hacerse cuando explícitamente
        // NO queremos conservar la auth (reset-session). Con keepAuth=true
        // (reinicio normal o antes de un pairing) solo cerramos el socket:
        // antes se llamaba logout() SIEMPRE, así que `pair-phone` -- que hace
        // stop(true) primero -- borraba la sesión en cada intento.
        if (!keepAuth) {
          await this.sock.logout().catch(() => {});
        }
        try { this.sock.end(undefined); } catch {}
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
    this.reconnectAttempts = 0;
    return this.getStatus();
  }
}
