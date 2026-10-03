/**
 * PASO 1 del plan de landings: qué se está usando HOY en el mercado.
 *
 * Lee la Biblioteca de Anuncios de Meta (anuncios pagados REALES de hoy) para
 * los tres mundos de TecnoVariedades, en español Y en inglés (Ali/Meta indexan
 * más fichas en inglés). El output es la materia prima para decidir la
 * estructura de la landing por tipo — no un copy final.
 *
 * La salida queda en `landings-mercado.json` (la leo y analizo después).
 */
import { writeFileSync } from "node:fs";
import { executeAction } from "../src/lib/app-operator";

const MUNDOS = [
  { mundo: "dropshipping_COD_fisico", base: "corrector de postura", en: "posture corrector" },
  { mundo: "digital_cursos", base: "curso online excel", en: "online excel course" },
  { mundo: "servicio_reparacion", base: "reparación de computadores", en: "computer repair service" },
];

const ctx = { tenantId: 1, sessionId: `landings-mercado-${Date.now()}` };
const out: any = { en: new Date().toISOString(), mundos: {} };

for (const m of MUNDOS) {
  out.mundos[m.mundo] = {};
  for (const [idioma, q] of [["es", m.base], ["en", m.en]] as const) {
    process.stdout.write(`[${m.mundo}/${idioma}] leyendo la Biblioteca… `);
    const r = await executeAction("fb_ad_library", { query: q, pais: "CO", limite: 6 }, ctx as any);
    if (r.ok) {
      const anuncios = ((r.data as any)?.anuncios ?? []).slice(0, 6);
      out.mundos[m.mundo][idioma] = { anuncios, url: (r.data as any)?.url };
      console.log(`${anuncios.length} anuncios`);
    } else {
      out.mundos[m.mundo][idioma] = { error: r.summary };
      console.log(`falló: ${String(r.summary).slice(0, 110)}`);
    }
  }
}

writeFileSync("landings-mercado.json", JSON.stringify(out, null, 2));
console.log("guardado: landings-mercado.json");
process.exit(0);