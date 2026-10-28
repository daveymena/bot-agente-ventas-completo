/**
 * ============================================================
 * EL LIMITE DEL PLAN SE MIDE CONTRA ALGO QUE SOBREVIVE
 * ============================================================
 *
 * El limite estaba bien implementado y NUNCA se alcanzaba: se comparaba contra
 * un `Map` del proceso que se pone en cero en cada reinicio. El 2026-09-07 hubo
 * doce despliegues.
 *
 * Un cliente de Starter (USD 19, 1.500 mensajes) podia mandar 20.000 y costar
 * USD 66. La perdida aparece en la factura del mes siguiente, no al vender.
 */
import { describe, expect, it } from "vitest";
import { diaDe, limiteDiarioDelPlan, periodoDe } from "../consumo-del-plan";

describe("el periodo es el mes calendario", () => {
  it("da AAAA-MM", () => {
    expect(periodoDe(new Date("2026-09-08T03:00:00Z"))).toBe("2026-09");
  });

  it("rellena el mes con cero", () => {
    expect(periodoDe(new Date("2026-01-31T23:59:59Z"))).toBe("2026-01");
  });

  it("cambia de fila al cambiar de mes, sin que nadie resetee nada", () => {
    // Es la razon de guardar por periodo en vez de un contador: el mes nuevo
    // simplemente no existe todavia y cuenta cero solo. Un contador exigiria
    // que un trabajo programado lo pusiera en cero el dia 1, y ese trabajo
    // puede no correr.
    const finDeMes = periodoDe(new Date("2026-09-30T23:59:59Z"));
    const inicioDelSiguiente = periodoDe(new Date("2026-10-01T00:00:01Z"));
    expect(finDeMes).toBe("2026-09");
    expect(inicioDelSiguiente).toBe("2026-10");
    expect(finDeMes).not.toBe(inicioDelSiguiente);
  });

  it("usa UTC, no la hora del servidor", () => {
    // Con hora local, el mismo instante caeria en meses distintos segun donde
    // corra el contenedor, y el limite se aplicaria distinto en cada despliegue.
    expect(periodoDe(new Date("2026-03-01T00:30:00Z"))).toBe("2026-03");
    expect(periodoDe(new Date("2026-02-28T23:30:00Z"))).toBe("2026-02");
  });
});

describe("cuotas diarias por plan y horario del negocio", () => {
  it("reparte el cupo mensual en 30 días sin acumular el restante", () => {
    expect(limiteDiarioDelPlan(30)).toBe(1);
    expect(limiteDiarioDelPlan(1500)).toBe(50);
    expect(limiteDiarioDelPlan(4000)).toBe(134);
    expect(limiteDiarioDelPlan(9000)).toBe(300);
  });

  it("cambia de día a medianoche de America/Bogota", () => {
    expect(diaDe(new Date("2026-10-29T04:30:00Z"), "America/Bogota")).toBe("2026-10-28");
    expect(diaDe(new Date("2026-10-29T05:30:00Z"), "America/Bogota")).toBe("2026-10-29");
  });

  it("usa America/Bogota si el tenant no tiene una zona válida", () => {
    expect(diaDe(new Date("2026-10-29T05:30:00Z"), "zona-desconocida")).toBe("2026-10-29");
  });
});

/**
 * El cableado se verifica sobre el codigo: `sumarMensaje` y `mensajesDelMes`
 * tocan la base real, y montarla aca probaria la base, no la decision.
 *
 * ⚠️ Se quitan los comentarios antes de comparar. Ya paso cuatro veces en este
 * repo que una prueba pasara porque el texto buscado estaba en un comentario
 * --incluido el que explica el arreglo-- y no en el codigo que corre.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sinComentarios = (ruta: string) =>
  readFileSync(join(__dirname, "..", ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

const WHATSAPP = sinComentarios("whatsapp.ts");
const LIMITES = sinComentarios("../middleware/featureLimits.ts");

describe("se cuenta donde se envia", () => {
  it("cada envio suma a la base", () => {
    // Tres puntos de envio: texto, imagen y nota de voz (f86a0e6, 23-09).
    // Los tres gastan.
    const veces = (WHATSAPP.match(/sumarMensaje\(this\.currentTenant\.id\)/g) || []).length;
    expect(veces).toBe(3);
  });

  it("sin await: contar no puede demorar el mensaje al cliente", () => {
    expect(WHATSAPP).toContain("void sumarMensaje(");
    expect(WHATSAPP).not.toMatch(/await sumarMensaje\(/);
  });

  it("el contador viejo se conserva: alimenta el panel de costos", () => {
    expect(WHATSAPP).toContain("trackWhatsAppCost(");
  });
});

describe("el limite se mide contra la base", () => {
  it("lee el consumo persistido", () => {
    expect(LIMITES).toContain("usoWhatsappDelPeriodo");
  });

  it("se queda con el MAYOR entre base y memoria", () => {
    expect(LIMITES).toContain("Math.max(uso.mensual, enMemoria)");
  });

  it("ya no depende SOLO del Map del proceso", () => {
    const soloMemoria = /const current = usage\?\.whatsappMessages \?\? 0;/;
    expect(soloMemoria.test(LIMITES)).toBe(false);
  });

  it("sigue comparando contra el tope del plan", () => {
    expect(LIMITES).toContain("current < monthlyLimit");
  });

  it("aplica también el tope diario por negocio", () => {
    expect(LIMITES).toContain("currentDaily < dailyLimit");
    expect(LIMITES).toContain("reserveAiResponse");
  });
});
