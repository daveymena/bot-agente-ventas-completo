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

/**
 * La puerta principal, que había quedado abierta.
 *
 * Medido en producción el 2026-08-28 con el pedido real "quiero publicar un
 * anuncio de INTELIGENCIA ARTIFICIAL 2026, que la gente me escriba por
 * WhatsApp". Atlas hizo TODO bien: eligió `crear_anuncio` (la herramienta que
 * su propio prompt le ordena usar siempre para anuncios) y propuso
 * `objetivo: "whatsapp"`.
 *
 * Y no servía de nada. `crear_anuncio` no declaraba `objetivo` en sus args, no
 * lo leía, y su llamada final era `executeAction("fb_upload_draft_to_meta",
 * { draftId })` -- sin objetivo. Río abajo eso es interpretarObjetivo("") ->
 * "ventas" -> web.
 *
 * El arreglo del 2026-08-27 cableó `fb_create_ad` y `fb_upload_draft_to_meta`,
 * las dos puertas laterales, y dejó pasando de largo la que el prompt manda
 * usar. Por eso el admin seguía viendo "un solo tipo de anuncio" DESPUÉS de
 * que el módulo de objetivos estuviera entero y probado.
 */
describe("crear_anuncio: la herramienta que el prompt manda usar siempre", () => {
  it("declara 'objetivo' en su contrato -- si no, el modelo no puede mandarlo", async () => {
    const { TOOLS } = await import("../app-operator");
    const tool = TOOLS.find((t: any) => t.name === "crear_anuncio");
    if (!tool) throw new Error("crear_anuncio tiene que existir en TOOLS");
    expect(tool.args).toContain("objetivo");
    // Los cuatro destinos por nombre: un contrato que solo diga "objetivo"
    // deja al modelo adivinando qué valores valen.
    expect(tool.args).toContain("mensajes");
    expect(tool.args).toContain("trafico");
  });

  it("cuando sube a Meta, el plan dice a dónde manda ANTES del sí", () => {
    const plan = describePlannedAction({
      tool: "crear_anuncio",
      args: { producto: "INTELIGENCIA ARTIFICIAL 2026", dailyBudget: 20000, objetivo: "mensajes", subirAMeta: true },
    });
    expect(plan).toContain("WhatsApp");
  });

  it("si no se pidió destino, el plan avisa que va a la web igual", () => {
    const plan = describePlannedAction({
      tool: "crear_anuncio",
      args: { producto: "Curso de Piano", dailyBudget: 20000, subirAMeta: true },
    });
    expect(plan).toContain("NO se pidió otro destino");
  });

  it("un borrador que NO sube a Meta no promete ningún destino", () => {
    // El objetivo solo decide algo cuando se crea la campaña. Anunciar un
    // destino en un paso que solo guarda texto local sería prometer de más.
    const plan = describePlannedAction({
      tool: "crear_anuncio",
      args: { producto: "Curso de Piano", dailyBudget: 20000 },
    });
    expect(plan).toContain("no toca Meta");
    expect(plan).not.toContain("Destino:");
  });
});

/**
 * La red que NO depende del modelo.
 *
 * Medido el 2026-08-28, tres corridas del MISMO pedido ("publicá un anuncio,
 * que me escriban por WhatsApp"):
 *
 *   1ª  pasó `objetivo: "whatsapp"`            ✅ bien
 *   2ª  se inventó `whatsappContact: true`     ❌ ese parámetro no existe
 *   3ª  eligió `fb_ad_draft`                   ❌ esa herramienta ni lo acepta
 *
 * Dos de tres habrían publicado a la web pidiendo WhatsApp. Y el dato estaba
 * ahí todo el tiempo: la palabra "WhatsApp", escrita por el admin, en su
 * propio mensaje. Leerla con una regex es determinista y gratis; pedírsela al
 * modelo es una apuesta que ya se perdió dos de cada tres veces.
 *
 * Por eso el objetivo se resuelve del lado del SERVIDOR, sobre el texto del
 * admin, y viaja en el contexto (`objetivoDelAdmin`). Si el modelo lo pasa
 * bien, manda lo suyo; si no lo pasa o lo pasa mal, manda lo que el admin dijo.
 */
describe("El destino sale del mensaje del admin, no de la memoria del modelo", () => {
  it("lee el destino de un pedido escrito como lo escribe un admin", () => {
    const pedidos: Array<[string, string]> = [
      ["Quiero publicar un anuncio del curso de piano, que la gente me escriba por WhatsApp, 20000 al día", "mensajes"],
      ["publicá un anuncio y que me manden mensaje", "mensajes"],
      ["hacé una campaña de tráfico a la web del curso", "trafico"],
      ["quiero vender más con un anuncio del pack", "ventas"],
      ["una campaña para que me conozcan, alcance de marca", "reconocimiento"],
    ];
    for (const [texto, esperado] of pedidos) {
      expect(interpretarObjetivo(texto), texto).toBe(esperado);
    }
  });

  it("si el admin no dijo destino, no lo inventa", () => {
    // Devolver null es la respuesta correcta: ahí sí manda el default de la
    // herramienta (ventas), y el plan se lo AVISA al admin antes del sí.
    expect(interpretarObjetivo("creame el anuncio del curso de piano con 20000 al dia")).toBeNull();
  });

  it("el pedido del admin gana cuando el modelo manda basura", () => {
    // El caso exacto de la 2ª corrida: el modelo inventó `whatsappContact`, o
    // sea que `args.objetivo` viene vacío. La cadena real es
    // interpretarObjetivo(args.objetivo) || interpretarObjetivo(ctx.objetivoDelAdmin) || "ventas"
    const delModelo = "";
    const delAdmin = "publicá un anuncio, que me escriban por WhatsApp";
    const resuelto = interpretarObjetivo(delModelo) || interpretarObjetivo(delAdmin) || "ventas";
    expect(resuelto).toBe("mensajes");
  });

  it("pero si el modelo acierta, se respeta lo suyo", () => {
    // No es que el modelo estorbe: cuando pasa el dato, es más preciso que la
    // regex sobre un mensaje largo. La red es respaldo, no reemplazo.
    const resuelto = interpretarObjetivo("trafico") || interpretarObjetivo("mandame gente por whatsapp") || "ventas";
    expect(resuelto).toBe("trafico");
  });
});
