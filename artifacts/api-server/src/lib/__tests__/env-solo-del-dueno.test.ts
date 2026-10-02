import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Barrido multi-negocio del 29-09-2026: el .env (ADMIN_PHONE, TELEGRAM_*,
 * SMTP_*, TERABOX_NDUS…) es la configuración del DUEÑO del servidor y caía de
 * respaldo para cualquier negocio sin lo suyo: sus pedidos le llegaban al
 * Telegram del dueño, el acceso a sus clientes salía de la casilla del dueño
 * y la lectura de avisos del banco revisaba la bandeja del dueño.
 */
vi.mock("../ai-keys-tenant", () => ({ clavesDelTenant: vi.fn(async () => ({})) }));

import { tenantManager } from "../tenantManager";
import { esDuenoDelServidor, envSoloDelDueno } from "../respaldo-del-dueno";
import { credencialesEmailDe } from "../tenant-email-credentials";
import { configTelegramDelTenant } from "../telegram";

const previo = { ...process.env };
afterEach(() => { process.env = { ...previo }; vi.restoreAllMocks(); });
const dueno = () => vi.spyOn(tenantManager, "getDefaultTenant").mockReturnValue({ id: 1 } as any);

describe("respaldo del .env solo para el dueño del servidor", () => {
  it("el ayudante distingue al dueño de cualquier otro negocio (y sin negocio = no)", () => {
    dueno();
    expect(esDuenoDelServidor(1)).toBe(true);
    expect(esDuenoDelServidor(2)).toBe(false);
    expect(esDuenoDelServidor(null)).toBe(false);
    expect(envSoloDelDueno(1, "x")).toBe("x");
    expect(envSoloDelDueno(2, "x")).toBe("");
  });

  it("Telegram: los avisos de otro negocio NO van al bot del dueño", async () => {
    dueno();
    Object.assign(process.env, { TELEGRAM_BOT_TOKEN: "bot-dueno", TELEGRAM_CHAT_ID: "chat-dueno" });
    expect(await configTelegramDelTenant(2)).toBeNull();
    expect(await configTelegramDelTenant(1)).toEqual({ botToken: "bot-dueno", chatId: "chat-dueno" });
  });

  it("SMTP: otro negocio no usa la casilla del dueño, salvo correos de SISTEMA", () => {
    dueno();
    Object.assign(process.env, { SMTP_USER: "dueno@gmail.com", SMTP_PASS: "clave dueno" });
    const otro = credencialesEmailDe({ id: 2 } as any);
    expect(otro.user).toBe("");
    expect(otro.pass).toBe("");
    expect(otro.enabled).toBe(false);
    // Recuperar contraseña: es la plataforma hablándole a su usuario.
    const sistema = credencialesEmailDe({ id: 2 } as any, { sistema: true });
    expect(sistema.user).toBe("dueno@gmail.com");
    // El dueño sigue usando su casilla.
    expect(credencialesEmailDe({ id: 1 } as any).user).toBe("dueno@gmail.com");
  });
});
