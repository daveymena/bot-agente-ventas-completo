/**
 * ============================================================
 * EL NUMERO SE QUEDABA MUDO DESPUES DE CADA DESPLIEGUE
 * ============================================================
 *
 * Medido en produccion el 2026-09-07: desplegado a las 06:43 y conectado; a
 * las 07:19 "disconnected", sin un solo intento de reconexion.
 *
 * ── Por que se prueba leyendo el archivo ──────────────────────────────────
 *
 * `WhatsAppService` abre un socket real de Baileys en el constructor y lee
 * credenciales del disco: instanciarlo en una prueba conecta de verdad contra
 * WhatsApp. Lo que hay que garantizar es la CONDICION de la rama, y eso se
 * puede verificar sobre el codigo sin levantar nada.
 *
 * ⚠️ Se quitan los comentarios antes de comparar. Ya paso cuatro veces en este
 * repo que una prueba pasaba porque el texto que buscaba estaba en un
 * comentario --incluido el comentario que explica el arreglo-- y no en el
 * codigo.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RUTA = join(__dirname, "..", "whatsapp.ts");
const FUENTE = readFileSync(RUTA, "utf8");

/** El archivo sin comentarios: solo lo que de verdad se ejecuta. */
const CODIGO = FUENTE
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe("la rama que dejaba el numero mudo", () => {
  it("no se rinde solo porque no hubo QR: mira si estuvo conectado", () => {
    // El bug: al reiniciar, la sesion vuelve con las credenciales guardadas y
    // NO se dibuja QR, asi que `hadQrInThisSession` queda en false. La primera
    // caida entraba por la rama que no reintenta nada.
    expect(CODIGO).toContain("!this.hadQrInThisSession && !this.yaEstuvoConectado");
  });

  it("la condicion vieja, sola, ya no existe", () => {
    const sola = /else if\s*\(\s*!this\.hadQrInThisSession\s*\)/;
    expect(sola.test(CODIGO)).toBe(false);
  });
});

describe("la bandera de conexion", () => {
  it("se declara", () => {
    expect(CODIGO).toMatch(/yaEstuvoConectado\s*=\s*false/);
  });

  it("se enciende al conectar, no en otro lado", () => {
    // Tiene que estar dentro del manejador de connection === "open".
    const abre = CODIGO.indexOf('connection === "open"');
    expect(abre).toBeGreaterThan(-1);
    const bloque = CODIGO.slice(abre, abre + 900);
    expect(bloque).toContain("this.yaEstuvoConectado = true");
  });

  it("se apaga al detener el servicio", () => {
    // Si no se resetea, un `stop()` seguido de un arranque fallido creeria que
    // hubo conexion y reintentaria contra un servidor que no alcanza WhatsApp.
    //
    // Se busca junto a la bandera del QR, que se resetea en el mismo lugar,
    // sin exigir un espaciado exacto: la prueba no puede romperse porque
    // alguien reindente el archivo.
    const reset = CODIGO.match(
      /this\.hadQrInThisSession\s*=\s*false;\s*this\.yaEstuvoConectado\s*=\s*false;/,
    );
    expect(reset).not.toBeNull();
  });
});

describe("no se muere para siempre al agotar los intentos rapidos", () => {
  it("si estuvo conectado, sigue reintentando lento", () => {
    // Cinco intentos con espera creciente son ~90 segundos. Un corte mas largo
    // dejaba el numero mudo por horas hasta que alguien entrara al panel.
    expect(CODIGO).toContain("} else if (this.yaEstuvoConectado) {");
    expect(CODIGO).toMatch(/setTimeout\(\(\) => this\.start\(\), 5 \* 60 \* 1000\)/);
  });

  it("el reintento lento es LENTO: reconectar a lo bruto hace que bloqueen", () => {
    // El riesgo de baneo del numero es real y ya lo sufrio el negocio.
    const m = CODIGO.match(/setTimeout\(\(\) => this\.start\(\), (\d+) \* 60 \* 1000\)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(5);
  });

  it("sin haber conectado nunca, sigue pidiendo QR y no insiste", () => {
    // Ahi el problema es de red o de sesion cerrada: reintentar no arregla
    // nada y solo golpea a WhatsApp.
    expect(CODIGO).toContain("Máximo número de reconexiones alcanzado");
  });
});

describe("lo que no se toco", () => {
  it("una sesion cerrada por el usuario sigue pidiendo QR", () => {
    // `loggedOut` es la unica desconexion donde las credenciales ya no sirven.
    expect(CODIGO).toContain("Sesión cerrada (LoggedOut)");
  });

  it("los intentos rapidos siguen siendo 5 con espera creciente", () => {
    expect(CODIGO).toMatch(/MAX_RECONNECT_ATTEMPTS\s*=\s*5/);
    expect(CODIGO).toContain("Math.min(3000 * this.reconnectAttempts, 30000)");
  });
});
