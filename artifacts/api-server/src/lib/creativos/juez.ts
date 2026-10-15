/**
 * El juez visual de los creativos: el "director de arte" que mira la pieza
 * antes de que salga.
 *
 * Dos pasadas:
 *   1. Reglas MEDIBLES (sin IA, siempre): contraste del texto contra su
 *      fondo (WCAG), letra demasiado chica, texto que se sale o cae en la
 *      zona que tapa Meta, sin foto del producto. Ver `revisarEscena`.
 *   2. Mirada de un modelo de VISIÓN sobre el PNG real, con una rúbrica
 *      fija. Es opcional: si no hay modelo de visión con clave, se dice y se
 *      sigue con las reglas (no se inventa un puntaje).
 *
 * El puntaje final combina las dos: un error medible baja la nota aunque el
 * modelo diga que está lindo.
 */
import { revisarEscena, normalizarEscena, type Escena } from "../estudio/escena";
import { logger } from "../logger";

export interface Veredicto {
  /** 0–10. */
  puntaje: number;
  aprobado: boolean;
  problemas: string[];
  fortalezas: string[];
  /** De dónde salió: "reglas" o "reglas+vision (modelo)". */
  fuente: string;
}

const RUBRICA =
  "Sos director de arte de anuncios de Facebook e Instagram. Evaluá ESTA imagen de anuncio con ojo profesional y devolvé SOLO JSON: " +
  '{"puntaje":0-10,"problemas":["..."],"fortalezas":["..."]}. ' +
  "Criterios: 1) ¿el titular se lee en 1 segundo en un celular? 2) ¿el producto se ve claro y grande? 3) ¿hay jerarquía (una cosa manda)? " +
  "4) ¿los colores combinan y hay contraste suficiente? 5) ¿se ve profesional y no genérica o amateur? 6) ¿hay elementos superpuestos, cortados o desalineados? " +
  "Sé exigente: 8+ solo si la publicarías tal cual en una marca seria. Problemas concretos y cortos, en español.";

export async function juzgarConVision(png: Buffer, tenantId?: number | null): Promise<{ puntaje: number; problemas: string[]; fortalezas: string[]; modelo: string } | null> {
  const { candidatosDeVision, opcionesDeVision } = await import("../media-entrante");
  const { sanearParamsIA } = await import("@workspace/integrations-openai-ai-server");
  const candidatos = await candidatosDeVision(tenantId);
  const b64 = png.toString("base64");
  for (const { proveedor, modelo, cfg } of candidatos) {
    try {
      const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(sanearParamsIA(modelo, {
          model: modelo,
          max_tokens: 500,
          ...opcionesDeVision(proveedor),
          messages: [{ role: "user", content: [{ type: "text", text: RUBRICA }, { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } }] }],
        })),
        signal: AbortSignal.timeout(45_000),
      });
      if (!r.ok) continue;
      const j: any = await r.json();
      const texto = String(j?.choices?.[0]?.message?.content || "");
      const m = texto.match(/\{[\s\S]*\}/);
      if (!m) continue;
      const v = JSON.parse(m[0]);
      const puntaje = Number(v?.puntaje);
      if (!Number.isFinite(puntaje)) continue;
      return {
        puntaje: Math.max(0, Math.min(10, puntaje)),
        problemas: (Array.isArray(v.problemas) ? v.problemas : []).map(String).slice(0, 6),
        fortalezas: (Array.isArray(v.fortalezas) ? v.fortalezas : []).map(String).slice(0, 4),
        modelo: `${proveedor}/${modelo}`,
      };
    } catch (e: any) {
      logger.warn({ proveedor, modelo, err: e?.message }, "[Juez] el modelo de visión falló");
    }
  }
  return null;
}

/** Nota por reglas medibles (0–10). */
export function puntajePorReglas(escena: Escena | unknown): { puntaje: number; problemas: string[] } {
  const avisos = revisarEscena(normalizarEscena(escena));
  const errores = avisos.filter((a) => a.nivel === "error").length;
  const advertencias = avisos.filter((a) => a.nivel === "aviso").length;
  return { puntaje: Math.max(0, 10 - errores * 3 - advertencias * 1.2), problemas: avisos.filter((a) => a.nivel !== "idea").map((a) => a.texto) };
}

export async function juzgarCreativo(escena: Escena | unknown, opts: { tenantId?: number | null; png?: Buffer | null; conVision?: boolean; umbral?: number } = {}): Promise<Veredicto> {
  const reglas = puntajePorReglas(escena);
  const umbral = opts.umbral ?? 6.5;
  let vision: Awaited<ReturnType<typeof juzgarConVision>> = null;
  if (opts.conVision !== false) {
    let png = opts.png ?? null;
    if (!png) {
      try { const { escenaAPng } = await import("./render"); png = await escenaAPng(escena, { escala: 0.5 }); } catch { png = null; }
    }
    if (png) vision = await juzgarConVision(png, opts.tenantId).catch(() => null);
  }
  // Las reglas pesan como techo: un texto ilegible no se compensa con "linda foto".
  const puntaje = vision ? Math.min(reglas.puntaje + 1, vision.puntaje * 0.7 + reglas.puntaje * 0.3) : reglas.puntaje;
  return {
    puntaje: +puntaje.toFixed(1),
    aprobado: puntaje >= umbral,
    problemas: [...new Set([...reglas.problemas, ...(vision?.problemas || [])])],
    fortalezas: vision?.fortalezas || [],
    fuente: vision ? `reglas+vision (${vision.modelo})` : "reglas (no hay modelo de visión disponible)",
  };
}
