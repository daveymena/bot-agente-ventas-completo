import { describe, it, expect } from "vitest";
import { interpretarObjetivo, OBJETIVOS } from "../objetivos-campana";
import { describePlannedAction } from "../opencode-mcp-tools";

/**
 * A dónde manda el anuncio: web o WhatsApp.
 *
 * Reportado por el admin: "no sé si Atlas diferencia entre un anuncio a la web
 * y otro de tráfico a WhatsApp; le pido de tráfico y me manda a otro lado".
 *
 * Tenía razón, y no era el modelo eligiendo mal. `objetivos-campana.ts` existía
 * completo --ventas, tráfico, mensajes, reconocimiento, cada uno con su
 * objetivo de Meta y su destino-- y `fb_upload_draft_to_meta` incluso leía
 * `args.objetivo`. Pero ese parámetro NO estaba declarado en el contrato de
 * ninguna de las dos herramientas que crean campañas, así que el modelo no
 * tenía forma de saber que existía: nunca lo mandaba, y todo caía en el default
 * "ventas" → web.
 *
 * Un módulo entero, escrito y probado, inalcanzable desde el único lugar que lo
 * necesitaba.
 */

describe("Interpretar lo que pide el admin", () => {
  it("'tráfico a WhatsApp' es una campaña de mensajes, no de web", () => {
    // El caso exacto del reporte. WhatsApp manda sobre la palabra "tráfico":
    // lo que define el destino es a dónde va la gente.
    expect(interpretarObjetivo("quiero una campaña de tráfico a WhatsApp")).toBe("mensajes");
    expect(interpretarObjetivo("tráfico a mi whatsapp")).toBe("mensajes");
    expect(interpretarObjetivo("que me escriban por whatsapp")).toBe("mensajes");
  });

  it("'tráfico a la web' sigue siendo tráfico", () => {
    expect(interpretarObjetivo("una campaña de tráfico a la web")).toBe("trafico");
    expect(interpretarObjetivo("quiero visitas a la tienda")).toBe("trafico");
  });

  it("distingue vender de dar a conocer", () => {
    expect(interpretarObjetivo("quiero vender el curso")).toBe("ventas");
    expect(interpretarObjetivo("que me conozcan, alcance")).toBe("reconocimiento");
  });

  it("si el admin no dijo destino, no lo inventa", () => {
    expect(interpretarObjetivo("")).toBeNull();
    expect(interpretarObjetivo("creame el anuncio del pack de perros")).toBeNull();
  });

  // Cada destino tiene que llegar a Meta con su objetivo real: es lo que decide
  // A QUIÉN le muestran el anuncio. Elegir mal es pagarle a Meta para que
  // busque al público equivocado.
  it("cada objetivo viaja con su configuración real de Meta", () => {
    expect(OBJETIVOS.mensajes.metaObjective).toBe("OUTCOME_ENGAGEMENT");
    expect(OBJETIVOS.mensajes.destino).toBe("whatsapp");
    expect(OBJETIVOS.trafico.metaObjective).toBe("OUTCOME_TRAFFIC");
    expect(OBJETIVOS.trafico.destino).toBe("web");
    expect(OBJETIVOS.ventas.metaObjective).toBe("OUTCOME_SALES");
  });
});

describe("El plan que aprueba el admin dice a dónde manda", () => {
  // La red de seguridad. Por `describePlannedAction` pasa TODO plan de TODOS
  // los negocios: aunque el modelo se equivoque de destino, el admin lo ve
  // ANTES de decir que sí. Antes el plan decía solo "crear campaña, presupuesto
  // X/día" y el destino recién aparecía en Ads Manager.
  it("una campaña de mensajes se anuncia como WhatsApp", () => {
    const plan = describePlannedAction({
      tool: "fb_create_ad",
      args: { productId: 76, dailyBudget: 20000, objetivo: "mensajes" },
    });
    expect(plan).toContain("WhatsApp");
  });

  it("una campaña de tráfico se anuncia como web", () => {
    const plan = describePlannedAction({
      tool: "fb_create_ad",
      args: { productId: 76, objetivo: "trafico" },
    });
    expect(plan).toContain("web");
    expect(plan).not.toContain("WhatsApp");
  });

  // Que no se haya pedido destino es JUSTO lo que hay que ver: significa web.
  it("si no se pidió destino, el plan avisa que va a la web igual", () => {
    const plan = describePlannedAction({
      tool: "fb_create_ad",
      args: { productId: 76 },
    });
    expect(plan).toContain("web");
    expect(plan).toContain("NO se pidió otro destino");
  });

  it("subir un borrador a Meta también muestra el destino", () => {
    const plan = describePlannedAction({
      tool: "fb_upload_draft_to_meta",
      args: { draftId: 89, objetivo: "mensajes" },
    });
    expect(plan).toContain("WhatsApp");
  });
});
