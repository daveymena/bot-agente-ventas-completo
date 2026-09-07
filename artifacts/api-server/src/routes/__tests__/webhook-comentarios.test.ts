/**
 * ============================================================
 * EL WEBHOOK DE COMENTARIOS NUNCA SE PUDO SUSCRIBIR
 * ============================================================
 *
 * Medido contra produccion el 2026-09-07:
 *
 *   GET /api/facebook/comments/webhook   -> 404
 *   GET /api/facebook/lead-ads/webhook   -> 403
 *   GET /api/facebook/messenger/webhook  -> 403
 *
 * Meta no suscribe un webhook sin pedirlo primero por GET y recibir de vuelta
 * el `hub.challenge`. Sin ese GET, la suscripcion se rechaza: alguien comenta
 * en un anuncio PAGO y no llega nada. El codigo que contesta esos comentarios
 * ya existia y nunca pudo ejecutarse porque el evento jamas entro.
 *
 * ⚠️ Se leen las rutas del archivo y se quitan los comentarios antes de
 * comparar. Ya paso cuatro veces en este repo que una prueba pasara porque el
 * texto buscado estaba en un comentario --incluido el que explica el arreglo--
 * y no en el codigo que corre.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FUENTE = readFileSync(join(__dirname, "..", "facebook.ts"), "utf8");
const CODIGO = FUENTE
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

/** Los tres webhooks que Meta tiene que poder verificar. */
const WEBHOOKS = ["comments", "lead-ads", "messenger"];

describe("los tres webhooks aceptan la verificación de Meta", () => {
  it.each(WEBHOOKS)("%s/webhook responde al GET de verificación", (w) => {
    expect(CODIGO).toContain(`router.get("/${w}/webhook"`);
  });

  it.each(WEBHOOKS)("%s/webhook sigue recibiendo eventos por POST", (w) => {
    expect(CODIGO).toContain(`router.post("/${w}/webhook"`);
  });
});

describe("la verificación de comentarios es tan estricta como las otras", () => {
  const bloque = (() => {
    const i = CODIGO.indexOf('router.get("/comments/webhook"');
    return i === -1 ? "" : CODIGO.slice(i, i + 1400);
  })();

  it("devuelve el challenge cuando el token coincide", () => {
    expect(bloque).toContain("hub.challenge");
    expect(bloque).toMatch(/mode === "subscribe"/);
  });

  it("se NIEGA a verificar si no hay token configurado", () => {
    // Un valor por defecto conocido dejaria que cualquiera suscriba su propio
    // webhook e inyecte eventos. Ya paso con "salesbot_verify_2024", que
    // estaba escrito en el repo.
    expect(bloque).toContain("FB_WEBHOOK_VERIFY_TOKEN");
    expect(bloque).toContain("503");
  });

  it("rechaza con 403 un token que no coincide", () => {
    expect(bloque).toContain("403");
  });

  it("NO trae un token por defecto escrito en el código", () => {
    expect(bloque).not.toMatch(/salesbot_verify|FB_WEBHOOK_VERIFY_TOKEN\s*\|\|\s*["'][a-z0-9_]{6,}/i);
  });
});

/**
 * ============================================================
 * "NO HAY CAMPAÑAS" NO ES LO MISMO QUE "NO PUDE PREGUNTAR"
 * ============================================================
 *
 * El dueno: "donde muestra los activos dice: No hay campañas en la cuenta
 * publicitaria. Creá un anuncio desde Atlas y va a aparecer acá" -- teniendo
 * campañas creadas por Atlas.
 *
 * `listActiveCampaigns()` devuelve [] en tres casos distintos: no hay
 * campañas, falta el id de la cuenta publicitaria, o Meta rechazo la consulta.
 * El endpoint los aplastaba en uno solo.
 *
 * Ya estaba resuelto para Atlas (`app-operator.ts` lee
 * `lastCampaignListError`); el endpoint del panel lo ignoraba. Gemelo otra vez.
 */
describe("el endpoint de campañas dice POR QUE no hay nada", () => {
  const RUTA = (() => {
    const i = CODIGO.indexOf('router.get("/campaigns"');
    return i === -1 ? "" : CODIGO.slice(i, i + 1200);
  })();

  it("existe el endpoint", () => {
    expect(RUTA).not.toBe("");
  });

  it("avisa cuando falta la cuenta publicitaria", () => {
    // El token puede estar y la cuenta no: `isConfigured()` solo mira el token,
    // asi que `connected` daba true y la pantalla culpaba a la falta de anuncios.
    expect(RUTA).toContain("sinCuentaPublicitaria");
    expect(RUTA).toContain("tieneCuentaPublicitaria()");
  });

  it("expone el error real de Meta en vez de tragarselo", () => {
    expect(RUTA).toContain("errorDeConsulta");
    expect(RUTA).toContain("lastCampaignListError");
  });

  it("sigue informando si la cuenta esta conectada", () => {
    expect(RUTA).toContain("connected: true");
  });
});
