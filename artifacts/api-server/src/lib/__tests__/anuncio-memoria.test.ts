/**
 * El anuncio del que vino el cliente tiene que durar toda la conversación.
 *
 * WhatsApp pega el `externalAdReply` UNICAMENTE al primer mensaje del cliente.
 * La versión anterior de `anuncioDeOrigen` miraba solo el último mensaje suyo
 * y devolvía null si no lo traía, así que el dato duraba un solo turno: en
 * cuanto el cliente escribía "¿cuánto cuesta?", el bot ya no sabía por qué
 * producto había venido — justo el dato por el que se pagó el clic.
 */
import { describe, it, expect } from "vitest";
import { anuncioDeOrigen } from "../agent";

const AD = {
  adTitle: "Curso de Piano Completo",
  adBody: "Aprende a tocar desde cero",
  adUrl: "https://ventasproia.com/p/311",
  adId: "ad_piano_001",
};

const t = (minutosAtras: number) => new Date(Date.now() - minutosAtras * 60_000);

describe("Memoria del anuncio a lo largo de la conversación", () => {
  it("lo encuentra en el primer mensaje del cliente", () => {
    const historial = [
      { role: "customer", metadata: AD, createdAt: t(1) },
    ];
    expect(anuncioDeOrigen(historial)?.titulo).toBe("Curso de Piano Completo");
  });

  it("lo sigue encontrando después de que el cliente escribe otra vez", () => {
    const historial = [
      { role: "customer", metadata: AD, createdAt: t(10) },
      { role: "agent", metadata: {}, createdAt: t(9) },
      { role: "customer", metadata: {}, createdAt: t(8) },   // "¿cuánto cuesta?"
      { role: "agent", metadata: {}, createdAt: t(7) },
      { role: "customer", metadata: {}, createdAt: t(1) },   // "¿y en cuotas?"
    ];
    // Antes de este arreglo: null (miraba solo el último mensaje del cliente).
    expect(anuncioDeOrigen(historial)?.titulo).toBe("Curso de Piano Completo");
  });

  it("NO arrastra un anuncio de hace más de 24h: esa es otra visita", () => {
    const historial = [
      { role: "customer", metadata: AD, createdAt: t(60 * 30) }, // hace 30 horas
      { role: "agent", metadata: {}, createdAt: t(60 * 30) },
      { role: "customer", metadata: {}, createdAt: t(1) },
    ];
    expect(anuncioDeOrigen(historial)).toBeNull();
  });

  it("si el cliente escribió mucho desde entonces, deja de buscar hacia atrás", () => {
    const historial: any[] = [{ role: "customer", metadata: AD, createdAt: t(60) }];
    for (let i = 0; i < 12; i++) {
      historial.push({ role: "customer", metadata: {}, createdAt: t(50 - i) });
    }
    expect(anuncioDeOrigen(historial)).toBeNull();
  });

  it("una conversación sin anuncio devuelve null", () => {
    const historial = [
      { role: "customer", metadata: {}, createdAt: t(5) },
      { role: "agent", metadata: {}, createdAt: t(4) },
    ];
    expect(anuncioDeOrigen(historial)).toBeNull();
  });

  it("gana el anuncio más reciente si el cliente volvió por otro", () => {
    const otro = { ...AD, adTitle: "Pack Contabilidad", adId: "ad_conta_002" };
    const historial = [
      { role: "customer", metadata: AD, createdAt: t(120) },
      { role: "agent", metadata: {}, createdAt: t(119) },
      { role: "customer", metadata: otro, createdAt: t(2) },
    ];
    expect(anuncioDeOrigen(historial)?.titulo).toBe("Pack Contabilidad");
  });
});
