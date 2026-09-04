import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { META_API_VERSION, FB_GRAPH_BASE } from "../meta-api-version";

/**
 * Una sola versión de la Graph API, y que nadie la clave a mano.
 *
 * `https://graph.facebook.com/v21.0` estaba escrito en DOCE archivos. No es un
 * problema de estilo: convierte cada subida de versión en una cacería, y basta
 * que uno quede atrás para tener media integración hablando una versión y la
 * otra media hablando otra -- sin ningún error visible hasta que Meta apaga la
 * vieja.
 *
 * Es el mismo patrón que ya mordió a este proyecto dos veces en un día: un
 * criterio duplicado que se arregla en un lado y queda vivo en el otro. Por eso
 * la prueba mira los ARCHIVOS, no la constante: la constante siempre va a estar
 * bien; lo que hay que impedir es el copiar-pegar de al lado.
 */

const RAIZ = join(__dirname, "..", "..");

function archivosTs(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === "node_modules" || nombre === "__tests__" || nombre === "dist") continue;
    const p = join(dir, nombre);
    if (statSync(p).isDirectory()) archivosTs(p, acc);
    else if (p.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

describe("Una sola versión de la Graph API de Meta", () => {
  it("ningún archivo clava la versión a mano", () => {
    const culpables: string[] = [];
    for (const archivo of archivosTs(RAIZ)) {
      if (archivo.endsWith("meta-api-version.ts")) continue; // el único que puede
      const texto = readFileSync(archivo, "utf-8");
      // Solo las líneas de código: un comentario que MENCIONE una versión (para
      // explicar qué cambió en v22 o por qué no vamos a v26) es documentación
      // útil, no un literal que se vaya a quedar viejo.
      //
      // ⚠️ El descarte se hace por cómo EMPIEZA la línea, no borrando lo que
      // sigue a "//". Ese fue el primer intento y no servía para nada: la URL
      // contiene "//" en "https://", así que el filtro se comía la URL entera
      // tomándola por un comentario y la prueba no podía fallar nunca. Se
      // verificó metiendo una violación a propósito -- pasó en verde.
      for (const [i, linea] of texto.split("\n").entries()) {
        const t = linea.trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) continue;
        if (/graph(-video)?\.facebook\.com\/v\d+\.\d+/.test(linea)) {
          culpables.push(`${relative(RAIZ, archivo)}:${i + 1}`);
        }
      }
    }
    expect(culpables, `usá FB_GRAPH_BASE de lib/meta-api-version.ts en: ${culpables.join(", ")}`).toEqual([]);
  });

  it("la versión tiene forma de versión", () => {
    expect(META_API_VERSION).toMatch(/^v\d+\.\d+$/);
    expect(FB_GRAPH_BASE).toBe(`https://graph.facebook.com/${META_API_VERSION}`);
  });

  it("no se queda en una versión que Meta ya apagó", () => {
    // v21.0 se apaga el 21 de enero de 2027 y v20.0 el 24 de septiembre de
    // 2026 -- esta última, dentro de un mes. Quedarse abajo de v22 es elegir
    // una fecha de vencimiento cercana sin ganar nada: ningún cambio de v22 ni
    // de v23 rompe este código (auditado el 2026-08-29 contra el changelog).
    const mayor = Number(META_API_VERSION.slice(1).split(".")[0]);
    expect(mayor, `v${mayor} está por vencer o vencida`).toBeGreaterThanOrEqual(22);
  });
});
