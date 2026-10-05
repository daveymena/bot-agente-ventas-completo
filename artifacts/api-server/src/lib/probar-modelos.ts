/**
 * Prueba de verdad qué modelos de un proveedor sirven para atender clientes.
 *
 * El catálogo que publica un proveedor NO dice cuáles funcionan. Medido a mano
 * con OpenCode Go: de los 26 que lista /models, solo 4 sirven. Los otros 22
 * fallan de tres formas distintas, y dos de ellas son peores que un error:
 *
 *   - 8 devuelven HTTP 200 con el contenido VACÍO. El bot se queda mudo y nada
 *     avisa que falló.
 *   - 3 mandan su razonamiento como respuesta ("El usuario me pide que actúe
 *     como vendedor...") e incluso inventan precios. Eso llegando a un cliente
 *     es peor que no responder.
 *   - el resto devuelve 400/403/503.
 *
 * Por eso la prueba mira el CONTENIDO, no el código HTTP: un 200 no significa
 * que sirva.
 */

import { getProviderConfig, sanearParamsIA } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

export interface ResultadoModelo {
  modelo: string;
  sirve: boolean;
  ms: number;
  motivo: string;
  /** Primeras palabras de lo que contestó, para que el admin lo juzgue. */
  muestra?: string;
}

/** Un mensaje real de cliente: es el trabajo que el modelo va a hacer. */
const PRUEBA = [
  { role: "system" as const, content: "Sos un vendedor por WhatsApp. Respondé en español, en menos de 40 palabras, sin inventar precios." },
  { role: "user" as const, content: "Hola, ¿cuánto vale el curso y qué incluye?" },
];

/** Señales de que el modelo está pensando en voz alta en vez de responder. */
const RAZONA_EN_VOZ_ALTA = /<think>|<\|channel\|>|^el usuario (me )?(pide|pregunta|est[áa])|^debo (ser|responder|actuar)/i;

async function listarModelos(baseUrl: string, apiKey: string): Promise<string[]> {
  try {
    const r = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return [];
    const j: any = await r.json();
    return (j?.data || []).map((m: any) => String(m?.id || "")).filter(Boolean);
  } catch {
    return [];
  }
}

async function probarUno(baseUrl: string, apiKey: string, modelo: string): Promise<ResultadoModelo> {
  const t0 = Date.now();
  try {
    const r = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(sanearParamsIA(modelo, { model: modelo, max_tokens: 120, messages: PRUEBA })),
      signal: AbortSignal.timeout(45_000),
    });
    const ms = Date.now() - t0;
    const j: any = await r.json().catch(() => ({}));
    const texto = String(j?.choices?.[0]?.message?.content || "").trim();

    if (!r.ok) {
      const msg = String(j?.error?.message || j?.message || `HTTP ${r.status}`).slice(0, 90);
      return { modelo, sirve: false, ms, motivo: msg };
    }
    if (!texto) {
      return { modelo, sirve: false, ms, motivo: "Contestó vacío (el bot se quedaría mudo)" };
    }
    if (RAZONA_EN_VOZ_ALTA.test(texto)) {
      return { modelo, sirve: false, ms, motivo: "Manda su razonamiento al cliente", muestra: texto.slice(0, 90) };
    }
    return { modelo, sirve: true, ms, motivo: "OK", muestra: texto.replace(/\s+/g, " ").slice(0, 90) };
  } catch (e: any) {
    return { modelo, sirve: false, ms: Date.now() - t0, motivo: String(e?.message || "no respondió").slice(0, 90) };
  }
}

/**
 * Prueba los modelos de un proveedor y devuelve cuáles sirven, ordenados por
 * velocidad. Los que fallan se devuelven también, con el motivo: saber POR QUÉ
 * no sirve un modelo vale tanto como saber cuál usar.
 */
export async function probarModelosDe(proveedor: string, limite = 30): Promise<{
  ok: boolean;
  proveedor: string;
  sirven: ResultadoModelo[];
  fallan: ResultadoModelo[];
  mensaje?: string;
}> {
  const cfg = getProviderConfig(proveedor);
  if (!cfg?.apiKey) {
    return { ok: false, proveedor, sirven: [], fallan: [], mensaje: `${proveedor} no tiene clave configurada.` };
  }

  const modelos = await listarModelos(cfg.baseUrl, cfg.apiKey);
  // Si el proveedor no expone /models, al menos se prueba el configurado: es
  // mejor confirmar uno que no probar ninguno.
  const aProbar = (modelos.length ? modelos : [cfg.model]).slice(0, limite);

  // De a 3 en paralelo: en serie tarda minutos con 26 modelos, y todos juntos
  // dispara los límites de tasa del proveedor y da falsos negativos.
  const resultados: ResultadoModelo[] = [];
  for (let i = 0; i < aProbar.length; i += 3) {
    const lote = aProbar.slice(i, i + 3);
    resultados.push(...await Promise.all(lote.map((m) => probarUno(cfg.baseUrl, cfg.apiKey, m))));
  }

  const sirven = resultados.filter((r) => r.sirve).sort((a, b) => a.ms - b.ms);
  const fallan = resultados.filter((r) => !r.sirve);
  logger.info({ proveedor, sirven: sirven.length, fallan: fallan.length }, "[ProbarModelos] Prueba terminada");
  return { ok: true, proveedor, sirven, fallan };
}
