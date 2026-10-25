/**
 * Consultar si WhatsApp está conectado no puede crear la sesión ni fallar.
 *
 * Desde la rama de escala, getWhatsAppForTenant exige el contexto real del
 * negocio y lanza error si no está en caché (antes caía al tenant por
 * defecto). Las lecturas de estado -- tienda pública, panel, Atlas, canales --
 * seguían usándolo y respondían 500 para cualquier negocio sin sesión en
 * memoria. Ahora leen con peekWhatsAppForTenant: sin sesión = desconectado.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../agent", () => ({ runAgentReply: vi.fn() }));
vi.mock("../facebook-messenger", () => ({ FacebookMessengerService: class {} }));
vi.mock("../facebook-comments", () => ({ FacebookCommentsService: class {} }));

import { getWhatsAppForTenant, peekWhatsAppForTenant } from "../whatsapp-factory";
import { ChannelManager } from "../channel-manager";

const SIN_SESION = 987654;

describe("estado de WhatsApp de un negocio sin sesión", () => {
  it("peek no crea la instancia", () => {
    expect(peekWhatsAppForTenant(SIN_SESION)).toBeUndefined();
  });

  it("crear la sesión sin contexto del negocio sigue prohibido", () => {
    expect(() => getWhatsAppForTenant(SIN_SESION)).toThrow(/contexto del negocio/);
  });

  it("el estado de canales informa desconectado en vez de lanzar", async () => {
    const estados = await new ChannelManager().getStatus(SIN_SESION);
    expect(estados.find((e) => e.channel === "whatsapp")?.connected).toBe(false);
    expect(peekWhatsAppForTenant(SIN_SESION)).toBeUndefined();
  });
});
